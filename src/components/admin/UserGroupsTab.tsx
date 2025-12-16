'use client';

declare module '@/components/admin/UserGroupMembersDialog' {
  interface UserGroupMembersDialogProps {
    group: import('@prisma/client').Group | null;
    isOpen: boolean;
    onClose: () => void;
    onSaveSuccess: (groupId: string, newCount: number) => void;
  }
  export default function UserGroupMembersDialog(props: UserGroupMembersDialogProps): JSX.Element;
}

declare module '@/components/admin/GroupHostAliasPermissionsDialog' {
  interface GroupHostAliasPermissionsDialogProps {
    group: import('@prisma/client').Group | null;
    isOpen: boolean;
    onClose: () => void;
    onSaveSuccess: (groupId: string, newCount: number) => void;
  }
  export default function GroupHostAliasPermissionsDialog(props: GroupHostAliasPermissionsDialogProps): JSX.Element;
}

import type { Group } from '@prisma/client';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';

interface GroupWithCount extends Group {
  _count?: {
    users?: number;
    hostAliasPermissions?: number;
    networkFilters?: number; // Add network filters count
  };
}

// Define types for tooltip data
interface UserForTooltip {
  id: string;
  email: string;
  isSso?: boolean; // Add this property to distinguish SSO users
}

interface AliasForTooltip {
  uuid: string;
  name: string;
  description?: string;
}

interface FilterForTooltip {
  uuid: string;
  name: string;
  description?: string;
  pattern: string;
}

import { Button } from '@/components/ui/button';
import UserGroupMembersDialogOriginal from '@/components/admin/UserGroupMembersDialog';
import SsoGroupMembersDialog from '@/components/admin/SsoGroupMembersDialog'; // Corrected import path
import GroupHostAliasPermissionsDialogOriginal from '@/components/admin/GroupHostAliasPermissionsDialog';
import { GroupNetworkFiltersManager, GroupNetworkFiltersManagerRef } from '@/components/admin/GroupNetworkFiltersManager'; // Import the new component and its ref type
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { SortableTable } from "@/components/ui/sortable-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'; // Import Tooltip components
import { Users as UsersIcon, PlusCircle, Edit, Trash2, Loader2, ShieldAlert, AlertCircle as AlertCircleIcon, RefreshCcw, XCircle } from 'lucide-react';
import { ClientOnly } from '@/components/util/ClientOnly';
// Removed unused import Badge
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useIsMobile, useIsPhone } from '@/hooks/use-mobile'; // Import the useIsMobile hook
import { ScrollArea } from "@/components/ui/scroll-area"; // Import ScrollArea
import { cn } from '@/lib/utils'; // Import cn utility

// Augment props for UserGroupMembersDialog
interface UserGroupMembersDialogWithSaveSuccessProps extends React.ComponentProps<typeof UserGroupMembersDialogOriginal> {
  onSaveSuccess: (groupId: string, newCount: number) => void;
}
const UserGroupMembersDialog = UserGroupMembersDialogOriginal as React.ComponentType<UserGroupMembersDialogWithSaveSuccessProps>;

// Augment props for GroupHostAliasPermissionsDialog
interface GroupHostAliasPermissionsDialogWithSaveSuccessProps extends React.ComponentProps<typeof GroupHostAliasPermissionsDialogOriginal> {
  onSaveSuccess: (groupId: string, newCount: number) => void;
}
const GroupHostAliasPermissionsDialog = GroupHostAliasPermissionsDialogOriginal as React.ComponentType<GroupHostAliasPermissionsDialogWithSaveSuccessProps>;


interface UserGroupsTabProps {
  mounted: boolean;
  groups: GroupWithCount[];
  isLoadingInitialData: boolean;
  isRefreshing: boolean;
  groupsError: string | null;
  onRefresh: (inPlace?: boolean) => void;
  // New props for lifted tooltip data
  allTooltipMembers: { [groupId: string]: UserForTooltip[] };
  allTooltipAliases: { [groupId: string]: AliasForTooltip[] };
  allTooltipFilters: { [groupId: string]: FilterForTooltip[] };
  allLoadingTooltip: { [groupId: string]: boolean };
  fetchMembersForTooltip: (groupId: string) => Promise<void>;
  fetchAliasesForTooltip: (groupId: string) => Promise<void>;
  fetchFiltersForTooltip: (groupId: string) => Promise<void>;
  isSsoEnabled: boolean;
  sortBy: string;
  sortDirection: 'asc' | 'desc';
  onSortChange: (newSortBy: string, newSortDirection: 'asc' | 'desc') => void;
  // Add pagination props
  currentPage: number;
  pageSize: number | 'ALL';
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number | 'ALL') => void;
  // Add search props to persist across tab switches
  searchTerm: string;
  onSearchTermChange: (searchTerm: string) => void;
}

