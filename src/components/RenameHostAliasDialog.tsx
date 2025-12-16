'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Laptop, Shield, Loader2, X } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { checkMacRandomization } from '@/lib/mac-utils';
import { ProgressModal } from '@/components/ui/progress-modal';
import { ErrorDialog, useErrorDialog } from '@/components/ui/error-dialog';
import {
  RenameProgress,
  RenameStateConfig,
  executeRenameOperation,
  getRecoveryActionsForError,
  canCancelOperation
} from '@/lib/rename-utils';
import { RenameState } from '@/lib/rename-state';

// Import the sanitization function
function sanitizeHostAliasName(hostname: string): string {
  return hostname
    // Replace hyphens with underscores
    .replace(/-/g, '_')
    // Replace any other potentially problematic characters with underscores
    .replace(/[^a-zA-Z0-9_]/g, '_')
    // Remove leading/trailing underscores
    .replace(/^_+|_+$/g, '')
    // Ensure it's not empty after sanitization
    .replace(/^$/, 'HOST');
}

// Get validation error message
function getValidationError(name: string): string | null {
  if (!name || name.trim().length === 0) {
    return 'Name cannot be empty';
  }
  if (name.includes(' ')) {
    return 'Name cannot contain spaces';
  }
  if (name.includes('-')) {
    return 'Name cannot contain hyphens (use underscores instead)';
  }
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    return 'Name can only contain letters, numbers, and underscores';
  }
  if (name.startsWith('_') || name.endsWith('_')) {
    return 'Name cannot start or end with underscore';
  }
  return null;
}

interface RenameHostAliasDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentAliasName: string;
  onRenameSubmit: (newAliasName: string, shouldCreateDhcpReservation?: boolean, nameChanged?: boolean, dhcpCreated?: boolean) => Promise<void>;
  detectedHostname?: string | null; // New prop for detected hostname
  // New props for DHCP functionality
  ipAddress?: string | null;
  macAddress?: string | null;
  isDeviceOnline?: boolean;
  hasDhcpReservation?: boolean;
  isAuthenticated?: boolean; // New prop for authentication status
  deviceUuid?: string; // New prop for device UUID
}

