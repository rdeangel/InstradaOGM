'use client'; // Required for using state and event handlers
/* eslint-disable security/detect-object-injection */
// This page uses bracket notation with typed keys from objects. All uses are safe.
import { AppFooter } from '@/components/layout/AppFooter'; // Import AppFooter

import React, { useState, useEffect, useCallback, useRef } from 'react'; // Added useRef
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { ClientOnly } from '@/components/util/ClientOnly';
import { LogOut, Globe, Info, Network, Sparkles, Database, ShieldCheck, Ban, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { GoDeviceDesktop } from 'react-icons/go';
import { Role, type NetworkGroup, type OpnsenseVpnEntry } from '@/types/opnsense';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ListFilter } from 'lucide-react';
import { logger } from '@/lib/logger';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocalStorage } from '@/hooks/use-local-storage';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { AppHeader } from '@/components/layout/AppHeader';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SelfServiceAccessTab } from '@/components/admin/SelfServiceAccessTab';

import { GlobalSettingsTab } from '@/components/admin/settings/GlobalSettingsTab';
import { NetworkDisplayFiltersTab } from '@/components/admin/settings/NetworkDisplayFiltersTab';
import { NetworkDisplayMappingsTab } from '@/components/admin/settings/NetworkDisplayMappingsTab';
import { CustomSymbolsTab } from '@/components/admin/settings/CustomSymbolsTab';
import { BackupRestoreTab } from '@/components/admin/settings/BackupRestoreTab';
import type { BackupVersion } from '@/components/admin/settings/BackupRestoreTab';
import { VpnMappingsTab } from '@/components/admin/settings/VpnMappingsTab'; // Import the new VPN Mappings Tab
import { SystemSummaryTab } from '@/components/admin/settings/SystemSummaryTab'; // Import the new System Summary Tab
import { UpdatesTab } from '@/components/admin/settings/UpdatesTab';



import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { GroupFilter, OpnsenseGroupDisplay, ValidLocalNetwork, CustomLucideIcon, CustomEmoji, CustomFlag } from '@/types/settings';
import { isOpnsenseVpnSession, isOpnsenseIpsecConnection } from '@/types/opnsense';

