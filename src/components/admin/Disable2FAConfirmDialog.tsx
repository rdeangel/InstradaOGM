import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertTriangle } from 'lucide-react';
import { ClientOnly } from '@/components/util/ClientOnly';

interface Disable2FAConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  userName: string;
  isProcessing: boolean;
}

export function Disable2FAConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  userName,
  isProcessing,
}: Disable2FAConfirmDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setConfirmText('');
      setError(null);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (confirmText !== 'CONFIRM') {
      setError('Please type "CONFIRM" exactly as shown to proceed.');
      return;
    }

    setError(null);
    try {
      await onConfirm();
      // Dialog will be closed by parent component after successful confirmation
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable 2FA');
    }
  };

  const isConfirmButtonEnabled = confirmText === 'CONFIRM' && !isProcessing;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClientOnly>
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </ClientOnly>
            Disable 2FA for User
          </DialogTitle>
          <DialogDescription>
            This action will disable Two-Factor Authentication for <strong>{userName}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert variant="destructive">
            <ClientOnly>
              <AlertTriangle className="h-4 w-4" />
            </ClientOnly>
            <AlertDescription>
              <strong>Warning:</strong> This will remove all 2FA protection from this user&apos;s account. 
              The user will be able to log in with only their password until they re-enable 2FA.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="confirm-text">
              Type <strong>CONFIRM</strong> to proceed:
            </Label>
            <Input
              id="confirm-text"
              type="text"
              value={confirmText}
              onChange={(e) => {
                setConfirmText(e.target.value);
                setError(null);
              }}
              placeholder="Type CONFIRM here"
              disabled={isProcessing}
              autoComplete="off"
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isConfirmButtonEnabled}
          >
            {isProcessing ? (
              <>
                <ClientOnly>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                </ClientOnly>
                Disabling...
              </>
            ) : (
              'Disable 2FA'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

