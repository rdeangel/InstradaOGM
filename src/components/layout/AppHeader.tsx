
'use client';

import React, { useEffect, useState, forwardRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useIsMobile, useIsSmallScreen } from '@/hooks/use-mobile';
import { InstradaOgmIcon } from '@/components/icons/InstradaOgmIcon';
import { useAuth } from '@/context/AuthContext'; // Use the refactored useAuth hook
import { useUIConfig } from '@/context/UIConfigContext';
import { useSecureUI } from '@/context/SecureUIContext';
import { useSelfServiceValidation } from '@/hooks/use-self-service-validation';
import { Role } from '@/types/opnsense';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { logger } from '@/lib/logger';
import { formatVersionForDisplay } from '@/lib/version-utils';
import { UserCog, Users, LogOut, Shield, LogIn, Settings, UserCircle, ChevronDown, Laptop, BrickWallFire, Monitor, CalendarClock } from 'lucide-react'; // Added LayoutDashboard icon, ChevronDown, Laptop
import { GoDeviceDesktop } from 'react-icons/go'; // Added GoDeviceDesktop icon
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { signOut } from 'next-auth/react'; // Import signOut from next-auth/react
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClientOnly } from '@/components/util/ClientOnly';

interface AppHeaderProps {
  showScrollButton?: boolean;
  onScrollButtonClick?: () => void;
  layoutMode?: 'stacked' | 'side-by-side';
  setLayoutMode?: (mode: 'stacked' | 'side-by-side') => void;
}

