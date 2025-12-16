'use client';

import type { Group, SsoGroupMapping } from '@prisma/client';
import { useState, useEffect, useMemo } from 'react';

// Define a type for SsoGroupMapping including the localGroup relation
interface SsoGroupMappingWithLocalGroup extends SsoGroupMapping {
  localGroup: Group;
}

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
import { logger } from '@/lib/logger';
import { PlusCircle, Loader2, AlertCircle as AlertCircleIcon, RefreshCcw, UserCheck, XCircle } from 'lucide-react';
import { ClientOnly } from '@/components/util/ClientOnly';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useIsMobile, useIsPhone } from '@/hooks/use-mobile'; // Corrected import
import { PaginationControls } from "@/components/ui/pagination-controls";
import { ScrollArea } from "@/components/ui/scroll-area"; // Import ScrollArea
import { cn } from '@/lib/utils'; // Import cn utility

interface SsoGroupMappingManagerProps {
  ssoGroupMappings: SsoGroupMappingWithLocalGroup[];
  groups: Group[]; // Need local groups for the select dropdown
  oidcProviders: { id: string; name: string }[];
  isLoadingOidcProviders: boolean; // Re-added this prop
  isLoadingInitialData: boolean;
  isRefreshing: boolean;
  ssoGroupMappingsError: string | null;
  onRefresh: () => void;
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

export default function SsoGroupMappingManager({
  ssoGroupMappings,
  groups,
  oidcProviders,
  isLoadingOidcProviders,
  isLoadingInitialData,
  isRefreshing,
  ssoGroupMappingsError,
  onRefresh,
  sortBy,
  sortDirection,
  onSortChange,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  searchTerm,
  onSearchTermChange,
}: SsoGroupMappingManagerProps) {
  const { toast } = useToast();
  const isMobileView = useIsMobile();
  const isPhone = useIsPhone();

  // Removed internal state for ssoGroupMappings, isLoadingMappings, isRefreshing, recordCount
  // const [ssoGroupMappings, setSsoGroupMappings] = useState<SsoGroupMappingWithLocalGroup[]>([]);
  // const [isLoadingMappings, setIsLoadingMappings] = useState(true); // Manage loading state internally
  const [isProcessing, setIsProcessing] = useState(false);
  const [isButtonRefreshing, setIsButtonRefreshing] = useState(false);
  // const [isRefreshing, setIsRefreshing] = useState(false); // New state for refresh button loading
  // searchTerm is now managed by parent component and passed as prop
  // const [recordCount, setRecordCount] = useState(0);

  // State for SSO Group Mapping Dialog
  const [isAddSsoMappingDialogOpen, setIsAddSsoMappingDialogOpen] = useState(false);
  const [newSsoMappingFormData, setNewSsoMappingFormData] = useState({ ssoProvider: '', ssoGroupName: '', localGroupId: '' });
  // Form errors are handled via toast notifications, no need for error state

  // State for SSO Group Mapping Edit Dialog
  const [isEditSsoMappingDialogOpen, setIsEditSsoMappingDialogOpen] = useState(false);
  const [ssoMappingToEdit, setSsoMappingToEdit] = useState<SsoGroupMappingWithLocalGroup | null>(null);
  const [editSsoMappingFormData, setEditSsoMappingFormData] = useState({ ssoProvider: '', ssoGroupName: '', localGroupId: '' });
  const [originalEditSsoMappingFormData, setOriginalEditSsoMappingFormData] = useState({ ssoProvider: '', ssoGroupName: '', localGroupId: '' });
  // Form errors are handled via toast notifications, no need for error state

  // State for SSO Group Mapping Delete Dialog
  const [isDeleteSsoMappingDialogOpen, setIsDeleteSsoMappingDialogOpen] = useState(false);
  const [ssoMappingToDelete, setSsoMappingToDelete] = useState<SsoGroupMappingWithLocalGroup | null>(null);


  const handleEditSsoMapping = (mapping: SsoGroupMappingWithLocalGroup) => {
    setSsoMappingToEdit(mapping);
    const formData = {
      ssoProvider: mapping.ssoProvider,
      ssoGroupName: mapping.ssoGroupName,
      localGroupId: mapping.localGroupId,
    };
    setEditSsoMappingFormData(formData);
    setOriginalEditSsoMappingFormData(formData);
    setIsEditSsoMappingDialogOpen(true);
  };

  const hasEditChanges = () => {
    return (
      editSsoMappingFormData.ssoProvider !== originalEditSsoMappingFormData.ssoProvider ||
      editSsoMappingFormData.ssoGroupName !== originalEditSsoMappingFormData.ssoGroupName ||
      editSsoMappingFormData.localGroupId !== originalEditSsoMappingFormData.localGroupId
    );
  };

  const handleDeleteSsoMapping = (mapping: SsoGroupMappingWithLocalGroup) => {
    setSsoMappingToDelete(mapping);
    setIsDeleteSsoMappingDialogOpen(true);
  };

  const handleEditSsoMappingSubmit = async (e: React.FormEvent) => {
    logger.debug('handleEditSsoMappingSubmit called');
    e.preventDefault();
    if (!ssoMappingToEdit) return;

    setIsProcessing(true);

    try {
      const response = await fetch(`/api/admin/group-mappings/${ssoMappingToEdit.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editSsoMappingFormData),
      });

      const result = await response.json();

      if (response.ok) {
        toast({ title: "Success", description: "SSO mapping updated successfully.", variant: "success" });
        // Update the specific mapping in the state instead of a full refresh
        // setSsoGroupMappings(prevMappings =>
        //   prevMappings.map(m =>
        //     m.id === ssoMappingToEdit.id
        //       ? { ...m, ...editSsoMappingFormData, localGroup: groups.find(g => g.id === editSsoMappingFormData.localGroupId) || m.localGroup }
        //       : m
        //   )
        // );
        onRefresh(); // Trigger parent refresh
        setIsEditSsoMappingDialogOpen(false);
        setSsoMappingToEdit(null);
        setEditSsoMappingFormData({ ssoProvider: '', ssoGroupName: '', localGroupId: '' });
      } else {
        const errorMsg = result.message || "An unknown error occurred.";
        toast({ variant: "destructive", title: "Error", description: errorMsg });
        // Backend errors are now shown as toasts
      }
    } catch (error) {
      logger.error('Error updating SSO mapping:', error);
      toast({ variant: "destructive", title: "Error", description: "Could not update SSO mapping." });
      // Error is now shown as a toast
    } finally {
      setIsProcessing(false);
      // Ensure dialog is closed and state reset even on error in submission for better UX
      setIsEditSsoMappingDialogOpen(false); // Ensure dialog closes even if processing failed but data was updated
      setSsoMappingToEdit(null);
      setEditSsoMappingFormData({ ssoProvider: '', ssoGroupName: '', localGroupId: '' });
    }
  };

  const confirmDeleteSsoMapping = async () => {
    if (!ssoMappingToDelete) return;

    setIsProcessing(true);
    try {
      const response = await fetch(`/api/admin/group-mappings/${ssoMappingToDelete.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json();
        logger.error('Failed to delete SSO mapping:', errorData);
        toast({ variant: "destructive", title: "Error", description: errorData.message || "Could not delete SSO mapping." });
      } else {
        toast({ title: "Success", description: "SSO mapping deleted successfully.", variant: "success" });
        onRefresh(); // Refresh the list
      }
    } catch (error) {
      logger.error('Error deleting SSO mapping:', error);
      toast({ variant: "destructive", title: "Error", description: "Could not delete SSO mapping." });
    } finally {
      setIsProcessing(false);
      setIsDeleteSsoMappingDialogOpen(false);
      setSsoMappingToDelete(null);
    }
  };


  const handleAddSsoMappingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    // Basic validation and toast notification
    let hasErrors = false;
    if (!newSsoMappingFormData.ssoProvider) {
      toast({ variant: "destructive", title: "Validation Error", description: "SSO Provider is required." });
      hasErrors = true;
    }
    if (!newSsoMappingFormData.ssoGroupName) {
      toast({ variant: "destructive", title: "Validation Error", description: "SSO Group Name is required." });
      hasErrors = true;
    }
    if (!newSsoMappingFormData.localGroupId) {
      toast({ variant: "destructive", title: "Validation Error", description: "Local Group is required." });
      hasErrors = true;
    }

    if (hasErrors) {
      setIsProcessing(false);
      return;
    }


    try {
      const response = await fetch('/api/admin/group-mappings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSsoMappingFormData),
      });

      const result = await response.json();

      if (response.ok) {
        toast({ title: "Success", description: "SSO mapping created successfully.", variant: "success" });
        onRefresh(); // Refresh the list of mappings
        setIsAddSsoMappingDialogOpen(false);
        setNewSsoMappingFormData({ ssoProvider: '', ssoGroupName: '', localGroupId: '' });
      } else {
        const errorMsg = result.message || "An unknown error occurred.";
        toast({ variant: "destructive", title: "Error", description: errorMsg });
        // Backend errors are now shown as toasts
      }
    } catch (error) {
      logger.error('Error creating SSO mapping:', error);
      toast({ variant: "destructive", title: "Error", description: "Could not create SSO mapping." });
      // Error is now shown as a toast
    } finally {
      setIsProcessing(false);
      // Ensure dialog is closed and state reset even on error in submission for better UX
      setIsAddSsoMappingDialogOpen(false); // Ensure dialog closes even if processing failed but data was updated
      setNewSsoMappingFormData({ ssoProvider: '', ssoGroupName: '', localGroupId: '' });
    }
  };

