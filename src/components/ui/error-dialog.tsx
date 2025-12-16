'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertTriangle,
  RefreshCw,
  X,
  ExternalLink,
  Mail,
  Shield,
  Wifi,
  Settings,
  Clock
} from 'lucide-react';
import { ErrorType, RecoveryAction } from '@/lib/rename-state';

interface ErrorDialogProps {
  isOpen: boolean;
  errorType: ErrorType;
  errorMessage: string;
  errorDetails?: string;
  recoveryActions?: RecoveryAction[];
  onClose?: () => void;
  onRetry?: () => void;
  deviceName?: string;
  operation?: string;
}

/**
 * ErrorDialog component for displaying detailed error information with recovery actions
 * Provides contextual help and recovery options based on error type
 */
export function ErrorDialog({
  isOpen,
  errorType,
  errorMessage,
  errorDetails,
  recoveryActions = [],
  onClose,
  onRetry,
  deviceName,
  operation = 'rename operation',
}: ErrorDialogProps) {
  const getErrorIcon = React.useCallback((type: ErrorType) => {
    const iconClass = "h-6 w-6 text-red-600";
    
    switch (type) {
      case 'validation':
        return <Shield className={iconClass} />;
      case 'network':
        return <Wifi className={iconClass} />;
      case 'permission':
        return <AlertTriangle className={iconClass} />;
      case 'conflict':
        return <AlertTriangle className={iconClass} />;
      case 'timeout':
        return <Clock className={iconClass} />;
      case 'unknown':
      default:
        return <AlertTriangle className={iconClass} />;
    }
  }, []);

  const getErrorTitle = React.useCallback((type: ErrorType) => {
    switch (type) {
      case 'validation':
        return 'Validation Error';
      case 'network':
        return 'Network Error';
      case 'permission':
        return 'Permission Error';
      case 'conflict':
        return 'Conflict Error';
      case 'timeout':
        return 'Timeout Error';
      case 'unknown':
      default:
        return 'Unknown Error';
    }
  }, []);

  const getErrorDescription = React.useCallback((type: ErrorType) => {
    switch (type) {
      case 'validation':
        return 'The provided information is not valid. Please check your input and try again.';
      case 'network':
        return 'A network error occurred while communicating with the server. Please check your connection and try again.';
      case 'permission':
        return 'You do not have sufficient permissions to perform this operation. Please contact your administrator.';
      case 'conflict':
        return 'A conflict occurred with existing data. The operation may have been completed by another user.';
      case 'timeout':
        return 'The operation took too long to complete. Please try again or contact support if the issue persists.';
      case 'unknown':
      default:
        return 'An unexpected error occurred. Please try again or contact support if the issue persists.';
    }
  }, []);

  const getTroubleshootingSteps = React.useCallback((type: ErrorType) => {
    switch (type) {
      case 'validation':
        return [
          'Check that the alias name contains only valid characters (letters, numbers, underscores)',
          'Ensure the alias name starts with a letter or underscore',
          'Verify the alias name is less than 32 characters',
          'Make sure the alias name is not already in use',
        ];
      case 'network':
        return [
          'Check your internet connection',
          'Verify you can access other network resources',
          'Try refreshing the page',
          'Check if the server is accessible',
        ];
      case 'permission':
        return [
          'Verify you are logged in with the correct account',
          'Check if your account has the necessary permissions',
          'Contact your administrator for access',
          'Ensure your session has not expired',
        ];
      case 'conflict':
        return [
          'Refresh the device list to see current state',
          'Check if another user made changes recently',
          'Try the operation again with updated information',
          'Contact support if conflicts persist',
        ];
      case 'timeout':
        return [
          'Check your network connection speed',
          'Try again during off-peak hours',
          'Reduce the number of operations at once',
          'Contact support if timeouts persist',
        ];
      case 'unknown':
      default:
        return [
          'Try refreshing the page',
          'Check your browser console for additional error details',
          'Attempt the operation again',
          'Contact support with error details',
        ];
    }
  }, []);

  const troubleshootingSteps = getTroubleshootingSteps(errorType);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {getErrorIcon(errorType)}
            <span>{getErrorTitle(errorType)}</span>
          </DialogTitle>
          <DialogDescription>
            {deviceName && (
              <span className="block mb-2">
                Error occurred during {operation} for device: <span className="font-mono bg-muted px-1 py-0.5 rounded text-sm">{deviceName}</span>
              </span>
            )}
            <span className="text-sm">{getErrorDescription(errorType)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Error Message */}
          <Alert className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800 dark:text-red-200">
              <div className="font-medium mb-1">Error Details:</div>
              <div className="text-sm">{errorMessage}</div>
              {errorDetails && (
                <div className="text-xs mt-2 text-red-600 dark:text-red-400">
                  Technical details: {errorDetails}
                </div>
              )}
            </AlertDescription>
          </Alert>

          {/* Troubleshooting Steps */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Troubleshooting Steps:</span>
            </div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {troubleshootingSteps.map((step, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Recovery Actions */}
          {recoveryActions.length > 0 && (
            <div className="space-y-2">
              <div className="font-medium text-sm">Recovery Actions:</div>
              <div className="flex flex-wrap gap-2">
                {recoveryActions.map((action, index) => (
                  <Button
                    key={index}
                    variant={action.variant === 'destructive' ? 'destructive' : 
                              action.variant === 'primary' ? 'default' : 'outline'}
                    size="sm"
                    onClick={action.action}
                    className="flex items-center gap-2"
                  >
                    {action.label === 'Retry' && <RefreshCw className="h-4 w-4" />}
                    {action.label === 'Check Connection' && <Wifi className="h-4 w-4" />}
                    {action.label === 'Contact Administrator' && <Mail className="h-4 w-4" />}
                    {action.label === 'Check Alias Name' && <Settings className="h-4 w-4" />}
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Additional Help */}
          <div className="space-y-2 p-3 bg-muted/30 rounded-md">
            <div className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Additional Help:</span>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div>
                <Button
                  variant="link"
                  className="h-auto p-0 text-primary"
                  onClick={() => window.open('/docs/troubleshooting', '_blank')}
                >
                  View Troubleshooting Documentation
                </Button>
              </div>
              <div>
                <Button
                  variant="link"
                  className="h-auto p-0 text-primary"
                  onClick={() => window.open('mailto:support@example.com?subject=Device%20Rename%20Error', '_blank')}
                >
                  Contact Support
                </Button>
              </div>
            </div>
          </div>

          {/* Error Type Badge */}
          <div className="flex items-center justify-between pt-2 border-t">
            <Badge variant="secondary" className="text-xs">
              Error Type: {errorType}
            </Badge>
            <div className="text-xs text-muted-foreground">
              Error ID: {Date.now().toString(36)}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2">
            {onRetry && (
              <Button
                onClick={onRetry}
                variant="default"
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Retry Operation
              </Button>
            )}
            <Button
              onClick={onClose}
              variant="outline"
              className="flex items-center gap-2"
            >
              <X className="h-4 w-4" />
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook for managing error dialog state
 */
export function useErrorDialog() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [errorType, setErrorType] = React.useState<ErrorType>('unknown');
  const [errorMessage, setErrorMessage] = React.useState('');
  const [errorDetails, setErrorDetails] = React.useState<string>();
  const [recoveryActions, setRecoveryActions] = React.useState<RecoveryAction[]>([]);
  const [deviceName, setDeviceName] = React.useState<string>();
  const [operation, setOperation] = React.useState<string>('rename operation');

  const showError = React.useCallback((
    type: ErrorType,
    message: string,
    details?: string,
    actions?: RecoveryAction[],
    device?: string,
    op?: string
  ) => {
    setErrorType(type);
    setErrorMessage(message);
    setErrorDetails(details);
    setRecoveryActions(actions || []);
    setDeviceName(device);
    setOperation(op || 'rename operation');
    setIsOpen(true);
  }, []);

  const hideError = React.useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    errorType,
    errorMessage,
    errorDetails,
    recoveryActions,
    deviceName,
    operation,
    showError,
    hideError,
  };
}