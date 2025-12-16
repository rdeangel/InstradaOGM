'use client';


import { Role } from '@/types/opnsense';
import { useEffect, useState, useCallback, useRef } from 'react';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useLocalStorage } from '@/hooks/use-local-storage';

import { Button } from '@/components/ui/button';
import {
  Tabs, TabsList, TabsTrigger
} from "@/components/ui/tabs";
import { ClientOnly } from '@/components/util/ClientOnly';
import { Users as UsersIcon, User as UserIcon, LogIn, Ban, Loader2, UserCheck, ChevronDown, ChevronUp } from 'lucide-react';

import { AppHeader } from '@/components/layout/AppHeader';
import { AppFooter } from '@/components/layout/AppFooter';
import { logger } from '@/lib/logger';
import UserManagementTab from '@/components/admin/UserManagementTab';
import UserGroupsTab from '@/components/admin/UserGroupsTab';
import SsoGroupMappingManager from '@/components/admin/SsoGroupMappingManager';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Added missing imports for modal components
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertCircle } from "lucide-react";

import type { User } from '@prisma/client';
import type { Group } from '@prisma/client';
import type { SsoGroupMapping } from '@prisma/client';

interface AliasForTooltip {
  uuid: string;
  name: string;
  description?: string;
}

interface FilterForTooltip {
  uuid: string;
  name: string;
  description?: string;
  pattern: string;
}

// Extended types from codebase search
type UserWithDetails = User & {
  username: string | null;
  accounts: { provider: string }[];
  authMethod?: string;
  provider?: string;
  externalGroups?: string[];
  directGroups?: { id: string; name: string; description: string | null; }[];
  mappedGroups?: { id: string; name: string; description: string | null; }[];
  ssoProvider?: string;
};

interface GroupWithCount extends Group {
  _count?: {
    users?: number;
    hostAliasPermissions?: number;
    networkFilters?: number;
  };
}

interface SsoGroupMappingWithLocalGroup extends SsoGroupMapping {
  localGroup: Group;
}

interface UserForTooltip {
  id: string;
  email: string;
  isSso?: boolean;
}


