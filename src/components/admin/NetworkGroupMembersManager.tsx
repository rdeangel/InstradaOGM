'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import type { NetworkGroup, OpnsenseAliasDetailFromExport, NetworkAlias } from '@/types/opnsense';
import { useNetworkAliasesEnabled } from '@/hooks/useNetworkAliasesEnabled';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Extend OpnsenseAliasDetailFromExport to include detectedMac and detectedVendor
interface EnrichedOpnsenseAliasDetailFromExport extends OpnsenseAliasDetailFromExport {
  detectedMac?: string | null;
  detectedVendor?: string | null;
}

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { logger } from '@/lib/logger';

import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertCircle, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Waypoints } from 'lucide-react';
import { BulkOperationProgressModal, useBulkOperationProgressModal } from '@/components/ui/bulk-operation-progress-modal';
import {
  createInitialBulkProgress,
  updateBulkProgress,
  type BulkOperationProgress,
} from '@/lib/bulk-operation-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area"; // Import ScrollArea
import { createPortal } from 'react-dom';
import { useIsMobile } from '@/hooks/use-mobile'; // Import useIsMobile hook

import { fetchAndCacheGroupFiltersFromAPI } from '@/lib/group-filter-utils';
import type { OpnsenseGroupDisplay } from '@/types/settings';
import { StatusDotWithTooltip, StatusDotLegend, getHostAliasStatusColor } from '@/components/ui/status-dot';



interface NetworkGroupMembersManagerProps {
  isOpen: boolean;
  onClose: () => void;
  editingAlias: NetworkGroup | null;
  opnsenseGroupDisplays: OpnsenseGroupDisplay[];
  onSaveSuccess: (updatedGroup: NetworkGroup, migrationOccurred: boolean, affectedGroupIds?: string[]) => void;
  enableGroupTypes?: boolean;
  groupTypeName?: string;
}