export function RenameHostAliasDialog({
  isOpen,
  onClose,
  currentAliasName,
  onRenameSubmit,
  detectedHostname,
  ipAddress,
  macAddress,
  isDeviceOnline = false,
  hasDhcpReservation = false,
  isAuthenticated = false,
  deviceUuid,
}: RenameHostAliasDialogProps) {
  const [newAliasName, setNewAliasName] = useState(currentAliasName);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [shouldCreateDhcpReservation, setShouldCreateDhcpReservation] = useState(false);
  const [macRandomizationCheck, setMacRandomizationCheck] = useState<{
    isRandomized: boolean;
    explanation: string;
    confidence: 'high' | 'medium' | 'low';
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progress, setProgress] = useState<RenameProgress | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);


  const errorDialog = useErrorDialog();

  useEffect(() => {
    if (isOpen) {
      setNewAliasName(currentAliasName);
      setError(null);
      setValidationError(null);
      setIsSubmitting(false);
      setShowProgressModal(false);
      setProgress(null);
      // Default to creating DHCP reservation if device is online and doesn't have one
      setShouldCreateDhcpReservation(isDeviceOnline && !hasDhcpReservation);

      // Check MAC randomization if MAC address is available
      if (macAddress) {
        const macCheck = checkMacRandomization(macAddress);
        setMacRandomizationCheck(macCheck);
      } else {
        setMacRandomizationCheck(null);
      }
    }
  }, [isOpen, currentAliasName, isDeviceOnline, hasDhcpReservation, macAddress]);

  // Handle progress updates
  useEffect(() => {
    if (progress && progress.state === 'success') {
      // Auto-close progress modal after a delay
      const timer = setTimeout(() => {
        setShowProgressModal(false);
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [progress, onClose]);

  // Validate name when it changes (only when renaming, not for DHCP-only)
  useEffect(() => {
    const isNameChanging = newAliasName.trim() !== currentAliasName;
    const isDhcpOnly = shouldCreateDhcpReservation && !hasDhcpReservation;

    // Only validate if we're actually renaming (not DHCP-only)
    if (isNameChanging && !isDhcpOnly) {
      const error = getValidationError(newAliasName.trim());
      setValidationError(error);
    } else {
      setValidationError(null);
    }
  }, [newAliasName, currentAliasName, shouldCreateDhcpReservation, hasDhcpReservation]);

  // Handle error dialog close
  useEffect(() => {
    if (!errorDialog.isOpen && progress && progress.state === 'error') {
      // Reset to idle when error dialog is closed
      setProgress(null);
      setShowProgressModal(false);
      setIsSubmitting(false);
    }
  }, [errorDialog.isOpen, progress]);

  const handleUseHostname = useCallback(() => {
    if (detectedHostname) {
      const sanitizedHostname = sanitizeHostAliasName(detectedHostname);
      setNewAliasName(sanitizedHostname);
      setError(null);
    }
  }, [detectedHostname]);

  const handleRename = async () => {
    if (isSubmitting) return; // Prevent multiple submissions

    setIsSubmitting(true);
    setError(null);

    // Create abort controller for this operation
    abortControllerRef.current = new AbortController();

    try {
      // Create configuration for the rename operation
      const config: RenameStateConfig = {
        deviceName: deviceUuid || currentAliasName,
        currentAliasName: currentAliasName, // Add current alias name for comparison
        newAliasName: newAliasName.trim(),
        ipAddress: ipAddress || undefined,
        macAddress: macAddress || undefined,
        shouldCreateDhcpReservation,
        isDeviceOnline,
        hasDhcpReservation,
      };

      // Check if there's actual work to do (name change OR DHCP reservation)
      const needsWork = (newAliasName.trim() !== currentAliasName) ||
        (shouldCreateDhcpReservation && !hasDhcpReservation);

      if (needsWork) {
        // Show progress modal only when there's work to do
        setShowProgressModal(true);

        // Calculate the correct initial state and total steps based on what work needs to be done
        const isNameChanging = newAliasName.trim() !== currentAliasName;
        const needsDhcpReservation = shouldCreateDhcpReservation && !hasDhcpReservation;

        // Determine initial state
        let initialState: RenameState = 'idle';
        if (isNameChanging) {
          initialState = 'validating';
        } else if (needsDhcpReservation) {
          initialState = 'creating_dhcp';
        } else {
          initialState = 'reconfiguring';
        }

        // Calculate total steps
        let totalSteps = 2; // reconfiguring + refreshing_devices are always present
        if (isNameChanging) {
          totalSteps += 2; // validating + updating_alias
        }
        if (needsDhcpReservation) {
          totalSteps += 1; // creating_dhcp
        }
        totalSteps += 1; // success step is always present at the end

        // Set current step based on initial state (skip steps that aren't needed)
        let currentStep = 0;
        if (initialState === 'creating_dhcp' && isNameChanging === false) {
          // If we're going directly to creating_dhcp, we've already skipped validating and updating_alias
          currentStep = 0; // This will be the first step in our reduced list
        } else if (initialState === 'reconfiguring' && isNameChanging === false && needsDhcpReservation === false) {
          // If we're going directly to reconfiguring, we've skipped all optional steps
          currentStep = 0; // This will be the first step in our reduced list
        }

        setProgress({
          state: initialState,
          currentStep: currentStep,
          totalSteps: totalSteps,
          stepMessage: isNameChanging ? 'Validating alias name...' :
            needsDhcpReservation ? 'Creating DHCP reservation...' :
              'Reconfiguring network...',
          canCancel: true,
        });

        // Execute the rename operation with progress tracking
        const result = await executeRenameOperation(config, setProgress, abortControllerRef.current.signal);

        if (result.success) {
          // Call the original onRenameSubmit with information about what was actually done
          await onRenameSubmit(config.newAliasName, shouldCreateDhcpReservation, result.nameChanged, result.dhcpCreated);
        } else {
          // Handle error
          const errorType = result.error?.message?.includes('validation') ? 'validation' :
            result.error?.message?.includes('permission') ? 'permission' :
              result.error?.message?.includes('network') ? 'network' :
                result.error?.message?.includes('conflict') ? 'conflict' :
                  result.error?.message?.includes('timeout') ? 'timeout' : 'unknown';

          const recoveryActions = getRecoveryActionsForError(
            errorType,
            () => handleRename(),
            config
          );

          // Show error dialog
          errorDialog.showError(
            errorType,
            result.error?.message || 'Failed to rename host alias',
            result.error?.stack,
            recoveryActions,
            currentAliasName,
            'rename operation'
          );
        }
      } else {
        // No work needed - just close the dialog without doing anything
        // Don't call onRenameSubmit to avoid any unnecessary operations
        onClose();
      }
    } catch (error) {
      console.error('Unexpected error during rename:', error);

      // Show error dialog for unexpected errors
      errorDialog.showError(
        'unknown',
        error instanceof Error ? error.message : 'An unexpected error occurred',
        error instanceof Error ? error.stack : undefined,
        getRecoveryActionsForError('unknown', () => handleRename(), {
          deviceName: deviceUuid || currentAliasName,
          currentAliasName: currentAliasName,
          newAliasName: newAliasName.trim(),
          ipAddress: ipAddress || undefined,
          macAddress: macAddress || undefined,
          shouldCreateDhcpReservation,
          isDeviceOnline,
          hasDhcpReservation,
        }),
        currentAliasName,
        'rename operation'
      );
    } finally {
      setIsSubmitting(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (progress && canCancelOperation(progress)) {
      setShowProgressModal(false);
      setProgress(null);
      setIsSubmitting(false);
    }

    onClose();
  };

  const handleRetry = () => {
    errorDialog.hideError();
    handleRename();
  };

  // Listen for custom event to use detected hostname
  useEffect(() => {
    const handleUseDetectedHostname = () => {
      handleUseHostname();
    };

    window.addEventListener('use-detected-hostname', handleUseDetectedHostname);
    return () => {
      window.removeEventListener('use-detected-hostname', handleUseDetectedHostname);
    };
  }, [handleUseHostname]);

  const sanitizedHostname = detectedHostname ? sanitizeHostAliasName(detectedHostname) : null;

  // Determine button text based on what operations will be performed
  const isNameChanging = newAliasName.trim() !== currentAliasName;
  const isDhcpReservationNeeded = shouldCreateDhcpReservation && !hasDhcpReservation;

  let buttonText = 'Rename';
  if (isNameChanging && isDhcpReservationNeeded) {
    buttonText = 'Rename + DHCP Reserve';
  } else if (!isNameChanging && isDhcpReservationNeeded) {
    buttonText = 'DHCP Reserve';
  } else if (isNameChanging) {
    buttonText = 'Rename';
  }

  return (
    <>
      <AlertDialog open={isOpen} onOpenChange={onClose}>
        <AlertDialogContent className="max-h-[90vh] flex flex-col">
          <AlertDialogHeader className="flex-shrink-0">
            <AlertDialogTitle>
              {(() => {
                const isNameChanging = newAliasName.trim() !== currentAliasName;
                const isDhcpOnly = shouldCreateDhcpReservation && !hasDhcpReservation;

                if (isNameChanging && isDhcpOnly) {
                  return 'Rename & DHCP Reserve';
                } else if (isDhcpOnly) {
                  return 'Create DHCP Reservation';
                } else {
                  return 'Rename Host Alias';
                }
              })()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const isNameChanging = newAliasName.trim() !== currentAliasName;
                const isDhcpOnly = shouldCreateDhcpReservation && !hasDhcpReservation;

                if (isNameChanging && isDhcpOnly) {
                  return (
                    <>
                      Enter a new name for the host alias &quot;{currentAliasName}&quot; and create a DHCP reservation.
                      {detectedHostname && (
                        <span className="block mt-2 text-sm text-muted-foreground">
                          Detected hostname: <code className="bg-muted px-1 py-0.5 rounded text-xs">{detectedHostname}</code>
                          {sanitizedHostname && sanitizedHostname !== detectedHostname && (
                            <span className="block mt-1">
                              Sanitized version: <code className="bg-muted px-1 py-0.5 rounded text-xs">{sanitizedHostname}</code>
                            </span>
                          )}
                        </span>
                      )}
                    </>
                  );
                } else if (isDhcpOnly) {
                  return `Create a DHCP reservation for the host alias "${currentAliasName}".`;
                } else {
                  return (
                    <>
                      Enter a new name for the host alias &quot;{currentAliasName}&quot;.
                      {detectedHostname && (
                        <span className="block mt-2 text-sm text-muted-foreground">
                          Detected hostname: <code className="bg-muted px-1 py-0.5 rounded text-xs">{detectedHostname}</code>
                          {sanitizedHostname && sanitizedHostname !== detectedHostname && (
                            <span className="block mt-1">
                              Sanitized version: <code className="bg-muted px-1 py-0.5 rounded text-xs">{sanitizedHostname}</code>
                            </span>
                          )}
                        </span>
                      )}
                    </>
                  );
                }
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-4 py-4 overflow-y-auto flex-1 min-h-0">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="new-alias-name" className="text-right">
                New Name
              </Label>
              <div className="col-span-3 flex gap-2 items-center">
                <Input
                  id="new-alias-name"
                  value={newAliasName}
                  onChange={(e) => setNewAliasName(e.target.value)}
                  className="flex-1"
                  autoFocus
                />
                {validationError && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <X className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-red-600 dark:bg-red-700 text-white">
                        {validationError}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {detectedHostname && sanitizedHostname && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleUseHostname}
                    title={`Use sanitized hostname: ${sanitizedHostname}`}
                    className="whitespace-nowrap"
                  >
                    Use Hostname
                  </Button>
                )}
              </div>
            </div>

            {/* MAC Randomization Warning - Show when randomized MAC is detected */}
            {macRandomizationCheck?.isRandomized && macAddress && (
              <Alert className="border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950">
                <Shield className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <AlertDescription className="text-orange-800 dark:text-orange-200">
                  <div className="space-y-2">
                    <div>
                      <strong>⚠️ Privacy MAC Address Detected</strong>
                    </div>
                    <div className="text-sm">
                      The MAC address <code className="bg-orange-100 dark:bg-orange-900 px-1 py-0.5 rounded text-xs font-mono">{macAddress}</code> appears to be randomized for privacy protection.
                    </div>
                    <div className="text-sm">
                      <strong>DHCP reservations may fail</strong> because the device may change its MAC address periodically.
                    </div>
                    <div className="text-sm">
                      <strong>Recommended:</strong> Change your device&apos;s network settings to use the real hardware MAC address instead of a randomized one for this network.
                    </div>
                    <details className="text-xs mt-2">
                      <summary className="cursor-pointer text-orange-700 dark:text-orange-300 hover:text-orange-900 dark:hover:text-orange-100">
                        How to disable MAC randomization
                      </summary>
                      <div className="mt-1 pl-2 border-l-2 border-orange-300 dark:border-orange-700">
                        <p><strong>iOS/iPhone:</strong> Settings → Wi-Fi → (i) next to network → Private Wi-Fi Address → Off</p>
                        <p><strong>Android:</strong> Settings → Wi-Fi → Network → Privacy → Use device MAC</p>
                        <p><strong>Windows:</strong> Settings → Network → Wi-Fi → Network properties → Random hardware addresses → Off</p>
                        <p><strong>macOS:</strong> System Preferences → Network → Wi-Fi → Advanced → Use private Wi-Fi address → Off</p>
                      </div>
                    </details>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* DHCP Reservation Option - Show only if authenticated, device is online and doesn't have reservation */}
            {isAuthenticated && isDeviceOnline && !hasDhcpReservation && ipAddress && macAddress && (
              <div className="flex items-center space-x-2 p-3 bg-green-50 dark:bg-green-950 rounded-md border border-green-200 dark:border-green-800">
                <Laptop className="h-4 w-4 text-green-600 dark:text-green-400" />
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="create-dhcp-reservation"
                      checked={shouldCreateDhcpReservation}
                      onCheckedChange={(checked) => setShouldCreateDhcpReservation(checked === true)}
                    />
                    <Label htmlFor="create-dhcp-reservation" className="text-sm font-medium">
                      Create DHCP reservation
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Device is online ({ipAddress}). Creating a DHCP reservation will ensure it keeps the same IP address.
                    {macRandomizationCheck?.isRandomized && (
                      <span className="block mt-1 text-orange-600 dark:text-orange-400 font-medium">
                        ⚠️ Warning: Even with a DHCP reservation, the device ip might still change over time due to randomized MAC address detected above. Change your mac address privacy settings!
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Warning for offline devices without DHCP reservation */}
            {!isDeviceOnline && !hasDhcpReservation && (
              <Alert className="border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950">
                <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <AlertDescription className="text-orange-800 dark:text-orange-200">
                  <strong>Warning:</strong> This device is offline and has no DHCP reservation.
                  Renaming may cause the name to not match to the IP address if the device gets a different IP address when it comes back online. If You&apos;ve configured this IP address statically you can still go ahead and rename it.
                </AlertDescription>
              </Alert>
            )}

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          </div>
          <AlertDialogFooter className="flex-shrink-0">
            <AlertDialogCancel onClick={handleCancel} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRename}
              disabled={isSubmitting || validationError !== null || (newAliasName.trim() === currentAliasName && (!shouldCreateDhcpReservation || hasDhcpReservation))}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {buttonText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Progress Modal */}
      {showProgressModal && progress && (
        <ProgressModal
          isOpen={showProgressModal}
          progress={progress}
          onCancel={handleCancel}
          onRetry={handleRetry}
          currentAliasName={currentAliasName}
          newAliasName={newAliasName}
          shouldCreateDhcpReservation={shouldCreateDhcpReservation}
          hasDhcpReservation={hasDhcpReservation}
        />
      )}

      {/* Error Dialog */}
      <ErrorDialog
        isOpen={errorDialog.isOpen}
        errorType={errorDialog.errorType}
        errorMessage={errorDialog.errorMessage}
        errorDetails={errorDialog.errorDetails}
        recoveryActions={errorDialog.recoveryActions}
        onClose={errorDialog.hideError}
        onRetry={handleRetry}
        deviceName={errorDialog.deviceName}
        operation={errorDialog.operation}
      />
    </>
  );
}