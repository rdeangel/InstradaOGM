'use client';

import React, { useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  X,
  RefreshCw,
  Shield,
  Settings,
  Database,
  Laptop
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RenameProgress, RenameState } from '@/lib/rename-state';

interface ProgressModalProps {
  isOpen: boolean;
  progress: RenameProgress;
  onCancel?: () => void;
  onRetry?: () => void;
  currentAliasName?: string; // Add current alias name prop
  newAliasName?: string;
  shouldCreateDhcpReservation?: boolean;
  hasDhcpReservation?: boolean;
}

// Screen reader announcement component
const ScreenReaderAnnouncement: React.FC<{ message: string; priority?: 'polite' | 'assertive' }> = ({
  message,
  priority = 'polite'
}) => {
  return (
    <div
      aria-live={priority}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
};

/**
 * ProgressModal component for showing rename operation progress
 * Provides step-by-step visual feedback with icons and animations
 * Includes accessibility features for screen readers and keyboard navigation
 */
export function ProgressModal({
  isOpen,
  progress,
  onCancel,
  onRetry,
  currentAliasName,
  newAliasName,
  shouldCreateDhcpReservation = false,
  hasDhcpReservation = false,
}: ProgressModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const doneButtonRef = useRef<HTMLButtonElement>(null);

  // Store the steps list in a ref so it doesn't change during the operation
  const stepsRef = useRef<{ state: RenameState; label: string }[] | null>(null);

  // Focus management for dialog
  useEffect(() => {
    if (isOpen) {
      // Focus appropriate button based on state
      const timer = setTimeout(() => {
        if (progress.state === 'success' && doneButtonRef.current) {
          doneButtonRef.current.focus();
        } else if (progress.state === 'error' && retryButtonRef.current) {
          retryButtonRef.current.focus();
        } else if (cancelButtonRef.current) {
          cancelButtonRef.current.focus();
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [isOpen, progress.state]);
  const progressPercentage = React.useMemo(() => {
    return Math.round((progress.currentStep / progress.totalSteps) * 100);
  }, [progress.currentStep, progress.totalSteps]);

  // Determine operation type for display messages
  const getOperationType = React.useCallback(() => {
    const isNameChanging = currentAliasName && newAliasName && currentAliasName !== newAliasName;
    const isDhcpOnly = shouldCreateDhcpReservation && !hasDhcpReservation;

    if (isNameChanging && isDhcpOnly) {
      return 'rename_and_dhcp';
    } else if (isDhcpOnly) {
      return 'dhcp_only';
    } else if (isNameChanging) {
      return 'rename_only';
    }
    return 'unknown';
  }, [currentAliasName, newAliasName, shouldCreateDhcpReservation, hasDhcpReservation]);

  const operationType = getOperationType();

  const getStepIcon = React.useCallback((state: RenameState, isActive: boolean, isCompleted: boolean) => {
    const iconClass = cn(
      "h-5 w-5 transition-all duration-300",
      isActive && !isCompleted && "animate-pulse text-primary",
      isCompleted && "text-green-600",
      !isActive && !isCompleted && "text-muted-foreground"
    );

    switch (state) {
      case 'validating':
        return <Shield className={iconClass} aria-hidden="true" />;
      case 'updating_alias':
        return <Settings className={iconClass} aria-hidden="true" />;
      case 'creating_dhcp':
        return <Laptop className={iconClass} aria-hidden="true" />;
      case 'reconfiguring':
        return <RefreshCw className={cn(iconClass, isActive && "animate-spin")} aria-hidden="true" />;
      case 'refreshing_devices':
        return <Database className={iconClass} aria-hidden="true" />;
      case 'success':
        return <CheckCircle2 className={cn(iconClass, "text-green-600")} aria-hidden="true" />;
      case 'error':
        return <AlertCircle className={cn(iconClass, "text-red-600")} aria-hidden="true" />;
      default:
        return <Loader2 className={cn(iconClass, "animate-spin")} aria-hidden="true" />;
    }
  }, []);

  const getStepLabel = React.useCallback((state: RenameState) => {
    switch (state) {
      case 'validating':
        return 'Validating';
      case 'updating_alias':
        return 'Updating Alias';
      case 'creating_dhcp':
        return 'Creating DHCP';
      case 'reconfiguring':
        return 'Reconfiguring';
      case 'refreshing_devices':
        return 'Refreshing';
      case 'success':
        return 'Complete';
      case 'error':
        return 'Error';
      default:
        return 'Preparing';
    }
  }, []);

  const getSteps = React.useCallback(() => {
    // If we already have steps cached, return them (don't recalculate)
    if (stepsRef.current) {
      return stepsRef.current;
    }

    const baseSteps: { state: RenameState; label: string }[] = [];

    // Determine if name is actually changing by comparing current and new names
    const isNameChanging = currentAliasName && newAliasName && currentAliasName !== newAliasName;

    // Only add validating and updating_alias steps if name is actually changing
    if (isNameChanging) {
      baseSteps.push({ state: 'validating' as RenameState, label: 'Validating alias name' });
      baseSteps.push({ state: 'updating_alias' as RenameState, label: 'Updating host alias' });
    }

    // Add DHCP step only if it will actually be performed
    // DHCP reservation is only needed when:
    // 1. User chose to create DHCP reservation AND
    // 2. Device doesn't already have a DHCP reservation
    if (shouldCreateDhcpReservation && !hasDhcpReservation) {
      baseSteps.push({ state: 'creating_dhcp' as RenameState, label: 'Creating DHCP reservation' });
    }

    baseSteps.push(
      { state: 'reconfiguring' as RenameState, label: 'Reconfiguring network' },
      { state: 'refreshing_devices' as RenameState, label: 'Refreshing devices' }
    );

    baseSteps.push({ state: 'success' as RenameState, label: 'Complete' });

    // Cache the steps so they don't change during the operation
    stepsRef.current = baseSteps;
    return baseSteps;
  }, [currentAliasName, newAliasName, shouldCreateDhcpReservation, hasDhcpReservation]);

  const steps = getSteps();

  // Clear the steps cache when the modal closes
  useEffect(() => {
    if (!isOpen) {
      stepsRef.current = null;
    }
  }, [isOpen]);
  const currentStepIndex = steps.findIndex(step => step.state === progress.state);
  const isCompleted = progress.state === 'success';
  const hasError = progress.state === 'error';

  // Generate screen reader announcement for current state
  const getScreenReaderMessage = () => {
    const currentStepText = getStepLabel(progress.state);
    const percentage = progressPercentage;

    let operationText = 'Device operation';
    if (operationType === 'rename_only') {
      operationText = 'Device rename';
    } else if (operationType === 'dhcp_only') {
      operationText = 'DHCP reservation';
    } else if (operationType === 'rename_and_dhcp') {
      operationText = 'Device rename and DHCP reservation';
    }

    if (progress.state === 'success') {
      return `${operationText} completed successfully. ${percentage}% complete.`;
    } else if (progress.state === 'error') {
      return `${operationText} failed. ${progress.error?.message || 'Unknown error'}. ${percentage}% complete.`;
    } else {
      return `${operationText} in progress. Currently: ${currentStepText}. ${percentage}% complete.`;
    }
  };

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          // Only allow closing if operation is complete, has error, or can be cancelled
          if (!open && (isCompleted || hasError || progress.canCancel)) {
            onCancel?.();
          }
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          aria-describedby="progress-description"
          aria-live="polite"
          aria-atomic="true"
          onPointerDownOutside={(e) => {
            // Prevent closing by clicking outside unless operation is complete or has error
            if (!isCompleted && !hasError) {
              e.preventDefault();
            }
          }}
          onEscapeKeyDown={(e) => {
            // Prevent closing with Escape key unless operation can be cancelled
            if (!progress.canCancel && !isCompleted && !hasError) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {hasError ? (
                <AlertCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
              ) : isCompleted ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
              )}
              <span>
                {(() => {
                  let titleText = 'Operation';
                  if (operationType === 'rename_only') {
                    titleText = 'Rename';
                  } else if (operationType === 'dhcp_only') {
                    titleText = 'DHCP Reservation';
                  } else if (operationType === 'rename_and_dhcp') {
                    titleText = 'Rename & DHCP';
                  }

                  if (hasError) {
                    return `${titleText} Failed`;
                  } else if (isCompleted) {
                    return `${titleText} Complete`;
                  } else {
                    return `${titleText} in Progress`;
                  }
                })()}
              </span>
            </DialogTitle>
            <DialogDescription id="progress-description">
              {currentAliasName && newAliasName && (
                <span className="block mb-2">
                  {(() => {
                    const isNameChanging = currentAliasName !== newAliasName;
                    const isDhcpOnly = shouldCreateDhcpReservation && !hasDhcpReservation;

                    if (isNameChanging && isDhcpOnly) {
                      return (
                        <>
                          Renaming <span className="font-mono bg-muted px-1 py-0.5 rounded text-sm">{currentAliasName}</span> to{' '}
                          <span className="font-mono bg-muted px-1 py-0.5 rounded text-sm">{newAliasName}</span> and creating DHCP reservation
                        </>
                      );
                    } else if (isDhcpOnly) {
                      return (
                        <>
                          Creating DHCP reservation for <span className="font-mono bg-muted px-1 py-0.5 rounded text-sm">{currentAliasName}</span>
                        </>
                      );
                    } else if (isNameChanging) {
                      return (
                        <>
                          Renaming <span className="font-mono bg-muted px-1 py-0.5 rounded text-sm">{currentAliasName}</span> to{' '}
                          <span className="font-mono bg-muted px-1 py-0.5 rounded text-sm">{newAliasName}</span>
                        </>
                      );
                    }
                  })()}
                </span>
              )}
              <span className={cn(
                "text-sm",
                hasError && "text-red-600",
                isCompleted && "text-green-600"
              )}>
                {progress.stepMessage}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Progress</span>
                <span>{progressPercentage}%</span>
              </div>
              <Progress
                value={progressPercentage}
                className={cn(
                  "h-2 transition-all duration-300",
                  hasError && "bg-red-100",
                  isCompleted && "bg-green-100"
                )}
              />
            </div>

            {/* Step-by-step visualization */}
            <div className="space-y-3">
              <div className="text-sm font-medium text-muted-foreground">Steps</div>
              <div className="flex flex-col gap-2">
                {steps.map((step, index) => {
                  const isActive = index === currentStepIndex;
                  const isStepCompleted = index < currentStepIndex || isCompleted;
                  const isError = hasError && index === currentStepIndex;

                  return (
                    <div
                      key={step.state}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-md transition-all duration-200",
                        isActive && "bg-primary/10 border border-primary/20",
                        isStepCompleted && !isActive && "bg-green-50 dark:bg-green-950",
                        isError && "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800"
                      )}
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-background border">
                        {getStepIcon(step.state, isActive, isStepCompleted)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-sm font-medium",
                            isActive && "text-primary",
                            isStepCompleted && !isActive && "text-green-700 dark:text-green-300",
                            isError && "text-red-600"
                          )}>
                            {step.label}
                          </span>
                          {isActive && (
                            <Badge variant="secondary" className="text-xs">
                              {progress.currentStep}/{progress.totalSteps}
                            </Badge>
                          )}
                          {isStepCompleted && !isActive && (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Error details */}
            {hasError && progress.error && (
              <div className="space-y-3 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <span className="font-medium text-red-800 dark:text-red-200">
                    {progress.error.type.charAt(0).toUpperCase() + progress.error.type.slice(1)} Error
                  </span>
                </div>
                <p className="text-sm text-red-700 dark:text-red-300">
                  {progress.error.message}
                </p>
                {progress.error.details && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {progress.error.details}
                  </p>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-end gap-2 pt-2">
              {hasError && onRetry && (
                <Button
                  onClick={onRetry}
                  variant="default"
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </Button>
              )}
              {progress.canCancel && !hasError && (
                <Button
                  onClick={onCancel}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Screen reader announcements */}
      <ScreenReaderAnnouncement
        message={getScreenReaderMessage()}
        priority={progress.state === 'error' ? 'assertive' : 'polite'}
      />
    </>
  );
}

/**
 * Hook for managing progress modal state
 */
export function useProgressModal() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [progress, setProgress] = React.useState<RenameProgress>({
    state: 'idle',
    currentStep: 0,
    totalSteps: 5,
    stepMessage: 'Ready to rename device',
    canCancel: true,
  });

  const openModal = React.useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeModal = React.useCallback(() => {
    setIsOpen(false);
  }, []);

  const updateProgress = React.useCallback((newProgress: RenameProgress) => {
    setProgress(newProgress);
  }, []);

  return {
    isOpen,
    progress,
    openModal,
    closeModal,
    updateProgress,
  };
}