export function NetworkGroupMembersManager({
  isOpen,
  onClose,
  editingAlias,
  opnsenseGroupDisplays,
  onSaveSuccess,
  enableGroupTypes = false,
  groupTypeName = 'Single Select',
}: NetworkGroupMembersManagerProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile(); // Use the hook
  const [isProcessing, setIsProcessing] = useState(false);
  const progressModal = useBulkOperationProgressModal();
  const [bulkProgress, setBulkProgress] = useState<BulkOperationProgress | null>(null);

  // Debug logging for props
  logger.debug('NetworkGroupMembersManager Props Debug:', {
    enableGroupTypes,
    groupTypeName,
    editingAlias: editingAlias?.name,
    editingAliasGroupType: editingAlias?.groupType,
    opnsenseGroupDisplaysCount: opnsenseGroupDisplays?.length
  });

  // State for host alias management
  const [associatedHostAliases, setAssociatedHostAliases] = useState<EnrichedOpnsenseAliasDetailFromExport[]>([]);
  const [availableHostAliases, setAvailableHostAliases] = useState<EnrichedOpnsenseAliasDetailFromExport[]>([]);
  const [isLoadingHostAliases, setIsLoadingHostAliases] = useState(false);
  const [selectedAvailable, setSelectedAvailable] = useState<string[]>([]);
  const [selectedAssociated, setSelectedAssociated] = useState<string[]>([]);
  const [availableSearchTerm, setAvailableSearchTerm] = useState("");
  const [associatedSearchTerm, setAssociatedSearchTerm] = useState("");
  const [lastSelectedAvailableAnchor, setLastSelectedAvailableAnchor] = useState<string | null>(null);
  const [lastSelectedAssociatedAnchor, setLastSelectedAssociatedAnchor] = useState<string | null>(null);
  const [associatedSearchHelpOpen, setAssociatedSearchHelpOpen] = useState(false);

  // Network alias tab state
  const { manageNetworkAliasesEnabled } = useNetworkAliasesEnabled();
  const [activeDialogTab, setActiveDialogTab] = useState('host-aliases');
  const [associatedNetworkAliases, setAssociatedNetworkAliases] = useState<NetworkAlias[]>([]);
  const [availableNetworkAliases, setAvailableNetworkAliases] = useState<NetworkAlias[]>([]);
  const [originalAssociatedNetworkAliasUuids, setOriginalAssociatedNetworkAliasUuids] = useState<string[]>([]);
  const [selectedAvailableNetAliases, setSelectedAvailableNetAliases] = useState<string[]>([]);
  const [selectedAssociatedNetAliases, setSelectedAssociatedNetAliases] = useState<string[]>([]);
  const [availableNetAliasSearchTerm, setAvailableNetAliasSearchTerm] = useState("");
  const [associatedNetAliasSearchTerm, setAssociatedNetAliasSearchTerm] = useState("");
  const [lastSelectedAvailableNetAliasAnchor, setLastSelectedAvailableNetAliasAnchor] = useState<string | null>(null);
  const [lastSelectedAssociatedNetAliasAnchor, setLastSelectedAssociatedNetAliasAnchor] = useState<string | null>(null);
  const [isLoadingNetworkAliases, setIsLoadingNetworkAliases] = useState(false);

  // New state for host migration feature
  const [allowHostMigration, setAllowHostMigration] = useState(false);
  const [showMigrationConfirmDialog, setShowMigrationConfirmDialog] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");

  const [allowNetAliasMigration, setAllowNetAliasMigration] = useState(false);
  const [showNetAliasMigrationConfirmDialog, setShowNetAliasMigrationConfirmDialog] = useState(false);
  const [netAliasConfirmInput, setNetAliasConfirmInput] = useState("");

  // State to track original values for change detection
  const [originalAssociatedHostNames, setOriginalAssociatedHostNames] = useState<Set<string>>(new Set());
  const [originalAllowHostMigration, setOriginalAllowHostMigration] = useState(false);

  // Determine if migration should be disabled based on group type
  const isMultiSelectGroup = enableGroupTypes && editingAlias?.groupType === 'MultiSelect';
  const migrationDisabled = isMultiSelectGroup;

  // Custom StatusDotWithTooltip component that can handle multi-line content
  const StatusDotWithDetailedTooltip = ({ host }: { host: EnrichedOpnsenseAliasDetailFromExport }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

    const color = getHostAliasStatusColor(
      host.enabled === '1',
      !!host.detectedMac
    );

    const tooltipContent = (
      <div>
        {host.content && <p>Content: {host.content}</p>}
        <p>Status: {host.enabled === '1' ? (host.detectedMac ? 'Online' : 'Offline') : 'Disabled'}</p>
        {host.detectedMac && <p>MAC: {host.detectedMac}</p>}
        {host.detectedVendor && <p>Vendor: {host.detectedVendor}</p>}
        {host.description && <p>Description: {host.description}</p>}
      </div>
    );

    const handleMouseEnter = (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltipPosition({
        x: rect.right + 8,
        y: rect.top
      });
      setShowTooltip(true);
    };

    const handleMouseLeave = () => {
      setShowTooltip(false);
    };

    return (
      <>
        <div
          className="cursor-help"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <StatusDotWithTooltip
            color={color}
            size="sm"
          />
        </div>
        {showTooltip && typeof document !== 'undefined' && createPortal(
          <div
            className="fixed z-[99999] max-w-xs p-3 text-sm bg-popover text-popover-foreground border rounded-md shadow-xl"
            style={{
              left: `${Math.min(tooltipPosition.x, window.innerWidth - 300)}px`,
              top: `${Math.max(10, Math.min(tooltipPosition.y, window.innerHeight - 100))}px`,
              transform: 'translateY(-50%)',
              pointerEvents: 'none'
            }}
          >
            {tooltipContent}
          </div>,
          document.body
        )}
      </>
    );
  };

  const fetchHostAliasesForDialog = useCallback(async (aliasToEdit: NetworkGroup, currentAllowHostMigration: boolean) => {
    setIsLoadingHostAliases(true);
    try {
      // 1. Fetch and cache group filter settings (if not already fresh, though usually done on page load)
      await fetchAndCacheGroupFiltersFromAPI();

      // 2. Fetch all network groups (needed to determine which host aliases are truly available)
      const allNetworkGroupsResponse = await fetch('/api/opnsense/network-groups', { cache: 'no-store' });
      if (!allNetworkGroupsResponse.ok) {
        throw new Error('Failed to fetch all network groups for dialog');
      }
      const allNetworkGroupsData = await allNetworkGroupsResponse.json();
      const allOpnsenseNetworkGroupsData: NetworkGroup[] = Array.isArray(allNetworkGroupsData.networkGroups) ? allNetworkGroupsData.networkGroups : [];

      // Fetch globally disabled groups
      const globallyDisabledGroupsResponse = await fetch('/api/settings/opnsense-group-display', { cache: 'no-store' });
      if (!globallyDisabledGroupsResponse.ok) {
        const errorData = await globallyDisabledGroupsResponse.json();
        logger.error('Failed to fetch globally disabled groups for NetworkGroupMembersManager:', errorData);
      }





      // Create a map of all host aliases that are already in any group
      const hostAliasesInGroups = new Map<string, string[]>(); // Map of host alias name -> array of group UUIDs it belongs to

      // Populate the map with all host aliases in all groups
      allOpnsenseNetworkGroupsData.forEach((group: NetworkGroup) => {
        const members = (group.rawContent || '').split('\n').filter(name => name.trim() !== '');
        members.forEach(memberName => {
          if (!hostAliasesInGroups.has(memberName)) {
            hostAliasesInGroups.set(memberName, []);
          }
          hostAliasesInGroups.get(memberName)?.push(group.uuid);
        });
      });

      // 3. Fetch filtered host aliases (same as GroupHostAliasPermissionsDialog)
      const hostAliasesResponse = await fetch('/api/opnsense/filtered-host-aliases', { cache: 'no-store' });
      if (!hostAliasesResponse.ok) {
        const errorData = await hostAliasesResponse.json();
        throw new Error(errorData.message || `Failed to fetch filtered host aliases: ${hostAliasesResponse.statusText}`);
      }
      const { displayableHostAliases: allFetchedHostAliases } = await hostAliasesResponse.json();


      const currentMemberNames = (aliasToEdit.rawContent || '').split('\n').filter(name => name.trim() !== '');

      const currentAssociatedHosts: EnrichedOpnsenseAliasDetailFromExport[] = [];
      const potentialAvailableHostsInitial: EnrichedOpnsenseAliasDetailFromExport[] = [];

      // First, separate associated and non-associated host aliases
      allFetchedHostAliases.forEach((host: EnrichedOpnsenseAliasDetailFromExport) => {
        if (currentMemberNames.includes(host.name)) {
          currentAssociatedHosts.push(host);
        } else {
          potentialAvailableHostsInitial.push(host);
        }
      });
      setAssociatedHostAliases(currentAssociatedHosts.sort((a, b) => a.name.localeCompare(b.name)));
      // Store original associated host names for change detection
      setOriginalAssociatedHostNames(new Set(currentMemberNames));
      setOriginalAllowHostMigration(currentAllowHostMigration);

      // 4. Filter potentialAvailableHosts based on group type and migration settings
      let trulyAvailableHosts: EnrichedOpnsenseAliasDetailFromExport[] = [];

      if (!enableGroupTypes) {
        // Original behavior when group types are disabled
        if (currentAllowHostMigration) {
          // Show all hosts when migration is enabled (original behavior)
          trulyAvailableHosts = potentialAvailableHostsInitial;
          logger.debug(`Group types disabled, migration enabled: Loading all ${potentialAvailableHostsInitial.length} host aliases`);
        } else {
          // Show only unassigned hosts when migration is disabled (original behavior)
          trulyAvailableHosts = potentialAvailableHostsInitial.filter(host => {
            const groupsContainingHost = hostAliasesInGroups.get(host.name) || [];
            return groupsContainingHost.length === 0;
          });
          logger.debug(`Group types disabled, migration disabled: Loading ${trulyAvailableHosts.length} unassigned host aliases (filtered from ${potentialAvailableHostsInitial.length} total)`);
        }
      } else if (isMultiSelectGroup) {
        // For MultiSelect groups, show all hosts (except those already in this group)
        // MultiSelect groups use additive assignment, so devices can be in multiple groups
        trulyAvailableHosts = potentialAvailableHostsInitial;
        logger.debug(`MultiSelect group: Loading all ${potentialAvailableHostsInitial.length} host aliases (additive assignment)`);
      } else {
        // For SingleSelect groups when group types are enabled
        // Migration definition: a host is considered a migration target only if it is in at least one SingleSelect group
        // Being only in MultiSelect groups is NOT considered a migration and should be allowed as normal assignment when migration is off

        // Build a robust groupType map using both network groups and display mappings (lowercased UUIDs)
        const groupTypeById = new Map<string, 'SingleSelect' | 'MultiSelect'>();
        allOpnsenseNetworkGroupsData.forEach((g: NetworkGroup) => {
          if (g?.uuid) {
            const val = (g.groupType === 'MultiSelect') ? 'MultiSelect' : (g.groupType === 'SingleSelect' ? 'SingleSelect' : undefined);
            if (val) groupTypeById.set(String(g.uuid).toLowerCase(), val);
          }
        });
        opnsenseGroupDisplays.forEach((d: OpnsenseGroupDisplay) => {
          if (d?.opnsenseUuid) {
            const val = (d.groupType === 'MultiSelect') ? 'MultiSelect' : (d.groupType === 'SingleSelect' ? 'SingleSelect' : undefined);
            if (val) groupTypeById.set(String(d.opnsenseUuid).toLowerCase(), val);
          }
        });

        if (currentAllowHostMigration) {
          // Show all hosts when migration is enabled
          trulyAvailableHosts = potentialAvailableHostsInitial;
          logger.debug(`SingleSelect group with migration enabled: Loading all ${potentialAvailableHostsInitial.length} host aliases`);
        } else {
          // Migration disabled: only show hosts that are not in any SingleSelect groups
          // Hosts that are only in MultiSelect groups are allowed (normal assignment)
          trulyAvailableHosts = potentialAvailableHostsInitial.filter(host => {
            const groupsContainingHost = hostAliasesInGroups.get(host.name) || [];
            // Determine if host is in ANY SingleSelect group (unknown groups are treated as MultiSelect for visibility)
            const inAnySingleSelect = groupsContainingHost.some(uuid => {
              const t = groupTypeById.get(String(uuid || '').toLowerCase());
              return t === 'SingleSelect';
            });
            return !inAnySingleSelect;
          });
          logger.debug(`SingleSelect group with migration disabled: Loading ${trulyAvailableHosts.length} host aliases not in any SingleSelect groups (filtered from ${potentialAvailableHostsInitial.length} total)`);
        }
      }

      setAvailableHostAliases(trulyAvailableHosts.sort((a, b) => a.name.localeCompare(b.name)));

    } catch (error) {
      logger.error("Error fetching or processing host aliases for dialog:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load available host aliases." });

      setAssociatedHostAliases([]);
      setAvailableHostAliases([]);
    } finally {
      setIsLoadingHostAliases(false);
      setSelectedAvailable([]);
      setSelectedAssociated([]);
      setAvailableSearchTerm("");
      setAssociatedSearchTerm("");
      setLastSelectedAvailableAnchor(null);
      setLastSelectedAssociatedAnchor(null);
    }
  }, [toast, enableGroupTypes, isMultiSelectGroup, opnsenseGroupDisplays]);

  const fetchNetworkAliasesForDialog = useCallback(async (group: NetworkGroup, currentAllowNetAliasMigration: boolean) => {
    if (!manageNetworkAliasesEnabled) return;
    setIsLoadingNetworkAliases(true);
    try {
      const resp = await fetch('/api/opnsense/network-aliases', { cache: 'no-store' });
      if (!resp.ok) throw new Error('Failed to fetch network aliases');
      const rawData: NetworkAlias[] = await resp.json();
      const data = rawData.filter(a => !a.hidden);

      const memberNames = new Set((group.rawContent || '').split('\n').map(n => n.trim()).filter(Boolean));
      const currentAssociated = data.filter(a => memberNames.has(a.name)).sort((a, b) => a.name.localeCompare(b.name));
      const potentialAvailable = data.filter(a => !memberNames.has(a.name)).sort((a, b) => a.name.localeCompare(b.name));

      let trulyAvailable: NetworkAlias[];

      if (!enableGroupTypes) {
        if (currentAllowNetAliasMigration) {
          trulyAvailable = potentialAvailable;
        } else {
          const allGroupsResp = await fetch('/api/opnsense/network-groups', { cache: 'no-store' });
          const allGroupsData = allGroupsResp.ok ? await allGroupsResp.json() : { networkGroups: [] };
          const allGroups: NetworkGroup[] = Array.isArray(allGroupsData.networkGroups) ? allGroupsData.networkGroups : [];
          const aliasInGroups = new Map<string, string[]>();
          allGroups.forEach((g: NetworkGroup) => {
            const members = (g.rawContent || '').split('\n').map((s: string) => s.trim()).filter(Boolean);
            members.forEach((memberName: string) => {
              if (!aliasInGroups.has(memberName)) aliasInGroups.set(memberName, []);
              aliasInGroups.get(memberName)?.push(g.uuid);
            });
          });
          trulyAvailable = potentialAvailable.filter(a => {
            const groups = aliasInGroups.get(a.name) || [];
            return groups.length === 0;
          });
        }
      } else if (isMultiSelectGroup) {
        trulyAvailable = potentialAvailable;
      } else {
        const allGroupsResp = await fetch('/api/opnsense/network-groups', { cache: 'no-store' });
        const allGroupsData = allGroupsResp.ok ? await allGroupsResp.json() : { networkGroups: [] };
        const allGroups: NetworkGroup[] = Array.isArray(allGroupsData.networkGroups) ? allGroupsData.networkGroups : [];

        const aliasInGroups = new Map<string, string[]>();
        allGroups.forEach((g: NetworkGroup) => {
          const members = (g.rawContent || '').split('\n').map((s: string) => s.trim()).filter(Boolean);
          members.forEach((memberName: string) => {
            if (!aliasInGroups.has(memberName)) aliasInGroups.set(memberName, []);
            aliasInGroups.get(memberName)?.push(g.uuid);
          });
        });

        const groupTypeById = new Map<string, 'SingleSelect' | 'MultiSelect'>();
        allGroups.forEach((g: NetworkGroup) => {
          if (g?.uuid) {
            const val = (g.groupType === 'MultiSelect') ? 'MultiSelect' : (g.groupType === 'SingleSelect' ? 'SingleSelect' : undefined);
            if (val) groupTypeById.set(String(g.uuid).toLowerCase(), val);
          }
        });
        opnsenseGroupDisplays.forEach((d: OpnsenseGroupDisplay) => {
          if (d?.opnsenseUuid) {
            const val = (d.groupType === 'MultiSelect') ? 'MultiSelect' : (d.groupType === 'SingleSelect' ? 'SingleSelect' : undefined);
            if (val) groupTypeById.set(String(d.opnsenseUuid).toLowerCase(), val);
          }
        });

        if (currentAllowNetAliasMigration) {
          trulyAvailable = potentialAvailable;
        } else {
          trulyAvailable = potentialAvailable.filter(a => {
            const groups = aliasInGroups.get(a.name) || [];
            const inAnySingleSelect = groups.some(uuid => {
              const t = groupTypeById.get(String(uuid || '').toLowerCase());
              return t === 'SingleSelect';
            });
            return !inAnySingleSelect;
          });
        }
      }

      setAssociatedNetworkAliases(currentAssociated);
      setAvailableNetworkAliases(trulyAvailable);
      setOriginalAssociatedNetworkAliasUuids(currentAssociated.map(a => a.uuid));
    } catch (err) {
      logger.error('Error fetching network aliases for dialog:', err);
    } finally {
      setIsLoadingNetworkAliases(false);
      setSelectedAvailableNetAliases([]);
      setSelectedAssociatedNetAliases([]);
      setAvailableNetAliasSearchTerm("");
      setAssociatedNetAliasSearchTerm("");
      setLastSelectedAvailableNetAliasAnchor(null);
      setLastSelectedAssociatedNetAliasAnchor(null);
    }
  }, [manageNetworkAliasesEnabled, enableGroupTypes, isMultiSelectGroup, opnsenseGroupDisplays]);

  useEffect(() => {
    if (isOpen && editingAlias) {
      const shouldEnableMigration = isMultiSelectGroup;
      setAllowHostMigration(shouldEnableMigration);
      setActiveDialogTab('host-aliases');
      fetchHostAliasesForDialog(editingAlias, shouldEnableMigration);

      const shouldEnableNetAliasMigration = isMultiSelectGroup;
      setAllowNetAliasMigration(shouldEnableNetAliasMigration);
      fetchNetworkAliasesForDialog(editingAlias, shouldEnableNetAliasMigration);
    }
  }, [isOpen, editingAlias, fetchHostAliasesForDialog, fetchNetworkAliasesForDialog, isMultiSelectGroup]);

  // Helper function for standard batch operations (move-only behavior)
  const handleStandardBatchOperations = async (
    hostsToAdd: EnrichedOpnsenseAliasDetailFromExport[],
    hostsToRemove: string[],
    failedOperations: string[],
    forceMoveFromExisting: boolean = false,
    allHostAliases: EnrichedOpnsenseAliasDetailFromExport[] = []
  ) => {
    const batchOperations: Array<{ type: 'assign' | 'unassign'; hostAliases: EnrichedOpnsenseAliasDetailFromExport[] }> = [];

    // Group operations by type
    if (hostsToRemove.length > 0) {
      // Look up full host alias objects for hosts being removed
      const hostsToRemoveObjects = hostsToRemove
        .map(name => allHostAliases.find(h => h.name === name))
        .filter((h): h is EnrichedOpnsenseAliasDetailFromExport => h !== undefined);

      batchOperations.push({
        type: 'unassign',
        hostAliases: hostsToRemoveObjects
      });
    }

    if (hostsToAdd.length > 0) {
      batchOperations.push({
        type: 'assign',
        hostAliases: hostsToAdd
      });
    }

    // Initialize progress tracking
    let progress = createInitialBulkProgress({
      operationType: hostsToRemove.length > 0 && hostsToAdd.length > 0 ? 'move' : (hostsToAdd.length > 0 ? 'assign' : 'unassign'),
      hostNames: [...hostsToAdd.map(h => h.name), ...hostsToRemove],
      groupName: editingAlias?.name || 'Unknown',
      groupFriendlyName: editingAlias?.friendlyName,
    });

    progressModal.openModal();
    progressModal.updateProgress(progress);
    setBulkProgress(progress);

    // Update to validating state
    progress = updateBulkProgress(progress, 'validating', 'Validating hosts...');
    progressModal.updateProgress(progress);
    setBulkProgress(progress);

    // Execute batch operations
    for (const batchOp of batchOperations) {
      try {
        const moveFromExistingValue = batchOp.type === 'assign' ? (forceMoveFromExisting || (enableGroupTypes ? false : allowHostMigration)) : undefined;

        // Update to processing state with operation type
        const operationLabel = batchOp.type === 'assign' ? 'Assigning' : 'Removing';
        const progressMessage = `${operationLabel} ${batchOp.hostAliases.length} host${batchOp.hostAliases.length !== 1 ? 's' : ''}...`;

        progress = updateBulkProgress(progress, 'processing', progressMessage);
        progressModal.updateProgress(progress);
        setBulkProgress(progress);

        const hostAliasesPayload = batchOp.hostAliases.map(host => ({
          hostAliasName: host.name,
          ipAddress: host.content // Include IP address for proper audit log querying
        }));

        const requestBody = {
          operation: 'batch',
          operationType: batchOp.type,
          hostAliases: hostAliasesPayload,
          groups: [
            editingAlias?.friendlyName
              ? { groupFriendlyName: editingAlias!.friendlyName! }
              : { groupName: editingAlias!.name }
          ],
          description: batchOp.type === 'assign' ? 'Added via Network Group Members Manager' : 'Removed via Network Group Members Manager',
          moveFromExisting: moveFromExistingValue
        };

        const response = await fetch('/api/opnsense/host-group-management', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          // Add individual operation failures to the failed operations list
          if (result.operationResults) {
            result.operationResults.forEach((opResult: { success: boolean; hostAlias?: { hostAliasName: string }; error?: string }) => {
              if (!opResult.success) {
                const hostName = opResult.hostAlias?.hostAliasName || 'Unknown';
                logger.error(`❌ Failed to ${batchOp.type} ${hostName}:`, opResult.error);
                failedOperations.push(`${batchOp.type === 'assign' ? 'Add' : 'Remove'} ${hostName}: ${opResult.error || 'Unknown error'}`);
              }
            });
          } else {
            failedOperations.push(`${batchOp.type === 'assign' ? 'Add' : 'Remove'} batch: ${result.message || 'Unknown error'}`);
          }
        } else {
          logger.debug(`✅ Successfully ${batchOp.type}ed ${batchOp.hostAliases.length} hosts in batch for group "${editingAlias!.name}"`);
        }
      } catch (error) {
        logger.error(`Error in batch ${batchOp.type} operation:`, error);
        batchOp.hostAliases.forEach((hostAlias) => {
          failedOperations.push(`${batchOp.type === 'assign' ? 'Add' : 'Remove'} ${hostAlias.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        });
      }
    }

    // Update to reconfiguring state
    progress = updateBulkProgress(progress, 'reconfiguring', 'Reconfiguring network...');
    progressModal.updateProgress(progress);
    setBulkProgress(progress);

    // Update to refreshing state
    progress = updateBulkProgress(progress, 'refreshing', 'Refreshing data...');
    progressModal.updateProgress(progress);
    setBulkProgress(progress);

    // Update to success state
    progress = updateBulkProgress(progress, 'success', 'Operation completed successfully');
    progressModal.updateProgress(progress);
    setBulkProgress(progress);
  };
  // Backend-driven moveFromExisting restricted to SingleSelect removal
  const handleStandardBatchOperationsWithRestrictSingleSelect = async (
    hostsToAdd: EnrichedOpnsenseAliasDetailFromExport[],
    failedOperations: string[]
  ): Promise<{ removedFromGroupIds: string[]; movedHostAliasNames: string[] } | null> => {
    try {
      // Initialize progress tracking
      let progress = createInitialBulkProgress({
        operationType: 'move',
        hostNames: hostsToAdd.map(h => h.name),
        groupName: editingAlias?.name || 'Unknown',
        groupFriendlyName: editingAlias?.friendlyName,
      });

      progressModal.openModal();
      progressModal.updateProgress(progress);
      setBulkProgress(progress);

      // Update to validating state
      progress = updateBulkProgress(progress, 'validating', 'Validating hosts...');
      progressModal.updateProgress(progress);
      setBulkProgress(progress);

      // Pre-compute which SingleSelect groups each host currently belongs to (excluding target)
      const removedGroupIdSet = new Set<string>();
      try {
        const allGroupsResp = await fetch('/api/opnsense/network-groups', { cache: 'no-store' });
        if (allGroupsResp.ok) {
          const allGroupsJson = await allGroupsResp.json();
          const allGroups: NetworkGroup[] = Array.isArray(allGroupsJson.networkGroups) ? allGroupsJson.networkGroups : [];
          // Build groupType map from groups and displays
          const groupTypeById = new Map<string, 'SingleSelect' | 'MultiSelect'>();
          allGroups.forEach((g: NetworkGroup) => {
            if (g?.uuid) {
              const val = (g.groupType === 'MultiSelect') ? 'MultiSelect' : (g.groupType === 'SingleSelect' ? 'SingleSelect' : undefined);
              if (val) groupTypeById.set(String(g.uuid).toLowerCase(), val);
            }
          });
          opnsenseGroupDisplays.forEach(d => {
            if (d?.opnsenseUuid) {
              const val = (d.groupType === 'MultiSelect') ? 'MultiSelect' : (d.groupType === 'SingleSelect' ? 'SingleSelect' : undefined);
              if (val) groupTypeById.set(String(d.opnsenseUuid).toLowerCase(), val);
            }
          });
          const targetIdLc = String(editingAlias!.uuid).toLowerCase();
          hostsToAdd.forEach(h => {
            const name = h.name;
            allGroups.forEach(g => {
              const content = (g.rawContent || '').split('\n').map((s: string) => s.trim()).filter(Boolean);
              if (content.includes(name)) {
                const type = groupTypeById.get(String(g.uuid).toLowerCase());
                if (type === 'SingleSelect' && String(g.uuid).toLowerCase() !== targetIdLc) {
                  removedGroupIdSet.add(g.uuid);
                }
              }
            });
          });
        }
      } catch {
        // Failed to pre-compute removedFromGroupIds; proceeding without it
      }

      // Update to processing state
      progress = updateBulkProgress(
        progress,
        'processing',
        `Moving ${hostsToAdd.length} host${hostsToAdd.length !== 1 ? 's' : ''}...`
      );
      progressModal.updateProgress(progress);
      setBulkProgress(progress);

      const requestBody: {
        operation: 'batch';
        operationType: 'assign';
        hostAliases: { hostAliasName: string; ipAddress: string }[];
        groups: ({ groupId: string } | { groupName: string } | { groupFriendlyName: string })[];
        description: string;
        moveFromExisting: boolean;
        restrictRemovalToSingleSelect: boolean;
      } = {
        operation: 'batch',
        operationType: 'assign',
        hostAliases: hostsToAdd.map(h => ({
          hostAliasName: h.name,
          ipAddress: h.content // Include IP address for proper audit log querying
        })),
        groups: [
          editingAlias?.friendlyName
            ? { groupFriendlyName: editingAlias!.friendlyName! }
            : { groupName: editingAlias!.name }
        ],
        description: 'Assign with backend SingleSelect-restricted move',
        moveFromExisting: true,
        restrictRemovalToSingleSelect: true,
      };

      const response = await fetch('/api/opnsense/host-group-management', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody)
      });
      const result = await response.json();

      // Update to reconfiguring state
      progress = updateBulkProgress(progress, 'reconfiguring', 'Reconfiguring network...');
      progressModal.updateProgress(progress);
      setBulkProgress(progress);

      if (!response.ok || !result.success) {
        failedOperations.push(`Backend moveFromExisting failed: ${result.message || result.error || 'Unknown error'}`);
        return null;
      }

      // Update to refreshing state
      progress = updateBulkProgress(progress, 'refreshing', 'Refreshing data...');
      progressModal.updateProgress(progress);
      setBulkProgress(progress);

      // Update to success state
      progress = updateBulkProgress(progress, 'success', 'Operation completed successfully');
      progressModal.updateProgress(progress);
      setBulkProgress(progress);

      return { removedFromGroupIds: Array.from(removedGroupIdSet), movedHostAliasNames: hostsToAdd.map(h => h.name) };
    } catch (e) {
      failedOperations.push(`Backend moveFromExisting exception: ${e instanceof Error ? e.message : 'Unknown error'}`);
      return null;
    }
  };

  const handleNetworkAliasBatchOperations = async (
    aliasesToAdd: NetworkAlias[],
    aliasesToRemove: NetworkAlias[],
    failedOperations: string[],
    forceMoveFromExisting: boolean = false,
  ) => {
    const hasAdds = aliasesToAdd.length > 0;
    const hasRemoves = aliasesToRemove.length > 0;

    let progress = createInitialBulkProgress({
      operationType: hasAdds && hasRemoves ? 'move' : (hasAdds ? 'assign' : 'unassign'),
      hostNames: [...aliasesToAdd.map(a => a.name), ...aliasesToRemove.map(a => a.name)],
      groupName: editingAlias?.name || 'Unknown',
      groupFriendlyName: editingAlias?.friendlyName,
      itemLabel: 'network alias',
    });

    progressModal.openModal();
    progressModal.updateProgress(progress);
    setBulkProgress(progress);

    progress = updateBulkProgress(progress, 'validating', 'Validating network aliases...');
    progressModal.updateProgress(progress);
    setBulkProgress(progress);

    if (forceMoveFromExisting && hasAdds && !isMultiSelectGroup) {
      for (const alias of aliasesToAdd) {
        try {
          progress = updateBulkProgress(progress, 'processing', `Migrating ${alias.name}...`);
          progressModal.updateProgress(progress);
          setBulkProgress(progress);

          const resp = await fetch('/api/opnsense/network-alias-group-management', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operation: 'assign', aliasUuid: alias.uuid, groupId: editingAlias!.uuid }),
          });
          const result = await resp.json();
          if (!resp.ok || !result.success) {
            failedOperations.push(`Assign ${alias.name}: ${result.error || 'Unknown error'}`);
          }
        } catch (err) {
          failedOperations.push(`Assign ${alias.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    } else {
      if (hasAdds || hasRemoves) {
        progress = updateBulkProgress(progress, 'processing', `Processing ${aliasesToAdd.length + aliasesToRemove.length} network alias${(aliasesToAdd.length + aliasesToRemove.length) !== 1 ? 'es' : ''}...`);
        progressModal.updateProgress(progress);
        setBulkProgress(progress);

        try {
          const resp = await fetch(`/api/opnsense/network-groups/${editingAlias!.uuid}/network-alias-members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              add: aliasesToAdd.map(a => a.uuid),
              remove: aliasesToRemove.map(a => a.uuid),
            }),
          });
          const result = await resp.json();
          if (!resp.ok) {
            failedOperations.push(`Network aliases batch: ${result.error || 'Failed to update'}`);
          }
          if (result.skipped?.length > 0) {
            for (const s of result.skipped) {
              failedOperations.push(`Skipped ${s.uuid}: ${s.reason}`);
            }
          }
        } catch (err) {
          failedOperations.push(`Network aliases batch: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    }

    if (hasRemoves && forceMoveFromExisting && !isMultiSelectGroup) {
      progress = updateBulkProgress(progress, 'processing', `Removing ${aliasesToRemove.length} network alias${aliasesToRemove.length !== 1 ? 'es' : ''}...`);
      progressModal.updateProgress(progress);
      setBulkProgress(progress);
      try {
        const resp = await fetch(`/api/opnsense/network-groups/${editingAlias!.uuid}/network-alias-members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ remove: aliasesToRemove.map(a => a.uuid) }),
        });
        const result = await resp.json();
        if (!resp.ok) {
          failedOperations.push(`Network alias removal: ${result.error || 'Failed to update'}`);
        }
      } catch (err) {
        failedOperations.push(`Network alias removal: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    progress = updateBulkProgress(progress, 'reconfiguring', 'Reconfiguring network...');
    progressModal.updateProgress(progress);
    setBulkProgress(progress);

    progress = updateBulkProgress(progress, 'refreshing', 'Refreshing data...');
    progressModal.updateProgress(progress);
    setBulkProgress(progress);

    progress = updateBulkProgress(progress, 'success', 'Operation completed successfully');
    progressModal.updateProgress(progress);
    setBulkProgress(progress);
  };

  const handleNetworkAliasBatchOperationsWithRestrictSingleSelect = async (
    aliasesToAdd: NetworkAlias[],
    failedOperations: string[],
  ): Promise<{ removedFromGroupIds: string[] }> => {
    const removedGroupIdSet = new Set<string>();

    let progress = createInitialBulkProgress({
      operationType: 'move',
      hostNames: aliasesToAdd.map(a => a.name),
      groupName: editingAlias?.name || 'Unknown',
      groupFriendlyName: editingAlias?.friendlyName,
      itemLabel: 'network alias',
    });

    progressModal.openModal();
    progressModal.updateProgress(progress);
    setBulkProgress(progress);

    progress = updateBulkProgress(progress, 'validating', 'Validating network aliases...');
    progressModal.updateProgress(progress);
    setBulkProgress(progress);

    try {
      const allGroupsResp = await fetch('/api/opnsense/network-groups', { cache: 'no-store' });
      if (allGroupsResp.ok) {
        const allGroupsJson = await allGroupsResp.json();
        const allGroups: NetworkGroup[] = Array.isArray(allGroupsJson.networkGroups) ? allGroupsJson.networkGroups : [];
        const groupTypeById = new Map<string, 'SingleSelect' | 'MultiSelect'>();
        allGroups.forEach((g: NetworkGroup) => {
          if (g?.uuid) {
            const val = (g.groupType === 'MultiSelect') ? 'MultiSelect' : (g.groupType === 'SingleSelect' ? 'SingleSelect' : undefined);
            if (val) groupTypeById.set(String(g.uuid).toLowerCase(), val);
          }
        });
        opnsenseGroupDisplays.forEach(d => {
          if (d?.opnsenseUuid) {
            const val = (d.groupType === 'MultiSelect') ? 'MultiSelect' : (d.groupType === 'SingleSelect' ? 'SingleSelect' : undefined);
            if (val) groupTypeById.set(String(d.opnsenseUuid).toLowerCase(), val);
          }
        });
        const targetIdLc = String(editingAlias!.uuid).toLowerCase();
        for (const alias of aliasesToAdd) {
          for (const g of allGroups) {
            const content = (g.rawContent || '').split('\n').map((s: string) => s.trim()).filter(Boolean);
            if (content.includes(alias.name)) {
              const type = groupTypeById.get(String(g.uuid).toLowerCase());
              if (type === 'SingleSelect' && String(g.uuid).toLowerCase() !== targetIdLc) {
                removedGroupIdSet.add(g.uuid);
              }
            }
          }
        }
      }
    } catch {
      // proceed without pre-computed removedFromGroupIds
    }

    progress = updateBulkProgress(progress, 'processing', `Migrating ${aliasesToAdd.length} network alias${aliasesToAdd.length !== 1 ? 'es' : ''}...`);
    progressModal.updateProgress(progress);
    setBulkProgress(progress);

    for (const alias of aliasesToAdd) {
      try {
        const resp = await fetch('/api/opnsense/network-alias-group-management', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation: 'assign', aliasUuid: alias.uuid, groupId: editingAlias!.uuid }),
        });
        const result = await resp.json();
        if (!resp.ok || !result.success) {
          failedOperations.push(`Assign ${alias.name}: ${result.error || 'Unknown error'}`);
        }
      } catch (err) {
        failedOperations.push(`Assign ${alias.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    progress = updateBulkProgress(progress, 'reconfiguring', 'Reconfiguring network...');
    progressModal.updateProgress(progress);
    setBulkProgress(progress);

    if (failedOperations.length > 0) {
      return { removedFromGroupIds: Array.from(removedGroupIdSet) };
    }

    progress = updateBulkProgress(progress, 'refreshing', 'Refreshing data...');
    progressModal.updateProgress(progress);
    setBulkProgress(progress);

    progress = updateBulkProgress(progress, 'success', 'Operation completed successfully');
    progressModal.updateProgress(progress);
    setBulkProgress(progress);

    return { removedFromGroupIds: Array.from(removedGroupIdSet) };
  };




  const handleProgressModalCancel = () => {
    progressModal.closeModal();
    setBulkProgress(null);
  };

  const handleProgressModalRetry = () => {
    // Reset and retry the save operation
    progressModal.closeModal();
    setBulkProgress(null);
    handleSaveAliasChanges();
  };

  // Function to check if there are any changes
  const hasChanges = () => {
    // Check if Allow Host Migration toggle has changed
    if (allowHostMigration !== originalAllowHostMigration) {
      return true;
    }

    // Check if associated hosts have changed
    const currentAssociatedNames = new Set(associatedHostAliases.map(alias => alias.name));

    // Check if the sets are different sizes
    if (currentAssociatedNames.size !== originalAssociatedHostNames.size) {
      return true;
    }

    // Check if any names are different
    for (const name of currentAssociatedNames) {
      if (!originalAssociatedHostNames.has(name)) {
        return true;
      }
    }

    // Check if network alias associated set has changed
    const currentNetUuids = new Set(associatedNetworkAliases.map(a => a.uuid));
    const originalNetUuids = new Set(originalAssociatedNetworkAliasUuids);
    if (currentNetUuids.size !== originalNetUuids.size) return true;
    for (const uuid of currentNetUuids) {
      if (!originalNetUuids.has(uuid)) return true;
    }

    return false;
  };

  const handleSaveAliasChanges = async () => {
    if (!editingAlias) return;

    logger.debug('=== STARTING SAVE OPERATION ===', {
      editingAlias: editingAlias.name,
      groupType: editingAlias.groupType,
      allowHostMigration,
      allowNetAliasMigration,
      enableGroupTypes,
      isMultiSelectGroup
    });

    setIsProcessing(true);
    try {
      const originalMemberNames = new Set((editingAlias.rawContent || '').split('\n').filter(name => name.trim() !== ''));
      const currentMemberNames = new Set(associatedHostAliases.map(alias => alias.name));

      const hostsToAdd = associatedHostAliases.filter(alias => !originalMemberNames.has(alias.name));
      const hostsToRemove = Array.from(originalMemberNames).filter(name => !currentMemberNames.has(name));

      const originalNetSet = new Set(originalAssociatedNetworkAliasUuids);
      const currentNetUuids = associatedNetworkAliases.map(a => a.uuid);
      const currentNetSet = new Set(currentNetUuids);
      const netAliasesToAdd = associatedNetworkAliases.filter(a => !originalNetSet.has(a.uuid));
      const netAliasesToRemove = originalAssociatedNetworkAliasUuids
        .filter(u => !currentNetSet.has(u))
        .map(u => associatedNetworkAliases.find(a => a.uuid === u) || availableNetworkAliases.find(a => a.uuid === u))
        .filter((a): a is NetworkAlias => a !== undefined);

      const hasHostChanges = hostsToAdd.length > 0 || hostsToRemove.length > 0;
      const hasNetAliasChanges = netAliasesToAdd.length > 0 || netAliasesToRemove.length > 0;

      if (!hasHostChanges && !hasNetAliasChanges) {
        onSaveSuccess(editingAlias!, false, undefined);
        onClose();
        return;
      }

      logger.debug('Changes to apply:', {
        hostsToAdd: hostsToAdd.map(h => h.name),
        hostsToRemove,
        netAliasesToAdd: netAliasesToAdd.map(a => a.name),
        netAliasesToRemove: netAliasesToRemove.map(a => a.name),
      });

      const failedOperations: string[] = [];
      const allHostAliases = [...availableHostAliases, ...associatedHostAliases];

      // --- Route host changes ---
      if (hasHostChanges) {
        if (!enableGroupTypes && allowHostMigration && hostsToAdd.length > 0) {
          await handleStandardBatchOperations(hostsToAdd, hostsToRemove, failedOperations, true, allHostAliases);
        } else if (enableGroupTypes && allowHostMigration && !isMultiSelectGroup && hostsToAdd.length > 0) {
          const moveInfo = await handleStandardBatchOperationsWithRestrictSingleSelect(hostsToAdd, failedOperations);
          const affectedGroupIds = [editingAlias!.uuid, ...(moveInfo?.removedFromGroupIds || [])];

          // If no network alias changes, close and return now (progress modal is already shown)
          if (!hasNetAliasChanges) {
            setTimeout(() => { progressModal.closeModal(); setBulkProgress(null); }, 3000);
            setTimeout(() => {
              onSaveSuccess({
                ...editingAlias!,
                rawContent: associatedHostAliases.map(a => a.name).join('\n'),
                itemCount: associatedHostAliases.length,
                lastUpdated: new Date().toISOString(),
              }, true, affectedGroupIds);
              onClose();
            }, 3000);
            return;
          }
          // Host migration done, continue to network alias changes below
        } else {
          await handleStandardBatchOperations(hostsToAdd, hostsToRemove, failedOperations, false, allHostAliases);
        }
      }

      // --- Route network alias changes ---
      if (hasNetAliasChanges && manageNetworkAliasesEnabled) {
        const netMigrationActive = allowNetAliasMigration || (!enableGroupTypes && allowHostMigration);

        if (enableGroupTypes && netMigrationActive && !isMultiSelectGroup && netAliasesToAdd.length > 0) {
          const netMoveInfo = await handleNetworkAliasBatchOperationsWithRestrictSingleSelect(netAliasesToAdd, failedOperations);
          if (netAliasesToRemove.length > 0) {
            for (const alias of netAliasesToRemove) {
              try {
                const resp = await fetch('/api/opnsense/network-alias-group-management', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ operation: 'unassign', aliasUuid: alias.uuid, groupId: editingAlias!.uuid }),
                });
                const result = await resp.json();
                if (!resp.ok || !result.success) {
                  failedOperations.push(`Unassign ${alias.name}: ${result.error || 'Unknown error'}`);
                }
              } catch (err) {
                failedOperations.push(`Unassign ${alias.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
              }
            }
          }
          const affectedGroupIds = [editingAlias!.uuid, ...(netMoveInfo?.removedFromGroupIds || [])];

          if (!hasHostChanges) {
            setTimeout(() => { progressModal.closeModal(); setBulkProgress(null); }, 3000);
            setTimeout(() => {
              onSaveSuccess({
                ...editingAlias!,
                rawContent: associatedHostAliases.map(a => a.name).join('\n'),
                itemCount: associatedHostAliases.length,
                lastUpdated: new Date().toISOString(),
              }, true, affectedGroupIds);
              onClose();
            }, 3000);
            return;
          }
        } else {
          await handleNetworkAliasBatchOperations(netAliasesToAdd, netAliasesToRemove, failedOperations, netMigrationActive);
        }
      }

      const allOperationsSuccessful = failedOperations.length === 0;

      if (allOperationsSuccessful) {
        setTimeout(() => { progressModal.closeModal(); setBulkProgress(null); }, 3000);

        const updatedGroup: NetworkGroup = {
          ...editingAlias,
          rawContent: associatedHostAliases.map(alias => alias.name).join('\n'),
          itemCount: associatedHostAliases.length,
          lastUpdated: new Date().toISOString(),
        };

        const migrationAffectedOtherGroups = (allowHostMigration || allowNetAliasMigration) && (!enableGroupTypes || (enableGroupTypes && !isMultiSelectGroup));

        setTimeout(() => {
          onSaveSuccess(updatedGroup, migrationAffectedOtherGroups, undefined);
          onClose();
        }, 3000);
      } else {
        const totalOps = hostsToAdd.length + hostsToRemove.length + netAliasesToAdd.length + netAliasesToRemove.length;
        const successCount = totalOps - failedOperations.length;
        const errorProgress = updateBulkProgress(
          bulkProgress!,
          'error',
          `Partial success: ${successCount} succeeded, ${failedOperations.length} failed. Check console for details.`
        );
        errorProgress.error = {
          type: 'unknown',
          message: `${successCount} operations succeeded, ${failedOperations.length} failed`,
          details: failedOperations.join('; ')
        };
        progressModal.updateProgress(errorProgress);
        setBulkProgress(errorProgress);

        setTimeout(() => { progressModal.closeModal(); setBulkProgress(null); }, 3000);
        setTimeout(() => {
          onSaveSuccess(editingAlias!, allowHostMigration || allowNetAliasMigration, undefined);
          onClose();
        }, 3000);
      }
    } catch (error) {
      logger.error('Error during save operation:', error);

      if (bulkProgress) {
        const errorProgress = updateBulkProgress(
          bulkProgress,
          'error',
          'An unexpected error occurred while updating group membership'
        );
        errorProgress.error = {
          type: 'unknown',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
          details: error instanceof Error ? error.stack : undefined
        };
        progressModal.updateProgress(errorProgress);
        setBulkProgress(errorProgress);

        setTimeout(() => { progressModal.closeModal(); setBulkProgress(null); }, 3000);
      } else {
        progressModal.closeModal();
        setBulkProgress(null);
      }
    } finally {
      setIsProcessing(false);
    }
  };




  const toggleSelection = (listType: 'available' | 'associated', hostUuid: string, event?: React.MouseEvent<HTMLLIElement>) => {
    const currentFullList = listType === 'available' ? availableHostAliases : associatedHostAliases;
    const currentSearchTerm = listType === 'available' ? availableSearchTerm : associatedSearchTerm;

    const displayedList = currentFullList.filter(host =>
      host.name.toLowerCase().includes(currentSearchTerm.toLowerCase()) ||
      (host.content && host.content.toLowerCase().includes(currentSearchTerm.toLowerCase()))
    );

    const setSelection = listType === 'available' ? setSelectedAvailable : setSelectedAssociated;

    const setAnchor = listType === 'available' ? setLastSelectedAvailableAnchor : setLastSelectedAssociatedAnchor;
    const currentAnchor = listType === 'available' ? lastSelectedAvailableAnchor : lastSelectedAssociatedAnchor;

    if (event?.shiftKey && currentAnchor) {
      const anchorIndex = displayedList.findIndex(item => item.uuid === currentAnchor);
      const currentIndex = displayedList.findIndex(item => item.uuid === hostUuid);

      if (anchorIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(anchorIndex, currentIndex);
        const end = Math.max(anchorIndex, currentIndex);
        const rangeToSelectUuids = displayedList.slice(start, end + 1).map(item => item.uuid!);

        if (event.ctrlKey) {
          setSelection(prev => Array.from(new Set([...prev, ...rangeToSelectUuids])));
        } else {
          setSelection(rangeToSelectUuids);
        }
      } else {
        setSelection([hostUuid]);
        setAnchor(hostUuid);
      }
    } else if (event?.ctrlKey) {
      setSelection(prev =>
        prev.includes(hostUuid) ? prev.filter(id => id !== hostUuid) : [...prev, hostUuid]
      );
      setAnchor(hostUuid);
    } else {
      setSelection([hostUuid]);
      setAnchor(hostUuid);
    }
  };

  const moveSelectedToAssociated = () => {
    const toMove = availableHostAliases.filter(host => selectedAvailable.includes(host.uuid!));
    setAssociatedHostAliases(prev => [...prev, ...toMove].sort((a, b) => a.name.localeCompare(b.name)));
    setAvailableHostAliases(prev => prev.filter(host => !selectedAvailable.includes(host.uuid!)));
    setSelectedAvailable([]);
  };

  const moveSelectedToAvailable = () => {
    const toMove = associatedHostAliases.filter(host => selectedAssociated.includes(host.uuid!));
    setAvailableHostAliases(prev => [...prev, ...toMove].sort((a, b) => a.name.localeCompare(b.name)));
    setAssociatedHostAliases(prev => prev.filter(host => !selectedAssociated.includes(host.uuid!)));
    setSelectedAssociated([]);
  };

  const filterNetworkAliases = (list: NetworkAlias[], term: string) =>
    list.filter(a =>
      a.name.toLowerCase().includes(term.toLowerCase()) ||
      a.content.toLowerCase().includes(term.toLowerCase()) ||
      (a.description && a.description.toLowerCase().includes(term.toLowerCase()))
    );

  const filteredAvailableNetAliases = useMemo(() =>
    filterNetworkAliases(availableNetworkAliases, availableNetAliasSearchTerm),
    [availableNetworkAliases, availableNetAliasSearchTerm]
  );

  const filteredAssociatedNetAliases = useMemo(() =>
    filterNetworkAliases(associatedNetworkAliases, associatedNetAliasSearchTerm),
    [associatedNetworkAliases, associatedNetAliasSearchTerm]
  );

  const toggleNetworkAliasSelection = (listType: 'available' | 'associated', uuid: string, event?: React.MouseEvent<HTMLLIElement>) => {
    const currentFullList = listType === 'available' ? availableNetworkAliases : associatedNetworkAliases;
    const currentSearchTerm = listType === 'available' ? availableNetAliasSearchTerm : associatedNetAliasSearchTerm;

    const displayedList = currentFullList.filter(a =>
      a.name.toLowerCase().includes(currentSearchTerm.toLowerCase()) ||
      a.content.toLowerCase().includes(currentSearchTerm.toLowerCase()) ||
      (a.description && a.description.toLowerCase().includes(currentSearchTerm.toLowerCase()))
    );

    const setSelection = listType === 'available' ? setSelectedAvailableNetAliases : setSelectedAssociatedNetAliases;
    const setAnchor = listType === 'available' ? setLastSelectedAvailableNetAliasAnchor : setLastSelectedAssociatedNetAliasAnchor;
    const currentAnchor = listType === 'available' ? lastSelectedAvailableNetAliasAnchor : lastSelectedAssociatedNetAliasAnchor;

    if (event?.shiftKey && currentAnchor) {
      const anchorIndex = displayedList.findIndex(item => item.uuid === currentAnchor);
      const currentIndex = displayedList.findIndex(item => item.uuid === uuid);
      if (anchorIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(anchorIndex, currentIndex);
        const end = Math.max(anchorIndex, currentIndex);
        const rangeUuids = displayedList.slice(start, end + 1).map(item => item.uuid);
        if (event.ctrlKey) {
          setSelection(prev => Array.from(new Set([...prev, ...rangeUuids])));
        } else {
          setSelection(rangeUuids);
        }
      } else {
        setSelection([uuid]);
        setAnchor(uuid);
      }
    } else if (event?.ctrlKey) {
      setSelection(prev =>
        prev.includes(uuid) ? prev.filter(id => id !== uuid) : [...prev, uuid]
      );
      setAnchor(uuid);
    } else {
      setSelection([uuid]);
      setAnchor(uuid);
    }
  };

  const moveSelectedNetAliasToAssociated = () => {
    const toMove = availableNetworkAliases.filter(a => selectedAvailableNetAliases.includes(a.uuid));
    setAssociatedNetworkAliases(prev => [...prev, ...toMove].sort((a, b) => a.name.localeCompare(b.name)));
    setAvailableNetworkAliases(prev => prev.filter(a => !selectedAvailableNetAliases.includes(a.uuid)));
    setSelectedAvailableNetAliases([]);
  };

  const moveSelectedNetAliasToAvailable = () => {
    const toMove = associatedNetworkAliases.filter(a => selectedAssociatedNetAliases.includes(a.uuid));
    setAvailableNetworkAliases(prev => [...prev, ...toMove].sort((a, b) => a.name.localeCompare(b.name)));
    setAssociatedNetworkAliases(prev => prev.filter(a => !selectedAssociatedNetAliases.includes(a.uuid)));
    setSelectedAssociatedNetAliases([]);
  };


  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-6xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              Edit Network Group Members: {(() => {
                const friendlyName = opnsenseGroupDisplays.find((m: OpnsenseGroupDisplay) => m.opnsenseUuid === editingAlias?.uuid)?.friendlyName;
                return friendlyName ? `${friendlyName} (${editingAlias?.name})` : editingAlias?.name;
              })()}
              <StatusDotLegend className="ml-auto" />
            </DialogTitle>
            <DialogDescription>
              Add or remove host and/or network aliases association to this network group.
              {enableGroupTypes && (
                <>
                  <br />
                  <span className="text-sm text-blue-600 font-medium">
                    {isMultiSelectGroup
                      ? `${groupTypeName}: Aliases can be in multiple groups simultaneously (additive assignment).`
                      : `${groupTypeName}: Aliases can only be in one SingleSelect group at a time.`
                    }
                  </span>
                </>
              )}
              <br />
              <span className="text-xs text-muted-foreground">
                Click to select, Ctrl+Click to toggle selection, Shift+Click to select a range.
              </span>
            </DialogDescription>
          </DialogHeader>
          <Tabs value={activeDialogTab} onValueChange={setActiveDialogTab} className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="host-aliases">Host Aliases (Devices)</TabsTrigger>
              {manageNetworkAliasesEnabled && (
                <TabsTrigger value="network-aliases">
                  <Waypoints className="h-3.5 w-3.5 mr-1.5" />
                  Network Aliases
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="host-aliases">
          <div className="flex items-center space-x-2 mb-4">
            <Switch
              id="allow-host-migration"
              checked={allowHostMigration}
              disabled={migrationDisabled}
              onCheckedChange={(checked) => {
                if (checked) {
                  // For MultiSelect groups, no confirmation needed since it's always additive
                  if (isMultiSelectGroup) {
                    setAllowHostMigration(true);
                    fetchHostAliasesForDialog(editingAlias!, true);
                  } else {
                    setShowMigrationConfirmDialog(true);
                  }
                } else {
                  setAllowHostMigration(false);
                  fetchHostAliasesForDialog(editingAlias!, false);
                }
              }}
            />
            <Label htmlFor="allow-host-migration" className={migrationDisabled ? 'text-muted-foreground' : ''}>
              {isMultiSelectGroup ? 'Additive Assignment' : 'Allow Host Migration'}
            </Label>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {migrationDisabled ? (
                    <>
                      <p>Migration is disabled for {groupTypeName} groups.</p>
                      <p>{groupTypeName} groups allow devices to be in multiple groups simultaneously.</p>
                    </>
                  ) : (
                    <>
                      <p>When enabled, host aliases moved to this group will be automatically removed from any other groups they are currently members of.</p>
                      {enableGroupTypes && !isMultiSelectGroup && (
                        <p className="mt-1 text-xs">For {groupTypeName} groups, this uses smart 2-step assignment to preserve MultiSelect memberships.</p>
                      )}
                    </>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {isLoadingHostAliases ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto" />
              <p className="mt-2 text-muted-foreground">Loading aliases...</p>
            </div>
          ) : (
            <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-3'} gap-2 py-4`}>
              {/* Available Hosts List */}
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-semibold mb-2">Available Hosts</h3>
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
                  <Button variant="outline" size="sm" onClick={() => setSelectedAvailable(availableHostAliases.filter(host => host.name.toLowerCase().includes(availableSearchTerm.toLowerCase())).map(alias => alias.uuid!))} disabled={availableHostAliases.filter(host => host.name.toLowerCase().includes(availableSearchTerm.toLowerCase())).length === 0}>Select All</Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedAvailable([])} disabled={selectedAvailable.length === 0}>Deselect All</Button>
                </div>
                <ScrollArea className={`border rounded-md p-2 ${isMobile ? 'h-[200px]' : 'h-[300px]'}`}>
                  <TooltipProvider delayDuration={300}>
                    <ul>
                      {availableHostAliases
                        .filter(host =>
                          host.name.toLowerCase().includes(availableSearchTerm.toLowerCase()) ||
                          (host.content && host.content.toLowerCase().includes(availableSearchTerm.toLowerCase()))
                        )
                        .map(host => (
                          <li
                            key={host.uuid}
                            className={`py-1 px-2 text-sm cursor-pointer rounded-sm ${selectedAvailable.includes(host.uuid!) ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                            onClick={(e) => toggleSelection('available', host.uuid!, e)}
                          >
                            <div className="flex items-center gap-2">
                              <StatusDotWithDetailedTooltip host={host} />
                              <span className="flex-1">
                                <div>{host.name}</div>
                                {host.description && <div className="text-xs opacity-75 mt-1 break-words">{host.description}</div>}
                              </span>
                            </div>
                          </li>
                        ))}
                      {availableHostAliases.filter(host =>
                        host.name.toLowerCase().includes(availableSearchTerm.toLowerCase()) ||
                        (host.content && host.content.toLowerCase().includes(availableSearchTerm.toLowerCase()))
                      ).length === 0 && availableSearchTerm && (
                          <p className="text-xs text-muted-foreground text-center py-2">No matches found.</p>
                        )}
                      {availableHostAliases.filter(host =>
                        host.name.toLowerCase().includes(availableSearchTerm.toLowerCase()) ||
                        (host.content && host.content.toLowerCase().includes(availableSearchTerm.toLowerCase()))
                      ).length === 0 && !availableSearchTerm && (
                          <p className="text-xs text-muted-foreground text-center py-2">None available.</p>
                        )}
                    </ul>
                  </TooltipProvider>
                </ScrollArea>
              </div>

              {/* Move Buttons */}
              <div className="flex md:flex-col justify-center items-center gap-2 px-1 md:py-4 py-2">
                <Button variant="outline" size="icon" onClick={moveSelectedToAssociated} disabled={selectedAvailable.length === 0} title="Add selected to group">
                  <ChevronRight className="h-4 w-4 hidden md:inline-block" />
                  <ChevronDown className="h-4 w-4 inline-block md:hidden" />
                </Button>
                <Button variant="outline" size="icon" onClick={moveSelectedToAvailable} disabled={selectedAssociated.length === 0} title="Remove selected from group">
                  <ChevronLeft className="h-4 w-4 hidden md:inline-block" />
                  <ChevronUp className="h-4 w-4 inline-block md:hidden" />
                </Button>
              </div>

              {/* Associated Hosts List */}
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-semibold mb-2">Associated Hosts</h3>
                <div className="flex items-center space-x-2 mb-2">
                  <Input
                    placeholder="Search associated..."
                    value={associatedSearchTerm}
                    onChange={(e) => setAssociatedSearchTerm(e.target.value)}
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
                        <DialogDescription>Selection and keyboard shortcuts for managing associated hosts.</DialogDescription>
                      </DialogHeader>
                      <div className="max-h-96 overflow-y-auto">
                        <p>Click to select, Ctrl+Click to toggle selection, Shift+Click to select a range.</p>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedAssociated(associatedHostAliases.filter(host =>
                    host.name.toLowerCase().includes(associatedSearchTerm.toLowerCase()) ||
                    (host.content && host.content.toLowerCase().includes(associatedSearchTerm.toLowerCase()))
                  ).map(alias => alias.uuid!))} disabled={associatedHostAliases.filter(host =>
                    host.name.toLowerCase().includes(associatedSearchTerm.toLowerCase()) ||
                    (host.content && host.content.toLowerCase().includes(associatedSearchTerm.toLowerCase()))
                  ).length === 0}>Select All</Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedAssociated([])} disabled={selectedAssociated.length === 0}>Deselect All</Button>
                </div>
                <ScrollArea className={`border rounded-md p-2 ${isMobile ? 'h-[200px]' : 'h-[300px]'}`}>
                  <ul>
                    {associatedHostAliases
                      .filter(host =>
                        host.name.toLowerCase().includes(associatedSearchTerm.toLowerCase()) ||
                        (host.content && host.content.toLowerCase().includes(associatedSearchTerm.toLowerCase()))
                      )
                      .map(host => (
                        <li
                          key={host.uuid}
                          className={`py-1 px-2 text-sm cursor-pointer rounded-sm ${selectedAssociated.includes(host.uuid!) ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                          onClick={(e) => toggleSelection('associated', host.uuid!, e)}
                        >
                          <div className="flex items-center gap-2">
                            <StatusDotWithDetailedTooltip host={host} />
                            <span className="flex-1">
                              <div>{host.name}</div>
                              {host.description && <div className="text-xs opacity-75 mt-1 break-words">{host.description}</div>}
                            </span>
                          </div>
                        </li>
                      ))}
                    {associatedHostAliases.filter(host =>
                      host.name.toLowerCase().includes(associatedSearchTerm.toLowerCase()) ||
                      (host.content && host.content.toLowerCase().includes(associatedSearchTerm.toLowerCase()))
                    ).length === 0 && associatedSearchTerm && (
                        <p className="text-xs text-muted-foreground text-center py-2">No matches found.</p>
                      )}
                    {associatedHostAliases.filter(host =>
                      host.name.toLowerCase().includes(associatedSearchTerm.toLowerCase()) ||
                      (host.content && host.content.toLowerCase().includes(associatedSearchTerm.toLowerCase()))
                    ).length === 0 && !associatedSearchTerm && (
                        <p className="text-xs text-muted-foreground text-center py-2">None associated.</p>
                      )}
                  </ul>
                </ScrollArea>
              </div>
            </div>
          )}
            </TabsContent>

            {manageNetworkAliasesEnabled && (
              <TabsContent value="network-aliases">
          <div className="flex items-center space-x-2 mb-4">
            <Switch
              id="allow-net-alias-migration"
              checked={allowNetAliasMigration}
              disabled={migrationDisabled}
              onCheckedChange={(checked) => {
                if (checked) {
                  if (isMultiSelectGroup) {
                    setAllowNetAliasMigration(true);
                    fetchNetworkAliasesForDialog(editingAlias!, true);
                  } else {
                    setShowNetAliasMigrationConfirmDialog(true);
                  }
                } else {
                  setAllowNetAliasMigration(false);
                  fetchNetworkAliasesForDialog(editingAlias!, false);
                }
              }}
            />
            <Label htmlFor="allow-net-alias-migration" className={migrationDisabled ? 'text-muted-foreground' : ''}>
              {isMultiSelectGroup ? 'Additive Assignment' : 'Allow Network Alias Migration'}
            </Label>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {migrationDisabled ? (
                    <>
                      <p>Migration is disabled for {groupTypeName} groups.</p>
                      <p>{groupTypeName} groups allow network aliases to be in multiple groups simultaneously.</p>
                    </>
                  ) : (
                    <>
                      <p>When enabled, network aliases moved to this group will be automatically removed from any other groups they are currently members of.</p>
                      {enableGroupTypes && !isMultiSelectGroup && (
                        <p className="mt-1 text-xs">For {groupTypeName} groups, this uses smart 2-step assignment to preserve MultiSelect memberships.</p>
                      )}
                    </>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {isLoadingNetworkAliases ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto" />
              <p className="mt-2 text-muted-foreground">Loading network aliases...</p>
            </div>
          ) : (
            <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-3'} gap-2 py-4`}>
              {/* Available Network Aliases List */}
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-semibold mb-2">Available Network Aliases</h3>
                <div className="flex items-center space-x-2 mb-2">
                  <Input
                    placeholder="Search available..."
                    value={availableNetAliasSearchTerm}
                    onChange={(e) => setAvailableNetAliasSearchTerm(e.target.value)}
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
                  <Button variant="outline" size="sm" onClick={() => setSelectedAvailableNetAliases(filteredAvailableNetAliases.map(a => a.uuid))} disabled={filteredAvailableNetAliases.length === 0}>Select All</Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedAvailableNetAliases([])} disabled={selectedAvailableNetAliases.length === 0}>Deselect All</Button>
                </div>
                <ScrollArea className={`border rounded-md p-2 ${isMobile ? 'h-[200px]' : 'h-[300px]'}`}>
                  <TooltipProvider delayDuration={300}>
                    <ul>
                      {filteredAvailableNetAliases.map(a => (
                        <li
                          key={a.uuid}
                          className={`py-1 px-2 text-sm cursor-pointer rounded-sm ${selectedAvailableNetAliases.includes(a.uuid) ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                          onClick={(e) => toggleNetworkAliasSelection('available', a.uuid, e)}
                        >
                          <div className="flex items-center gap-2">
                            <Waypoints className="h-3.5 w-3.5 shrink-0 opacity-60" />
                            <span className="flex-1">
                              <div>{a.name}</div>
                              <div className="text-xs opacity-75 mt-0.5 font-mono">{a.content}</div>
                              {a.description && <div className="text-xs opacity-75 mt-0.5 break-words">{a.description}</div>}
                            </span>
                          </div>
                        </li>
                      ))}
                      {filteredAvailableNetAliases.length === 0 && availableNetAliasSearchTerm && (
                        <p className="text-xs text-muted-foreground text-center py-2">No matches found.</p>
                      )}
                      {filteredAvailableNetAliases.length === 0 && !availableNetAliasSearchTerm && (
                        <p className="text-xs text-muted-foreground text-center py-2">None available.</p>
                      )}
                    </ul>
                  </TooltipProvider>
                </ScrollArea>
              </div>

              {/* Move Buttons */}
              <div className="flex md:flex-col justify-center items-center gap-2 px-1 md:py-4 py-2">
                <Button variant="outline" size="icon" onClick={moveSelectedNetAliasToAssociated} disabled={selectedAvailableNetAliases.length === 0} title="Add selected to group">
                  <ChevronRight className="h-4 w-4 hidden md:inline-block" />
                  <ChevronDown className="h-4 w-4 inline-block md:hidden" />
                </Button>
                <Button variant="outline" size="icon" onClick={moveSelectedNetAliasToAvailable} disabled={selectedAssociatedNetAliases.length === 0} title="Remove selected from group">
                  <ChevronLeft className="h-4 w-4 hidden md:inline-block" />
                  <ChevronUp className="h-4 w-4 inline-block md:hidden" />
                </Button>
              </div>

              {/* Associated Network Aliases List */}
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-semibold mb-2">Associated Network Aliases</h3>
                <div className="flex items-center space-x-2 mb-2">
                  <Input
                    placeholder="Search associated..."
                    value={associatedNetAliasSearchTerm}
                    onChange={(e) => setAssociatedNetAliasSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedAssociatedNetAliases(filteredAssociatedNetAliases.map(a => a.uuid))} disabled={filteredAssociatedNetAliases.length === 0}>Select All</Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedAssociatedNetAliases([])} disabled={selectedAssociatedNetAliases.length === 0}>Deselect All</Button>
                </div>
                <ScrollArea className={`border rounded-md p-2 ${isMobile ? 'h-[200px]' : 'h-[300px]'}`}>
                  <ul>
                    {filteredAssociatedNetAliases.map(a => (
                      <li
                        key={a.uuid}
                        className={`py-1 px-2 text-sm cursor-pointer rounded-sm ${selectedAssociatedNetAliases.includes(a.uuid) ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                        onClick={(e) => toggleNetworkAliasSelection('associated', a.uuid, e)}
                      >
                        <div className="flex items-center gap-2">
                          <Waypoints className="h-3.5 w-3.5 shrink-0 opacity-60" />
                          <span className="flex-1">
                            <div>{a.name}</div>
                            <div className="text-xs opacity-75 mt-0.5 font-mono">{a.content}</div>
                            {a.description && <div className="text-xs opacity-75 mt-0.5 break-words">{a.description}</div>}
                          </span>
                        </div>
                      </li>
                    ))}
                    {filteredAssociatedNetAliases.length === 0 && associatedNetAliasSearchTerm && (
                        <p className="text-xs text-muted-foreground text-center py-2">No matches found.</p>
                      )}
                    {filteredAssociatedNetAliases.length === 0 && !associatedNetAliasSearchTerm && (
                        <p className="text-xs text-muted-foreground text-center py-2">None associated.</p>
                      )}
                  </ul>
                </ScrollArea>
              </div>
            </div>
          )}
              </TabsContent>
            )}
          </Tabs>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            </DialogClose>
            <Button onClick={handleSaveAliasChanges} disabled={isProcessing || isLoadingHostAliases || !hasChanges()}>
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for Host Migration */}
      <AlertDialog open={showMigrationConfirmDialog} onOpenChange={setShowMigrationConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Host Migration</AlertDialogTitle>
            <AlertDialogDescription>
              Enabling &quot;Allow Host Migration&quot; will enable you to select any managed host aliases even if they are already members of another {groupTypeName} group. When you click save, all associated host aliases will be first removed from any {groupTypeName} network groups they are currently members of and then associated to this new group. This ensures an host alias belongs to only one {groupTypeName} group at a time and allows you to move all selected host aliases to a single {groupTypeName} group even if they are already members of another {groupTypeName} group.
              <br /><br />
              To confirm, please type &quot;CONFIRM&quot; in the box below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            type="text"
            placeholder="Type CONFIRM"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            className="mt-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setConfirmInput("");
              setAllowHostMigration(false);
              fetchHostAliasesForDialog(editingAlias!, false);
            }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setAllowHostMigration(true);
                setShowMigrationConfirmDialog(false);
                setConfirmInput("");
                fetchHostAliasesForDialog(editingAlias!, true);
              }}
              disabled={confirmInput !== "CONFIRM"}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation Dialog for Network Alias Migration */}
      <AlertDialog open={showNetAliasMigrationConfirmDialog} onOpenChange={setShowNetAliasMigrationConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Network Alias Migration</AlertDialogTitle>
            <AlertDialogDescription>
              Enabling &quot;Allow Network Alias Migration&quot; will enable you to select any network aliases even if they are already members of another {groupTypeName} group. When you click save, all associated network aliases will be first removed from any {groupTypeName} network groups they are currently members of and then associated to this new group. This ensures a network alias belongs to only one {groupTypeName} group at a time and allows you to move all selected network aliases to a single {groupTypeName} group even if they are already members of another {groupTypeName} group.
              <br /><br />
              To confirm, please type &quot;CONFIRM&quot; in the box below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            type="text"
            placeholder="Type CONFIRM"
            value={netAliasConfirmInput}
            onChange={(e) => setNetAliasConfirmInput(e.target.value)}
            className="mt-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setNetAliasConfirmInput("");
              setAllowNetAliasMigration(false);
              fetchNetworkAliasesForDialog(editingAlias!, false);
            }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setAllowNetAliasMigration(true);
                setShowNetAliasMigrationConfirmDialog(false);
                setNetAliasConfirmInput("");
                fetchNetworkAliasesForDialog(editingAlias!, true);
              }}
              disabled={netAliasConfirmInput !== "CONFIRM"}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Operation Progress Modal */}
      {bulkProgress && (
        <BulkOperationProgressModal
          isOpen={progressModal.isOpen}
          progress={bulkProgress}
          onCancel={handleProgressModalCancel}
          onRetry={handleProgressModalRetry}
          groupName={(() => {
            const friendlyName = opnsenseGroupDisplays.find((m: OpnsenseGroupDisplay) => m.opnsenseUuid === editingAlias?.uuid)?.friendlyName;
            return friendlyName ? `${friendlyName} (${editingAlias?.name})` : editingAlias?.name;
          })()}
        />
      )}
    </>
  );
}