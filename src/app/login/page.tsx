'use client';

// Force dynamic rendering to ensure SSR runs for subtitle data
export const dynamic = 'force-dynamic';

import Link from 'next/link'; // Import Link
import React, { useEffect, useState, useCallback, useMemo } from 'react'; // Import useMemo
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext'; // Use the refactored useAuth hook
import { signIn, getProviders } from 'next-auth/react'; // Import NextAuth functions
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InstradaOgmIcon } from '@/components/icons/InstradaOgmIcon';
import { Loader2, LogIn, Monitor, MonitorOff, AlertCircle, Check, ShieldAlert, Network as NetworkIconLucide, AlertTriangle } from 'lucide-react'; // Added Check, ShieldAlert, AlertTriangle, and NetworkIconLucide
import * as LucideIcons from 'lucide-react'; // Import all Lucide icons
import type { LucideIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { ClientOnly } from '@/components/util/ClientOnly';
import { logger } from '@/lib/logger';
import type { IconName, NetworkGroup } from '@/types/opnsense'; // Import IconName
// Removed unused CustomEmoji, CustomFlag, flagValues and generalEmojiValues imports
import { getAuthConfigAction } from '@/lib/server/auth-actions';
import { hasMultiGroupError, hasSingleSelectGroupError } from '@/utils/groupErrorDetection';
import { useUIConfig } from '@/context/UIConfigContext';
import { useSecureUI } from '@/context/SecureUIContext';

const iconMap: Record<IconName, LucideIcon> = {
  'ShieldCheck': ShieldAlert,
  'ShieldQuestion': ShieldAlert,
  'Network': NetworkIconLucide, // Use Lucide's Network icon
};

export default function LoginPage() {
  const { status: authStatus } = useAuth(); // Use the refactored useAuth hook
  const router = useRouter();
  const { toast } = useToast();

  // Get UI config for subtitle display
  const { uiConfig } = useUIConfig();
  const { subtitleEnabled, subtitleText, loginPageSubtitleEnabled } = uiConfig;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [providers, setProviders] = useState<Awaited<ReturnType<typeof getProviders>>>(null);
  const [isLocalLoginAllowed, setIsLocalLoginAllowed] = useState(true); // State for local login status
  const [showRegistrationLink, setShowRegistrationLink] = useState(true); // State to control registration link visibility
  const [showTwoFactorModal, setShowTwoFactorModal] = useState(false); // State for 2FA modal visibility
  const [twoFactorCode, setTwoFactorCode] = useState(''); // State for 2FA code input
  const [isVerifyingTwoFactor, setIsVerifyingTwoFactor] = useState(false); // State for 2FA verification loading
  const [isUsingBackupCode, setIsUsingBackupCode] = useState(false); // State for backup code mode

  const [detectedIp, setDetectedIp] = useState<string | null>(null);
  const [isIpDetecting, setIsIpDetecting] = useState(true);
  const [ipDetectionError, setIpDetectionError] = useState<string | null>(null);

  const [userIpMemberOfGroups, setUserIpMemberOfGroups] = useState<NetworkGroup[]>([]);
  const [isLoadingGroupsStatus, setIsLoadingGroupsStatus] = useState(false);

  const { selfServiceEnabled: isSelfServiceAllowed, groupTypesEnabled } = useSecureUI();

  // Removed unused currentYear state
  const [mounted, setMounted] = useState(false);

  // New state for host alias enabled status
  const [hostAliasEnabled, setHostAliasEnabled] = useState<string | null>(null);

  // Group types configuration now comes from SecureUI context

  // IP group membership function - used by IP detection
  const fetchIpMembership = useCallback(async (ip: string) => {
    if (!mounted) return;
    setIsLoadingGroupsStatus(true);
    try {
      // Fetch group membership status from the internal API route
      const response = await fetch(`/api/opnsense/ip-group-membership?ip=${ip}`);
      if (!response.ok) {
        const errorData = await response.json();

        // Handle IP validation errors gracefully (403 Forbidden for self-service)
        if (response.status === 403 && errorData.error &&
          (errorData.error.includes('allowed networks') ||
            errorData.error.includes('only operate on their own IP'))) {
          // IP access restriction - this is expected behavior, not an error
          logger.info('IP access restricted for self-service, clearing group membership');
          setUserIpMemberOfGroups([]); // Clear group membership
          return; // Don't throw error or show toast
        }

        throw new Error(errorData.error || `Failed to fetch IP group membership: ${response.statusText}`);
      }
      const memberOf: NetworkGroup[] = await response.json();

      setUserIpMemberOfGroups(memberOf);

    } catch (error) {
      logger.error("Failed to fetch group membership for IP:", error);
      const errorMessage = error instanceof Error ? error.message : "Could not load IP group membership.";
      toast({
        variant: "destructive",
        title: "Group Membership Error",
        description: errorMessage,
      });
      setUserIpMemberOfGroups([]); // Clear previous results on error
    } finally {
      setIsLoadingGroupsStatus(false);
    }
  }, [mounted, toast]); // Dependencies updated

  // IP detection function - called conditionally when self-service is enabled
  const fetchUserIp = useCallback(async () => {
    setIsIpDetecting(true);
    setIpDetectionError(null);
    setUserIpMemberOfGroups([]); // Reset on new detection attempt

    try {
      const response = await fetch('/api/ip');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to fetch IP: ${response.statusText}`);
      }
      const data = await response.json();
      setDetectedIp(data.ip);
      // setDetectedMac(data.mac || null); // MAC address not displayed on login page, no need to set
      fetchIpMembership(data.ip); // Fetch membership after real IP is detected

      // Fetch host alias information for the detected IP
      if (data.ip) {
        try {
          const aliasResponse = await fetch(`/api/opnsense/host-alias-management?ipAddress=${data.ip}`);
          if (aliasResponse.ok) {
            const aliasData = await aliasResponse.json();
            setHostAliasEnabled(aliasData.enabled || null);
          } else {
            logger.warn(`Failed to fetch host alias for IP ${data.ip}: ${aliasResponse.statusText}`);
            setHostAliasEnabled(null);
          }
        } catch (aliasError) {
          logger.error("Error fetching host alias:", aliasError);
          setHostAliasEnabled(null);
        }
      } else {
        setHostAliasEnabled(null);
      }
    } catch (e) {
      logger.error("Error fetching IP:", e);
      const errorMessage = e instanceof Error ? e.message : "Could not detect IP address.";
      setIpDetectionError(errorMessage);
      setDetectedIp(null);
      // setDetectedMac(null); // MAC address not displayed
      setUserIpMemberOfGroups([]); // Clear membership on IP detection error
      setHostAliasEnabled(null); // Clear host alias status on IP detection error
      toast({
        variant: "destructive",
        title: "IP Detection Error",
        description: errorMessage,
      });
    } finally {
      setIsIpDetecting(false);
    }
  }, [fetchIpMembership, toast]);

  useEffect(() => {
    setMounted(true);
    // Removed unused currentYear assignment

    // Use optimized context data - only attempt IP detection if self-service is enabled
    if (isSelfServiceAllowed) {
      fetchUserIp();
    } else {
      // Skip IP detection when self-service is disabled
      setIsIpDetecting(false);
      setDetectedIp(null);
      setUserIpMemberOfGroups([]);
      setHostAliasEnabled(null);
    }
  }, [fetchUserIp, isSelfServiceAllowed]);

  useEffect(() => {
    // Redirect if already authenticated
    if (authStatus === 'authenticated' && mounted) {
      router.push('/');
    }
  }, [authStatus, router, mounted]);


  // Fetch providers and auth config on mount
  useEffect(() => {
    const fetchAuthConfig = async () => {
      try {
        // Fetch minimal providers (secure endpoint) and auth config
        const [providersResponse, configData] = await Promise.all([
          fetch('/api/public/auth-providers'),
          getAuthConfigAction(),
        ]);

        // Process minimal providers response
        if (providersResponse.ok) {
          const minimalProviders = await providersResponse.json();
          // Convert minimal providers to format expected by existing code
          interface MinimalProvider {
            id: string;
            name: string;
            type: string;
            displayName: string;
            available: boolean;
          }
          const providersMap = minimalProviders.reduce((acc: Record<string, MinimalProvider>, provider: MinimalProvider) => {
            acc[provider.id] = provider;
            return acc;
          }, {} as Record<string, MinimalProvider>);
          setProviders(providersMap);
        } else {
          // Fallback to original method if minimal endpoint fails
          const providersRes = await getProviders();
          setProviders(providersRes);
        }

        setIsLocalLoginAllowed(configData.isLocalLoginAllowed);
        setShowRegistrationLink(configData.showRegistrationLink);

      } catch (error) {
        logger.error("Error fetching auth config:", error);
        // Default to true if fetch fails, or handle as needed
        setIsLocalLoginAllowed(true);
        setShowRegistrationLink(true);
      }
    };
    fetchAuthConfig();
  }, []);

  const handleCredentialsLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSigningIn(true);
    const result = await signIn('credentials', {
      redirect: false, // Prevent default redirect
      email: email,
      password: password,
    });

    if (result?.error) {
      setIsSigningIn(false);
      // Handle specific errors from the authorize callback
      logger.debug('Login error result:', { error: result.error, status: result.status, url: result.url });

      // Check if password change is required when login fails
      if (result.error === 'CredentialsSignin') {
        try {
          const checkResponse = await fetch('/api/auth/check-password-change', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });

          if (checkResponse.ok) {
            const data = await checkResponse.json();
            if (data.mustChangePassword) {
              // Cookie is set server-side by the check-password-change API
              logger.debug('[LOGIN] Password change required, redirecting to change password page');
              // Silently redirect to password change page without showing toast
              router.push('/auth/change-password-required');
              return;
            }
          }
        } catch (error) {
          logger.error('Error checking password change requirement:', error);
        }

        // If we reach here, it's a regular invalid credentials error
        // Fall through to show the error message below
      }

      let errorMessage = "Login failed. Please check your credentials.";
      let shouldShowErrorToast = true;

      if (result.error === 'CredentialsSignin') {
        errorMessage = "Invalid email or password.";
        // Show toast for invalid credentials
        shouldShowErrorToast = true;
      } else if (result.error === 'EMAIL_NOT_VERIFIED') {
        errorMessage = "Your email is not verified. Please check your inbox.";
      } else if (result.error === 'ACCOUNT_SUSPENDED') {
        errorMessage = "Your account has been suspended.";
      } else if (result.error === 'PASSWORD_CHANGE_REQUIRED') {
        // Redirect to dedicated password change page
        toast({
          variant: "destructive",
          title: "Password Change Required",
          description: "You must change your password before continuing.",
        });
        router.push('/auth/change-password-required');
        return;
      } else if (result.error === '2FA_REQUIRED') {
        // Do not show a toast here, just open the modal.
        // The toast will be shown if the 2FA verification itself fails or is cancelled.
        setShowTwoFactorModal(true); // Show the 2FA modal
        return; // Exit early, no toast needed for this specific error at this point
      } else if (result.error === 'INVALID_2FA_CODE') {
        errorMessage = "Invalid two-factor authentication code.";
      } else {
        // Log unknown errors for debugging
        logger.warn('Unknown login error:', result.error);
        console.error('Unknown login error:', result.error);
      }

      if (shouldShowErrorToast) {
        toast({
          variant: "destructive",
          title: "Login Error",
          description: errorMessage,
        });
      }
    } else {
      // Successful login, NextAuth handles session and potential redirect
      // The useEffect above will handle redirection to '/'
      setIsRedirecting(true);
    }
  };

  const handleTwoFactorVerification = async () => {
    setIsVerifyingTwoFactor(true);
    const result = await signIn('credentials', {
      redirect: false,
      email: email,
      password: password,
      totpCode: twoFactorCode,
      isBackupCode: isUsingBackupCode ? 'true' : 'false',
    });
    logger.debug("2FA signIn result:", result);

    if (result?.error) {
      setIsVerifyingTwoFactor(false);
      let errorMessage = "Two-factor authentication verification failed.";
      if (result.error === 'INVALID_2FA_CODE') {
        errorMessage = isUsingBackupCode
          ? "Invalid backup code. Please check the code and try again."
          : "Invalid two-factor authentication code.";
      } else {
        errorMessage = result.error; // Display other errors from NextAuth
      }

      toast({
        variant: "destructive",
        title: "2FA Verification Error",
        description: errorMessage,
      });
    } else {
      // Successful login, NextAuth handles session and potential redirect
      setShowTwoFactorModal(false);
      setTwoFactorCode('');
      setIsUsingBackupCode(false);
      // The useEffect for authStatus === 'authenticated' will handle redirection to '/'
      setIsRedirecting(true);
    }
  };

  // Removed unused allGeneralEmojiValues and allFlagValues

  // Determine if the host alias is disabled
  const isHostAliasDisabled = hostAliasEnabled !== undefined && hostAliasEnabled !== null && hostAliasEnabled !== '1';

  const getDisplayIcon = useCallback((group: NetworkGroup): React.ReactNode => {
    const iconIdentifier = group.iconIdentifier;

    if (iconIdentifier) {
      const normalizedIconIdentifier = iconIdentifier.normalize('NFC');

      // Try to render as a Lucide icon first
      const IconComponent = LucideIcons[normalizedIconIdentifier as keyof typeof LucideIcons] as LucideIcon;
      if (IconComponent) {
        return <IconComponent size={12} className="mr-1 text-green-700 dark:text-green-400" />;
      }

      // If not a Lucide icon, assume it's an emoji/symbol and render directly as text
      // This covers both standard emojis/flags and arbitrary Unicode symbols like "♵"
      return <span className="text-sm leading-none mr-1">{iconIdentifier}</span>;
    }

    // Fallback to group.icon if iconIdentifier is not present or doesn't map to a custom/Lucide icon
    if (group.icon) {
      const MappedIcon = iconMap[group.icon];
      if (MappedIcon) {
        const DefaultIconComponent = MappedIcon;
        return <DefaultIconComponent size={12} className="mr-1 text-green-700 dark:text-green-400" />;
      }
    }

    // Fallback to keyword checks on group.name
    if (group.name.toLowerCase().includes('high security')) return <ShieldAlert size={12} className="mr-1 text-green-700 dark:text-green-400" />;
    if (group.name.toLowerCase().includes('vpn')) return <ShieldAlert size={12} className="mr-1 text-green-700 dark:text-green-400" />;

    // Final fallback icon if no specific icon is found
    return <NetworkIconLucide size={12} className="mr-1 text-green-700 dark:text-green-400" />;
  }, []); // Dependencies removed as they are no longer directly used in the icon rendering logic

  const displayedUserIpMemberOfGroupsInfo = useMemo(() => {
    if (isLoadingGroupsStatus) return [];

    return userIpMemberOfGroups
      .map(group => {
        return {
          group: group, // Pass the entire group object
          name: group.friendlyName || group.name,
        };
      });
  }, [userIpMemberOfGroups, isLoadingGroupsStatus]);

  // Show loading state while authentication status is being determined
  if (!mounted || authStatus === 'loading') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <ClientOnly>
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </ClientOnly>
        <p className="mt-4 text-muted-foreground">Loading authentication status...</p>
      </div>
    );
  }

  // If authenticated, the useEffect above will handle redirection.
  // This part of the code should only be reached if authStatus is 'unauthenticated'.

  return (
    <div className="flex min-h-screen flex-col bg-background p-1 sm:p-2 lg:p-4">
      <div className="flex-grow flex items-center justify-center">
        <Card className="w-full max-w-xs sm:max-w-sm shadow-xl">
          <CardHeader className="text-center p-3 sm:p-4">
            <ClientOnly>
              <div className="mx-auto mb-1 sm:mb-2 flex justify-center">
                <InstradaOgmIcon width={72} height={72} src="/images/InstradaOGM-logo.svg" />
              </div>
            </ClientOnly>
            <div className="flex flex-col items-center justify-center">
              <CardTitle className="text-lg sm:text-xl">InstradaOGM</CardTitle>
              {/* Show subtitle when both main subtitle and login page subtitle are enabled */}
              {subtitleEnabled && loginPageSubtitleEnabled && subtitleText && (
                <p className="text-xs sm:text-sm text-muted-foreground leading-tight text-center mt-1">
                  {subtitleText}
                </p>
              )}
            </div>
            <CardDescription className="text-xs sm:text-sm">Log in to manage Network Group Membership.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-4">

            {/* Only show IP detection badge when self-service is enabled */}
            {isSelfServiceAllowed && (
              <Link href="/" passHref>
                <div className="p-1 sm:p-2 rounded-md cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 hover:bg-muted/50 transition-colors"> {/* Removed permanent border */}
                  {isIpDetecting ? (
                    <div className="flex items-center space-x-2 p-1 sm:p-2">
                      <ClientOnly>
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      </ClientOnly>
                      <span className="text-xs text-muted-foreground">Detecting IP address...</span>
                    </div>
                  ) : detectedIp ? (
                    isLoadingGroupsStatus ? (
                      <div className="flex items-center space-x-2 p-1 sm:p-2">
                        <ClientOnly>
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        </ClientOnly>
                        <span className="text-xs text-muted-foreground">Checking group membership...</span>
                      </div>
                    ) : displayedUserIpMemberOfGroupsInfo.length === 1 ? (
                      <Alert
                        variant="default"
                        className={`border-transparent shadow-none p-1 sm:p-2 ${isHostAliasDisabled
                          ? "bg-gray-100 dark:bg-gray-900/30 border-gray-500 dark:border-gray-700"
                          : "bg-green-100 dark:bg-green-900/30 border-green-500 dark:border-green-700"
                          }`}
                      >
                        <ClientOnly>
                          <Check className={`h-3 w-3 ${isHostAliasDisabled ? "text-gray-700 dark:text-gray-400" : "text-green-700 dark:text-green-400"}`} />
                        </ClientOnly>
                        <AlertTitle className={`text-sm ${isHostAliasDisabled ? "text-gray-800 dark:text-gray-300" : "text-green-800 dark:text-green-300"}`}>
                          IP Detected: <span className="font-mono">{detectedIp}</span>
                        </AlertTitle>
                        <AlertDescription className={`text-xs ${isHostAliasDisabled ? "text-gray-700 dark:text-gray-400" : "text-green-700 dark:text-green-400"}`}>
                          <>
                            Group Membership:
                            <span className="inline-flex items-center ml-1">
                              {getDisplayIcon(displayedUserIpMemberOfGroupsInfo[0].group)}
                              {displayedUserIpMemberOfGroupsInfo[0].name}
                            </span>
                            .
                            <br />
                            {isHostAliasDisabled ? "Host alias is disabled." : "Click Here for the Self-Service page."}
                          </>
                        </AlertDescription>
                      </Alert>
                    ) : displayedUserIpMemberOfGroupsInfo.length > 1 ? (
                      (() => {
                        // Determine the type of group error and appropriate styling
                        const groups = displayedUserIpMemberOfGroupsInfo.map(info => info.group);
                        const hasMultiGroupErr = hasMultiGroupError(groups, groupTypesEnabled);
                        const hasSingleSelectErr = hasSingleSelectGroupError(groups, groupTypesEnabled);

                        // Determine if this is a valid or invalid multiple group assignment
                        const isValidMultipleGroups = !hasMultiGroupErr && !hasSingleSelectErr;

                        // Choose appropriate styling and messaging
                        const isError = hasMultiGroupErr || hasSingleSelectErr;
                        const variant = isHostAliasDisabled ? "default" : (isError ? "default" : "default");
                        const bgColor = isHostAliasDisabled
                          ? "bg-gray-100 dark:bg-gray-900/30 border-gray-500 dark:border-gray-700"
                          : isError
                            ? "bg-orange-100 dark:bg-orange-900/30 border-orange-500 dark:border-orange-700"
                            : "bg-green-100 dark:bg-green-900/30 border-green-500 dark:border-green-700";

                        const iconColor = isHostAliasDisabled
                          ? "text-gray-700 dark:text-gray-400"
                          : isError
                            ? "text-orange-700 dark:text-orange-400"
                            : "text-green-700 dark:text-green-400";

                        const textColor = isHostAliasDisabled
                          ? "text-gray-800 dark:text-gray-300"
                          : isError
                            ? "text-orange-800 dark:text-orange-300"
                            : "text-green-800 dark:text-green-300";

                        const descColor = isHostAliasDisabled
                          ? "text-gray-700 dark:text-gray-400"
                          : isError
                            ? "text-orange-700 dark:text-orange-400"
                            : "text-green-700 dark:text-green-400";

                        // Choose appropriate icon
                        const IconComponent = isError ? AlertTriangle : Check;

                        // Generate appropriate message
                        let message = "";
                        if (isHostAliasDisabled) {
                          message = "Host alias is disabled. ";
                        } else if (hasMultiGroupErr) {
                          message = "System is not configured to allow multiple groups assignment to a single Host Alias / IP Address. ";
                        } else if (hasSingleSelectErr) {
                          message = "Multiple Single Select groups are assigned to this Host Alias / IP Address. ";
                        } else {
                          message = "Multiple groups assigned. ";
                        }

                        // Prepare groups display (limit to first 2 groups)
                        const groupsToShow = displayedUserIpMemberOfGroupsInfo.slice(0, 2);
                        const remainingCount = Math.max(0, displayedUserIpMemberOfGroupsInfo.length - 2);

                        return (
                          <Alert
                            variant={variant}
                            className={`border-transparent shadow-none p-1 sm:p-2 ${bgColor}`}
                          >
                            <ClientOnly>
                              <IconComponent className={`h-3 w-3 ${iconColor}`} />
                            </ClientOnly>
                            <AlertTitle className={`text-sm ${textColor}`}>
                              IP Detected: <span className="font-mono">{detectedIp}</span>
                            </AlertTitle>
                            <AlertDescription className={`text-xs ${descColor}`}>
                              {message}
                              {!isHostAliasDisabled && (
                                <>
                                  {hasMultiGroupErr ? (
                                    `${groups.length} groups are assigned:`
                                  ) : hasSingleSelectErr ? (
                                    "Groups assigned:"
                                  ) : (
                                    "Your IP is a member of multiple groups:"
                                  )}
                                  {groupsToShow.map((groupInfo, index) => (
                                    <React.Fragment key={groupInfo.name}>
                                      <span className="inline-flex items-center ml-1">
                                        {getDisplayIcon(groupInfo.group)}
                                        {groupInfo.name}
                                      </span>
                                      {index < groupsToShow.length - 1 && ', '}
                                    </React.Fragment>
                                  ))}
                                  {remainingCount > 0 && (
                                    <span className="ml-1">+ {remainingCount} more</span>
                                  )}
                                  .
                                  <br />
                                </>
                              )}
                              {isHostAliasDisabled
                                ? "Host alias cannot be managed."
                                : isValidMultipleGroups
                                  ? "Click Here for the Self-Service page."
                                  : "Please contact your administrator to resolve this configuration issue."
                              }
                            </AlertDescription>
                          </Alert>
                        );
                      })()
                    ) : ( // displayedUserIpMemberOfGroupsInfo.length === 0
                      isSelfServiceAllowed ? (
                        <Alert
                          variant="default"
                          className={`border-transparent shadow-none p-1 sm:p-2 ${isHostAliasDisabled
                            ? "bg-gray-100 dark:bg-gray-900/30 border-gray-500 dark:border-gray-700"
                            : ""
                            }`}
                        >
                          <ClientOnly>
                            <Monitor className={`h-3 w-3 ${isHostAliasDisabled ? "text-gray-700 dark:text-gray-400" : ""}`} />
                          </ClientOnly>
                          <AlertTitle className={`text-sm ${isHostAliasDisabled ? "text-gray-800 dark:text-gray-300" : ""}`}>
                            IP Detected: <span className="font-mono">{detectedIp}</span>
                          </AlertTitle>
                          <AlertDescription className={`text-xs ${isHostAliasDisabled ? "text-gray-700 dark:text-gray-400" : ""}`}>
                            <>
                              No Group Membership Assigned.
                              <br />
                              {isHostAliasDisabled ? "Host alias is disabled." : "Click Here for the Self-Service page."}
                            </>
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <Alert
                          variant={isHostAliasDisabled ? "default" : "destructive"}
                          className={`border-transparent shadow-none p-1 sm:p-2 ${isHostAliasDisabled
                            ? "bg-gray-100 dark:bg-gray-900/30 border-gray-500 dark:border-gray-700"
                            : ""
                            }`}
                        >
                          <ClientOnly>
                            <AlertCircle className={`h-3 w-3 ${isHostAliasDisabled ? "text-gray-700 dark:text-gray-400" : ""}`} />
                          </ClientOnly>
                          <AlertTitle className={`text-sm ${isHostAliasDisabled ? "text-gray-800 dark:text-gray-300" : ""}`}>
                            {isHostAliasDisabled ? "Host Alias Disabled" : "Self-Service Disabled"}
                          </AlertTitle>
                          <AlertDescription className={`text-xs ${isHostAliasDisabled ? "text-gray-700 dark:text-gray-400" : ""}`}>
                            {isHostAliasDisabled
                              ? `Host alias is disabled for your IP address (${detectedIp || 'Not Detected'}).`
                              : `Self-Service group assignment is disabled for your IP address (${detectedIp || 'Not Detected'}).`
                            }
                          </AlertDescription>
                        </Alert>
                      )
                    )
                  ) : ( // !detectedIp
                    <Alert variant="destructive" className="border-transparent shadow-none p-1 sm:p-2">
                      <ClientOnly>
                        <MonitorOff className="h-3 w-3" />
                      </ClientOnly>
                      <AlertTitle className="text-sm">IP Detection Failed</AlertTitle>
                      <AlertDescription className="text-xs">
                        {ipDetectionError || "Could not automatically detect your IP address."}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </Link>
            )}

            {/* Credentials Login Form */}
            {providers?.credentials && (
              <form onSubmit={handleCredentialsLogin} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="email" className="text-xs">Username or Email</Label>
                  <Input
                    id="email"
                    name="username"
                    type="text" // Allow username or email
                    autoComplete="username"
                    placeholder="Enter username or email" // Update placeholder
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="text-sm"
                  // required attribute removed to allow username
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="password" className="text-xs">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="text-sm"
                  />
                </div>
                <Button type="submit" className="w-full text-sm" disabled={isSigningIn || isRedirecting}>
                  {isRedirecting ? (
                    <ClientOnly fallback={null}>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Redirecting...
                    </ClientOnly>
                  ) : isSigningIn ? (
                    <ClientOnly fallback={null}>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sign In
                    </ClientOnly>
                  ) : (
                    <ClientOnly fallback={null}>
                      <LogIn className="mr-2 h-4 w-4" />
                      Sign In
                    </ClientOnly>
                  )}
                </Button>
              </form>
            )}

            {/* Two-Factor Authentication Modal */}
            <Dialog open={showTwoFactorModal} onOpenChange={setShowTwoFactorModal}>
              <DialogContent className="p-4 sm:p-6">
                <DialogHeader>
                  <DialogTitle className="text-base sm:text-lg">Two-Factor Authentication</DialogTitle>
                  <DialogDescription className="text-xs sm:text-sm">
                    {isUsingBackupCode
                      ? "Please enter one of your backup codes."
                      : "Please enter the 6-digit code from your authenticator app."
                    }
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="two-factor-code" className="text-xs">
                      {isUsingBackupCode ? "Backup Code" : "2FA Code"}
                    </Label>
                    <Input
                      id="two-factor-code"
                      type="text"
                      placeholder={isUsingBackupCode ? "Enter backup code" : "Enter 2FA code"}
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value)}
                      required
                      maxLength={isUsingBackupCode ? 16 : 6}
                      className="text-sm"
                    />
                  </div>
                  <div className="text-center">
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => {
                        setIsUsingBackupCode(!isUsingBackupCode);
                        setTwoFactorCode('');
                      }}
                      className="text-xs p-0 h-auto"
                    >
                      {isUsingBackupCode
                        ? "Use authenticator app instead"
                        : "Use backup code instead"
                      }
                    </Button>
                  </div>
                </div>
                <DialogFooter className="flex-col sm:flex-row sm:space-x-2 space-y-2 sm:space-y-0">
                  <DialogClose asChild>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowTwoFactorModal(false);
                        setIsUsingBackupCode(false);
                        setTwoFactorCode('');
                      }}
                      className="w-full sm:w-auto text-sm"
                    >
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button
                    type="button"
                    onClick={handleTwoFactorVerification}
                    disabled={isVerifyingTwoFactor || isRedirecting || twoFactorCode.length < (isUsingBackupCode ? 4 : 6)}
                    className="w-full sm:w-auto text-sm"
                  >
                    {isRedirecting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Redirecting...
                      </>
                    ) : isVerifyingTwoFactor ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {!isRedirecting && !isVerifyingTwoFactor && (isUsingBackupCode ? "Verify Backup Code" : "Verify Code")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* OIDC Login Buttons */}
            {providers && Object.values(providers).map(provider => {
              // Only render non-credentials providers (OAuth/OIDC)
              if (provider.id !== 'credentials') {
                return (
                  <Button key={provider.id} onClick={() => signIn(provider.id, { callbackUrl: `/sso-loading?provider=${provider.id}` })} className="w-full text-sm">
                    Sign in with {provider.name}
                  </Button>
                );
              }
              return null;
            })}

          </CardContent>
          <CardFooter className="mt-1 flex-col space-y-1 sm:space-y-2 p-3 sm:p-4">
            {/* Add links for registration, password reset etc. */}
            {(isLocalLoginAllowed && showRegistrationLink) && ( // Conditionally render based on both flags
              <div className="text-center text-xs">
                Don&apos;t have an account?{' '}
                {/* Link to registration page */}
                <Link href="/auth/register" className="underline">
                  Sign up
                </Link>
              </div>
            )}
            {isLocalLoginAllowed && (
              <div className="text-center text-xs">
                {/* Password reset functionality available at /auth/password-reset/request */}
                <Link href="/auth/password-reset/request" className="underline">
                  Forgot password?
                </Link>
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center w-full">
              InstradaOGM - Login
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