export default function UserManagementPage() {
  const { data: session, status: authStatus } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [mounted, setMounted] = useState(false); // Re-add setMounted
  useEffect(() => {
    setMounted(true);
  }, []);

  const [oidcProviders, setOidcProviders] = useState([]);
  const [isLoadingOidcProviders, setIsLoadingOidcProviders] = useState(true);
  const [providerDisplayNames, setProviderDisplayNames] = useState<Record<string, string>>({});
  const [isLoadingDisplayNames, setIsLoadingDisplayNames] = useState(true);
  const [isSsoEnabled, setIsSsoEnabled] = useState(false);
  // Added missing state declarations for modal
  const [showConnectionErrorModal, setShowConnectionErrorModal] = useState(false);

  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isRefreshingUsers, setIsRefreshingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersSort, setUsersSort] = useState<{ sortBy: string; sortDirection: 'asc' | 'desc' }>({ sortBy: 'name', sortDirection: 'asc' });
  const [groupsSort, setGroupsSort] = useState<{ sortBy: string; sortDirection: 'asc' | 'desc' }>({ sortBy: 'name', sortDirection: 'asc' });
  const [ssoMappingsSort, setSsoMappingsSort] = useState<{ sortBy: string; sortDirection: 'asc' | 'desc' }>({ sortBy: 'ssoProvider', sortDirection: 'asc' });

  // Add pagination state for all tabs
  const [usersCurrentPage, setUsersCurrentPage] = useState(1);
  const [usersPageSize, setUsersPageSize] = useLocalStorage<number | 'ALL'>('users-table-page-size', 5);

  const [groupsCurrentPage, setGroupsCurrentPage] = useState(1);
  const [groupsPageSize, setGroupsPageSize] = useLocalStorage<number | 'ALL'>('groups-table-page-size', 5);

  const [ssoMappingsCurrentPage, setSsoMappingsCurrentPage] = useState(1);
  const [ssoMappingsPageSize, setSsoMappingsPageSize] = useLocalStorage<number | 'ALL'>('sso-mappings-table-page-size', 5);

  // Add search state for all tabs
  const [usersSearchTerm, setUsersSearchTerm] = useState('');
  const [groupsSearchTerm, setGroupsSearchTerm] = useState('');
  const [ssoMappingsSearchTerm, setSsoMappingsSearchTerm] = useState('');

  const [groups, setGroups] = useState<GroupWithCount[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [isRefreshingGroups, setIsRefreshingGroups] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  const [ssoGroupMappings, setSsoGroupMappings] = useState<SsoGroupMappingWithLocalGroup[]>([]);
  const [isLoadingSsoGroupMappings, setIsLoadingSsoGroupMappings] = useState(false);
  const [isRefreshingSsoGroupMappings, setIsRefreshingSsoGroupMappings] = useState(false);
  const [ssoGroupMappingsError, setSsoGroupMappingsError] = useState<string | null>(null);

  // State for lifted tooltip data from UserGroupsTab
  const [allTooltipMembers, setAllTooltipMembers] = useState<{ [groupId: string]: UserForTooltip[] }>({});
  const [allTooltipAliases, setAllTooltipAliases] = useState<{ [groupId: string]: AliasForTooltip[] }>({});
  const [allTooltipFilters, setAllTooltipFilters] = useState<{ [groupId: string]: FilterForTooltip[] }>({});
  const [allLoadingTooltip, setAllLoadingTooltip] = useState<{ [groupId: string]: boolean }>({});

  // Refs for stable access to tooltip states within callbacks
  const allTooltipMembersRef = useRef(allTooltipMembers);
  const allTooltipAliasesRef = useRef(allTooltipAliases);
  const allTooltipFiltersRef = useRef(allTooltipFilters);
  const allLoadingTooltipRef = useRef(allLoadingTooltip);

  // Update refs when state changes
  useEffect(() => { allTooltipMembersRef.current = allTooltipMembers; }, [allTooltipMembers]);
  useEffect(() => { allTooltipAliasesRef.current = allTooltipAliases; }, [allTooltipAliases]);
  useEffect(() => { allTooltipFiltersRef.current = allTooltipFilters; }, [allTooltipFilters]);
  useEffect(() => { allLoadingTooltipRef.current = allLoadingTooltip; }, [allLoadingTooltip]);

  const [activeTab, setActiveTab] = useLocalStorage<string>('user-management-active-tab', 'users');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hasLoadedUsers, setHasLoadedUsers] = useState(false);
  const [hasLoadedSsoGroupMappings, setHasLoadedSsoGroupMappings] = useState(false);

  const fetchSsoGroupMappings = useCallback(async (inPlace: boolean = false) => {
    if (inPlace) setIsRefreshingSsoGroupMappings(true);
    else setIsLoadingSsoGroupMappings(true);
    setSsoGroupMappingsError(null);
    try {
      const response = await fetch('/api/admin/group-mappings');
      if (!response.ok) {
        throw new Error('Failed to fetch SSO group mappings');
      }
      const data = await response.json();
      setSsoGroupMappings((data as SsoGroupMappingWithLocalGroup[]).filter((m) => m.ssoProvider !== 'opnsense'));
    } catch (error) {
      setSsoGroupMappingsError(error instanceof Error ? error.message : 'Could not load SSO group mappings.');
    } finally {
      if (inPlace) setIsRefreshingSsoGroupMappings(false);
      else setIsLoadingSsoGroupMappings(false);
    }
  }, []);

  // Fetch members for tooltip (lifted from UserGroupsTab)
  const fetchMembersForTooltip = useCallback(async (groupId: string) => {
    setAllLoadingTooltip(prev => ({ ...prev, [groupId]: true }));
    try {
      const response = await fetch(`/api/admin/groups/${groupId}/members`);
      const data = await response.json();
      if (response.ok && Array.isArray(data)) {
        setAllTooltipMembers(prev => ({ ...prev, [groupId]: data }));
      } else {
        logger.error('Failed to fetch members for tooltip:', data);
        setAllTooltipMembers(prev => ({ ...prev, [groupId]: [] }));
      }
    } catch (error) {
      logger.error('Error fetching members for tooltip:', error);
      setAllTooltipMembers(prev => ({ ...prev, [groupId]: [] }));
    } finally {
      setAllLoadingTooltip(prev => ({ ...prev, [groupId]: false }));
    }
  }, []);

  // Fetch aliases for tooltip (lifted from UserGroupsTab)
  const fetchAliasesForTooltip = useCallback(async (groupId: string) => {
    setAllLoadingTooltip(prev => ({ ...prev, [groupId]: true }));
    try {
      const response = await fetch(`/api/admin/groups/${groupId}/host-alias-permissions`);
      const data = await response.json();
      if (response.ok && Array.isArray(data)) {
        // Ensure each alias has uuid and name
        setAllTooltipAliases(prev => ({
          ...prev, [groupId]: data.map((alias: AliasForTooltip) => ({
            uuid: alias.uuid || (alias as { uuid?: string; id?: string }).id || '',
            name: alias.name || '',
            description: alias.description || '',
          }))
        }));
      } else {
        logger.error('Failed to fetch aliases for tooltip:', data);
        setAllTooltipAliases(prev => ({ ...prev, [groupId]: [] }));
        toast({ variant: "destructive", title: "Error", description: "Could not load host aliases for tooltip." });
      }
    } catch (error) {
      logger.error('Error fetching aliases for tooltip:', error);
      setAllTooltipAliases(prev => ({ ...prev, [groupId]: [] }));
      toast({ variant: "destructive", title: "Error", description: "Could not load host aliases for tooltip." });
    } finally {
      setAllLoadingTooltip(prev => ({ ...prev, [groupId]: false }));
    }
  }, [toast]);

  // Fetch filters for tooltip (lifted from UserGroupsTab)
  const fetchFiltersForTooltip = useCallback(async (groupId: string) => {
    setAllLoadingTooltip(prev => ({ ...prev, [groupId]: true }));
    try {
      const response = await fetch(`/api/admin/groups/${groupId}/network-filters`);
      const data = await response.json();
      if (response.ok && Array.isArray(data)) {
        // Ensure each filter has uuid, name, and pattern
        setAllTooltipFilters(prev => ({
          ...prev, [groupId]: data.map((filter: FilterForTooltip) => ({
            uuid: filter.uuid || (filter as { uuid?: string; id?: string }).id || '',
            name: filter.name || '',
            description: filter.description || '',
            pattern: filter.pattern || '',
          }))
        }));
      } else {
        logger.error('Failed to fetch filters for tooltip:', data);
        setAllTooltipFilters(prev => ({ ...prev, [groupId]: [] }));
        toast({ variant: "destructive", title: "Error", description: "Could not load network filters for tooltip." });
      }
    } catch (error) {
      logger.error('Error fetching filters for tooltip:', error);
      setAllTooltipFilters(prev => ({ ...prev, [groupId]: [] }));
      toast({ variant: "destructive", title: "Error", description: "Could not load network filters for tooltip." });
    } finally {
      setAllLoadingTooltip(prev => ({ ...prev, [groupId]: false }));
    }
  }, [toast]);

  // Now define fetchGroups after the above
  const fetchGroups = useCallback(async (inPlace: boolean = false) => {
    if (inPlace) setIsRefreshingGroups(true);
    else setIsLoadingGroups(true);
    setGroupsError(null);
    try {
      const response = await fetch('/api/admin/groups');
      if (!response.ok) {
        throw new Error('Failed to fetch groups');
      }
      const data = await response.json();
      setGroups(data);
      // After updating groups, refresh tooltip data for all groups and wait for all to finish
      if (Array.isArray(data) && data.length > 0) {
        await Promise.all([
          ...data.map((group: GroupWithCount) => fetchMembersForTooltip(group.id)),
          ...data.map((group: GroupWithCount) => fetchAliasesForTooltip(group.id)),
          ...data.map((group: GroupWithCount) => fetchFiltersForTooltip(group.id)),
        ]);
      }
    } catch (error) {
      setGroupsError(error instanceof Error ? error.message : 'Could not load groups.');
    } finally {
      if (inPlace) setIsRefreshingGroups(false);
      else setIsLoadingGroups(false);
    }
  }, [fetchAliasesForTooltip, fetchFiltersForTooltip, fetchMembersForTooltip]);

  // fetchOidcProviders moved inside useEffect below

  const fetchUsers = useCallback(async (inPlace: boolean = false) => {
    if (inPlace) setIsRefreshingUsers(true);
    else setIsLoadingUsers(true);
    setUsersError(null);
    try {
      const response = await fetch('/api/admin/users');
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : 'Could not load users.');
    } finally {
      if (inPlace) setIsRefreshingUsers(false);
      else setIsLoadingUsers(false);
    }
  }, []);

  // Track if all tooltip data is loaded for all groups, but only show skeleton on initial load
  const [isLoadingAllTooltipData, setIsLoadingAllTooltipData] = useState(true);
  const [hasLoadedTooltipData, setHasLoadedTooltipData] = useState(false);
  useEffect(() => {
    if (groups.length === 0) {
      setIsLoadingAllTooltipData(false);
      return;
    }
    // Wait until allLoadingTooltip is false for all group IDs
    const anyLoading = groups.some(group => allLoadingTooltip[group.id]);
    if (!hasLoadedTooltipData) {
      setIsLoadingAllTooltipData(anyLoading);
      if (!anyLoading) setHasLoadedTooltipData(true);
    } else {
      setIsLoadingAllTooltipData(false);
    }
  }, [groups, allLoadingTooltip, hasLoadedTooltipData]);

  useEffect(() => {
    const fetchAuthProviders = async () => {
      setIsLoadingOidcProviders(true);
      try {
        const response = await fetch('/api/public/auth-providers');
        if (!response.ok) {
          throw new Error('Failed to fetch authentication providers');
        }
        const data = await response.json();

        // Filter for OAuth providers (SSO)
        const oauthProviders = data.filter((provider: { type: string }) => provider.type === 'oauth');
        setOidcProviders(oauthProviders);
        setIsSsoEnabled(oauthProviders.length > 0);
      } catch (error) {
        logger.error('Error fetching authentication providers:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load authentication providers.",
        });
        setOidcProviders([]);
        setIsSsoEnabled(false);
      } finally {
        setIsLoadingOidcProviders(false);
      }
    };
    fetchAuthProviders();
  }, [toast]);

  // Fetch provider display names once and memoize
  useEffect(() => {
    const fetchProviderDisplayNames = async () => {
      try {
        setIsLoadingDisplayNames(true);
        const response = await fetch('/api/admin/provider-display-names');
        if (response.ok) {
          const data = await response.json();
          setProviderDisplayNames(data);
        } else {
          logger.error('Failed to fetch provider display names');
        }
      } catch (error) {
        logger.error('Error fetching provider display names:', error);
      } finally {
        setIsLoadingDisplayNames(false);
      }
    };

    if (mounted) {
      fetchProviderDisplayNames();
    }
  }, [mounted]);

  // Always fetch local groups on initial page load if authenticated and authorized
  useEffect(() => {
    if (authStatus === 'authenticated' && (session?.user?.role === Role.ADMIN || session?.user?.role === Role.SUPER_ADMIN)) {
      fetchGroups(false);
    }
    // Only run on mount/auth change

  }, [authStatus, session, fetchGroups]);

  // useEffect for User Groups Tab data fetching
  useEffect(() => {
    if (activeTab === 'user-groups' && !hasLoadedTooltipData) {
      fetchGroups(false); // Initial load with skeleton
      setHasLoadedTooltipData(true);
    }
  }, [activeTab, fetchGroups, hasLoadedTooltipData]);

  // useEffect for Users Tab data fetching
  useEffect(() => {
    if (activeTab === 'users' && !hasLoadedUsers) {
      fetchUsers(false); // Initial load with skeleton
      setHasLoadedUsers(true);
    }
  }, [activeTab, fetchUsers, hasLoadedUsers]);

  // useEffect for SSO Group Mappings Tab data fetching
  useEffect(() => {
    if (activeTab === 'sso-group-mappings' && !hasLoadedSsoGroupMappings) {
      fetchSsoGroupMappings(false); // Initial load with skeleton
      setHasLoadedSsoGroupMappings(true);
    }
  }, [activeTab, fetchSsoGroupMappings, hasLoadedSsoGroupMappings]);

  // Users tab in-place refresh on tab switch
  useEffect(() => {
    if (activeTab === 'users') {
      if (!hasLoadedUsers) {
        setHasLoadedUsers(true);
      } else {
        fetchUsers(true); // in-place spinner
      }
    }
  }, [activeTab, fetchUsers, hasLoadedUsers]);

  // User Groups tab in-place refresh on tab switch
  useEffect(() => {
    if (activeTab === 'user-groups') {
      if (!hasLoadedTooltipData) {
        setHasLoadedTooltipData(true);
      } else {
        fetchGroups(true); // in-place spinner
      }
    }
  }, [activeTab, fetchGroups, hasLoadedTooltipData]);

  // SSO Group Mappings tab in-place refresh on tab switch
  useEffect(() => {
    if (activeTab === 'sso-group-mappings') {
      if (!hasLoadedSsoGroupMappings) {
        setHasLoadedSsoGroupMappings(true);
      } else {
        fetchSsoGroupMappings(true); // in-place spinner
      }
    }
  }, [activeTab, fetchSsoGroupMappings, hasLoadedSsoGroupMappings]);

  // useEffect for "Access Denied" scenario (authenticated but not admin)
  useEffect(() => {
    if (!mounted) return; // Ensure mounted is true before proceeding
    if (authStatus === 'authenticated' && session?.user?.role !== Role.ADMIN && session?.user?.role !== Role.SUPER_ADMIN) {
      const timer = setTimeout(() => {
        router.push('/');
      }, 10000); // 10-second delay
      return () => clearTimeout(timer); // Cleanup on unmount
    }
  }, [authStatus, session, router, mounted]); // Added mounted to dependencies

  // useEffect for "Not Authenticated" scenario
  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      const timer = setTimeout(() => {
        router.push('/login'); // Redirect to login page
      }, 10000); // 10 seconds

      return () => clearTimeout(timer);
    }
  }, [authStatus, router]);

  // Show loading state while authentication status is being determined
  if (!mounted || authStatus === 'loading') {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <AppHeader />
        <main className="flex-grow container mx-auto p-4 md:p-8 flex items-center justify-center">
          <ClientOnly><Loader2 className="h-12 w-12 animate-spin text-primary" /></ClientOnly>
        </main>
      </div>
    );
  }

  // Render "Not Authenticated" if not logged in
  if (authStatus === 'unauthenticated') {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <AppHeader />
        <main className="flex-grow container mx-auto p-4 md:p-8 flex flex-col items-center justify-center space-y-4">
          <ClientOnly><LogIn className="h-16 w-16 text-primary" /></ClientOnly>
          <h1 className="text-2xl font-semibold">Not Authenticated</h1>
          <p className="text-muted-foreground">Please log in to access user management.</p>
          {/* Added additional message */}
          <p className="text-muted-foreground">Redirecting to Login in 10 seconds...</p>
          <Button onClick={() => router.push('/login')}>Go to Login</Button>
        </main>
        <AppFooter pageTitle="User Management" /> {/* Corrected AppFooter title */}
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
          <p className="text-muted-foreground">Redirecting to Login in 10 seconds...</p> {/* Updated message to match "Not Authenticated" */}
          <Button onClick={() => router.push('/')}>Go to Self-Service</Button>
        </main>
      </div>
    );
  }

  // Tab configuration for mobile dropdown
  const tabConfig = [
    { value: 'users', label: 'Users', icon: <UserIcon className="h-4 w-4" /> },
    { value: 'user-groups', label: 'User Groups', icon: <UsersIcon className="h-4 w-4" /> },
    { value: 'sso-group-mappings', label: 'SSO Group Mappings', icon: <UserCheck className="h-4 w-4" /> }
  ];

  const currentTab = tabConfig.find(tab => tab.value === activeTab);

  return (
    <div className="fixed inset-0 flex flex-col h-dynamic-screen overflow-hidden bg-background">
      <AppHeader />
      <main className="flex-grow container-responsive py-3 flex flex-col min-h-0 pb-16">
        {/* Page Identifier Heading */}
        <h1 className={`font-bold text-foreground mb-4 ${isMobile ? 'text-2xl' : 'text-3xl'}`}>User Management</h1>

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
          onValueChange={setActiveTab}
          className="w-full flex flex-col flex-grow min-h-0"
        >
          {/* Hidden TabsList for mobile - needed for Tabs component to work */}
          <TabsList className={`${isMobile ? 'sr-only' : 'grid w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-3 h-auto'}`}>
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
                      <span>{currentTab?.label || 'Users'}</span>
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
            {activeTab === 'users' && (
              <UserManagementTab
                mounted={mounted}
                isPageScrollEnabled={false}
                oidcProviders={oidcProviders}
                isLoadingOidcProviders={isLoadingOidcProviders}
                users={users}
                isLoadingInitialData={isLoadingUsers}
                isRefreshing={isRefreshingUsers}
                usersError={usersError}
                onRefresh={() => fetchUsers(true)}
                sortBy={usersSort.sortBy}
                sortDirection={usersSort.sortDirection}
                onSortChange={(sortBy, sortDirection) => setUsersSort({ sortBy, sortDirection })}
                currentPage={usersCurrentPage}
                pageSize={usersPageSize}
                onPageChange={(page) => setUsersCurrentPage(page)}
                onPageSizeChange={(pageSize) => { setUsersPageSize(pageSize); setUsersCurrentPage(1); }}
                searchTerm={usersSearchTerm}
                onSearchTermChange={setUsersSearchTerm}
                providerDisplayNames={providerDisplayNames}
                isLoadingDisplayNames={isLoadingDisplayNames}
              />
            )}

            {activeTab === 'user-groups' && (
              <UserGroupsTab
                mounted={mounted}
                groups={groups}
                isLoadingInitialData={(!hasLoadedTooltipData && (isLoadingGroups || isLoadingAllTooltipData))}
                isRefreshing={isRefreshingGroups}
                groupsError={groupsError}
                onRefresh={(inPlace = true) => fetchGroups(inPlace)}
                allTooltipMembers={allTooltipMembers}
                allTooltipAliases={allTooltipAliases}
                allTooltipFilters={allTooltipFilters}
                allLoadingTooltip={allLoadingTooltip}
                fetchMembersForTooltip={fetchMembersForTooltip}
                fetchAliasesForTooltip={fetchAliasesForTooltip}
                fetchFiltersForTooltip={fetchFiltersForTooltip}
                isSsoEnabled={isSsoEnabled}
                sortBy={groupsSort.sortBy}
                sortDirection={groupsSort.sortDirection}
                onSortChange={(sortBy, sortDirection) => setGroupsSort({ sortBy, sortDirection })}
                currentPage={groupsCurrentPage}
                pageSize={groupsPageSize}
                onPageChange={(page) => setGroupsCurrentPage(page)}
                onPageSizeChange={(pageSize) => { setGroupsPageSize(pageSize); setGroupsCurrentPage(1); }}
                searchTerm={groupsSearchTerm}
                onSearchTermChange={setGroupsSearchTerm}
              />
            )}

            {activeTab === 'sso-group-mappings' && (
              <SsoGroupMappingManager
                ssoGroupMappings={ssoGroupMappings}
                groups={groups}
                oidcProviders={oidcProviders}
                isLoadingOidcProviders={isLoadingOidcProviders}
                isLoadingInitialData={isLoadingSsoGroupMappings}
                isRefreshing={isRefreshingSsoGroupMappings}
                ssoGroupMappingsError={ssoGroupMappingsError}
                onRefresh={() => fetchSsoGroupMappings(true)}
                sortBy={ssoMappingsSort.sortBy}
                sortDirection={ssoMappingsSort.sortDirection}
                onSortChange={(sortBy, sortDirection) => setSsoMappingsSort({ sortBy, sortDirection })}
                currentPage={ssoMappingsCurrentPage}
                pageSize={ssoMappingsPageSize}
                onPageChange={(page) => setSsoMappingsCurrentPage(page)}
                onPageSizeChange={(pageSize) => { setSsoMappingsPageSize(pageSize); setSsoMappingsCurrentPage(1); }}
                searchTerm={ssoMappingsSearchTerm}
                onSearchTermChange={setSsoMappingsSearchTerm}
              />
            )}
          </div>
        </Tabs>
      </main>
      <AppFooter pageTitle="User Management" />
    </div>
  );
}
