/* eslint-disable security/detect-object-injection */
// This component uses bracket notation with typed keys from objects. All uses are safe.
import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Loader2, ArrowUpDown, ArrowUp, ArrowDown, CheckCircle, XCircle, TriangleAlert, RefreshCw, AlertCircle } from 'lucide-react'; // Added sorting icons, status icons, warning icon, and refresh icon
import { sortIpAddresses } from '@/lib/network-utils';
import { checkMacRandomization } from '@/lib/mac-utils';
import type { OpnsenseDhcpReservation } from '@/types/opnsense';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'; // Import Tooltip components
import { useLocalStorage } from '@/hooks/use-local-storage';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { useIsMobile, useIsPhone } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface SubnetInfo {
  uuid: string;
  subnet: string;
}

interface DhcpReservationsTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReservationsDeleted: () => void; // Callback to refresh data in parent
}

export function DhcpReservationsTableModal({ isOpen, onClose, onReservationsDeleted }: DhcpReservationsTableModalProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const isPhone = useIsPhone();
  const [reservations, setReservations] = useState<OpnsenseDhcpReservation[]>([]);
  const [filteredReservations, setFilteredReservations] = useState<OpnsenseDhcpReservation[]>([]);
  const [displayedReservations, setDisplayedReservations] = useState<OpnsenseDhcpReservation[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReservationUuids, setSelectedReservationUuids] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isButtonRefreshing, setIsButtonRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sortColumn, setSortColumn] = useState<keyof OpnsenseDhcpReservation | null>('ip_address'); // Default sort by IP address
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc'); // Default sort direction
  const [subnets, setSubnets] = useState<SubnetInfo[]>([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useLocalStorage<number>('dhcp-reservations-table-page-size', 25);
  const [totalPages, setTotalPages] = useState(1);

  const fetchSubnets = useCallback(async () => {
    try {
      const response = await fetch('/api/opnsense/dhcp?action=subnets');
      if (!response.ok) {
        throw new Error('Failed to fetch DHCP subnets');
      }
      const fetchedSubnets = await response.json();
      setSubnets(fetchedSubnets);
    } catch (error) {
      console.error("Failed to fetch DHCP subnets:", error);
      // Don't show toast for subnet fetch errors as it's not critical
    }
  }, []);

  const fetchReservations = useCallback(async (isRefresh = false) => {
    // Only set loading to true for initial load, not for refresh
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      const response = await fetch('/api/opnsense/dhcp?action=list_reservations');
      if (!response.ok) {
        throw new Error('Failed to fetch DHCP reservations');
      }
      const result = await response.json();
      if (result.success) {
        setReservations(result.reservations);
        setFilteredReservations(result.reservations);
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to load DHCP reservations.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to load DHCP reservations: ${(error as Error).message}`,
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
      fetchSubnets();
      fetchReservations();
      setSearchTerm('');
      setSelectedReservationUuids(new Set());
    }
  }, [isOpen, fetchSubnets, fetchReservations]);

  // Client-side filtering and sorting
  useEffect(() => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    const filtered = reservations.filter(res =>
      res.ip_address.toLowerCase().includes(lowerCaseSearchTerm) ||
      res.hw_address.toLowerCase().includes(lowerCaseSearchTerm) ||
      (res.hostname?.toLowerCase().includes(lowerCaseSearchTerm)) ||
      (res.actualHostname?.toLowerCase().includes(lowerCaseSearchTerm)) ||
      (res.description?.toLowerCase().includes(lowerCaseSearchTerm)) ||
      (res.hostAlias?.toLowerCase().includes(lowerCaseSearchTerm))
    );

    let sorted = filtered;
    if (sortColumn) {
      sorted = [...filtered].sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        if (sortColumn === 'ip_address') {
          return sortDirection === 'asc' ? sortIpAddresses(aValue as string, bValue as string) : sortIpAddresses(bValue as string, aValue as string);
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        } else if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
          // Sort booleans: true comes before false for 'asc', false before true for 'desc'
          return sortDirection === 'asc' ? (aValue === bValue ? 0 : aValue ? -1 : 1) : (aValue === bValue ? 0 : aValue ? 1 : -1);
        }
        // Fallback for mixed types or undefined values
        if (aValue === undefined || aValue === null) return sortDirection === 'asc' ? 1 : -1;
        if (bValue === undefined || bValue === null) return sortDirection === 'asc' ? -1 : 1;
        return 0;
      });
    }

    setFilteredReservations(sorted);
    setTotalPages(Math.ceil(sorted.length / pageSize));

    // Reset to page 1 when search changes
    if (searchTerm !== '') {
      setCurrentPage(1);
    }
  }, [searchTerm, reservations, sortColumn, sortDirection, pageSize]);

  // Client-side pagination
  useEffect(() => {
    if (isPhone) {
      const paginated = filteredReservations.slice(0, currentPage * pageSize);
      setDisplayedReservations(paginated);
    } else {
      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginated = filteredReservations.slice(startIndex, endIndex);
      setDisplayedReservations(paginated);
    }
  }, [filteredReservations, currentPage, pageSize, isPhone]);

  // Helper function to get subnet name from UUID
  const getSubnetName = useCallback((subnetUuid: string): string => {
    const subnet = subnets.find(s => s.uuid === subnetUuid);
    return subnet ? subnet.subnet : subnetUuid; // Fallback to UUID if not found
  }, [subnets]);

  const handleSelectReservation = useCallback((uuid: string, isChecked: boolean) => {
    setSelectedReservationUuids(prev => {
      const newSet = new Set(prev);
      if (isChecked) {
        newSet.add(uuid);
      } else {
        newSet.delete(uuid);
      }
      return newSet;
    });
  }, []);

  const handleSort = (column: keyof OpnsenseDhcpReservation) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (column: keyof OpnsenseDhcpReservation) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="ml-2 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4" />
    );
  };

  const handleSelectAll = useCallback((isChecked: boolean) => {
    if (isChecked) {
      const allUuids = new Set(filteredReservations.map(res => res.uuid).filter(Boolean) as string[]);
      setSelectedReservationUuids(allUuids);
    } else {
      setSelectedReservationUuids(new Set());
    }
  }, [filteredReservations]);

  // Pagination handlers
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handlePageSizeChange = useCallback((newPageSize: number | 'ALL') => {
    if (newPageSize === 'ALL') {
      setPageSize(filteredReservations.length);
    } else {
      setPageSize(newPageSize);
    }
    setCurrentPage(1);
  }, [setPageSize, filteredReservations.length]);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedReservationUuids.size === 0) {
      toast({
        title: "No Reservations Selected",
        description: "Please select at least one reservation to delete.",
        variant: "default",
      });
      return;
    }

    setIsDeleting(true);
    try {
      const uuidsToDelete = Array.from(selectedReservationUuids);
      // Map selected UUIDs to their full reservation objects for detailed logging
      const reservationsToDeleteDetails = uuidsToDelete.map(uuid => {
        const reservation = reservations.find(res => res.uuid === uuid);
        return reservation ? {
          uuid: reservation.uuid,
          ip_address: reservation.ip_address,
          hw_address: reservation.hw_address,
          hostname: reservation.hostname,
          description: reservation.description,
          subnet: reservation.subnet,
        } : { uuid }; // Fallback to just UUID if details not found (shouldn't happen if `reservations` is up-to-date)
      });

      const response = await fetch('/api/opnsense/dhcp?action=del_reservations_bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationUuids: uuidsToDelete,
          reservationDetails: reservationsToDeleteDetails, // Pass full details for logging
        }),
      });
      const result = await response.json();

      if (response.ok && result.success) {
        toast({
          title: "Reservations Deleted",
          description: `${uuidsToDelete.length} DHCP reservation(s) successfully deleted.`,
          variant: "success",
        });
        setSelectedReservationUuids(new Set());
        fetchReservations(); // Refresh the list
        onReservationsDeleted(); // Notify parent to refresh its state
      } else {
        toast({
          title: "Failed to Delete Reservations",
          description: result.message || "Failed to delete DHCP reservation(s) on OPNsense.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: `An unexpected error occurred while deleting reservations: ${(error as Error).message}`,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }, [selectedReservationUuids, toast, fetchReservations, onReservationsDeleted, reservations]);

  const allSelected = filteredReservations.length > 0 && selectedReservationUuids.size === filteredReservations.length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Configured DHCP Reservations</DialogTitle>
          <DialogDescription>View and manage existing static DHCP leases.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 mb-4">
          <Input
            placeholder="Search by IP, MAC, hostname, DHCP hostname, host alias, or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-grow"
          />
          <Button
            onClick={() => fetchReservations(true)}
            variant="outline"
            disabled={isRefreshing || isLoading || isDeleting}
            size={isMobile ? 'default' : 'default'}
            className={isMobile ? 'px-3' : ''}
            key={refreshKey} // Force re-render when refresh key changes
          >
            {isRefreshing || isLoading ? (
              <>
                <Loader2 className={cn("h-4 w-4 animate-spin", !isMobile && "mr-2")} />
                {!isMobile && 'Loading...'}
              </>
            ) : (
              <>
                <RefreshCw className={cn("h-4 w-4", !isMobile && "mr-2")} />
                {!isMobile && 'Refresh'}
              </>
            )}
          </Button>
          <Button
            onClick={handleDeleteSelected}
            variant="destructive"
            disabled={selectedReservationUuids.size === 0 || isDeleting}
            size={isMobile ? 'default' : 'default'}
            className={isMobile ? 'px-3' : ''}
          >
            {isDeleting ? (
              <>
                <Loader2 className={cn("h-4 w-4 animate-spin", !isMobile && "mr-2")} />
                {!isMobile && 'Deleting...'}
              </>
            ) : (
              <>
                <Trash2 className={cn("h-4 w-4", !isMobile && "mr-2")} />
                {!isMobile && `Delete Selected (${selectedReservationUuids.size})`}
              </>
            )}
          </Button>
        </div>
        <div className="flex-grow overflow-auto">
          {/* Desktop Table View */}
          <div className="hidden md:block border rounded-md">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow><TableHead className="w-[50px]"><Checkbox checked={allSelected} onCheckedChange={handleSelectAll} disabled={filteredReservations.length === 0} /></TableHead><TableHead className="cursor-pointer hover:text-foreground" onClick={() => handleSort('ip_address')}><div className="flex items-center">IP Address {renderSortIcon('ip_address')}</div></TableHead><TableHead className="cursor-pointer hover:text-foreground" onClick={() => handleSort('hw_address')}><div className="flex items-center">MAC Address {renderSortIcon('hw_address')}</div></TableHead><TableHead className="cursor-pointer hover:text-foreground" onClick={() => handleSort('actualHostname')}><div className="flex items-center">Hostname {renderSortIcon('actualHostname')}</div></TableHead><TableHead className="cursor-pointer hover:text-foreground max-w-[150px]" onClick={() => handleSort('hostname')}><div className="flex items-center whitespace-normal">DHCP Hostname {renderSortIcon('hostname')}</div></TableHead><TableHead className="cursor-pointer hover:text-foreground max-w-[150px]" onClick={() => handleSort('hostname')}><div className="flex items-center whitespace-normal">Host Alias {renderSortIcon('hostname')}</div></TableHead><TableHead className="cursor-pointer hover:text-foreground" onClick={() => handleSort('description')}><div className="flex items-center">Description {renderSortIcon('description')}</div></TableHead><TableHead className="text-center cursor-pointer hover:text-foreground" onClick={() => handleSort('isActiveInArp')}><div className="flex items-center justify-center">Active (ARP) {renderSortIcon('isActiveInArp')}</div></TableHead><TableHead className="cursor-pointer hover:text-foreground" onClick={() => handleSort('subnet')}><div className="flex items-center">Subnet {renderSortIcon('subnet')}</div></TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8"> {/* Increased colspan */}
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      <p className="mt-2">Loading reservations...</p>
                    </TableCell>
                  </TableRow>
                ) : filteredReservations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground"> {/* Increased colspan */}
                      No DHCP reservations found.
                    </TableCell>
                  </TableRow>
                ) : (
                  displayedReservations.map((reservation) => (
                    <TableRow key={reservation.uuid}>
                      <TableCell className="w-[50px]">
                        <Checkbox
                          checked={selectedReservationUuids.has(reservation.uuid || '')}
                          onCheckedChange={(checked) => handleSelectReservation(reservation.uuid || '', checked as boolean)}
                          disabled={!reservation.uuid}
                        />
                      </TableCell>
                      <TableCell className="min-w-[120px] font-mono text-sm">{reservation.ip_address || '-'}</TableCell>
                      <TableCell className="min-w-[140px] font-mono text-sm">{reservation.hw_address || '-'}</TableCell>
                      <TableCell className="min-w-[120px] max-w-[200px]">
                        <span className="break-words">{reservation.actualHostname || '-'}</span>
                      </TableCell>
                      <TableCell className="min-w-[120px] max-w-[200px]">
                        <span className="break-words">{reservation.hostname || '-'}</span>
                      </TableCell>
                      <TableCell className="min-w-[120px] max-w-[200px]">
                        {reservation.hostAliasConflict ? (
                          <span className="text-orange-600 font-medium break-words">Multiple Host Aliases Conflict</span>
                        ) : (
                          <span className="break-words">{reservation.hostAlias || '-'}</span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-[150px] max-w-[300px]">
                        <span className="break-words">{reservation.description || '-'}</span>
                      </TableCell>
                      <TableCell className="text-center w-[80px]">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              {reservation.hasArpConflict ? (
                                <TriangleAlert className="h-5 w-5 text-yellow-500" />
                              ) : reservation.isActiveInArp ? (
                                (() => {
                                  const isPrivacyMac = reservation.hw_address && checkMacRandomization(reservation.hw_address).isRandomized;
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
                              {reservation.hasArpConflict ? (
                                <>
                                  <p>ARP Conflict Detected!</p>
                                  {reservation.activeArpIp && reservation.activeArpMac && (
                                    <p className="mt-1 text-sm text-muted-foreground">Current ARP: {reservation.activeArpIp} ({reservation.activeArpMac})</p>
                                  )}
                                </>
                              ) : reservation.isActiveInArp ? (
                                (() => {
                                  const isPrivacyMac = reservation.hw_address && checkMacRandomization(reservation.hw_address).isRandomized;
                                  return isPrivacyMac ? (
                                    <p>Reserved but Privacy MAC Address detected.</p>
                                  ) : (
                                    <p>IP and MAC match an active ARP entry.</p>
                                  );
                                })()
                              ) : (
                                <>
                                  <p>IP and MAC do NOT match an active ARP entry.</p>
                                  {reservation.activeArpIp && reservation.activeArpMac && (
                                    <p className="mt-1 text-sm text-muted-foreground">Current ARP: {reservation.activeArpIp} ({reservation.activeArpMac})</p>
                                  )}
                                </>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="min-w-[120px] max-w-[200px]">
                        <span className="break-words">{getSubnetName(reservation.subnet)}</span>
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
                  <p className="text-sm text-muted-foreground">Loading reservations...</p>
                </div>
              </div>
            ) : filteredReservations.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">No DHCP reservations found.</p>
              </div>
            ) : (
              <div className="space-y-3 p-2">
                {displayedReservations.map((reservation) => (
                  <Card key={reservation.uuid} className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedReservationUuids.has(reservation.uuid || '')}
                            onCheckedChange={(checked) => handleSelectReservation(reservation.uuid || '', checked as boolean)}
                            disabled={!reservation.uuid}
                          />
                          <span className="font-mono text-sm font-medium">
                            {reservation.ip_address}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                {reservation.hasArpConflict ? (
                                  <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                                    <TriangleAlert className="h-3 w-3 mr-1" />
                                    ARP Conflict
                                  </Badge>
                                ) : reservation.isActiveInArp ? (
                                  (() => {
                                    const isPrivacyMac = reservation.hw_address && checkMacRandomization(reservation.hw_address).isRandomized;
                                    return isPrivacyMac ? (
                                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                                        <AlertCircle className="h-3 w-3 mr-1" />
                                        Privacy MAC
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                        <CheckCircle className="h-3 w-3 mr-1" />
                                        Active
                                      </Badge>
                                    );
                                  })()
                                ) : (
                                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Inactive
                                  </Badge>
                                )}
                              </TooltipTrigger>
                              <TooltipContent>
                                {reservation.hasArpConflict ? (
                                  <>
                                    <p>ARP Conflict Detected!</p>
                                    {reservation.activeArpIp && reservation.activeArpMac && (
                                      <p className="mt-1 text-sm text-muted-foreground">Current ARP: {reservation.activeArpIp} ({reservation.activeArpMac})</p>
                                    )}
                                  </>
                                ) : reservation.isActiveInArp ? (
                                  (() => {
                                    const isPrivacyMac = reservation.hw_address && checkMacRandomization(reservation.hw_address).isRandomized;
                                    return isPrivacyMac ? (
                                      <p>Reserved but Privacy MAC Address detected.</p>
                                    ) : (
                                      <p>IP and MAC match an active ARP entry.</p>
                                    );
                                  })()
                                ) : (
                                  <>
                                    <p>IP and MAC do NOT match an active ARP entry.</p>
                                    {reservation.activeArpIp && reservation.activeArpMac && (
                                      <p className="mt-1 text-sm text-muted-foreground">Current ARP: {reservation.activeArpIp} ({reservation.activeArpMac})</p>
                                    )}
                                  </>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="font-medium text-muted-foreground">MAC Address:</span>
                          <p className="text-foreground font-mono">{reservation.hw_address || '-'}</p>
                        </div>
                        <div>
                          <span className="font-medium text-muted-foreground">Hostname:</span>
                          <p className="text-foreground truncate">{reservation.actualHostname || '-'}</p>
                        </div>
                        <div>
                          <span className="font-medium text-muted-foreground">DHCP Hostname:</span>
                          <p className="text-foreground truncate">{reservation.hostname || '-'}</p>
                        </div>
                        <div>
                          <span className="font-medium text-muted-foreground">Host Alias:</span>
                          {reservation.hostAliasConflict ? (
                            <p className="text-orange-600 font-medium text-xs">Multiple Aliases Conflict</p>
                          ) : (
                            <p className="text-foreground truncate">{reservation.hostAlias || '-'}</p>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="font-medium text-muted-foreground">Description:</span>
                        <p className="text-foreground text-sm break-words">{reservation.description || '-'}</p>
                      </div>

                      <div>
                        <span className="font-medium text-muted-foreground">Subnet:</span>
                        <p className="text-foreground text-sm">{getSubnetName(reservation.subnet)}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pagination */}
        {reservations.length > 0 && (
          <div className="px-6 py-4 border-t">
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={reservations.length}
              filteredCount={filteredReservations.length}
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