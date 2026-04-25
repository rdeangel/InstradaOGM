'use client';

import { useState, useCallback, useEffect } from 'react';
import type { NetworkAlias } from '@/types/opnsense';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { SortableTable } from '@/components/ui/sortable-table';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { logger } from '@/lib/logger';
import {
  Waypoints, RefreshCcw, PlusCircle, Edit, Trash2, Loader2, AlertCircle, XCircle,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ClientOnly } from '@/components/util/ClientOnly';
import { useAuth } from '@/context/AuthContext';
import { Role } from '@/types/opnsense';

// eslint-disable-next-line security/detect-unsafe-regex
const CIDR_REGEX = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$|^[0-9a-fA-F:]+\/\d{1,3}$/;
const NAME_REGEX = /^[a-zA-Z0-9_]+$/;

interface AliasFormState {
  name: string;
  content: string;
  description: string;
  enabled: boolean;
}

const emptyForm: AliasFormState = { name: '', content: '', description: '', enabled: true };

interface FormErrors {
  name?: string;
  content?: string;
}

function validateForm(form: AliasFormState, existingNames: string[], editingUuid?: string, allAliases?: NetworkAlias[]): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) {
    errors.name = 'Name is required';
  } else if (!NAME_REGEX.test(form.name.trim())) {
    errors.name = 'Name must be alphanumeric with underscores only';
  } else if (form.name.trim().length > 32) {
    errors.name = 'Name must be 32 characters or fewer';
  } else {
    const duplicate = allAliases?.find(a => a.name === form.name.trim() && a.uuid !== editingUuid);
    if (duplicate) errors.name = 'An alias with this name already exists';
  }
  if (!form.content.trim()) {
    errors.content = 'CIDR content is required';
  } else if (!CIDR_REGEX.test(form.content.trim())) {
    errors.content = 'Must be a valid CIDR range (e.g. 192.168.1.0/24)';
  }
  void existingNames;
  return errors;
}

interface NetworkAliasesTabProps {
  onConnectionError?: () => void;
}

