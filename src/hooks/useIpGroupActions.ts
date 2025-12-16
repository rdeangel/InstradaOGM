'use client';
/* eslint-disable @typescript-eslint/no-unused-vars */

import { useState, useCallback, useEffect } from 'react';
import type { NetworkGroup, User as AppUserType } from '@/types/opnsense'; // Import AppUserType here
// import type { OpnsenseGroupDisplay } from '@/types/settings'; // Removed
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { useGroupType } from '@/context/GroupTypeContext';



interface UseIpGroupActionsProps {
  mounted: boolean;
  detectedIp: string | null;
  hostAlias: string | null; // Add hostAlias
  groups: NetworkGroup[];
  // opnsenseGroupDisplays: OpnsenseGroupDisplay[]; // Removed
  user: AppUserType | null; // Use AppUserType
  isUserAdmin: boolean;
  selectedGroupId: string | null;
  setSelectedGroupId: (id: string | null) => void; // Add setter for selectedGroupId
  // refreshOpnsenseData: () => Promise<void>; // Removed as it's no longer needed here
  refreshHostAlias: (ip: string) => Promise<void>; // From useIpDetection
  refreshGroups?: (force?: boolean) => Promise<void>; // New prop for refreshing groups
  fetchExtendedDetails?: (forceRefresh?: boolean) => Promise<void>; // New prop for refreshing extended details (full refresh with spinner)
  refreshLastOperationOnly?: () => Promise<void>; // New prop for lightweight last operation refresh (no spinner)
  refreshGraphs?: () => Promise<void>; // New prop for refreshing device group history graph
  isDeviceManagementPage?: boolean; // New prop to distinguish page context
}

