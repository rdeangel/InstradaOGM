import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Database, Trash2, Loader2, Edit } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface BackupVersion {
  name: string;
  size: number;
  lastModified: string;
}

interface BackupVersionCardProps {
  backup: BackupVersion;
  isLoadingRestore: boolean;
  isRenamingBackup: boolean;
  handleRestoreFromServerFile: (filename: string) => void;
  handleDeleteBackup: (filename: string) => void;
  handleRenameBackup: (filename: string) => void;
  databaseType: string;
}

import { useIsMobile } from '@/hooks/use-mobile'; // Import useIsMobile hook
import { cn } from '@/lib/utils'; // Import cn for conditional class names

export function BackupVersionCard({
  backup,
  isLoadingRestore,
  isRenamingBackup,
  handleRestoreFromServerFile,
  handleDeleteBackup,
  handleRenameBackup,
  databaseType,
}: BackupVersionCardProps) {
  const isMobile = useIsMobile(); // Initialize useIsMobile hook

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-semibold break-all">{backup.name}</CardTitle>
        <CardDescription>{(backup.size / (1024 * 1024)).toFixed(2)} MB</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-sm text-muted-foreground">
          Last Modified: {new Date(backup.lastModified).toLocaleString()}
        </div>
        <div className="flex justify-end space-x-2">
          <Button variant="outline" size={isMobile ? "icon" : "sm"} asChild>
            <a href={`/api/settings/backup/versions/${backup.name}`} download>
              <Download className={cn("h-4 w-4", !isMobile && "mr-2")} />
              {!isMobile && "Download"}
            </a>
          </Button>
          <Button
            variant="outline"
            size={isMobile ? "icon" : "sm"}
            onClick={() => handleRenameBackup(backup.name)}
            disabled={isRenamingBackup}
          >
            {isRenamingBackup ? <Loader2 className={cn("h-4 w-4", !isMobile && "mr-2", "animate-spin")} /> : <Edit className={cn("h-4 w-4", !isMobile && "mr-2")} />}
            {!isMobile && "Rename"}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size={isMobile ? "icon" : "sm"} disabled={isLoadingRestore}>
                {isLoadingRestore ? <Loader2 className={cn("h-4 w-4", !isMobile && "mr-2", "animate-spin")} /> : <Database className={cn("h-4 w-4", !isMobile && "mr-2")} />}
                {!isMobile && "Restore"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-md overflow-x-hidden">
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Database Restore</AlertDialogTitle>
                <div className="text-sm text-muted-foreground space-y-2 w-full">
                  <p>This will permanently overwrite your current database with the backup file:</p>
                  <pre className="font-bold text-sm bg-muted p-2 rounded whitespace-pre-wrap break-all w-full overflow-hidden" style={{ wordBreak: 'break-all', overflowWrap: 'anywhere', maxWidth: '100%' }}>{backup.name}</pre>
                  <p>This action cannot be undone.</p>
                  {databaseType === 'SQLite' && (
                    <div className="pt-2 border-t">
                      <p className="font-semibold text-amber-600 dark:text-amber-500">⚠️ Application Restart Required</p>
                      <p className="text-xs mt-1">The application will automatically restart after the restore completes.</p>
                    </div>
                  )}
                </div>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleRestoreFromServerFile(backup.name)}>
                  Restore
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size={isMobile ? "icon" : "sm"} className="text-red-500 hover:text-red-700">
                <Trash2 className={cn("h-4 w-4", !isMobile && "mr-2")} />
                {!isMobile && "Delete"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete the backup file: <span className="font-bold">{backup.name}</span>? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDeleteBackup(backup.name)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}