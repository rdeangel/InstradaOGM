'use client';

import React, { useEffect, useRef } from 'react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  X,
  RefreshCw,
  Shield,
  Settings,
  Database,
  Minimize2,
  Maximize2,
  Laptop
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RenameProgress, RenameState } from '@/lib/rename-state';

interface InlineProgressProps {
  progress: RenameProgress;
  onCancel?: () => void;
  onRetry?: () => void;
  onMinimize?: () => void;
  deviceName?: string;
  newAliasName?: string;
  className?: string;
  isMinimized?: boolean;
}

/**
 * InlineProgress component for showing rename operation progress outside of a modal
 * Used when the dialog closes but processing continues in the background
 */
export function InlineProgress({
  progress,
  onCancel,
  onRetry,
  onMinimize,
  deviceName,
  newAliasName,
  className,
  isMinimized = false,
}: InlineProgressProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const minimizeButtonRef = useRef<HTMLButtonElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);

  // Focus management for minimized/maximized state
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isMinimized && expandButtonRef.current) {
        expandButtonRef.current.focus();
      } else if (!isMinimized) {
        if (progress.state === 'error' && retryButtonRef.current) {
          retryButtonRef.current.focus();
        } else if (cancelButtonRef.current) {
          cancelButtonRef.current.focus();
        }
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isMinimized, progress.state]);

  const progressPercentage = React.useMemo(() => {
    return Math.round((progress.currentStep / progress.totalSteps) * 100);
  }, [progress.currentStep, progress.totalSteps]);

  const getStepIcon = React.useCallback((state: RenameState, isActive: boolean, isCompleted: boolean) => {
    const iconClass = cn(
      "h-4 w-4 transition-all duration-300",
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
    const baseSteps = [
      { state: 'validating' as RenameState, label: 'Validating alias name' },
      { state: 'updating_alias' as RenameState, label: 'Updating host alias' },
    ];

    // Add DHCP step if needed (this would be determined from the rename config)
    // For now, we'll include it conditionally based on progress state
    if (progress.state === 'creating_dhcp' || progress.state === 'reconfiguring' || progress.state === 'refreshing_devices') {
      baseSteps.push({ state: 'creating_dhcp' as RenameState, label: 'Creating DHCP reservation' });
    }

    baseSteps.push(
      { state: 'reconfiguring' as RenameState, label: 'Reconfiguring network' },
      { state: 'refreshing_devices' as RenameState, label: 'Refreshing devices' }
    );

    baseSteps.push({ state: 'success' as RenameState, label: 'Complete' });

    return baseSteps;
  }, [progress.state]);

  const steps = getSteps();
  const currentStepIndex = steps.findIndex(step => step.state === progress.state);
  const isCompleted = progress.state === 'success';
  const hasError = progress.state === 'error';

  // Generate screen reader announcement for current state
  const getScreenReaderMessage = () => {
    const currentStepText = getStepLabel(progress.state);
    const percentage = progressPercentage;
    
    if (progress.state === 'success') {
      return `Device rename completed successfully. ${percentage}% complete.`;
    } else if (progress.state === 'error') {
      return `Device rename failed. ${progress.error?.message || 'Unknown error'}. ${percentage}% complete.`;
    } else {
      return `Device rename in progress. Currently: ${currentStepText}. ${percentage}% complete.`;
    }
  };

  // Minimized state - just show a compact indicator
  if (isMinimized) {
    return (
      <Card className={cn("w-80 shadow-lg border-primary/20", className)}>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {hasError ? (
                <AlertCircle className="h-4 w-4 text-red-600" aria-hidden="true" />
              ) : isCompleted ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
              )}
              <span className="text-sm font-medium truncate">
                {deviceName && newAliasName ? (
                  <span>
                    Renaming <span className="font-mono">{deviceName}</span> → <span className="font-mono">{newAliasName}</span>
                  </span>
                ) : (
                  progress.stepMessage
                )}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {!isCompleted && !hasError && (
                <Badge variant="secondary" className="text-xs">
                  {progressPercentage}%
                </Badge>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={onMinimize}
                className="h-6 w-6 p-0"
                ref={expandButtonRef}
                aria-label="Expand progress details"
              >
                <Maximize2 className="h-3 w-3" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Full expanded state
  return (
    <>
      <Card className={cn("w-96 shadow-lg border-primary/20", className)}>
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {hasError ? (
                <AlertCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
              ) : isCompleted ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
              )}
              <span className="font-medium">
                {hasError ? 'Rename Failed' : isCompleted ? 'Rename Complete' : 'Renaming Device'}
              </span>
            </div>
            {onMinimize && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onMinimize}
                className="h-6 w-6 p-0"
                ref={minimizeButtonRef}
                aria-label="Minimize progress details"
              >
                <Minimize2 className="h-3 w-3" aria-hidden="true" />
              </Button>
            )}
          </div>

          {/* Device names */}
          {deviceName && newAliasName && (
            <div className="mb-4 p-2 bg-muted/50 rounded-md">
              <div className="text-sm text-muted-foreground mb-1">Renaming:</div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm bg-background px-2 py-1 rounded border">
                  {deviceName}
                </span>
                <span className="text-muted-foreground">→</span>
                <span className="font-mono text-sm bg-background px-2 py-1 rounded border">
                  {newAliasName}
                </span>
              </div>
            </div>
          )}

          {/* Progress Bar */}
          <div
            className="space-y-2 mb-4"
            role="progressbar"
            aria-valuenow={progressPercentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Rename operation progress: ${progressPercentage}% complete`}
          >
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{progress.stepMessage}</span>
              <span aria-live="polite" aria-atomic="true">{progressPercentage}%</span>
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

          {/* Step indicators */}
          <div className="flex items-center justify-between mb-4" role="list" aria-label="Rename operation steps">
            {steps.map((step, index) => {
              const isActive = index === currentStepIndex;
              const isStepCompleted = index < currentStepIndex || isCompleted;
              const isError = hasError && index === currentStepIndex;

              return (
                <div
                  key={step.state}
                  className={cn(
                    "flex flex-col items-center gap-1",
                    index < steps.length - 1 && "flex-1"
                  )}
                  role="listitem"
                  aria-label={`${getStepLabel(step.state)} - ${isActive ? 'current' : isStepCompleted ? 'completed' : 'pending'}`}
                >
                  <div className={cn(
                    "flex items-center justify-center w-6 h-6 rounded-full border-2 transition-all duration-200",
                    isActive && "border-primary bg-primary/10",
                    isStepCompleted && !isActive && "border-green-600 bg-green-50 dark:bg-green-950",
                    isError && "border-red-600 bg-red-50 dark:bg-red-950",
                    !isActive && !isStepCompleted && !isError && "border-muted-foreground bg-background"
                  )}>
                    {getStepIcon(step.state, isActive, isStepCompleted)}
                  </div>
                  <span className={cn(
                    "text-xs text-center hidden sm:block",
                    isActive && "text-primary font-medium",
                    isStepCompleted && !isActive && "text-green-700 dark:text-green-300",
                    isError && "text-red-600",
                    !isActive && !isStepCompleted && !isError && "text-muted-foreground"
                  )}>
                    {getStepLabel(step.state)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Error details */}
          {hasError && progress.error && (
            <div
              className="space-y-2 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md mb-4"
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" aria-hidden="true" />
                <span className="font-medium text-red-800 dark:text-red-200 text-sm">
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
          <div className="flex justify-end gap-2">
            {hasError && onRetry && (
              <Button
                onClick={onRetry}
                variant="default"
                size="sm"
                className="flex items-center gap-2"
                ref={retryButtonRef}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Retry
              </Button>
            )}
            {progress.canCancel && !hasError && (
              <Button
                onClick={onCancel}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                ref={cancelButtonRef}
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Cancel
              </Button>
            )}
            {isCompleted && (
              <Button
                onClick={() => {
                  // Auto-dismiss after completion - parent will handle this
                  if (onCancel) onCancel();
                }}
                variant="default"
                size="sm"
                className="flex items-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Dismiss
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Screen reader announcements */}
      <div
        aria-live={progress.state === 'error' ? 'assertive' : 'polite'}
        aria-atomic="true"
        className="sr-only"
      >
        {getScreenReaderMessage()}
      </div>
    </>
  );
}

/**
 * Hook for managing inline progress state
 */
export function useInlineProgress() {
  const [isVisible, setIsVisible] = React.useState(false);
  const [isMinimized, setIsMinimized] = React.useState(false);
  const [progress, setProgress] = React.useState<RenameProgress>({
    state: 'idle',
    currentStep: 0,
    totalSteps: 5,
    stepMessage: 'Ready to rename device',
    canCancel: true,
  });

  const show = React.useCallback(() => {
    setIsVisible(true);
    setIsMinimized(false);
  }, []);

  const hide = React.useCallback(() => {
    setIsVisible(false);
    setIsMinimized(false);
  }, []);

  const minimize = React.useCallback(() => {
    setIsMinimized(true);
  }, []);

  const expand = React.useCallback(() => {
    setIsMinimized(false);
  }, []);

  const updateProgress = React.useCallback((newProgress: RenameProgress) => {
    setProgress(newProgress);
  }, []);

  return {
    isVisible,
    isMinimized,
    progress,
    show,
    hide,
    minimize,
    expand,
    updateProgress,
  };
}