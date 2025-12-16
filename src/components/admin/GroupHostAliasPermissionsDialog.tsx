'use client';

import { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { Button } from '@/components/ui/button';
import { isValidIpAddress } from '@/lib/network-utils';
import { Input } from '@/components/ui/input';
import { ScrollArea } from "@/components/ui/scroll-area"; // Import ScrollArea
import type { Group } from '@prisma/client';
import { Loader2, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Globe, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast'; // Assuming you want toast notifications
import { useIsMobile } from '@/hooks/use-mobile'; // Import useIsMobile hook
import { logger } from '@/lib/logger';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { StatusDotWithTooltip, StatusDotLegend, getHostAliasStatusColor } from '@/components/ui/status-dot';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Define a type for OPNsense Host Alias data needed in the UI
interface OpnsenseHostAlias {
  uuid: string;
  name: string;
  description: string;
  content: string;
  enabled: string;
  type: string;
  proto: string;
  interface: string;
  counters: string;
  updatefreq: string;
  categories: string;
  count?: number; // Add count field for wildcard alias
  detectedMac?: string | null;
  detectedVendor?: string | null;
}

interface GroupHostAliasPermissionsDialogProps {
  group: Group | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess: (groupId: string, newCount: number) => void; // Update callback prop signature
}

export default function GroupHostAliasPermissionsDialog({ group, isOpen, onClose, onSaveSuccess }: GroupHostAliasPermissionsDialogProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile(); // Use the hook

  const [allHostAliases, setAllHostAliases] = useState<OpnsenseHostAlias[]>([]);
  const [associatedAliases, setAssociatedAliases] = useState<string[]>([]); // Store UUIDs of associated aliases
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [availableSearchTerm, setAvailableSearchTerm] = useState('');
  const [associatedSearchTerm, setAssociatedSearchTerm] = useState('');
  const [selectedAvailable, setSelectedAvailable] = useState<string[]>([]); // Store UUIDs
  const [selectedAssociated, setSelectedAssociated] = useState<string[]>([]); // Store UUIDs
  const [stagedAdditions, setStagedAdditions] = useState<string[]>([]); // Store UUIDs
  const [stagedRemovals, setStagedRemovals] = useState<string[]>([]); // Store UUIDs
  const [permitAllHosts, setPermitAllHosts] = useState(false); // New state for "permit all hosts"
  const [initialPermitAllHosts, setInitialPermitAllHosts] = useState(false); // Track initial permitAllHosts state
  const [showPermitAllConfirm, setShowPermitAllConfirm] = useState(false); // State for confirmation dialog
  const [confirmInput, setConfirmInput] = useState(''); // State for confirmation input
  const [wildcardPermissionData, setWildcardPermissionData] = useState<OpnsenseHostAlias | null>(null); // State for wildcard data
  const [lastSelectedAvailableAnchor, setLastSelectedAvailableAnchor] = useState<string | null>(null);
  const [lastSelectedAssociatedAnchor, setLastSelectedAssociatedAnchor] = useState<string | null>(null);
  const [availableSearchHelpOpen, setAvailableSearchHelpOpen] = useState(false);
  const [associatedSearchHelpOpen, setAssociatedSearchHelpOpen] = useState(false);



  // Custom StatusDotWithClickableDialog component that opens a small dialog on click
  const StatusDotWithClickableDialog = ({ alias }: { alias: OpnsenseHostAlias }) => {
    const [showDialog, setShowDialog] = useState(false);

    const color = getHostAliasStatusColor(
      alias.enabled === '1',
      alias.uuid === '*' ? (allHostAliases || []).some(h => !!h.detectedMac) : !!alias.detectedMac
    );

    const dialogContent = alias.uuid === '*' ? (
      <div className="space-y-2">
        <p>Permits access to all current and future hosts</p>
        <p>Status: {(allHostAliases || []).some(h => !!h.detectedMac) ? 'At least one host online' : 'No hosts online'}</p>
        <p>Total hosts: {(allHostAliases || []).length}</p>
      </div>
    ) : (
      <div className="space-y-2">
        {alias.content && <p><strong>Content:</strong> {alias.content}</p>}
        <p><strong>Status:</strong> {alias.enabled === '1' ? (alias.detectedMac ? 'Online' : 'Offline') : 'Disabled'}</p>
        {alias.detectedMac && <p><strong>MAC:</strong> {alias.detectedMac}</p>}
        {alias.detectedVendor && <p><strong>Vendor:</strong> {alias.detectedVendor}</p>}
        {alias.description && <p><strong>Description:</strong> {alias.description}</p>}
      </div>
    );

    const dialogTitle = alias.uuid === '*' ? 'All Hosts (Wildcard)' : alias.name;

    return (
      <>
        <div
          className="cursor-pointer"
          onClick={() => setShowDialog(true)}
        >
          <StatusDotWithTooltip
            color={color}
            size="sm"
          />
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{dialogTitle}</DialogTitle>
            </DialogHeader>
            <div className="text-sm">
              {dialogContent}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  };

  const fetchAliasesAndPermissions = useCallback(async () => {
    if (!group) {
      setAllHostAliases([]);
      setAssociatedAliases([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Fetch all OPNsense Host Aliases (assuming a backend endpoint for this)
      // Fetch filtered OPNsense Host Aliases from the new API route
      const aliasesResponse = await fetch('/api/opnsense/filtered-host-aliases');
      if (!aliasesResponse.ok) {
        const errorData = await aliasesResponse.json();
        throw new Error(errorData.message || `Failed to fetch filtered host aliases: ${aliasesResponse.statusText}`);
      }
      const { displayableHostAliases } = await aliasesResponse.json();
      setAllHostAliases(Array.isArray(displayableHostAliases) ? displayableHostAliases as OpnsenseHostAlias[] : []);

      // Fetch associated aliases for this group
      const permissionsResponse = await fetch(`/api/admin/groups/${group.id}/host-alias-permissions`);
      // Assuming the response is an array of objects with uuid, name, description
      const permissionsData: OpnsenseHostAlias[] = await permissionsResponse.json();
      if (permissionsResponse.ok && Array.isArray(permissionsData)) {
        // Check if the wildcard alias is present
        const hasWildcard = permissionsData.some(p => p.uuid === '*');
        setPermitAllHosts(hasWildcard);
        setInitialPermitAllHosts(hasWildcard);

        if (hasWildcard) {
          const wildcardEntry = permissionsData.find(p => p.uuid === '*');
          setWildcardPermissionData(wildcardEntry || null); // Store the full wildcard object
          setAssociatedAliases(['*']); // Keep associatedAliases as ['*']
        } else {
          setWildcardPermissionData(null);
          setAssociatedAliases(permissionsData.map(p => p.uuid));
        }
      } else {
        logger.error('Failed to fetch group host alias permissions:', permissionsData);
        toast({ variant: "destructive", title: "Error", description: "Could not load group host alias permissions." });
        setAssociatedAliases([]);
        setPermitAllHosts(false);
        setInitialPermitAllHosts(false); // Reset initial state
        setWildcardPermissionData(null); // Ensure it's reset on error
      }

    } catch (error) {
      logger.error('Error fetching aliases or permissions:', error);
      toast({ variant: "destructive", title: "Error", description: "Could not load data." });
      setAllHostAliases([]);
      setAssociatedAliases([]);
    } finally {
      setIsLoading(false);
    }
  }, [group, toast]);

  useEffect(() => {
    if (isOpen) {
      fetchAliasesAndPermissions();
    } else {
      // Reset state when dialog is closed
      setAllHostAliases([]);
      setAssociatedAliases([]);
      setAvailableSearchTerm('');
      setAssociatedSearchTerm('');
      setSelectedAvailable([]);
      setSelectedAssociated([]);
      setStagedAdditions([]);
      setStagedRemovals([]);
      setPermitAllHosts(false); // Reset permit all hosts state
      setInitialPermitAllHosts(false); // Reset initial state
      setConfirmInput(''); // Reset confirmation input
      setWildcardPermissionData(null); // Reset wildcard data
    }
  }, [isOpen, fetchAliasesAndPermissions]);

  const toggleSelection = (listType: 'available' | 'associated', aliasUuid: string, event?: React.MouseEvent<HTMLLIElement>) => {
    const currentFullList = listType === 'available' ? availableAliasesToDisplay : associatedAliasesToDisplay;

    const setSelection = listType === 'available' ? setSelectedAvailable : setSelectedAssociated;
    const setAnchor = listType === 'available' ? setLastSelectedAvailableAnchor : setLastSelectedAssociatedAnchor;
    const currentAnchor = listType === 'available' ? lastSelectedAvailableAnchor : lastSelectedAssociatedAnchor;

    if (event?.shiftKey && currentAnchor) {
      const anchorIndex = currentFullList.findIndex(item => item.uuid === currentAnchor);
      const currentIndex = currentFullList.findIndex(item => item.uuid === aliasUuid);

      if (anchorIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(anchorIndex, currentIndex);
        const end = Math.max(anchorIndex, currentIndex);
        const rangeToSelectUuids = currentFullList.slice(start, end + 1).map(item => item.uuid);

        if (event.ctrlKey) {
          setSelection(prev => Array.from(new Set([...prev, ...rangeToSelectUuids])));
        } else {
          setSelection(rangeToSelectUuids);
        }
      } else {
        setSelection([aliasUuid]);
        setAnchor(aliasUuid);
      }
    } else if (event?.ctrlKey) {
      setSelection(prev =>
        prev.includes(aliasUuid) ? prev.filter(id => id !== aliasUuid) : [...prev, aliasUuid]
      );
      setAnchor(aliasUuid);
    } else {
      setSelection([aliasUuid]);
      setAnchor(aliasUuid);
    }
  };

  const handleMoveRight = () => {
    const aliasesToMove = (allHostAliases || []).filter(alias => selectedAvailable.includes(alias.uuid));
    setStagedAdditions(prev => [...prev, ...aliasesToMove.map(alias => alias.uuid)]);
    setStagedRemovals(prev => prev.filter(uuid => !selectedAvailable.includes(uuid)));
    setSelectedAvailable([]);
  };

  const handleMoveLeft = () => {
    const aliasesToMoveUuids = selectedAssociated; // Use selectedAssociated directly as it contains UUIDs
    setStagedRemovals(prev => [...prev, ...aliasesToMoveUuids]);
    setStagedAdditions(stagedAdditions.filter(uuid => !aliasesToMoveUuids.includes(uuid)));
    // Update associatedAliases state locally to reflect removal for immediate display update
    setAssociatedAliases(prev => prev.filter(uuid => !aliasesToMoveUuids.includes(uuid)));
    setSelectedAssociated([]);
  };



  const handleSaveChanges = async () => {
    if (!group) return;
    setIsUpdating(true);
    try {
      // Calculate the final list of associated alias UUIDs
      let finalAssociatedAliases: string[];
      if (permitAllHosts) {
        finalAssociatedAliases = ['*']; // If permit all hosts is enabled, send only the wildcard
      } else {
        finalAssociatedAliases = associatedAliases
          .filter(uuid => !stagedRemovals.includes(uuid)) // Remove staged removals from original associated
          .concat(stagedAdditions); // Add staged additions
      }

      const response = await fetch(`/api/admin/groups/${group.id}/host-alias-permissions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ aliasUuids: finalAssociatedAliases }),
      });

      const result = await response.json();

      if (response.ok) {
        toast({ title: "Success", description: "Host alias permissions updated successfully.", variant: "success" });
        await fetchAliasesAndPermissions(); // Refresh lists after saving and await its completion
        setStagedAdditions([]);
        setStagedRemovals([]);
        if (group) {
          onSaveSuccess(group.id, permitAllHosts ? (allHostAliases || []).length : associatedAliasesToDisplay.length); // Call onSaveSuccess with updated count
        }
        onClose(); // Close the modal after saving
      } else {
        const errorMsg = result.message || "An unknown error occurred.";
        toast({ variant: "destructive", title: "Error", description: errorMsg });
        // Specific backend validation errors could be handled here if needed
      }

    } catch (error) {
      logger.error('Error saving changes:', error);
      toast({ variant: "destructive", title: "Error", description: "Could not save changes." });
    } finally {
      setIsUpdating(false);
    }
  };

  // Filter and display logic
  const availableAliasesToDisplay = (allHostAliases || []).filter(alias => {
    if (permitAllHosts) return false; // If permit all hosts is enabled, no aliases are "available" to add

    const isOriginallyAssociated = associatedAliases.includes(alias.uuid);
    const isStagedForAddition = stagedAdditions.includes(alias.uuid);
    const isStagedForRemoval = stagedRemovals.includes(alias.uuid);

    // An alias is available to display if:
    // 1. It was not originally associated AND is not staged for addition
    // 2. OR it was originally associated AND is staged for removal
    const shouldDisplay = (!isOriginallyAssociated && !isStagedForAddition) || (isOriginallyAssociated && isStagedForRemoval);

    const matchesSearch = alias.name.toLowerCase().includes(availableSearchTerm.toLowerCase()) ||
                          alias.description?.toLowerCase().includes(availableSearchTerm.toLowerCase()) ||
                          (alias.content && isValidIpAddress(availableSearchTerm) && alias.content.toLowerCase().includes(availableSearchTerm.toLowerCase()));

    return shouldDisplay && matchesSearch;
  }).sort((a, b) => a.name.localeCompare(b.name));

  const associatedAliasesToDisplay = permitAllHosts
    ? (wildcardPermissionData ? [wildcardPermissionData] : []) // Use the stored wildcard data
    : (allHostAliases || []).filter(alias =>
      (associatedAliases.includes(alias.uuid) && !stagedRemovals.includes(alias.uuid)) || // Originally associated and not staged for removal
      stagedAdditions.includes(alias.uuid) // In staged additions
    ).filter(alias =>
      (alias.name.toLowerCase().includes(associatedSearchTerm.toLowerCase()) ||
       alias.description?.toLowerCase().includes(associatedSearchTerm.toLowerCase()) ||
       (alias.content && isValidIpAddress(associatedSearchTerm) && alias.content.toLowerCase().includes(associatedSearchTerm.toLowerCase()))) // Search by name, description, or IP address
     ).sort((a, b) => a.name.localeCompare(b.name));


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            Manage Host Alias Permissions for {group?.name}
            <StatusDotLegend className="ml-auto" />
          </DialogTitle>
          <DialogDescription className="whitespace-normal break-words">
            Assign OPNsense Host Aliases that members of this group can manage.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="text-center py-8">
               <Loader2 className="h-8 w-8 animate-spin mx-auto" />
               <p className="mt-2 text-muted-foreground">Loading aliases...</p>
          </div>
        ) : (
          <>
            <div className="flex items-center space-x-2 mb-4">
              <Switch
                id="permit-all-hosts"
                checked={permitAllHosts}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setShowPermitAllConfirm(true);
                  } else {
                    setPermitAllHosts(false);
                    setAssociatedAliases([]); // Clear associated aliases when turning off wildcard
                    setStagedAdditions([]);
                    setStagedRemovals([]);
                    setWildcardPermissionData(null); // Clear wildcard data immediately
                  }
                }}
                disabled={isUpdating}
              />
              <Label htmlFor="permit-all-hosts" className="flex items-center gap-2">
                <Globe className="h-4 w-4" /> Permit All Hosts (current and future)
              </Label>
            </div>
            <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-3'} gap-2 py-4`}>
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-semibold mb-2">Available Hosts</h3>
                <div className="flex items-center space-x-2 mb-2">
                  <Input
                    placeholder="Search available..."
                    value={availableSearchTerm}
                    onChange={(e) => setAvailableSearchTerm(e.target.value)}
                    disabled={permitAllHosts}
                  />
                  <Dialog open={availableSearchHelpOpen} onOpenChange={setAvailableSearchHelpOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => setAvailableSearchHelpOpen(true)}
                      >
                        <AlertCircle className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Available Hosts Help</DialogTitle>
                        <DialogDescription>
                          Instructions for selecting and managing available host aliases.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="max-h-96 overflow-y-auto">
                        <p>Click to select, Ctrl+Click to toggle selection, Shift+Click to select a range.</p>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedAvailable(availableAliasesToDisplay.map(alias => alias.uuid))} disabled={availableAliasesToDisplay.length === 0 || permitAllHosts}>Select All</Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedAvailable([])} disabled={selectedAvailable.length === 0 || permitAllHosts}>Deselect All</Button>
                </div>
                <ScrollArea className={`border rounded-md p-2 ${isMobile ? 'h-[250px]' : 'h-[400px]'}`}>
                  {availableAliasesToDisplay.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center">No aliases found.</p>
                  ) : (
                    <ul>
                      {availableAliasesToDisplay.map(alias => (
                        <li
                          key={alias.uuid}
                          className={`py-1 px-2 text-sm cursor-pointer rounded-sm ${selectedAvailable.includes(alias.uuid) ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                          onClick={(e) => toggleSelection('available', alias.uuid, e)}
                        >
                          <div className="flex items-center gap-2">
                            <StatusDotWithClickableDialog alias={alias} />
                            <span className="flex-1">
                              <div>{alias.name}</div>
                              {alias.description && <div className="text-xs opacity-75 mt-1 break-words">{alias.description}</div>}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollArea>
              </div>
              <div className="flex md:flex-col justify-center items-center gap-2 px-1 md:py-4 py-2">
                {/* Buttons for moving items between lists */}
                <Button variant="outline" size="icon" disabled={isUpdating || selectedAvailable.length === 0 || permitAllHosts} onClick={handleMoveRight} title="Add selected to associated">
                  {isMobile ? (
                    <ChevronDown className="h-4 w-4" /> // Down arrow on small screens
                  ) : (
                    <ChevronRight className="h-4 w-4" /> // Right arrow on large screens
                  )}
                </Button>
                <Button variant="outline" size="icon" disabled={isUpdating || selectedAssociated.length === 0 || permitAllHosts} onClick={handleMoveLeft} title="Remove selected from associated">
                  {isMobile ? (
                    <ChevronUp className="h-4 w-4" /> // Up arrow on small screens
                  ) : (
                    <ChevronLeft className="h-4 w-4" /> // Left arrow on large screens
                  )}
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-semibold mb-2">Associated Hosts</h3>
                <div className="flex items-center space-x-2 mb-2">
                  <Input
                    placeholder="Search associated..."
                    value={associatedSearchTerm}
                    onChange={(e) => setAssociatedSearchTerm(e.target.value)}
                    disabled={permitAllHosts}
                  />
                  <Dialog open={associatedSearchHelpOpen} onOpenChange={setAssociatedSearchHelpOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => setAssociatedSearchHelpOpen(true)}
                      >
                        <AlertCircle className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Associated Hosts Help</DialogTitle>
                        <DialogDescription>
                          Instructions for managing host aliases that are already associated with this group.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="max-h-96 overflow-y-auto">
                        <p>Click to select, Ctrl+Click to toggle selection, Shift+Click to select a range.</p>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedAssociated(associatedAliasesToDisplay.map(alias => alias.uuid))} disabled={associatedAliasesToDisplay.length === 0 || permitAllHosts}>Select All</Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedAssociated([])} disabled={selectedAssociated.length === 0 || permitAllHosts}>Deselect All</Button>
                </div>
                <ScrollArea className={`border rounded-md p-2 ${isMobile ? 'h-[250px]' : 'h-[400px]'}`}>
                  {associatedAliasesToDisplay.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center">No aliases associated with this group.</p>
                  ) : (
                    <ul>
                      {associatedAliasesToDisplay.map(alias => (
                        alias.uuid === '*' ? (
                          // Render for wildcard alias without status dot
                          <li
                            key={alias.uuid}
                            className={`py-1 px-2 text-sm cursor-pointer rounded-sm ${selectedAssociated.includes(alias.uuid) ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                            onClick={(e) => toggleSelection('associated', alias.uuid, e)}
                          >
                            <div className="flex items-center gap-2">
                              <span className="flex-1">
                                <div className="flex items-center gap-2">
                                  {alias.name}
                                  {alias.count !== undefined && (
                                    <span className="text-muted-foreground">({alias.count} hosts)</span>
                                  )}
                                </div>
                                {alias.description && <div className="text-xs opacity-75 mt-1 break-words">{alias.description}</div>}
                              </span>
                            </div>
                          </li>
                        ) : (
                          // Render for regular alias with detailed tooltip
                          <li
                            key={alias.uuid}
                            className={`py-1 px-2 text-sm cursor-pointer rounded-sm ${selectedAssociated.includes(alias.uuid) ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                            onClick={(e) => toggleSelection('associated', alias.uuid, e)}
                          >
                            <div className="flex items-center gap-2">
                              <StatusDotWithClickableDialog alias={alias} />
                              <span className="flex-1">
                                <div>{alias.name}</div>
                                {alias.description && <div className="text-xs opacity-75 mt-1 break-words">{alias.description}</div>}
                              </span>
                            </div>
                          </li>
                        )
                      ))}
                    </ul>
                  )}
                </ScrollArea>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={isUpdating}>Cancel</Button>
              <Button onClick={handleSaveChanges} disabled={isUpdating || (stagedAdditions.length === 0 && stagedRemovals.length === 0 && permitAllHosts === initialPermitAllHosts)}>
                {isUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
            </DialogFooter>

            <AlertDialog open={showPermitAllConfirm} onOpenChange={setShowPermitAllConfirm}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm &quot;Permit All Hosts&quot;</AlertDialogTitle>
                  <AlertDialogDescription>
                    Enabling &quot;Permit All Hosts&quot; will remove all specific host alias permissions for this group and grant access to all current and future hosts. This action cannot be easily undone.
                    <br /><br />
                    To confirm, please type &quot;CONFIRM&quot; in the box below.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  type="text"
                  placeholder="Type CONFIRM to proceed"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                />
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => {
                    setShowPermitAllConfirm(false);
                    setConfirmInput('');
                    setPermitAllHosts(false); // Revert the switch if cancelled
                  }}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setPermitAllHosts(true);
                      setAssociatedAliases(['*']); // Set associated aliases to wildcard
                      // Immediately set wildcardPermissionData for display
                      setWildcardPermissionData({
                        uuid: '*',
                        name: 'All Hosts (Wildcard)',
                        description: 'Permits access to all current and future hosts.',
                        content: '', // Content is not applicable for wildcard
                        type: 'host', // Type is not strictly applicable but required by interface
                        enabled: '1', // Assume enabled
                        proto: '', interface: '', counters: '', updatefreq: '', categories: '', // Provide default empty strings for other required fields
                        count: allHostAliases.length, // Use the total count of displayable aliases
                      });
                      setStagedAdditions([]); // Clear any staged changes
                      setStagedRemovals([]); // Clear any staged changes
                      setShowPermitAllConfirm(false);
                      setConfirmInput('');
                    }}
                    disabled={confirmInput !== 'CONFIRM'}
                  >
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}