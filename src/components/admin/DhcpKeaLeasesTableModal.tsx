'use client';

/* eslint-disable security/detect-object-injection */
// This component uses bracket notation with typed keys from objects. All uses are safe.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { checkMacRandomization } from '@/lib/mac-utils';
import { Search, RefreshCw, PlusCircle, ArrowUpDown, ArrowUp, ArrowDown, CheckCircle, XCircle, TriangleAlert, AlertCircle, Loader2 } from 'lucide-react'; // Added sorting icons, status icons, and warning icon
import { sortIpAddresses } from '@/lib/network-utils';
import { OpnsenseKeaLease } from '@/types/opnsense'; // Import the new interface
import { cn } from '@/lib/utils';
import { useIsMobile, useIsPhone } from '@/hooks/use-mobile';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'; // Import Tooltip components
import { useLocalStorage } from '@/hooks/use-local-storage';
import { PaginationControls } from '@/components/ui/pagination-controls';

interface DhcpKeaLeasesTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLeaseSelected: (ip: string, mac: string, hostname: string) => void;
}

export function DhcpKeaLeasesTableModal({ isOpen, onClose, onLeaseSelected }: DhcpKeaLeasesTableModalProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const isPhone = useIsPhone();

  const [leases, setLeases] = useState<OpnsenseKeaLease[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isButtonRefreshing, setIsButtonRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<keyof OpnsenseKeaLease | null>('address'); // Default sort by IP address
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc'); // Default sort direction

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useLocalStorage<number>('dhcp-kea-leases-table-page-size', 25);

  const fetchLeases = useCallback(async (isRefresh = false) => {
    // Only set loading to true for initial load, not for refresh
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      const leasesResponse = await fetch('/api/opnsense/dhcp?action=kea_leases');

      if (!leasesResponse.ok) throw new Error('Failed to fetch Kea DHCP leases');

      const leasesResult = await leasesResponse.json();
      const fetchedLeases: OpnsenseKeaLease[] = leasesResult.leases || [];

      setLeases(fetchedLeases);
    } catch (error) {
      logger.error("Failed to fetch data:", error);
      toast({
        title: "Error",
        description: `Failed to load data: ${(error as Error).message}`,
        variant: "destructive",
      });
    } finally {
      // Only set loading to false for initial load, not for refresh
      if (isRefresh) {
        setIsRefreshing(false);
        // Force re-render by updating refresh key
        setRefreshKey(prev => prev + 1);
      } else {
        setIsLoading(false);
      }
    }
  }, [toast]);

  useEffect(() => {
    if (isOpen) {
      fetchLeases();
    }
  }, [isOpen, fetchLeases]);

  const filteredLeases = useMemo(() => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    const filtered = leases.filter(lease =>
      lease.address.toLowerCase().includes(lowerCaseSearchTerm) ||
      lease.hwaddr.toLowerCase().includes(lowerCaseSearchTerm) ||
      (lease.hostname && lease.hostname.toLowerCase().includes(lowerCaseSearchTerm)) ||
      (lease.dhcpReservedHostname && lease.dhcpReservedHostname.toLowerCase().includes(lowerCaseSearchTerm)) ||
      (lease.hostAlias && lease.hostAlias.toLowerCase().includes(lowerCaseSearchTerm)) ||
      (lease.if_descr && lease.if_descr.toLowerCase().includes(lowerCaseSearchTerm))
    );

    if (sortColumn) {
      return [...filtered].sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        if (sortColumn === 'address' || sortColumn === 'dhcpReservedIp' || sortColumn === 'activeArpIp') {
          return sortDirection === 'asc' ? sortIpAddresses(aValue as string, bValue as string) : sortIpAddresses(bValue as string, aValue as string);
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        } else if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
          // Sort booleans: true comes before false for 'asc', false before true for 'desc'
          return sortDirection === 'asc' ? (aValue === bValue ? 0 : aValue ? -1 : 1) : (aValue === bValue ? 0 : aValue ? 1 : -1);
        } else if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        }
        // Fallback for mixed types or undefined values
        if (aValue === undefined || aValue === null) return sortDirection === 'asc' ? 1 : -1;
        if (bValue === undefined || bValue === null) return sortDirection === 'asc' ? -1 : 1;
        return 0;
      });
    }
    return filtered;
  }, [leases, searchTerm, sortColumn, sortDirection]);

  // Client-side pagination
  const totalPages = Math.ceil(filteredLeases.length / pageSize);
  const displayedLeases = useMemo(() => {
    if (isPhone) {
      return filteredLeases.slice(0, currentPage * pageSize);
    }
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredLeases.slice(startIndex, endIndex);
  }, [filteredLeases, currentPage, pageSize, isPhone]);

  // Reset to page 1 when search changes
  useEffect(() => {
    if (searchTerm !== '') {
      setCurrentPage(1);
    }
  }, [searchTerm]);

  // Pagination handlers
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handlePageSizeChange = useCallback((newPageSize: number | 'ALL') => {
    if (newPageSize === 'ALL') {
      setPageSize(filteredLeases.length);
    } else {
      setPageSize(newPageSize);
    }
    setCurrentPage(1);
  }, [setPageSize, filteredLeases.length]);

  const handleSelectLease = (lease: OpnsenseKeaLease) => {
    onLeaseSelected(lease.address, lease.hwaddr, lease.hostname || '');
    onClose();
  };

  const handleSort = (column: keyof OpnsenseKeaLease) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (column: keyof OpnsenseKeaLease) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="ml-2 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4" />
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl">Kea DHCP Leases</DialogTitle>
          <DialogDescription>
            View and select active Kea DHCP leases from OPNsense.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-grow">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search IP, MAC, Hostname, DHCP Hostname, Host Alias, or Description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
              disabled={isLoading}
            />
          </div>
          <Button onClick={() => fetchLeases(true)} disabled={isRefreshing || isLoading} size={isMobile ? 'icon' : 'default'} key={refreshKey}>
            <RefreshCw className={cn("h-4 w-4", !isMobile && "mr-2", (isRefreshing || isLoading) && "animate-spin")} />
            {!isMobile && ((isRefreshing || isLoading) ? 'Loading...' : 'Refresh')}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* Desktop Table View */}
          <div className="hidden md:block border rounded-md">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="cursor-pointer hover:text-foreground" onClick={() => handleSort('address')}>
                    <div className="flex items-center">IP Address {renderSortIcon('address')}</div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-foreground" onClick={() => handleSort('hwaddr')}>
                    <div className="flex items-center">MAC Address {renderSortIcon('hwaddr')}</div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-foreground" onClick={() => handleSort('hostname')}>
                    <div className="flex items-center">Hostname {renderSortIcon('hostname')}</div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-foreground max-w-[150px]" onClick={() => handleSort('dhcpReservedHostname')}>
                    <div className="flex items-center whitespace-normal">DHCP Hostname {renderSortIcon('dhcpReservedHostname')}</div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-foreground max-w-[150px]" onClick={() => handleSort('hostAlias')}>
                    <div className="flex items-center whitespace-normal">Host Alias {renderSortIcon('hostAlias')}</div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-foreground" onClick={() => handleSort('if_descr')}>
                    <div className="flex items-center">Description {renderSortIcon('if_descr')}</div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-foreground" onClick={() => handleSort('state')}>
                    <div className="flex items-center">Type {renderSortIcon('state')}</div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-foreground" onClick={() => handleSort('expire')}>
                    <div className="flex items-center">Expires {renderSortIcon('expire')}</div>
                  </TableHead>
                  <TableHead className="text-center cursor-pointer hover:text-foreground" onClick={() => handleSort('isDhcpReserved')}>
                    <div className="flex items-center justify-center">Reserved {renderSortIcon('isDhcpReserved')}</div>
                  </TableHead>
                  <TableHead className="text-center cursor-pointer hover:text-foreground" onClick={() => handleSort('isActiveInArp')}>
                    <div className="flex items-center justify-center">Active (ARP) {renderSortIcon('isActiveInArp')}</div>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      Loading leases...
                    </TableCell>
                  </TableRow>
                ) : leases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      No active Kea DHCP leases found or matching your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  displayedLeases.map((lease) => (
                    <TableRow key={lease.address + lease.hwaddr}>
                      <TableCell className="font-medium font-mono text-sm min-w-[120px]">{lease.address}</TableCell>
                      <TableCell className="font-mono text-sm min-w-[140px]">{lease.hwaddr}</TableCell>
                      <TableCell className="min-w-[120px] max-w-[200px]">
                        <span className="break-words">{lease.hostname || '-'}</span>
                      </TableCell>
                      <TableCell className="min-w-[120px] max-w-[200px]">
                        <span className="break-words">{lease.dhcpReservedHostname || '-'}</span>
                      </TableCell>
                      <TableCell className="min-w-[120px] max-w-[200px]">
                        {lease.hostAliasConflict ? (
                          <span className="text-orange-600 font-medium break-words">Multiple Host Aliases Conflict</span>
                        ) : (
                          <span className="break-words">{lease.hostAlias || '-'}</span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-[150px] max-w-[300px]">
                        <span className="break-words">{lease.if_descr || '-'}</span>
                      </TableCell>
                      <TableCell className="min-w-[80px]">{lease.state === '0' ? 'Active' : 'Expired'}</TableCell>
                      <TableCell className="min-w-[150px] text-sm">{lease.expire ? new Date(parseInt(lease.expire) * 1000).toLocaleString() : '-'}</TableCell>
                      <TableCell className="text-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              {lease.hasDhcpConflict ? (
                                <TriangleAlert className="h-5 w-5 text-orange-500" />
                              ) : lease.isDhcpReserved ? (
                                (() => {
                                  const isPrivacyMac = lease.hwaddr && checkMacRandomization(lease.hwaddr).isRandomized;
                                  return isPrivacyMac ? (
                                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                                  ) : (
                                    <CheckCircle className="h-5 w-5 text-green-500" />
                                  );
                                })()
                              ) : (
                                <XCircle className="h-5 w-5 text-red-500" />
                              )}
                            </TooltipTrigger>
                            <TooltipContent>
                              {lease.hasDhcpConflict ? (
                                <>
                                  <p>MAC address is reserved for a different IP address</p>
                                  {lease.dhcpReservedIp && lease.dhcpReservedMac && (
                                    <p className="mt-1 text-sm text-muted-foreground">MAC {lease.dhcpReservedMac} is reserved for IP {lease.dhcpReservedIp}</p>
                                  )}
                                </>
                              ) : lease.isDhcpReserved ? (
                                (() => {
                                  const isPrivacyMac = lease.hwaddr && checkMacRandomization(lease.hwaddr).isRandomized;
                                  return isPrivacyMac ? (
                                    <p>Reserved but Privacy MAC Address detected.</p>
                                  ) : (
                                    <p>This IP and MAC have a DHCP reservation.</p>
                                  );
                                })()
                              ) : (
                                <p>This IP and MAC do NOT have a DHCP reservation.</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="text-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              {lease.hasArpConflict ? (
                                <TriangleAlert className="h-5 w-5 text-yellow-500" />
                              ) : lease.isActiveInArp ? (
                                <CheckCircle className="h-5 w-5 text-green-500" />
                              ) : (
                                <XCircle className="h-5 w-5 text-red-500" />
                              )}
                            </TooltipTrigger>
                            <TooltipContent>
                              {lease.hasArpConflict ? (
                                <>
                                  <p>ARP Conflict Detected!</p>
                                  {lease.activeArpIp && lease.activeArpMac && (
                                    <p className="mt-1 text-sm text-muted-foreground">Current ARP: {lease.activeArpIp} ({lease.activeArpMac})</p>
                                  )}
                                </>
                              ) : lease.isActiveInArp ? (
                                <p>IP and MAC match an active ARP entry.</p>
                              ) : (
                                <>
                                  <p>IP and MAC do NOT match an active ARP entry.</p>
                                  {lease.activeArpIp && lease.activeArpMac && (
                                    <p className="mt-1 text-sm text-muted-foreground">Current ARP: {lease.activeArpIp} ({lease.activeArpMac})</p>
                                  )}
                                </>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="text-right min-w-[160px]">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSelectLease(lease)}
                          title="Set as Reservation"
                        >
                          <PlusCircle className="h-4 w-4 mr-2" />
                          Set as Reservation
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Loading leases...</p>
                </div>
              </div>
            ) : leases.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">No active Kea DHCP leases found.</p>
              </div>
            ) : (
              <div className="space-y-3 p-2">
                {displayedLeases.map((lease) => (
                  <Card key={lease.address + lease.hwaddr} className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-medium">
                          {lease.address}
                        </span>
                        <div className="flex gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                {lease.hasArpConflict ? (
                                  <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                                    <TriangleAlert className="h-3 w-3 mr-1" />
                                    ARP Conflict
                                  </Badge>
                                ) : lease.isActiveInArp ? (
                                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Active
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Inactive
                                  </Badge>
                                )}
                              </TooltipTrigger>
                              <TooltipContent>
                                {lease.hasArpConflict ? (
                                  <>
                                    <p>ARP Conflict Detected!</p>
                                    {lease.activeArpIp && lease.activeArpMac && (
                                      <p className="mt-1 text-sm text-muted-foreground">Current ARP: {lease.activeArpIp} ({lease.activeArpMac})</p>
                                    )}
                                  </>
                                ) : lease.isActiveInArp ? (
                                  <p>IP and MAC match an active ARP entry.</p>
                                ) : (
                                  <>
                                    <p>IP and MAC do NOT match an active ARP entry.</p>
                                    {lease.activeArpIp && lease.activeArpMac && (
                                      <p className="mt-1 text-sm text-muted-foreground">Current ARP: {lease.activeArpIp} ({lease.activeArpMac})</p>
                                    )}
                                  </>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {lease.isDhcpReserved && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                              Reserved
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="font-medium text-muted-foreground">MAC Address:</span>
                          <p className="text-foreground font-mono">{lease.hwaddr}</p>
                        </div>
                        <div>
                          <span className="font-medium text-muted-foreground">Hostname:</span>
                          <p className="text-foreground truncate">{lease.hostname || '-'}</p>
                        </div>
                        <div>
                          <span className="font-medium text-muted-foreground">DHCP Hostname:</span>
                          <p className="text-foreground truncate">{lease.dhcpReservedHostname || '-'}</p>
                        </div>
                        <div>
                          <span className="font-medium text-muted-foreground">Host Alias:</span>
                          <p className="text-foreground truncate">{lease.hostAlias || '-'}</p>
                        </div>
                        <div>
                          <span className="font-medium text-muted-foreground">Type:</span>
                          <p className="text-foreground">{lease.state || '-'}</p>
                        </div>
                        <div>
                          <span className="font-medium text-muted-foreground">Expires:</span>
                          <p className="text-foreground text-xs">
                            {lease.expire ? new Date(parseInt(lease.expire) * 1000).toLocaleString() : '-'}
                          </p>
                        </div>
                      </div>

                      <div>
                        <span className="font-medium text-muted-foreground">Description:</span>
                        <p className="text-foreground text-sm break-words">{lease.if_descr || '-'}</p>
                      </div>

                      <div className="flex justify-end pt-2 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSelectLease(lease)}
                          className="text-xs"
                        >
                          Set as Reservation
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pagination */}
        {leases.length > 0 && (
          <div className="px-6 py-4 border-t">
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={leases.length}
              filteredCount={filteredLeases.length}
              pageSize={pageSize}
              onPageChange={async (page) => {
                setIsButtonRefreshing(true);
                await new Promise(resolve => setTimeout(resolve, 500));
                handlePageChange(page);
                setIsButtonRefreshing(false);
              }}
              onPageSizeChange={handlePageSizeChange}
              isLoading={isLoading || isButtonRefreshing}
              isLoadMoreMode={isPhone}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}