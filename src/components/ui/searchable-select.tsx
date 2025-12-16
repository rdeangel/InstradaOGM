'use client';

/* eslint-disable security/detect-object-injection */
// This component uses bracket notation with typed keys from objects. All uses are safe.
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { Button } from "@/components/ui/button";
import { ChevronsUpDown, XCircle, RefreshCcw, Info, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { checkMacRandomization } from '@/lib/mac-utils';
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useGroupType } from "@/context/GroupTypeContext";
import { hasAnyGroupError, getGroupErrorType, getGroupErrorMessage } from '@/utils/groupErrorDetection';

// Custom hook for debounced search
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Progressive loading hook - simpler approach
function useProgressiveLoading(
  items: SearchableSelectOption[],
  initialCount: number = 100,
  loadMoreCount: number = 50
) {
  const [displayCount, setDisplayCount] = useState(Math.min(initialCount, items.length));
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset display count when items change
  useEffect(() => {
    setDisplayCount(Math.min(initialCount, items.length));
  }, [items.length, initialCount]);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const { scrollTop, scrollHeight, clientHeight } = element;

    // Load more when scrolled near bottom
    if (scrollHeight - scrollTop <= clientHeight * 1.5 && displayCount < items.length) {
      setDisplayCount(prev => Math.min(prev + loadMoreCount, items.length));
    }
  }, [displayCount, items.length, loadMoreCount]);

  return {
    displayedItems: items.slice(0, displayCount),
    handleScroll,
    hasMore: displayCount < items.length,
    scrollRef
  };
}

