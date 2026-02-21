'use client';

import { useEffect, useState, useCallback } from 'react';
import type { NetworkGroup, OpnsenseAliasDetailFromExport } from '@/types/opnsense';
import { Role } from '@/types/opnsense';
import { useAuth } from '@/context/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientOnly } from '@/components/util/ClientOnly';
import HostAliasesTab from '@/components/admin/HostAliasesTab';
import { NetworkGroupsTab } from '@/components/admin/NetworkGroupsTab'; // Import the new component
import { ManageDhcpCard } from '@/components/admin/ManageDhcpCard'; // Import the new card component
import { SchedulingTab } from '@/components/admin/SchedulingTab';
import { AppFooter } from '@/components/layout/AppFooter';
import { AppHeader } from '@/components/layout/AppHeader';
import { Loader2, Ban, LogIn, Network as NetworkIconLucide, Laptop, AlertCircle, Server, ChevronDown, ChevronUp, CalendarClock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { logger } from '@/lib/logger';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOpnsenseData } from '@/hooks/useOpnsenseData'; // Import useOpnsenseData

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface EnrichedHostAlias {
  uuid: string;
  name: string;
  type: string;
  content: string;
  description: string;
  enabled: string; // Changed back to string to match the expected type
  proto: string;
  interface: string;
  counters: string;
  updatefreq: string;
  categories: string;
  memberOfGroups: { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null; groupType?: 'SingleSelect' | 'MultiSelect' }[];
  vpnStatus: 'connected' | 'disconnected' | 'disabled' | null;
  vpnName: string | null;
  vpnUuid: string | null;
  vpnType: string | null;
  vpnEnabled: string | null;
}

