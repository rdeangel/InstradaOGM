'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, History, RefreshCw, Maximize2, XCircle, Slash, Network, Settings, MoreVertical, FileJson, FileSpreadsheet, Filter } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { ResponsiveHelp } from '@/components/ui/responsive-help';
import { MacAddress, MacAddressListResponse } from '@/types/mac-tracking';
import { MacHistoryDialog } from './MacHistoryDialog';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { MacTrackingModal } from './MacTrackingModal';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile, useIsSmallScreen, useIsPhone } from '@/hooks/use-mobile';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocalStorage } from '@/hooks/use-local-storage';

// Helper component for highlighting text
const HighlightedText = ({ text, highlight }: { text: string | null | undefined, highlight: string }) => {
  if (!text) return <>{text || ''}</>;
  if (!highlight || !highlight.trim()) return <>{text}</>;

  try {
    // eslint-disable-next-line security/detect-non-literal-regexp
    const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === highlight.toLowerCase() ? (
            <span key={i} className="bg-yellow-200 dark:bg-yellow-900/50 text-foreground font-medium rounded-[1px]">
              {part}
            </span>
          ) : (
            part
          )
        )}
      </span>
    );
  } catch {
    return <>{text}</>;
  }
};

interface MacTrackingTableProps {
  onRefresh?: () => void;
  onOpenServiceControl?: () => void;
}