export function useIpGroupActions({
  mounted,
  detectedIp,
  hostAlias, // Destructure hostAlias
  groups,
  // opnsenseGroupDisplays, // Removed
  user,
  isUserAdmin,
  selectedGroupId,
  setSelectedGroupId, // Destructure setSelectedGroupId
  // refreshOpnsenseData, // Removed from destructuring
  refreshHostAlias,
  refreshGroups,
  fetchExtendedDetails, // Destructure fetchExtendedDetails
  refreshLastOperationOnly, // Destructure refreshLastOperationOnly
  refreshGraphs, // Destructure refreshGraphs
  isDeviceManagementPage = false, // Destructure with default value
}: UseIpGroupActionsProps) {
  const { toast } = useToast();
  const { enableGroupTypes, enableSelfServiceMultiSelect } = useGroupType();
  const [isAssigningIp, setIsAssigningIp] = useState(false);

  // Compute effective group type behavior for UI display (indicators, filtering)
  // Device management: always respects enableGroupTypes
  // Self-service: requires both enableGroupTypes AND enableSelfServiceMultiSelect
  const effectiveGroupTypesEnabledForUI = enableGroupTypes && (isDeviceManagementPage || enableSelfServiceMultiSelect);

  // For assignment logic: always respect enableGroupTypes to preserve MultiSelect groups
  // When enableGroupTypes is true, NEVER use move-from-existing to avoid wiping MultiSelect groups
  const useModernAssignmentLogic = enableGroupTypes;
  const [isUnassigningDetected, setIsUnassigningDetected] = useState(false);
  const [userIpMemberOfGroups, setUserIpMemberOfGroups] = useState<NetworkGroup[]>([]);
  const [hasLoadedMembership, setHasLoadedMembership] = useState(false);

  const refreshUserIpGroupMembership = useCallback(async () => {
    if (mounted && detectedIp) {
      try {
        const response = await fetch(`/api/opnsense/ip-group-membership?ip=${detectedIp}`);
        if (!response.ok) {
          const errorData = await response.json();

          // Handle IP validation errors gracefully (403 Forbidden for self-service)
          if (response.status === 403 && errorData.error &&
            (errorData.error.includes('allowed networks') ||
              errorData.error.includes('only operate on their own IP'))) {
            // IP access restriction - this is expected behavior, not an error
            logger.info('IP access restricted for self-service, clearing group membership');
            setUserIpMemberOfGroups([]); // Clear group membership
            setHasLoadedMembership(true); // Mark as loaded (even if empty due to restrictions)
            return; // Don't throw error or show toast
          }

          throw new Error(errorData.error || `Failed to fetch IP group membership: ${response.statusText}`);
        }
        const memberOf: NetworkGroup[] = await response.json();
        setUserIpMemberOfGroups(memberOf); // Always update, remove deep comparison
        setHasLoadedMembership(true); // Mark as loaded
      } catch (error) {
        logger.error("Failed to fetch IP group membership:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not load your IP group memberships.",
        });
        setUserIpMemberOfGroups([]);
        setHasLoadedMembership(true); // Mark as loaded
      }
    } else if (mounted) {
      setUserIpMemberOfGroups([]);
      setHasLoadedMembership(false); // Reset when no IP
    }
  }, [mounted, detectedIp, toast]); // Removed userIpMemberOfGroups from dependencies

  // Fetch initial group membership
  useEffect(() => {
    if (mounted && detectedIp) {
      refreshUserIpGroupMembership();
    } else if (mounted) {
      setUserIpMemberOfGroups([]);
      setHasLoadedMembership(false); // Reset when no IP
    }
  }, [detectedIp, mounted, refreshUserIpGroupMembership]);

  const isIpInGroup = useCallback((groupId: string, ip: string | null): boolean => {
    if (!ip) return false;
    const group = groups.find(g => g.id === groupId);
    // Add a null check for group.members
    return group && group.members ? group.members.some(m => m.ipAddress === ip) : false;
  }, [groups]);

  const handleAssignIp = useCallback(async () => {
    if (!mounted) return;
    if (!selectedGroupId || !detectedIp) {
      toast({
        variant: "destructive",
        title: "Selection missing",
        description: `Host alias "${hostAlias}": Please select a group and ensure IP is detected.`,
      });
      return;
    }

    if (isIpInGroup(selectedGroupId, detectedIp)) {
      const groupName = groups.find(g => g.id === selectedGroupId)?.friendlyName || groups.find(g => g.id === selectedGroupId)?.name || 'Selected Group';
      toast({
        title: "Already a Member",
        description: `Host alias "${hostAlias}" (IP: ${detectedIp}) is already a member of the group "${groupName}".`,
        variant: "default",
      });
      return;
    }

    // Store original state for rollback
    const originalGroupMembership = [...userIpMemberOfGroups];

    logger.debug('handleAssignIp starting with:', {
      mounted,
      selectedGroupId,
      detectedIp,
      hostAlias,
      enableGroupTypes
    });

    setIsAssigningIp(true);
    try {
      // Find the selected group to check its type
      const selectedGroup = groups.find(g => g.id === selectedGroupId || g.uuid === selectedGroupId);
      const isMultiSelect = useModernAssignmentLogic && selectedGroup?.groupType === 'MultiSelect';

      // Determine moveFromExisting based on group types and current assignments
      let moveFromExisting = true; // Default behavior when group types are disabled

      if (useModernAssignmentLogic) {
        if (isMultiSelect) {
          // MultiSelect groups: never use moveFromExisting (additive only)
          moveFromExisting = false;
        } else {
          // SingleSelect groups: never use moveFromExisting when group types are enabled
          // The smart assignment logic handles SingleSelect moves manually to preserve MultiSelect groups
          moveFromExisting = false;
        }
      }

      logger.debug('handleAssignIp debug:', {
        selectedGroupId,
        enableGroupTypes,
        isMultiSelect,
        moveFromExisting,
        selectedGroupType: selectedGroup?.groupType
      });

      logger.debug('About to make API call - all validations passed');

      // Make the main assignment API call
      logger.debug('Making assignment API call with:', {
        operation: 'assign',
        ipAddress: detectedIp,
        hostAliasName: hostAlias,
        groupId: selectedGroupId,
        description: `Created by ${user ? user.name : 'Unauthenticated User'}`,
        moveFromExisting: moveFromExisting
      });

      const response = await fetch('/api/opnsense/host-group-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'assign',
          ipAddress: detectedIp,
          hostAliasName: hostAlias,
          groupId: selectedGroupId,
          description: `Created by ${user ? user.name : 'Unauthenticated User'}`,
          moveFromExisting: moveFromExisting
        }),
      });

      const result = await response.json();

      logger.debug('Assignment API response status:', response.status, response.ok);
      logger.debug('Assignment API result.success:', result.success);
      logger.debug('Assignment API result.message:', result.message);
      logger.debug('Assignment API full result:', JSON.stringify(result, null, 2));

      if (result.success) {
        // Update selected group immediately
        setSelectedGroupId(selectedGroupId);

        // Update UI immediately: handle both moveOnly move and modern assignment
        const assignedGroup = groups.find(g => g.id === selectedGroupId || g.uuid === selectedGroupId);
        if (assignedGroup) {
          logger.debug('handleAssignIp UI update:', {
            enableGroupTypes,
            moveFromExisting,
            selectedGroupId,
            assignedGroupName: assignedGroup.name,
            currentMembership: userIpMemberOfGroups.map(g => g.name),
            willReplace: !enableGroupTypes || moveFromExisting
          });

          if (!useModernAssignmentLogic || moveFromExisting) {
            // Move-only behavior or explicit move: replace all groups with just the new one
            logger.debug('REPLACING all groups with:', assignedGroup.name);
            setUserIpMemberOfGroups([assignedGroup]);
          } else {
            // Modern behavior: add to existing groups
            const updatedMembership = [...userIpMemberOfGroups];
            if (!updatedMembership.some(g => g.id === selectedGroupId || g.uuid === selectedGroupId)) {
              updatedMembership.push(assignedGroup);
              logger.debug('ADDING to existing groups. New membership:', updatedMembership.map(g => g.name));
              setUserIpMemberOfGroups(updatedMembership);
            } else {
              logger.debug('Group already present, no UI update needed');
            }
          }
        }

        // Stop the spinner immediately since the operation succeeded
        setIsAssigningIp(false);

        // Enhanced toast notification with move information
        let toastDescription = result.message;

        // If the response includes removedFromGroups information, enhance the toast
        if (result.removedFromGroups && result.removedFromGroups.length > 0) {
          const targetGroup = groups.find(g => g.id === selectedGroupId);
          const targetGroupName = targetGroup?.friendlyName || targetGroup?.name || 'Unknown Group';

          const removedGroups = result.removedFromGroups.map((group: { friendlyName?: string; name: string }) =>
            group.friendlyName || group.name
          ).join(', ');

          if (result.removedFromGroups.length === 1) {
            toastDescription = `Host alias "${hostAlias}" moved from "${removedGroups}" to "${targetGroupName}"`;
          } else {
            toastDescription = `Host alias "${hostAlias}" moved from "${removedGroups}" to "${targetGroupName}"`;
          }
        } else {
          // For direct assignment, refresh host alias first to get the correct name
          const targetGroup = groups.find(g => g.id === selectedGroupId);
          const targetGroupName = targetGroup?.friendlyName || targetGroup?.name || 'Unknown Group';

          // If host alias was null (didn't exist), refresh it first to get the created alias name
          if (!hostAlias) {
            try {
              await refreshHostAlias(detectedIp);
              // Get the updated host alias name from the API response
              const hostAliasResponse = await fetch(`/api/opnsense/host-alias-management?ipAddress=${detectedIp}`);
              if (hostAliasResponse.ok) {
                const hostAliasData = await hostAliasResponse.json();
                const updatedHostAliasName = hostAliasData.name || 'Unknown Host';
                toastDescription = `Host alias "${updatedHostAliasName}" assigned to group "${targetGroupName}"`;
              } else {
                toastDescription = `Host alias assigned to group "${targetGroupName}"`;
              }
            } catch (error) {
              logger.warn('Failed to refresh host alias for toast message:', error);
              toastDescription = `Host alias assigned to group "${targetGroupName}"`;
            }
          } else {
            toastDescription = `Host alias "${hostAlias}" assigned to group "${targetGroupName}"`;
          }
        }

        toast({
          title: "Success",
          description: toastDescription,
          variant: "success",
        });

        // Refresh host alias to update UI (if not already done above)
        if (hostAlias) {
          refreshHostAlias(detectedIp);
        }

        // Background refresh operations - don't block UI
        const refreshPromises = [
          refreshHostAlias(detectedIp!),
          fetch(`/api/opnsense/ip-group-membership?ip=${detectedIp}`).then(async res => {
            if (!res.ok) {
              const errorData = await res.json();
              // Handle IP validation errors gracefully
              if (res.status === 403 && errorData.error &&
                (errorData.error.includes('allowed networks') ||
                  errorData.error.includes('only operate on their own IP'))) {
                logger.info('Background refresh: IP access restricted, returning empty array');
                return []; // Return empty array for graceful handling
              }
              throw new Error(errorData.error || 'Failed to fetch IP group membership');
            }
            return res.json();
          }),
          refreshGroups?.(true)
        ];

        // Refresh last operation only (lightweight, no spinner) if available
        if (refreshLastOperationOnly) {
          refreshPromises.push(refreshLastOperationOnly());
        }

        // Refresh graph if available
        if (refreshGraphs) {
          refreshPromises.push(refreshGraphs());
        }

        Promise.all(refreshPromises).then((results) => {
          // memberOf is always at index 1 (second promise in the array)
          const memberOf = results[1];
          // Update state with the fetched membership data to ensure consistency
          if (memberOf && Array.isArray(memberOf)) {
            logger.debug('Background refresh: Updating userIpMemberOfGroups with fetched data:', memberOf.map((g: NetworkGroup) => g.name));
            setUserIpMemberOfGroups(memberOf);
          }
          logger.debug('Background refresh completed for handleAssignIp');
        }).catch(error => {
          logger.error('Background refresh failed:', error);
          // Fallback to manual refresh
          refreshUserIpGroupMembership();
        });

      } else {
        // Revert optimistic update on error
        setUserIpMemberOfGroups(originalGroupMembership);

        const targetGroup = groups.find(g => g.id === selectedGroupId);
        const targetGroupName = targetGroup?.friendlyName || targetGroup?.name || 'Unknown Group';
        toast({
          variant: "destructive",
          title: "Assignment Failed",
          description: `Host alias "${hostAlias}": ${result.message} ${selectedGroupId ? `for group "${targetGroupName}"` : ''}`,
        });
      }
    } catch (error) {
      logger.error('handleAssignIp caught error:', error);

      // Revert optimistic update on error
      setUserIpMemberOfGroups(originalGroupMembership);

      const errorMsg = error instanceof Error ? error.message : "An unknown error occurred.";
      toast({ variant: "destructive", title: "Assignment Error", description: errorMsg });
    } finally {
      setIsAssigningIp(false);
    }
  }, [mounted, selectedGroupId, setSelectedGroupId, detectedIp, isIpInGroup, groups, user, toast, refreshUserIpGroupMembership, refreshHostAlias, hostAlias, refreshGroups, refreshLastOperationOnly, userIpMemberOfGroups, enableGroupTypes, useModernAssignmentLogic, refreshGraphs]);

  const handleRemoveIp = useCallback(async (groupId: string, ip: string) => {
    if (!mounted) return;
    if (!isUserAdmin && ip !== detectedIp) {
      toast({ variant: "destructive", title: "Permission Denied", description: "You can only remove your own detected IP address." });
      return;
    }

    // Store original state for rollback
    const originalGroupMembership = [...userIpMemberOfGroups];

    setIsUnassigningDetected(true);
    try {
      const response = await fetch(`/api/opnsense/aliases/${groupId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ipAddress: ip }),
      });
      const result: { success: boolean; message: string; updatedGroup?: NetworkGroup | null } = await response.json();

      if (result.success) {
        // Stop the spinner immediately since the operation succeeded
        setIsUnassigningDetected(false);

        const targetGroup = groups.find(g => g.id === groupId);
        const targetGroupName = targetGroup?.friendlyName || targetGroup?.name || 'Unknown Group';
        toast({
          title: "Success",
          description: `Host alias "${hostAlias}" removed from group "${targetGroupName}".`,
          variant: "success",
        });
        // Background refresh to sync with real data
        refreshUserIpGroupMembership();
      } else {
        // Revert optimistic update on error
        setUserIpMemberOfGroups(originalGroupMembership);

        const targetGroup = groups.find(g => g.id === groupId);
        const targetGroupName = targetGroup?.friendlyName || targetGroup?.name || 'Unknown Group';
        toast({
          variant: "destructive",
          title: "Removal Failed",
          description: `Host alias "${hostAlias}": ${result.message} for group "${targetGroupName}"`,
        });
      }
    } catch (error) {
      // Revert optimistic update on error
      setUserIpMemberOfGroups(originalGroupMembership);

      toast({ variant: "destructive", title: "Removal Error", description: error instanceof Error ? error.message : "Could not remove IP." });
    } finally {
      setIsUnassigningDetected(false);
    }
  }, [mounted, isUserAdmin, detectedIp, toast, groups, refreshUserIpGroupMembership, hostAlias, userIpMemberOfGroups]);

  const handleUnassignAll = useCallback(async () => {
    if (!mounted) return;

    if (!detectedIp) {
      toast({
        variant: "destructive",
        title: "Unassignment Failed",
        description: `Host alias "${hostAlias}": Could not detect your IP address for unassignment. Please ensure IP detection is working.`,
      });
      return;
    }

    if (userIpMemberOfGroups.length === 0) {
      toast({
        title: "No Assignments",
        description: `Host alias "${hostAlias}" is not currently assigned to any groups.`,
        variant: "default",
      });
      return;
    }

    // Store original state for rollback
    const originalGroupMembership = [...userIpMemberOfGroups];

    setIsUnassigningDetected(true);

    try {
      // Use the host-group-management API for unassign from all groups
      logger.debug(`Calling host-group-management API to unassign IP ${detectedIp} from all groups`);

      const response = await fetch('/api/opnsense/host-group-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'unassign',
          ipAddress: detectedIp,
          hostAliasName: hostAlias
          // No groupId means unassign from all groups
        }),
      });

      // Log the raw response for debugging
      const responseText = await response.text();
      logger.debug(`Unassign API response: ${responseText}`);

      let result;
      try {
        // Try to parse the response as JSON
        result = JSON.parse(responseText);
      } catch {
        logger.error(`Failed to parse API response as JSON: ${responseText}`);
        throw new Error(`Invalid response from server: ${responseText}`);
      }

      if (response.ok && result.success) {
        // Update UI immediately: clear all groups
        setUserIpMemberOfGroups([]);

        // Stop the spinner immediately since the operation succeeded
        setIsUnassigningDetected(false);

        toast({
          title: "Unassignment Complete",
          description: `Host alias "${hostAlias}" has been unassigned from all groups.`,
          variant: "success",
        });

        // Background refresh operations - don't block UI
        const refreshPromises = [
          refreshHostAlias(detectedIp!),
          fetch(`/api/opnsense/ip-group-membership?ip=${detectedIp}`).then(res => res.json()),
          refreshGroups?.(true)
        ];

        // Refresh last operation only (lightweight, no spinner) if available
        if (refreshLastOperationOnly) {
          refreshPromises.push(refreshLastOperationOnly());
        }

        // Refresh graph if available
        if (refreshGraphs) {
          refreshPromises.push(refreshGraphs());
        }

        Promise.all(refreshPromises).then((results) => {
          // memberOf is always at index 1 (second promise in the array)
          const memberOf = results[1];
          // Update state with the fetched membership data to ensure consistency
          if (memberOf && Array.isArray(memberOf)) {
            logger.debug('Background refresh: Updating userIpMemberOfGroups with fetched data:', memberOf.map((g: NetworkGroup) => g.name));
            setUserIpMemberOfGroups(memberOf);
          }
          logger.debug('Background refresh completed for handleUnassignAll');
        }).catch(error => {
          logger.error('Background refresh failed:', error);
          // Fallback to manual refresh
          refreshUserIpGroupMembership();
        });
      } else {
        // Revert optimistic update on error
        setUserIpMemberOfGroups(originalGroupMembership);

        toast({
          variant: "destructive",
          title: "Unassignment Failed",
          description: `Host alias "${hostAlias}": ${result.message || "Failed to unassign from all groups."}`,
        });
      }
    } catch (error) {
      // Revert optimistic update on error
      setUserIpMemberOfGroups(originalGroupMembership);

      logger.error(`Error during unassign operation:`, error);
      toast({
        variant: "destructive",
        title: "Unassignment Error",
        description: error instanceof Error ? error.message : "An unknown error occurred during unassignment.",
      });
    } finally {
      setIsUnassigningDetected(false);
    }
  }, [mounted, detectedIp, userIpMemberOfGroups, toast, refreshUserIpGroupMembership, hostAlias, refreshHostAlias, refreshGroups, refreshLastOperationOnly, refreshGraphs]);


  // New function to handle removing from a specific group
  const handleRemoveFromGroup = useCallback(async (groupId: string, showSpinner: boolean = true) => {
    if (!mounted) return;

    if (!detectedIp) {
      toast({
        variant: "destructive",
        title: "Removal Failed",
        description: `Host alias "${hostAlias}": Could not detect your IP address for removal. Please ensure IP detection is working.`,
      });
      return;
    }

    const targetGroup = groups.find(g => g.id === groupId || g.uuid === groupId);
    if (!targetGroup) {
      toast({
        variant: "destructive",
        title: "Removal Failed",
        description: "Selected group not found.",
      });
      return;
    }

    // Check if the IP is actually in this group
    const isInGroup = userIpMemberOfGroups.some(group => group.id === groupId || group.uuid === groupId);
    if (!isInGroup) {
      toast({
        title: "Not in Group",
        description: `Host alias "${hostAlias}" is not currently assigned to "${targetGroup.friendlyName || targetGroup.name}".`,
        variant: "default",
      });
      return;
    }

    // Store original state for rollback
    const originalGroupMembership = [...userIpMemberOfGroups];

    if (showSpinner) {
      setIsUnassigningDetected(true);
    }

    try {
      // Use the host-group-management API for unassign from specific group
      logger.debug(`Calling host-group-management API to unassign IP ${detectedIp} from group ${groupId}`);

      const response = await fetch('/api/opnsense/host-group-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'unassign',
          ipAddress: detectedIp,
          hostAliasName: hostAlias,
          groupId: groupId // Specify the group to unassign from
        }),
      });

      // Log the raw response for debugging
      const responseText = await response.text();
      logger.debug(`Unassign from group API response: ${responseText}`);

      let result;
      try {
        // Try to parse the response as JSON
        result = JSON.parse(responseText);
      } catch {
        logger.error(`Failed to parse API response as JSON: ${responseText}`);
        throw new Error(`Invalid response from server: ${responseText}`);
      }

      if (response.ok && result.success) {
        // Update UI immediately: remove the group
        const updatedMembership = userIpMemberOfGroups.filter(group =>
          group.id !== groupId && group.uuid !== groupId
        );
        setUserIpMemberOfGroups(updatedMembership);

        // Stop the spinner immediately since the operation succeeded
        if (showSpinner) {
          setIsUnassigningDetected(false);
        }

        const actionWord = targetGroup.groupType === 'MultiSelect' ? 'removed from' : 'unassigned from';
        toast({
          title: "Success",
          description: `Host alias "${hostAlias}" has been ${actionWord} "${targetGroup.friendlyName || targetGroup.name}".`,
          variant: "success",
        });

        // Background refresh operations - don't block UI
        const refreshPromises = [
          refreshHostAlias(detectedIp!),
          fetch(`/api/opnsense/ip-group-membership?ip=${detectedIp}`).then(res => res.json()),
          refreshGroups?.(true)
        ];

        // Refresh last operation only (lightweight, no spinner) if available
        if (refreshLastOperationOnly) {
          refreshPromises.push(refreshLastOperationOnly());
        }

        // Refresh graph if available
        if (refreshGraphs) {
          refreshPromises.push(refreshGraphs());
        }

        Promise.all(refreshPromises).then((results) => {
          // memberOf is always at index 1 (second promise in the array)
          const memberOf = results[1];
          // Update state with the fetched membership data to ensure consistency
          if (memberOf && Array.isArray(memberOf)) {
            logger.debug('Background refresh: Updating userIpMemberOfGroups with fetched data:', memberOf.map((g: NetworkGroup) => g.name));
            setUserIpMemberOfGroups(memberOf);
          }
          logger.debug('Background refresh completed for handleRemoveFromGroup');
        }).catch(err => logger.warn('Background refresh failed:', err));
      } else {
        // Revert optimistic update on error
        setUserIpMemberOfGroups(originalGroupMembership);

        toast({
          variant: "destructive",
          title: "Removal Failed",
          description: `Host alias "${hostAlias}": ${result.message || "Failed to remove from group."}`,
        });
      }
    } catch (error) {
      // Revert optimistic update on error
      setUserIpMemberOfGroups(originalGroupMembership);

      logger.error(`Error during remove from group operation:`, error);
      toast({
        variant: "destructive",
        title: "Removal Error",
        description: error instanceof Error ? error.message : "An unknown error occurred during removal.",
      });
    } finally {
      if (showSpinner) {
        setIsUnassigningDetected(false);
      }
    }
  }, [mounted, detectedIp, userIpMemberOfGroups, toast, groups, hostAlias, refreshHostAlias, refreshGroups, refreshLastOperationOnly, refreshGraphs]);

  // Smart assignment function that handles SingleSelect moves with proper spinner management
  const handleSmartAssign = useCallback(async (targetGroupId: string) => {
    if (!mounted) return;
    if (!targetGroupId || !detectedIp) {
      toast({
        variant: "destructive",
        title: "Selection missing",
        description: `Host alias "${hostAlias}": Please select a group and ensure IP is detected.`,
      });
      return;
    }

    const targetGroup = groups.find(g => g.id === targetGroupId || g.uuid === targetGroupId);
    if (!targetGroup) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Selected group not found.",
      });
      return;
    }

    if (!useModernAssignmentLogic) {
      // When group types are disabled, use moveOnly behavior
      await handleAssignIp();
      return;
    }

    const currentSingleSelectGroups = userIpMemberOfGroups.filter(group =>
      groups.find(g => g.id === group.id)?.groupType === 'SingleSelect'
    );

    logger.debug('Smart assignment debug:', {
      targetGroupId,
      targetGroupType: targetGroup.groupType,
      enableGroupTypes,
      userIpMemberOfGroups: userIpMemberOfGroups.map(g => ({ id: g.id, name: g.name })),
      currentSingleSelectGroups: currentSingleSelectGroups.map(g => ({ id: g.id, name: g.name })),
      allGroupsWithTypes: groups.map(g => ({ id: g.id, name: g.name, groupType: g.groupType }))
    });

    if (targetGroup.groupType === 'SingleSelect' && currentSingleSelectGroups.length > 0) {
      // For SingleSelect groups with existing assignments: unified move operation
      // Start assign spinner immediately and keep it running throughout the entire operation
      setIsAssigningIp(true);

      try {
        // Perform SingleSelect move in a single batch call, preserving MultiSelect memberships
        const response = await fetch('/api/opnsense/host-group-management', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operation: 'batch',
            operationType: 'assign',
            hostAliases: [{ ipAddress: detectedIp, hostAliasName: hostAlias }],
            groups: [
              targetGroup.friendlyName
                ? { groupFriendlyName: targetGroup.friendlyName }
                : { groupName: targetGroup.name }
            ],
            description: `Assigned by ${user?.name || 'User'}`,
            moveFromExisting: true,
            restrictRemovalToSingleSelect: true
          }),
        });

        const result = await response.json();

        if (result.success) {
          // Update UI with final state: remove old SingleSelect groups and add new one
          const assignedGroup = groups.find(g => g.id === targetGroupId || g.uuid === targetGroupId);
          if (assignedGroup) {
            // Create final membership: keep MultiSelect groups, remove old SingleSelect, add new SingleSelect
            const finalMembership = userIpMemberOfGroups
              .filter(group => {
                const groupInfo = groups.find(g => g.id === group.id);
                return groupInfo?.groupType === 'MultiSelect'; // Keep only MultiSelect groups
              })
              .concat([assignedGroup]); // Add the new SingleSelect group

            setUserIpMemberOfGroups(finalMembership);
          }

          // Stop the spinner
          setIsAssigningIp(false);

          // Build richer success message using removedFromGroups when present
          let toastDescription: string;

          // If host alias was null (didn't exist), refresh it first to get the created alias name
          if (!hostAlias) {
            try {
              await refreshHostAlias(detectedIp);
              // Get the updated host alias name from the API response
              const hostAliasResponse = await fetch(`/api/opnsense/host-alias-management?ipAddress=${detectedIp}`);
              if (hostAliasResponse.ok) {
                const hostAliasData = await hostAliasResponse.json();
                const updatedHostAliasName = hostAliasData.name || 'Unknown Host';
                toastDescription = `Host alias "${updatedHostAliasName}" moved to "${targetGroup.friendlyName || targetGroup.name}".`;
                if (result.removedFromGroups && Array.isArray(result.removedFromGroups) && result.removedFromGroups.length > 0) {
                  const removedGroups = result.removedFromGroups
                    .map((g: { friendlyName?: string; name?: string }) => g.friendlyName || g.name)
                    .filter(Boolean)
                    .join(', ');
                  toastDescription = `Host alias "${updatedHostAliasName}" moved from "${removedGroups}" to "${targetGroup.friendlyName || targetGroup.name}"`;
                }
              } else {
                toastDescription = `Host alias moved to "${targetGroup.friendlyName || targetGroup.name}".`;
              }
            } catch (error) {
              logger.warn('Failed to refresh host alias for toast message:', error);
              toastDescription = `Host alias moved to "${targetGroup.friendlyName || targetGroup.name}".`;
            }
          } else {
            toastDescription = `Host alias "${hostAlias}" moved to "${targetGroup.friendlyName || targetGroup.name}".`;
            if (result.removedFromGroups && Array.isArray(result.removedFromGroups) && result.removedFromGroups.length > 0) {
              const removedGroups = result.removedFromGroups
                .map((g: { friendlyName?: string; name?: string }) => g.friendlyName || g.name)
                .filter(Boolean)
                .join(', ');
              toastDescription = `Host alias "${hostAlias}" moved from "${removedGroups}" to "${targetGroup.friendlyName || targetGroup.name}"`;
            }
          }

          toast({
            title: "Success",
            description: toastDescription,
            variant: "success",
          });

          // Background refresh (for data consistency, no UI updates needed)
          const refreshPromises = [
            refreshHostAlias(detectedIp),
            fetch(`/api/opnsense/ip-group-membership?ip=${detectedIp}`).then(res => res.json()),
            refreshGroups?.(true)
          ];

          // Refresh last operation only (lightweight, no spinner) if available
          if (refreshLastOperationOnly) {
            refreshPromises.push(refreshLastOperationOnly());
          }

          // Refresh graph if available
          if (refreshGraphs) {
            refreshPromises.push(refreshGraphs());
          }

          Promise.all(refreshPromises).then((results) => {
            // memberOf is always at index 1 (second promise in the array)
            const memberOf = results[1];
            // Update state with the fetched membership data to ensure consistency
            if (memberOf && Array.isArray(memberOf)) {
              logger.debug('Background refresh: Updating userIpMemberOfGroups with fetched data:', memberOf.map((g: NetworkGroup) => g.name));
              setUserIpMemberOfGroups(memberOf);
            }
            logger.debug('Background refresh completed for data consistency');
          }).catch(error => {
            logger.error('Background refresh failed:', error);
            // Only refresh if there was an error to ensure data consistency
            refreshUserIpGroupMembership();
          });

        } else {
          throw new Error(result.message || 'Assignment failed');
        }

      } catch (error) {
        setIsAssigningIp(false);
        toast({
          variant: "destructive",
          title: "Assignment Failed",
          description: error instanceof Error ? error.message : "An unknown error occurred.",
        });
      }
    } else {
      // For MultiSelect groups or SingleSelect without existing assignments: simple assignment
      logger.debug('Smart assignment taking simple assignment path for:', {
        targetGroupId,
        targetGroupType: targetGroup.groupType,
        reason: targetGroup.groupType === 'MultiSelect' ? 'MultiSelect group' : 'SingleSelect without existing assignments'
      });

      // Ensure selectedGroupId is set to the target group before calling handleAssignIp
      setSelectedGroupId(targetGroupId);
      await handleAssignIp();
    }
  }, [mounted, detectedIp, hostAlias, groups, useModernAssignmentLogic, userIpMemberOfGroups, handleAssignIp, refreshHostAlias, refreshGroups, refreshLastOperationOnly, refreshGraphs, user, toast, enableGroupTypes, refreshUserIpGroupMembership, setSelectedGroupId]);

  return {
    userIpMemberOfGroups,
    hasLoadedMembership, // New flag to track if membership data has been loaded
    isAssigningIp,
    isUnassigningDetected,
    isIpInGroup,
    handleAssignIp,
    handleRemoveIp, // Note: handleRemoveIp is used by handleUnassignAll, but not directly by the page.
    // If it were to be used by the page for individual removals (e.g. admin removing any IP), it should be returned.
    // For now, it's an internal helper for handleUnassignAll.
    handleUnassignAll,
    handleRemoveFromGroup, // New function for removing from specific group
    handleSmartAssign, // New function for smart assignment with proper spinner management
    refreshUserIpGroupMembership, // May still be useful for direct refresh from page if needed
  };
}