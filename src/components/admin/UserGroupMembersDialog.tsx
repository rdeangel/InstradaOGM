'use client';

import { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area"; // Import ScrollArea
import { useIsMobile } from '@/hooks/use-mobile'; // Import useIsMobile hook
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Group } from '@prisma/client';
import { Loader2, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'; // Import icons
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from '@/components/ui/badge'; // Import Badge component
import { logger } from '@/lib/logger';

interface UserGroupMembersDialogProps {
  group: Group | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess: (groupId: string, newCount: number) => void;
}

export default function UserGroupMembersDialog({ group, isOpen, onClose, onSaveSuccess }: UserGroupMembersDialogProps) {
  const [allUsers, setAllUsers] = useState<{ id: string; email: string; name: string }[]>([]);
  const [groupMembers, setGroupMembers] = useState<{ id: string; email: string; name: string; isSso?: boolean }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [availableSearchTerm, setAvailableSearchTerm] = useState('');
  const [membersSearchTerm, setMembersSearchTerm] = useState('');
  const [selectedAvailable, setSelectedAvailable] = useState<string[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [stagedAdditions, setStagedAdditions] = useState<string[]>([]);
  const [stagedRemovals, setStagedRemovals] = useState<string[]>([]);
  const [lastSelectedAvailableAnchor, setLastSelectedAvailableAnchor] = useState<string | null>(null);
  const [lastSelectedMembersAnchor, setLastSelectedMembersAnchor] = useState<string | null>(null);

  const fetchUsersAndMembers = useCallback(async (): Promise<{ localMembers: { id: string; email: string; name: string; isSso?: boolean }[]; totalCount: number; }> => {
    if (!group) {
      setAllUsers([]);
      setGroupMembers([]);
      setIsLoading(false);
      return { localMembers: [], totalCount: 0 };
    }

    setIsLoading(true);
    try {
      // Fetch all users
      const usersResponse = await fetch('/api/admin/users');
      const usersData = await usersResponse.json();
      if (usersResponse.ok && Array.isArray(usersData)) {
        // Filter out SSO users from the 'allUsers' list
        const localUsersOnly = usersData.filter((user: { accounts?: Array<{ externalGroups?: string[] }> }) =>
          !user.accounts || user.accounts.length === 0 || !user.accounts.some((account: { externalGroups?: string[] }) => account.externalGroups && account.externalGroups.length > 0)
        );
        setAllUsers(localUsersOnly);
      } else {
        logger.error('Failed to fetch users:', usersData);
        setAllUsers([]);
      }

      // Fetch group members
      const membersResponse = await fetch(`/api/admin/groups/${group.id}/members`);
      const membersData = await membersResponse.json();
      if (membersResponse.ok && Array.isArray(membersData)) {
        // Filter out SSO users for display in this dialog, but count all members for the total
        const localGroupMembersOnly = membersData.filter((member: { isSso?: boolean }) => !member.isSso);
        setGroupMembers(localGroupMembersOnly);
        return { localMembers: localGroupMembersOnly, totalCount: membersData.length }; // Return both
      } else {
        logger.error('Failed to fetch group members:', membersData);
        setGroupMembers([]);
        return { localMembers: [], totalCount: 0 };
      }

    } catch (error) {
      logger.error('Error fetching users or members:', error);
      setAllUsers([]);
      setGroupMembers([]);
      return { localMembers: [], totalCount: 0 };
    } finally {
      setIsLoading(false);
    }
  }, [group]);

  useEffect(() => {
    if (isOpen) {
      fetchUsersAndMembers();
    } else {
      // Reset state when dialog is closed
      setAllUsers([]);
      setGroupMembers([]);
      setAvailableSearchTerm('');
      setMembersSearchTerm('');
      setSelectedAvailable([]);
      setSelectedMembers([]);
      setStagedAdditions([]);
      setStagedRemovals([]);
      setLastSelectedAvailableAnchor(null);
      setLastSelectedMembersAnchor(null);
    }
  }, [isOpen, fetchUsersAndMembers]);





  const handleSaveChanges = async () => {
    if (!group) return;
    setIsUpdating(true);
    try {
      // Process staged additions
      for (const userId of stagedAdditions) {
        await fetch(`/api/admin/groups/${group.id}/members`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId }),
        });
      }

      // Process staged removals
      for (const userId of stagedRemovals) {
        await fetch(`/api/admin/groups/${group.id}/members`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId }),
        });
      }

      // Success/failure feedback could be added via toast notifications
      const { totalCount } = await fetchUsersAndMembers(); // Refresh lists after saving and await its completion
      setStagedAdditions([]);
      setStagedRemovals([]);
      if (group) {
        onSaveSuccess(group.id, totalCount); // Call onSaveSuccess with the total count
      }
      onClose(); // Close the modal after saving

    } catch (error) {
      logger.error('Error saving changes:', error);
      // Error feedback could be shown via toast notification
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleSelection = (listType: 'available' | 'members', userId: string, event?: React.MouseEvent<HTMLLIElement>) => {
    const currentFullList = listType === 'available' ? displayedAvailableUsers : displayedGroupMembers;

    const setSelection = listType === 'available' ? setSelectedAvailable : setSelectedMembers;

    const setAnchor = listType === 'available' ? setLastSelectedAvailableAnchor : setLastSelectedMembersAnchor;
    const currentAnchor = listType === 'available' ? lastSelectedAvailableAnchor : lastSelectedMembersAnchor;

    if (event?.shiftKey && currentAnchor) {
      const anchorIndex = currentFullList.findIndex(item => item.id === currentAnchor);
      const currentIndex = currentFullList.findIndex(item => item.id === userId);

      if (anchorIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(anchorIndex, currentIndex);
        const end = Math.max(anchorIndex, currentIndex);
        const rangeToSelectIds = currentFullList.slice(start, end + 1).map(item => item.id);

        if (event.ctrlKey) {
          setSelection(prev => Array.from(new Set([...prev, ...rangeToSelectIds])));
        } else {
          setSelection(rangeToSelectIds);
        }
      } else {
        setSelection([userId]);
        setAnchor(userId);
      }
    } else if (event?.ctrlKey) {
      setSelection(prev =>
        prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
      );
      setAnchor(userId);
    } else {
      setSelection([userId]);
      setAnchor(userId);
    }
  };

  const handleMoveRight = () => {
    const usersToMove = allUsers.filter(user => selectedAvailable.includes(user.id));
    setStagedAdditions(prev => [...prev, ...usersToMove.map(user => user.id)]);
    setStagedRemovals(prev => prev.filter(userId => !selectedAvailable.includes(userId)));
    setSelectedAvailable([]);
  };

  const handleMoveLeft = () => {
    const membersToMove = groupMembers.filter(member => selectedMembers.includes(member.id));
    const ssoMembersSelected = membersToMove.some(member => member.isSso);

    if (ssoMembersSelected) {
      // Optionally, show a toast or alert that SSO members cannot be removed
      logger.warn("Cannot remove SSO members directly from this interface.");
      return;
    }

    const membersToMoveIds = selectedMembers; // Use selectedMembers directly as it contains IDs
    setStagedRemovals(prev => [...prev, ...membersToMoveIds]);
    setStagedAdditions(stagedAdditions.filter(userId => !membersToMoveIds.includes(userId)));
    // Update groupMembers state locally to reflect removal for immediate display update
    setGroupMembers(prev => prev.filter(member => !membersToMoveIds.includes(member.id)));
    setSelectedMembers([]);
  };



  const displayedAvailableUsers = allUsers.filter(user =>
    !groupMembers.some(member => member.id === user.id) &&
    !stagedAdditions.includes(user.id) &&
    user.email.toLowerCase().includes(availableSearchTerm.toLowerCase())
  );

  const displayedGroupMembers = groupMembers.filter(member =>
    !stagedRemovals.includes(member.id) &&
    member.email.toLowerCase().includes(membersSearchTerm.toLowerCase())
  ).concat(allUsers.filter(user =>
    stagedAdditions.includes(user.id) &&
    user.email.toLowerCase().includes(membersSearchTerm.toLowerCase())
  ));


  const isMobile = useIsMobile(); // Use the hook

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Local Members for {group?.name}</DialogTitle>
          <DialogDescription>
            Add or remove users from this group.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="text-center py-8">
               <Loader2 className="h-8 w-8 animate-spin mx-auto" />
               <p className="mt-2 text-muted-foreground">Loading members...</p>
          </div>
        ) : (
          <>
            <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-3'} gap-2 py-4`}>
                <div className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold mb-2">Available Users</h3>
                  <div className="flex items-center space-x-2 mb-2">
                    <Input
                      placeholder="Search available..."
                      value={availableSearchTerm}
                      onChange={(e) => setAvailableSearchTerm(e.target.value)}
                    />
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Click to select, Ctrl+Click to toggle selection, Shift+Click to select a range.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelectedAvailable(displayedAvailableUsers.map(user => user.id))} disabled={displayedAvailableUsers.length === 0}>Select All</Button>
                    <Button variant="outline" size="sm" onClick={() => setSelectedAvailable([])} disabled={selectedAvailable.length === 0}>Deselect All</Button>
                  </div>
                  <ScrollArea className={`border rounded-md p-2 ${isMobile ? 'h-[200px]' : 'h-[300px]'}`}>
                    {displayedAvailableUsers.length === 0 ? (
                      <p className="text-muted-foreground text-sm text-center">No users found.</p>
                    ) : (
                      <TooltipProvider delayDuration={300}>
                        <ul>
                          {displayedAvailableUsers.map(user => (
                            // Only show tooltip if email is available (should always be for users)
                            user.email ? (
                              <Tooltip key={`avail-tt-${user.id}`}>
                                <TooltipTrigger asChild>
                                  <li
                                    key={user.id}
                                    className={`flex items-center justify-between py-1 px-2 text-sm cursor-pointer rounded-sm ${selectedAvailable.includes(user.id) ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                                    onClick={(e) => toggleSelection('available', user.id, e)}
                                  >
                                    <span>{user.email}</span>
                                  </li>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{user.name}</p> {/* Display name in tooltip */}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              // Render without Tooltip if no name
                              <li
                                key={user.id}
                                className={`flex items-center justify-between py-1 px-2 text-sm cursor-pointer rounded-sm ${selectedAvailable.includes(user.id) ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                                onClick={(e) => toggleSelection('available', user.id, e)}
                              >
                                <span>{user.email}</span>
                              </li>
                            )
                          ))}
                        </ul>
                      </TooltipProvider>
                    )}
                  </ScrollArea>
                </div>
                <div className="flex md:flex-col justify-center items-center gap-2 px-1 md:py-4 py-2">
                  {/* Buttons for moving items between lists */}
                  <Button variant="outline" size="icon" disabled={isUpdating || selectedAvailable.length === 0} onClick={handleMoveRight} title="Add selected to group">
                    {/* Move selected available users to members (Add) */}
                    <ChevronRight className="h-4 w-4 hidden md:inline-block" /> {/* Right arrow on large screens */}
                    <ChevronDown className="h-4 w-4 inline-block md:hidden" /> {/* Down arrow on small screens */}
                  </Button>
                  <Button variant="outline" size="icon" disabled={isUpdating || selectedMembers.length === 0 || selectedMembers.some(id => groupMembers.find(m => m.id === id)?.isSso)} onClick={handleMoveLeft} title="Remove selected from group">
                    {/* Move selected members to available (Remove) */}
                    <ChevronLeft className="h-4 w-4 hidden md:inline-block" /> {/* Left arrow on large screens */}
                    <ChevronUp className="h-4 w-4 inline-block md:hidden" /> {/* Up arrow on small screens */}
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold mb-2">Group Members</h3>
                  <div className="flex items-center space-x-2 mb-2">
                    <Input
                      placeholder="Search associated..."
                      value={membersSearchTerm}
                      onChange={(e) => setMembersSearchTerm(e.target.value)}
                    />
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Click to select, Ctrl+Click to toggle selection, Shift+Click to select a range.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelectedMembers(displayedGroupMembers.map(member => member.id))} disabled={displayedGroupMembers.length === 0}>Select All</Button>
                    <Button variant="outline" size="sm" onClick={() => setSelectedMembers([])} disabled={selectedMembers.length === 0}>Deselect All</Button>
                  </div>
                  <ScrollArea className={`border rounded-md p-2 ${isMobile ? 'h-[200px]' : 'h-[300px]'}`}>
                    {displayedGroupMembers.length === 0 ? (
                      <p className="text-muted-foreground text-sm text-center">No members in this group.</p>
                    ) : (
                      <TooltipProvider delayDuration={300}>
                        <ul>
                          {displayedGroupMembers.map(member => (
                            // Only show tooltip if name is available
                            member.name ? (
                              <Tooltip key={`member-tt-${member.id}`}>
                                <TooltipTrigger asChild>
                                  <li
                                    key={member.id}
                                    className={`flex items-center justify-between py-1 px-2 text-sm rounded-sm ${selectedMembers.includes(member.id) ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'} ${member.isSso ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                                    onClick={(e) => {
                                      if (!member.isSso) toggleSelection('members', member.id, e);
                                    }}
                                  >
                                    <span>{member.email} {member.isSso && <Badge variant="outline" className="ml-1">SSO</Badge>}</span>
                                  </li>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{member.name}</p> {/* Display name in tooltip */}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              // Render without Tooltip if no name
                              <li
                                key={member.id}
                                className={`flex items-center justify-between py-1 px-2 text-sm cursor-pointer rounded-sm ${selectedMembers.includes(member.id) ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                                onClick={(e) => toggleSelection('members', member.id, e)}
                              >
                                <span>{member.email}</span>
                              </li>
                            )
                          ))}
                        </ul>
                      </TooltipProvider>
                    )}
                  </ScrollArea>
                </div>
              </div>
            </>
          )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isUpdating}>Cancel</Button>
          <Button onClick={handleSaveChanges} disabled={isUpdating || (stagedAdditions.length === 0 && stagedRemovals.length === 0)}>
            {isUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}