  const filteredSsoGroupMappings = ssoGroupMappings.filter((mapping: SsoGroupMappingWithLocalGroup) => {
    const searchTermLower = (searchTerm || '').toLowerCase();
    if (searchTermLower === '') return true;
    return mapping.ssoGroupName.toLowerCase().includes(searchTermLower) ||
      mapping.ssoProvider.toLowerCase().includes(searchTermLower) ||
      mapping.localGroup.name.toLowerCase().includes(searchTermLower);
  });

  // Pagination logic
  const totalItems = filteredSsoGroupMappings.length;
  const totalPages = pageSize === 'ALL' ? 1 : Math.ceil(totalItems / pageSize);

  // Reset to first page when search term changes or when current page is greater than total pages
  useEffect(() => {
    if (totalPages === 0 && currentPage !== 1) {
      onPageChange(1);
    } else if (currentPage > totalPages && totalPages > 0) {
      onPageChange(1);
    }
  }, [searchTerm, currentPage, totalPages, onPageChange]);

  // Get paginated data
  const paginatedSsoGroupMappings = useMemo(() => {
    if (pageSize === 'ALL') {
      return filteredSsoGroupMappings;
    }

    if (isPhone) {
      return filteredSsoGroupMappings.slice(0, currentPage * pageSize);
    }

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredSsoGroupMappings.slice(startIndex, endIndex);
  }, [filteredSsoGroupMappings, currentPage, pageSize, isPhone]);



