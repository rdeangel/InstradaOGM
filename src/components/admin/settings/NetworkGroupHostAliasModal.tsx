'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Network, AlertTriangle, Trash2, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { NetworkGroup } from '@/types/opnsense';

interface HostAlias {
  uuid: string;
  name: string;
  content: string; // IP address
  description: string;
  enabled: string;
  hasArpEntry?: boolean; // Whether the IP has an active ARP entry
}

interface NetworkGroupHostAliasModalProps {
  isOpen: boolean;
  onClose: () => void;
  networkGroup: NetworkGroup | null;
  hostAliases: HostAlias[];
  onRemoveAll: () => Promise<void>;
  onDisableAnyway: () => Promise<void>;
  isLoading?: boolean;
}

export function NetworkGroupHostAliasModal({
  isOpen,
  onClose,
  networkGroup,
  hostAliases,
  onRemoveAll,
  onDisableAnyway,
  isLoading = false,
}: NetworkGroupHostAliasModalProps) {
  const { toast } = useToast();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDisableAnywayDialog, setShowDisableAnywayDialog] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [disableConfirmText, setDisableConfirmText] = useState('');
  const [isRemoving, setIsRemoving] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);

  // Count online hosts (those with ARP entries)
  const onlineHostsCount = hostAliases.filter(alias => alias.hasArpEntry).length;
  const hasOnlineHosts = onlineHostsCount > 0;

  const handleRemoveAll = async () => {
    if (confirmText !== 'CONFIRM') {
      toast({
        title: 'Invalid Confirmation',
        description: 'Please type "CONFIRM" to proceed with removal.',
        variant: 'destructive',
      });
      return;
    }

    setIsRemoving(true);
    try {
      await onRemoveAll();
      setShowConfirmDialog(false);
      setConfirmText('');
      toast({
        title: 'Success',
        description: 'All host aliases have been successfully unassigned.',
        variant: 'success',
      });
      onClose(); // Close the modal after success
    } catch (error) {
      toast({
        title: 'Removal Failed',
        description: error instanceof Error ? error.message : 'Failed to remove host aliases.',
        variant: 'destructive',
      });
    } finally {
      setIsRemoving(false);
    }
  };

  const handleDisableAnyway = async () => {
    if (disableConfirmText !== 'CONFIRM') {
      toast({
        title: 'Invalid Confirmation',
        description: 'Please type "CONFIRM" to proceed with disabling.',
        variant: 'destructive',
      });
      return;
    }

    setIsDisabling(true);
    try {
      await onDisableAnyway();
      setShowDisableAnywayDialog(false);
      setDisableConfirmText('');
      onClose(); // Close immediately for disable anyway
    } catch (error: unknown) {
      toast({
        title: 'Disable Failed',
        description: error instanceof Error ? error.message : 'Failed to disable the group.',
        variant: 'destructive',
      });
    } finally {
      setIsDisabling(false);
    }
  };

  const handleViewAssignments = () => {
    setShowViewModal(true);
  };

  if (!networkGroup) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] sm:max-h-[80vh] flex flex-col">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Network className="w-5 h-5 text-primary" />
              Host Aliases Assigned to &quot;{networkGroup?.friendlyName || networkGroup?.name}&quot;
              <Badge variant="secondary" className="ml-2">
                {hostAliases.length} {hostAliases.length === 1 ? 'alias' : 'aliases'}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {isRemoving && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
              <div className="flex flex-col items-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <span className="mt-4 text-lg font-medium">Removing all assignments...</span>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Loading host aliases...</span>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              {hostAliases.length === 0 ? (
                <Alert className="my-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No host aliases found for this group. The group can now be globally disabled.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <Alert className="my-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                    To disable this group, we recommend first unassigning all its host aliases. 
                    You can do this manually via the Admin Panel → Network Groups tab or use the bulk removal option below.
                    <br></br>Warning: If you disable the group while aliases are still assigned, they will become unmanaged and hidden from InstradaOGM.
                    This can cause unintended configuration issues unless it is by design. If you plan to keep specific aliases assigned to this disabled group, you can proceed.
                    </AlertDescription>
                  </Alert>

                  {/* Status Summary */}
                  <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">Status Summary:</span>
                      <div className="flex gap-4">
                        <span className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          {onlineHostsCount} Online
                        </span>
                        <span className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                          {hostAliases.length - onlineHostsCount} Offline
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={handleViewAssignments}
              className="flex-1"
              disabled={isLoading}
            >
              <Eye className="w-4 h-4 mr-2" />
              View in Network Group
            </Button>
            <Button
              variant="destructive"
              onClick={() => setShowConfirmDialog(true)}
              className="flex-1"
              disabled={isLoading || hostAliases.length === 0}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Remove All Assignments
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowDisableAnywayDialog(true)}
              className="flex-1"
              disabled={isLoading}
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Disable Group Anyway
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={isRemoving || isDisabling}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Confirm Bulk Removal
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  This will remove all {hostAliases.length} host aliases from &quot;{networkGroup?.friendlyName || networkGroup?.name}&quot;.
                  This action cannot be undone automatically, you&apos;ll need to re-add them manually if desired.
                </p>
                {hasOnlineHosts && (
                  <div className="mt-3 p-3 bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-800 rounded-md">
                    <div className="flex items-center gap-2 text-orange-800 dark:text-orange-200">
                      <AlertTriangle className="w-4 h-4" />
                      <strong>Connectivity Warning</strong>
                    </div>
                    <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                      {onlineHostsCount} of {hostAliases.length} host aliases have active ARP entries (devices are currently online).
                      Removing these assignments may affect network connectivity for these active devices.
                    </p>
                  </div>
                )}
                <p className="mt-4">
                  Type <strong>CONFIRM</strong> to proceed:
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="my-4">
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type CONFIRM here"
              className="w-full"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveAll}
              disabled={confirmText !== 'CONFIRM' || isRemoving}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isRemoving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove All
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disable Anyway Confirmation Dialog */}
      <AlertDialog open={showDisableAnywayDialog} onOpenChange={setShowDisableAnywayDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Disable Group With Host Aliases
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  <strong>Warning:</strong> If you disable &quot;{networkGroup?.friendlyName || networkGroup?.name}&quot; without removing host aliases,
                  all {hostAliases.length} host aliases (and their associated IP addresses) will be unmanageable and hidden from InstradaOGM.
                </p>
                <p className="mt-2">
                  <strong>This means:</strong>
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Host aliases will no longer be managed by InstradaOGM</li>
                  <li>You&apos;ll need to re-enable the group to see them in InstadaOGM again</li>
                  <li>Or manage them directly in OPNsense</li>
                </ul>
                <p className="mt-4">
                  Type <strong>CONFIRM</strong> to proceed:
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="my-4">
            <Input
              value={disableConfirmText}
              onChange={(e) => setDisableConfirmText(e.target.value)}
              placeholder="Type CONFIRM here"
              className="w-full"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDisableAnywayDialog(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisableAnyway}
              disabled={disableConfirmText !== 'CONFIRM' || isDisabling}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDisabling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Disabling...
                </>
              ) : (
                'Disable Anyway'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Host Aliases Modal */}
      <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
        <DialogContent className="max-w-4xl w-[95vw] h-[90vh] sm:h-[80vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Network className="w-5 h-5" />
              Host Aliases in &quot;{networkGroup?.friendlyName || networkGroup?.name}&quot;
              <Badge variant="secondary" className="ml-2">
                {hostAliases.length} {hostAliases.length === 1 ? 'alias' : 'aliases'}
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Detailed view of all host aliases assigned to this network group.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="space-y-3 pr-4">
                {hostAliases.map((alias) => (
                  <div
                    key={alias.uuid}
                    className="border border-border rounded-lg p-4 bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-medium text-foreground">{alias.name}</h4>
                          <Badge variant={alias.enabled === '1' ? 'default' : 'secondary'}>
                            {alias.enabled === '1' ? 'Enabled' : 'Disabled'}
                          </Badge>
                          {alias.hasArpEntry && (
                            <Badge variant="outline" className="bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
                              Online
                            </Badge>
                          )}
                        </div>

                        <div className="mb-2">
                          <span className="text-sm font-medium text-muted-foreground">IP Address: </span>
                          <code className="bg-muted px-2 py-1 rounded text-sm text-foreground">
                            {alias.content}
                          </code>
                        </div>

                        {alias.description && (
                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium">Description: </span>
                            {alias.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="flex justify-end pt-4 border-t border-border flex-shrink-0">
            <Button variant="secondary" onClick={() => setShowViewModal(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