export function NetworkAliasesTab({ onConnectionError }: NetworkAliasesTabProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { data: session } = useAuth();
  const isSuperAdmin = session?.user?.role === Role.SUPER_ADMIN;

  const [aliases, setAliases] = useState<NetworkAlias[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useLocalStorage<number | 'ALL'>('network-aliases-table-page-size', 10);

  // Add dialog
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AliasFormState>(emptyForm);
  const [addErrors, setAddErrors] = useState<FormErrors>({});
  const [isAddSubmitting, setIsAddSubmitting] = useState(false);

  // Edit dialog
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingAlias, setEditingAlias] = useState<NetworkAlias | null>(null);
  const [editForm, setEditForm] = useState<AliasFormState>(emptyForm);
  const [editErrors, setEditErrors] = useState<FormErrors>({});
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

  // Delete dialog
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingAlias, setDeletingAlias] = useState<NetworkAlias | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);

  const fetchAliases = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else { setIsLoading(true); setError(null); }
    try {
      const resp = await fetch('/api/opnsense/network-aliases', { cache: 'no-store' });
      if (!resp.ok) {
        if (resp.status === 403) { setError('Network Aliases Management is disabled. Enable it in Global Settings.'); return; }
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.message || `HTTP ${resp.status}`);
      }
      const data: NetworkAlias[] = await resp.json();
      setAliases(data);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load network aliases';
      setError(msg);
      if (msg.toLowerCase().includes('connect') || msg.toLowerCase().includes('opnsense')) {
        onConnectionError?.();
      }
      logger.error('[NetworkAliasesTab] fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [onConnectionError]);

  useEffect(() => { fetchAliases(); }, [fetchAliases]);

  // ── Filtering + sorting ──────────────────────────────────────────────────

  const filtered = aliases.filter(a => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      a.content.toLowerCase().includes(q) ||
      (a.description && a.description.toLowerCase().includes(q))
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
    else if (sortBy === 'content') cmp = a.content.localeCompare(b.content);
    else if (sortBy === 'description') cmp = (a.description ?? '').localeCompare(b.description ?? '');
    else if (sortBy === 'enabled') cmp = a.enabled.localeCompare(b.enabled);
    return sortDirection === 'asc' ? cmp : -cmp;
  });

  const totalItems = sorted.length;
  const paginated = pageSize === 'ALL' ? sorted : sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // ── Add ──────────────────────────────────────────────────────────────────

  const handleOpenAdd = () => {
    setAddForm(emptyForm);
    setAddErrors({});
    setIsAddOpen(true);
  };

  const handleSubmitAdd = async () => {
    const errs = validateForm(addForm, [], undefined, aliases);
    if (Object.keys(errs).length > 0) { setAddErrors(errs); return; }
    setIsAddSubmitting(true);
    try {
      const resp = await fetch('/api/opnsense/network-aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addForm.name.trim(),
          content: addForm.content.trim(),
          description: addForm.description.trim(),
          enabled: addForm.enabled ? '1' : '0',
        }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        toast({ title: 'Error', description: data.message || 'Failed to create alias', variant: 'destructive' });
        return;
      }
      toast({ title: 'Network alias created' });
      setIsAddOpen(false);
      fetchAliases(true);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsAddSubmitting(false);
    }
  };

  // ── Edit ─────────────────────────────────────────────────────────────────

  const handleOpenEdit = (alias: NetworkAlias) => {
    setEditingAlias(alias);
    setEditForm({ name: alias.name, content: alias.content, description: alias.description ?? '', enabled: alias.enabled === '1' });
    setEditErrors({});
    setIsEditOpen(true);
  };

  const handleSubmitEdit = async () => {
    if (!editingAlias) return;
    const errs = validateForm(editForm, [], editingAlias.uuid, aliases);
    if (Object.keys(errs).length > 0) { setEditErrors(errs); return; }
    setIsEditSubmitting(true);
    try {
      const resp = await fetch(`/api/opnsense/network-aliases/${editingAlias.uuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          content: editForm.content.trim(),
          description: editForm.description.trim(),
          enabled: editForm.enabled ? '1' : '0',
        }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        toast({ title: 'Error', description: data.message || 'Failed to update alias', variant: 'destructive' });
        return;
      }
      toast({ title: 'Network alias updated' });
      setIsEditOpen(false);
      setEditingAlias(null);
      fetchAliases(true);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsEditSubmitting(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────

  const handleOpenDelete = (alias: NetworkAlias) => {
    setDeletingAlias(alias);
    setDeleteConfirm('');
    setIsDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingAlias || deleteConfirm !== deletingAlias.name) return;
    setIsDeleteSubmitting(true);
    try {
      const resp = await fetch(`/api/opnsense/network-aliases/${deletingAlias.uuid}`, { method: 'DELETE' });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        toast({ title: 'Error', description: data.message || 'Failed to delete alias', variant: 'destructive' });
        return;
      }
      toast({ title: 'Network alias deleted' });
      setIsDeleteOpen(false);
      setDeletingAlias(null);
      fetchAliases(true);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsDeleteSubmitting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <Card className="flex flex-col flex-grow min-h-0">
        <CardHeader className="pb-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClientOnly><Waypoints className="h-5 w-5" /></ClientOnly>
                Network Alias Management
              </CardTitle>
              <CardDescription className="mt-1">View and manage OPNsense network (CIDR) aliases</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => fetchAliases(true)} disabled={isRefreshing}>
                <ClientOnly>{isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}</ClientOnly>
              </Button>
              {isSuperAdmin && (
                <Button size="sm" onClick={handleOpenAdd}>
                  <ClientOnly><PlusCircle className="h-4 w-4 mr-1" /></ClientOnly>
                  Add Network Alias
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <Input
              placeholder="Search by name, CIDR, description..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="max-w-sm"
            />
            {searchTerm && (
              <Button variant="ghost" size="icon" onClick={() => setSearchTerm('')}>
                <XCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="flex flex-col flex-grow min-h-0 pb-2">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error}{' '}
                <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => fetchAliases()}>Retry</Button>
              </AlertDescription>
            </Alert>
          ) : aliases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <Waypoints className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-muted-foreground font-medium">No managed network ranges</p>
              {isSuperAdmin ? (
                <p className="text-sm text-muted-foreground max-w-sm">
                  No network-type aliases have been configured yet. Click &ldquo;Add Network Alias&rdquo; to create one.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground max-w-sm">
                  No network ranges have been configured as managed yet. A Super Admin can enable and configure them in Settings &rsaquo; Network Display Mappings.
                </p>
              )}
            </div>
          ) : (
            <>
              {!isMobile ? (
                <ScrollArea className="flex-grow">
                  <SortableTable<NetworkAlias>
                    data={paginated}
                    columns={[
                      {
                        key: 'name',
                        label: 'Name',
                        sortable: true,
                        render: (a: NetworkAlias) => <span className="font-medium">{a.name}</span>,
                      },
                      {
                        key: 'content',
                        label: 'Content (CIDR)',
                        sortable: true,
                        render: (a: NetworkAlias) => (
                          <Badge variant="outline" className="font-mono text-xs">
                            {a.content.length > 20 ? `${a.content.slice(0, 20)}…` : a.content}
                          </Badge>
                        ),
                      },
                      {
                        key: 'description',
                        label: 'Description',
                        sortable: true,
                        render: (a: NetworkAlias) => (
                          <span className={a.description ? '' : 'text-muted-foreground'}>
                            {a.description || '—'}
                          </span>
                        ),
                      },
                      {
                        key: 'memberOfGroups',
                        label: 'Member Of Groups',
                        sortable: false,
                        render: (a: NetworkAlias) => (
                          a.memberOfGroups && a.memberOfGroups.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {a.memberOfGroups.map(g => (
                                <Badge key={g.uuid} variant="secondary" className="text-xs">{g.name}</Badge>
                              ))}
                            </div>
                          ) : <span className="text-muted-foreground">—</span>
                        ),
                      },
                      {
                        key: 'enabled',
                        label: 'Enabled',
                        sortable: true,
                        render: (a: NetworkAlias) => (
                          <span className={a.enabled === '1' ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
                            {a.enabled === '1' ? 'Yes' : 'No'}
                          </span>
                        ),
                      },
                      {
                        key: 'actions',
                        label: 'Actions',
                        sortable: false,
                        render: (a: NetworkAlias) => (
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" onClick={() => handleOpenEdit(a)}>
                              <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                            </Button>
                            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleOpenDelete(a)}>
                              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                            </Button>
                          </div>
                        ),
                      },
                    ]}
                    sortBy={sortBy}
                    sortDirection={sortDirection}
                    onSortChange={(col, dir) => { setSortBy(col); setSortDirection(dir); }}
                  />
                </ScrollArea>
              ) : (
                // Mobile card list
                <ScrollArea className="flex-grow">
                  {paginated.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {searchTerm ? 'No results match your search.' : "No network aliases found."}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {paginated.map(a => (
                        <Card key={a.uuid} className="p-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-medium">{a.name}</div>
                              <Badge variant="outline" className="font-mono text-xs mt-1">{a.content}</Badge>
                              {a.description && <div className="text-xs text-muted-foreground mt-1">{a.description}</div>}
                              <div className={`text-xs mt-1 ${a.enabled === '1' ? 'text-green-600' : 'text-muted-foreground'}`}>
                                {a.enabled === '1' ? 'Enabled' : 'Disabled'}
                              </div>
                            </div>
                            <div className="flex gap-1 flex-col">
                              <Button variant="outline" size="sm" onClick={() => handleOpenEdit(a)}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleOpenDelete(a)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              )}

              <div className="mt-2 flex-shrink-0">
                <PaginationControls
                  currentPage={currentPage}
                  pageSize={pageSize}
                  totalPages={pageSize === 'ALL' ? 1 : Math.max(1, Math.ceil(totalItems / pageSize))}
                  totalCount={aliases.length}
                  filteredCount={totalItems}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={size => { setPageSize(size); setCurrentPage(1); }}
                  isLoading={isLoading}
                  pageSizeOptions={[5, 10, 50, 100, 500]}
                  showAllOption={true}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Network Alias</DialogTitle>
            <DialogDescription>Create a new CIDR-range alias in OPNsense.</DialogDescription>
          </DialogHeader>
          <AliasForm
            form={addForm}
            errors={addErrors}
            onChange={patch => setAddForm(f => ({ ...f, ...patch }))}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitAdd} disabled={isAddSubmitting}>
              {isAddSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={open => { if (!open) { setIsEditOpen(false); setEditingAlias(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Network Alias</DialogTitle>
            <DialogDescription>Update &quot;{editingAlias?.name}&quot;.</DialogDescription>
          </DialogHeader>
          <AliasForm
            form={editForm}
            errors={editErrors}
            onChange={patch => setEditForm(f => ({ ...f, ...patch }))}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditOpen(false); setEditingAlias(null); }}>Cancel</Button>
            <Button onClick={handleSubmitEdit} disabled={isEditSubmitting}>
              {isEditSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Network Alias</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deletingAlias?.name}</strong>?
              {deletingAlias?.memberOfGroups && deletingAlias.memberOfGroups.length > 0 && (
                <span className="block mt-2 text-destructive">
                  Warning: This alias is a member of {deletingAlias.memberOfGroups.length} network group(s). Removing it will also remove it from those groups.
                </span>
              )}
              <span className="block mt-2">Type the alias name to confirm:</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder={deletingAlias?.name}
            value={deleteConfirm}
            onChange={e => setDeleteConfirm(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteConfirm(''); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
              disabled={deleteConfirm !== deletingAlias?.name || isDeleteSubmitting}
            >
              {isDeleteSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}

// ── Shared form component ───────────────────────────────────────────────────

function AliasForm({
  form,
  errors,
  onChange,
}: {
  form: AliasFormState;
  errors: FormErrors;
  onChange: (patch: Partial<AliasFormState>) => void;
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1">
        <Label htmlFor="alias-name">Name *</Label>
        <Input
          id="alias-name"
          value={form.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder="my_network_alias"
          maxLength={32}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>
      <div className="space-y-1">
        <Label htmlFor="alias-content">CIDR Content *</Label>
        <Input
          id="alias-content"
          value={form.content}
          onChange={e => onChange({ content: e.target.value })}
          placeholder="192.168.1.0/24"
        />
        {errors.content && <p className="text-xs text-destructive">{errors.content}</p>}
      </div>
      <div className="space-y-1">
        <Label htmlFor="alias-description">Description</Label>
        <Input
          id="alias-description"
          value={form.description}
          onChange={e => onChange({ description: e.target.value })}
          placeholder="Optional description"
          maxLength={255}
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id="alias-enabled"
          checked={form.enabled}
          onCheckedChange={checked => onChange({ enabled: checked })}
        />
        <Label htmlFor="alias-enabled">Enabled</Label>
      </div>
    </div>
  );
}
