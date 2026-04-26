'use client';

import React, { useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  X,
  RefreshCw,
  Zap,
  Database,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BulkOperationProgress,
  getOperationTypeLabel,
  getOperationTypeDescription,
} from '@/lib/bulk-operation-state';

interface BulkOperationProgressModalProps {
  isOpen: boolean;
  progress: BulkOperationProgress;
  onCancel?: () => void;
  onRetry?: () => void;
  groupName?: string;
  targetGroupName?: string;
}

/**
 * ProgressModal component for showing bulk operation progress
 * Displays progress for multiple hosts being processed with detailed feedback
 */
export function BulkOperationProgressModal({
  isOpen,
  progress,
  onCancel,
  onRetry,
  groupName,
  targetGroupName,
}: BulkOperationProgressModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const retryButtonRef = useRef<HTMLButtonElement>(null);

  // Focus management for dialog
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (progress.state === 'error' && retryButtonRef.current) {
          retryButtonRef.current.focus();
        } else if (cancelButtonRef.current) {
          cancelButtonRef.current.focus();
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [isOpen, progress.state]);

  const isCompleted = progress.state === 'success';
  const hasError = progress.state === 'error';
  const operationLabel = getOperationTypeLabel(progress.operationType);
  const operationDescription = getOperationTypeDescription(progress.operationType, progress.itemLabel);
  const itemPlural = progress.itemLabel !== 'host' ? `${progress.itemLabel}es` : `${progress.itemLabel}s`;

  return (
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
        className="sm:max-w-2xl"
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
              {hasError
                ? `${operationLabel} Failed`
                : isCompleted
                  ? `${operationLabel} Complete`
                  : `${operationLabel} in Progress`}
            </span>
          </DialogTitle>
          <DialogDescription id="progress-description">
            <span className="block mb-2">{operationDescription}</span>
            {groupName && (
              <span className="block text-sm">
                Group: <span className="font-mono bg-muted px-1 py-0.5 rounded">{groupName}</span>
                {targetGroupName && (
                  <>
                    {' → '}
                    <span className="font-mono bg-muted px-1 py-0.5 rounded">{targetGroupName}</span>
                  </>
                )}
              </span>
            )}
            <span
              className={cn(
                'text-sm block mt-2',
                hasError && 'text-red-600',
                isCompleted && 'text-green-600'
              )}
            >
              {progress.stepMessage}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Operation Type and Summary */}
          <div className="space-y-2 p-3 bg-muted rounded-md">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Operation:</span>
              <span className="text-sm font-mono bg-background px-2 py-1 rounded">
                {getOperationTypeLabel(progress.operationType)}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Processing {progress.totalHosts} {progress.totalHosts !== 1 ? itemPlural : progress.itemLabel}
            </div>
          </div>

          {/* Indeterminate Progress Bar - Shows activity without tracking */}
          <div className="space-y-2">
            <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
              {isCompleted ? (
                <div className="h-full w-full bg-green-500 transition-all duration-300" />
              ) : hasError ? (
                <div className="h-full w-full bg-red-500 transition-all duration-300" />
              ) : (
                <div
                  className="h-full w-1/3 bg-blue-500 rounded-full"
                  style={{
                    animation: 'indeterminate 1.5s infinite',
                  }}
                />
              )}
            </div>
          </div>

          {/* Host Count Info */}
          <div className="text-sm text-muted-foreground">
            Processing {progress.totalHosts} {progress.totalHosts !== 1 ? itemPlural : progress.itemLabel}
          </div>

          {/* Operation Steps */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Steps</div>
            <div className="flex flex-col gap-2">
              {[
                { state: 'validating', label: `Validating ${itemPlural}`, icon: AlertCircle },
                { state: 'processing', label: `Processing ${itemPlural}`, icon: Zap },
                { state: 'reconfiguring', label: 'Reconfiguring network', icon: RefreshCw },
                { state: 'refreshing', label: 'Refreshing data', icon: Database },
              ].map(({ state, label, icon: Icon }) => {
                const stateIndex = ['validating', 'processing', 'reconfiguring', 'refreshing'].indexOf(state);
                const currentStateIndex = ['validating', 'processing', 'reconfiguring', 'refreshing'].indexOf(progress.state);
                const isActive = stateIndex === currentStateIndex;
                const isStepCompleted = stateIndex < currentStateIndex || isCompleted;

                return (
                  <div
                    key={state}
                    className={cn(
                      'flex items-center gap-3 p-2 rounded-md transition-all duration-200',
                      isActive && 'bg-primary/10 border border-primary/20',
                      isStepCompleted && !isActive && 'bg-green-50 dark:bg-green-950'
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4',
                        isActive && 'animate-spin text-primary',
                        isStepCompleted && !isActive && 'text-green-600'
                      )}
                      aria-hidden="true"
                    />
                    <span
                      className={cn(
                        'text-sm font-medium',
                        isActive && 'text-primary',
                        isStepCompleted && !isActive && 'text-green-700 dark:text-green-300'
                      )}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>



          {/* Results Summary - Placeholder always present to prevent layout shift */}
          <div className={cn(
            "space-y-2 p-3 border rounded-md transition-colors duration-300 min-h-[60px] flex items-center",
            isCompleted
              ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
              : "bg-muted/30 border-muted"
          )}>
            {isCompleted ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-900 dark:text-green-100">Operation Complete</span>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Processing...</div>
            )}
          </div>

          {/* Error details */}
          {hasError && progress.error && (
            <div className="space-y-3 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="font-medium text-red-800 dark:text-red-200">Error</span>
              </div>
              <p className="text-sm text-red-700 dark:text-red-300">{progress.error.message}</p>
              {progress.error.details && (
                <p className="text-xs text-red-600 dark:text-red-400">{progress.error.details}</p>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-2">
            {hasError && onRetry && (
              <Button onClick={onRetry} variant="default" className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            )}
            {progress.canCancel && !hasError && (
              <Button onClick={onCancel} variant="outline" className="flex items-center gap-2">
                <X className="h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook for managing bulk operation progress modal state
 */
export function useBulkOperationProgressModal() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [progress, setProgress] = React.useState<BulkOperationProgress>({
    state: 'idle',
    operationType: 'assign',
    totalHosts: 0,
    itemLabel: 'host',
    currentStep: 0,
    totalSteps: 0,
    stepMessage: 'Ready',
    canCancel: true,
  });

  const openModal = React.useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeModal = React.useCallback(() => {
    setIsOpen(false);
  }, []);

  const updateProgress = React.useCallback((newProgress: BulkOperationProgress) => {
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

