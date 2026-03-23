import { useState, useCallback, useMemo } from 'react';
import { CheckCircle2, AlertTriangle, ScanSearch, Fingerprint, Loader2, Trash2, Users, ShieldAlert } from 'lucide-react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DuplicateResult, DuplicateAliasEntry } from './types';

interface DuplicateAliasesModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  results: DuplicateResult[];
  onRemoveAlias: (uuid: string, name: string, memberOfGroups: { uuid: string; name: string }[], deleteAfterUnassign: boolean) => Promise<void>;
}

export function DuplicateAliasesModal({ isOpen, onOpenChange, results, onRemoveAlias }: DuplicateAliasesModalProps) {
  const [processingUuids, setProcessingUuids] = useState<Set<string>>(new Set());
  const [removedUuids, setRemovedUuids] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingAlias, setPendingAlias] = useState<DuplicateAliasEntry | null>(null);

  // Filter out removed aliases and recalculate which groups still have duplicates
  const activeResults = useMemo(() => {
    return results
      .map(r => ({
        ...r,
        aliases: r.aliases.filter(a => !removedUuids.has(a.uuid)),
      }))
      .filter(r => r.aliases.length > 1);
  }, [results, removedUuids]);

  const totalRemaining = activeResults.length;
  const totalRemoved = removedUuids.size;

  const ipDuplicates = activeResults.filter(r => r.type === 'ip');
  const nameDuplicates = activeResults.filter(r => r.type === 'name');

  const handleRemove = useCallback(async (alias: DuplicateAliasEntry) => {
    setProcessingUuids(prev => new Set(prev).add(alias.uuid));
    setErrors(prev => { const n = { ...prev }; delete n[alias.uuid]; return n; });
    try {
      const deleteAfterUnassign = !alias.hasHiddenGroups;
      await onRemoveAlias(alias.uuid, alias.name, alias.memberOfGroups ?? [], deleteAfterUnassign);
      setRemovedUuids(prev => new Set(prev).add(alias.uuid));
    } catch (err) {
      setErrors(prev => ({
        ...prev,
        [alias.uuid]: err instanceof Error ? err.message : 'Operation failed',
      }));
    } finally {
      setProcessingUuids(prev => { const n = new Set(prev); n.delete(alias.uuid); return n; });
    }
  }, [onRemoveAlias]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setProcessingUuids(new Set());
      setErrors({});
      // Keep removedUuids so the parent state stays consistent
    }
    onOpenChange(open);
  };

  const confirmTitle = pendingAlias
    ? pendingAlias.hasHiddenGroups
      ? 'Unassign from managed groups?'
      : (pendingAlias.memberOfGroups ?? []).length > 0
      ? 'Unassign and delete?'
      : 'Delete host alias?'
    : '';

  const confirmDescription = pendingAlias
    ? pendingAlias.hasHiddenGroups
      ? `"${pendingAlias.name}" will be unassigned from ${(pendingAlias.memberOfGroups ?? []).length} managed group${(pendingAlias.memberOfGroups ?? []).length !== 1 ? 's' : ''}. It will not be deleted as it is also assigned to groups outside InstradaOGM's control.`
      : (pendingAlias.memberOfGroups ?? []).length > 0
      ? `"${pendingAlias.name}" will be unassigned from ${(pendingAlias.memberOfGroups ?? []).length} group${(pendingAlias.memberOfGroups ?? []).length !== 1 ? 's' : ''} and permanently deleted from OPNsense. This cannot be undone.`
      : `"${pendingAlias.name}" will be permanently deleted from OPNsense. This cannot be undone.`
    : '';

  return (
    <>
    <AlertDialog open={pendingAlias !== null} onOpenChange={(open) => { if (!open) setPendingAlias(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
          <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setPendingAlias(null)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (pendingAlias) {
                handleRemove(pendingAlias);
                setPendingAlias(null);
              }
            }}
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanSearch className="h-5 w-5" />
            Duplicate Check Results
          </DialogTitle>
          <DialogDescription>
            Scan all host aliases for duplicate IP addresses and names. Use the remove button to unassign from all groups and delete in one step.
          </DialogDescription>
        </DialogHeader>

        {results.length === 0 || totalRemaining === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-lg font-medium">{totalRemoved > 0 ? 'All duplicates resolved' : 'No duplicates found'}</p>
            <p className="text-sm text-muted-foreground">
              {totalRemoved > 0
                ? `${totalRemoved} alias${totalRemoved !== 1 ? 'es' : ''} removed successfully.`
                : 'All host aliases have unique names and IP addresses.'}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span>
                <span className="font-semibold text-foreground">{totalRemaining}</span> duplicate group{totalRemaining !== 1 ? 's' : ''} remaining
                {totalRemoved > 0 && (
                  <span className="ml-2 text-green-500">· {totalRemoved} removed</span>
                )}
              </span>
            </div>

            <ScrollArea className="max-h-[460px] pr-3">
              <div className="space-y-4">
                {ipDuplicates.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      Duplicate IP Addresses
                    </h4>
                    {ipDuplicates.map(dup => (
                      <div key={dup.value} className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-2">
                        <p className="text-sm font-mono font-semibold text-yellow-600 dark:text-yellow-400">{dup.value}</p>
                        <div className="space-y-2">
                          {dup.aliases.map(alias => (
                            <AliasRow
                              key={alias.uuid}
                              alias={alias}
                              isProcessing={processingUuids.has(alias.uuid)}
                              error={errors[alias.uuid]}
                              onRequestRemove={setPendingAlias}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {nameDuplicates.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5">
                      <Fingerprint className="h-4 w-4 text-orange-500" />
                      Duplicate Names
                    </h4>
                    {nameDuplicates.map(dup => (
                      <div key={dup.value} className="rounded-md border border-orange-500/30 bg-orange-500/5 p-3 space-y-2">
                        <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">{dup.aliases[0]?.name ?? dup.value}</p>
                        <div className="space-y-2">
                          {dup.aliases.map(alias => (
                            <AliasRow
                              key={alias.uuid}
                              alias={alias}
                              isProcessing={processingUuids.has(alias.uuid)}
                              error={errors[alias.uuid]}
                              onRequestRemove={setPendingAlias}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

interface AliasRowProps {
  alias: DuplicateAliasEntry;
  isProcessing: boolean;
  error?: string;
  onRequestRemove: (alias: DuplicateAliasEntry) => void;
}

function AliasRow({ alias, isProcessing, error, onRequestRemove }: AliasRowProps) {
  const groups = alias.memberOfGroups ?? [];

  return (
    <div className="rounded border border-border bg-background/50 p-2.5 space-y-1.5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={alias.enabled === '1' ? 'default' : 'secondary'} className="shrink-0 text-xs">
              {alias.enabled === '1' ? 'enabled' : 'disabled'}
            </Badge>
            <span className="font-medium text-sm">{alias.name}</span>
            {alias.description && (
              <span className="text-xs text-muted-foreground truncate">— {alias.description}</span>
            )}
          </div>
          <p className="text-xs font-mono text-muted-foreground">{alias.content}</p>
          {groups.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <Users className="h-3 w-3 text-muted-foreground shrink-0" />
              {groups.map(g => (
                <Badge key={g.uuid} variant="outline" className="text-xs py-0 h-auto whitespace-nowrap">
                  {g.friendlyName || g.name}
                </Badge>
              ))}
            </div>
          )}
          {alias.hasHiddenGroups && (
            <div className="flex items-center gap-1 text-xs text-amber-500">
              <ShieldAlert className="h-3 w-3 shrink-0" />
              <span>Also assigned to unmanaged groups — will only be unassigned, not deleted</span>
            </div>
          )}
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>
        <Button
          variant="destructive"
          size="sm"
          className="w-full sm:w-auto sm:shrink-0 h-7 text-xs gap-1"
          disabled={isProcessing}
          onClick={() => onRequestRemove(alias)}
        >
          {isProcessing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
          {isProcessing
            ? 'Removing…'
            : alias.hasHiddenGroups
            ? 'Unassign from managed'
            : groups.length > 0
            ? 'Unassign & Delete'
            : 'Delete'}
        </Button>
      </div>
    </div>
  );
}