export default function SettingsPage() {
  const { data: session, status: authStatus } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const [activeTab, setActiveTab] = useLocalStorage<string>('settings-active-tab', 'global'); // State to track the active tab

  // Check for tab query parameter on mount
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && mounted) {
      setActiveTab(tabParam);
    }
  }, [searchParams, mounted, setActiveTab]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // State for mobile dropdown menu
  const [groupFilters, setGroupFilters] = useState<GroupFilter[]>([]);
  const [isLoadingFilters, setIsLoadingFilters] = useState(true);
  const [isSavingFilters, setIsSavingFilters] = useState(false);

  const [isRefreshingFilters, setIsRefreshingFilters] = useState(false);

  const [allNetworkGroups, setAllNetworkGroups] = useState<NetworkGroup[]>([]);
  const [isLoadingAllGroups, setIsLoadingAllGroups] = useState(true);
  const [errorLoadingAllGroups, setErrorLoadingAllGroups] = useState<string | null>(null);

  const [SsoGroupMappings, setSsoGroupMappings] = useState<OpnsenseGroupDisplay[]>([]);
  const [isLoadingMappings, setIsLoadingMappings] = useState(true);
  const [isSavingMappings, setIsSavingMappings] = useState(false);
  const [isRefreshingMappings, setIsRefreshingMappings] = useState(false); // New state for in-place refresh for mappings

  const [isSavingGlobalSettings, setIsSavingGlobalSettings] = useState(false);
  const [enableRegistration, setEnableRegistration] = useState<boolean>(false);
  const [removeSelfServicePage, setRemoveSelfServicePage] = useState<boolean>(false);
  const [enableRenamingSelfServicePage, setEnableRenamingSelfServicePage] = useState<boolean>(false);
  const [enableRenamingDeviceManagementPage, setEnableRenamingDeviceManagementPage] = useState<boolean>(false);
  // Group Type Settings
  const [enableGroupTypes, setEnableGroupTypes] = useState<boolean>(false);
  const [enableSelfServiceMultiSelect, setEnableSelfServiceMultiSelect] = useState<boolean>(true);
  const [singleSelectName, setSingleSelectName] = useState<string>('Single Select');
  const [multiSelectName, setMultiSelectName] = useState<string>('Multi Select');
  const [singleSelectIcon, setSingleSelectIcon] = useState<string>('Dot');
  const [multiSelectIcon, setMultiSelectIcon] = useState<string>('Dice4');
  // Advanced Analytics Settings
  const [enableAdvancedAnalytics, setEnableAdvancedAnalytics] = useState<boolean>(false);
  // Logs and Analytics Retention Settings
  const [logsAnalyticsRetentionDays, setLogsAnalyticsRetentionDays] = useState<number>(90);
  // MAC Tracking Settings
  const [enableMacTracking, setEnableMacTracking] = useState<boolean>(false);
  const [macTrackingInterval, setMacTrackingInterval] = useState<number>(5);
  const [macInactiveTimeout, setMacInactiveTimeout] = useState<number>(1440);
  const [macDataRetentionDays, setMacDataRetentionDays] = useState<number>(90);
  // Network Aliases Management
  const [manageNetworkAliasesEnabled, setManageNetworkAliasesEnabled] = useState<boolean>(false);
  // Application Subtitle Settings
  const [enableApplicationSubtitle, setEnableApplicationSubtitle] = useState<boolean>(false);
  const [subtitleText, setSubtitleText] = useState<string>('');
  const [enableLoginPageSubtitle, setEnableLoginPageSubtitle] = useState<boolean>(false);

  const [allowedNetworks, setallowedNetworks] = useState<ValidLocalNetwork[]>([]);
  const [newNetworkType, setNewNetworkType] = useState<'include' | 'exclude'>('include');
  const [newNetworkCidr, setNewNetworkCidr] = useState('');
  const [newNetworkStartIp, setNewNetworkStartIp] = useState('');
  const [newNetworkEndIp, setNewNetworkEndIp] = useState('');
  const [newNetworkDescription, setNewNetworkDescription] = useState('');

  const [customLucideIcons, setCustomLucideIcons] = useState<CustomLucideIcon[]>([]);
  const [customEmojis, setCustomEmojis] = useState<CustomEmoji[]>([]);
  const [customFlags, setCustomFlags] = useState<CustomFlag[]>([]);
  const [newCustomIconName, setNewCustomIconName] = useState('');
  const [newCustomIconIdentifier, setNewCustomIconIdentifier] = useState('');
  const [newCustomIconType, setNewCustomIconType] = useState<'lucide' | 'emoji' | 'flag'>('lucide');

  // Add sort state for all tabs
  const [allowedNetworksSort, setAllowedNetworksSort] = useState<{ sortBy: string; sortDirection: 'asc' | 'desc' }>({ sortBy: 'name', sortDirection: 'asc' });
  const [vpnMappingsSort, setVpnMappingsSort] = useState<{ sortBy: string; sortDirection: 'asc' | 'desc' }>({ sortBy: 'vpnDisplayName', sortDirection: 'asc' });
  const [networkDisplayFiltersSort, setNetworkDisplayFiltersSort] = useState<{ sortBy: string; sortDirection: 'asc' | 'desc' }>({ sortBy: 'pattern', sortDirection: 'asc' });
  const [networkDisplayMappingsSort, setNetworkDisplayMappingsSort] = useState<{ sortBy: string; sortDirection: 'asc' | 'desc' }>({ sortBy: 'name', sortDirection: 'asc' });
  const [customSymbolsSort, setCustomSymbolsSort] = useState<{ sortBy: string; sortDirection: 'asc' | 'desc' }>({ sortBy: 'name', sortDirection: 'asc' });
  const [backupRestoreSort, setBackupRestoreSort] = useState<{ sortBy: string; sortDirection: 'asc' | 'desc' }>({ sortBy: 'lastModified', sortDirection: 'desc' });

  // Add pagination state for all tabs
  // Add pagination state for all tabs
  const [allowedNetworksCurrentPage, setAllowedNetworksCurrentPage] = useState(1);
  const [allowedNetworksPageSize, setAllowedNetworksPageSize] = useLocalStorage<number | 'ALL'>('allowed-networks-table-page-size', 5);

  const [vpnMappingsCurrentPage, setVpnMappingsCurrentPage] = useState(1);
  const [vpnMappingsPageSize, setVpnMappingsPageSize] = useLocalStorage<number | 'ALL'>('vpn-mappings-table-page-size', 5);

  const [networkDisplayFiltersCurrentPage, setNetworkDisplayFiltersCurrentPage] = useState(1);
  const [networkDisplayFiltersPageSize, setNetworkDisplayFiltersPageSize] = useLocalStorage<number | 'ALL'>('network-display-filters-table-page-size', 5);

  const [networkDisplayMappingsCurrentPage, setNetworkDisplayMappingsCurrentPage] = useState(1);
  const [networkDisplayMappingsPageSize, setNetworkDisplayMappingsPageSize] = useLocalStorage<number | 'ALL'>('network-display-mappings-table-page-size', 5);

  const [customSymbolsCurrentPage, setCustomSymbolsCurrentPage] = useState(1);
  const [customSymbolsPageSize, setCustomSymbolsPageSize] = useLocalStorage<number | 'ALL'>('custom-symbols-table-page-size', 5);

  const [backupRestoreCurrentPage, setBackupRestoreCurrentPage] = useState(1);
  const [backupRestorePageSize, setBackupRestorePageSize] = useLocalStorage<number | 'ALL'>('backup-restore-table-page-size', 5);

  // Add search state for tabs that need it
  const [networkDisplayMappingsSearchTerm, setNetworkDisplayMappingsSearchTerm] = useState('');
  const [vpnMappingsSearchTerm, setVpnMappingsSearchTerm] = useState('');

  const [vpnMappings, setVpnMappings] = useState<(OpnsenseVpnEntry & { id: string; vpnUuid: string; opnsenseNetworkGroupId: string | null; mappingId: string | null; opnsenseNetworkGroup: { name: string } | null; friendlyName: string | null; vpnDisplayName: string; isStopping: boolean; isRestarting: boolean; })[]>([]);
  const [isLoadingVpnMappings, setIsLoadingVpnMappings] = useState(false);
  const [isRefreshingVpnMappings, setIsRefreshingVpnMappings] = useState(false);
  const [vpnMappingsError, setVpnMappingsError] = useState<string | null>(null);

  const hasLoadedVpnMappings = useRef(false); // Changed from useState to useRef

  const [backupFiles, setBackupFiles] = useState<BackupVersion[]>([]);
  const [isLoadingBackupRestore, setIsLoadingBackupRestore] = useState(false);
  const [hasLoadedBackupRestore, setHasLoadedBackupRestore] = useState(false);
  const [backupRestoreError, setBackupRestoreError] = useState<string | null>(null);

  const [systemSummaryData, setSystemSummaryData] = useState<Record<string, unknown> | null>(null);
  const [isLoadingSystemSummary, setIsLoadingSystemSummary] = useState(false);
  const [isRefreshingSystemSummary, setIsRefreshingSystemSummary] = useState(false);
  const [hasLoadedSystemSummary, setHasLoadedSystemSummary] = useState(false);
  const [systemSummaryError, setSystemSummaryError] = useState<string | null>(null);

  const hasLoadedNetworkDisplayFilters = useRef(false);
  const hasLoadedNetworkDisplayMappings = useRef(false);
  const hasLoadedAllNetworkGroups = useRef(false);
  const hasLoadedAllowedNetworks = useRef(false); // Declared for Self-Service Access Tab
  const hasLoadedCustomSymbols = useRef(false); // Declared for Custom Symbols Tab

  const [isRefreshingAllowedNetworks, setIsRefreshingAllowedNetworks] = useState(false);
  const [isRefreshingCustomSymbols, setIsRefreshingCustomSymbols] = useState(false);

  const [hasFetchedInitialData, setHasFetchedInitialData] = useState(false); // New state to prevent re-fetching on browser tab switch/minimize

  const [newPattern, setNewPattern] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPatternType, setNewPatternType] = useState<'include' | 'exclude'>('include');

  // Fetch functions (defined at top level)
  const fetchVpnMappings = useCallback(async (inPlace: boolean = false) => {
    if (inPlace) setIsRefreshingVpnMappings(true);
    else setIsLoadingVpnMappings(true);
    setVpnMappingsError(null);
    try {
      const response = await fetch('/api/opnsense/vpn-mappings');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch VPN mappings');
      }
      const fetchedVpns = await response.json();
      const enrichedVpns = fetchedVpns.map((vpn: Record<string, unknown>) => ({
        ...vpn,
        vpnDisplayName: isOpnsenseVpnSession(vpn as unknown as OpnsenseVpnEntry)
          ? (vpn.description as string) || 'N/A'
          : isOpnsenseIpsecConnection(vpn as unknown as OpnsenseVpnEntry)
            ? (vpn.phase1desc as string) || (vpn.name as string) || 'N/A'
            : (vpn.name as string) || 'N/A',
      }));
      setVpnMappings(enrichedVpns as (OpnsenseVpnEntry & { id: string; vpnUuid: string; opnsenseNetworkGroupId: string | null; mappingId: string | null; opnsenseNetworkGroup: { name: string } | null; friendlyName: string | null; vpnDisplayName: string; isStopping: boolean; isRestarting: boolean; })[]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Could not load VPN mappings from the server.';
      setVpnMappingsError(msg);
      toast({
        title: 'Error Loading VPN Mappings',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      if (inPlace) setIsRefreshingVpnMappings(false);
      else setIsLoadingVpnMappings(false);
    }
  }, [toast]);

  const fetchBackupRestore = useCallback(async (showSpinner: boolean = false) => {
    if (showSpinner) setIsLoadingBackupRestore(true);
    setBackupRestoreError(null);
    try {
      const response = await fetch('/api/settings/backup/versions');
      if (!response.ok) throw new Error('Failed to fetch backup versions.');
      const data = await response.json();
      setBackupFiles(data);
    } catch (error) {
      setBackupRestoreError(error instanceof Error ? error.message : 'Could not load backup versions.');
    } finally {
      if (showSpinner) setIsLoadingBackupRestore(false);
    }
  }, []);

  const fetchSystemSummary = useCallback(async (showSpinner: boolean = false, isRefresh: boolean = false) => {
    if (showSpinner) setIsLoadingSystemSummary(true);
    if (isRefresh) setIsRefreshingSystemSummary(true);
    setSystemSummaryError(null);
    try {
      const response = await fetch('/api/admin/system-summary');
      if (!response.ok) throw new Error('Failed to fetch system summary.');
      const data = await response.json();
      setSystemSummaryData(data);
    } catch (error) {
      setSystemSummaryError(error instanceof Error ? error.message : 'Could not load system summary.');
    } finally {
      if (showSpinner) setIsLoadingSystemSummary(false);
      if (isRefresh) setIsRefreshingSystemSummary(false);
    }
  }, []);

  const fetchGlobalSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/global-full');
      if (!response.ok) {
        throw new Error('Failed to fetch global settings');
      }
      const fetchedSettings = await response.json();
      if (fetchedSettings.allowedNetworks) {
        setallowedNetworks(fetchedSettings.allowedNetworks);
      }
      if (fetchedSettings.enableRegistration !== undefined) {
        setEnableRegistration(fetchedSettings.enableRegistration);
      }
      if (fetchedSettings.removeSelfServicePage !== undefined) {
        setRemoveSelfServicePage(fetchedSettings.removeSelfServicePage);
      }
      if (fetchedSettings.enableRenamingSelfServicePage !== undefined) {
        setEnableRenamingSelfServicePage(fetchedSettings.enableRenamingSelfServicePage);
      }
      if (fetchedSettings.enableRenamingDeviceManagementPage !== undefined) {
        setEnableRenamingDeviceManagementPage(fetchedSettings.enableRenamingDeviceManagementPage);
      }
      // Group Type Settings
      if (fetchedSettings.enableGroupTypes !== undefined) {
        setEnableGroupTypes(fetchedSettings.enableGroupTypes);
      }
      if (fetchedSettings.enableSelfServiceMultiSelect !== undefined) {
        setEnableSelfServiceMultiSelect(fetchedSettings.enableSelfServiceMultiSelect);
      }
      if (fetchedSettings.singleSelectName !== undefined) {
        setSingleSelectName(fetchedSettings.singleSelectName);
      }
      if (fetchedSettings.multiSelectName !== undefined) {
        setMultiSelectName(fetchedSettings.multiSelectName);
      }
      if (fetchedSettings.singleSelectIcon !== undefined) {
        setSingleSelectIcon(fetchedSettings.singleSelectIcon);
      }
      if (fetchedSettings.multiSelectIcon !== undefined) {
        setMultiSelectIcon(fetchedSettings.multiSelectIcon);
      }
      // Advanced Analytics Settings
      if (fetchedSettings.enableAdvancedAnalytics !== undefined) {
        setEnableAdvancedAnalytics(fetchedSettings.enableAdvancedAnalytics);
      }
      // Logs and Analytics Retention Settings
      if (fetchedSettings.logsAnalyticsRetentionDays !== undefined) {
        setLogsAnalyticsRetentionDays(fetchedSettings.logsAnalyticsRetentionDays);
      }
      // MAC Tracking Settings
      if (fetchedSettings.enableMacTracking !== undefined) {
        setEnableMacTracking(fetchedSettings.enableMacTracking);
      }
      if (fetchedSettings.macTrackingInterval !== undefined) {
        setMacTrackingInterval(fetchedSettings.macTrackingInterval);
      }
      if (fetchedSettings.macInactiveTimeout !== undefined) {
        setMacInactiveTimeout(fetchedSettings.macInactiveTimeout);
      }
      if (fetchedSettings.macDataRetentionDays !== undefined) {
        setMacDataRetentionDays(fetchedSettings.macDataRetentionDays);
      }
      // Network Aliases Management
      if (fetchedSettings.manageNetworkAliasesEnabled !== undefined) {
        setManageNetworkAliasesEnabled(fetchedSettings.manageNetworkAliasesEnabled);
      }
      // Application Subtitle Settings
      if (fetchedSettings.enableApplicationSubtitle !== undefined) {
        setEnableApplicationSubtitle(fetchedSettings.enableApplicationSubtitle);
      }
      if (fetchedSettings.subtitleText !== undefined) {
        setSubtitleText(fetchedSettings.subtitleText || '');
      }
      if (fetchedSettings.enableLoginPageSubtitle !== undefined) {
        setEnableLoginPageSubtitle(fetchedSettings.enableLoginPageSubtitle);
      }
      if (fetchedSettings.customLucideIcons) {
        const mappedIcons: CustomLucideIcon[] = fetchedSettings.customLucideIcons.map((item: { name: string; icon: string }) => ({
          name: item.name,
          icon: LucideIcons[item.icon as keyof typeof LucideIcons] as LucideIcon,
        }));
        setCustomLucideIcons(mappedIcons);
      }
      if (fetchedSettings.customEmojis) {
        setCustomEmojis(fetchedSettings.customEmojis);
      }
      if (fetchedSettings.customFlags) {
        setCustomFlags(fetchedSettings.customFlags);
      }
    } catch (error) {
      logger.error("Failed to load global settings from API", error);
      const msg = error instanceof Error ? error.message : "Could not load global settings from the server.";
      toast({
        title: "Error Loading Global Settings",
        description: msg,
        variant: "destructive",
      });
    }
  }, [toast]);

  const fetchFilterSettings = useCallback(async (showFullLoader: boolean = false) => {
    if (showFullLoader) {
      setIsLoadingFilters(true);
    }
    try {
      const response = await fetch('/api/settings/group-filters');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch filter settings');
      }
      const fetchedFilters = await response.json();
      setGroupFilters(fetchedFilters);
      if (fetchedFilters.length === 0) {
        toast({ title: 'No Filters Found', description: 'No group filter settings found in the database. Please add new filters.', variant: 'default' });
      }
      hasLoadedNetworkDisplayFilters.current = true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Could not load network filters from the server.';
      toast({ title: 'Error Loading Settings', description: msg, variant: 'destructive' });
    } finally {
      if (showFullLoader) {
        setIsLoadingFilters(false);
      }
    }
  }, [toast]);

  const fetchAllGroupsForPreview = useCallback(async (showFullLoader: boolean = false) => {
    if (showFullLoader) {
      setIsLoadingAllGroups(true);
    }
    setErrorLoadingAllGroups(null);
    try {
      const opnsenseResponse = await fetch('/api/opnsense/network-groups?debug=true');
      if (!opnsenseResponse.ok) {
        const errorData = await opnsenseResponse.json();
        throw new Error(errorData.error || `Failed to fetch OPNsense groups: ${opnsenseResponse.statusText}`);
      }
      const opnsenseData = await opnsenseResponse.json();
      const displayResponse = await fetch('/api/settings/opnsense-group-display');
      if (!displayResponse.ok) {
        const errorData = await displayResponse.json();
        throw new Error(errorData.error || `Failed to fetch group display mappings: ${displayResponse.statusText}`);
      }
      const displayMappings = await displayResponse.json();
      const allGroups = [];
      if (opnsenseData && opnsenseData.aliases && typeof opnsenseData.aliases.alias === 'object') {
        for (const uuid in opnsenseData.aliases.alias) {
          const alias = opnsenseData.aliases.alias[uuid];
          if (alias && alias.type === 'networkgroup') {
            const mapping = displayMappings.find((d: OpnsenseGroupDisplay) => d.opnsenseUuid === uuid);
            allGroups.push({
              id: uuid,
              uuid: uuid,
              name: alias.name,
              description: alias.description,
              enabled: alias.enabled === '1',
              members: [],
              rawContent: alias.content,
              type: alias.type,
              proto: alias.proto,
              interface: alias.interface,
              counters: alias.counters,
              updatefreq: alias.updatefreq,
              categories: alias.categories,
              friendlyName: mapping?.friendlyName || alias.name,
              iconIdentifier: mapping?.iconIdentifier || null,
              isGloballyDisabled: mapping?.isGloballyDisabled || false
            });
          }
        }
      }
      setAllNetworkGroups(allGroups);
      hasLoadedAllNetworkGroups.current = true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Could not load all groups for preview.';
      setErrorLoadingAllGroups(msg);
      toast({ variant: 'destructive', title: 'Error Loading Group Preview', description: msg });
    } finally {
      if (showFullLoader) {
        setIsLoadingAllGroups(false);
      }
    }
  }, [toast]);

  const fetchSsoGroupMappings = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) setIsRefreshingMappings(true);
    else if (!hasLoadedNetworkDisplayMappings.current) setIsLoadingMappings(true);
    try {
      const response = await fetch('/api/settings/opnsense-group-display');
      if (!response.ok) {
        let errorMsg = `API Error ${response.status}: ${response.statusText}.`;
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.indexOf("application/json") !== -1) {
            const errorData = await response.json();
            errorMsg = errorData.error || errorData.message || `API Error ${response.status}: ${response.statusText}. JSON response did not contain a recognized error field.`;
          } else {
            const responseBody = await response.text();
            errorMsg = `API Error ${response.status}: ${response.statusText}. Response was not JSON. Body: ${responseBody.substring(0, 100)}${responseBody.length > 100 ? '...' : ''}`;
          }
        } catch {
          errorMsg = `API Error ${response.status}: ${response.statusText}. Failed to parse error response body.`;
        }
        throw new Error(errorMsg);
      }
      const fetchedMappings: OpnsenseGroupDisplay[] = await response.json();
      setSsoGroupMappings(fetchedMappings);
      hasLoadedNetworkDisplayMappings.current = true;
    } catch (error) {
      logger.error("Failed to load group mappings from API", error);
      const msg = error instanceof Error ? error.message : "Could not load group mappings from the server.";
      toast({
        title: "Error Loading Network Display Mappings",
        description: msg,
        variant: "destructive",
      });
    } finally {
      if (forceRefresh) setIsRefreshingMappings(false);
      else setIsLoadingMappings(false);
    }
  }, [toast]);

  const refreshOpnsenseGroups = useCallback(async (showLoadingSpinner: boolean = true) => {
    if (showLoadingSpinner) {
      setIsLoadingAllGroups(true);
    }
    setErrorLoadingAllGroups(null);
    try {
      // 1. Fetch raw OPNsense groups with debug=true to get all groups
      const opnsenseResponse = await fetch('/api/opnsense/network-groups?debug=true');
      if (!opnsenseResponse.ok) {
        const errorData = await opnsenseResponse.json();
        throw new Error(errorData.error || `Failed to fetch OPNsense groups: ${opnsenseResponse.statusText}`);
      }
      const opnsenseData = await opnsenseResponse.json();

      // 2. Fetch display mappings
      const displayResponse = await fetch('/api/settings/opnsense-group-display');
      if (!displayResponse.ok) {
        const errorData = await displayResponse.json();
        throw new Error(errorData.error || `Failed to fetch group display mappings: ${displayResponse.statusText}`);
      }
      const displayMappings = await displayResponse.json();

      // 3. Extract network groups from the raw export
      const allGroups = [];
      if (opnsenseData && opnsenseData.aliases && typeof opnsenseData.aliases.alias === 'object') {
        for (const uuid in opnsenseData.aliases.alias) {
          const alias = opnsenseData.aliases.alias[uuid] as Record<string, unknown>;
          if (alias && alias.type === 'networkgroup') {
            // Find matching display mapping
            const mapping = displayMappings.find((d: { opnsenseUuid: string }) => d.opnsenseUuid === uuid);

            // Create merged group object
            allGroups.push({
              id: uuid,
              uuid: uuid,
              name: alias.name as string,
              description: alias.description as string,
              enabled: alias.enabled === '1',
              members: [],
              rawContent: alias.content as string | undefined,
              type: alias.type as string,
              proto: alias.proto as string | undefined,
              interface: alias.interface as string | undefined,
              counters: alias.counters as string | undefined,
              updatefreq: alias.updatefreq as string | undefined,
              categories: alias.categories as string | undefined,
              friendlyName: mapping?.friendlyName || (alias.name as string),
              iconIdentifier: mapping?.iconIdentifier || null,
              isGloballyDisabled: mapping?.isGloballyDisabled || false
            });
          }
        }
      }

      setAllNetworkGroups(allGroups);
    } catch (error) {
      logger.error("Failed to refresh OPNsense groups:", error);
      const msg = error instanceof Error ? error.message : "Could not refresh OPNsense groups.";
      setErrorLoadingAllGroups(msg);
      toast({
        variant: "destructive",
        title: "Error Refreshing Groups",
        description: msg,
      });
    } finally {
      if (showLoadingSpinner) {
        setIsLoadingAllGroups(false);
      }
    }
  }, [toast]);

  const handleGroupFiltersRefresh = async (showLoadingSpinner: boolean = true) => {
    await fetchFilterSettings(showLoadingSpinner);
    await fetchAllGroupsForPreview(showLoadingSpinner);
  };

  // All useEffect hooks must be at the top level
  useEffect(() => {
    setMounted(true);
  }, []);

  // Check for updates (SUPER_ADMIN only) - uses cached status
  useEffect(() => {
    const checkUpdates = async () => {
      if (session?.user?.role === Role.SUPER_ADMIN) {
        try {
          // Use the status endpoint which returns cached results
          const response = await fetch('/api/updates/status');
          if (response.ok) {
            const result = await response.json();
            // API returns { success: true, data: { updateAvailable: true, ... } }
            setUpdateAvailable(result.data?.updateAvailable || false);
          }
        } catch (error) {
          logger.error('Failed to get update status:', error);
        }
      }
    };

    if (mounted) {
      void checkUpdates();
    }
  }, [mounted, session?.user?.role]);

  // Initial data fetching based on authentication status and super admin role
  useEffect(() => {
    logger.debug('[Settings Page] Auth status changed:', {
      authStatus,
      userRole: session?.user?.role,
      userId: session?.user?.id,
      hasFetchedInitialData,
    });

    if (authStatus === 'authenticated' && session?.user?.role === Role.SUPER_ADMIN && !hasFetchedInitialData) {
      logger.debug('[Settings Page] User is SUPER_ADMIN, fetching initial data');
      // Pass true to show full loader only on initial mount
      fetchFilterSettings(true).finally(() => setIsLoadingFilters(false));
      fetchSsoGroupMappings(false).finally(() => setIsLoadingMappings(false));
      fetchGlobalSettings();
      fetchAllGroupsForPreview(true).finally(() => setIsLoadingAllGroups(false));
      setHasFetchedInitialData(true); // Mark initial data as fetched
    } else if (authStatus === 'authenticated' && session?.user?.role !== Role.SUPER_ADMIN) {
      logger.warn('[Settings Page] User is NOT SUPER_ADMIN, redirecting to home in 5 seconds', {
        userRole: session?.user?.role,
        expectedRole: Role.SUPER_ADMIN,
      });
      const timer = setTimeout(() => {
        router.push('/');
      }, 5000);
      return () => clearTimeout(timer);
    } else if (authStatus === 'unauthenticated') {
      logger.warn('[Settings Page] User is unauthenticated, redirecting to login in 10 seconds');
      const timer = setTimeout(() => {
        router.push('/login');
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [authStatus, session, router, fetchFilterSettings, fetchSsoGroupMappings, fetchGlobalSettings, fetchAllGroupsForPreview, setIsLoadingFilters, setIsLoadingMappings, setIsLoadingAllGroups, hasFetchedInitialData]);

  useEffect(() => {
    if (activeTab === 'vpn-mappings') {
      if (!hasLoadedVpnMappings.current) { // Updated to use .current
        hasLoadedVpnMappings.current = true; // Set current to true
        fetchVpnMappings(false); // Initial load
      } else {
        fetchVpnMappings(true); // In-place refresh
      }
    }
  }, [activeTab, fetchVpnMappings]); // Removed hasLoadedVpnMappings from dependencies as it's a ref

  useEffect(() => {
    if (activeTab === 'backup-restore') {
      if (!hasLoadedBackupRestore) {
        fetchBackupRestore(true);
        setHasLoadedBackupRestore(true);
      } else {
        fetchBackupRestore(false); // silent in-place refresh
      }
    }
  }, [activeTab, fetchBackupRestore, hasLoadedBackupRestore]);

  useEffect(() => {
    if (activeTab === 'system-summary') {
      if (!hasLoadedSystemSummary) {
        fetchSystemSummary(true, false); // First load: show spinner, no refresh icon
        setHasLoadedSystemSummary(true);
      } else {
        fetchSystemSummary(false, true); // Tab switch: no spinner, show refresh icon
      }
    }
  }, [activeTab, fetchSystemSummary, hasLoadedSystemSummary]);

  // Self-Service Access tab in-place refresh on tab switch
  useEffect(() => {
    if (activeTab === 'allowed-networks') {
      if (!hasLoadedAllowedNetworks.current) {
        hasLoadedAllowedNetworks.current = true;
        setIsRefreshingAllowedNetworks(true);
        fetchGlobalSettings().finally(() => setIsRefreshingAllowedNetworks(false));
      } else {
        // Subsequent refresh on tab switch
        setIsRefreshingAllowedNetworks(true);
        fetchGlobalSettings().finally(() => setIsRefreshingAllowedNetworks(false));
      }
    }
  }, [activeTab, fetchGlobalSettings]);

  // Network Display Filters tab in-place refresh on tab switch
  useEffect(() => {
    if (activeTab === 'group-filters') {
      if (!hasLoadedNetworkDisplayFilters.current) {
        hasLoadedNetworkDisplayFilters.current = true;
        // Initial load will be handled by the main auth useEffect
        // No need to set isRefreshingFilters here for initial load
      } else {
        // Refresh on subsequent visits (in-place)
        setIsRefreshingFilters(true);
        fetchFilterSettings(false).finally(() => setIsRefreshingFilters(false));
      }
    }
  }, [activeTab, fetchFilterSettings]);

  // Network Display Mappings tab in-place refresh on tab switch
  useEffect(() => {
    if (activeTab === 'opnsense-group-display') {
      if (!hasLoadedNetworkDisplayMappings.current) {
        hasLoadedNetworkDisplayMappings.current = true;
        setIsLoadingMappings(true); // Initial load uses isLoadingMappings
        fetchSsoGroupMappings().finally(() => setIsLoadingMappings(false));
      } else { // Refresh on subsequent visits
        setIsRefreshingMappings(true); // Use isRefreshing for in-place refresh
        fetchSsoGroupMappings(true).finally(() => setIsRefreshingMappings(false));
      }
    }
  }, [activeTab, fetchSsoGroupMappings]);

  // Custom Symbols tab in-place refresh on tab switch
  useEffect(() => {
    if (activeTab === 'custom-symbols') {
      if (!hasLoadedCustomSymbols.current) {
        hasLoadedCustomSymbols.current = true;
        setIsRefreshingCustomSymbols(true);
        fetchGlobalSettings().finally(() => setIsRefreshingCustomSymbols(false));
      } else {
        // Subsequent refresh on tab switch
        setIsRefreshingCustomSymbols(true);
        fetchGlobalSettings().finally(() => setIsRefreshingCustomSymbols(false));
      }
    }
  }, [activeTab, fetchGlobalSettings]);

  if (authStatus === 'loading' || !mounted) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <AppHeader />
        <main className="flex-grow container mx-auto p-4 md:p-8 flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </main>
        <footer className="text-center p-4 text-sm text-muted-foreground border-t">
          InstradaOGM
        </footer>
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <AppHeader />
        <main className="flex-grow container mx-auto p-4 md:p-8 flex flex-col items-center justify-center space-y-4">
          <ClientOnly><LogOut className="h-16 w-16 text-primary" /></ClientOnly>
          <h1 className="text-2xl font-semibold">Not Authenticated</h1>
          <p className="text-muted-foreground">Please log in to access settings.</p>
          <p className="text-muted-foreground">Redirecting to Login in 10 seconds...</p>
          <Button onClick={() => router.push('/login')}>Go to Login</Button>
        </main>
        <AppFooter pageTitle="Settings" />
      </div>
    );
  }

  const isSuperAdmin = session?.user?.role === Role.SUPER_ADMIN;

  // Tab configuration for mobile dropdown
  const tabConfig = [
    { value: 'global', label: 'Global', icon: <Globe className="h-4 w-4" />, badge: null },
    { value: 'allowed-networks', label: 'Self-Service Access', icon: <GoDeviceDesktop size={16} />, badge: null },
    { value: 'group-filters', label: 'Network Display Filters', icon: <ListFilter className="h-4 w-4" />, badge: null },
    { value: 'opnsense-group-display', label: 'Network Display Mappings', icon: <Network className="h-4 w-4" />, badge: null },
    { value: 'vpn-mappings', label: 'VPN Mappings', icon: <ShieldCheck className="h-4 w-4" />, badge: null },
    { value: 'custom-symbols', label: 'Custom Symbols', icon: <Sparkles className="h-4 w-4" />, badge: null },
    { value: 'backup-restore', label: 'Backup & Restore', icon: <Database className="h-4 w-4" />, badge: null },
    { value: 'system-summary', label: 'System Summary', icon: <Info className="h-4 w-4" />, badge: null },
    ...(isSuperAdmin ? [{
      value: 'updates',
      label: 'Updates',
      icon: <ClientOnly><Download className="h-4 w-4" /></ClientOnly>,
      badge: updateAvailable ? (
        <span className="relative flex h-2 w-2 ml-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
        </span>
      ) : null
    }] : []),
  ];

  const currentTab = tabConfig.find(tab => tab.value === activeTab);



  if (authStatus === 'authenticated' && !isSuperAdmin) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <AppHeader />
        <main className="flex-grow container-responsive py-4 flex flex-col items-center justify-center space-y-4">
          <ClientOnly><Ban className="h-16 w-16 text-destructive" /></ClientOnly>
          <h1 className="text-2xl font-semibold">Access Denied</h1>
          <p className="text-muted-foreground">You do not have permission to view this page.</p>
          <p className="text-muted-foreground">Redirecting to Login in 10 seconds...</p>
          <Button onClick={() => router.push('/')}>Go to Self-Service</Button>
        </main>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col h-dynamic-screen overflow-hidden bg-background">
      <AppHeader />
      <main className="flex-grow container-responsive py-3 flex flex-col min-h-0 pb-16">
        <h1 className={`font-bold text-foreground mb-4 flex items-center ${isMobile ? 'text-2xl' : 'text-3xl'}`}>Settings</h1>

        <Tabs value={activeTab} className="w-full flex flex-col flex-grow min-h-0" onValueChange={setActiveTab}>
          {/* Hidden TabsList for mobile - needed for Tabs component to work */}
          <TabsList className={`${isMobile ? 'sr-only' : 'grid w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl2:grid-cols-6 h-auto'}`}>
            {tabConfig.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="relative">
                <ClientOnly><span className="mr-2">{tab.icon}</span></ClientOnly>
                {tab.label}
                {tab.badge && <ClientOnly>{tab.badge}</ClientOnly>}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Mobile dropdown menu */}
          {isMobile && (
            <div className="w-full">
              <DropdownMenu open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between h-12 text-left bg-muted/50 hover:bg-muted/70"
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  >
                    <div className="flex items-center">
                      <ClientOnly>
                        {currentTab && (
                          <div className="mr-2">{currentTab.icon}</div>
                        )}
                      </ClientOnly>
                      <span>{currentTab?.label || 'Global Menu'}</span>
                      {currentTab?.badge && <ClientOnly>{currentTab.badge}</ClientOnly>}
                    </div>
                    <ClientOnly>
                      {isMobileMenuOpen ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </ClientOnly>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-full min-w-[var(--radix-dropdown-menu-trigger-width)]">
                  {tabConfig.map((tab) => (
                    <DropdownMenuItem
                      key={tab.value}
                      onClick={() => {
                        setActiveTab(tab.value);
                        setIsMobileMenuOpen(false);
                      }}
                      className="flex items-center py-3"
                    >
                      <ClientOnly>
                        <div className="mr-3">{tab.icon}</div>
                      </ClientOnly>
                      {tab.label}
                      {tab.badge && <ClientOnly>{tab.badge}</ClientOnly>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Single content area with conditional rendering */}
          <div className="mt-4 w-full min-w-0 flex-grow flex flex-col min-h-0">
            {activeTab === 'global' && (
              <GlobalSettingsTab
                enableRegistration={enableRegistration}
                setEnableRegistration={setEnableRegistration}
                removeSelfServicePage={removeSelfServicePage}
                setRemoveSelfServicePage={setRemoveSelfServicePage}
                enableRenamingSelfServicePage={enableRenamingSelfServicePage}
                setEnableRenamingSelfServicePage={setEnableRenamingSelfServicePage}
                enableRenamingDeviceManagementPage={enableRenamingDeviceManagementPage}
                setEnableRenamingDeviceManagementPage={setEnableRenamingDeviceManagementPage}
                enableGroupTypes={enableGroupTypes}
                setEnableGroupTypes={setEnableGroupTypes}
                enableSelfServiceMultiSelect={enableSelfServiceMultiSelect}
                setEnableSelfServiceMultiSelect={setEnableSelfServiceMultiSelect}
                singleSelectName={singleSelectName}
                setSingleSelectName={setSingleSelectName}
                multiSelectName={multiSelectName}
                setMultiSelectName={setMultiSelectName}
                singleSelectIcon={singleSelectIcon}
                setSingleSelectIcon={setSingleSelectIcon}
                multiSelectIcon={multiSelectIcon}
                setMultiSelectIcon={setMultiSelectIcon}
                enableAdvancedAnalytics={enableAdvancedAnalytics}
                setEnableAdvancedAnalytics={setEnableAdvancedAnalytics}
                logsAnalyticsRetentionDays={logsAnalyticsRetentionDays}
                setLogsAnalyticsRetentionDays={setLogsAnalyticsRetentionDays}
                enableMacTracking={enableMacTracking}
                setEnableMacTracking={setEnableMacTracking}
                macTrackingInterval={macTrackingInterval}
                setMacTrackingInterval={setMacTrackingInterval}
                macInactiveTimeout={macInactiveTimeout}
                setMacInactiveTimeout={setMacInactiveTimeout}
                macDataRetentionDays={macDataRetentionDays}
                setMacDataRetentionDays={setMacDataRetentionDays}
                enableApplicationSubtitle={enableApplicationSubtitle}
                setEnableApplicationSubtitle={setEnableApplicationSubtitle}
                subtitleText={subtitleText}
                setSubtitleText={setSubtitleText}
                enableLoginPageSubtitle={enableLoginPageSubtitle}
                setEnableLoginPageSubtitle={setEnableLoginPageSubtitle}
                customLucideIcons={customLucideIcons as { name: string; icon: React.ComponentType<{ size?: number }> }[]}
                manageNetworkAliasesEnabled={manageNetworkAliasesEnabled}
                setManageNetworkAliasesEnabled={setManageNetworkAliasesEnabled}
              />
            )}

            {activeTab === 'allowed-networks' && (
              <SelfServiceAccessTab
                allowedNetworks={allowedNetworks}
                setallowedNetworks={setallowedNetworks}
                newNetworkType={newNetworkType}
                setNewNetworkType={setNewNetworkType}
                newNetworkCidr={newNetworkCidr}
                setNewNetworkCidr={setNewNetworkCidr}
                newNetworkStartIp={newNetworkStartIp}
                setNewNetworkStartIp={setNewNetworkStartIp}
                newNetworkEndIp={newNetworkEndIp}
                setNewNetworkEndIp={setNewNetworkEndIp}
                newNetworkDescription={newNetworkDescription}
                setNewNetworkDescription={setNewNetworkDescription}
                handleSaveGlobalSettings={async () => {
                  setIsSavingGlobalSettings(true);
                  try {
                    const response = await fetch('/api/settings/global', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        enableRegistration,
                        removeSelfServicePage,
                        enableRenamingSelfServicePage,
                        enableRenamingDeviceManagementPage,
                        allowedNetworks,
                        customLucideIcons: customLucideIcons.map(item => ({ name: item.name, icon: item.icon.displayName || item.icon.name })),
                        customEmojis,
                        customFlags,
                      }),
                    });
                    if (!response.ok) {
                      const errorData = await response.json();
                      throw new Error(errorData.error || 'Failed to save global settings to API');
                    }
                    toast({
                      title: "Global Settings Saved",
                      description: "Global settings have been successfully saved.",
                      variant: "success",
                    });
                  } catch (error) {
                    logger.error("Failed to save global settings to API", error);
                    const msg = error instanceof Error ? error.message : "Could not save global settings to the server.";
                    toast({
                      title: "Error Saving Global Settings",
                      description: msg,
                      variant: "destructive",
                    });
                  } finally {
                    setIsSavingGlobalSettings(false);
                  }
                }}
                isSavingGlobalSettings={isSavingGlobalSettings}
                isRefreshing={isRefreshingAllowedNetworks}
                sortBy={allowedNetworksSort.sortBy}
                sortDirection={allowedNetworksSort.sortDirection}
                onSortChange={(sortBy, sortDirection) => setAllowedNetworksSort({ sortBy, sortDirection })}
                onRefresh={() => {
                  setIsRefreshingAllowedNetworks(true);
                  fetchGlobalSettings().finally(() => setIsRefreshingAllowedNetworks(false));
                }}
                currentPage={allowedNetworksCurrentPage}
                pageSize={allowedNetworksPageSize}
                onPageChange={setAllowedNetworksCurrentPage}
                onPageSizeChange={(pageSize) => {
                  setAllowedNetworksPageSize(pageSize);
                  setAllowedNetworksCurrentPage(1);
                }}
              />
            )}

            {activeTab === 'group-filters' && (
              <NetworkDisplayFiltersTab
                groupFilters={groupFilters}
                setGroupFilters={setGroupFilters}
                isLoadingFilters={isLoadingFilters}
                isRefreshing={isRefreshingFilters}
                isSavingFilters={isSavingFilters}
                setIsSavingFilters={setIsSavingFilters} // Pass the setter function

                newPattern={newPattern}
                setNewPattern={setNewPattern}
                newDescription={newDescription}
                setNewDescription={setNewDescription}
                newPatternType={newPatternType}
                setNewPatternType={setNewPatternType}
                allNetworkGroups={allNetworkGroups}
                isLoadingAllGroups={isLoadingAllGroups}
                errorLoadingAllGroups={errorLoadingAllGroups}
                opnsenseGroupDisplays={SsoGroupMappings}
                customLucideIcons={customLucideIcons}
                customEmojis={customEmojis}
                customFlags={customFlags}
                onRefreshOpnsenseGroups={handleGroupFiltersRefresh}
                sortBy={networkDisplayFiltersSort.sortBy}
                sortDirection={networkDisplayFiltersSort.sortDirection}
                onSortChange={(sortBy, sortDirection) => setNetworkDisplayFiltersSort({ sortBy, sortDirection })}
                currentPage={networkDisplayFiltersCurrentPage}
                pageSize={networkDisplayFiltersPageSize}
                onPageChange={setNetworkDisplayFiltersCurrentPage}
                onPageSizeChange={(pageSize) => {
                  setNetworkDisplayFiltersPageSize(pageSize);
                  setNetworkDisplayFiltersCurrentPage(1);
                }}
              />
            )}

            {activeTab === 'opnsense-group-display' && (
              <NetworkDisplayMappingsTab
                allOpnsenseGroups={allNetworkGroups}
                opnsenseGroupDisplays={SsoGroupMappings}
                setOpnsenseGroupDisplays={setSsoGroupMappings}
                isLoadingOpnsenseGroups={isLoadingAllGroups}
                errorLoadingOpnsenseGroups={errorLoadingAllGroups}
                isLoadingOpnsenseGroupDisplays={isLoadingMappings}
                isSavingOpnsenseGroupDisplays={isSavingMappings}
                setIsSavingOpnsenseGroupDisplays={setIsSavingMappings}
                isRefreshing={isRefreshingMappings} // Pass new isRefreshing prop
                customLucideIcons={customLucideIcons}
                customEmojis={customEmojis}
                customFlags={customFlags}
                onRefreshOpnsenseGroups={refreshOpnsenseGroups}
                sortBy={networkDisplayMappingsSort.sortBy}
                sortDirection={networkDisplayMappingsSort.sortDirection}
                onSortChange={(sortBy, sortDirection) => setNetworkDisplayMappingsSort({ sortBy, sortDirection })}
                currentPage={networkDisplayMappingsCurrentPage}
                pageSize={networkDisplayMappingsPageSize}
                onPageChange={setNetworkDisplayMappingsCurrentPage}
                onPageSizeChange={(pageSize) => {
                  setNetworkDisplayMappingsPageSize(pageSize);
                  setNetworkDisplayMappingsCurrentPage(1);
                }}
                searchTerm={networkDisplayMappingsSearchTerm}
                onSearchTermChange={setNetworkDisplayMappingsSearchTerm}
              />
            )}

            {activeTab === 'vpn-mappings' && (
              <VpnMappingsTab
                allNetworkGroups={allNetworkGroups}
                opnsenseGroupDisplays={SsoGroupMappings}
                isLoadingAllGroups={isLoadingAllGroups}
                vpnMappings={vpnMappings}
                isLoadingInitialData={isLoadingVpnMappings}
                isRefreshing={isRefreshingVpnMappings}
                vpnMappingsError={vpnMappingsError}
                onRefresh={() => fetchVpnMappings(true)}
                sortBy={vpnMappingsSort.sortBy}
                sortDirection={vpnMappingsSort.sortDirection}
                onSortChange={(sortBy, sortDirection) => setVpnMappingsSort({ sortBy, sortDirection })}
                currentPage={vpnMappingsCurrentPage}
                pageSize={vpnMappingsPageSize}
                onPageChange={setVpnMappingsCurrentPage}
                onPageSizeChange={(pageSize) => {
                  setVpnMappingsPageSize(pageSize);
                  setVpnMappingsCurrentPage(1);
                }}
                searchTerm={vpnMappingsSearchTerm}
                onSearchTermChange={setVpnMappingsSearchTerm}
              />
            )}

            {activeTab === 'custom-symbols' && (
              <CustomSymbolsTab
                customLucideIcons={customLucideIcons}
                setCustomLucideIcons={setCustomLucideIcons}
                customEmojis={customEmojis}
                setCustomEmojis={setCustomEmojis}
                customFlags={customFlags}
                setCustomFlags={setCustomFlags}
                newCustomIconName={newCustomIconName}
                setNewCustomIconName={setNewCustomIconName}
                newCustomIconIdentifier={newCustomIconIdentifier}
                setNewCustomIconIdentifier={setNewCustomIconIdentifier}
                newCustomIconType={newCustomIconType}
                setNewCustomIconType={setNewCustomIconType}
                isSavingGlobalSettings={isSavingGlobalSettings}
                handleSaveGlobalSettings={async () => {
                  setIsSavingGlobalSettings(true);
                  try {
                    const response = await fetch('/api/settings/global', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        enableRegistration,
                        removeSelfServicePage,
                        enableRenamingSelfServicePage,
                        enableRenamingDeviceManagementPage,
                        allowedNetworks,
                        customLucideIcons: customLucideIcons.map(item => ({ name: item.name, icon: item.icon.displayName || item.icon.name })),
                        customEmojis,
                        customFlags,
                      }),
                    });
                    if (!response.ok) {
                      const errorData = await response.json();
                      throw new Error(errorData.error || 'Failed to save global settings to API');
                    }
                    toast({
                      title: "Global Settings Saved",
                      description: "Global settings have been successfully saved.",
                      variant: "success",
                    });
                  } catch (error) {
                    logger.error("Failed to save global settings to API", error);
                    const msg = error instanceof Error ? error.message : "Could not save global settings to the server.";
                    toast({
                      title: "Error Saving Global Settings",
                      description: msg,
                      variant: "destructive",
                    });
                  } finally {
                    setIsSavingGlobalSettings(false);
                  }
                }}
                isRefreshing={isRefreshingCustomSymbols}
                sortBy={customSymbolsSort.sortBy}
                sortDirection={customSymbolsSort.sortDirection}
                onSortChange={(sortBy, sortDirection) => setCustomSymbolsSort({ sortBy, sortDirection })}
                onRefresh={() => {
                  setIsRefreshingCustomSymbols(true);
                  fetchGlobalSettings().finally(() => setIsRefreshingCustomSymbols(false));
                }}
                currentPage={customSymbolsCurrentPage}
                pageSize={customSymbolsPageSize}
                onPageChange={setCustomSymbolsCurrentPage}
                onPageSizeChange={(pageSize) => {
                  setCustomSymbolsPageSize(pageSize);
                  setCustomSymbolsCurrentPage(1);
                }}
              />
            )}

            {activeTab === 'backup-restore' && (
              <BackupRestoreTab
                backupFiles={backupFiles}
                isLoadingInitialData={isLoadingBackupRestore}
                backupRestoreError={backupRestoreError}
                onSilentRefresh={() => fetchBackupRestore(false)}
                sortBy={backupRestoreSort.sortBy}
                sortDirection={backupRestoreSort.sortDirection}
                onSortChange={(sortBy, sortDirection) => setBackupRestoreSort({ sortBy, sortDirection })}
                currentPage={backupRestoreCurrentPage}
                pageSize={backupRestorePageSize}
                onPageChange={setBackupRestoreCurrentPage}
                onPageSizeChange={(pageSize) => {
                  setBackupRestorePageSize(pageSize);
                  setBackupRestoreCurrentPage(1);
                }}
              />
            )}

            {activeTab === 'system-summary' && (
              <SystemSummaryTab
                systemSummaryData={systemSummaryData}
                isLoadingInitialData={isLoadingSystemSummary}
                systemSummaryError={systemSummaryError}
                isRefreshing={isRefreshingSystemSummary}
                onRefresh={() => fetchSystemSummary(false, true)}
              />
            )}

            {activeTab === 'updates' && isSuperAdmin && (
              <UpdatesTab />
            )}

          </div>
        </Tabs>
      </main>
      <AppFooter pageTitle="Settings" />
    </div>
  );
}