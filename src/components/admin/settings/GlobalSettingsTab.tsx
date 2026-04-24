'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { ClientOnly } from '@/components/util/ClientOnly';
import { Globe, AlertTriangle, RefreshCw, Info, Loader2, Trash2, Layers, Type, UserPlus, Ban, Edit3, BarChart3, Laptop, Waypoints } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LucideIconPicker } from '@/components/ui/lucide-icon-picker';
import { logger } from '@/lib/logger';
import { useGroupTypeValidation } from '@/hooks/useGroupTypeValidation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { RefreshRequiredDialog } from '@/components/RefreshRequiredDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { ScrollArea } from '@/components/ui/scroll-area';

import { GlobalSettings } from '@/types/settings';
import { globalSettingsEvents } from '@/lib/events/globalSettingsEvents';

interface GlobalSettingsTabProps {
  enableRegistration: boolean;
  setEnableRegistration: (checked: boolean) => void;
  removeSelfServicePage: boolean;
  setRemoveSelfServicePage: (checked: boolean) => void;
  enableRenamingSelfServicePage: boolean;
  setEnableRenamingSelfServicePage: (checked: boolean) => void;
  enableRenamingDeviceManagementPage: boolean;
  setEnableRenamingDeviceManagementPage: (checked: boolean) => void;
  // Group Type Settings
  enableGroupTypes: boolean;
  setEnableGroupTypes: (checked: boolean) => void;
  enableSelfServiceMultiSelect: boolean;
  setEnableSelfServiceMultiSelect: (checked: boolean) => void;
  singleSelectName: string;
  setSingleSelectName: (name: string) => void;
  multiSelectName: string;
  setMultiSelectName: (name: string) => void;
  singleSelectIcon: string;
  setSingleSelectIcon: (icon: string) => void;
  multiSelectIcon: string;
  setMultiSelectIcon: (icon: string) => void;
  enableAdvancedAnalytics: boolean;
  setEnableAdvancedAnalytics: (checked: boolean) => void;
  // Logs and Analytics Retention Settings
  logsAnalyticsRetentionDays: number;
  setLogsAnalyticsRetentionDays: (days: number) => void;
  // MAC Tracking Settings
  enableMacTracking: boolean;
  setEnableMacTracking: (checked: boolean) => void;
  macTrackingInterval: number;
  setMacTrackingInterval: (interval: number) => void;
  macInactiveTimeout: number;
  setMacInactiveTimeout: (timeout: number) => void;
  macDataRetentionDays: number;
  setMacDataRetentionDays: (days: number) => void;
  // Application Subtitle Settings
  enableApplicationSubtitle: boolean;
  setEnableApplicationSubtitle: (checked: boolean) => void;
  subtitleText: string;
  setSubtitleText: (text: string) => void;
  enableLoginPageSubtitle: boolean;
  setEnableLoginPageSubtitle: (checked: boolean) => void;
  customLucideIcons?: { name: string; icon: React.ComponentType<{ size?: number }> }[]; // Custom Lucide icons from global settings
  manageNetworkAliasesEnabled: boolean;
  setManageNetworkAliasesEnabled: (checked: boolean) => void;
}