export function MacTrackingTable({ onRefresh, onOpenServiceControl }: MacTrackingTableProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const isSmallScreen = useIsSmallScreen();
  const isPhone = useIsPhone();
  // Client-side architecture state
  const [allMacAddresses, setAllMacAddresses] = useState<MacAddress[]>([]); // Complete dataset
  const [filteredMacAddresses, setFilteredMacAddresses] = useState<MacAddress[]>([]); // Filtered results
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [inputValue, setInputValue] = useState(''); // Immediate input value
  const [searchTerm, setSearchTerm] = useState(''); // Debounced search term
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useLocalStorage<number | string>('mac-tracking-table-page-size', 50);
  const [sortBy, setSortBy] = useState('order');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [activeOnly, setActiveOnly] = useState(false); // Show all MACs (active and inactive) by default, consistent with modal
  const [searchHistory, setSearchHistory] = useLocalStorage<boolean>('mac-tracking-search-history-enabled', false);
  const [selectedMac, setSelectedMac] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Refs for debouncing and typing detection
  const isUserTyping = useRef<boolean>(false);
  const searchTermRef = useRef<string>(''); // Ref to track current search term
  const searchHistoryRef = useRef<boolean>(false); // Ref to track search history mode
  const suppressSpinnerRef = useRef<boolean>(false); // Ref to suppress spinner on certain refetches

  // Determine if we should use card view based on screen size
  // Use card view for mobile (< 1367px width or <= 750px height) or small screens (< 1024px width)
  const useCardView = useMemo(() => {
    return isMobile || isSmallScreen;
  }, [isMobile, isSmallScreen]);

  // Fetch all MAC addresses once (client-side architecture)
  // Note: searchTerm is NOT in dependency array - we do client-side filtering only
  const fetchAllMacAddresses = useCallback(async (inPlace: boolean = false) => {
    try {
      if (inPlace) {
        if (!suppressSpinnerRef.current) setIsRefreshing(true);
      } else {
        if (!suppressSpinnerRef.current) setIsLoading(true);
      }

      // Fetch ALL data without pagination - use high limit to get complete dataset
      const queryParams: Record<string, string> = {
        limit: '10000', // High limit to get all data
        sortBy: 'lastSeen', // Always fetch with lastSeen to get complete dataset, sort client-side
        sortDirection: 'desc',
        activeOnly: activeOnly.toString(),
      };

      if (searchHistoryRef.current) {
        queryParams.searchHistory = 'true';

        if (searchTermRef.current) {
          const term = searchTermRef.current.toLowerCase().trim();

          // Check for special keywords and map to API parameters
          if (term === 'dhcp' || term === 'dhcp:') {
            queryParams.dhcpOnly = 'true';
          } else if (term === 'dhcp-conflict' || term === 'dhcp-conflict:') {
            queryParams.dhcpConflictOnly = 'true';
          } else if (term === 'privacy' || term === 'privacy:') {
            queryParams.privacyOnly = 'true';
          } else if (term === 'active' || term === 'active:') {
            queryParams.activeOnly = 'true'; // Override the base activeOnly
          } else if (term === 'inactive' || term === 'inactive:') {
            queryParams.inactiveOnly = 'true';
          } else if (term === 'excluded' || term === 'excluded:') {
            queryParams.excludedOnly = 'true';
          } else if (term === 'not-excluded' || term === 'not-excluded:') {
            queryParams.notExcludedOnly = 'true';
          } else if (term === 'opnsense' || term === 'opnsense:') {
            queryParams.opnsenseOnly = 'true';
          } else if (term === 'multi-ip' || term === 'multi-ip:') {
            queryParams.multiIpOnly = 'true';
          } else if (term.startsWith('interface:') && term.length > 10) {
            queryParams.interface = searchTermRef.current.slice(10).trim();
          } else {
            // Regular search term
            queryParams.search = searchTermRef.current;
          }
        }
      }

      const params = new URLSearchParams(queryParams);

      const response = await fetch(`/api/admin/mac-tracking?${params}`);
      if (response.ok) {
        const data: MacAddressListResponse = await response.json();
        if (data.success) {
          setAllMacAddresses(data.data.macAddresses);
          // Client-side filtering and pagination will be handled by useEffect
        }
      }
    } catch (error) {
      console.error('Error fetching MAC addresses:', error);
      toast({
        title: "Error",
        description: 'Failed to fetch MAC addresses',
        variant: "destructive",
      });
    } finally {
      if (inPlace) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
      // Reset suppress flag after fetch completes
      suppressSpinnerRef.current = false;
    }
  }, [activeOnly, toast]);

  // Sync refs with state changes and handle history toggle
  useEffect(() => {
    // Check if history was just toggled
    const historyToggled = searchHistory !== searchHistoryRef.current;

    searchTermRef.current = searchTerm;
    searchHistoryRef.current = searchHistory;

    if (historyToggled) {
      if (searchHistory) {
        // Turned ON: Sync input and fetch
        if (inputValue !== searchTerm) {
          setSearchTerm(inputValue);
        } else {
          // If term matches, force a fetch since history mode changed
          fetchAllMacAddresses(true);
        }
      } else {
        // Turned OFF: Trigger silent refetch
        suppressSpinnerRef.current = true;
        fetchAllMacAddresses(true);
      }
    }
  }, [searchTerm, searchHistory, fetchAllMacAddresses, inputValue]);

  // Initial data load - fetch all data once
  useEffect(() => {
    if (allMacAddresses.length === 0) {
      fetchAllMacAddresses(false);
    }
  }, [fetchAllMacAddresses, allMacAddresses.length]);

  // Trigger fetch when search term changes IF search history is enabled
  const prevSearchTermRef = useRef<string>('');
  useEffect(() => {
    if (searchHistory && searchTerm && prevSearchTermRef.current !== searchTerm) {
      fetchAllMacAddresses(true);
    }
    prevSearchTermRef.current = searchTerm;
  }, [searchTerm, searchHistory, fetchAllMacAddresses]);

  // Debounce input value to search term with typing detection (same as modal)
  useEffect(() => {
    isUserTyping.current = true;

    const timer = setTimeout(() => {
      isUserTyping.current = false;

      // If search history is enabled, DO NOT auto-update searchTerm (manual trigger only)
      if (searchHistory) return;

      // Only update search term if input is empty, has 3+ characters, or is a special keyword
      if (inputValue.length === 0 ||
        inputValue.length >= 3 ||
        ['dhcp', 'dhcp:', 'dhcp-conflict', 'dhcp-conflict:', 'privacy', 'privacy:', 'opnsense', 'opnsense:', 'active', 'active:', 'inactive', 'inactive:', 'excluded', 'excluded:', 'not-excluded', 'not-excluded:'].some(keyword =>
          inputValue.toLowerCase().trim() === keyword
        ) ||
        inputValue.includes(':')) {
        setSearchTerm(inputValue);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [inputValue, searchHistory]);

  // Listen for exclusion updates from MacHistoryDialog
  useEffect(() => {
    const onExclusionUpdated: EventListener = () => {
      fetchAllMacAddresses(true); // Refresh with in-place loading
    };

    window.addEventListener('mac-tracking:exclusion-updated', onExclusionUpdated);
    return () => window.removeEventListener('mac-tracking:exclusion-updated', onExclusionUpdated);
  }, [fetchAllMacAddresses]);

  // Enhanced client-side sorting function
  const sortMacAddresses = useCallback((data: MacAddress[], sortBy: string, direction: 'asc' | 'desc') => {
    return [...data].sort((a, b) => {
      let aValue: unknown, bValue: unknown;

      switch (sortBy) {
        case 'order':
          // For chronological order, use lastSeen timestamp
          aValue = new Date(a.lastSeen).getTime();
          bValue = new Date(b.lastSeen).getTime();
          break;
        case 'macAddress':
          aValue = a.macAddress;
          bValue = b.macAddress;
          break;
        case 'deviceName':
          aValue = a.deviceName || '';
          bValue = b.deviceName || '';
          break;
        case 'vendor':
          aValue = a.vendor || '';
          bValue = b.vendor || '';
          break;
        case 'currentIp':
          aValue = a.currentIp || '';
          bValue = b.currentIp || '';
          break;
        case 'currentInterface':
          aValue = a.currentInterface || '';
          bValue = b.currentInterface || '';
          break;
        case 'lastSeen':
          aValue = new Date(a.lastSeen).getTime();
          bValue = new Date(b.lastSeen).getTime();
          break;
        case 'isActive':
          aValue = a.isActive;
          bValue = b.isActive;
          break;
        case 'historyCount':
          aValue = a.historyCount || 0;
          bValue = b.historyCount || 0;
          break;
        case 'exclusion':
          aValue = a.exclusion?.enabled ? 1 : 0;
          bValue = b.exclusion?.enabled ? 1 : 0;
          break;
        default:
          return 0;
      }

      // Handle comparison of unknown types
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        if (aValue < bValue) return direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      } else if (typeof aValue === 'number' && typeof bValue === 'number') {
        if (aValue < bValue) return direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      } else if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
        if (aValue < bValue) return direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      } else {
        // Fallback for other types - convert to string for comparison
        const aStr = String(aValue || '');
        const bStr = String(bValue || '');
        if (aStr < bStr) return direction === 'asc' ? -1 : 1;
        if (aStr > bStr) return direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, []);

  // Client-side sorting when sortBy or sortDirection changes
  // Note: searchTerm is NOT in dependency array to prevent refresh on search input changes
  // Search filtering is handled separately in the useMemo below
  // Note: currentPage is intentionally not in dependency array - we only check it to reset on sort change
  useEffect(() => {


    if (allMacAddresses.length === 0) {
      setFilteredMacAddresses([]);
      return;
    }

    // Apply sorting to the current data
    const sorted = sortMacAddresses(allMacAddresses, sortBy, sortDirection);

    // Update filtered data (search filtering happens in useMemo)
    setFilteredMacAddresses(sorted);

    // Reset to page 1 when sorting changes to maintain consistency
    if (currentPage !== 1) {

      setCurrentPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortDirection, allMacAddresses, sortMacAddresses]);

  // Helper to detect if search term looks like an IP search
  const looksLikeIpSearch = useCallback((term: string): boolean => {
    // Check if term contains digits and dots (IP pattern)
    return /\d/.test(term) && /\./.test(term);
  }, []);

  // Helper function to validate if a match is legitimate
  const isValidMatch = useCallback((text: string, searchTerm: string): boolean => {
    const lowerText = text.toLowerCase();
    const lowerTerm = searchTerm.toLowerCase();

    // If not searching for an IP pattern, use simple contains
    if (!looksLikeIpSearch(lowerTerm)) {
      return lowerText.includes(lowerTerm);
    }

    // For IP searches, check for proper boundaries
    // Match if:
    // 1. Exact match
    // 2. Term appears at start of IP (e.g., "192.168" matches "192.168.1.1")
    // 3. Term appears after a dot (e.g., "168.1" matches "192.168.1.1")
    // 4. Term appears before a dot (e.g., "192.168.1" matches "192.168.1.1")

    if (lowerText === lowerTerm) return true; // Exact match
    if (lowerText.startsWith(lowerTerm + '.')) return true; // Start boundary
    if (lowerText.includes('.' + lowerTerm + '.')) return true; // Middle boundary
    if (lowerText.endsWith('.' + lowerTerm)) return true; // End boundary

    return false;
  }, [looksLikeIpSearch]);

  // Helper function to apply search filter
  const applySearchFilter = useCallback((data: MacAddress[], term: string) => {
    if (!term.trim()) return data;

    const lowerSearchTerm = term.toLowerCase().trim();
    return data.filter(mac => {
      // Handle special keywords
      if (lowerSearchTerm === 'dhcp' || lowerSearchTerm === 'dhcp:') {
        return mac.isDhcpReserved;
      } else if (lowerSearchTerm === 'dhcp-conflict' || lowerSearchTerm === 'dhcp-conflict:') {
        return mac.hasDhcpConflict;
      } else if (lowerSearchTerm === 'privacy' || lowerSearchTerm === 'privacy:') {
        return mac.isPrivacyMac;
      } else if (lowerSearchTerm === 'active' || lowerSearchTerm === 'active:') {
        return mac.isActive;
      } else if (lowerSearchTerm === 'inactive' || lowerSearchTerm === 'inactive:') {
        return !mac.isActive;
      } else if (lowerSearchTerm === 'opnsense' || lowerSearchTerm === 'opnsense:') {
        return mac.isOpnsenseMac;
      } else if (lowerSearchTerm === 'multi-ip' || lowerSearchTerm === 'multi-ip:') {
        return mac.hasMultipleIps;
      } else if (lowerSearchTerm === 'excluded' || lowerSearchTerm === 'excluded:') {
        return mac.exclusion?.enabled;
      } else if (lowerSearchTerm === 'not-excluded' || lowerSearchTerm === 'not-excluded:') {
        return !mac.exclusion?.enabled;
      } else if (lowerSearchTerm.startsWith('interface:') && lowerSearchTerm.length > 10) {
        const interfaceName = term.slice(10).trim().toLowerCase();
        return mac.currentInterface && mac.currentInterface.toLowerCase().includes(interfaceName);
      } else if (term.endsWith(':') && term.length > 1) {
        const interfaceName = term.slice(0, -1).toLowerCase();
        return mac.currentInterface && mac.currentInterface.toLowerCase().includes(interfaceName);
      } else {
        // General search across multiple fields
        return mac.macAddress.toLowerCase().includes(lowerSearchTerm) ||
          (mac.deviceName && mac.deviceName.toLowerCase().includes(lowerSearchTerm)) ||
          (mac.vendor && mac.vendor.toLowerCase().includes(lowerSearchTerm)) ||
          (mac.currentIp && isValidMatch(mac.currentIp, lowerSearchTerm)) ||
          // Also search all IPs in currentIps array (for multi-IP MACs)
          (mac.currentIps && mac.currentIps.some(ip => isValidMatch(ip.ipAddress, lowerSearchTerm))) ||
          (mac.hostAlias && mac.hostAlias.toLowerCase().includes(lowerSearchTerm)) ||
          (mac.exclusion?.reason && mac.exclusion.reason.toLowerCase().includes(lowerSearchTerm));
      }
    });
  }, [isValidMatch]);

  // Only fetch from server when activeOnly changes
  useEffect(() => {
    if (allMacAddresses.length > 0) {
      fetchAllMacAddresses(true);
    }
  }, [activeOnly, fetchAllMacAddresses, allMacAddresses.length]);

  // Handle refresh trigger
  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchAllMacAddresses(true);
    }
  }, [refreshTrigger, fetchAllMacAddresses]);

  // Client-side search filtering - apply search term without triggering data refresh
  // This is separate from the main sorting effect to prevent spinner activation on search input changes
  const searchFilteredMacAddresses = useMemo(() => {
    // If search history is enabled, the data is already filtered by the server
    if (searchHistory) {
      return filteredMacAddresses;
    }

    if (!searchTerm.trim()) {

      return filteredMacAddresses;
    }
    const result = applySearchFilter(filteredMacAddresses, searchTerm);

    return result;
  }, [filteredMacAddresses, searchTerm, applySearchFilter, searchHistory]);

  // Calculate search-filtered count and pages for display
  const searchFilteredCount = useMemo(() => {
    return searchFilteredMacAddresses.length;
  }, [searchFilteredMacAddresses]);

  const searchFilteredPages = useMemo(() => {
    if (pageSize === 'ALL') {

      return 1;
    }
    const size = typeof pageSize === 'number' ? pageSize : 50;
    const pages = Math.ceil(searchFilteredCount / size);

    return pages;
  }, [searchFilteredCount, pageSize]);

  // Client-side pagination - update displayed addresses when filtered data or pagination changes
  const paginatedMacAddresses = useMemo(() => {
    if (pageSize === 'ALL') {

      return searchFilteredMacAddresses;
    }
    const size = typeof pageSize === 'number' ? pageSize : 50;

    // For phone view (Load More), we show everything from page 1 up to current page
    if (isPhone) {
      const startIndex = 0;
      const endIndex = currentPage * size;
      return searchFilteredMacAddresses.slice(startIndex, endIndex);
    }

    // Standard pagination for other views
    const startIndex = (currentPage - 1) * size;
    const endIndex = startIndex + size;
    const sliced = searchFilteredMacAddresses.slice(startIndex, endIndex);

    return sliced;
  }, [searchFilteredMacAddresses, currentPage, pageSize, isPhone]);


  const handleExport = async (format: 'csv' | 'json') => {
    try {
      // Use client-side search-filtered data for export
      const exportData = searchFilteredMacAddresses.map(mac => ({
        macAddress: mac.macAddress,
        deviceName: mac.deviceName || '',
        vendor: mac.vendor || '',
        currentIp: mac.currentIp || '',
        currentInterface: mac.currentInterface || '',
        hostAlias: mac.hostAlias || '',
        firstSeen: new Date(mac.firstSeen).toISOString(),
        lastSeen: new Date(mac.lastSeen).toISOString(),
        isActive: mac.isActive,
        isPrivacyMac: mac.isPrivacyMac,
        isOpnsenseMac: mac.isOpnsenseMac || false,
        isDhcpReserved: mac.isDhcpReserved || false,
        hasDhcpConflict: mac.hasDhcpConflict || false,
        isExcluded: mac.exclusion?.enabled || false,
        exclusionReason: mac.exclusion?.reason || '',
        excludedAt: mac.exclusion?.excludedAt ? new Date(mac.exclusion.excludedAt).toISOString() : '',
        excludedBy: mac.exclusion?.excludedBy || ''
      }));

      if (format === 'json') {
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mac-addresses.json';
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        // Generate CSV
        const headers = [
          'MAC Address', 'Device Name', 'Vendor', 'Current IP', 'Interface',
          'Host Alias', 'First Seen', 'Last Seen', 'Active', 'Privacy MAC',
          'OPNsense MAC', 'DHCP Reserved', 'DHCP Conflict', 'Excluded',
          'Exclusion Reason', 'Excluded At', 'Excluded By'
        ];

        const csvRows = [
          headers.join(','),
          ...exportData.map(row => [
            `"${row.macAddress}"`,
            `"${row.deviceName}"`,
            `"${row.vendor}"`,
            `"${row.currentIp}"`,
            `"${row.currentInterface}"`,
            `"${row.hostAlias}"`,
            `"${row.firstSeen}"`,
            `"${row.lastSeen}"`,
            `"${row.isActive}"`,
            `"${row.isPrivacyMac}"`,
            `"${row.isOpnsenseMac}"`,
            `"${row.isDhcpReserved}"`,
            `"${row.hasDhcpConflict}"`,
            `"${row.isExcluded}"`,
            `"${row.exclusionReason}"`,
            `"${row.excludedAt}"`,
            `"${row.excludedBy}"`
          ].join(','))
        ];

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mac-addresses.csv';
        a.click();
        window.URL.revokeObjectURL(url);
      }

      toast({
        title: "Export Successful",
        description: `${exportData.length} MAC addresses exported as ${format.toUpperCase()}`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: 'Failed to export MAC addresses',
        variant: "destructive",
      });
    }
  };

  // Handle page change
  const handlePageChange = (page: number) => {

    if (page >= 1 && page <= searchFilteredPages) {

      setCurrentPage(page);
    } else {

    }
  };

  // Handle page size change
  const handlePageSizeChange = (newPageSize: number | string) => {
    setPageSize(newPageSize);
    setCurrentPage(1);
  };




  // Helper to check if a result is a history match (not found in visible fields)
  const isHistoryMatch = (mac: MacAddress) => {
    if (!searchHistory || !searchTerm.trim()) return false;
    const term = searchTerm.toLowerCase();

    // Check if term matches any visible field with proper IP validation
    const visibleMatch =
      mac.macAddress.toLowerCase().includes(term) ||
      (mac.deviceName && mac.deviceName.toLowerCase().includes(term)) ||
      (mac.vendor && mac.vendor.toLowerCase().includes(term)) ||
      (mac.currentIps && mac.currentIps.some(ip =>
        isValidMatch(ip.ipAddress, term) ||
        (ip.hostAlias && ip.hostAlias.toLowerCase().includes(term))
      )) ||
      (mac.currentInterface && mac.currentInterface.toLowerCase().includes(term));

    return !visibleMatch;
  };


  return (
    <>
      <Card className="flex flex-col flex-1 mb-0 min-h-0">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                MAC Addresses ({searchFilteredCount})
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isRefreshing}
                  onClick={() => {
                    setRefreshTrigger(prev => prev + 1);
                    onRefresh?.();
                  }}
                  className="h-8 w-8 px-0"
                  title="Refresh"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsModalOpen(true)}
                  className="h-8 w-8 px-0"
                  title="Expand to full screen"
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
                {onOpenServiceControl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onOpenServiceControl}
                    className="h-8 w-8 px-0"
                    title="Service Control"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 px-0">
                      <MoreVertical className="h-4 w-4" />
                      <span className="sr-only">More options</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>View Options</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem
                      checked={activeOnly}
                      onCheckedChange={setActiveOnly}
                    >
                      <Filter className="mr-2 h-4 w-4" />
                      Active Only
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={searchHistory}
                      onCheckedChange={setSearchHistory}
                    >
                      <History className="mr-2 h-4 w-4" />
                      Search History
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Export</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => handleExport('csv')}>
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Export CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport('json')}>
                      <FileJson className="mr-2 h-4 w-4" />
                      Export JSON
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              {/* Search Field - Full width on mobile, flex-1 on desktop */}
              <div className="flex flex-1 w-full gap-2">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={useCardView ? "Search MAC, device, vendor, IP, or host alias..." : "Search MAC, device, vendor, IP, host alias, or use: dhcp:, privacy:, opnsense:, multi-ip:, active:, inactive:, dhcp-conflict:, excluded:, not-excluded:, interface:"}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && searchHistory) {
                        setSearchTerm(inputValue);
                      }
                    }}
                    className="pl-10 pr-20 w-full"
                  />
                  <div className="absolute right-1 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                    <ResponsiveHelp title="MAC Tracking Search Help" disableTooltip={true}>
                      <div className="space-y-3">
                        <div>
                          <h4 className="font-medium mb-2">General Search</h4>
                          <p className="text-sm text-muted-foreground">
                            Search across MAC addresses, device names, vendors, IP addresses, and host aliases.
                          </p>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">Special Keywords</h4>
                          <ul className="text-sm space-y-1">
                            <li><code className="bg-muted px-1 rounded">dhcp:</code> - Show DHCP reserved devices</li>
                            <li><code className="bg-muted px-1 rounded">dhcp-conflict:</code> - Show devices with DHCP conflicts</li>
                            <li><code className="bg-muted px-1 rounded">privacy:</code> - Show privacy MAC addresses</li>
                            <li><code className="bg-muted px-1 rounded">opnsense:</code> - Show OPNsense router/firewall MAC addresses</li>
                            <li><code className="bg-muted px-1 rounded">multi-ip:</code> - Show MACs with multiple active IPs</li>
                            <li><code className="bg-muted px-1 rounded">active:</code> - Show active devices only</li>
                            <li><code className="bg-muted px-1 rounded">inactive:</code> - Show inactive devices only</li>
                            <li><code className="bg-muted px-1 rounded">excluded:</code> - Show excluded MAC addresses</li>
                            <li><code className="bg-muted px-1 rounded">not-excluded:</code> - Show non-excluded MAC addresses</li>
                            <li><code className="bg-muted px-1 rounded">interface:&lt;name&gt;</code> - Filter by network interface</li>
                          </ul>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">Examples</h4>
                          <ul className="text-sm space-y-1">
                            <li>• <code className="bg-muted px-1 rounded">192.168.1</code> - Search by IP address</li>
                            <li>• <code className="bg-muted px-1 rounded">apple</code> - Search by vendor or device name</li>
                            <li>• <code className="bg-muted px-1 rounded">aa:bb:cc</code> - Search by MAC address</li>
                            <li>• <code className="bg-muted px-1 rounded">interface:lan</code> - Filter by LAN interface</li>
                          </ul>
                        </div>
                      </div>
                    </ResponsiveHelp>
                    {inputValue && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setInputValue('');
                          setSearchTerm('');
                        }}
                      >
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Manual Search Button for History Mode - Moved to Right */}
                {searchHistory && (
                  <Button
                    size="sm"
                    onClick={() => {
                      if (inputValue === searchTerm) {
                        fetchAllMacAddresses(true);
                      } else {
                        setSearchTerm(inputValue);
                      }
                    }}
                    disabled={isRefreshing}
                    className="whitespace-nowrap"
                  >
                    Search
                  </Button>
                )}
              </div>
            </div>


          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
          {isLoading && allMacAddresses.length === 0 ? (
            <div className="p-4 space-y-3">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : paginatedMacAddresses.length === 0 ? (
            <div className="text-muted-foreground text-center py-12">
              <p>No MAC addresses found.</p>
              {searchTerm && (
                <p className="text-sm mt-2">Try adjusting your search criteria or filters.</p>
              )}
            </div>
          ) : useCardView ? (
            // Card View: Mobile and Small Screens
            <div className="flex-1 border-t min-h-0 flex flex-col">
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                  {paginatedMacAddresses.map((mac: MacAddress) => (
                    <Card key={mac.id} className="transition-shadow hover:shadow-md">
                      <CardHeader className="pb-2">
                        <div className="flex flex-col gap-2">
                          <div className="min-w-0 flex-1">
                            <CardTitle className="text-lg font-mono break-all">
                              <HighlightedText text={mac.macAddress.toUpperCase()} highlight={searchTerm} />
                            </CardTitle>
                            {mac.deviceName && (
                              <CardDescription className="truncate">
                                <HighlightedText text={mac.deviceName} highlight={searchTerm} />
                              </CardDescription>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            {!(mac.exclusion?.enabled && mac.exclusion?.exclusionMode === 'FULL') && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant={mac.isActive ? 'success' : 'destructive'}
                                      className="text-xs cursor-help"
                                    >
                                      {mac.isActive ? 'Active' : 'Inactive'}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    {mac.isActive ? (
                                      <>
                                        <p className="text-xs leading-snug">Seen recently in ARP scans.</p>
                                        <p className="text-xs leading-snug">Exclusions do not affect Active.</p>
                                        <p className="text-xs leading-snug">Will become Inactive after the configured timeout.</p>
                                      </>
                                    ) : (
                                      <>
                                        <p className="text-xs leading-snug">Not seen within the inactivity window.</p>
                                        <p className="text-xs leading-snug">May still be excluded.</p>
                                      </>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {mac.hasDhcpConflict && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-xs cursor-help">
                                      DHCP
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="text-xs leading-snug">DHCP reservation mismatch detected.</p>
                                    <p className="text-xs leading-snug">IP reserved for a different MAC or MAC reserved for a different IP.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {mac.isDhcpReserved && !mac.hasDhcpConflict && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      className={
                                        mac.isPrivacyMac
                                          ? "bg-yellow-600 hover:bg-yellow-700 text-white text-xs cursor-help"
                                          : "bg-blue-500 hover:bg-blue-600 text-white text-xs cursor-help"
                                      }
                                    >
                                      DHCP
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="text-xs leading-snug">DHCP reservation exists for this MAC/IP.</p>
                                    {mac.isPrivacyMac && (
                                      <p className="text-xs leading-snug mt-1">Caution: Privacy MACs change over time; reservation may be unreliable.</p>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {mac.isPrivacyMac && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs cursor-help">
                                      Privacy
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="text-xs leading-snug">Locally administered (randomized) MAC.</p>
                                    <p className="text-xs leading-snug">Vendor lookup may be inaccurate.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {mac.isOpnsenseMac && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className="bg-purple-600 hover:bg-purple-700 text-white text-xs cursor-help">
                                      OPNsense
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="text-xs leading-snug">OPNsense router/firewall interface MAC.</p>
                                    <p className="text-xs leading-snug">May be shared across multiple interfaces.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {mac.hasMultipleIps && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs cursor-help">
                                      Multi-IP
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="text-xs leading-snug">MAC has multiple active IP addresses.</p>
                                    <p className="text-xs leading-snug">Common in keepalived or HA cluster configurations.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {mac.exclusion?.enabled && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    {mac.exclusion?.exclusionMode === 'PARTIAL' ? (
                                      <Badge className="bg-amber-600 hover:bg-amber-700 text-white text-xs cursor-help">
                                        Partial Tracking
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-gray-500 hover:bg-gray-600 text-white text-xs cursor-help">
                                        Excluded
                                      </Badge>
                                    )}
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    {mac.exclusion?.exclusionMode === 'FULL' ? (
                                      <>
                                        <p className="text-xs leading-snug">Tracking disabled.</p>
                                        <p className="text-xs leading-snug">IP associations and history are not recorded.</p>
                                        <p className="text-xs leading-snug">Active badge hidden; becomes Inactive after timeout.</p>
                                      </>
                                    ) : (
                                      <>
                                        <p className="text-xs leading-snug">IP associations tracked and visible.</p>
                                        <p className="text-xs leading-snug">History is disabled; counter hidden.</p>
                                      </>
                                    )}
                                    {mac.exclusion?.reason && (
                                      <p className="text-xs mt-1">Reason: {mac.exclusion.reason}</p>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="font-medium text-muted-foreground">Vendor:</span>
                            <p className="text-foreground break-words" title={mac.vendorSource ? `Source: ${mac.vendorSource === 'OPNsense' ? 'OPNsense ARP Table' : 'Local Vendor Database'}` : undefined}>
                              <HighlightedText text={mac.vendor || '-'} highlight={searchTerm} />
                            </p>
                          </div>
                          <div>
                            <span className="font-medium text-muted-foreground">Current IP:</span>
                            {mac.currentIps && mac.currentIps.length > 0 ? (
                              mac.currentIps.map((ip, idx) => (
                                <div key={idx}>
                                  <p className="text-foreground font-mono break-all">
                                    <HighlightedText text={ip.ipAddress} highlight={searchTerm} />
                                  </p>
                                  {ip.hostAlias && (
                                    <p className="text-xs text-muted-foreground break-words">
                                      <HighlightedText text={ip.hostAlias} highlight={searchTerm} />
                                    </p>
                                  )}
                                </div>
                              ))
                            ) : (
                              <p className="text-foreground font-mono break-all">-</p>
                            )}
                          </div>
                          <div>
                            <span className="font-medium text-muted-foreground">Interface:</span>
                            <p className="text-foreground">
                              {mac.currentIps && mac.currentIps.length > 1 ? (
                                // Multiple IPs: check if all have the same interface
                                (() => {
                                  const interfaces = mac.currentIps.map(ip => ip.networkInterface).filter(Boolean);
                                  const allSame = interfaces.length > 0 && interfaces.every(iface => iface === interfaces[0]);
                                  return allSame ? interfaces[0] : '-';
                                })()
                              ) : (
                                // Single IP or no IPs
                                mac.currentInterface || '-'
                              )}
                            </p>
                          </div>
                          <div>
                            <span className="font-medium text-muted-foreground">Last Seen:</span>
                            {mac.exclusion?.enabled ? (
                              <p className="text-foreground text-xs">-</p>
                            ) : (
                              <>
                                <p className="text-foreground text-xs">
                                  {new Date(mac.lastSeen).toLocaleString()}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {Math.round((Date.now() - new Date(mac.lastSeen).getTime()) / 60000)}min ago
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-end pt-2 border-t">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {

                              setSelectedMac(mac.macAddress);
                            }}
                            className="text-xs"
                          >
                            <span className="relative inline-flex h-4 w-4 mr-1 items-center justify-center">
                              {mac.exclusion?.enabled && mac.exclusion?.exclusionMode === 'PARTIAL' ? (
                                <Network className="h-4 w-4" />
                              ) : (
                                <>
                                  <History className={`h-4 w-4 ${isHistoryMatch(mac) ? 'text-amber-600 dark:text-amber-400 fill-amber-100 dark:fill-amber-900/30' : ''}`} />
                                  {mac.exclusion?.enabled && mac.exclusion?.exclusionMode === 'FULL' && (
                                    <Slash className="absolute h-4 w-4 text-muted-foreground pointer-events-none" />
                                  )}
                                </>
                              )}
                            </span>
                            {mac.exclusion?.enabled && mac.exclusion?.exclusionMode === 'PARTIAL' ? (
                              <>
                                IPs
                                {mac.currentIpsCount !== undefined && (
                                  <span className="ml-1">({mac.currentIpsCount})</span>
                                )}
                              </>
                            ) : (
                              <>
                                View History
                                {!(mac.exclusion?.enabled && (mac.exclusion?.exclusionMode === 'FULL' || mac.exclusion?.exclusionMode === 'PARTIAL')) && mac.historyCount !== undefined && (
                                  <span className="ml-1">({mac.historyCount})</span>
                                )}
                              </>
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : (
            // Table View: Desktop and Large Screens
            <div className="flex-1 border-t min-h-0 flex flex-col">
              <ScrollArea className="flex-1">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead
                        className="cursor-pointer hover:text-foreground"
                        onClick={() => {
                          setSortBy('order');
                          setSortDirection(sortBy === 'order' ? (sortDirection === 'desc' ? 'asc' : 'desc') : 'desc');
                        }}
                      >
                        <div className="flex items-center">
                          Order {sortBy === 'order' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground"
                        onClick={() => {
                          setSortBy('macAddress');
                          setSortDirection(sortBy === 'macAddress' ? (sortDirection === 'desc' ? 'asc' : 'desc') : sortDirection);
                        }}
                      >
                        <div className="flex items-center">
                          MAC Address {sortBy === 'macAddress' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground"
                        onClick={() => {
                          setSortBy('deviceName');
                          setSortDirection(sortBy === 'deviceName' ? (sortDirection === 'desc' ? 'asc' : 'desc') : sortDirection);
                        }}
                      >
                        <div className="flex items-center">
                          Device Name {sortBy === 'deviceName' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground"
                        onClick={() => {
                          setSortBy('vendor');
                          setSortDirection(sortBy === 'vendor' ? (sortDirection === 'desc' ? 'asc' : 'desc') : sortDirection);
                        }}
                      >
                        <div className="flex items-center">
                          Vendor {sortBy === 'vendor' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground"
                        onClick={() => {
                          setSortBy('currentIp');
                          setSortDirection(sortBy === 'currentIp' ? (sortDirection === 'desc' ? 'asc' : 'desc') : sortDirection);
                        }}
                      >
                        <div className="flex items-center">
                          Current IP {sortBy === 'currentIp' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground"
                        onClick={() => {
                          setSortBy('currentInterface');
                          setSortDirection(sortBy === 'currentInterface' ? (sortDirection === 'desc' ? 'asc' : 'desc') : sortDirection);
                        }}
                      >
                        <div className="flex items-center">
                          Interface {sortBy === 'currentInterface' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground"
                        onClick={() => {
                          setSortBy('lastSeen');
                          setSortDirection(sortBy === 'lastSeen' ? (sortDirection === 'desc' ? 'asc' : 'desc') : sortDirection);
                        }}
                      >
                        <div className="flex items-center">
                          Last Seen {sortBy === 'lastSeen' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground"
                        onClick={() => {
                          setSortBy('isActive');
                          setSortDirection(sortBy === 'isActive' ? (sortDirection === 'desc' ? 'asc' : 'desc') : sortDirection);
                        }}
                      >
                        <div className="flex items-center">
                          Status {sortBy === 'isActive' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground"
                        onClick={() => {
                          setSortBy('historyCount');
                          setSortDirection(sortBy === 'historyCount' ? (sortDirection === 'desc' ? 'asc' : 'desc') : sortDirection);
                        }}
                      >
                        <div className="flex items-center">
                          History {sortBy === 'historyCount' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground"
                        onClick={() => {
                          setSortBy('exclusion');
                          setSortDirection(sortBy === 'exclusion' ? (sortDirection === 'desc' ? 'asc' : 'desc') : 'desc');
                        }}
                      >
                        <div className="flex items-center">
                          Exclusion {sortBy === 'exclusion' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedMacAddresses.map((mac, index) => (
                      <TableRow key={mac.id}>
                        <TableCell className="text-sm">
                          {((currentPage - 1) * (typeof pageSize === 'number' ? pageSize : 50)) + index + 1}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          <HighlightedText text={mac.macAddress.toUpperCase()} highlight={searchTerm} />
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          <HighlightedText text={mac.deviceName || '-'} highlight={searchTerm} />
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="truncate cursor-help">
                                  <HighlightedText text={mac.vendor || 'Unknown Vendor'} highlight={searchTerm} />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="text-xs">
                                  <p className="font-medium">{mac.vendor || 'Unknown Vendor'}</p>
                                  {mac.vendorSource && (
                                    <p className="text-muted-foreground mt-1">
                                      Source: {mac.vendorSource === 'OPNsense' ? 'OPNsense ARP Table' : 'Local Vendor Database'}
                                    </p>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          <div>
                            {mac.currentIps && mac.currentIps.length > 0 ? (
                              mac.currentIps.map((ip, idx) => (
                                <div key={idx}>
                                  <div className="font-mono text-sm">
                                    <HighlightedText text={ip.ipAddress} highlight={searchTerm} />
                                  </div>
                                  {ip.hostAlias && (
                                    <div className="text-xs text-muted-foreground">
                                      <HighlightedText text={ip.hostAlias} highlight={searchTerm} />
                                    </div>
                                  )}
                                </div>
                              ))
                            ) : (
                              <div className="font-mono text-sm">-</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {mac.currentIps && mac.currentIps.length > 1 ? (
                            // Multiple IPs: check if all have the same interface
                            (() => {
                              const interfaces = mac.currentIps.map(ip => ip.networkInterface).filter(Boolean);
                              const allSame = interfaces.length > 0 && interfaces.every(iface => iface === interfaces[0]);
                              return allSame ? interfaces[0] : '-';
                            })()
                          ) : (
                            // Single IP or no IPs
                            mac.currentInterface || '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {mac.exclusion?.enabled ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            <div>
                              <div className="text-sm">{new Date(mac.lastSeen).toLocaleString()}</div>
                              <div className="text-xs text-muted-foreground">
                                {Math.round((Date.now() - new Date(mac.lastSeen).getTime()) / 60000)}min ago
                              </div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-0.5">
                            {!(mac.exclusion?.enabled && mac.exclusion?.exclusionMode === 'FULL') && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant={mac.isActive ? 'success' : 'destructive'}
                                      className="cursor-help text-xs"
                                    >
                                      {mac.isActive ? 'Active' : 'Inactive'}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    {mac.isActive ? (
                                      <>
                                        <p className="text-xs leading-snug">Seen recently in ARP scans.</p>
                                        <p className="text-xs leading-snug">Exclusions do not affect Active.</p>
                                        <p className="text-xs leading-snug">Will become Inactive after the configured timeout.</p>
                                      </>
                                    ) : (
                                      <>
                                        <p className="text-xs leading-snug">Not seen within the inactivity window.</p>
                                        <p className="text-xs leading-snug">May still be excluded.</p>
                                      </>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}

                            {mac.hasDhcpConflict && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-xs cursor-help">
                                      DHCP
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="text-xs leading-snug">DHCP reservation mismatch detected.</p>
                                    <p className="text-xs leading-snug">IP reserved for a different MAC or MAC reserved for a different IP.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {mac.isDhcpReserved && !mac.hasDhcpConflict && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      className={
                                        mac.isPrivacyMac
                                          ? "bg-yellow-600 hover:bg-yellow-700 text-white text-xs cursor-help"
                                          : "bg-blue-500 hover:bg-blue-600 text-white text-xs cursor-help"
                                      }
                                    >
                                      DHCP
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="text-xs leading-snug">DHCP reservation exists for this MAC/IP.</p>
                                    {mac.isPrivacyMac && (
                                      <p className="text-xs leading-snug mt-1">Caution: Privacy MACs change over time; reservation may be unreliable.</p>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {mac.isPrivacyMac && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs cursor-help">
                                      Privacy
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="text-xs leading-snug">Locally administered (randomized) MAC.</p>
                                    <p className="text-xs leading-snug">Vendor lookup may be inaccurate.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {mac.isOpnsenseMac && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className="bg-purple-600 hover:bg-purple-700 text-white text-xs cursor-help">
                                      OPNsense
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="text-xs leading-snug">OPNsense router/firewall interface MAC.</p>
                                    <p className="text-xs leading-snug">May be shared across multiple interfaces.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {mac.hasMultipleIps && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs cursor-help">
                                      Multi-IP
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="text-xs leading-snug">MAC has multiple active IP addresses.</p>
                                    <p className="text-xs leading-snug">Common in keepalived or HA cluster configurations.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {mac.exclusion?.enabled && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    {mac.exclusion?.exclusionMode === 'PARTIAL' ? (
                                      <Badge className="bg-amber-600 hover:bg-amber-700 text-white text-xs cursor-help">Partial Tracking</Badge>
                                    ) : (
                                      <Badge className="bg-gray-500 hover:bg-gray-600 text-white text-xs cursor-help">Excluded</Badge>
                                    )}
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    {mac.exclusion?.exclusionMode === 'FULL' ? (
                                      <>
                                        <p className="text-xs leading-snug">Tracking disabled.</p>
                                        <p className="text-xs leading-snug">IP associations and history are not recorded.</p>
                                        <p className="text-xs leading-snug">Active badge hidden; becomes Inactive after timeout.</p>
                                      </>
                                    ) : (
                                      <>
                                        <p className="text-xs leading-snug">IP associations tracked and visible.</p>
                                        <p className="text-xs leading-snug">History is disabled; counter hidden.</p>
                                      </>
                                    )}
                                    {mac.exclusion?.reason && (
                                      <p className="text-xs mt-1">Reason: {mac.exclusion.reason}</p>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {

                              setSelectedMac(mac.macAddress);
                            }}
                            className="flex items-center gap-1"
                          >
                            <span className="relative inline-flex items-center justify-center h-4 w-4">
                              {mac.exclusion?.enabled && mac.exclusion?.exclusionMode === 'PARTIAL' ? (
                                <Network className="h-4 w-4" />
                              ) : (
                                <>
                                  <History className={`h-4 w-4 ${isHistoryMatch(mac) ? 'text-amber-600 dark:text-amber-400 fill-amber-100 dark:fill-amber-900/30' : ''}`} />
                                  {mac.exclusion?.enabled && mac.exclusion?.exclusionMode === 'FULL' && (
                                    <Slash className="absolute h-4 w-4 text-muted-foreground pointer-events-none" />
                                  )}
                                </>
                              )}
                            </span>
                            <span className="text-xs">
                              {mac.exclusion?.enabled && mac.exclusion?.exclusionMode === 'PARTIAL' && mac.currentIpsCount !== undefined ? (
                                `IPs (${mac.currentIpsCount})`
                              ) : !(mac.exclusion?.enabled && (mac.exclusion?.exclusionMode === 'FULL' || mac.exclusion?.exclusionMode === 'PARTIAL')) && mac.historyCount !== undefined ? (
                                `(${mac.historyCount})`
                              ) : (
                                ''
                              )}
                            </span>
                          </Button>
                        </TableCell>
                        <TableCell>
                          {mac.exclusion?.enabled ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-muted-foreground text-xs cursor-help">
                                    {mac.exclusion?.exclusionMode === 'PARTIAL' ? 'Partial Tracking' : 'Excluded'}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  {mac.exclusion?.exclusionMode === 'FULL' ? (
                                    <>
                                      <p className="text-xs leading-snug">Tracking disabled.</p>
                                      <p className="text-xs leading-snug">IP associations and history are not recorded.</p>
                                    </>
                                  ) : (
                                    <>
                                      <p className="text-xs leading-snug">IP associations tracked and visible.</p>
                                      <p className="text-xs leading-snug">History is disabled; counter hidden.</p>
                                    </>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-muted-foreground text-xs cursor-help">-</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>No Exclusions</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}

          {/* Pagination Controls - Bottom */}
          {!isLoading && paginatedMacAddresses.length > 0 && (
            <div className="border-t px-4 py-3 bg-muted/20">
              <PaginationControls
                currentPage={currentPage}
                totalPages={searchFilteredPages}
                totalCount={searchFilteredCount}
                filteredCount={searchFilteredCount}
                pageSize={pageSize as number | 'ALL'}
                onPageChange={async (page) => {
                  setIsRefreshing(true);
                  await new Promise(resolve => setTimeout(resolve, 500));
                  handlePageChange(page);
                  setIsRefreshing(false);
                }}
                onPageSizeChange={handlePageSizeChange}
                isLoading={isRefreshing}
                isLoadMoreMode={isPhone}
                pageSizeOptions={[5, 10, 50, 100, 500]}
                showAllOption={true}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {selectedMac && (
        <MacHistoryDialog
          macAddress={selectedMac}
          open={!!selectedMac}
          onOpenChange={(open) => {

            if (!open) {
              setSelectedMac(null);
            }
          }}
        />
      )
      }

      <MacTrackingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onRefresh={onRefresh}
        initialSortBy={sortBy}
        initialSortDirection={sortDirection}
        onOpenServiceControl={onOpenServiceControl}
      />
    </>
  );
}