  // Removed useEffect for recordCount
  // useEffect(() => {
  //   setRecordCount(filteredSsoGroupMappings.length);
  // }, [filteredSsoGroupMappings]);

  // Remove local sortBy, sortDirection, handleSortChange

  return (
    <>
      {/* SSO Group Mappings Section */}
      <Card className="flex flex-col flex-1 mb-0 min-h-0">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0 pb-4">
          <div>
            <CardTitle className={`flex items-center ${isMobileView ? 'text-xl' : 'text-2xl'}`}>
              <ClientOnly><UserCheck size={28} className="mr-2 text-primary" /></ClientOnly> SSO Group Mappings
            </CardTitle>
            {!isMobileView && <CardDescription>Map external SSO groups to local user groups.</CardDescription>}
          </div>
          <div className="flex w-full justify-end md:w-auto">
            <Button
              variant="outline"
              onClick={onRefresh}
              disabled={isProcessing || isLoadingInitialData || isRefreshing}
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
            <Button onClick={() => setIsAddSsoMappingDialogOpen(true)} className={cn(isMobileView && "size-9 p-0")}>
              <ClientOnly>
                <PlusCircle className={cn("h-4 w-4", !isMobileView && "mr-2")} />
              </ClientOnly>
              {!isMobileView && "Add SSO Mapping"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-6 relative flex-1 overflow-hidden flex flex-col">
          <div className="relative max-w-sm">
            <Input
              placeholder="Search SSO group mappings..."
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
          {isLoadingInitialData ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : ssoGroupMappingsError ? (
            <Alert variant="destructive">
              <ClientOnly><AlertCircleIcon className="h-4 w-4" /></ClientOnly>
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{ssoGroupMappingsError}</AlertDescription>
            </Alert>
          ) : paginatedSsoGroupMappings.length === 0 && (searchTerm || '') === '' ? (
            <p className="text-muted-foreground text-center">No SSO group mappings found.</p>
          ) : paginatedSsoGroupMappings.length === 0 && (searchTerm || '') !== '' ? (
            <p className="text-muted-foreground text-center">No SSO group mappings found matching &quot;{searchTerm}&quot;.</p>
          ) : (
            // Conditional rendering based on isMobileView
            isMobileView ? (
              // Mobile Card View
              <ScrollArea className="flex-1 pr-4 -mr-4">
                <div className="space-y-4 pr-4">
                  {paginatedSsoGroupMappings.map((mapping: SsoGroupMappingWithLocalGroup) => (
                    <Card key={mapping.id} className="shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className={isMobileView ? 'text-base' : 'text-lg'}>{mapping.ssoGroupName}</CardTitle>
                        <CardDescription>
                          SSO Provider: {oidcProviders.find(p => p.id === mapping.ssoProvider)?.name || mapping.ssoProvider}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-2">
                        <p className="text-sm text-muted-foreground">Mapped Local Group: {mapping.localGroup.name}</p>
                        <div className="flex justify-end space-x-2 mt-4">
                          <Button variant="outline" size="sm" onClick={() => handleEditSsoMapping(mapping)} disabled={isProcessing}>Edit</Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDeleteSsoMapping(mapping)} disabled={isProcessing}>Delete</Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              // Desktop Table View
              <ScrollArea className="flex-1 pr-4 -mr-4">
                <SortableTable<SsoGroupMappingWithLocalGroup>
                  data={paginatedSsoGroupMappings}
                  columns={[
                    {
                      key: 'ssoProvider',
                      label: 'SSO Provider',
                      sortable: true,
                      render: (mapping: SsoGroupMappingWithLocalGroup) => {
                        const provider = oidcProviders.find(p => p.id === mapping.ssoProvider);
                        return <span className="font-medium">{provider ? provider.name : mapping.ssoProvider}</span>;
                      },
                    },
                    {
                      key: 'ssoGroupName',
                      label: 'SSO Group Name',
                      sortable: true,
                      render: (mapping: SsoGroupMappingWithLocalGroup) => mapping.ssoGroupName,
                    },
                    {
                      key: 'localGroup.name',
                      label: 'Mapped Local Group',
                      sortable: true,
                      render: (mapping: SsoGroupMappingWithLocalGroup) => mapping.localGroup.name,
                    },
                    {
                      key: 'actions',
                      label: 'Actions',
                      render: (mapping: SsoGroupMappingWithLocalGroup) => (
                        <div className="text-left space-x-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditSsoMapping(mapping)} disabled={isProcessing}>Edit</Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDeleteSsoMapping(mapping)} disabled={isProcessing}>Delete</Button>
                        </div>
                      ),
                    },
                  ]}
                  sortBy={sortBy}
                  sortDirection={sortDirection}
                  onSortChange={onSortChange}

                />
              </ScrollArea>
            )
          )}
          {/* Pagination Controls and Record Count */}
          {isLoadingInitialData ? (
            <div className="mt-4">
              <Skeleton className="h-6 w-32" />
            </div>
          ) : (
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
        </CardContent>
      </Card>

      {/* Add SSO Mapping Dialog */}
      <Dialog open={isAddSsoMappingDialogOpen} onOpenChange={(open) => { setIsAddSsoMappingDialogOpen(open); if (!open) { setIsProcessing(false); } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New SSO Group Mapping</DialogTitle>
            <DialogDescription>
              Map an external SSO group to a local user group.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddSsoMappingSubmit} className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="sso-provider" className="text-right">SSO Provider</Label>
              <Select
                value={newSsoMappingFormData.ssoProvider}
                onValueChange={(value) => {
                  setNewSsoMappingFormData(prev => ({ ...prev, ssoProvider: value }));
                }}
                disabled={isProcessing || isLoadingOidcProviders} // Disable if processing or loading providers
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder={isLoadingOidcProviders ? "Loading providers..." : "Select an SSO provider"} /> {/* Update placeholder */}
                </SelectTrigger>
                <SelectContent>
                  {oidcProviders.map(provider => (
                    <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="sso-group-name" className="text-right">SSO Group Name</Label>
              <Input
                id="sso-group-name"
                name="ssoGroupName"
                value={newSsoMappingFormData.ssoGroupName}
                onChange={(e) => {
                  setNewSsoMappingFormData(prev => ({ ...prev, ssoGroupName: e.target.value }));
                }}
                className="col-span-3"
                disabled={isProcessing}
                placeholder="e.g., Azure_Admins, Authentik_Users"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="local-group" className="text-right">Local Group</Label>
              <Select
                value={newSsoMappingFormData.localGroupId}
                onValueChange={(value) => {
                  setNewSsoMappingFormData(prev => ({ ...prev, localGroupId: value }));
                }}
                disabled={isProcessing}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a local group" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map(group => (
                    <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>


            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isProcessing}>Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={isProcessing}>
                <ClientOnly fallback={null}>
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                </ClientOnly>
                Create Mapping
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>


      {/* Edit SSO Mapping Dialog */}
      <Dialog open={isEditSsoMappingDialogOpen} onOpenChange={(open) => { setIsEditSsoMappingDialogOpen(open); if (!open) { setIsProcessing(false); } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit SSO Group Mapping</DialogTitle>
            <DialogDescription>
              Edit the details for the SSO group mapping.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSsoMappingSubmit} className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-sso-provider" className="text-right">SSO Provider</Label>
              <Select
                value={editSsoMappingFormData.ssoProvider}
                onValueChange={(value) => {
                  setEditSsoMappingFormData(prev => ({ ...prev, ssoProvider: value }));
                }}
                disabled={isProcessing || isLoadingOidcProviders}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder={isLoadingOidcProviders ? "Loading providers..." : "Select an SSO provider"} />
                </SelectTrigger>
                <SelectContent>
                  {oidcProviders.map(provider => (
                    <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-sso-group-name" className="text-right">SSO Group Name</Label>
              <Input
                id="edit-sso-group-name"
                name="ssoGroupName"
                value={editSsoMappingFormData.ssoGroupName}
                onChange={(e) => {
                  setEditSsoMappingFormData(prev => ({ ...prev, ssoGroupName: e.target.value }));
                }}
                className="col-span-3"
                disabled={isProcessing}
                placeholder="e.g., Azure_Admins, Authentik_Users"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-local-group" className="text-right">Mapped Local Group</Label>
              <Select
                value={editSsoMappingFormData.localGroupId}
                onValueChange={(value) => {
                  setEditSsoMappingFormData(prev => ({ ...prev, localGroupId: value }));
                }}
                disabled={isProcessing}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a local group" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map(group => (
                    <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </form>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isProcessing}>Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={isProcessing || !hasEditChanges()} onClick={handleEditSsoMappingSubmit}>
              <ClientOnly fallback={null}>
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              </ClientOnly>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Delete SSO Mapping Confirmation Dialog */}
      <Dialog open={isDeleteSsoMappingDialogOpen} onOpenChange={(open) => { setIsDeleteSsoMappingDialogOpen(open); if (!open) setIsProcessing(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the SSO group mapping for &quot;{ssoMappingToDelete?.ssoGroupName}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteSsoMappingDialogOpen(false)} disabled={isProcessing}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteSsoMapping} disabled={isProcessing}>
              <ClientOnly fallback={null}>
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              </ClientOnly>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}