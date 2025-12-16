'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';


import {
  Search,
  History,
  RefreshCw,
  Minimize2,
  Loader2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  XCircle,
  Slash,
  Network,
  Settings,
  MoreVertical,
  FileJson,
  FileSpreadsheet,
  Filter
} from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { useIsPhone } from '@/hooks/use-mobile';

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


interface MacTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
  initialSortBy?: string;
  initialSortDirection?: 'asc' | 'desc';
  onOpenServiceControl?: () => void;
}

export function MacTrackingModal({ isOpen, onClose, onRefresh, initialSortBy, initialSortDirection, onOpenServiceControl }: MacTrackingModalProps) {
  const { toast } = useToast();

  // Client-side architecture state
  const [allMacAddresses, setAllMacAddresses] = useState<MacAddress[]>([]); // Complete dataset
  const [filteredMacAddresses, setFilteredMacAddresses] = useState<MacAddress[]>([]); // Filtered results
  const [displayedMacAddresses, setDisplayedMacAddresses] = useState<MacAddress[]>([]); // Paginated results
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // UI control state - memoized to prevent unnecessary re-renders
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isButtonRefreshing, setIsButtonRefreshing] = useState(false);
  const [inputValue, setInputValue] = useState(''); // Immediate input value
  const [searchTerm, setSearchTerm] = useState(''); // Debounced search term
  const [sortColumn, setSortColumn] = useState<keyof MacAddress | null>((initialSortBy as keyof MacAddress) || 'lastSeen');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(initialSortDirection || 'desc');
  const [activeOnly, setActiveOnly] = useState(false);
  const [searchHistory, setSearchHistory] = useLocalStorage<boolean>('mac-tracking-search-history-enabled', false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useLocalStorage<number | string>('mac-tracking-table-page-size', 50);
  const isPhone = useIsPhone();

  // History dialog state
  const [selectedMacAddress, setSelectedMacAddress] = useState<string | null>(null);

  // Focus management
  const lastFetchTime = useRef<number>(0);
  const isUserTyping = useRef<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isInputFocused = useRef<boolean>(false);
  const lastInputValue = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchHistoryRef = useRef<boolean>(false);

  // Create refs to hold current values without causing re-renders
  const currentValuesRef = useRef({
    searchTerm,
    sortColumn,
    sortDirection,
    activeOnly,
    searchHistory,
    currentPage,
    pageSize
  });

  // Update refs when values change
  useEffect(() => {
    currentValuesRef.current = {
      searchTerm,
      sortColumn,
      sortDirection,
      activeOnly,
      searchHistory,
      currentPage,
      pageSize
    };
  }, [searchTerm, sortColumn, sortDirection, activeOnly, searchHistory, currentPage, pageSize]);

  // Fetch all MAC addresses once (client-side architecture)
  const fetchAllMacAddresses = useCallback(async (silent = false, isRefresh = false) => {
    const fetchStartTime = Date.now();
    lastFetchTime.current = fetchStartTime;

    // Abort any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Only set loading to true for initial load, not for refresh
    if (!silent && !isRefresh) {
      setIsLoading(true);
    } else if (isRefresh) {
      setIsRefreshing(true);
    }

    try {
      // Get current values from ref to avoid dependencies
      const {
        sortDirection: currentSortDirection,
        activeOnly: currentActiveOnly,
        searchHistory: currentSearchHistory
      } = currentValuesRef.current;

      // Fetch ALL data without pagination - use high limit to get complete dataset
      const params = new URLSearchParams({
        limit: '10000', // High limit to get all data
        sortBy: 'lastSeen', // Always fetch with lastSeen to get complete dataset, sort client-side
        sortDirection: currentSortDirection,
        ...(currentActiveOnly && { activeOnly: 'true' }),
        ...(currentSearchHistory && { searchHistory: 'true' }),
        ...(currentSearchHistory && currentValuesRef.current.searchTerm ? { search: currentValuesRef.current.searchTerm } : {})
      });

      // Add exclusion filters if needed
      const {
        searchTerm: currentSearchTerm
      } = currentValuesRef.current;

      if (currentSearchTerm) {
        const lowerSearchTerm = currentSearchTerm.toLowerCase().trim();
        if (lowerSearchTerm === 'excluded' || lowerSearchTerm === 'excluded:') {
          params.append('excludedOnly', 'true');
        } else if (lowerSearchTerm === 'not-excluded' || lowerSearchTerm === 'not-excluded:') {
          params.append('notExcludedOnly', 'true');
        }
      }

      const url = `/api/admin/mac-tracking?${params}${isRefresh ? `&ts=${Date.now()}` : ''}`;
      const response = await fetch(url, {
        cache: 'no-store',
        signal: abortController.signal
      });

      if (response.ok) {
        const data: MacAddressListResponse = await response.json();

        // Only update state if this is the most recent fetch
        if (lastFetchTime.current === fetchStartTime && data.success) {
          setAllMacAddresses(data.data.macAddresses || []);
          // Client-side filtering and pagination will be handled by useEffect
        }
      } else {
        // Reset to empty state on error
        if (lastFetchTime.current === fetchStartTime) {
          setAllMacAddresses([]);
        }
      }
    } catch (error) {
      // Ignore abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      // Only show error if this is the most recent fetch
      if (lastFetchTime.current === fetchStartTime) {
        console.error('Error fetching MAC addresses:', error);
        toast({
          title: 'Error',
          description: 'Failed to fetch MAC addresses',
          variant: 'destructive',
        });
      }
    } finally {
      // Always reset loading states, even if this isn't the most recent fetch
      // This prevents stuck spinners when modal closes or new fetch starts
      if (!silent && !isRefresh) {
        setIsLoading(false);
      } else if (isRefresh) {
        setIsRefreshing(false);
        // Only update refresh key if this is the most recent fetch

      }
    }
  }, [toast]); // Only depend on stable toast function

  // Debounce input value to search term with typing detection
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
      isUserTyping.current = false;
    };
  }, [inputValue, searchHistory]);

  // Initial data load when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchAllMacAddresses(false);
    }
  }, [isOpen, fetchAllMacAddresses]);

  // Listen for exclusion updates from MacHistoryDialog
  useEffect(() => {
    const onExclusionUpdated: EventListener = () => {
      fetchAllMacAddresses(true); // Refresh with in-place loading
    };

    window.addEventListener('mac-tracking:exclusion-updated', onExclusionUpdated);
    return () => window.removeEventListener('mac-tracking:exclusion-updated', onExclusionUpdated);
  }, [fetchAllMacAddresses]);

  // Refresh data when activeOnly changes (not when sorting changes - we handle client-side sorting)
  // Use a ref to track if this is the initial mount to avoid double-fetching on modal open
  const isInitialMount = useRef(true);
  useEffect(() => {
    // Skip on initial mount - the initial load effect handles the first fetch
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (isOpen && allMacAddresses.length > 0) {
      fetchAllMacAddresses(true);
    }
  }, [activeOnly, searchHistory, isOpen, fetchAllMacAddresses, allMacAddresses.length]);

  // Handle search history toggle - sync input value
  useEffect(() => {
    const historyToggled = searchHistory !== searchHistoryRef.current;
    searchHistoryRef.current = searchHistory;

    if (isOpen && historyToggled && searchHistory) {
      if (inputValue !== searchTerm) {
        setSearchTerm(inputValue);
      }
    }
  }, [searchHistory, isOpen, inputValue, searchTerm]);

  // Trigger fetch when search term changes IF search history is enabled
  useEffect(() => {
    if (isOpen && searchHistory) {
      fetchAllMacAddresses(true, true);
    }
  }, [searchTerm, searchHistory, isOpen, fetchAllMacAddresses]);

  // Reset the initial mount flag when modal closes
  useEffect(() => {
    if (!isOpen) {
      isInitialMount.current = true;
    }
  }, [isOpen]);

  // Enhanced client-side sorting function
  const sortMacAddresses = useCallback((data: MacAddress[], column: keyof MacAddress | string, direction: 'asc' | 'desc') => {
    return [...data].sort((a, b) => {
      let aValue: unknown, bValue: unknown;

      switch (column) {
        case 'order':
        case 'lastSeen':
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

  // Client-side sorting when sortColumn or sortDirection changes
  // Note: pageSize and currentPage are intentionally not in dependency array
  // pageSize shouldn't trigger a re-sort, and currentPage is only checked to reset on sort change
  useEffect(() => {
    if (sortColumn) {


      if (allMacAddresses.length === 0) {
        setFilteredMacAddresses([]);
        setTotalCount(0);
        setTotalPages(1);
        return;
      }

      // Apply sorting to the current data
      const sorted = sortMacAddresses(allMacAddresses, sortColumn, sortDirection);

      // Apply search filter if any (only if NOT searching history, as server handles that)
      const filtered = (searchTerm.trim() && !searchHistory)
        ? applySearchFilter(sorted, searchTerm)
        : sorted;

      // Update filtered data
      setFilteredMacAddresses(filtered);
      setTotalCount(filtered.length);
      const newTotalPages = pageSize === 'ALL' ? 1 : Math.ceil(filtered.length / (pageSize as number));
      setTotalPages(newTotalPages);


      // Reset to page 1 when sorting changes to maintain consistency
      if (currentPage !== 1) {

        setCurrentPage(1);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortColumn, sortDirection, allMacAddresses, searchTerm, sortMacAddresses]);

  // Helper function to apply search filter
  const applySearchFilter = (data: MacAddress[], term: string) => {
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
      } else if (lowerSearchTerm === 'opnsense' || lowerSearchTerm === 'opnsense:') {
        return mac.isOpnsenseMac;
      } else if (lowerSearchTerm === 'multi-ip' || lowerSearchTerm === 'multi-ip:') {
        return mac.hasMultipleIps;
      } else if (lowerSearchTerm === 'active' || lowerSearchTerm === 'active:') {
        return mac.isActive;
      } else if (lowerSearchTerm === 'inactive' || lowerSearchTerm === 'inactive:') {
        return !mac.isActive;
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
  };

  // Client-side pagination - update displayed addresses when filtered data or pagination changes
  useEffect(() => {
    if (pageSize === 'ALL') {
      setDisplayedMacAddresses(filteredMacAddresses);
      return;
    }

    if (isPhone) {
      setDisplayedMacAddresses(filteredMacAddresses.slice(0, currentPage * (typeof pageSize === 'number' ? pageSize : 10000)));
      return;
    }

    const startIndex = (currentPage - 1) * (pageSize as number);
    const endIndex = startIndex + (pageSize as number);
    const paginated = filteredMacAddresses.slice(startIndex, endIndex);

    setDisplayedMacAddresses(paginated);
  }, [filteredMacAddresses, currentPage, pageSize, isPhone]);

  // Reset search when modal closes
  useEffect(() => {
    if (!isOpen) {
      // Abort any in-flight requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // Reset search when modal closes to prevent focus issues
      setInputValue('');
      setSearchTerm('');
      isUserTyping.current = false;
      // Reset loading states to prevent spinner from getting stuck
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isOpen]);

  // Stable input change handler with focus preservation
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    isUserTyping.current = true;
    isInputFocused.current = true;
    lastInputValue.current = value;
    setInputValue(value);
  }, []);

  // Input focus handlers
  const handleInputFocus = useCallback(() => {
    isInputFocused.current = true;
  }, []);

  const handleInputBlur = useCallback(() => {
    isInputFocused.current = false;
  }, []);

  // Removed unused handlers to fix linting warnings

  const handleSort = useCallback((column: keyof MacAddress | string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column as keyof MacAddress);
      setSortDirection('desc');
    }
  }, [sortColumn, sortDirection]);

  // Handle page changes with validation
  const handlePageChange = useCallback((page: number) => {

    if (page >= 1 && page <= totalPages) {

      setCurrentPage(page);
    } else {

    }
  }, [totalPages]);

  // Helper to detect if search term looks like an IP search
  const looksLikeIpSearch = (term: string): boolean => {
    // Check if term contains digits and dots (IP pattern)
    return /\d/.test(term) && /\./.test(term);
  };

  // Helper function to validate if a match is legitimate
  const isValidMatch = (text: string, searchTerm: string): boolean => {
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

  const handleViewHistory = useCallback((macAddress: string) => {

    setSelectedMacAddress(macAddress);
  }, []);

  const handleExport = useCallback(async (format: 'csv' | 'json') => {
    try {
      // Process search term for special keywords (same as fetchMacAddresses)
      let processedSearchTerm = searchTerm;
      const specialFilters: Record<string, string> = {};

      if (searchTerm) {
        const lowerSearchTerm = searchTerm.toLowerCase().trim();

        // Check for special keywords (with or without colon)
        if (lowerSearchTerm === 'dhcp' || lowerSearchTerm === 'dhcp:') {
          specialFilters.dhcpOnly = 'true';
          processedSearchTerm = '';
        } else if (lowerSearchTerm === 'dhcp-conflict' || lowerSearchTerm === 'dhcp-conflict:') {
          specialFilters.dhcpConflictOnly = 'true';
          processedSearchTerm = '';
        } else if (lowerSearchTerm === 'privacy' || lowerSearchTerm === 'privacy:') {
          specialFilters.privacyOnly = 'true';
          processedSearchTerm = '';
        } else if (lowerSearchTerm === 'opnsense' || lowerSearchTerm === 'opnsense:') {
          specialFilters.opnsenseOnly = 'true';
          processedSearchTerm = '';
        } else if (lowerSearchTerm === 'active' || lowerSearchTerm === 'active:') {
          specialFilters.activeOnly = 'true';
          processedSearchTerm = '';
        } else if (lowerSearchTerm === 'inactive' || lowerSearchTerm === 'inactive:') {
          specialFilters.inactiveOnly = 'true';
          processedSearchTerm = '';
        } else if (lowerSearchTerm === 'excluded' || lowerSearchTerm === 'excluded:') {
          specialFilters.excludedOnly = 'true';
          processedSearchTerm = '';
        } else if (lowerSearchTerm === 'not-excluded' || lowerSearchTerm === 'not-excluded:') {
          specialFilters.notExcludedOnly = 'true';
          processedSearchTerm = '';
        } else if (lowerSearchTerm.startsWith('interface:') && lowerSearchTerm.length > 10) {
          const interfaceName = searchTerm.slice(10).trim();
          if (interfaceName) {
            specialFilters.interface = interfaceName;
            processedSearchTerm = '';
          }
        } else if (searchTerm.endsWith(':') && searchTerm.length > 1) {
          const interfaceName = searchTerm.slice(0, -1);
          specialFilters.interface = interfaceName;
          processedSearchTerm = '';
        }
      }

      const params = new URLSearchParams({
        format,
        ...(processedSearchTerm && { search: processedSearchTerm }),
        ...(activeOnly && { activeOnly: 'true' }),
        ...specialFilters
      });

      const response = await fetch(`/api/admin/mac-tracking/export?${params}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `mac-addresses.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        toast({
          title: 'Success',
          description: `MAC addresses exported as ${format.toUpperCase()}`,
        });
      } else {
        throw new Error('Export failed');
      }
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: 'Error',
        description: 'Failed to export MAC addresses',
        variant: 'destructive',
      });
    }
  }, [searchTerm, activeOnly, toast]);

  // Render sort icon
  const renderSortIcon = (column: keyof MacAddress | string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="ml-1 h-3 w-3" />;
    }
    return sortDirection === 'asc' ?
      <ArrowUp className="ml-1 h-3 w-3" /> :
      <ArrowDown className="ml-1 h-3 w-3" />;
  };

  // No focus management effect needed - let React handle it naturally

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-[95vw] h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <DialogTitle className="text-2xl">MAC Addresses ({totalCount})</DialogTitle>
                <DialogDescription>
                  View and manage MAC address tracking data.
                </DialogDescription>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isRefreshing}
                  onClick={() => {
                    if (onRefresh) onRefresh();
                    fetchAllMacAddresses(true, true);
                  }}
                  className="h-8 w-8 px-0"
                  title="Refresh"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="h-8 w-8 px-0"
                  title="Minimize"
                >
                  <Minimize2 className="h-4 w-4" />
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
          </DialogHeader>

          {/* Search and Filter Controls */}
          <div className="flex flex-col gap-3 mb-4">
            {/* Search Field Row */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex flex-1 w-full gap-2">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    placeholder="Search MAC, device, vendor, IP, host alias, or use: dhcp, privacy, opnsense, multi-ip, active, inactive, dhcp-conflict, excluded, not-excluded, interface:..."
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && searchHistory) {
                        setSearchTerm(inputValue);
                      }
                    }}
                    className="pl-8 pr-20"
                    disabled={isLoading}
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
                            <li><code className="bg-muted px-1 rounded">opnsense:</code> - Show OPNsense router/firewall MACs</li>
                            <li><code className="bg-muted px-1 rounded">privacy:</code> - Show privacy MAC addresses</li>
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
                          setInputValue("");
                          setSearchTerm("");
                        }}
                      >
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Manual Search Button for History Mode */}
                {searchHistory && (
                  <Button
                    size="sm"
                    onClick={() => {
                      if (inputValue === searchTerm) {
                        fetchAllMacAddresses(true, true);
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

          {/* Content Area with proper scrolling */}
          <div className="flex-grow overflow-hidden">
            {isLoading && allMacAddresses.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Loading MAC addresses...</p>
                </div>
              </div>
            ) : displayedMacAddresses.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">No MAC addresses found.</p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <ScrollArea className="hidden md:block h-full w-full">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="cursor-pointer hover:text-foreground" onClick={() => handleSort('lastSeen' as keyof MacAddress)}>
                          <div className="flex items-center">
                            Order {renderSortIcon('lastSeen')}
                          </div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:text-foreground" onClick={() => handleSort('macAddress' as keyof MacAddress)}>
                          <div className="flex items-center">
                            MAC Address {renderSortIcon('macAddress')}
                          </div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:text-foreground" onClick={() => handleSort('deviceName' as keyof MacAddress)}>
                          <div className="flex items-center">
                            Device Name {renderSortIcon('deviceName')}
                          </div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:text-foreground" onClick={() => handleSort('vendor' as keyof MacAddress)}>
                          <div className="flex items-center">
                            Vendor {renderSortIcon('vendor')}
                          </div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:text-foreground" onClick={() => handleSort('currentIp' as keyof MacAddress)}>
                          <div className="flex items-center">
                            Current IP {renderSortIcon('currentIp')}
                          </div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:text-foreground" onClick={() => handleSort('currentInterface' as keyof MacAddress)}>
                          <div className="flex items-center">
                            Interface {renderSortIcon('currentInterface')}
                          </div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:text-foreground" onClick={() => handleSort('lastSeen' as keyof MacAddress)}>
                          <div className="flex items-center">
                            Last Seen {renderSortIcon('lastSeen')}
                          </div>
                        </TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="cursor-pointer hover:text-foreground" onClick={() => handleSort('historyCount' as keyof MacAddress)}>
                          <div className="flex items-center">
                            History {renderSortIcon('historyCount')}
                          </div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:text-foreground" onClick={() => handleSort('exclusion' as keyof MacAddress)}>
                          <div className="flex items-center">
                            Exclusion {renderSortIcon('exclusion')}
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayedMacAddresses.map((mac, index) => (
                        <TableRow key={mac.id}>
                          <TableCell className="text-sm">
                            {pageSize === 'ALL' ? index + 1 : ((currentPage - 1) * (pageSize as number)) + index + 1}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            <HighlightedText text={mac.macAddress.toUpperCase()} highlight={searchTerm} />
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate">
                            <HighlightedText text={mac.deviceName || '-'} highlight={searchTerm} />
                          </TableCell>
                          <TableCell className="max-w-[120px]">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="truncate cursor-help">
                                    <HighlightedText text={mac.vendor || '-'} highlight={searchTerm} />
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
                            <div className="font-mono text-sm">
                              {mac.currentIps && mac.currentIps.length > 0 ? (
                                mac.currentIps.map((ip, idx) => (
                                  <div key={idx}>
                                    <div><HighlightedText text={ip.ipAddress} highlight={searchTerm} /></div>
                                    {ip.hostAlias && (
                                      <div className="text-xs text-muted-foreground"><HighlightedText text={ip.hostAlias} highlight={searchTerm} /></div>
                                    )}
                                  </div>
                                ))
                              ) : (
                                '-'
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
                            {mac.exclusion?.enabled && mac.exclusion?.exclusionMode === 'FULL' ? (
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
                            <div className="flex items-center gap-2 flex-wrap">
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
                                    <TooltipContent>
                                      <p>
                                        {mac.isActive ? 'Device is currently active on network' : 'Device has not been seen recently'}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {mac.hasDhcpConflict && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-xs cursor-help">
                                        DHCP Conflict
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>DHCP IP address conflict detected</p>
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
                                    <TooltipContent>
                                      <p>DHCP reserved IP address</p>
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
                                    <TooltipContent>
                                      <p>Randomized privacy MAC address</p>
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
                                    <TooltipContent>
                                      <p>OPNsense router/firewall interface MAC address</p>
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
                                    <TooltipContent>
                                      <p>MAC has multiple active IP addresses (e.g., keepalived, HA cluster)</p>
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
                                    <TooltipContent>
                                      <p>
                                        {mac.exclusion?.exclusionMode === 'FULL'
                                          ? 'Tracking disabled for this MAC (excluded)'
                                          : 'IP associations tracked; history disabled (partial exclusion)'}
                                      </p>
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

                                setSelectedMacAddress(mac.macAddress);
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
                                  <TooltipContent>
                                    <p>
                                      {mac.exclusion?.exclusionMode === 'FULL'
                                        ? 'Tracking disabled for this MAC (excluded)'
                                        : 'IP associations tracked; history disabled (partial exclusion)'}
                                    </p>
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

                {/* Mobile Card View */}
                <ScrollArea className="md:hidden h-full w-full">
                  <div className="space-y-3 p-2">
                    {displayedMacAddresses.map((mac) => (
                      <Card key={mac.id} className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-sm font-medium">
                              {mac.macAddress}
                            </span>
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
                                        DHCP Conflict
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
                                      <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs cursor-help">
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

                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="font-medium text-muted-foreground">Device:</span>
                              <p className="text-foreground truncate"><HighlightedText text={mac.deviceName || '-'} highlight={searchTerm} /></p>
                            </div>
                            <div>
                              <span className="text-xs text-muted-foreground">Vendor</span>
                              <p className="text-foreground truncate" title={mac.vendorSource ? `Source: ${mac.vendorSource === 'OPNsense' ? 'OPNsense ARP Table' : 'Local Vendor Database'}` : undefined}>
                                <HighlightedText text={mac.vendor || '-'} highlight={searchTerm} />
                              </p>
                            </div>
                            <div>
                              <span className="font-medium text-muted-foreground">Current IP:</span>
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
                                <p className="text-foreground font-mono">-</p>
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
                          </div>

                          <div>
                            <span className="font-medium text-muted-foreground">Last Seen:</span>
                            {mac.exclusion?.enabled && mac.exclusion?.exclusionMode === 'FULL' ? (
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

                          {/* Status badges */}
                          <div className="flex flex-wrap gap-1">
                            {mac.hasDhcpConflict && (
                              <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-xs" title="DHCP IP address conflict detected">
                                DHCP Conflict
                              </Badge>
                            )}
                            {mac.isDhcpReserved && !mac.hasDhcpConflict && (
                              <Badge className="bg-blue-500 hover:bg-blue-600 text-white text-xs" title="DHCP reserved IP address">
                                DHCP
                              </Badge>
                            )}
                            {mac.isPrivacyMac && (
                              <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs" title="Randomized privacy MAC address">
                                Privacy
                              </Badge>
                            )}
                            {mac.isOpnsenseMac && (
                              <Badge className="bg-purple-600 hover:bg-purple-700 text-white text-xs" title="OPNsense router/firewall interface MAC address">
                                OPNsense
                              </Badge>
                            )}
                            {mac.exclusion?.enabled && mac.exclusion?.exclusionMode === 'PARTIAL' && (
                              <Badge className="bg-amber-600 hover:bg-amber-700 text-white text-xs" title="IP associations tracked; history disabled (partial exclusion)">
                                Partial Tracking
                              </Badge>
                            )}
                          </div>

                          <div className="flex justify-end pt-2 border-t">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewHistory(mac.macAddress)}
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
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>

          {/* Pagination - Always show when there's data */}
          {totalCount > 0 && (
            <div className="px-6 py-4 border-t">
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                totalCount={totalCount}
                filteredCount={totalCount}
                pageSize={pageSize as number | 'ALL'}
                onPageChange={async (page) => {
                  setIsButtonRefreshing(true);
                  await new Promise(resolve => setTimeout(resolve, 500));
                  handlePageChange(page);
                  setIsButtonRefreshing(false);
                }}
                onPageSizeChange={(value) => {
                  setPageSize(value);
                  // setCurrentPage(1); // Reset to first page when page size changes
                }}
                isLoadMoreMode={isPhone}
                isLoading={isLoading || isButtonRefreshing}
                pageSizeOptions={[5, 10, 50, 100, 500]}
                showAllOption={true}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      {selectedMacAddress && (
        <MacHistoryDialog
          open={!!selectedMacAddress}
          onOpenChange={(open) => !open && setSelectedMacAddress(null)}
          macAddress={selectedMacAddress}
        />
      )}
    </>
  );
}