export interface SearchableSelectOption {
  value: string;
  label: string;
  detectedMac?: string | null;
  detectedVendor?: string | null;
  isDhcpReserved?: boolean; // New prop for DHCP reservation status
  dhcpReservedMac?: string | null; // New prop for DHCP reservation MAC
  dhcpReservedVendor?: string | null; // New prop for DHCP reservation Vendor
  aliasDescription?: string | null; // New prop for alias description
  vpnInfo?: {
    status: 'connected' | 'disconnected' | 'disabled';
    type: string;
    enabled?: string;
    isMultiple?: boolean;
    connectedCount?: number;
    totalCount?: number;
    allVpns?: Array<{ vpnUuid: string; status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string }>;
  } | null; // Enhanced to include multi-VPN properties
  memberOfGroups?: { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null; groupType?: 'SingleSelect' | 'MultiSelect' }[]; // New prop for group memberships
  isDisabled: boolean; // Make this a required prop
  hasIpConflict?: boolean;
  hasMacConflict?: boolean;
  searchableText?: string; // New prop for custom searchable text
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value?: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  emptyValueLabel?: string; // New prop for custom label when value is null
  disabled?: boolean;
  className?: string; // New prop for custom class names
  id?: string; // New prop for id
  style?: React.CSSProperties; // New prop for custom styles
  renderOption?: (option: SearchableSelectOption) => React.ReactNode; // New prop for custom option rendering
  renderSelectedOption?: (option: SearchableSelectOption) => React.ReactNode; // New prop for custom selected option rendering
  onRefresh?: () => Promise<void>; // New prop for refresh action, now returns Promise
  isRefreshLoading?: boolean; // New prop for refresh loading state
  open?: boolean; // New prop to control popover open state
  onOpenChange?: (open: boolean) => void; // New prop for popover open state change
  onShowSearchHelp?: () => React.ReactNode; // New prop for search help tooltip content
  // Progressive loading props
  enableVirtualScrolling?: boolean; // Enable virtual scrolling for large datasets
  initialLoadCount?: number; // Initial number of items to load (default: 100)
  loadMoreCount?: number; // Number of items to load when scrolling (default: 50)
  searchDebounceMs?: number; // Search debounce delay in milliseconds (default: 300)
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select option...",
  disabled,
  emptyValueLabel,
  className,
  id, // Destructure new prop
  style, // Destructure new prop
  renderOption, // Destructure new prop
  renderSelectedOption, // Destructure new prop
  onRefresh, // Destructure new prop
  isRefreshLoading, // Destructure new prop
  open: controlledOpen, // Destructure controlled open state
  onOpenChange: setControlledOpen, // Destructure controlled onOpenChange handler
  onShowSearchHelp, // Destructure new prop
  // Progressive loading props
  enableVirtualScrolling = false,
  initialLoadCount = 100,
  loadMoreCount = 50,
  searchDebounceMs = 300,
}: SearchableSelectProps) {
  // Get group type settings to conditionally enable/disable group type features
  const { enableGroupTypes, multiSelectName, singleSelectName } = useGroupType();

  // Use internal state if not controlled, otherwise use controlled props
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = setControlledOpen !== undefined ? setControlledOpen : setInternalOpen;

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, searchDebounceMs);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1); // For keyboard navigation, -1 means no selection
  const [searchHelpOpen, setSearchHelpOpen] = useState(false);

  // Sort options alphabetically by label
  const sortedOptions = useMemo(() => {
    return [...options].sort((a, b) => a.label.localeCompare(b.label));
  }, [options]);

  // Filter options based on debounced search term
  const filteredOptions = useMemo(() => {
    if (!debouncedSearchTerm) return sortedOptions;

    const lowerCaseSearch = debouncedSearchTerm.toLowerCase();
    return sortedOptions.filter(option => {
      // Prioritize searchableText if provided
      if (option.searchableText && option.searchableText.includes(lowerCaseSearch)) {
        return true;
      }

      // Existing search fields
      const labelMatches = option.label.toLowerCase().includes(lowerCaseSearch);
      const detectedVendorMatches = option.detectedVendor && option.detectedVendor.toLowerCase().includes(lowerCaseSearch);
      const detectedMacMatches = option.detectedMac && option.detectedMac.toLowerCase().includes(lowerCaseSearch);
      const dhcpReservedMacMatches = option.dhcpReservedMac && option.dhcpReservedMac.toLowerCase().includes(lowerCaseSearch);
      const dhcpReservedVendorMatches = option.dhcpReservedVendor && option.dhcpReservedVendor.toLowerCase().includes(lowerCaseSearch);
      const aliasDescriptionMatches = option.aliasDescription && option.aliasDescription.toLowerCase().includes(lowerCaseSearch);
      // Updated VPN search logic
      const vpnTypeMatches = option.vpnInfo?.type && option.vpnInfo.type.toLowerCase().includes(lowerCaseSearch);
      const vpnStatusMatches = option.vpnInfo?.status && option.vpnInfo.status.toLowerCase().includes(lowerCaseSearch);

      // Specific keyword searches for VPN types
      const vpnKeywordSearch = lowerCaseSearch === 'vpn' && option.vpnInfo && ['ipsec', 'wireguard', 'openvpn'].includes(option.vpnInfo.type.toLowerCase());
      const ipsecKeywordSearch = lowerCaseSearch === 'ipsec' && option.vpnInfo?.type.toLowerCase() === 'ipsec';
      const wireguardKeywordSearch = lowerCaseSearch === 'wireguard' && option.vpnInfo?.type.toLowerCase() === 'wireguard';
      const openvpnKeywordSearch = lowerCaseSearch === 'openvpn' && option.vpnInfo?.type.toLowerCase() === 'openvpn';

      // Badge searches (exact match for badge terms)
      const dhcpBadgeSearch = lowerCaseSearch === 'dhcp' && option.isDhcpReserved;
      const arpBadgeSearch = lowerCaseSearch === 'arp' && (option.detectedMac || option.detectedVendor);
      const inGroupBadgeSearch = (lowerCaseSearch === 'ingroup' || lowerCaseSearch === 'group' || lowerCaseSearch === 'groups') && option.memberOfGroups && option.memberOfGroups.length > 0;
      const groupMembershipSearch = option.memberOfGroups && option.memberOfGroups.some(group =>
        (group.friendlyName && group.friendlyName.toLowerCase().includes(lowerCaseSearch)) ||
        group.name.toLowerCase().includes(lowerCaseSearch)
      );

      // Group type searches - only enabled when group types are enabled
      const singleSelectSearch = enableGroupTypes &&
        (lowerCaseSearch === 'single-select' || lowerCaseSearch === 'singleselect') &&
        option.memberOfGroups && option.memberOfGroups.some(group =>
          group.groupType === 'SingleSelect'
        );
      const multiSelectSearch = enableGroupTypes &&
        (lowerCaseSearch === 'multi-select' || lowerCaseSearch === 'multiselect') &&
        option.memberOfGroups && option.memberOfGroups.some(group =>
          group.groupType === 'MultiSelect'
        );

      // New special keyword searches
      const dhcpConflictSearch = lowerCaseSearch === 'dhcp-conflict' && option.hasMacConflict;
      const dhcpPrivacyMacSearch = lowerCaseSearch === 'dhcp-privacy-mac' && option.isDhcpReserved &&
        option.dhcpReservedMac && checkMacRandomization(option.dhcpReservedMac).isRandomized;
      const vpnConnectedSearch = lowerCaseSearch === 'vpn-connected' && option.vpnInfo &&
        (option.vpnInfo.status === 'connected' ||
          (option.vpnInfo.allVpns && option.vpnInfo.allVpns.some(vpn => vpn.status === 'connected')));
      const vpnDisconnectedSearch = lowerCaseSearch === 'vpn-disconnected' && option.vpnInfo &&
        (option.vpnInfo.status === 'disconnected' ||
          (option.vpnInfo.allVpns && option.vpnInfo.allVpns.some(vpn => vpn.status === 'disconnected')));
      const onlineSearch = lowerCaseSearch === 'online' && (option.detectedMac || option.detectedVendor);
      const offlineSearch = lowerCaseSearch === 'offline' && !(option.detectedMac || option.detectedVendor);
      const ingroupErrorSearch = (lowerCaseSearch === 'ingroup-error' || lowerCaseSearch === 'ingroup-errors') &&
        !enableGroupTypes && option.memberOfGroups && option.memberOfGroups.length > 1;

      const matches = labelMatches ||
        detectedVendorMatches ||
        detectedMacMatches ||
        dhcpReservedMacMatches ||
        dhcpReservedVendorMatches ||
        aliasDescriptionMatches ||
        dhcpBadgeSearch ||
        arpBadgeSearch ||
        vpnTypeMatches ||
        vpnStatusMatches ||
        vpnKeywordSearch ||
        ipsecKeywordSearch ||
        wireguardKeywordSearch ||
        openvpnKeywordSearch ||
        inGroupBadgeSearch ||
        groupMembershipSearch ||
        singleSelectSearch ||
        multiSelectSearch ||
        dhcpConflictSearch ||
        dhcpPrivacyMacSearch ||
        vpnConnectedSearch ||
        vpnDisconnectedSearch ||
        onlineSearch ||
        offlineSearch ||
        ingroupErrorSearch;

      const disabledSearch = lowerCaseSearch === 'disabled' && option.isDisabled;

      return matches || disabledSearch;
    });
  }, [sortedOptions, debouncedSearchTerm, enableGroupTypes]);

  // Progressive loading setup
  const progressiveLoading = useProgressiveLoading(
    filteredOptions,
    initialLoadCount,
    loadMoreCount
  );

  // Always use progressive loading when enabled, regardless of item count to avoid switching
  const shouldUseProgressiveLoading = enableVirtualScrolling;
  const displayOptions = shouldUseProgressiveLoading ? progressiveLoading.displayedItems : filteredOptions;



  // Reset selected index when options change or dropdown opens
  useEffect(() => {
    if (displayOptions.length > 0) {
      setSelectedIndex(0); // Always highlight first item when there are options
    } else {
      setSelectedIndex(-1); // No selection when no options
    }
  }, [displayOptions.length, open]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!open) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, displayOptions.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'PageDown':
        event.preventDefault();
        setSelectedIndex(prev => {
          const pageSize = 10; // Jump 10 items at a time
          return Math.min(prev + pageSize, displayOptions.length - 1);
        });
        break;
      case 'PageUp':
        event.preventDefault();
        setSelectedIndex(prev => {
          const pageSize = 10; // Jump 10 items at a time
          return Math.max(prev - pageSize, 0);
        });
        break;
      case 'Home':
        event.preventDefault();
        setSelectedIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setSelectedIndex(displayOptions.length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        if (selectedIndex >= 0 && displayOptions[selectedIndex]) {
          onValueChange(displayOptions[selectedIndex].value);
          setOpen(false);
          setSearchTerm('');
        }
        break;
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        break;
    }
  }, [open, displayOptions, selectedIndex, onValueChange, setOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (shouldUseProgressiveLoading && scrollAreaRef.current && selectedIndex >= 0) {
      const selectedElement = scrollAreaRef.current.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, shouldUseProgressiveLoading]);

  // Legacy custom filter for Command component (when not using progressive loading)
  const customFilter = useCallback((itemValue: string, search: string) => {
    if (shouldUseProgressiveLoading) return 1; // Always show items when using progressive loading

    const lowerCaseSearch = search.toLowerCase();
    const option = sortedOptions.find(opt => opt.value === itemValue);

    if (!option) return 0;

    // Prioritize searchableText if provided
    if (option.searchableText && option.searchableText.includes(lowerCaseSearch)) {
      return 1;
    }

    // Same filtering logic as above but for legacy Command component
    const labelMatches = option.label.toLowerCase().includes(lowerCaseSearch);
    const detectedVendorMatches = option.detectedVendor && option.detectedVendor.toLowerCase().includes(lowerCaseSearch);
    const detectedMacMatches = option.detectedMac && option.detectedMac.toLowerCase().includes(lowerCaseSearch);
    const dhcpReservedMacMatches = option.dhcpReservedMac && option.dhcpReservedMac.toLowerCase().includes(lowerCaseSearch);
    const dhcpReservedVendorMatches = option.dhcpReservedVendor && option.dhcpReservedVendor.toLowerCase().includes(lowerCaseSearch);
    const aliasDescriptionMatches = option.aliasDescription && option.aliasDescription.toLowerCase().includes(lowerCaseSearch);
    const vpnTypeMatches = option.vpnInfo?.type && option.vpnInfo.type.toLowerCase().includes(lowerCaseSearch);
    const vpnStatusMatches = option.vpnInfo?.status && option.vpnInfo.status.toLowerCase().includes(lowerCaseSearch);

    const vpnKeywordSearch = lowerCaseSearch === 'vpn' && option.vpnInfo && ['ipsec', 'wireguard', 'openvpn'].includes(option.vpnInfo.type.toLowerCase());
    const ipsecKeywordSearch = lowerCaseSearch === 'ipsec' && option.vpnInfo?.type.toLowerCase() === 'ipsec';
    const wireguardKeywordSearch = lowerCaseSearch === 'wireguard' && option.vpnInfo?.type.toLowerCase() === 'wireguard';
    const openvpnKeywordSearch = lowerCaseSearch === 'openvpn' && option.vpnInfo?.type.toLowerCase() === 'openvpn';

    const dhcpBadgeSearch = lowerCaseSearch === 'dhcp' && option.isDhcpReserved;
    const arpBadgeSearch = lowerCaseSearch === 'arp' && (option.detectedMac || option.detectedVendor);
    const inGroupBadgeSearch = (lowerCaseSearch === 'ingroup' || lowerCaseSearch === 'group' || lowerCaseSearch === 'groups') && option.memberOfGroups && option.memberOfGroups.length > 0;
    const groupMembershipSearch = option.memberOfGroups && option.memberOfGroups.some(group =>
      (group.friendlyName && group.friendlyName.toLowerCase().includes(lowerCaseSearch)) ||
      group.name.toLowerCase().includes(lowerCaseSearch)
    );

    // Group type searches - only enabled when group types are enabled
    const singleSelectSearch = enableGroupTypes &&
      (lowerCaseSearch === 'single-select' || lowerCaseSearch === 'singleselect') &&
      option.memberOfGroups && option.memberOfGroups.some(group =>
        group.groupType === 'SingleSelect'
      );
    const multiSelectSearch = enableGroupTypes &&
      (lowerCaseSearch === 'multi-select' || lowerCaseSearch === 'multiselect') &&
      option.memberOfGroups && option.memberOfGroups.some(group =>
        group.groupType === 'MultiSelect'
      );

    // New special keyword searches (same as above)
    const dhcpConflictSearch = lowerCaseSearch === 'dhcp-conflict' && option.hasMacConflict;
    const dhcpPrivacyMacSearch = lowerCaseSearch === 'dhcp-privacy-mac' && option.isDhcpReserved &&
      option.dhcpReservedMac && checkMacRandomization(option.dhcpReservedMac).isRandomized;
    const vpnConnectedSearch = lowerCaseSearch === 'vpn-connected' && option.vpnInfo &&
      (option.vpnInfo.status === 'connected' ||
        (option.vpnInfo.allVpns && option.vpnInfo.allVpns.some(vpn => vpn.status === 'connected')));
    const vpnDisconnectedSearch = lowerCaseSearch === 'vpn-disconnected' && option.vpnInfo &&
      (option.vpnInfo.status === 'disconnected' ||
        (option.vpnInfo.allVpns && option.vpnInfo.allVpns.some(vpn => vpn.status === 'disconnected')));
    const onlineSearch = lowerCaseSearch === 'online' && (option.detectedMac || option.detectedVendor);
    const offlineSearch = lowerCaseSearch === 'offline' && !(option.detectedMac || option.detectedVendor);
    const ingroupErrorSearch = (lowerCaseSearch === 'ingroup-error' || lowerCaseSearch === 'ingroup-errors') &&
      !enableGroupTypes && option.memberOfGroups && option.memberOfGroups.length > 1;

    const matches = labelMatches ||
      detectedVendorMatches ||
      detectedMacMatches ||
      dhcpReservedMacMatches ||
      dhcpReservedVendorMatches ||
      aliasDescriptionMatches ||
      dhcpBadgeSearch ||
      arpBadgeSearch ||
      vpnTypeMatches ||
      vpnStatusMatches ||
      vpnKeywordSearch ||
      ipsecKeywordSearch ||
      wireguardKeywordSearch ||
      openvpnKeywordSearch ||
      inGroupBadgeSearch ||
      groupMembershipSearch ||
      singleSelectSearch ||
      multiSelectSearch ||
      dhcpConflictSearch ||
      dhcpPrivacyMacSearch ||
      vpnConnectedSearch ||
      vpnDisconnectedSearch ||
      onlineSearch ||
      offlineSearch ||
      ingroupErrorSearch;

    const disabledSearch = lowerCaseSearch === 'disabled' && option.isDisabled;

    return (matches || disabledSearch) ? 1 : 0;
  }, [sortedOptions, shouldUseProgressiveLoading, enableGroupTypes]);

  const selectedLabel = useMemo(() => {
    return sortedOptions.find(option => option.value === value)?.label;
  }, [sortedOptions, value]);

  const selectedOption = useMemo(() => {
    return sortedOptions.find(option => option.value === value);
  }, [sortedOptions, value]);



  // Maintain focus on search input when component updates
  useEffect(() => {
    if (open && searchInputRef.current && shouldUseProgressiveLoading) {
      // Small delay to ensure the input is rendered
      const timer = setTimeout(() => {
        if (searchInputRef.current && document.activeElement !== searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [open, shouldUseProgressiveLoading, displayOptions.length]);

  // Handle button click to open dropdown and focus input
  const handleButtonClick = useCallback(() => {
    setOpen(!open);
    if (!open) {
      // Focus the input when opening
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 100);
    }
  }, [open, setOpen]);

  const handleRefresh = async () => {
    if (onRefresh) {
      setOpen(true); // Ensure it's open before refresh starts
      await onRefresh();
      setOpen(true); // Ensure it's open after refresh completes
    }
  };

  // Handle scroll for progressive loading
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    if (shouldUseProgressiveLoading) {
      progressiveLoading.handleScroll(event);
    }
  }, [shouldUseProgressiveLoading, progressiveLoading]);

  return (
    <Popover open={open} onOpenChange={(newOpenState) => {
      // Prevent closing if a refresh is in progress
      if (isRefreshLoading && newOpenState === false) {
        return; // Do not allow closing
      }
      setOpen(newOpenState);
    }}>
      <PopoverTrigger asChild>
        <Button
          id={id} // Apply id prop
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between pr-2", className)} // Removed w-full and min-w
          disabled={disabled}
          style={style}
          onClick={handleButtonClick}
        >
          <span className="flex-grow text-left truncate flex items-center">
            {!selectedOption && !value && <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />}
            {selectedOption && renderSelectedOption ? renderSelectedOption(selectedOption) : (selectedLabel || (value === null && emptyValueLabel ? emptyValueLabel : placeholder))}
          </span>
          {value && ( // Show clear button only when a value is selected
            <span
              onClick={(e) => {
                e.stopPropagation(); // Prevent opening the popover
                onValueChange(null);
                setSearchTerm('');
              }}
              className="h-auto w-auto p-0 ml-2 cursor-pointer"
            >
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0 overflow-x-hidden", "data-[state=open]:w-[var(--radix-popover-trigger-width)]", className)} align="start">
        {shouldUseProgressiveLoading ? (
          // Progressive loading implementation
          <div className="flex flex-col">
            {/* Search input header */}
            <div className="relative flex items-center border-b px-3" cmdk-input-wrapper="">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search options..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                className={cn(
                  "h-10 flex-grow border-0 focus:ring-0 focus:outline-none bg-transparent text-sm",
                  onRefresh && onShowSearchHelp ? "pr-22" : (onRefresh || onShowSearchHelp ? "pr-12" : "pr-3")
                )}
              />
              {onShowSearchHelp && (
                <Dialog open={searchHelpOpen} onOpenChange={setSearchHelpOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn("absolute h-8 w-8 text-muted-foreground hover:text-primary", onRefresh ? "right-12" : "right-2")}
                      onClick={() => setSearchHelpOpen(true)}
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Search Help</DialogTitle>
                      <DialogDescription>
                        Tips and tricks for searching and filtering options.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-96 overflow-y-auto">
                      {onShowSearchHelp()}
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              {onRefresh && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRefresh}
                  disabled={isRefreshLoading}
                  className="absolute right-2 h-8 w-8"
                >
                  <RefreshCcw className={cn("h-4 w-4", isRefreshLoading && "animate-spin")} />
                </Button>
              )}
            </div>

            {/* Progressive loading content */}
            <ScrollArea
              className="h-[300px]"
              ref={scrollAreaRef}
              onViewportScroll={handleScroll}
              onWheel={(e) => e.stopPropagation()}
            >
              {filteredOptions.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  No option found.
                </div>
              ) : (
                <div>
                  {displayOptions.map((option: SearchableSelectOption, index: number) => (
                    <div
                      key={option.value}
                      data-index={index}
                      className={cn(
                        "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-accent hover:text-accent-foreground",
                        index === selectedIndex ? "bg-accent text-accent-foreground" : ""
                      )}
                      onClick={() => {
                        onValueChange(option.value);
                        setOpen(false);
                        setSearchTerm('');
                      }}
                    >
                      {renderOption ? renderOption(option) : (
                        <div className="flex items-center justify-between w-full">
                          <span className="truncate text-ellipsis">{option.label}</span>
                          <div className="flex-shrink-0 flex items-center gap-1 mt-1 sm:mt-0 sm:ml-2 flex-wrap max-w-full justify-end">
                            {option.detectedMac && checkMacRandomization(option.detectedMac).isRandomized && (
                              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Privacy</Badge>
                            )}
                            {(option.detectedMac || option.detectedVendor) && (
                              <Badge variant="secondary" className="bg-green-100 text-green-800">ARP</Badge>
                            )}
                            {option.isDhcpReserved && (
                              <Badge variant="secondary" className="bg-blue-100 text-blue-800">DHCP</Badge>
                            )}
                            {option.vpnInfo && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className={cn(
                                      "h-4 w-auto px-1 text-xs",
                                      // Updated status logic to handle multiple VPNs and mixed states
                                      option.vpnInfo.status === 'connected' ? "bg-darker-green hover:bg-darker-green/80 text-white" :
                                        option.vpnInfo.status === 'disabled' ? (option.vpnInfo.isMultiple ? "bg-orange-500 hover:bg-orange-600 text-white" : "bg-gray-500 hover:bg-gray-600 text-white") :
                                          "bg-darker-red hover:bg-darker-red/80 text-white"
                                    )}>
                                      {option.vpnInfo.isMultiple ? (
                                        `${option.vpnInfo.totalCount} VPNs`
                                      ) : (
                                        option.vpnInfo.type === 'openvpn' ? 'OpenVPN' :
                                          option.vpnInfo.type === 'wireguard' ? 'WireGuard' :
                                            option.vpnInfo.type === 'ipsec' ? 'IPsec' :
                                              option.vpnInfo.type
                                      )}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {option.vpnInfo.isMultiple ? (
                                      <div className="space-y-1">
                                        <p className="font-medium">VPN Status Summary:</p>
                                        <p>✓ {option.vpnInfo.connectedCount} Connected</p>
                                        <p>✗ {option.vpnInfo.totalCount! - option.vpnInfo.connectedCount!} Disconnected/Disabled</p>
                                        <div className="border-t pt-1 mt-2">
                                          <p className="font-medium">VPNs:</p>
                                          {option.vpnInfo.allVpns?.map((vpn, index) => (
                                            <p key={index} className="text-sm">
                                              {vpn.type === 'openvpn' ? 'OpenVPN' :
                                                vpn.type === 'wireguard' ? 'WireGuard' :
                                                  vpn.type === 'ipsec' ? 'IPsec' :
                                                    vpn.type} - {vpn.status === 'connected' ? 'Connected' : vpn.status === 'disabled' ? 'Disabled' : 'Disconnected'}
                                            </p>
                                          ))}
                                        </div>
                                        {option.memberOfGroups && option.memberOfGroups.length > 0 && (
                                          <div className="border-t pt-1 mt-2">
                                            <p className="font-medium">Groups:</p>
                                            {option.memberOfGroups.map((g, index) => (
                                              <p key={index} className="text-sm">{g.friendlyName || g.name}</p>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <>
                                        {option.vpnInfo.type === 'openvpn' && (
                                          <p>OpenVPN {option.vpnInfo.status === 'connected' ? 'Connected' : 'Disconnected'}</p>
                                        )}
                                        {option.vpnInfo.type === 'wireguard' && (
                                          <p>WireGuard {option.vpnInfo.status === 'connected' ? 'Connected' : option.vpnInfo.status === 'disabled' ? 'Disabled' : 'Disconnected'}</p>
                                        )}
                                        {option.vpnInfo.type === 'ipsec' && (
                                          <p>IPsec {option.vpnInfo.status === 'connected' ? 'Connected' : 'Disconnected'}</p>
                                        )}
                                        {option.memberOfGroups && option.memberOfGroups.length > 0 && (
                                          option.memberOfGroups.length === 1 ? (
                                            <p>Group Association: {option.memberOfGroups[0].friendlyName || option.memberOfGroups[0].name}{enableGroupTypes ? ` (${option.memberOfGroups[0].groupType === 'MultiSelect' ? multiSelectName : singleSelectName})` : ''}</p>
                                          ) : (
                                            <div>
                                              <p>Group Association:</p>
                                              {option.memberOfGroups.map((g, index) => (
                                                <p key={index} className="text-sm">{g.friendlyName || g.name}{enableGroupTypes ? ` (${g.groupType === 'MultiSelect' ? multiSelectName : singleSelectName})` : ''}</p>
                                              ))}
                                            </div>
                                          )
                                        )}
                                      </>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {option.memberOfGroups && option.memberOfGroups.length > 0 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="secondary" className={cn(
                                      "h-4 w-auto px-1 text-xs",
                                      option.memberOfGroups.length === 1
                                        ? "bg-amber-700 hover:bg-amber-700/80 text-white"
                                        : hasAnyGroupError(option.memberOfGroups, enableGroupTypes)
                                          ? "bg-orange-500 hover:bg-orange-600 text-white"
                                          : "bg-red-600 hover:bg-red-700 text-white"
                                    )}>
                                      {option.memberOfGroups.length === 1 ? 'InGroup' : `${option.memberOfGroups.length} Groups`}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {option.memberOfGroups.length === 1 ? (
                                      <p>Member of: {option.memberOfGroups[0].friendlyName || option.memberOfGroups[0].name}{enableGroupTypes ? ` (${option.memberOfGroups[0].groupType === 'MultiSelect' ? multiSelectName : singleSelectName})` : ''}</p>
                                    ) : hasAnyGroupError(option.memberOfGroups, enableGroupTypes) ? (
                                      <div>
                                        <p className="text-orange-400 font-semibold">{getGroupErrorMessage(getGroupErrorType(option.memberOfGroups, enableGroupTypes))}</p>
                                        <p className="text-sm mt-1">Member of:</p>
                                        {option.memberOfGroups.map((g, index) => (
                                          <p key={index} className="text-sm">{g.friendlyName || g.name}{enableGroupTypes ? ` (${g.groupType === 'MultiSelect' ? multiSelectName : singleSelectName})` : ''}</p>
                                        ))}
                                      </div>
                                    ) : (
                                      <div>
                                        <p className="text-sm">Member of:</p>
                                        {option.memberOfGroups.map((g, index) => (
                                          <p key={index} className="text-sm">{g.friendlyName || g.name}{enableGroupTypes ? ` (${g.groupType === 'MultiSelect' ? multiSelectName : singleSelectName})` : ''}</p>
                                        ))}
                                      </div>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {option.isDisabled && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className="bg-gray-500 hover:bg-gray-600 text-white h-4 w-auto px-1 text-xs">Disabled</Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>This host alias is disabled and cannot be managed.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {progressiveLoading.hasMore && (
                    <div className="p-2 text-center text-muted-foreground text-sm">
                      Showing {displayOptions.length} of {filteredOptions.length} items. Scroll for more...
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>
        ) : (
          // Traditional Command component implementation
          <Command filter={customFilter}>
            <div className="relative flex items-center border-b" cmdk-input-wrapper="">
              <CommandInput
                placeholder="Search options..."
                value={searchTerm}
                onValueChange={setSearchTerm}
                onKeyDown={handleKeyDown}
                className={cn(
                  "h-10 flex-grow border-0 focus:ring-0 focus:outline-none pl-3 text-sm",
                  onRefresh && onShowSearchHelp ? "pr-22" : (onRefresh || onShowSearchHelp ? "pr-12" : "pr-3")
                )}
              />
              {onShowSearchHelp && (
                <Dialog open={searchHelpOpen} onOpenChange={setSearchHelpOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn("absolute h-8 w-8 text-muted-foreground hover:text-primary", onRefresh ? "right-12" : "right-2")}
                      onClick={() => setSearchHelpOpen(true)}
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Search Help</DialogTitle>
                      <DialogDescription>
                        Tips and tricks for searching and filtering options.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-96 overflow-y-auto">
                      {onShowSearchHelp()}
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              {onRefresh && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRefresh}
                  disabled={isRefreshLoading}
                  className="absolute right-2 h-8 w-8"
                >
                  <RefreshCcw className={cn("h-4 w-4", isRefreshLoading && "animate-spin")} />
                </Button>
              )}
            </div>
            <CommandList>
              <CommandEmpty>No option found.</CommandEmpty>
              <CommandGroup>
                {sortedOptions.map((option, index) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    data-index={index}
                    onSelect={(currentValue) => {
                      onValueChange(currentValue === '__NONE__' ? null : currentValue);
                      setOpen(false);
                      setSearchTerm('');
                    }}
                    className={cn(
                      "flex items-center overflow-hidden min-w-0",
                      index === selectedIndex ? "bg-accent text-accent-foreground" : ""
                    )}
                  >
                    {renderOption ? renderOption(option) : (
                      <div className="flex items-center justify-between w-full">
                        <span className="truncate text-ellipsis">{option.label}</span>
                        <div className="flex-shrink-0 flex items-center gap-1 mt-1 sm:mt-0 sm:ml-2 flex-wrap max-w-full justify-end">
                          {option.detectedMac && checkMacRandomization(option.detectedMac).isRandomized && (
                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Privacy</Badge>
                          )}
                          {(option.detectedMac || option.detectedVendor) && (
                            <Badge variant="secondary" className="bg-green-100 text-green-800">ARP</Badge>
                          )}
                          {option.isDhcpReserved && (
                            <Badge variant="secondary" className={(() => {
                              const isPrivacyMac = option.dhcpReservedMac &&
                                checkMacRandomization(option.dhcpReservedMac).isRandomized;
                              return isPrivacyMac
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-blue-100 text-blue-800";
                            })()}>
                              DHCP
                            </Badge>
                          )}
                          {option.isDisabled && (
                            <Badge className="bg-gray-500 hover:bg-gray-600 text-white h-4 w-auto px-1 text-xs">Disabled</Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </CommandItem>
                ))}
                {value === null && emptyValueLabel && sortedOptions.length === 0 && searchTerm === '' && (
                  <CommandItem
                    value="__NONE__"
                    onSelect={() => {
                      onValueChange(null);
                      setOpen(false);
                      setSearchTerm('');
                    }}
                    className="text-muted-foreground italic"
                  >
                    {emptyValueLabel}
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}