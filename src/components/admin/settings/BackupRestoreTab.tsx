'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { logger } from '@/lib/logger';
import { Loader2, Download, Upload, Database, AlertCircle, Trash2, Edit } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SortableTable } from "@/components/ui/sortable-table";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';

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
import { BackupVersionCard } from './BackupVersionCard'; // Import the new card component
import { CreateBackupDialog } from './CreateBackupDialog'; // Import the create backup dialog
import { RenameBackupDialog } from './RenameBackupDialog'; // Import the rename backup dialog
import { useIsMobile, useIsPhone } from '@/hooks/use-mobile'; // Import useIsMobile hook
import { PaginationControls } from "@/components/ui/pagination-controls";
import { cn } from '@/lib/utils'; // Import cn for conditional class names
import { useUIConfig } from '@/context/UIConfigContext'; // Import UIConfig context

export interface BackupVersion {
  name: string;
  size: number;
  lastModified: string;
}

interface BackupRestoreTabProps {
  backupFiles: BackupVersion[];
  isLoadingInitialData: boolean;
  backupRestoreError: string | null;
  onSilentRefresh: () => void;
  sortBy: string;
  sortDirection: 'asc' | 'desc';
  onSortChange: (newSortBy: string, newSortDirection: 'asc' | 'desc') => void;
  // Add pagination props
  currentPage: number;
  pageSize: number | 'ALL';
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number | 'ALL') => void;
}