export function GlobalSettingsTab({
  enableRegistration,
  setEnableRegistration,
  removeSelfServicePage,
  setRemoveSelfServicePage,
  enableRenamingSelfServicePage,
  setEnableRenamingSelfServicePage,
  enableRenamingDeviceManagementPage,
  setEnableRenamingDeviceManagementPage,
  enableGroupTypes,
  setEnableGroupTypes,
  enableSelfServiceMultiSelect,
  setEnableSelfServiceMultiSelect,
  singleSelectName,
  setSingleSelectName,
  multiSelectName,
  setMultiSelectName,
  singleSelectIcon,
  setSingleSelectIcon,
  multiSelectIcon,
  setMultiSelectIcon,
  enableAdvancedAnalytics,
  setEnableAdvancedAnalytics,
  // Logs and Analytics Retention Settings
  logsAnalyticsRetentionDays,
  setLogsAnalyticsRetentionDays,
  // MAC Tracking Settings
  enableMacTracking,
  setEnableMacTracking,
  macTrackingInterval,
  setMacTrackingInterval,
  macInactiveTimeout,
  setMacInactiveTimeout,
  macDataRetentionDays,
  setMacDataRetentionDays,
  // Application Subtitle Settings
  enableApplicationSubtitle,
  setEnableApplicationSubtitle,
  subtitleText,
  setSubtitleText,
  enableLoginPageSubtitle,
  setEnableLoginPageSubtitle,
  customLucideIcons = [],
  manageNetworkAliasesEnabled,
  setManageNetworkAliasesEnabled,
}: GlobalSettingsTabProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [databaseType, setDatabaseType] = useState<string>('Unknown');
  const [showRefreshDialog, setShowRefreshDialog] = useState(false);
  const [showGroupTypesRefreshDialog, setShowGroupTypesRefreshDialog] = useState(false);
  const [showMultiSelectRefreshDialog, setShowMultiSelectRefreshDialog] = useState(false);
  const [showMacTrackingRefreshDialog, setShowMacTrackingRefreshDialog] = useState(false);
  const [showClearMacDbDialog, setShowClearMacDbDialog] = useState(false);
  const [showDisableNetworkAliasesDialog, setShowDisableNetworkAliasesDialog] = useState(false);
  const {
    canDisableGroupTypes,
    violations,
    violationCount,
    isValidating,
    validateGroupTypes,
    apiAvailable
  } = useGroupTypeValidation();

  // Fetch database type on component mount
  useEffect(() => {
    const fetchDatabaseType = async () => {
      try {
        const response = await fetch('/api/admin/db-info');
        if (response.ok) {
          const data = await response.json();
          setDatabaseType(data.databaseType || 'Unknown');
        }
      } catch (error) {
        logger.error('Failed to fetch database type:', error);
        setDatabaseType('Unknown');
      }
    };

    fetchDatabaseType();
  }, []);

  // Extract custom Lucide icon names for the icon picker
  const customLucideIconNames = customLucideIcons.map(icon => icon.name);

  const handleSaveSetting = async (
    settingName: keyof GlobalSettings,
    checked: boolean,
    setter: (checked: boolean) => void,
    successMessage: string,
    errorMessage: string
  ) => {
    try {
      const response = await fetch('/api/settings/global', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [settingName]: checked }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorMessage);
      }
      toast({
        title: "Setting Saved",
        description: successMessage,
        variant: "success",
      });

      // Notify other tabs/pages about setting changes
      if (settingName === 'enableGroupTypes' || settingName === 'enableSelfServiceMultiSelect') {
        localStorage.setItem('groupTypeSettingsChanged', Date.now().toString());
        // Dispatch custom event for same-tab communication
        window.dispatchEvent(new CustomEvent('groupTypeSettingsChanged'));
      }

      // Notify other components about advanced analytics setting changes
      if (settingName === 'enableAdvancedAnalytics') {
        localStorage.setItem('advancedAnalyticsSettingsChanged', Date.now().toString());
        // Dispatch custom event for same-tab communication
        window.dispatchEvent(new CustomEvent('advancedAnalyticsSettingsChanged'));
      }
    } catch (error) {
      logger.error(`Failed to save ${settingName} setting to API`, error);
      const msg = error instanceof Error ? error.message : "Could not save setting.";
      toast({
        title: "Error Saving Setting",
        description: msg,
        variant: "destructive",
      });
      // Revert the toggle state on error
      setter(!checked);
    }
  };

  const handleSaveTextSetting = async (
    settingName: keyof GlobalSettings,
    value: string,
    setter: (value: string) => void,
    successMessage: string,
    errorMessage: string
  ) => {
    try {
      const response = await fetch('/api/settings/global', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [settingName]: value }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorMessage);
      }
      toast({
        title: "Setting Saved",
        description: successMessage,
        variant: "success",
      });

      // Notify other tabs/pages about group type setting changes
      if (settingName === 'singleSelectName' || settingName === 'multiSelectName' || settingName === 'singleSelectIcon' || settingName === 'multiSelectIcon') {
        localStorage.setItem('groupTypeSettingsChanged', Date.now().toString());
        // Dispatch custom event for same-tab communication
        window.dispatchEvent(new CustomEvent('groupTypeSettingsChanged'));
      }
    } catch (error) {
      logger.error(`Failed to save ${settingName} setting to API`, error);
      const msg = error instanceof Error ? error.message : "Could not save setting.";
      toast({
        title: "Error Saving Setting",
        description: msg,
        variant: "destructive",
      });
    }
  };

  const handleClearMacDatabase = async () => {
    try {
      const response = await fetch('/api/admin/mac-tracking/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: "Database Cleared",
          description: data.message,
          variant: "success",
        });
      } else {
        toast({
          title: "Error",
          description: data.message || 'Failed to clear MAC address database',
          variant: "destructive",
        });
      }
    } catch (error) {
      logger.error('Failed to reset MAC address database:', error);
      toast({
        title: "Error",
        description: 'Failed to clear MAC address database',
        variant: "destructive",
      });
    } finally {
      setShowClearMacDbDialog(false);
    }
  };

  return (
    <>
      <Card className="flex flex-col flex-1 mb-0 min-h-0">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0 pb-4">
          <div>
            <CardTitle className={`flex items-center ${isMobile ? 'text-xl' : 'text-2xl'}`}>
              <ClientOnly><Globe size={isMobile ? 22 : 28} className="mr-2 text-primary" /></ClientOnly> Global Settings
            </CardTitle>
            <CardDescription className="hidden md:block">
              Configure global settings for the application.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-6 relative flex-1 overflow-hidden flex flex-col">
          <ScrollArea className="flex-1 min-h-0 w-full">
            <div className="space-y-6">
              {/* Application Subtitle Section */}
              <div className="border rounded-lg p-4 space-y-4">
                <div>
                  <h3 className={`font-semibold flex items-center ${isMobile ? 'text-lg' : 'text-xl'}`}>
                    <ClientOnly><Type size={20} className="mr-2 text-primary" /></ClientOnly> Application Subtitle
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Add a custom subtitle below the main application title to identify specific instances or environments.
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="enable-application-subtitle">Enable Application Subtitle</Label>
                  <ClientOnly>
                    <Switch
                      id="enable-application-subtitle"
                      checked={enableApplicationSubtitle}
                      onCheckedChange={async (checked) => {
                        setEnableApplicationSubtitle(checked);
                        try {
                          await handleSaveSetting(
                            'enableApplicationSubtitle',
                            checked,
                            setEnableApplicationSubtitle,
                            checked ? 'Application subtitle enabled successfully.' : 'Application subtitle disabled successfully.',
                            'Failed to update application subtitle setting.'
                          );
                          // Emit event to refresh header subtitle display AFTER successful save
                          globalSettingsEvents.emit();
                        } catch {
                          // If save failed, revert the local state
                          setEnableApplicationSubtitle(!checked);
                        }
                      }}
                    />
                  </ClientOnly>
                </div>
                {enableApplicationSubtitle && (
                  <div className="space-y-2">
                    <Label htmlFor="subtitle-text">Application Subtitle</Label>
                    <Input
                      id="subtitle-text"
                      type="text"
                      placeholder="Enter custom subtitle text..."
                      value={subtitleText}
                      onChange={(e) => setSubtitleText(e.target.value)}
                      maxLength={22}
                      onBlur={async () => {
                        try {
                          const response = await fetch('/api/settings/global', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ subtitleText })
                          });
                          if (response.ok) {
                            toast({
                              title: "Setting Saved",
                              description: "Application subtitle text updated successfully.",
                              variant: "success",
                            });
                            // Emit event to refresh header subtitle display AFTER successful save
                            globalSettingsEvents.emit();
                          } else {
                            toast({
                              title: "Error",
                              description: "Failed to save subtitle text.",
                              variant: "destructive",
                            });
                          }
                        } catch {
                          toast({
                            title: "Error",
                            description: "Failed to save subtitle text.",
                            variant: "destructive",
                          });
                        }
                      }}
                      className="max-w-md text-xxs"
                    />
                    <p className="text-xxs text-muted-foreground">
                      The subtitle will appear under the main title &ldquo;InstradaOGM&rdquo; when enabled and text is provided. &nbsp;
                      Maximum length of 22 characters.
                    </p>

                    {/* Login Page Subtitle Toggle - only show when main subtitle is enabled */}
                    <div className="flex items-center justify-between pt-2">
                      <div className="space-y-1">
                        <Label htmlFor="enable-login-page-subtitle">Show subtitle on login page</Label>
                        <p className="text-xxs text-muted-foreground">
                          When enabled, the same subtitle text will also appear on the login page.
                        </p>
                      </div>
                      <ClientOnly>
                        <Switch
                          id="enable-login-page-subtitle"
                          checked={enableLoginPageSubtitle}
                          onCheckedChange={async (checked) => {
                            setEnableLoginPageSubtitle(checked);
                            try {
                              await handleSaveSetting(
                                'enableLoginPageSubtitle',
                                checked,
                                setEnableLoginPageSubtitle,
                                checked ? 'Login page subtitle enabled successfully.' : 'Login page subtitle disabled successfully.',
                                'Failed to update login page subtitle setting.'
                              );
                              // Emit event to refresh subtitle display
                              globalSettingsEvents.emit();
                            } catch {
                              // If save failed, revert the local state
                              setEnableLoginPageSubtitle(!checked);
                            }
                          }}
                        />
                      </ClientOnly>
                    </div>
                  </div>
                )}
              </div>

              {/* Local User Registration Section */}
              <div className="border rounded-lg p-4 space-y-4">
                <div>
                  <h3 className={`font-semibold flex items-center ${isMobile ? 'text-lg' : 'text-xl'}`}>
                    <ClientOnly><UserPlus size={20} className="mr-2 text-primary" /></ClientOnly> Local User Registration
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Enable or disable new local user registrations. Email verification is required when enabled.
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="enable-registration">Enable Registration</Label>
                  <ClientOnly>
                    <Switch
                      id="enable-registration"
                      checked={enableRegistration}
                      onCheckedChange={(checked) => {
                        setEnableRegistration(checked);
                        handleSaveSetting(
                          'enableRegistration',
                          checked,
                          setEnableRegistration,
                          `Registration ${checked ? "Enabled" : "Disabled"}.`,
                          'Failed to save registration setting to API'
                        );
                      }}
                    />
                  </ClientOnly>
                </div>
              </div>

              {/* Remove Self-Service Page Section */}
              <div className="border rounded-lg p-4 space-y-4">
                <div>
                  <h3 className={`font-semibold flex items-center ${isMobile ? 'text-lg' : 'text-xl'}`}>
                    <ClientOnly><Ban size={20} className="mr-2 text-primary" /></ClientOnly> Remove Self-Service Page
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Completely disable self-service functionality for enhanced security. When enabled, users will be redirected to device management after login.
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="remove-self-service-page">Remove Self-Service Page</Label>
                  <ClientOnly>
                    <Switch
                      id="remove-self-service-page"
                      checked={removeSelfServicePage}
                      onCheckedChange={async (checked) => {
                        // Update the local state immediately for UI feedback
                        setRemoveSelfServicePage(checked);

                        // Save the setting to the API
                        try {
                          await handleSaveSetting(
                            'removeSelfServicePage',
                            checked,
                            setRemoveSelfServicePage,
                            `Self-Service Page ${checked ? "Disabled" : "Enabled"}.`,
                            'Failed to save self-service page setting to API'
                          );

                          // Show refresh dialog after successful save
                          setShowRefreshDialog(true);
                        } catch (error) {
                          // If save failed, revert the local state
                          setRemoveSelfServicePage(!checked);
                          logger.error('Failed to save removeSelfServicePage setting:', error);
                        }
                      }}
                    />
                  </ClientOnly>
                </div>
              </div>

              {/* Renaming of Host Aliases Section */}
              <div className="border rounded-lg p-4 space-y-4">
                <div>
                  <h3 className={`font-semibold flex items-center ${isMobile ? 'text-lg' : 'text-xl'}`}>
                    <ClientOnly><Edit3 size={20} className="mr-2 text-primary" /></ClientOnly> Renaming of Host Aliases and DHCP Reservations
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Enable or disable host alias renaming (Optional DHCP Reservation) functionality in different part of the application
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="enable-renaming-self-service"
                    className={removeSelfServicePage ? "text-muted-foreground" : ""}
                  >
                    Rename in Self-Service (Only if user is Logged In)
                    {removeSelfServicePage && (
                      <span className="text-xs block text-muted-foreground mt-1">
                        Disabled because self-service page is removed
                      </span>
                    )}
                  </Label>
                  <ClientOnly>
                    <Switch
                      id="enable-renaming-self-service"
                      checked={enableRenamingSelfServicePage}
                      disabled={removeSelfServicePage}
                      onCheckedChange={(checked) => {
                        if (!removeSelfServicePage) {
                          setEnableRenamingSelfServicePage(checked);
                          handleSaveSetting(
                            'enableRenamingSelfServicePage',
                            checked,
                            setEnableRenamingSelfServicePage,
                            `Host alias renaming for Self-Service page ${checked ? "Enabled" : "Disabled"}.`,
                            'Failed to save self-service renaming setting to API'
                          );
                        }
                      }}
                    />
                  </ClientOnly>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="enable-renaming-device-management">Rename in Device Management</Label>
                  <ClientOnly>
                    <Switch
                      id="enable-renaming-device-management"
                      checked={enableRenamingDeviceManagementPage}
                      onCheckedChange={(checked) => {
                        setEnableRenamingDeviceManagementPage(checked);
                        handleSaveSetting(
                          'enableRenamingDeviceManagementPage',
                          checked,
                          setEnableRenamingDeviceManagementPage,
                          `Host alias renaming for Device Management page ${checked ? "Enabled" : "Disabled"}.`,
                          'Failed to save device management renaming setting to API'
                        );
                      }}
                    />
                  </ClientOnly>
                </div>
              </div>

              {/* Group Type Settings Section */}
              <div className="border rounded-lg p-4 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold flex items-center">
                    <ClientOnly><Layers size={20} className="mr-2 text-primary" /></ClientOnly> Group Type Settings
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Configure group type functionality and custom names.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label htmlFor="enable-group-types">Enable Group Types</Label>
                      {enableGroupTypes && !canDisableGroupTypes && (
                        <p className="text-xs text-muted-foreground">
                          Cannot disable while host aliases are assigned to multiple groups
                        </p>
                      )}
                      {!apiAvailable && (
                        <p className="text-xs text-amber-600">
                          Validation API unavailable - manual verification recommended
                        </p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <ClientOnly>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={validateGroupTypes}
                          disabled={isValidating}
                          className="h-8 w-8 p-0"
                        >
                          {isValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        </Button>
                      </ClientOnly>
                      <ClientOnly>
                        <Switch
                          id="enable-group-types"
                          checked={enableGroupTypes}
                          disabled={enableGroupTypes && !canDisableGroupTypes}
                          onCheckedChange={async (checked) => {
                            if (!checked && !canDisableGroupTypes) {
                              // Try to validate again in case data has changed
                              const freshResult = await validateGroupTypes();
                              if (!freshResult.canDisableGroupTypes) {
                                toast({
                                  title: "Cannot Disable Group Types",
                                  description: `${freshResult.violationCount} host aliases are assigned to multiple groups. Remove these assignments first.`,
                                  variant: "destructive",
                                });
                                return;
                              }
                            }

                            // Update the local state immediately for UI feedback
                            setEnableGroupTypes(checked);

                            // Save the setting to the API
                            try {
                              await handleSaveSetting(
                                'enableGroupTypes',
                                checked,
                                setEnableGroupTypes,
                                `Group Types ${checked ? "Enabled" : "Disabled"}. ${checked ? "Users can now assign hosts to multiple groups." : "Reverted to simple single-select behavior."}`,
                                'Failed to save group types setting to API'
                              );

                              // Show refresh dialog after successful save
                              setShowGroupTypesRefreshDialog(true);
                            } catch (error) {
                              // If save failed, revert the local state
                              setEnableGroupTypes(!checked);
                              logger.error('Failed to save enableGroupTypes setting:', error);
                            }
                          }}
                        />
                      </ClientOnly>
                    </div>
                  </div>

                  {enableGroupTypes && !canDisableGroupTypes && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>{violationCount} host aliases</strong> are assigned to multiple groups.
                        Group Types cannot be disabled until these assignments are resolved.
                        {violations.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-sm font-medium">
                              View violations ({Math.min(violations.length, 5)} of {violationCount})
                            </summary>
                            <div className="mt-2 space-y-1 text-xs">
                              {violations.slice(0, 5).map((violation, index) => (
                                <div key={index} className="font-mono">
                                  <strong>{violation.hostAlias}</strong> → {violation.groups.join(', ')}
                                </div>
                              ))}
                              {violations.length > 5 && (
                                <div className="text-muted-foreground">
                                  ...and {violations.length - 5} more
                                </div>
                              )}
                            </div>
                          </details>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                {enableGroupTypes && (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="enable-self-service-multi-select">Enable Self-Service Multi Select</Label>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-gray-100">
                              <Info className="h-4 w-4 text-gray-500" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Self-Service Multi Select Behavior</DialogTitle>
                              <DialogDescription>
                                Understanding how this setting affects self-service functionality
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <h4 className="font-semibold text-sm mb-2">When Enabled:</h4>
                                <p className="text-sm text-muted-foreground">
                                  Users can assign their host aliases to multiple groups through the self-service interface.
                                  All group types (Single Select and Multi Select) are visible and functional.
                                </p>
                              </div>
                              <div>
                                <h4 className="font-semibold text-sm mb-2">When Disabled:</h4>
                                <p className="text-sm text-muted-foreground mb-3">
                                  The self-service card reverts to single-select assign behavior with a crucial difference:
                                </p>
                                <ul className="text-sm text-muted-foreground space-y-2 ml-4">
                                  <li className="flex items-start">
                                    <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                                    <span><strong className="text-foreground">Multi-Select groups are not displayed</strong> in the self-service card, but they remain valid and active</span>
                                  </li>
                                  <li className="flex items-start">
                                    <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                                    <span><strong className="text-foreground">Assign and move operations will not remove</strong> the host alias from existing multi-select groups</span>
                                  </li>
                                  <li className="flex items-start">
                                    <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                                    <span><strong className="text-foreground">Multi-select groups remain manageable</strong> through Device Management for users with appropriate permissions</span>
                                  </li>
                                </ul>
                              </div>
                              <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md">
                                <p className="text-sm text-blue-800 dark:text-blue-200">
                                  <strong>Note:</strong> This setting provides a way to simplify the self-service interface while preserving
                                  existing multi-select group assignments and allowing advanced management through Device Management.
                                </p>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <ClientOnly>
                        <Switch
                          id="enable-self-service-multi-select"
                          checked={enableSelfServiceMultiSelect}
                          onCheckedChange={async (checked) => {
                            // Update the local state immediately for UI feedback
                            setEnableSelfServiceMultiSelect(checked);

                            // Save the setting to the API
                            try {
                              await handleSaveSetting(
                                'enableSelfServiceMultiSelect',
                                checked,
                                setEnableSelfServiceMultiSelect,
                                `Self-Service Multi Select ${checked ? "Enabled" : "Disabled"}. ${checked ? "Users can assign hosts to multiple groups in self-service." : "Self-service limited to single group selection."}`,
                                'Failed to save self-service multi select setting to API'
                              );

                              // Show refresh dialog after successful save
                              setShowMultiSelectRefreshDialog(true);
                            } catch (error) {
                              // If save failed, revert the local state
                              setEnableSelfServiceMultiSelect(!checked);
                              logger.error('Failed to save enableSelfServiceMultiSelect setting:', error);
                            }
                          }}
                        />
                      </ClientOnly>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="single-select-name">Single Select Name</Label>
                      <div className="flex items-center space-x-2">
                        <Input
                          id="single-select-name"
                          value={singleSelectName}
                          onChange={(e) => setSingleSelectName(e.target.value)}
                          onBlur={() => {
                            handleSaveTextSetting(
                              'singleSelectName',
                              singleSelectName,
                              setSingleSelectName,
                              `Single Select name updated to "${singleSelectName}".`,
                              'Failed to save single select name to API'
                            );
                          }}
                          placeholder="Single Select"
                          className="flex-1"
                        />
                        <LucideIconPicker
                          selectedIcon={singleSelectIcon}
                          onIconSelect={(icon) => {
                            setSingleSelectIcon(icon);
                            handleSaveTextSetting(
                              'singleSelectIcon',
                              icon,
                              setSingleSelectIcon,
                              `Single Select icon updated to "${icon}".`,
                              'Failed to save single select icon to API'
                            );
                          }}
                          triggerClassName="w-10 h-10"
                          customLucideIcons={customLucideIconNames}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="multi-select-name">Multi Select Name</Label>
                      <div className="flex items-center space-x-2">
                        <Input
                          id="multi-select-name"
                          value={multiSelectName}
                          onChange={(e) => setMultiSelectName(e.target.value)}
                          onBlur={() => {
                            handleSaveTextSetting(
                              'multiSelectName',
                              multiSelectName,
                              setMultiSelectName,
                              `Multi Select name updated to "${multiSelectName}".`,
                              'Failed to save multi select name to API'
                            );
                          }}
                          placeholder="Multi Select"
                          className="flex-1"
                        />
                        <LucideIconPicker
                          selectedIcon={multiSelectIcon}
                          onIconSelect={(icon) => {
                            setMultiSelectIcon(icon);
                            handleSaveTextSetting(
                              'multiSelectIcon',
                              icon,
                              setMultiSelectIcon,
                              `Multi Select icon updated to "${icon}".`,
                              'Failed to save multi select icon to API'
                            );
                          }}
                          triggerClassName="w-10 h-10"
                          customLucideIcons={customLucideIconNames}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Logs and Advanced Analytics Settings Section */}
              <div className="border rounded-lg p-4 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold flex items-center">
                    <ClientOnly><BarChart3 size={20} className="mr-2 text-primary" /></ClientOnly> Logs and Advanced Analytics
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Configure data retention and advanced analytics features. Logs are always collected and cleaned up automatically.
                    {databaseType === 'SQLite' && ' Disabling analytics improves performance on SQLite databases.'}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="enableAdvancedAnalytics" className="text-base">
                      Enable Advanced Analytics
                    </Label>
                    <div className="text-sm text-muted-foreground">
                      Enable session tracking, performance monitoring, and detailed analytics dashboards.
                      {databaseType === 'SQLite' && (
                        <>
                          <br />
                          <span className="text-orange-600 font-medium">
                            ⚠️ Disabling this improves performance significantly on SQLite databases.
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <ClientOnly>
                    <Switch
                      id="enableAdvancedAnalytics"
                      checked={enableAdvancedAnalytics}
                      onCheckedChange={(checked) => {
                        // Update state immediately for responsive UI
                        setEnableAdvancedAnalytics(checked);

                        handleSaveSetting(
                          'enableAdvancedAnalytics',
                          checked,
                          setEnableAdvancedAnalytics,
                          checked
                            ? 'Advanced analytics enabled. Session tracking and performance monitoring are now active.'
                            : 'Advanced analytics disabled. Only basic audit logs and API key usage tracking remain active.',
                          'Failed to save advanced analytics setting'
                        );
                      }}
                    />
                  </ClientOnly>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="logsAnalyticsRetentionDays" className="text-base">
                      Data Retention (days)
                    </Label>
                    <div className="text-sm text-muted-foreground">
                      Automatically delete logs and analytics data older than this period. Applies to both logs and analytics regardless of analytics toggle state.
                    </div>
                  </div>
                  <div className="w-20">
                    <Input
                      id="logsAnalyticsRetentionDays"
                      type="text"
                      pattern="[0-9]*"
                      inputMode="numeric"
                      value={logsAnalyticsRetentionDays}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 90;
                        setLogsAnalyticsRetentionDays(value);
                      }}
                      onBlur={async () => {
                        try {
                          const response = await fetch('/api/settings/global', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ logsAnalyticsRetentionDays })
                          });
                          if (response.ok) {
                            toast({
                              title: "Setting Saved",
                              description: `Logs and analytics retention updated to ${logsAnalyticsRetentionDays} days.`,
                              variant: "success",
                            });
                          } else {
                            const errorData = await response.json();
                            toast({
                              title: "Validation Error",
                              description: errorData.error || 'Failed to save logs and analytics retention.',
                              variant: "destructive",
                            });
                          }
                        } catch {
                          toast({
                            title: "Error",
                            description: 'Failed to save logs and analytics retention.',
                            variant: "destructive",
                          });
                        }
                      }}
                      className="text-center"
                    />
                  </div>
                </div>
              </div>

              {/* MAC Tracking Settings Section */}
              <div className="border rounded-lg p-4 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold flex items-center">
                    <ClientOnly><Laptop size={20} className="mr-2 text-primary" /></ClientOnly> MAC Address Tracking
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Monitor and track MAC addresses discovered through ARP table scanning.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="enableMacTracking" className="text-base">
                        Enable MAC Tracking
                      </Label>
                      <div className="text-sm text-muted-foreground">
                        Automatically discover and track MAC addresses through periodic ARP table scans.
                      </div>
                    </div>
                    <ClientOnly>
                      <Switch
                        id="enableMacTracking"
                        checked={enableMacTracking}
                        onCheckedChange={async (checked) => {
                          try {
                            setEnableMacTracking(checked);

                            // Save the setting first so the API can check the database state
                            await handleSaveSetting(
                              'enableMacTracking',
                              checked,
                              setEnableMacTracking,
                              checked
                                ? 'MAC tracking enabled. Starting service...'
                                : 'MAC tracking disabled. Stopping service...',
                              'Failed to save MAC tracking setting'
                            );

                            // Start or stop the service based on the new state (after saving)
                            if (checked) {
                              // Start the service when enabling
                              try {
                                const response = await fetch('/api/admin/mac-tracking/service', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'start' })
                                });

                                if (response.ok) {
                                  toast({
                                    title: "Service Started",
                                    description: "MAC tracking service has been started and will monitor ARP table changes.",
                                  });
                                } else {
                                  const errorData = await response.json();
                                  toast({
                                    title: "Service Start Warning",
                                    description: `MAC tracking enabled but service start failed: ${errorData.message}`,
                                    variant: "destructive",
                                  });
                                }
                              } catch {
                                toast({
                                  title: "Service Start Error",
                                  description: "MAC tracking enabled but service could not be started. Please try manually starting it.",
                                  variant: "destructive",
                                });
                              }
                            } else {
                              // Stop the service when disabling
                              try {
                                const response = await fetch('/api/admin/mac-tracking/service', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'stop' })
                                });

                                if (response.ok) {
                                  toast({
                                    title: "Service Stopped",
                                    description: "MAC tracking service stopped and no new MAC addresses will be discovered.",
                                  });
                                }
                              } catch (serviceError) {
                                console.error('Failed to stop MAC tracking service:', serviceError);
                              }
                            }

                            // Show refresh dialog after successful save
                            setShowMacTrackingRefreshDialog(true);
                          } catch (error) {
                            // If save failed, revert the local state
                            setEnableMacTracking(!checked);
                            logger.error('Failed to save enableMacTracking setting:', error);
                          }
                        }}
                      />
                    </ClientOnly>
                  </div>

                  {enableMacTracking && (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="macTrackingInterval" className="text-base">
                            Scan Interval (minutes)
                          </Label>
                          <div className="text-sm text-muted-foreground">
                            How often to scan the ARP table for MAC address changes.
                          </div>
                        </div>
                        <div className="w-20">
                          <Input
                            id="macTrackingInterval"
                            type="number"
                            min="1"
                            max="1440"
                            value={macTrackingInterval}
                            onChange={(e) => {
                              const value = parseInt(e.target.value) || 5;
                              setMacTrackingInterval(value);
                            }}
                            onBlur={async () => {
                              try {
                                const response = await fetch('/api/settings/global', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ macTrackingInterval })
                                });
                                if (response.ok) {
                                  // Restart the MAC tracking service with new interval
                                  try {
                                    await fetch('/api/admin/mac-tracking/service', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ action: 'restart' })
                                    });
                                  } catch (serviceError) {
                                    console.error('Failed to restart MAC tracking service:', serviceError);
                                  }

                                  toast({
                                    title: "Setting Saved",
                                    description: `MAC tracking interval updated to ${macTrackingInterval} minutes. Service restarted with new interval.`,
                                    variant: "success",
                                  });
                                }
                              } catch (error) {
                                console.error('Failed to save MAC tracking interval:', error);
                              }
                            }}
                            className="text-center"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="macInactiveTimeout" className="text-base">
                            Inactive Timeout (minutes)
                          </Label>
                          <div className="text-sm text-muted-foreground">
                            Mark MAC addresses as inactive after this period without activity.
                          </div>
                        </div>
                        <div className="w-20">
                          <Input
                            id="macInactiveTimeout"
                            type="number"
                            min="60"
                            max="10080"
                            value={macInactiveTimeout}
                            onChange={(e) => {
                              const value = parseInt(e.target.value) || 1440;
                              setMacInactiveTimeout(value);
                            }}
                            onBlur={async () => {
                              try {
                                const response = await fetch('/api/settings/global', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ macInactiveTimeout })
                                });
                                if (response.ok) {
                                  toast({
                                    title: "Setting Saved",
                                    description: `MAC inactive timeout updated to ${macInactiveTimeout} minutes.`,
                                    variant: "success",
                                  });
                                }
                              } catch (error) {
                                console.error('Failed to save MAC inactive timeout:', error);
                              }
                            }}
                            className="text-center"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="macDataRetentionDays" className="text-base">
                            Data Retention (days)
                          </Label>
                          <div className="text-sm text-muted-foreground">
                            Automatically delete MAC tracking data older than this period.
                          </div>
                        </div>
                        <div className="w-20">
                          <Input
                            id="macDataRetentionDays"
                            type="text"
                            pattern="[0-9]*"
                            inputMode="numeric"
                            value={macDataRetentionDays}
                            onChange={(e) => {
                              const value = parseInt(e.target.value) || 90;
                              setMacDataRetentionDays(value);
                            }}
                            onBlur={async () => {
                              try {
                                const response = await fetch('/api/settings/global', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ macDataRetentionDays })
                                });
                                if (response.ok) {
                                  toast({
                                    title: "Setting Saved",
                                    description: `MAC data retention updated to ${macDataRetentionDays} days.`,
                                    variant: "success",
                                  });
                                } else {
                                  const errorData = await response.json();
                                  toast({
                                    title: "Validation Error",
                                    description: errorData.error || 'Failed to save MAC data retention.',
                                    variant: "destructive",
                                  });
                                }
                              } catch {
                                toast({
                                  title: "Error",
                                  description: 'Failed to save MAC data retention.',
                                  variant: "destructive",
                                });
                              }
                            }}
                            className="text-center"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {enableMacTracking && (
                    <div className="pt-4 border-t">
                      <Button
                        onClick={() => setShowClearMacDbDialog(true)}
                        variant="destructive"
                        size="sm"
                        className="w-full"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Clear Entire MAC Address Database
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              {/* Network Aliases Management Section */}
              <div className="border rounded-lg p-4 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold flex items-center">
                    <ClientOnly><Waypoints size={20} className="mr-2 text-primary" /></ClientOnly> Network Aliases Management
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Enable scheduling actions on OPNsense network aliases (CIDR ranges). When enabled, schedules can target network range aliases and administrators can configure per-group alias permissions.
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="manage-network-aliases">Enable Network Aliases Management</Label>
                    <div className="text-sm text-muted-foreground">
                      Adds a &ldquo;Network Ranges&rdquo; tab to the admin panel and allows schedules to target network aliases.
                    </div>
                  </div>
                  <ClientOnly>
                    <Switch
                      id="manage-network-aliases"
                      checked={manageNetworkAliasesEnabled}
                      onCheckedChange={async (checked) => {
                        if (!checked) {
                          setShowDisableNetworkAliasesDialog(true);
                          return;
                        }
                        setManageNetworkAliasesEnabled(true);
                        try {
                          await handleSaveSetting(
                            'manageNetworkAliasesEnabled',
                            true,
                            setManageNetworkAliasesEnabled,
                            'Network aliases management enabled.',
                            'Failed to save network aliases setting.'
                          );
                          globalSettingsEvents.emit();
                        } catch {
                          setManageNetworkAliasesEnabled(false);
                        }
                      }}
                    />
                  </ClientOnly>
                </div>
              </div>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Refresh Required Dialog - Self Service */}
      <RefreshRequiredDialog
        isOpen={showRefreshDialog}
        onRefresh={() => {
          window.location.reload();
        }}
        title="Page Refresh Required"
        description="The self-service page setting has been changed. A full page refresh is required to update the menu and apply all changes."
      />

      {/* Refresh Required Dialog - Group Types */}
      <RefreshRequiredDialog
        isOpen={showGroupTypesRefreshDialog}
        onRefresh={() => {
          window.location.reload();
        }}
        title="Page Refresh Required"
        description="The group types setting has been changed. A full page refresh is required to update the UI components and group management behavior."
      />

      {/* Refresh Required Dialog - Self-Service Multi Select */}
      <RefreshRequiredDialog
        isOpen={showMultiSelectRefreshDialog}
        onRefresh={() => {
          window.location.reload();
        }}
        title="Page Refresh Required"
        description="The self-service multi-select setting has been changed. A full page refresh is required to update the group selection interface and user experience."
      />

      {/* Refresh Required Dialog - MAC Tracking */}
      <RefreshRequiredDialog
        isOpen={showMacTrackingRefreshDialog}
        onRefresh={() => {
          window.location.reload();
        }}
        title="Page Refresh Required"
        description="The MAC tracking setting has been changed. A full page refresh is required to update the navigation menu and apply all changes."
      />

      {/* Disable Network Aliases Confirmation Dialog */}
      <AlertDialog open={showDisableNetworkAliasesDialog} onOpenChange={setShowDisableNetworkAliasesDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Network Aliases Management?</AlertDialogTitle>
            <AlertDialogDescription>
              Disabling this feature will hide the Network Ranges tab and prevent schedules from targeting network aliases.
              Existing NETWORK_ALIAS schedules will be skipped at execution time until the feature is re-enabled.
              Group permissions and alias settings are preserved and will resume when re-enabled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setShowDisableNetworkAliasesDialog(false);
                setManageNetworkAliasesEnabled(false);
                try {
                  await handleSaveSetting(
                    'manageNetworkAliasesEnabled',
                    false,
                    setManageNetworkAliasesEnabled,
                    'Network aliases management disabled.',
                    'Failed to save network aliases setting.'
                  );
                  globalSettingsEvents.emit();
                } catch {
                  setManageNetworkAliasesEnabled(true);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear MAC Database Confirmation Dialog */}
      <AlertDialog open={showClearMacDbDialog} onOpenChange={setShowClearMacDbDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>ALL MAC addresses, IP associations, and exclusions</strong> from the database.
              This action cannot be undone and will result in complete loss of all MAC tracking data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowClearMacDbDialog(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearMacDatabase} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Clear Database
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}