export const AppHeaderClient = forwardRef<HTMLDivElement, AppHeaderProps>(({
  showScrollButton,
  onScrollButtonClick,
  layoutMode,
  setLayoutMode,
}, ref) => {
  const { data: session, status: authStatus } = useAuth(); // Use the refactored useAuth hook
  const { uiConfig } = useUIConfig(); // Use the global UI config context

  // Use the new self-service validation hook (only runs on self-service page for authenticated users)
  const { selfServiceEnabled: selfServiceValidated } = useSelfServiceValidation();

  // Extract values from UI config context
  const { subtitleEnabled, subtitleText } = uiConfig;
  const { macTrackingEnabled } = useSecureUI();

  // Use the validated self-service status from the hook instead of the basic UI config
  const selfServiceEnabled = selfServiceValidated;
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const isSmallScreen = useIsSmallScreen();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Check for updates (SUPER_ADMIN only) - uses cached status
  useEffect(() => {
    const checkUpdates = async () => {
      if (session?.user?.role === Role.SUPER_ADMIN) {
        try {
          // Use the status endpoint which returns cached results
          const response = await fetch('/api/updates/status');
          const data = await response.json();

          if (data.success && data.data) {
            setUpdateAvailable(data.data.updateAvailable);
            setLatestVersion(data.data.latestVersion);
            logger.debug('Header update status (cached):', data.data);
          }
        } catch (error) {
          logger.error('Failed to get update status in header:', error);
          // Silently fail - update check is not critical
        }
      }
    };

    if (mounted && session?.user?.role) {
      checkUpdates();
    }
  }, [mounted, session?.user?.role]);

  const isAdmin = session?.user?.role === Role.ADMIN || session?.user?.role === Role.SUPER_ADMIN;

  const renderUserControls = () => {
    if (!mounted || authStatus === 'loading') {
      return (
        <div className="flex items-center space-x-4">
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
      );
    }

    if (authStatus === 'authenticated') {
      return (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <ClientOnly><UserCircle className="h-6 w-6" /></ClientOnly>
                <span className="sr-only">Open user menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 relative"> {/* Added relative */}
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{session?.user?.name}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {session?.user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              {/* New Scroll Button inside dropdown */}
              {showScrollButton && onScrollButtonClick && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onScrollButtonClick}
                  className="absolute top-2 right-2 h-6 w-6 bg-muted" // Added bg-muted class
                >
                  <ClientOnly><ChevronDown className="h-4 w-4" /></ClientOnly> {/* Scroll icon */}
                </Button>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/account')}> {/* Placeholder for account page */}
                <ClientOnly><UserCog className="mr-2 h-4 w-4" /></ClientOnly>
                Account
              </DropdownMenuItem>
              {/* Added Dashboard link - only show if self-service is enabled */}
              {selfServiceEnabled && (
                <DropdownMenuItem onClick={() => router.push('/')}>
                  <ClientOnly><GoDeviceDesktop size={16} className="mr-2" /></ClientOnly>
                  Self-Service
                </DropdownMenuItem>
              )}
              {/* Added Device Management link */}
              <DropdownMenuItem onClick={() => router.push('/devices')}>
                <ClientOnly><Laptop className="mr-2 h-4 w-4" /></ClientOnly>
                Device Management
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem onClick={() => router.push('/admin/user-management')}>
                  <ClientOnly><Users className="mr-2 h-4 w-4" /></ClientOnly>
                  User Management
                </DropdownMenuItem>
              )}
              {isAdmin && (
                <DropdownMenuItem onClick={() => router.push('/admin/monitoring-analytics')}>
                  <ClientOnly><Shield className="mr-2 h-4 w-4" /></ClientOnly>
                  Monitoring & Analytics
                </DropdownMenuItem>
              )}
              {isAdmin && (
                <DropdownMenuItem onClick={() => router.push('/admin/schedules')}>
                  <ClientOnly><CalendarClock className="mr-2 h-4 w-4" /></ClientOnly>
                  Scheduled Assignments
                </DropdownMenuItem>
              )}
              {isAdmin && macTrackingEnabled && (
                <DropdownMenuItem onClick={() => router.push('/admin/mac-tracking')}>
                  <ClientOnly><Monitor className="mr-2 h-4 w-4" /></ClientOnly>
                  MAC Tracking
                </DropdownMenuItem>
              )}
              {isAdmin && (
                <DropdownMenuItem onClick={() => router.push('/admin')}>
                  <ClientOnly><BrickWallFire className="mr-2 h-4 w-4" /></ClientOnly>
                  Admin Panel
                </DropdownMenuItem>
              )}

              {session?.user?.role === Role.SUPER_ADMIN && (
                <DropdownMenuItem onClick={() => router.push('/settings')}>
                  <ClientOnly><Settings className="mr-2 h-4 w-4" /></ClientOnly>
                  Settings
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/login' })}> {/* Use NextAuth signOut with redirect */}
                <ClientOnly><LogOut className="mr-2 h-4 w-4" /></ClientOnly>
                Sign Out
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {updateAvailable && latestVersion ? (
                <DropdownMenuItem
                  className="text-xs cursor-pointer py-3 px-3"
                  onClick={() => {
                    // Use URL query parameter to switch tab
                    router.push('/settings?tab=updates');
                  }}
                >
                  <div className="flex flex-col gap-2 w-full">
                    <div className="flex items-center justify-between w-full">
                      <span className="text-muted-foreground">Current Version:</span>
                      <span className="font-medium text-foreground">
                        {formatVersionForDisplay(process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between w-full">
                      <span className="text-blue-600 dark:text-blue-400 font-medium">
                        Update Available:
                      </span>
                      <div className="flex items-center">
                        <span className="relative flex h-2 w-2 mr-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                        </span>
                        <span className="font-semibold text-blue-600 dark:text-blue-400">
                          {formatVersionForDisplay(latestVersion)}
                        </span>
                      </div>
                    </div>
                  </div>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="text-xs text-muted-foreground py-2" disabled>
                  <div className="flex items-center justify-between w-full">
                    <span>Version:</span>
                    <span className="font-medium ml-2">
                      {formatVersionForDisplay(process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0')}
                    </span>
                  </div>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      );
    } else {
      return (
        <Link href="/login" passHref>
          <Button variant="outline" size={isMobile ? "icon" : "default"}>
            <ClientOnly><LogIn className={isMobile ? "h-4 w-4" : "mr-2 h-4 w-4"} /></ClientOnly>
            {!isMobile && "Log In"}
          </Button>
        </Link>
      );
    }
  };

  const renderLayoutToggleButton = () => {
    if ((pathname === '/devices' || pathname === '/') && setLayoutMode && !isSmallScreen) { // Show on /devices and / pages if setter is provided and screen is not small
      const isStacked = layoutMode === 'stacked';
      return (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLayoutMode(isStacked ? 'side-by-side' : 'stacked')}
          aria-label={isStacked ? 'Switch to Side-by-Side Layout' : 'Switch to Stacked Layout'}
        >
          <ClientOnly>
            {isStacked ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-layout-list"><rect width="7" height="6" x="3" y="14" rx="2" /><rect width="7" height="6" x="3" y="4" rx="2" /><path d="M14 4h7" /><path d="M14 8h7" /><path d="M14 14h7" /><path d="M14 18h7" /></svg> // Icon for side-by-side
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-layout-grid"><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></svg> // Icon for stacked
            )}
          </ClientOnly>
        </Button>
      );
    }
    return null;
  };

  return (
    <header ref={ref} className="bg-card border-b border-border shadow-sm sticky top-0 z-40">
      <div className="h-12 sm:h-14 flex items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-2">
          <ClientOnly>
            <ThemeToggle />
          </ClientOnly>
        </div>

        {/* Center Item: Title and Logo */}
        {/* Added absolute positioning and transform to ensure true centering */}
        <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center">
          <Link href={pathname} key={pathname} className="flex items-center">
            <ClientOnly>
              <InstradaOgmIcon className={isMobile ? "mr-1" : "mr-2"} width={isMobile ? 38 : 42} height={isMobile ? 40 : 44} src="/images/InstradaOGM-logo.svg" />
            </ClientOnly>
            <div className="flex flex-col items-center justify-center">
              <h1 className="text-lg sm:text-xl font-semibold text-foreground leading-tight text-center">
                InstradaOGM
              </h1>
              {/* Show subtitle when enabled and text is available - dynamic centering */}
              {subtitleEnabled && subtitleText && (
                <p className="text-xs sm:text-sm text-muted-foreground leading-tight text-center mt-0">
                  {subtitleText}
                </p>
              )}
            </div>
          </Link>
        </div>

        {/* Right Items: User Controls */}
        <div className="flex items-center space-x-2">
          {renderLayoutToggleButton()}
          {renderUserControls()}
        </div>
      </div>
    </header>
  );
});

AppHeaderClient.displayName = 'AppHeaderClient';

// Backward compatibility export
export const AppHeader = AppHeaderClient;
