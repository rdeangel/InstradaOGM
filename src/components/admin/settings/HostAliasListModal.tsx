'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, X, Router, Network, Activity, Info } from 'lucide-react';
import { StatusDotWithTooltip, getHostAliasStatusColor } from '@/components/ui/status-dot';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { useIsPhone } from '@/hooks/use-mobile';
import { useLocalStorage } from '@/hooks/use-local-storage';

interface HostAlias {
  uuid: string;
  name: string;
  content: string;
  description: string;
  enabled: string;
  memberOfGroups: Array<{
    uuid: string;
    name: string;
    friendlyName?: string;
    iconIdentifier?: string;
  }>;
  detectedMac?: string | null;
  detectedVendor?: string | null;
  detectedHostname?: string | null;
  isDhcpReserved?: boolean;
  dhcpReservedMac?: string | null;
  dhcpReservedVendor?: string | null;
  category?: 'managed' | 'unmanaged';
}

interface HostAliasListModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  hostAliases: HostAlias[];
  category: 'managed' | 'unmanaged' | 'total';
  vpnConnectionStatuses?: Map<string, { status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string }>;
  groupVpnMap?: Map<string, string>;
}

export function HostAliasListModal({
  isOpen,
  onClose,
  title,
  description,
  hostAliases,
  category,
  vpnConnectionStatuses = new Map(),
  groupVpnMap = new Map(),
}: HostAliasListModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useLocalStorage<number | 'ALL'>('host-alias-modal-page-size', 25);
  const [totalPages, setTotalPages] = useState(1);
  const [displayedAliases, setDisplayedAliases] = useState<HostAlias[]>([]);
  const isPhone = useIsPhone();



  // Filter aliases based on search term - memoized to prevent infinite loop
  const filteredAliases = useMemo(() => {
    return hostAliases.filter(alias =>
      alias.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alias.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alias.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (alias.detectedMac && alias.detectedMac.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (alias.detectedVendor && alias.detectedVendor.toLowerCase().includes(searchTerm.toLowerCase())) ||
      alias.memberOfGroups.some(group =>
        group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (group.friendlyName && group.friendlyName.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    );
  }, [hostAliases, searchTerm]);

  // Calculate total pages when filtered results or page size changes
  useEffect(() => {
    const newTotalPages = pageSize === 'ALL' ? 1 : Math.ceil(filteredAliases.length / (pageSize as number));
    setTotalPages(newTotalPages);
  }, [filteredAliases.length, pageSize]);

  // Handle pagination - update displayed aliases
  useEffect(() => {
    if (pageSize === 'ALL') {
      setDisplayedAliases(filteredAliases);
      return;
    }

    // Mobile: Load More mode - show cumulative items from page 1 to currentPage
    if (isPhone) {
      const endIndex = currentPage * (pageSize as number);
      setDisplayedAliases(filteredAliases.slice(0, endIndex));
      return;
    }

    // Desktop: Show only current page
    const startIndex = (currentPage - 1) * (pageSize as number);
    const endIndex = startIndex + (pageSize as number);
    setDisplayedAliases(filteredAliases.slice(startIndex, endIndex));
  }, [filteredAliases, currentPage, pageSize, isPhone]);

  // Reset to page 1 when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const getCategoryColor = (aliasCategory?: string) => {
    switch (aliasCategory) {
      case 'managed':
        return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20';
      case 'unmanaged':
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getCategoryIcon = (aliasCategory?: string) => {
    switch (aliasCategory) {
      case 'managed':
        return <Router className="w-3 h-3" />;
      case 'unmanaged':
        return <Network className="w-3 h-3" />;
      default:
        return <Activity className="w-3 h-3" />;
    }
  };

  const getVpnInfoForAlias = (alias: HostAlias) => {
    if (!alias.memberOfGroups || alias.memberOfGroups.length === 0) {
      return null;
    }

    for (const group of alias.memberOfGroups) {
      const vpnUuid = groupVpnMap.get(group.uuid);
      if (vpnUuid) {
        const vpnInfo = vpnConnectionStatuses.get(vpnUuid);
        if (vpnInfo) {
          return { ...vpnInfo, vpnUuid, groupName: group.friendlyName || group.name };
        }
      }
    }
    return null;
  };

  const getStatusTooltip = (alias: HostAlias) => {
    const isEnabled = alias.enabled === '1';
    const hasArpEntry = !!alias.detectedMac;
    const vpnInfo = getVpnInfoForAlias(alias);

    let tooltip = `**${alias.name}**\n`;
    tooltip += `IP Address: ${alias.content}\n`;

    if (alias.description) {
      tooltip += `Description: ${alias.description}\n`;
    }

    if (!isEnabled) {
      tooltip += `Status: Disabled`;
      return tooltip;
    }

    if (vpnInfo && vpnInfo.status !== 'connected') {
      tooltip += `Status: VPN down (${vpnInfo.groupName} - ${vpnInfo.type})`;
      return tooltip;
    }

    if (hasArpEntry) {
      tooltip += `Status: Online (ARP active)`;
      if (alias.detectedMac) {
        tooltip += `\nMAC: ${alias.detectedMac}`;
      }
      if (alias.detectedVendor) {
        tooltip += `\nVendor: ${alias.detectedVendor}`;
      }
      if (alias.detectedHostname) {
        tooltip += `\nHostname: ${alias.detectedHostname}`;
      }
    } else {
      tooltip += `Status: Offline (no ARP detected)`;
    }

    if (alias.isDhcpReserved) {
      tooltip += `\nDHCP: Reserved`;
      if (alias.dhcpReservedMac) {
        tooltip += ` (${alias.dhcpReservedMac})`;
      }
    }

    if (alias.memberOfGroups && alias.memberOfGroups.length > 0) {
      tooltip += `\nGroups: ${alias.memberOfGroups.map(g => g.friendlyName || g.name).join(', ')}`;
    }

    return tooltip;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col bg-card border border-border p-0 gap-0">
        <DialogHeader className="border-b border-border pb-4 px-6 pt-6 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-card-foreground">
            <Router className="w-5 h-5 text-primary" />
            {title}
            <Badge variant="secondary" className="ml-2 bg-muted text-muted-foreground">
              {hostAliases.length} {hostAliases.length === 1 ? 'alias' : 'aliases'}
            </Badge>
            <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary ml-4"
                  onClick={() => setHelpDialogOpen(true)}
                >
                  <Info className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Host Alias Statistics Help</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                  <div>
                    <strong>Status Indicators:</strong>
                    <ul className="mt-1 ml-4 space-y-1 list-disc">
                      <li><span className="text-green-600">Green dot:</span> Device is online (active in ARP table)</li>
                      <li><span className="text-muted-foreground">Outline dot:</span> Device is offline (not in ARP table)</li>
                      <li><span className="text-red-600">Red dot:</span> VPN connection is down</li>
                      <li><span className="text-gray-500">Gray dot:</span> Host alias is disabled</li>
                    </ul>
                  </div>
                  <div>
                    <strong>Search Features:</strong>
                    <ul className="mt-1 ml-4 space-y-1 list-disc">
                      <li>Search by host alias name</li>
                      <li>Search by IP address</li>
                      <li>Search by MAC address</li>
                      <li>Search by vendor information</li>
                      <li>Search by network group names</li>
                    </ul>
                  </div>
                  <div>
                    <strong>Categories:</strong>
                    <ul className="mt-1 ml-4 space-y-1 list-disc">
                      <li><span className="text-green-600">Managed:</span> Host aliases that can be managed by the system</li>
                      <li><span className="text-orange-600">Unmanaged:</span> Host aliases filtered out by group filters</li>
                      <li><span className="text-blue-600">Total:</span> All host aliases (managed + unmanaged)</li>
                    </ul>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">{description}</DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative flex-shrink-0 px-6 py-4">
          <Search className="absolute left-9 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search by name, IP, MAC, vendor, or group..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-10 bg-background border-input"
          />
          {searchTerm && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchTerm('')}
              className="absolute right-7 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-muted"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Results count */}
        {searchTerm && (
          <div className="text-sm text-muted-foreground flex-shrink-0 px-6 pb-3">
            Showing {filteredAliases.length} of {hostAliases.length} aliases
          </div>
        )}

        {/* Host Aliases List - Scrollable Area */}
        <div className="flex-1 min-h-0 overflow-hidden px-6 py-4">
          <ScrollArea className="h-full">
            <div className="space-y-3 pr-4">
              {filteredAliases.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm ? 'No aliases match your search criteria.' : 'No aliases found.'}
                </div>
              ) : (
                displayedAliases.map((alias) => (
                  <div
                    key={alias.uuid}
                    className="border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors bg-card"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {/* Header with name and category */}
                        <div className="flex items-center gap-2 mb-2">
                          <StatusDotWithTooltip
                            color={getHostAliasStatusColor(
                              alias.enabled === '1',
                              !!alias.detectedMac
                            )}
                            tooltip={getStatusTooltip(alias)}
                            size="sm"
                          />
                          <h4 className="font-medium text-lg">{alias.name}</h4>
                          {alias.category && category === 'total' && (
                            <Badge className={`text-xs ${getCategoryColor(alias.category)}`}>
                              {getCategoryIcon(alias.category)}
                              <span className="ml-1 capitalize">{alias.category}</span>
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className={alias.enabled === '1'
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                              : 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30'
                            }
                          >
                            {alias.enabled === '1' ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </div>

                        {/* IP Address */}
                        <div className="mb-2">
                          <span className="text-sm font-medium text-muted-foreground">IP Address: </span>
                          <code className="bg-muted px-2 py-1 rounded text-sm text-foreground">{alias.content}</code>
                        </div>



                        {/* MAC Address and Vendor */}
                        {alias.detectedMac && (
                          <div className="mb-2">
                            <span className="text-sm font-medium text-muted-foreground">MAC Address: </span>
                            <code className="bg-muted px-2 py-1 rounded text-sm text-foreground">{alias.detectedMac}</code>
                            {alias.detectedVendor && (
                              <span className="ml-2 text-sm text-muted-foreground">({alias.detectedVendor})</span>
                            )}
                          </div>
                        )}

                        {/* Network Groups */}
                        {alias.memberOfGroups && alias.memberOfGroups.length > 0 ? (
                          <div className="mb-2">
                            <span className="text-sm font-medium text-muted-foreground">Network Groups: </span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {alias.memberOfGroups.map((group, idx) => (
                                <Badge
                                  key={`${group.uuid}-${idx}`}
                                  variant="outline"
                                  className="text-xs bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30"
                                >
                                  {group.friendlyName || group.name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="mb-2">
                            <span className="text-sm font-medium text-muted-foreground">Network Groups: </span>
                            <span className="text-sm text-muted-foreground">Not assigned to any groups</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Pagination */}
        {filteredAliases.length > 0 && (
          <div className="py-4 border-t flex-shrink-0 px-6">
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={hostAliases.length}
              filteredCount={filteredAliases.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setCurrentPage(1);
              }}
              isLoadMoreMode={isPhone}
              pageSizeOptions={[10, 25, 50, 100]}
            />
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t flex-shrink-0 px-6 pb-6">
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