export default function AdminPage() {
  const { data: session, status: authStatus } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Removed unused currentYear
  const [mounted, setMounted] = useState(false);
  // State for managing the admin panel
  const [activeTab, setActiveTab] = useLocalStorage<string>('admin-panel-active-tab', "network-groups");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showConnectionErrorModal, setShowConnectionErrorModal] = useState(false);

  // State for host aliases (still needed for HostAliasesTab)
  const [hostAliases, setHostAliases] = useState<EnrichedHostAlias[]>([]);
  const [hostAliasesError, setHostAliasesError] = useState<string | null>(null);

  // State for network groups sort
  const [networkGroupsSort, setNetworkGroupsSort] = useState<{ sortBy: string; sortDirection: 'asc' | 'desc' }>({ sortBy: 'displayName', sortDirection: 'asc' });
  const [hostAliasesSort, setHostAliasesSort] = useState<{ sortBy: string; sortDirection: 'asc' | 'desc' }>({ sortBy: 'name', sortDirection: 'asc' });

  // Add pagination state for all tabs
  const [networkGroupsCurrentPage, setNetworkGroupsCurrentPage] = useState(1);
  const [networkGroupsPageSize, setNetworkGroupsPageSize] = useLocalStorage<number | 'ALL'>('network-groups-table-page-size', 5);
  const [hostAliasesCurrentPage, setHostAliasesCurrentPage] = useState(1);
  const [hostAliasesPageSize, setHostAliasesPageSize] = useLocalStorage<number | 'ALL'>('host-aliases-table-page-size', 5);

  // Add search state for all tabs to persist across tab switches
  const [networkGroupsSearchTerm, setNetworkGroupsSearchTerm] = useState("");
  const [hostAliasesSearchTerm, setHostAliasesSearchTerm] = useState("");

  // Add DHCP form state for memoization
  const [dhcpSelectedAlias, setDhcpSelectedAlias] = useState<OpnsenseAliasDetailFromExport | null>(null);
  const [dhcpIpAddress, setDhcpIpAddress] = useState('');
  const [dhcpMacAddress, setDhcpMacAddress] = useState('');
  const [dhcpHostname, setDhcpHostname] = useState('');
  const [dhcpDescription, setDhcpDescription] = useState('');
  const [dhcpSelectedSubnet, setDhcpSelectedSubnet] = useState('');

  // State to track if data has been loaded for each tab
  const [hasLoadedNetworkGroups, setHasLoadedNetworkGroups] = useState(false);
  const [hasLoadedHostAliases, setHasLoadedHostAliases] = useState(false);

  // Use useOpnsenseData to fetch groups and mappings (must be before fetchHostAliases)
  const {
    groups: networkGroups, // Get network groups from hook
    vpnConnectionStatuses, // Get VPN connection statuses
    groupVpnMap, // Get group VPN map
    vpnMappings, // Get VPN mappings
    opnsenseGroupDisplays, // Get OPNsense group display mappings
    isLoadingGroups,
    isLoadingMappings,
    isLoadingVpnStatuses,
    isRefreshing: isRefreshingOpnsenseData, // Get refreshing state from hook
    showConnectionErrorModal: opnsenseConnectionError, // Get connection error state from hook
    refreshData: refreshOpnsenseData, // Get the refresh function
    refreshVpnData, // Get VPN-specific refresh function
    allEmojiValues, // Get custom emoji values
    allFlagValues, // Get custom flag values
  } = useOpnsenseData(mounted && authStatus === 'authenticated' && (session?.user?.role === Role.ADMIN || session?.user?.role === Role.SUPER_ADMIN), 'admin');

  // Function to fetch host aliases data with full enrichment
  const fetchHostAliases = useCallback(async () => {
    setHostAliasesError(null);

    try {
      // Fetch host aliases
      const hostAliasesResponse = await fetch('/api/opnsense/host-alias-management');
      if (!hostAliasesResponse.ok) {
        const errorData = await hostAliasesResponse.json();
        throw new Error(errorData.message || `Failed to fetch filtered host aliases: ${hostAliasesResponse.statusText}`);
      }
      const hostAliasesJson = await hostAliasesResponse.json();
      let fetchedHostAliases = hostAliasesJson.displayableHostAliases;
      if (!Array.isArray(fetchedHostAliases)) {
        logger.error('Expected array for fetchedHostAliases, got:', fetchedHostAliases);
        fetchedHostAliases = [];
      }

      // Fetch all aliases for enrichment context
      const allAliasesResponse = await fetch('/api/opnsense/host-alias-management-admin');
      if (!allAliasesResponse.ok) {
        const errorData = await allAliasesResponse.json();
        throw new Error(errorData.message || `Failed to fetch all aliases: ${allAliasesResponse.statusText}`);
      }
      const allAliasesData = await allAliasesResponse.json();
      const allAliases = Array.isArray(allAliasesData.hostAliases) ? allAliasesData.hostAliases : [];

      // Fetch network groups for enrichment
      const networkGroupsResponse = await fetch('/api/opnsense/network-groups');
      let networkGroups: NetworkGroup[] = [];
      if (networkGroupsResponse.ok) {
        const networkGroupsData = await networkGroupsResponse.json();
        networkGroups = Array.isArray(networkGroupsData.networkGroups) ? networkGroupsData.networkGroups : [];
      }

      // Convert network groups to the same format as host aliases for enrichment
      const networkGroupAliases: EnrichedHostAlias[] = networkGroups.map((group: NetworkGroup) => ({
        uuid: group.uuid,
        name: group.name,
        type: group.type || 'networkgroup',
        content: group.rawContent || '',
        description: group.description,
        enabled: group.enabled ? '1' : '0', // Convert boolean to string
        proto: group.proto || '',
        interface: group.interface || '',
        counters: group.counters || '',
        updatefreq: group.updatefreq || '',
        categories: group.categories || '',
        memberOfGroups: [],
        vpnStatus: null,
        vpnName: null,
        vpnUuid: null,
        vpnType: null,
        vpnEnabled: null,
      }));

      // Combine host aliases and network groups for enrichment
      // Ensure all objects in combinedAliases have a 'content' property
      const combinedAliases: EnrichedHostAlias[] = [...(allAliases as EnrichedHostAlias[]), ...networkGroupAliases];

      // Enrich host aliases with group and VPN info
      const enrichedHostAliases = (fetchedHostAliases as EnrichedHostAlias[]).map((alias) => {
        // Create a map of host alias names to their IP addresses
        const hostNameToIpMap = new Map<string, string>();
        (allAliases as EnrichedHostAlias[]).forEach((a) => {
          if (a.type === 'host' && a.name && a.content) {
            hostNameToIpMap.set(a.name, a.content);
          }
        });

        // Create a map of IP addresses to their groups
        const ipToGroupsMap = new Map<string, { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null; groupType?: 'SingleSelect' | 'MultiSelect' }[]>();

        // Process network groups to build the ipToGroupsMap
        combinedAliases.forEach((a) => {
          if (a.type === 'networkgroup' && a.content && a.uuid) {
            const displayMapping = opnsenseGroupDisplays.find(d => d.opnsenseUuid === a.uuid);

            // Parse the content of the network group (contains hostnames or IPs)
            const members = a.content.split('\n').filter((member) => member.trim() !== '');

            members.forEach((memberName) => {
              // If the member is a host alias name, get its IP address
              const ipAddress = hostNameToIpMap.get(memberName) || memberName;

              // Add this group to the IP's groups list
              const currentGroups = ipToGroupsMap.get(ipAddress) || [];
              ipToGroupsMap.set(ipAddress, [...currentGroups, {
                uuid: a.uuid,
                name: a.name,
                friendlyName: displayMapping?.friendlyName || a.name,
                iconIdentifier: displayMapping?.iconIdentifier || null,
                groupType: displayMapping?.groupType === 'MultiSelect' ? 'MultiSelect' : displayMapping?.groupType === 'SingleSelect' ? 'SingleSelect' : undefined,
              }]);
            });
          }
        });

        // Get groups that this alias's IP address belongs to
        const groupsForAlias = ipToGroupsMap.get(alias.content) || [];

        // Also check if the alias name is directly referenced in any network group
        const groupsByName = ipToGroupsMap.get(alias.name) || [];

        // Combine both sets of groups (by IP and by name)
        const allGroupsForAlias = [...groupsForAlias];
        groupsByName.forEach((group) => {
          if (!allGroupsForAlias.some(g => g.uuid === group.uuid)) {
            allGroupsForAlias.push(group);
          }
        });

        // Find VPN info for the alias
        let vpnStatus: 'connected' | 'disconnected' | 'disabled' | null = null;
        let vpnName: string | null = null;
        let vpnUuid: string | null = null;
        let vpnType: string | null = null;
        let vpnEnabled: string | null = null;

        for (const group of allGroupsForAlias) {
          const mappedVpnUuid = groupVpnMap.get(group.uuid);
          if (mappedVpnUuid) {
            vpnUuid = mappedVpnUuid;
            const vpnInfoFromStatus = vpnConnectionStatuses.get(mappedVpnUuid);

            if (vpnInfoFromStatus) {
              vpnStatus = vpnInfoFromStatus.status;
              vpnType = vpnInfoFromStatus.type;
              vpnEnabled = vpnInfoFromStatus.enabled || null;
            }

            const matchingVpnMapping = vpnMappings.find(vpn => vpn.vpnUuid === mappedVpnUuid);
            if (matchingVpnMapping) {
              vpnName = matchingVpnMapping.friendlyName ?? matchingVpnMapping.vpnName ?? 'Unknown VPN';
            } else {
              // Try to get VPN name from the group display mapping
              const groupDisplay = opnsenseGroupDisplays.find(display => display.opnsenseUuid === group.uuid);
              vpnName = groupDisplay?.friendlyName ?? group.name ?? 'Unknown VPN';
            }

            if (vpnStatus === 'connected') {
              break;
            }
          }
        }

        return {
          ...alias,
          memberOfGroups: allGroupsForAlias,
          vpnStatus: vpnStatus,
          vpnName: vpnName,
          vpnUuid: vpnUuid,
          vpnType: vpnType,
          vpnEnabled: vpnEnabled,
        };
      });

      setHostAliases(enrichedHostAliases);
      setShowConnectionErrorModal(false);
    } catch (err) {
      logger.error("Failed to fetch host aliases:", err);
      const errorMessage = err instanceof Error ? err.message : "Could not load host aliases.";
      setHostAliasesError(errorMessage);
      toast({
        variant: "destructive",
        title: "Error Fetching Host Aliases",
        description: errorMessage,
      });
      setShowConnectionErrorModal(true);
    } finally {
      // Loading states are handled by the HostAliasesTab component
    }
  }, [toast, opnsenseGroupDisplays, groupVpnMap, vpnConnectionStatuses, vpnMappings]);

  // Wrapper function for NetworkGroupsTab refresh
  const handleNetworkGroupsRefresh = useCallback(() => {
    refreshOpnsenseData(true); // Call with inPlace: true to trigger refresh spinner
  }, [refreshOpnsenseData]);

  // Wrapper function for HostAliasesTab refresh - use the same logic as the refresh button
  const handleHostAliasesRefresh = useCallback(async () => {
    // Refresh VPN/mapping data first, then fetch host aliases
    // This matches what the refresh button does: refreshes all data
    await refreshOpnsenseData(true);
    await fetchHostAliases();
  }, [refreshOpnsenseData, fetchHostAliases]);

  // Initial data fetch - only fetch host aliases after VPN data is loaded
  // Remove fetchHostAliases from dependencies to prevent automatic refreshes
  useEffect(() => {
    if (mounted && authStatus === 'authenticated' &&
      (session?.user?.role === Role.ADMIN || session?.user?.role === Role.SUPER_ADMIN) &&
      !isLoadingVpnStatuses && !isLoadingMappings) {
      // Fetch host aliases data after VPN and mapping data has finished loading
      fetchHostAliases();
    }
  }, [mounted, authStatus, session?.user?.role, isLoadingVpnStatuses, isLoadingMappings, fetchHostAliases]);

  // Initial fetch for network groups (after VPN/mapping data is ready)
  useEffect(() => {
    if (mounted && authStatus === 'authenticated' &&
      (session?.user?.role === Role.ADMIN || session?.user?.role === Role.SUPER_ADMIN) &&
      !isLoadingMappings &&
      opnsenseGroupDisplays.length > 0) {
      // fetchNetworkGroups(true); // Removed old fetchNetworkGroups call
    }
  }, [mounted, authStatus, session?.user?.role, isLoadingMappings, opnsenseGroupDisplays.length]);

  useEffect(() => {
    setMounted(true);
    // setCurrentYear(new Date().getFullYear()); // Removed unused currentYear
  }, []);

  // Handle ?tab= query param to allow direct linking to a tab
  useEffect(() => {
    const tabParam = searchParams?.get('tab');
    const validTabs = ['network-groups', 'host-aliases', 'manage-dhcp', 'scheduling'];
    if (tabParam && validTabs.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams, setActiveTab]);

  // Update connection error modal from useOpnsenseData hook
  useEffect(() => {
    setShowConnectionErrorModal(opnsenseConnectionError);
  }, [opnsenseConnectionError]);

  // Set loading to false if user is not authenticated or doesn't have admin role
  useEffect(() => {
    if (mounted && (authStatus === 'unauthenticated' ||
      (authStatus === 'authenticated' && session?.user?.role !== Role.ADMIN && session?.user?.role !== Role.SUPER_ADMIN))) {
      // Loading states are handled by the HostAliasesTab component
    }
  }, [mounted, authStatus, session?.user?.role]);

  // useEffect for "Access Denied" scenario (authenticated but not admin)
  useEffect(() => {
    if (!mounted) return;
    if (authStatus === 'authenticated' && session?.user?.role !== Role.ADMIN && session?.user?.role !== Role.SUPER_ADMIN) {
      const timer = setTimeout(() => {
        router.push('/');
      }, 10000); // 10-second delay

      return () => clearTimeout(timer); // Cleanup on unmount
    }
  }, [authStatus, session, router, toast, mounted]);

  // useEffect for "Not Authenticated" scenario
  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      const timer = setTimeout(() => {
        router.push('/login'); // Redirect to login page
      }, 10000); // 10 seconds

      return () => clearTimeout(timer);
    }
  }, [authStatus, router]);

  // Handle tab switching with optional refresh
  const handleTabChange = async (value: string) => {
    setActiveTab(value);
    if (value === 'network-groups') {
      if (!hasLoadedNetworkGroups) {
        setHasLoadedNetworkGroups(true);
      } else {
        handleNetworkGroupsRefresh(); // in-place spinner
      }
    } else if (value === 'host-aliases') {
      if (!hasLoadedHostAliases) {
        setHasLoadedHostAliases(true);
      } else {
        handleHostAliasesRefresh(); // in-place spinner
      }
    }
  };

  // Show loading state while authentication status is being determined
  if (!mounted || authStatus === 'loading') {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <AppHeader />
        <main className="flex-grow container-responsive py-4 flex items-center justify-center">
          <ClientOnly>
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </ClientOnly>
        </main>
      </div>
    );
  }

  // Render "Not Authenticated" if not logged in
  if (authStatus === 'unauthenticated') {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <AppHeader />
        <main className="flex-grow container-responsive py-4 flex flex-col items-center justify-center space-y-4">
          <ClientOnly><LogIn className="h-16 w-16 text-primary" /></ClientOnly>
          <h1 className="text-2xl font-semibold">Not Authenticated</h1>
          <p className="text-muted-foreground">Please log in to access admin panel.</p>
          {/* Added additional message */}
          <p className="text-muted-foreground">Redirecting to Login in 10 seconds...</p>
          <Button onClick={() => router.push('/login')}>Go to Login</Button>
        </main>
        <AppFooter pageTitle="Admin Panel" /> {/* Corrected AppFooter title */}
      </div>
    );
  }

  // Redirect if authenticated but not admin
  if (session?.user?.role !== Role.ADMIN && session?.user?.role !== Role.SUPER_ADMIN) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <AppHeader />
        <main className="flex-grow container mx-auto p-4 md:p-8 flex flex-col items-center justify-center space-y-4">
          <ClientOnly><Ban className="h-16 w-16 text-destructive" /></ClientOnly>
          <h1 className="text-2xl font-semibold">Access Denied</h1>
          <p className="text-muted-foreground">You do not have permission to view this page.</p>
          <p className="text-muted-foreground">Redirecting to Self-Service in 10 seconds...</p>
          <Button onClick={() => router.push('/')}>Go to Self-Service</Button>
        </main>
      </div>
    );
  }

  // Tab configuration for mobile dropdown
  const tabConfig = [
    { value: 'network-groups', label: 'Network Groups', icon: <NetworkIconLucide className="h-4 w-4" /> },
    { value: 'host-aliases', label: 'Host Aliases (Devices)', icon: <Laptop className="h-4 w-4" /> },
    { value: 'manage-dhcp', label: 'DHCP Reservations', icon: <Server className="h-4 w-4" /> },
    { value: 'scheduling', label: 'Scheduling', icon: <CalendarClock className="h-4 w-4" /> },
  ];

  const currentTab = tabConfig.find(tab => tab.value === activeTab);

  return (
    <div className="fixed inset-0 flex flex-col h-dynamic-screen overflow-hidden bg-background">
      <AppHeader />
      <main className="flex-grow container-responsive py-3 flex flex-col min-h-0 pb-16">
        {/* Page Identifier Heading */}
        <h1 className={`font-bold text-foreground mb-4 ${isMobile ? 'text-2xl' : 'text-3xl'}`}>Admin Panel</h1>

        {/* Connection Error Modal - Keep this here as it's a page-level concern */}
        <ClientOnly>
          <Dialog open={showConnectionErrorModal} onOpenChange={setShowConnectionErrorModal}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center text-red-600 dark:text-red-400">
                  <AlertCircle className="mr-2" /> OPNsense Connection Error
                </DialogTitle>
                <DialogDescription>
                  Could not connect to the OPNsense API, contact your Administrator.
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        </ClientOnly>

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="w-full flex flex-col flex-grow min-h-0"
        >
          {/* Hidden TabsList for mobile - needed for Tabs component to work */}
          <TabsList className={`${isMobile ? 'sr-only' : 'grid w-full grid-cols-2 sm:grid-cols-2 md:grid-cols-4 h-auto'}`}>
            {tabConfig.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                <ClientOnly><span className="mr-2">{tab.icon}</span></ClientOnly> {tab.label}
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
                      <span>{currentTab?.label || 'Network Groups'}</span>
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
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Single content area with conditional rendering */}
          <div className="mt-4 w-full min-w-0 flex-grow flex flex-col min-h-0">
            {activeTab === 'network-groups' && (
              <NetworkGroupsTab
                initialGroups={networkGroups}
                initialOpnsenseGroupDisplays={opnsenseGroupDisplays}
                initialVpnConnectionStatuses={vpnConnectionStatuses}
                initialGroupVpnMap={groupVpnMap}
                isLoadingInitialData={isLoadingGroups || isLoadingMappings || isLoadingVpnStatuses}
                isRefreshing={isRefreshingOpnsenseData}
                onRefresh={handleNetworkGroupsRefresh}
                sortBy={networkGroupsSort.sortBy}
                sortDirection={networkGroupsSort.sortDirection}
                onSortChange={(sortBy, sortDirection) => setNetworkGroupsSort({ sortBy, sortDirection })}
                currentPage={networkGroupsCurrentPage}
                pageSize={networkGroupsPageSize}
                onPageChange={setNetworkGroupsCurrentPage}
                onPageSizeChange={(pageSize) => {
                  setNetworkGroupsPageSize(pageSize);
                  setNetworkGroupsCurrentPage(1);
                }}
                searchTerm={networkGroupsSearchTerm}
                onSearchTermChange={setNetworkGroupsSearchTerm}
                allEmojiValues={allEmojiValues}
                allFlagValues={allFlagValues}
              />
            )}

            {activeTab === 'host-aliases' && (
              <HostAliasesTab
                vpnConnectionStatuses={vpnConnectionStatuses}
                groupVpnMap={groupVpnMap}
                vpnMappings={vpnMappings}
                opnsenseGroupDisplays={opnsenseGroupDisplays}
                hostAliases={hostAliases}
                isLoadingInitialData={isLoadingGroups || isLoadingMappings || isLoadingVpnStatuses}
                isRefreshing={isRefreshingOpnsenseData}
                hostAliasesError={hostAliasesError}
                onRefreshHostAliases={handleHostAliasesRefresh}
                onVpnStatusRefresh={refreshVpnData}
                sortBy={hostAliasesSort.sortBy}
                sortDirection={hostAliasesSort.sortDirection}
                onSortChange={(sortBy, sortDirection) => setHostAliasesSort({ sortBy, sortDirection })}
                currentPage={hostAliasesCurrentPage}
                pageSize={hostAliasesPageSize}
                onPageChange={setHostAliasesCurrentPage}
                onPageSizeChange={(pageSize) => {
                  setHostAliasesPageSize(pageSize);
                  setHostAliasesCurrentPage(1);
                }}
                searchTerm={hostAliasesSearchTerm}
                onSearchTermChange={setHostAliasesSearchTerm}
                allEmojiValues={allEmojiValues}
                allFlagValues={allFlagValues}
              />
            )}

            {activeTab === 'manage-dhcp' && (
              <ManageDhcpCard
                vpnConnectionStatuses={vpnConnectionStatuses}
                groupVpnMap={groupVpnMap}
                selectedAlias={dhcpSelectedAlias}
                onSelectedAliasChange={setDhcpSelectedAlias}
                ipAddress={dhcpIpAddress}
                onIpAddressChange={setDhcpIpAddress}
                macAddress={dhcpMacAddress}
                onMacAddressChange={setDhcpMacAddress}
                hostname={dhcpHostname}
                onHostnameChange={setDhcpHostname}
                description={dhcpDescription}
                onDescriptionChange={setDhcpDescription}
                selectedSubnet={dhcpSelectedSubnet}
                onSelectedSubnetChange={setDhcpSelectedSubnet}
              />
            )}

            {activeTab === 'scheduling' && (
              <SchedulingTab isActive={activeTab === 'scheduling'} />
            )}
          </div>

        </Tabs>
      </main>
      <AppFooter pageTitle="Admin Panel" />
    </div>
  );
}