export function BackupRestoreTab({
  backupFiles,
  isLoadingInitialData,
  backupRestoreError,
  onSilentRefresh,
  sortBy,
  sortDirection,
  onSortChange,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: BackupRestoreTabProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile(); // Initialize useIsMobile hook
  const isPhone = useIsPhone();
  const { uiConfig } = useUIConfig(); // Get UI config for subtitle
  const [isLoadingBackup, setIsLoadingBackup] = useState(false);
  const [isLoadingRestore, setIsLoadingRestore] = useState<string | null>(null);
  const [isUploadingBackup, setIsUploadingBackup] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isRenamingBackup, setIsRenamingBackup] = useState<string | null>(null);
  const [isCreateBackupDialogOpen, setIsCreateBackupDialogOpen] = useState(false);
  const [isRenameBackupDialogOpen, setIsRenameBackupDialogOpen] = useState(false);
  const [backupToRename, setBackupToRename] = useState<string | null>(null);
  const [isButtonRefreshing, setIsButtonRefreshing] = useState(false);
  const [databaseType, setDatabaseType] = useState<string>('Unknown');
  const fileInputRef = React.useRef<HTMLInputElement>(null); // Ref for hidden file input

  // Pagination logic
  const totalItems = backupFiles.length;
  const totalPages = pageSize === 'ALL' ? 1 : Math.ceil(totalItems / pageSize);

  const paginatedBackupFiles = useMemo(() => {
    if (pageSize === 'ALL') {
      return backupFiles;
    }

    if (isPhone) {
      return backupFiles.slice(0, currentPage * pageSize);
    }

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return backupFiles.slice(startIndex, endIndex);
  }, [backupFiles, currentPage, pageSize, isPhone]);



  // Fetch database type on mount
  useEffect(() => {
    const fetchDatabaseType = async () => {
      try {
        const response = await fetch('/api/admin/db-info');
        if (response.ok) {
          const data = await response.json();
          setDatabaseType(data.databaseType || 'Unknown');
        }
      } catch (error) {
        logger.error('Error fetching database type:', error);
      }
    };
    fetchDatabaseType();
  }, []);

  // Reset to first page when data length changes or when current page is greater than total pages
  useEffect(() => {
    if (totalPages === 0 && currentPage !== 1) {
      onPageChange(1);
    } else if (currentPage > totalPages && totalPages > 0) {
      onPageChange(1);
    }
  }, [backupFiles.length, currentPage, totalPages, onPageChange]);

  const handleCreateBackup = () => {
    // Show the create backup dialog instead of creating immediately
    setIsCreateBackupDialogOpen(true);
  };

  const handleCreateBackupWithFilename = async (filename: string) => {
    setIsLoadingBackup(true);
    try {
      const formData = new FormData();
      formData.append('action', 'backup');
      formData.append('filename', filename);

      const response = await fetch('/api/settings/backup', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create backup.');
        } else {
          const errorText = await response.text();
          throw new Error(errorText || `Failed to create backup with status: ${response.status}`);
        }
      }
      // Assuming the response is JSON with a success message and filename
      const data = await response.json();
      toast({
        title: 'Backup Successful',
        description: `Database backup created and stored on server: ${data.filename}`,
        variant: 'success',
      });
      onSilentRefresh(); // Refresh the list of backup versions
      setIsCreateBackupDialogOpen(false); // Close the dialog
    } catch (error) {
      logger.error('Error creating backup:', error);
      toast({
        title: 'Error',
        description: 'Failed to create database backup. Please check server logs for details.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingBackup(false);
    }
  };

  const handleRestoreFromServerFile = async (filename: string) => {
    logger.debug(`[DEBUG] Attempting to restore from server file: ${filename}`);
    setIsLoadingRestore(filename);
    try {
      const formData = new FormData();
      formData.append('action', 'restore');
      formData.append('filename', filename);

      logger.debug(`[DEBUG] Sending restore request for filename: ${filename}`);
      const response = await fetch('/api/settings/backup', {
        method: 'POST',
        body: formData,
      });

      logger.debug(`[DEBUG] Restore response status: ${response.status}`); // New log
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          logger.error('[DEBUG] Restore API JSON error:', errorData); // New log
          throw new Error(errorData.error || `Failed to restore database from ${filename}.`);
        } else {
          const errorText = await response.text();
          logger.error('[DEBUG] Restore API text error:', errorText); // New log
          throw new Error(errorText || `Failed to restore database with status: ${response.status}`);
        }
      }

      toast({
        title: 'Restore Successful',
        description: `Database restored successfully from ${filename}.`,
        variant: 'success',
      });
      // Optionally, refresh the page or relevant data after restore
    } catch (error) {
      logger.error('Error restoring from server file:', error);
      toast({
        title: 'Error',
        description: `Failed to restore database from ${filename}. Please check server logs for details.`,
        variant: 'destructive',
      });
    } finally {
      setIsLoadingRestore(null);
    }
  };

  const handleUploadBackup = async (file: File) => {
    setIsUploadingBackup(true);
    setUploadProgress(0);

    const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks (safely under 10MB limit)
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const filename = file.name;

    try {
      // Upload each chunk
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('filename', filename);
        formData.append('chunkIndex', chunkIndex.toString());
        formData.append('totalChunks', totalChunks.toString());

        const response = await fetch('/api/settings/backup/versions/upload-chunk', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Failed to upload chunk' }));

          // Cleanup partial upload on error
          await fetch('/api/settings/backup/versions/upload-chunk', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename }),
          }).catch(() => {
            // Ignore cleanup errors
          });

          throw new Error(errorData.error || `Failed to upload chunk ${chunkIndex + 1}/${totalChunks}`);
        }

        // Update progress based on chunks uploaded
        const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
        setUploadProgress(progress);
      }

      // All chunks uploaded successfully
      toast({
        title: 'Upload Successful',
        description: 'Backup file uploaded to server successfully.',
        variant: 'success',
      });
      onSilentRefresh(); // Refresh the list of backup versions
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload backup file.';
      logger.error('Error uploading backup file:', errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsUploadingBackup(false);
      setUploadProgress(0);
    }
  };

  const validateBackupFile = (file: File): { valid: boolean; error?: string } => {
    // Check file extension
    if (!file.name.endsWith('.aes')) {
      return {
        valid: false,
        error: `Invalid file type. Only .aes files are allowed. You selected: ${file.name}`
      };
    }

    // Check file size (warn if > 1GB, but allow it)
    const maxSize = 1024 * 1024 * 1024; // 1GB in bytes
    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File is too large. Maximum size is 1GB. Your file is ${(file.size / (1024 * 1024 * 1024)).toFixed(2)}GB.`
      };
    }

    // Check minimum file size (backup files should be at least a few KB)
    const minSize = 1024; // 1KB minimum
    if (file.size < minSize) {
      return {
        valid: false,
        error: `File is too small. Backup files should be at least 1KB.`
      };
    }

    return { valid: true };
  };

  const handleFileSelectAndUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files ? event.target.files[0] : null;
    if (file) {
      // Validate file before upload
      const validation = validateBackupFile(file);
      if (!validation.valid) {
        toast({
          title: 'Invalid File',
          description: validation.error,
          variant: 'destructive',
        });
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      handleUploadBackup(file);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    try {
      const response = await fetch(`/api/settings/backup/versions/${filename}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to delete backup file: ${filename}.`);
        } else {
          const errorText = await response.text();
          throw new Error(errorText || `Failed to delete backup file with status: ${response.status}`);
        }
      }

      toast({
        title: 'Deletion Successful',
        description: `Backup file ${filename} deleted successfully.`,
        variant: 'success',
      });
      onSilentRefresh(); // In-place update
    } catch (error) {
      logger.error('Error deleting backup file:', error);
      toast({
        title: 'Error',
        description: (error as Error).message || `Failed to delete backup file ${filename}.`,
        variant: 'destructive',
      });
    } finally {
      // No need to set isLoadingDelete to false here as it's not a state variable
    }
  };

  const handleRenameBackup = (filename: string) => {
    setBackupToRename(filename);
    setIsRenameBackupDialogOpen(true);
  };

  const handleRenameBackupWithFilename = async (newFilename: string) => {
    if (!backupToRename) return;

    setIsRenamingBackup(backupToRename);
    try {
      const response = await fetch(`/api/settings/backup/versions/${encodeURIComponent(backupToRename)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newFilename }),
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to rename backup.');
        } else {
          const errorText = await response.text();
          throw new Error(errorText || `Failed to rename backup with status: ${response.status}`);
        }
      }

      const data = await response.json();
      toast({
        title: 'Backup Renamed',
        description: `Backup file renamed to: ${data.newFilename}`,
        variant: 'success',
      });
      onSilentRefresh(); // Refresh the list of backup versions
      setIsRenameBackupDialogOpen(false); // Close the dialog
      setBackupToRename(null);
    } catch (error) {
      logger.error('Error renaming backup file:', error);
      toast({
        title: 'Error',
        description: (error as Error).message || `Failed to rename backup file.`,
        variant: 'destructive',
      });
    } finally {
      setIsRenamingBackup(null);
    }
  };

  // Generate default filename for create backup dialog
  // Note: API will automatically add timestamp if no .aes extension is present
  const generateDefaultFilename = () => {
    let filename = 'instrada-ogm';

    // If subtitle is enabled and has text, append sanitized version to filename
    if (uiConfig.subtitleEnabled && uiConfig.subtitleText) {
      // Sanitize subtitle: lowercase, replace spaces with underscores, remove invalid filename characters
      const sanitized = uiConfig.subtitleText
        .toLowerCase()
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/[^a-z0-9_-]/g, ''); // Remove invalid filename characters

      if (sanitized) {
        filename = `${filename}_${sanitized}`;
      }
    }

    return filename;
  };

  return (
    <Card className="flex flex-col flex-1 mb-0 min-h-0">
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0 pb-4">
        <div>
          <CardTitle className="flex items-center text-xl md:text-2xl">
            <Database size={28} className="mr-2 text-primary" /> Backup & Restore
          </CardTitle>
          <CardDescription className="hidden md:block">
            Create, manage, and restore database backups.
          </CardDescription>
        </div>
        <div className="flex w-full justify-end md:w-auto gap-2 flex-col">
          <div className="flex gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelectAndUpload}
              accept=".aes" // Changed accepted file type to .aes
              style={{ display: 'none' }} // Hide the input
            />
            <Button onClick={() => fileInputRef.current?.click()} disabled={isUploadingBackup} size={isMobile ? "icon" : "sm"}>
              {isUploadingBackup ? <Loader2 className={cn("h-4 w-4", !isMobile && "mr-2", "animate-spin")} /> : <Upload className={cn("h-4 w-4", !isMobile && "mr-2")} />}
              {!isMobile && (isUploadingBackup ? `Uploading ${uploadProgress}%` : "Upload Backup")}
            </Button>
            <Button onClick={handleCreateBackup} disabled={isLoadingBackup} size={isMobile ? "icon" : "sm"}>
              {isLoadingBackup ? <Loader2 className={cn("h-4 w-4", !isMobile && "mr-2", "animate-spin")} /> : <Download className={cn("h-4 w-4", !isMobile && "mr-2")} />}
              {!isMobile && "Create Backup"}
            </Button>
          </div>
          {/* Upload Progress Bar */}
          {isUploadingBackup && uploadProgress > 0 && (
            <div className="w-full space-y-1">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">
                {uploadProgress}% uploaded
              </p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-2 md:p-6 pb-8 md:pb-6 relative flex flex-col flex-1 overflow-hidden">
        {/* Removed databaseProvider display as it's not managed here */}

        {isLoadingInitialData ? (
          <div className="space-y-2 mt-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : backupRestoreError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{backupRestoreError}</AlertDescription>
          </Alert>
        ) : backupFiles.length === 0 ? (
          <p className="text-muted-foreground">No backup files found on the server.</p>
        ) : (
          <>
            {isMobile ? (
              // Mobile View: Render as Cards
              <ScrollArea className="flex-1 min-h-0 pr-4">
                <div className="space-y-4">
                  {paginatedBackupFiles.map((backup) => (
                    <BackupVersionCard
                      key={backup.name}
                      backup={backup}
                      isLoadingRestore={isLoadingRestore === backup.name}
                      isRenamingBackup={isRenamingBackup === backup.name}
                      handleRestoreFromServerFile={handleRestoreFromServerFile}
                      handleDeleteBackup={handleDeleteBackup}
                      handleRenameBackup={handleRenameBackup}
                      databaseType={databaseType}
                    />
                  ))}
                </div>
              </ScrollArea>
            ) : (
              // Desktop View: Render as Table
              <ScrollArea className="flex-1 min-h-0 w-full">
                <SortableTable<BackupVersion>
                  data={paginatedBackupFiles}
                  columns={[
                    {
                      key: 'name',
                      label: 'Filename',
                      sortable: true,
                      render: (backup) => <span className="font-medium">{backup.name}</span>,
                    },
                    {
                      key: 'size',
                      label: 'Size',
                      sortable: true,
                      render: (backup) => <span>{(backup.size / (1024 * 1024)).toFixed(2)} MB</span>,
                    },
                    {
                      key: 'lastModified',
                      label: 'Last Modified',
                      sortable: true,
                      render: (backup) => <span>{new Date(backup.lastModified).toLocaleString()}</span>,
                    },
                    {
                      key: 'actions',
                      label: 'Actions',
                      sortable: false,
                      headerClassName: "text-right",
                      render: (backup) => (
                        <div className="text-right space-x-2">
                          <Button variant="outline" size="sm" asChild>
                            <a href={`/api/settings/backup/versions/${backup.name}`} download>
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRenameBackup(backup.name)}
                            disabled={isRenamingBackup === backup.name}
                          >
                            {isRenamingBackup === backup.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit className="h-4 w-4" />}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="sm" disabled={isLoadingRestore === backup.name}>
                                {isLoadingRestore === backup.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirm Database Restore</AlertDialogTitle>
                                <div className="text-sm text-muted-foreground space-y-2 w-full">
                                  <div>This will permanently overwrite your current database with the backup file:</div>
                                  <pre className="font-bold text-sm bg-muted p-2 rounded whitespace-pre-wrap break-all w-full overflow-hidden" style={{ wordBreak: 'break-all', overflowWrap: 'anywhere', maxWidth: '100%' }}>{backup.name}</pre>
                                  <div>This action cannot be undone.</div>
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
                              <Button variant="outline" size="sm" className="text-red-500 hover:text-red-700">
                                <Trash2 className="h-4 w-4" />
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
                      ),
                    },
                  ]}
                  sortBy={sortBy}
                  sortDirection={sortDirection}
                  onSortChange={onSortChange}
                />
              </ScrollArea>
            )}
            {/* Pagination Controls */}
            {backupFiles.length > 0 && (
              <div className="mt-4 px-2">
                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalCount={totalItems}
                  filteredCount={totalItems}
                  pageSize={pageSize}
                  onPageChange={async (page) => {
                    setIsButtonRefreshing(true);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    onPageChange(page);
                    setIsButtonRefreshing(false);
                  }}
                  onPageSizeChange={onPageSizeChange}
                  isLoadMoreMode={isPhone}
                  isLoading={isLoadingInitialData || isButtonRefreshing}
                  pageSizeOptions={[5, 10, 50, 100, 500]}
                  showAllOption={true}
                />
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Create Backup Dialog */}
      <CreateBackupDialog
        isOpen={isCreateBackupDialogOpen}
        onOpenChange={setIsCreateBackupDialogOpen}
        defaultFilename={generateDefaultFilename()}
        onCreateBackup={handleCreateBackupWithFilename}
        isLoading={isLoadingBackup}
      />

      {/* Rename Backup Dialog */}
      <RenameBackupDialog
        isOpen={isRenameBackupDialogOpen}
        onClose={() => {
          setIsRenameBackupDialogOpen(false);
          setBackupToRename(null);
        }}
        currentFilename={backupToRename || ''}
        onRename={handleRenameBackupWithFilename}
        isLoading={isRenamingBackup !== null}
      />
    </Card>
  );
}