'use client';

import { useState, useMemo } from 'react';
import type { NetworkAlias } from '@/types/opnsense';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { SortableTable } from '@/components/ui/sortable-table';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
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
  networkAliases: NetworkAlias[];
  isLoadingInitialData: boolean;
  isRefreshing: boolean;
  networkAliasesError: string | null;
  onRefreshNetworkAliases: () => Promise<void>;
  sortBy: string;
  sortDirection: 'asc' | 'desc';
  onSortChange: (newSortBy: string, newSortDirection: 'asc' | 'desc') => void;
  currentPage: number;
  pageSize: number | 'ALL';
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number | 'ALL') => void;
  searchTerm: string;
  onSearchTermChange: (searchTerm: string) => void;
}

export function NetworkAliasesTab({
  networkAliases,
  isLoadingInitialData,
  isRefreshing,
  networkAliasesError,
  onRefreshNetworkAliases,
  sortBy,
  sortDirection,
  onSortChange,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  searchTerm,
  onSearchTermChange,
}: NetworkAliasesTabProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { data: session } = useAuth();
  const isSuperAdmin = session?.user?.role === Role.SUPER_ADMIN;

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

  // ── Filtering + sorting ──────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return networkAliases.filter(a => {
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.content.toLowerCase().includes(q) ||
        (a.description && a.description.toLowerCase().includes(q))
      );
    });
  }, [networkAliases, searchTerm]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortBy === 'content') cmp = a.content.localeCompare(b.content);
      else if (sortBy === 'description') cmp = (a.description ?? '').localeCompare(b.description ?? '');
      else if (sortBy === 'enabled') cmp = a.enabled.localeCompare(b.enabled);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortBy, sortDirection]);

  const totalItems = sorted.length;
  const paginated = pageSize === 'ALL' ? sorted : sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // ── Add ──────────────────────────────────────────────────────────────────

  const handleOpenAdd = () => {
    setAddForm(emptyForm);
    setAddErrors({});
    setIsAddOpen(true);
  };

  const handleSubmitAdd = async () => {
    const errs = validateForm(addForm, [], undefined, networkAliases);
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
      onRefreshNetworkAliases();
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
    const errs = validateForm(editForm, [], editingAlias.uuid, networkAliases);
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
      onRefreshNetworkAliases();
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
      onRefreshNetworkAliases();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsDeleteSubmitting(false);
    }
  };

  const handleRefresh = () => {
    onRefreshNetworkAliases();
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <Card className="shadow-lg w-full flex flex-col flex-1 mb-0 min-h-0">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0 pb-4">
          <div>
            <CardTitle className={`flex items-center ${isMobile ? 'text-xl' : 'text-2xl'}`}>
              <ClientOnly><Waypoints size={28} className="mr-2 text-primary" /></ClientOnly> Network Alias Management
            </CardTitle>
            {!isMobile && <CardDescription>View and manage OPNsense network (CIDR) aliases.</CardDescription>}
          </div>
          <div className="flex w-full items-center justify-between md:w-auto md:gap-4">
            <div className="flex items-center gap-2">
              <Button
                onClick={handleRefresh}
                variant="outline"
                className={cn(isMobile && "size-9 p-0")}
                disabled={isLoadingInitialData || isRefreshing}
              >
                <ClientOnly>
                  {isRefreshing ? (
                    <Loader2 className={cn("h-4 w-4 animate-spin", !isMobile && "mr-2")} />
                  ) : (
                    <RefreshCcw className={cn("h-4 w-4", !isMobile && "mr-2")} />
                  )}
                </ClientOnly>
                {!isMobile && "Refresh"}
              </Button>
              {isSuperAdmin && (
                <Button onClick={handleOpenAdd} className={cn(isMobile && "size-9 p-0")}>
                  <ClientOnly>
                    <PlusCircle className={cn("h-4 w-4", !isMobile && "mr-2")} />
                  </ClientOnly>
                  {!isMobile && "Add Network Alias"}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-4 md:p-6 relative flex-1 overflow-hidden flex flex-col">
          {isLoadingInitialData ? (
            <div className="space-y-2 mt-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : networkAliasesError ? (
            <Alert variant="destructive" className="mt-4">
              <ClientOnly><AlertCircle className="h-4 w-4" /></ClientOnly>
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {networkAliasesError}{' '}
                <Button variant="link" size="sm" className="p-0 h-auto" onClick={handleRefresh}>Retry</Button>
              </AlertDescription>
            </Alert>
          ) : networkAliases.length === 0 ? (
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
              {/* Search Input */}
              <div className="mb-4 relative max-w-sm">
                <div className="relative">
                  <Input
                    type="search"
                    placeholder="Search by name, CIDR, description..."
                    value={searchTerm}
                    onChange={e => onSearchTermChange(e.target.value)}
                    className="pr-16"
                  />
                  <div className="absolute right-1 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                    {searchTerm && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onSearchTermChange('')}
                      >
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {!isMobile ? (
                <ScrollArea className="flex-1 pr-4 -mr-4">
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
                    onSortChange={onSortChange}
                  />
                </ScrollArea>
              ) : (
                // Mobile card list
                <ScrollArea className="flex-1 pr-4 -mr-4">
                  {paginated.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {searchTerm ? 'No results match your search.' : "No network aliases found."}
                    </p>
                  ) : (
                    <div className="space-y-4">
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
                  totalPages={pageSize === 'ALL' ? 1 : Math.max(1, Math.ceil(totalItems / (typeof pageSize === 'number' ? pageSize : 1)))}
                  totalCount={networkAliases.length}
                  filteredCount={totalItems}
                  onPageChange={onPageChange}
                  onPageSizeChange={onPageSizeChange}
                  isLoading={isRefreshing}
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
