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
import { Loader2, Download } from 'lucide-react';

interface CreateBackupDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  defaultFilename: string;
  onCreateBackup: (filename: string) => Promise<void>;
  isLoading: boolean;
}

export function CreateBackupDialog({
  isOpen,
  onOpenChange,
  defaultFilename,
  onCreateBackup,
  isLoading,
}: CreateBackupDialogProps) {
  const [filename, setFilename] = useState(defaultFilename);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFilename(defaultFilename);
      setError(null);
    }
  }, [isOpen, defaultFilename]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    const trimmedFilename = filename.trim();
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
    await onCreateBackup(trimmedFilename);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Database Backup</DialogTitle>
          <DialogDescription>
            Enter a name for your backup file. The system will automatically add a timestamp and the appropriate file extension.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="backup-filename">Backup Filename</Label>
              <Input
                id="backup-filename"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="Enter backup filename"
                disabled={isLoading}
                autoFocus
              />
              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !filename.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Create Backup
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
