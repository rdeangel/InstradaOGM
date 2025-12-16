import React, { useState, useEffect } from 'react';
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
import { Loader2 } from 'lucide-react';

interface RenameBackupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentFilename: string;
  onRename: (newFilename: string) => Promise<void>;
  isLoading: boolean;
}

export function RenameBackupDialog({
  isOpen,
  onClose,
  currentFilename,
  onRename,
  isLoading,
}: RenameBackupDialogProps) {
  const [newFilename, setNewFilename] = useState('');
  const [originalFilename, setOriginalFilename] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Remove the file extension for editing (e.g., "backup_2024_01_01.sqlite.aes" -> "backup_2024_01_01")
      const nameWithoutExtension = currentFilename.replace(/\.[^.]*\.[^.]*$/, ''); // Remove last two extensions
      setNewFilename(nameWithoutExtension);
      setOriginalFilename(nameWithoutExtension);
      setError(null);
    }
  }, [isOpen, currentFilename]);

  const handleSubmit = async () => {
    // Basic validation
    const trimmedFilename = newFilename.trim();
    if (!trimmedFilename) {
      setError('Filename is required.');
      return;
    }

    // Validate filename (no special characters that could cause issues)
    if (trimmedFilename.includes('/') || trimmedFilename.includes('\\') || trimmedFilename.includes('..')) {
      setError('Filename contains invalid characters.');
      return;
    }

    setError(null);
    await onRename(trimmedFilename);
  };

  // Check if the filename has changed
  const hasChanged = newFilename.trim() !== originalFilename;

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rename Backup</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Enter a new name for the backup file:</p>
              <pre className="text-sm bg-muted p-2 rounded whitespace-pre-wrap break-all w-full overflow-hidden" style={{ wordBreak: 'break-all', overflowWrap: 'anywhere', maxWidth: '100%' }}>{currentFilename}</pre>
              <p>The system will automatically maintain the appropriate file extension and db type.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="new-backup-name" className="text-right">
              New Name
            </Label>
            <div className="col-span-3">
              <Input
                id="new-backup-name"
                value={newFilename}
                onChange={(e) => setNewFilename(e.target.value)}
                className="flex-1"
                autoFocus
                disabled={isLoading}
              />
              {error && (
                <p className="text-sm text-red-500 mt-1">{error}</p>
              )}
            </div>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleSubmit}
            disabled={isLoading || !newFilename.trim() || !hasChanged}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Renaming...
              </>
            ) : (
              'Rename'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