export default function UserGroupsTab({
  groups,
  isLoadingInitialData,
  isRefreshing,
  groupsError,
  onRefresh,
  // Destructure new props
  allTooltipMembers,
  allTooltipAliases,
  allTooltipFilters,
  allLoadingTooltip,
  fetchMembersForTooltip,
  fetchAliasesForTooltip,
  fetchFiltersForTooltip,
  isSsoEnabled,
  sortBy,
  sortDirection,
  onSortChange,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  searchTerm,
  onSearchTermChange,
}: UserGroupsTabProps) {
  const { toast } = useToast();
  const isMobileView = useIsMobile();
  const isPhone = useIsPhone();

  const [isProcessing, setIsProcessing] = useState(false);
  const [isButtonRefreshing, setIsButtonRefreshing] = useState(false);
  // SSO enabled state is now managed by the parent and passed as a prop
  // searchTerm is now managed by parent component and passed as prop
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm || '');

  // Pagination state
  // const [currentPage, setCurrentPage] = useState(1);
  // const [pageSize, setPageSize] = useState<number | 'ALL'>(5); // Default to 5 entries

  // Removed internal state for tooltip data and their refs
  // const [tooltipMembers, setTooltipMembers] = useState<{ [groupId: string]: UserForTooltip[] }>({});
  // const [tooltipAliases, setTooltipAliases] = useState<{ [groupId: string]: AliasForTooltip[] }>({});
  // const [tooltipFilters, setTooltipFilters] = useState<{ [groupId: string]: FilterForTooltip[] }>({});
  // const [loadingTooltip, setLoadingTooltip] = useState<{ [groupId: string]: boolean }>({});

  // Removed refs for stable access to state within callbacks
  // const tooltipMembersRef = useRef(tooltipMembers);
  // const tooltipAliasesRef = useRef(tooltipAliases);
  // const tooltipFiltersRef = useRef(tooltipFilters);
  // const loadingTooltipRef = useRef(loadingTooltip);

  // Removed useEffects to update refs when state changes
  // useEffect(() => {
  //   tooltipMembersRef.current = tooltipMembers;
  // }, [tooltipMembers]);
  // useEffect(() => {
  //   tooltipAliasesRef.current = tooltipAliases;
  // }, [tooltipAliases]);
  // useEffect(() => {
  //   tooltipFiltersRef.current = tooltipFilters;
  // }, [tooltipFilters]);
  // useEffect(() => {
  //   loadingTooltipRef.current = loadingTooltip;
  // }, [loadingTooltip]);

  // Debounce search term from parent
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm || '');
    }, 300); // 300ms debounce

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm]);

  const [isAddGroupDialogOpen, setIsAddGroupDialogOpen] = useState(false);
  const [newGroupFormData, setNewGroupFormData] = useState({ name: '', description: '' });
  const [addGroupFormErrors, setAddGroupFormErrors] = useState<Partial<Record<'name' | 'description' | '_form', string>>>({});


  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [groupToEdit, setGroupToEdit] = useState<Group | null>(null);
  const [editGroupFormData, setEditGroupFormData] = useState({ name: '', description: '' });
  const [editGroupFormErrors, setEditGroupFormErrors] = useState<Partial<Record<'name' | 'description' | '_form', string>>>({});

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<GroupWithCount | null>(null); // Changed type to GroupWithCount | null

  const [isMembersDialogOpen, setIsMembersDialogOpen] = useState(false);
  const [groupForMembers, setGroupForMembers] = useState<Group | null>(null);

  // State for SSO Members Dialog
  const [isSsoMembersDialogOpen, setIsSsoMembersDialogOpen] = useState(false);
  const [groupForSsoMembers, setGroupForSsoMembers] = useState<Group | null>(null);

  // State for Host Alias Permissions Dialog
  const [isHostAliasPermissionsDialogOpen, setIsHostAliasPermissionsDialogOpen] = useState(false);
  const [groupForHostAliasPermissions, setGroupForHostAliasPermissions] = useState<Group | null>(null);

  // State for Network Filters Dialog
  const [isNetworkFiltersDialogOpen, setIsNetworkFiltersDialogOpen] = useState(false);
  const [groupForNetworkFilters, setGroupForNetworkFilters] = useState<Group | null>(null);

  // Removed internal fetchMembersForTooltip
  // const fetchMembersForTooltip = useCallback(async (groupId: string) => { /* ... */ }, []);

  // Removed internal fetchAliasesForTooltip
  // const fetchAliasesForTooltip = useCallback(async (groupId: string) => { /* ... */ }, [toast]);

  // Removed internal fetchFiltersForTooltip
  // const fetchFiltersForTooltip = useCallback(async (groupId: string) => { /* ... */ }, [toast]);

  // New handler for updating specific group counts
  const handleGroupCountUpdate = useCallback(() => {
    onRefresh(); // Trigger parent refresh to update the groups data, including counts
  }, [onRefresh]);

  // SSO enabled state is now managed by the parent and passed as a prop

  // Removed proactive fetch tooltip data (now in parent)
  // useEffect(() => {
  //   if (groups.length > 0) {
  //     groups.forEach(group => {
  //       fetchMembersForTooltip(group.id);
  //       fetchAliasesForTooltip(group.id);
  //       fetchFiltersForTooltip(group.id);
  //     });
  // }
  // }, [groups, debouncedSearchTerm, fetchMembersForTooltip, fetchAliasesForTooltip, fetchFiltersForTooltip]);

  const filteredGroups = groups.filter((group: GroupWithCount) => {
    const lowerCaseSearchTerm = debouncedSearchTerm.toLowerCase();

    // Search by group name and description
    if (group.name.toLowerCase().includes(lowerCaseSearchTerm) ||
      group.description?.toLowerCase().includes(lowerCaseSearchTerm)) {
      return true;
    }

    // If a search term is active, also search within members, aliases, and filters
    if (lowerCaseSearchTerm) {
      // Search by members (SSO and Local)
      const members = allTooltipMembers[group.id]; // Use prop
      if (members && members.some((member: UserForTooltip) => member.email.toLowerCase().includes(lowerCaseSearchTerm))) {
        return true;
      }

      // Search by host aliases
      const aliases = allTooltipAliases[group.id]; // Use prop
      if (aliases && aliases.some((alias: AliasForTooltip) =>
        alias.name.toLowerCase().includes(lowerCaseSearchTerm) ||
        alias.description?.toLowerCase().includes(lowerCaseSearchTerm)
      )) {
        return true;
      }

      // Search by network filters
      const filters = allTooltipFilters[group.id]; // Use prop
      if (filters && filters.some((filter: FilterForTooltip) =>
        filter.pattern.toLowerCase().includes(lowerCaseSearchTerm) ||
        filter.name?.toLowerCase().includes(lowerCaseSearchTerm) ||
        filter.description?.toLowerCase().includes(lowerCaseSearchTerm)
      )) {
        return true;
      }
    }

    return false;
  });

  // Pagination logic
  const totalItems = filteredGroups.length;
  const totalPages = pageSize === 'ALL' ? 1 : Math.ceil(totalItems / pageSize);

  // Reset to first page when search term changes or when current page is greater than total pages
  useEffect(() => {
    if (totalPages === 0 && currentPage !== 1) {
      onPageChange(1);
    } else if (currentPage > totalPages && totalPages > 0) {
      onPageChange(1);
    }
  }, [debouncedSearchTerm, currentPage, totalPages, onPageChange]);

  // Get paginated data
  const paginatedGroups = useMemo(() => {
    if (pageSize === 'ALL') {
      return filteredGroups;
    }

    if (isPhone) {
      return filteredGroups.slice(0, currentPage * pageSize);
    }

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredGroups.slice(startIndex, endIndex);
  }, [filteredGroups, currentPage, pageSize, isPhone]);





  const handleEditGroup = (group: Group) => {
    setGroupToEdit(group);
    setEditGroupFormData({ name: group.name, description: group.description || '' });
    setIsEditDialogOpen(true);
  };

  const handleEditGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupToEdit) return;

    setIsProcessing(true);
    setEditGroupFormErrors({});

    const response = await fetch(`/api/admin/groups/${groupToEdit.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(editGroupFormData),
    });

    const result = await response.json();

    if (response.ok) {
      toast({ title: "Success", description: "Group updated successfully.", variant: "success" });
      // Dynamically update the state instead of refetching all data
      // setGroups(prevGroups =>
      //   prevGroups.map(group =>
      //     group.id === groupToEdit!.id
      //       ? { ...group, name: editGroupFormData.name, description: editGroupFormData.description }
      //       : group
      //   )
      // );
      onRefresh(); // Trigger parent refresh to update the groups data
      setIsEditDialogOpen(false);
      setGroupToEdit(null);
      setEditGroupFormData({ name: '', description: '' });
    } else {
      const errorMsg = result.message || "An unknown error occurred.";
      toast({ variant: "destructive", title: "Error", description: errorMsg });
      setEditGroupFormErrors(prev => ({ ...prev, _form: errorMsg }));
    }
    setIsProcessing(false);
  };

  const handleManageMembers = (group: Group) => {
    setGroupForMembers(group);
    setIsMembersDialogOpen(true);
  };

  const handleCloseMembersDialog = () => {
    setIsMembersDialogOpen(false);
    setGroupForMembers(null);
    // The dialog is expected to call onSaveSuccess with updated counts.
  };

  const handleViewSsoMembers = (group: Group) => {
    setGroupForSsoMembers(group);
    setIsSsoMembersDialogOpen(true);
  };

  const handleCloseSsoMembersDialog = () => {
    setIsSsoMembersDialogOpen(false);
    setGroupForSsoMembers(null);
  };


  const handleAddGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setAddGroupFormErrors({});

    const response = await fetch('/api/admin/groups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newGroupFormData),
    });

    const result = await response.json();

    if (response.ok) {
      toast({ title: "Success", description: "Group created successfully.", variant: "success" });
      // fetchGroupsData(); // Removed - now handled by parent refresh
      if (onRefresh) {
        onRefresh(); // Call the callback to notify parent of change
      }
      setIsAddGroupDialogOpen(false);
      setNewGroupFormData({ name: '', description: '' });
    } else {
      const errorMsg = result.message || "An unknown error occurred.";
      toast({ variant: "destructive", title: "Error", description: errorMsg });
      setAddGroupFormErrors(prev => ({ ...prev, _form: errorMsg }));
    }
    setIsProcessing(false);
  };

  // Ref for GroupNetworkFiltersManager
  const networkFiltersManagerRef = useRef<GroupNetworkFiltersManagerRef>(null);

  // Host Alias Permissions
  const handleManageHostAliasPermissions = (group: Group) => {
    setGroupForHostAliasPermissions(group);
    setIsHostAliasPermissionsDialogOpen(true);
  };
  const handleCloseHostAliasPermissionsDialog = () => {
    setIsHostAliasPermissionsDialogOpen(false);
    setGroupForHostAliasPermissions(null);
  };

  // Network Filters
  const handleManageNetworkFilters = (group: Group) => {
    setGroupForNetworkFilters(group);
    setIsNetworkFiltersDialogOpen(true);
  };
  const handleCloseNetworkFiltersDialog = () => {
    setIsNetworkFiltersDialogOpen(false);
    setGroupForNetworkFilters(null);
  };

  // Delete Group
  const handleDeleteGroup = (group: GroupWithCount) => {
    setGroupToDelete(group);
    setIsDeleteDialogOpen(true);
  };
  const confirmDeleteGroup = async () => {
    if (!groupToDelete) return;
    setIsProcessing(true);
    try {
      const response = await fetch(`/api/admin/groups/${groupToDelete.id}`, { method: 'DELETE' });
      if (response.ok) {
        toast({ title: "Success", description: "Group deleted successfully.", variant: "success" });
        onRefresh();
        setIsDeleteDialogOpen(false);
        setGroupToDelete(null);
      } else {
        const result = await response.json();
        toast({ variant: "destructive", title: "Error", description: result.message || "Could not delete group." });
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not delete group." });
    }
    setIsProcessing(false);
  };

  // Removed local sortBy, sortDirection, handleSortChange

  return (
    <>
      <Card className="flex flex-col flex-1 mb-0 min-h-0">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0 pb-4">
          <div>
            <CardTitle className={`flex items-center ${isMobileView ? 'text-xl' : 'text-2xl'}`}>
              <ClientOnly><UsersIcon size={28} className="mr-2 text-primary" /></ClientOnly> User Groups
            </CardTitle>
            {!isMobileView && <CardDescription>Manage user groups and their permissions.</CardDescription>}
          </div>
          <div className="flex w-full justify-end md:w-auto">
            <Button
              variant="outline"
              onClick={() => onRefresh(false)}
              disabled={isRefreshing}
              className={cn("mr-2", isMobileView && "size-9 p-0")}
            >
              <ClientOnly>
                {isRefreshing ? (
                  <Loader2 className={cn("h-4 w-4 animate-spin", !isMobileView && "mr-2")} />
                ) : (
                  <RefreshCcw className={cn("h-4 w-4", !isMobileView && "mr-2")} />
                )}
              </ClientOnly>
              {!isMobileView && "Refresh"}
            </Button>
            <Button onClick={() => setIsAddGroupDialogOpen(true)} className={cn(isMobileView && "size-9 p-0")}>
              <ClientOnly>
                <PlusCircle className={cn("h-4 w-4", !isMobileView && "mr-2")} />
              </ClientOnly>
              {!isMobileView && "Add Group"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-6 relative flex-1 overflow-hidden flex flex-col">
          {/* Search Input for Groups */}
          <div className="relative max-w-sm">
            <Input
              type="search"
              placeholder="Search groups..."
              value={searchTerm || ''}
              onChange={(e) => onSearchTermChange(e.target.value)}
              className="pr-8"
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                onClick={() => onSearchTermChange("")}
              >
                <XCircle className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
          </div>
          {
            (() => {
              if (isLoadingInitialData) {
                return (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                );
              } else if (groupsError) {
                return (
                  <Alert variant="destructive">
                    <ClientOnly><AlertCircleIcon className="h-4 w-4" /></ClientOnly>
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{groupsError}</AlertDescription>
                  </Alert>
                );
              } else if (paginatedGroups.length === 0) {
                return (
                  <p className="text-muted-foreground text-center">No groups found.</p>
                );
              }
              else {
                // Conditional rendering based on isMobileView
                return isMobileView ? (
                  // Mobile Card View
                  <ScrollArea className="flex-1 pr-4 -mr-4">
                    <div className="space-y-4 pr-4">
                      {paginatedGroups.map((group) => {
                        const localMembersCount = allTooltipMembers[group.id]?.filter(member => !member.isSso).length || 0;
                        const ssoMembersCount = allTooltipMembers[group.id]?.filter(member => member.isSso).length || 0;
                        return (
                          <Card key={group.id} className="shadow-sm">
                            <CardHeader className="pb-2">
                              <CardTitle className={'text-lg'}>{group.name}</CardTitle>
                              {group.description && <CardDescription>{group.description || 'No description'}</CardDescription>}
                            </CardHeader>
                            <CardContent className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="font-medium">Members:</span>
                                <span className="flex items-center gap-2">
                                  <TooltipProvider>
                                    <Tooltip onOpenChange={(open) => {
                                      if (open) {
                                        fetchMembersForTooltip(group.id); // Use prop
                                      }
                                    }}>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleManageMembers(group)}>
                                          <ClientOnly><UsersIcon className="h-3 w-3 mr-1" /></ClientOnly>
                                          {localMembersCount}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {allLoadingTooltip[group.id] ? (
                                          <span>Loading local members...</span>
                                        ) : allTooltipMembers[group.id]?.filter((member: UserForTooltip) => !member.isSso).length > 0 ? (
                                          <ul>
                                            {allTooltipMembers[group.id].filter((member: UserForTooltip) => !member.isSso).slice(0, 10).map((member: UserForTooltip) => (
                                              <li key={member.id}>{member.email}</li>
                                            ))}
                                            {allTooltipMembers[group.id].filter((member: UserForTooltip) => !member.isSso).length > 10 && <li>...</li>}
                                          </ul>
                                        ) : (
                                          <span>No local members</span>
                                        )}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>

                                  {isSsoEnabled && (
                                    <TooltipProvider>
                                      <Tooltip onOpenChange={(open) => {
                                        if (open) {
                                          fetchMembersForTooltip(group.id); // Use prop
                                        }
                                      }}>
                                        <TooltipTrigger asChild>
                                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleViewSsoMembers(group)} disabled={isSsoEnabled ? isProcessing : true}>
                                            <ClientOnly><UsersIcon className="h-3 w-3 mr-1" /></ClientOnly>
                                            {ssoMembersCount}
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {allLoadingTooltip[group.id] ? (
                                            <span>Loading SSO members...</span>
                                          ) : allTooltipMembers[group.id]?.filter((member: UserForTooltip) => member.isSso).length > 0 ? (
                                            <ul>
                                              {allTooltipMembers[group.id].filter((member: UserForTooltip) => member.isSso).slice(0, 10).map((member: UserForTooltip) => (
                                                <li key={member.id}>{member.email}</li>
                                              ))}
                                              {allTooltipMembers[group.id].filter((member: UserForTooltip) => member.isSso).length > 10 && <li>...</li>}
                                            </ul>
                                          ) : (
                                            <span>No SSO members</span>
                                          )}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="font-medium">Host Aliases:</span>
                                <TooltipProvider>
                                  <Tooltip onOpenChange={(open) => {
                                    if (open) {
                                      fetchAliasesForTooltip(group.id); // Use prop
                                    }
                                  }}>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleManageHostAliasPermissions(group)}>
                                        <ClientOnly><ShieldAlert className="h-3 w-3 mr-1" /></ClientOnly>
                                        {group._count?.hostAliasPermissions || 0}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {allLoadingTooltip[group.id] ? (
                                        <span>Loading aliases...</span>
                                      ) : allTooltipAliases[group.id]?.length > 0 ? (
                                        <ul>
                                          {allTooltipAliases[group.id].slice(0, 10).map((alias: AliasForTooltip, index: number) => (
                                            <li key={alias.uuid || index}>{alias.name}</li>
                                          ))}
                                          {allTooltipAliases[group.id].length > 10 && <li>...</li>}
                                        </ul>
                                      ) : (
                                        <span>No host aliases</span>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="font-medium">Network Filters:</span>
                                <TooltipProvider>
                                  <Tooltip onOpenChange={(open) => {
                                    if (open) {
                                      fetchFiltersForTooltip(group.id); // Use prop
                                    }
                                  }}>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleManageNetworkFilters(group)}>
                                        <ClientOnly><AlertCircleIcon className="h-3 w-3 mr-1" /></ClientOnly>
                                        {group._count?.networkFilters || 0}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {allLoadingTooltip[group.id] ? (
                                        <span>Loading filters...</span>
                                      ) : allTooltipFilters[group.id]?.length > 0 ? (
                                        <ul>
                                          {allTooltipFilters[group.id].slice(0, 10).map((filter: FilterForTooltip, index: number) => (
                                            <li key={filter.uuid || index}>{filter.pattern}</li>
                                          ))}
                                          {allTooltipFilters[group.id].length > 10 && <li>...</li>}
                                        </ul>
                                      ) : (
                                        <span>No network filters</span>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                              <div className="flex justify-end space-x-2 mt-2">
                                <Button variant="outline" size="icon" onClick={() => handleEditGroup(group)}>
                                  <ClientOnly><Edit className="h-3 w-3" /></ClientOnly>
                                </Button>
                                <Button variant="destructive" size="icon" onClick={() => handleDeleteGroup(group)}>
                                  <ClientOnly><Trash2 className="h-3 w-3" /></ClientOnly>
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </ScrollArea>
                ) : (
                  // Desktop Table View
                  <ScrollArea className="flex-1 pr-4 -mr-4">
                    <SortableTable<GroupWithCount>
                      data={paginatedGroups}
                      columns={[
                        {
                          key: 'name',
                          label: 'Name',
                          sortable: true,
                          render: (group: GroupWithCount) => (
                            <span className="font-medium">{group.name}</span>
                          ),
                        },
                        {
                          key: 'description',
                          label: 'Description',
                          sortable: true,
                          render: (group: GroupWithCount) => group.description || '-',
                        },
                        {
                          key: '_count.users',
                          label: 'Total Members',
                          sortable: true,
                          render: (group: GroupWithCount) => (
                            <span>{group._count?.users || 0}</span>
                          ),
                        },
                        {
                          key: 'actions',
                          label: 'Actions',
                          headerClassName: 'text-left',
                          render: (group: GroupWithCount) => {
                            const localMembersCount = allTooltipMembers[group.id]?.filter((member: UserForTooltip) => !member.isSso).length || 0;
                            const ssoMembersCount = allTooltipMembers[group.id]?.filter((member: UserForTooltip) => member.isSso).length || 0;
                            return (
                              <div className="text-left space-x-2">
                                <Button variant="outline" size="sm" onClick={() => handleEditGroup(group)} disabled={isProcessing}>
                                  <ClientOnly><Edit className="h-3 w-3 mr-1" /></ClientOnly> Edit
                                </Button>
                                <TooltipProvider>
                                  <Tooltip onOpenChange={(open) => {
                                    if (open) {
                                      fetchMembersForTooltip(group.id); // Use prop
                                    }
                                  }}>
                                    <TooltipTrigger asChild>
                                      <Button variant="outline" size="sm" onClick={() => handleViewSsoMembers(group)} disabled={isSsoEnabled ? isProcessing : true}>
                                        <ClientOnly><UsersIcon className="h-3 w-3 mr-1" /></ClientOnly> SSO Members ({ssoMembersCount})
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {allLoadingTooltip[group.id] ? (
                                        <span>Loading SSO members...</span>
                                      ) : allTooltipMembers[group.id]?.filter((member: UserForTooltip) => member.isSso).length > 0 ? (
                                        <ul>
                                          {allTooltipMembers[group.id].filter((member: UserForTooltip) => member.isSso).slice(0, 10).map((member: UserForTooltip) => (
                                            <li key={member.id}>{member.email}</li>
                                          ))}
                                          {allTooltipMembers[group.id].filter((member: UserForTooltip) => member.isSso).length > 10 && <li>...</li>}
                                        </ul>
                                      ) : (
                                        <span>No SSO members</span>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider>
                                  <Tooltip onOpenChange={(open) => {
                                    if (open) {
                                      fetchMembersForTooltip(group.id); // Use prop
                                    }
                                  }}>
                                    <TooltipTrigger asChild>
                                      <Button variant="outline" size="sm" onClick={() => handleManageMembers(group)} disabled={isProcessing}>
                                        <ClientOnly><UsersIcon className="h-3 w-3 mr-1" /></ClientOnly> Local Members ({localMembersCount})
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {allLoadingTooltip[group.id] ? (
                                        <span>Loading local members...</span>
                                      ) : allTooltipMembers[group.id]?.filter((member: UserForTooltip) => !member.isSso).length > 0 ? (
                                        <ul>
                                          {allTooltipMembers[group.id].filter((member: UserForTooltip) => !member.isSso).slice(0, 10).map((member: UserForTooltip) => (
                                            <li key={member.id}>{member.email}</li>
                                          ))}
                                          {allTooltipMembers[group.id].filter((member: UserForTooltip) => !member.isSso).length > 10 && <li>...</li>}
                                        </ul>
                                      ) : (
                                        <span>No local members</span>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider>
                                  <Tooltip onOpenChange={(open) => {
                                    if (open) {
                                      fetchAliasesForTooltip(group.id); // Use prop
                                    }
                                  }}>
                                    <TooltipTrigger asChild>
                                      <Button variant="outline" size="sm" onClick={() => handleManageHostAliasPermissions(group)} disabled={isProcessing}>
                                        <ClientOnly><ShieldAlert className="h-3 w-3 mr-1" /></ClientOnly> Aliases ({group._count?.hostAliasPermissions || 0})
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {allLoadingTooltip[group.id] ? (
                                        <span>Loading aliases...</span>
                                      ) : allTooltipAliases[group.id]?.length > 0 ? (
                                        <ul>
                                          {allTooltipAliases[group.id].slice(0, 10).map((alias: AliasForTooltip, index: number) => (
                                            <li key={alias.uuid || index}>{alias.name}</li>
                                          ))}
                                          {allTooltipAliases[group.id].length > 10 && <li>...</li>}
                                        </ul>
                                      ) : (
                                        <span>No host aliases</span>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider>
                                  <Tooltip onOpenChange={(open) => {
                                    if (open) {
                                      fetchFiltersForTooltip(group.id); // Use prop
                                    }
                                  }}>
                                    <TooltipTrigger asChild>
                                      <Button variant="outline" size="sm" onClick={() => handleManageNetworkFilters(group)} disabled={isProcessing}>
                                        <ClientOnly><AlertCircleIcon className="h-3 w-3 mr-1" /></ClientOnly> Filters ({group._count?.networkFilters || 0})
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {allLoadingTooltip[group.id] ? (
                                        <span>Loading filters...</span>
                                      ) : allTooltipFilters[group.id]?.length > 0 ? (
                                        <ul>
                                          {allTooltipFilters[group.id].slice(0, 10).map((filter: FilterForTooltip, index: number) => (
                                            <li key={filter.uuid || index}>{filter.pattern}</li>
                                          ))}
                                          {allTooltipFilters[group.id].length > 10 && <li>...</li>}
                                        </ul>
                                      ) : (
                                        <span>No network filters</span>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <Button variant="destructive" size="sm" onClick={() => handleDeleteGroup(group)} disabled={isProcessing}>
                                  <ClientOnly><Trash2 className="h-3 w-3 mr-1" /></ClientOnly> Delete
                                </Button>
                              </div>
                            );
                          },
                        },
                      ]}
                      sortBy={sortBy}
                      sortDirection={sortDirection}
                      onSortChange={onSortChange}

                    />
                  </ScrollArea>
                );
              }
            })()
          }
          {/* Pagination Controls */}
          {isLoadingInitialData ? (
            <div className="mt-4">
              <Skeleton className="h-6 w-32" />
            </div>
          ) : (
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
              isLoading={isLoadingInitialData || isButtonRefreshing}
              isLoadMoreMode={isPhone}
              pageSizeOptions={[5, 10, 50, 100, 500]}
              showAllOption={true}
            />
          )}
        </CardContent>
      </Card>


      {/* Add Group Dialog */}
      <Dialog open={isAddGroupDialogOpen} onOpenChange={(open) => { setIsAddGroupDialogOpen(open); if (!open) { setAddGroupFormErrors({}); setIsProcessing(false); } }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Local Group</DialogTitle>
            <DialogDescription>
              Fill in the details for the new local group.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddGroupSubmit} className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="group-name" className="text-right">Name</Label>
              <Input
                id="group-name"
                name="name"
                value={newGroupFormData.name}
                onChange={(e) => {
                  setNewGroupFormData(prev => ({ ...prev, name: e.target.value }));
                  setAddGroupFormErrors(prev => ({ ...prev, name: undefined, _form: undefined }));
                }}
                className="col-span-3"
                disabled={isProcessing}
              />
            </div>
            {addGroupFormErrors.name && <p className="text-sm text-destructive mt-1 col-span-4 col-start-1 text-right">{addGroupFormErrors.name}</p>}

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="group-description" className="text-right">Description</Label>
              <Input
                id="group-description"
                name="description"
                value={newGroupFormData.description}
                onChange={(e) => {
                  setNewGroupFormData(prev => ({ ...prev, description: e.target.value }));
                  setAddGroupFormErrors(prev => ({ ...prev, description: undefined, _form: undefined }));
                }}
                className="col-span-3"
                disabled={isProcessing}
              />
            </div>
            {addGroupFormErrors.description && <p className="text-sm text-destructive mt-1 col-span-4 col-start-1 text-right">{addGroupFormErrors.description}</p>}

            {addGroupFormErrors._form && (
              <Alert variant="destructive" className="col-span-4">
                <ClientOnly><AlertCircleIcon className="h-4 w-4" /></ClientOnly>
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{addGroupFormErrors._form}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isProcessing}>Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={isProcessing}>
                <ClientOnly fallback={null}>
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                </ClientOnly>
                Create Group
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>


      {/* Edit Group Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) { setEditGroupFormErrors({}); setIsProcessing(false); } }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Group</DialogTitle>
            <DialogDescription>
              Edit the details for the group &quot;{groupToEdit?.name}&quot;.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditGroupSubmit} className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-group-name" className="text-right">Name</Label>
              <Input
                id="edit-group-name"
                name="name"
                value={editGroupFormData.name}
                onChange={(e) => {
                  setEditGroupFormData(prev => ({ ...prev, name: e.target.value }));
                  setEditGroupFormErrors(prev => ({ ...prev, name: undefined, _form: undefined }));
                }}
                className="col-span-3"
                disabled={isProcessing}
              />
            </div>
            {editGroupFormErrors.name && <p className="text-sm text-destructive mt-1 col-span-4 col-start-1 text-right">{editGroupFormErrors.name}</p>}

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-group-description" className="text-right">Description</Label>
              <Input
                id="edit-group-description"
                name="description"
                value={editGroupFormData.description}
                onChange={(e) => {
                  setEditGroupFormData(prev => ({ ...prev, description: e.target.value }));
                  setEditGroupFormErrors(prev => ({ ...prev, description: undefined, _form: undefined }));
                }}
                className="col-span-3"
                disabled={isProcessing}
              />
            </div>
            {editGroupFormErrors.description && <p className="text-sm text-destructive mt-1 col-span-4 col-start-1 text-right">{editGroupFormErrors.description}</p>}

            {editGroupFormErrors._form && (
              <Alert variant="destructive" className="col-span-4">
                <ClientOnly><AlertCircleIcon className="h-4 w-4" /></ClientOnly>
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{editGroupFormErrors._form}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isProcessing}>Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={isProcessing}>
                <ClientOnly fallback={null}>
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                </ClientOnly>
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Group Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => { setIsDeleteDialogOpen(open); if (!open) setIsProcessing(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the group &quot;{groupToDelete?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isProcessing}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteGroup} disabled={isProcessing}>
              <ClientOnly fallback={null}>
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              </ClientOnly>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <UserGroupMembersDialog
        group={groupForMembers}
        isOpen={isMembersDialogOpen}
        onClose={handleCloseMembersDialog}
        onSaveSuccess={() => {
          onRefresh(true); // in-place refresh (no skeleton)
        }}
      />

      {/* New SSO Members Dialog */}
      <SsoGroupMembersDialog
        group={groupForSsoMembers}
        isOpen={isSsoMembersDialogOpen}
        onClose={() => { handleCloseSsoMembersDialog(); setIsProcessing(false); }}
      />

      {/* New Host Alias Permissions Dialog */}
      <GroupHostAliasPermissionsDialog
        group={groupForHostAliasPermissions}
        isOpen={isHostAliasPermissionsDialogOpen}
        onClose={() => { handleCloseHostAliasPermissionsDialog(); setIsProcessing(false); }}
        onSaveSuccess={() => handleGroupCountUpdate()}
      />

      {/* New Network Filters Dialog */}
      <Dialog open={isNetworkFiltersDialogOpen} onOpenChange={(open) => { setIsNetworkFiltersDialogOpen(open); if (!open) setIsProcessing(false); }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Network Filters for &quot;{groupForNetworkFilters?.name}&quot;</DialogTitle>
            <DialogDescription>
              Configure regex patterns to filter network groups for users belonging to this group.
            </DialogDescription>
          </DialogHeader>
          {groupForNetworkFilters && (
            <GroupNetworkFiltersManager
              ref={networkFiltersManagerRef}
              groupId={groupForNetworkFilters.id}
              groupName={groupForNetworkFilters.name}
              onSaveSuccess={() => handleGroupCountUpdate()}
            // onClose is now handled by the parent DialogFooter
            />
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={networkFiltersManagerRef.current?.isSaving}>Cancel</Button>
            </DialogClose>
            <Button
              type="submit"
              onClick={async () => {
                if (networkFiltersManagerRef.current) {
                  await networkFiltersManagerRef.current.handleSaveFilters();
                  handleCloseNetworkFiltersDialog(); // Close after save
                }
              }}
              disabled={networkFiltersManagerRef.current?.isSaving}
            >
              {networkFiltersManagerRef.current?.isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}