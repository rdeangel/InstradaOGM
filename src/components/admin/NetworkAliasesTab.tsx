'use client';

import { useState, useMemo, useCallback } from 'react';
import type { NetworkAlias, VpnMapping } from '@/types/opnsense';
import type { OpnsenseGroupDisplay } from '@/types/settings';
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
import { logger } from '@/lib/logger';
import {
  Waypoints, RefreshCcw, PlusCircle, Edit, Trash2, Loader2, AlertCircle, XCircle, X,
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useGroupType } from '@/context/GroupTypeContext';
import { hasAnyGroupError, getGroupErrorType, getGroupErrorMessage } from '@/utils/groupErrorDetection';
import { flags, generalEmojis } from '@/components/ui/icon-picker';
import { CidrListDialog } from '@/components/ui/cidr-list-dialog';

// eslint-disable-next-line security/detect-unsafe-regex
const CIDR_REGEX = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$|^[0-9a-fA-F:]+\/\d{1,3}$/;
const NAME_REGEX = /^[a-zA-Z0-9_]+$/;

interface AliasFormState {
  name: string;
  content: string;
  description: string;
  enabled: boolean;
  hidden: boolean;
}

const emptyForm: AliasFormState = { name: '', content: '', description: '', enabled: true, hidden: false };

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
    errors.content = 'At least one CIDR is required';
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
  vpnConnectionStatuses: Map<string, { status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string }>;
  groupVpnMap: Map<string, string>;
  vpnMappings: VpnMapping[];
  opnsenseGroupDisplays: OpnsenseGroupDisplay[];
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
  vpnConnectionStatuses,
  groupVpnMap,
  vpnMappings,
  opnsenseGroupDisplays,
}: NetworkAliasesTabProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { data: session } = useAuth();
  const isSuperAdmin = session?.user?.role === Role.SUPER_ADMIN;
  const { enableGroupTypes, singleSelectName, multiSelectName } = useGroupType();

  const memoizedAllGeneralEmojiValues = useMemo(() => new Set(generalEmojis.map(e => e.value.normalize('NFC'))), []);
  const memoizedAllFlagValues = useMemo(() => new Set(flags.map(f => f.value.normalize('NFC'))), []);

  const getGroupIcon = useCallback((group: { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null }): React.ReactNode => {
    const mappedIconIdentifier = group.iconIdentifier;
    if (mappedIconIdentifier) {
      const normalizedIconIdentifier = mappedIconIdentifier.normalize('NFC');
      const isEmoji = memoizedAllGeneralEmojiValues.has(normalizedIconIdentifier);
      const isFlag = memoizedAllFlagValues.has(normalizedIconIdentifier);
      if (isEmoji || isFlag) {
        return <span className="text-xl leading-none mr-1.5">{mappedIconIdentifier}</span>;
      }
      const IconComponent = LucideIcons[mappedIconIdentifier as keyof typeof LucideIcons] as LucideIcon;
      if (IconComponent) {
        return <IconComponent size={12} className="mr-1" />;
      }
    }
    return null;
  }, [memoizedAllGeneralEmojiValues, memoizedAllFlagValues]);

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

  // VPN restart
  const [restartingVpnUuid, setRestartingVpnUuid] = useState<string | null>(null);

  const handleVpnRestart = useCallback(async (vpnUuid: string, vpnType: string) => {
    logger.debug('VPN Restart called with:', { vpnUuid, vpnType });
    setRestartingVpnUuid(vpnUuid);
    try {
      let vpnClientType = vpnType;
      if (vpnType === 'WireGuard' || vpnType === 'wireguard') {
        vpnClientType = 'wireguard';
      } else if (vpnType === 'IPsec' || vpnType === 'ipsec') {
        vpnClientType = 'ipsec';
      } else {
        vpnClientType = 'openvpn';
      }
      const response = await fetch('/api/vpn/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vpnUuid, vpnType: vpnClientType }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to restart VPN');
      }
      toast({ title: 'VPN Restarted', description: `${vpnType} VPN has been restarted successfully.` });
      await onRefreshNetworkAliases();
    } catch (err) {
      logger.error('Failed to restart VPN:', err);
      toast({ title: 'VPN Restart Failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setRestartingVpnUuid(null);
    }
  }, [toast, onRefreshNetworkAliases]);

  // CIDR list dialog
  const [viewingCidrs, setViewingCidrs] = useState<string[] | null>(null);

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
    setEditForm({ name: alias.name, content: alias.content, description: alias.description ?? '', enabled: alias.enabled === '1', hidden: alias.hidden ?? false });
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
          hidden: editForm.hidden,
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
                        render: (a: NetworkAlias) => (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`font-medium ${a.enabled !== '1' ? 'opacity-50 text-muted-foreground' : ''}`}>{a.name}</span>
                              </TooltipTrigger>
                              {a.description && (
                                <TooltipContent>
                                  <p>{a.description}</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                        ),
                      },
                      {
                        key: 'content',
                        label: 'Content (CIDR)',
                        sortable: true,
                        render: (a: NetworkAlias) => {
                          const items = a.content.split('\n').filter(c => c.trim());
                          if (items.length <= 1) {
                            const display = items[0] || a.content;
                            return (
                              <Badge variant="outline" className="font-mono text-xs max-w-[180px] truncate inline-block">
                                {display}
                              </Badge>
                            );
                          }
                          return (
                            <Badge
                              variant="outline"
                              className="font-mono text-xs cursor-pointer"
                              onClick={() => setViewingCidrs(items)}
                            >
                              {items.length} CIDRs
                            </Badge>
                          );
                        },
                      },
                      {
                        key: 'memberOfGroups',
                        label: 'Group',
                        sortable: true,
                        render: (a: NetworkAlias) => (
                          <div className={a.enabled !== '1' ? 'opacity-50 text-muted-foreground' : ''}>
                            {a.memberOfGroups && a.memberOfGroups.length > 0 ? (
                              a.enabled !== '1' ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="flex items-center text-xs bg-gray-400 dark:bg-gray-700 text-white opacity-60 border border-gray-400 dark:border-gray-700 cursor-not-allowed px-1.5 py-0.5 rounded-md">
                                        {enableGroupTypes && a.memberOfGroups.length > 1 ? (
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <span className="flex items-center">
                                                  {a.memberOfGroups.length} Groups
                                                </span>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <div className="space-y-1">
                                                  {a.memberOfGroups.map((group) => (
                                                    <div key={group.uuid} className="flex items-center gap-2">
                                                      <ClientOnly>
                                                        {group.iconIdentifier ? getGroupIcon(group) : null}
                                                      </ClientOnly>
                                                      <span>
                                                        {group.friendlyName || group.name}
                                                        {enableGroupTypes && group.groupType ? ` (${group.groupType === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
                                                      </span>
                                                    </div>
                                                  ))}
                                                </div>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        ) : (
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <span className="flex items-center">
                                                  <ClientOnly>
                                                    {a.memberOfGroups[0]?.iconIdentifier ? getGroupIcon(a.memberOfGroups[0]) : null}
                                                  </ClientOnly>
                                                  {a.memberOfGroups[0]?.friendlyName || a.memberOfGroups[0]?.name}
                                                </span>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <div className="space-y-1">
                                                  <div className="flex items-center gap-2">
                                                    <ClientOnly>
                                                      {a.memberOfGroups[0]?.iconIdentifier ? getGroupIcon(a.memberOfGroups[0]) : null}
                                                    </ClientOnly>
                                                    <span>
                                                      {a.memberOfGroups[0]?.friendlyName || a.memberOfGroups[0]?.name}
                                                      {enableGroupTypes && a.memberOfGroups[0]?.groupType ? ` (${a.memberOfGroups[0].groupType === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
                                                    </span>
                                                  </div>
                                                </div>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        )}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Group Membership is Inactive</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <span className={`flex items-center text-xs px-1.5 py-0.5 rounded-md ${hasAnyGroupError(a.memberOfGroups ?? [], enableGroupTypes)
                                  ? 'bg-orange-100 text-orange-800 border border-orange-700'
                                  : 'bg-green-100 text-green-800 border border-green-700'
                                  }`}>
                                  {hasAnyGroupError(a.memberOfGroups ?? [], enableGroupTypes) ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="flex items-center">
                                            {a.memberOfGroups.length} Groups
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div>
                                            <p className="text-orange-400 font-semibold">{getGroupErrorMessage(getGroupErrorType(a.memberOfGroups ?? [], enableGroupTypes))}</p>
                                            <p className="text-sm mt-1">Member of:</p>
                                            {a.memberOfGroups.map((group) => (
                                              <div key={group.uuid} className="flex items-center gap-2">
                                                <ClientOnly>
                                                  {group.iconIdentifier ? getGroupIcon(group) : null}
                                                </ClientOnly>
                                                <span className="text-sm">
                                                  {group.friendlyName || group.name}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : enableGroupTypes && a.memberOfGroups.length > 1 ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="flex items-center">
                                            {a.memberOfGroups.length} Groups
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div className="space-y-1">
                                            {a.memberOfGroups.map((group) => (
                                              <div key={group.uuid} className="flex items-center gap-2">
                                                <ClientOnly>
                                                  {group.iconIdentifier ? getGroupIcon(group) : null}
                                                </ClientOnly>
                                                <span>
                                                  {group.friendlyName || group.name}
                                                  {enableGroupTypes && group.groupType ? ` (${group.groupType === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="flex items-center">
                                            <ClientOnly>
                                              {a.memberOfGroups[0]?.iconIdentifier ? getGroupIcon(a.memberOfGroups[0]) : null}
                                            </ClientOnly>
                                            {a.memberOfGroups[0]?.friendlyName || a.memberOfGroups[0]?.name}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                              <ClientOnly>
                                                {a.memberOfGroups[0]?.iconIdentifier ? getGroupIcon(a.memberOfGroups[0]) : null}
                                              </ClientOnly>
                                              <span>
                                                {a.memberOfGroups[0]?.friendlyName || a.memberOfGroups[0]?.name}
                                                {enableGroupTypes && a.memberOfGroups[0]?.groupType ? ` (${a.memberOfGroups[0].groupType === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
                                              </span>
                                            </div>
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </span>
                              )
                            ) : (
                              '-'
                            )}
                          </div>
                        ),
                        compareFn: (a: NetworkAlias, b: NetworkAlias) => {
                          const groupNamesA = (a.memberOfGroups ?? []).map(g => g.friendlyName || g.name).join(', ');
                          const groupNamesB = (b.memberOfGroups ?? []).map(g => g.friendlyName || g.name).join(', ');
                          return groupNamesA.localeCompare(groupNamesB);
                        },
                      },
                      {
                        key: 'vpn_status',
                        label: 'VPN',
                        sortable: true,
                        render: (a: NetworkAlias) => {
                          // Collect VPNs from all groups this alias belongs to
                          const allVpns: Array<{ uuid: string; name: string; status: string | null; type: string | null; enabled: string | null }> = [];
                          for (const group of (a.memberOfGroups || [])) {
                            const mappedVpnUuid = groupVpnMap.get(group.uuid);
                            if (mappedVpnUuid) {
                              const existingVpn = allVpns.find(v => v.uuid === mappedVpnUuid);
                              if (!existingVpn) {
                                const vpnInfo = vpnConnectionStatuses.get(mappedVpnUuid);
                                const matchingMapping = vpnMappings.find(vpn => vpn.vpnUuid === mappedVpnUuid);
                                const groupDisplay = opnsenseGroupDisplays.find(d => d.opnsenseUuid === group.uuid);
                                const resolvedName = matchingMapping?.friendlyName ?? matchingMapping?.vpnName ?? groupDisplay?.friendlyName ?? group.name ?? mappedVpnUuid;
                                allVpns.push({ uuid: mappedVpnUuid, name: resolvedName, status: vpnInfo?.status || null, type: vpnInfo?.type || null, enabled: vpnInfo?.enabled || null });
                              }
                            }
                          }

                          if (allVpns.length === 0) return <span className="text-muted-foreground">-</span>;

                          if (allVpns.length === 1) {
                            const vpn = allVpns[0];
                            return (
                              <div className={a.enabled !== '1' ? 'opacity-50 text-muted-foreground' : ''}>
                                {vpn.status === 'connected' ? (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="flex items-center text-darker-green">
                                          <LucideIcons.ShieldCheck className="h-4 w-4 mr-1" />
                                          {vpn.name}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>{vpn.type === 'openvpn' ? 'OpenVPN' : vpn.type === 'wireguard' ? 'WireGuard' : vpn.type === 'ipsec' ? 'IPsec' : vpn.type} VPN Connected ({vpn.name})</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : vpn.status === 'disconnected' ? (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          onClick={() => handleVpnRestart(vpn.uuid, vpn.type!)}
                                          disabled={restartingVpnUuid === vpn.uuid || (vpn.type === 'WireGuard' && vpn.enabled === '0')}
                                          className={cn(
                                            "p-0 m-0 bg-transparent hover:bg-transparent flex items-center",
                                            (vpn.type === 'WireGuard' && vpn.enabled === '0') ? "text-gray-400" : "text-red-500"
                                          )}
                                        >
                                          {restartingVpnUuid === vpn.uuid ? (
                                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                          ) : (
                                            <LucideIcons.ShieldX className="h-4 w-4 mr-1" />
                                          )}
                                          {vpn.name}
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>{vpn.type === 'openvpn' ? 'OpenVPN' : vpn.type === 'wireguard' ? 'WireGuard' : vpn.type === 'ipsec' ? 'IPsec' : vpn.type} VPN Disconnected ({vpn.name})</p>
                                        {vpn.type === 'wireguard' && vpn.enabled === '0' ? (
                                          <p>WireGuard is disabled and cannot be restarted.</p>
                                        ) : (
                                          <p>Click to restart VPN</p>
                                        )}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : vpn.status === 'disabled' ? (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="flex items-center text-gray-500">
                                          <LucideIcons.ShieldX className="h-4 w-4 mr-1" />
                                          {vpn.name} (Disabled)
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>{vpn.type} VPN is Disabled</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : vpn.name ? (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="text-muted-foreground">{vpn.name}</span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>{vpn.type ? `${vpn.type} VPN Status Unknown` : 'VPN Status Unknown'}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </div>
                            );
                          }

                          // Multiple VPNs
                          const connectedCount = allVpns.filter(v => v.status === 'connected').length;
                          const disconnectedCount = allVpns.filter(v => v.status === 'disconnected').length;
                          const disabledCount = allVpns.filter(v => v.status === 'disabled').length;
                          const unknownCount = allVpns.length - connectedCount - disconnectedCount - disabledCount;

                          let statusColor = 'text-darker-green';
                          let StatusIcon: LucideIcon = LucideIcons.ShieldCheck;
                          if (connectedCount === 0) { statusColor = 'text-red-500'; StatusIcon = LucideIcons.ShieldX; }
                          else if (disconnectedCount > 0 || unknownCount > 0) { statusColor = 'text-orange-500'; StatusIcon = LucideIcons.ShieldAlert; }

                          return (
                            <div className={a.enabled !== '1' ? 'opacity-50 text-muted-foreground' : ''}>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button className={`flex items-center ${statusColor} p-0 m-0 bg-transparent hover:bg-transparent`}>
                                      <StatusIcon className="h-4 w-4 mr-1" />
                                      {`${allVpns.length} VPN${allVpns.length > 1 ? 's' : ''}`}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="space-y-1">
                                      <p className="font-medium">VPN Status Summary:</p>
                                      {connectedCount > 0 && <p className="text-green-600">✓ {connectedCount} Connected</p>}
                                      {disconnectedCount > 0 && <p className="text-red-600">✗ {disconnectedCount} Disconnected</p>}
                                      {disabledCount > 0 && <p className="text-gray-600">⊘ {disabledCount} Disabled</p>}
                                      {unknownCount > 0 && <p className="text-yellow-600">? {unknownCount} Unknown</p>}
                                      <div className="border-t pt-1 mt-2">
                                        <p className="font-medium">VPNs:</p>
                                        {allVpns.map((vpn, index) => (
                                          <p key={index} className="text-sm">{vpn.name} ({vpn.type}) - {vpn.status || 'Unknown'}</p>
                                        ))}
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          );
                        },
                        compareFn: (a: NetworkAlias, b: NetworkAlias) => {
                          const getVpnName = (alias: NetworkAlias) => {
                            for (const group of (alias.memberOfGroups || [])) {
                              const vpnUuid = groupVpnMap.get(group.uuid);
                              if (vpnUuid) {
                                const mapping = vpnMappings.find(v => v.vpnUuid === vpnUuid);
                                return mapping?.friendlyName ?? mapping?.vpnName ?? group.name ?? '';
                              }
                            }
                            return '';
                          };
                          return getVpnName(a).localeCompare(getVpnName(b));
                        },
                      },
                      {
                        key: 'enabled',
                        label: 'Enabled',
                        sortable: true,
                        headerClassName: "text-center",
                        render: (a: NetworkAlias) => (
                          <div className="flex justify-center">
                            <span className={a.enabled !== '1' ? 'opacity-50 text-muted-foreground' : ''}>
                              {a.enabled === '1' ? 'Yes' : 'No'}
                            </span>
                          </div>
                        ),
                      },
                      {
                        key: 'hidden',
                        label: 'Visibility',
                        sortable: true,
                        headerClassName: "text-center",
                        render: (a: NetworkAlias) => (
                          <div className="flex justify-center">
                            {a.hidden ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-xs px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600 border border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 cursor-help">
                                      Hidden
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Not included in network management interface
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-xs px-1.5 py-0.5 rounded-md bg-green-100 text-green-800 border border-green-700 cursor-help">
                                      Visible
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Included in network management interface
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        ),
                      },
                      {
                        key: 'actions',
                        label: 'Actions',
                        sortable: false,
                        render: (a: NetworkAlias) => (
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" onClick={() => handleOpenEdit(a)}>
                              <Edit className="h-3 w-3 mr-1" /> Edit
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => handleOpenDelete(a)}>
                              <Trash2 className="h-3 w-3 mr-1" /> Delete
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
                              {(() => {
                                const items = a.content.split('\n').filter(c => c.trim());
                                if (items.length <= 1) {
                                  return <Badge variant="outline" className="font-mono text-xs mt-1 max-w-full truncate inline-block">{items[0] || a.content}</Badge>;
                                }
                                return (
                                  <Badge
                                    variant="outline"
                                    className="font-mono text-xs mt-1 cursor-pointer"
                                    onClick={() => setViewingCidrs(items)}
                                  >
                                    {items.length} CIDRs
                                  </Badge>
                                );
                              })()}
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
            <Button onClick={handleSubmitEdit} disabled={isEditSubmitting || (
              editForm.name === editingAlias?.name &&
              editForm.content === editingAlias?.content &&
              editForm.description === (editingAlias?.description ?? '') &&
              editForm.enabled === (editingAlias?.enabled === '1') &&
              editForm.hidden === (editingAlias?.hidden ?? false)
            )}>
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

      {/* CIDR List Dialog */}
      <CidrListDialog
        open={viewingCidrs !== null}
        onOpenChange={open => { if (!open) setViewingCidrs(null); }}
        cidrs={viewingCidrs ?? []}
        title="CIDR Addresses"
      />

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
  const [cidrInput, setCidrInput] = useState('');
  const [cidrError, setCidrError] = useState<string | null>(null);

  const cidrs = form.content.split('\n').filter(c => c.trim());

  const addCidr = () => {
    const val = cidrInput.trim();
    if (!val) return;
    if (!CIDR_REGEX.test(val)) {
      setCidrError('Must be a valid CIDR range (e.g. 192.168.1.0/24)');
      return;
    }
    if (cidrs.includes(val)) {
      setCidrError('This CIDR already exists');
      return;
    }
    const newContent = [...cidrs, val].join('\n');
    onChange({ content: newContent });
    setCidrInput('');
    setCidrError(null);
  };

  const removeCidr = (index: number) => {
    const updated = cidrs.filter((_, i) => i !== index);
    onChange({ content: updated.join('\n') });
  };

  const handleCidrKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCidr();
    }
  };

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
        <Label htmlFor="alias-cidr-input">CIDR Content *</Label>
        <div className="flex gap-2">
          <Input
            id="alias-cidr-input"
            value={cidrInput}
            onChange={e => { setCidrInput(e.target.value); setCidrError(null); }}
            onKeyDown={handleCidrKeyDown}
            placeholder="192.168.1.0/24"
            className="flex-1"
          />
          <Button type="button" variant="outline" size="sm" onClick={addCidr} disabled={!cidrInput.trim()}>
            <PlusCircle className="h-4 w-4" />
          </Button>
        </div>
        {cidrError && <p className="text-xs text-destructive">{cidrError}</p>}
        {errors.content && <p className="text-xs text-destructive">{errors.content}</p>}
        {cidrs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {cidrs.map((cidr, i) => (
              <Badge key={i} variant="secondary" className="font-mono text-xs pr-1 gap-1">
                {cidr}
                <button
                  type="button"
                  onClick={() => removeCidr(i)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
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
      <div className="flex items-center gap-2">
        <Switch
          id="alias-hidden"
          checked={form.hidden}
          onCheckedChange={checked => onChange({ hidden: checked })}
        />
        <Label htmlFor="alias-hidden">Hide</Label>
      </div>
    </div>
  );
}
