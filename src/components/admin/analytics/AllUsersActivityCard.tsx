'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  Activity,
  RefreshCw,
  Clock,
  Shield,
  User,
  Settings,
  Loader2,
  Search,
  Users,
} from 'lucide-react';
import { format } from 'date-fns';

interface AllUsersActivity {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  timestamp: Date;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    username: string | null;
  } | null;
}



export default function AllUsersActivityCard() {
  const [activities, setActivities] = useState<AllUsersActivity[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [allActivities, setAllActivities] = useState<AllUsersActivity[]>([]);
  const [filteredActivities, setFilteredActivities] = useState<AllUsersActivity[]>([]);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [groupTypesEnabled, setGroupTypesEnabled] = useState<boolean>(false);
  // const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  // const [refreshKey, setRefreshKey] = useState<number>(0);

  const { toast } = useToast();

  // Fetch activities from audit logs
  const fetchActivities = useCallback(async (reset = false, isRefresh = false) => {
    try {
      if (reset) {
        // Only set loading to true for initial load, not for refresh
        if (isRefresh) {
          // setIsRefreshing(true);
        } else {
          setIsLoadingActivities(true);
        }
        setActivities([]);
      } else {
        setIsLoadingMore(true);
      }

      const offset = reset ? 0 : activities.length;

      // Remove search from API call - we'll handle search client-side
      const response = await fetch(`/api/admin/all-activities?limit=20&offset=${offset}`);

      if (!response.ok) {
        throw new Error('Failed to fetch activities');
      }

      const data = await response.json();

      if (reset) {
        setActivities(data.activities || []);
      } else {
        setActivities(prev => [...prev, ...(data.activities || [])]);
      }

      setHasMore(data.pagination?.hasMore || false);
      setTotalCount(data.pagination?.total || 0);

      // Update groupTypesEnabled state if provided
      if (typeof data.groupTypesEnabled === 'boolean') {
        setGroupTypesEnabled(data.groupTypesEnabled);
      }
    } catch (error) {
      console.error('Error fetching activities:', error);
      toast({
        title: 'Error',
        description: 'Failed to load activities',
        variant: 'destructive',
      });
    } finally {
      if (reset) {
        // Only set loading to false for initial load, not for refresh
        if (isRefresh) {
          // setIsRefreshing(false);
          // Force re-render by updating refresh key
          // setRefreshKey(prev => prev + 1);
        } else {
          setIsLoadingActivities(false);
        }
      }
      setIsLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  useEffect(() => {
    fetchActivities(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update allActivities when activities changes
  useEffect(() => {
    // Remove duplicates based on activity ID
    const uniqueActivities = activities.filter((activity, index, self) =>
      index === self.findIndex(a => a.id === activity.id)
    );

    setAllActivities(uniqueActivities);
    if (!searchTerm.trim()) {
      setFilteredActivities(uniqueActivities);
    }
  }, [activities, searchTerm]);



  // Get action icon
  const getActionIcon = (action: string) => {
    if (action.includes('LOGIN') || action.includes('LOGOUT')) {
      return <User className="h-4 w-4 text-blue-500" />;
    }
    if (action.includes('GROUP') || action.includes('ASSIGN')) {
      return <Shield className="h-4 w-4 text-green-500" />;
    }
    if (action.includes('SETTINGS') || action.includes('UPDATE')) {
      return <Settings className="h-4 w-4 text-orange-500" />;
    }
    return <Activity className="h-4 w-4 text-gray-500" />;
  };

  // Helper function to format group names with types when enabled
  const formatGroupName = useCallback((groupName: string, groupType?: string) => {
    if (!groupTypesEnabled || !groupType) {
      return `"${groupName}"`;
    }

    const typeLabel = groupType === 'SingleSelect' ? 'Single' : 'Multi';
    return `"${groupName}" (${typeLabel})`;
  }, [groupTypesEnabled]);

  // Get action description
  const getActionDescription = useCallback((activity: AllUsersActivity) => {
    const action = activity.action;
    const details = activity.details;

    // Group assignment operations - check if it's actually a move
    if (action === 'OPNSENSE_GROUP_IP_ASSIGN_SUCCESS') {
      const hostAlias = details?.hostAliasName || details?.ipAddress;
      const ip = details?.ipAddress;
      const group = (details?.groupFriendlyName || details?.groupName || 'Unknown Group') as string;
      const groupType = details?.groupType as string | undefined;
      const hostDisplay = (hostAlias && ip && hostAlias !== ip) ? `${hostAlias} (${ip})` : hostAlias;

      // Check if this is actually a move operation
      const wasMoved = details?.wasMoved || details?.moveOperation;
      const removedFromGroups = Array.isArray(details?.removedFromGroups) ? details.removedFromGroups : [];
      const sourceGroups = Array.isArray(details?.sourceGroups) ? details.sourceGroups : [];

      if (wasMoved && (removedFromGroups.length > 0 || sourceGroups.length > 0)) {
        // This is a move operation disguised as an assignment
        const fromGroups = removedFromGroups.length > 0 ? removedFromGroups : sourceGroups;
        if (fromGroups.length === 1) {
          const fromGroup = fromGroups[0]?.friendlyName || fromGroups[0]?.name;
          const fromGroupType = fromGroups[0]?.groupType;
          return `Moved ${hostDisplay} from ${formatGroupName(fromGroup, fromGroupType)} to ${formatGroupName(group, groupType)}`;
        } else if (fromGroups.length > 1) {
          const fromGroupNames = fromGroups.map((g: Record<string, unknown>) => formatGroupName(g.friendlyName as string || g.name as string, g.groupType as string)).join(', ');
          return `Moved ${hostDisplay} from [${fromGroupNames}] to ${formatGroupName(group, groupType)}`;
        }
      }

      // Regular assignment
      return `Assigned ${hostDisplay} to group ${formatGroupName(group, groupType)}`;
    }

    if (action === 'OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS') {
      const hostAlias = details?.hostAliasName || details?.ipAddress;
      const ip = details?.ipAddress;
      const group = (details?.groupFriendlyName || details?.groupName || 'Unknown Group') as string;
      const groupType = details?.groupType as string | undefined;
      const hostDisplay = (hostAlias && ip && hostAlias !== ip) ? `${hostAlias} (${ip})` : hostAlias;

      return `Removed ${hostDisplay} from group ${formatGroupName(group, groupType)}`;
    }

    if (action === 'OPNSENSE_GROUP_IP_MOVE_SUCCESS') {
      const hostAlias = details?.hostAliasName || details?.ipAddress;
      const ip = details?.ipAddress;
      const sourceGroups = Array.isArray(details?.sourceGroups) ? details.sourceGroups : [];
      const targetGroup = details?.targetGroup as Record<string, unknown>;
      const fromGroup = sourceGroups[0]?.friendlyName || sourceGroups[0]?.name;
      const fromGroupType = sourceGroups[0]?.groupType;
      const toGroup = (targetGroup?.friendlyName as string) || (targetGroup?.name as string) || (details?.groupFriendlyName as string) || (details?.groupName as string);
      const toGroupType = (targetGroup?.groupType as string) || (details?.groupType as string);

      const hostDisplay = (hostAlias && ip && hostAlias !== ip) ? `${hostAlias} (${ip})` : hostAlias;

      if (fromGroup && toGroup) {
        return `Moved ${hostDisplay} from ${formatGroupName(fromGroup, fromGroupType)} to ${formatGroupName(toGroup, toGroupType)}`;
      }
      return `Moved ${hostDisplay} to group ${formatGroupName(toGroup || 'Unknown Group', toGroupType)}`;
    }

    // Batch operations - check if they're actually moves
    if (action === 'OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS') {
      const hostAliases = Array.isArray(details?.hostAliases) ? details.hostAliases : [];
      const groups = Array.isArray(details?.groups) ? details.groups : [];
      const count = hostAliases.length || (details?.successfulOperations as number) || 1;
      const group = groups[0]?.groupFriendlyName || groups[0]?.groupName || 'Unknown Group';
      const groupType = groups[0]?.groupType;
      const removedFromGroups = Array.isArray(details?.removedFromGroups) ? details.removedFromGroups : [];

      // Check if this is a move operation (has removedFromGroups)
      const isMove = removedFromGroups.length > 0;

      // Show first few host names if available
      if (hostAliases.length > 0 && hostAliases.length <= 3) {
        const hostNames = hostAliases.map((ha: Record<string, unknown>) => ha.hostAliasName || ha.ipAddress).join(', ');

        if (isMove && removedFromGroups.length === 1) {
          const fromGroup = removedFromGroups[0]?.friendlyName || removedFromGroups[0]?.name;
          const fromGroupType = removedFromGroups[0]?.groupType;
          return `Moved ${hostNames} from ${formatGroupName(fromGroup, fromGroupType)} to ${formatGroupName(group, groupType)}`;
        } else if (isMove && removedFromGroups.length > 1) {
          const fromGroupNames = removedFromGroups.map((g: Record<string, unknown>) => formatGroupName(g.friendlyName as string || g.name as string, g.groupType as string)).join(', ');
          return `Moved ${hostNames} from [${fromGroupNames}] to ${formatGroupName(group, groupType)}`;
        }

        return `Assigned ${hostNames} to group ${formatGroupName(group, groupType)}`;
      }

      // For larger batches
      if (isMove) {
        if (removedFromGroups.length === 1) {
          const fromGroup = removedFromGroups[0]?.friendlyName || removedFromGroups[0]?.name;
          const fromGroupType = removedFromGroups[0]?.groupType;
          return `Moved ${count} host${count > 1 ? 's' : ''} from ${formatGroupName(fromGroup, fromGroupType)} to ${formatGroupName(group, groupType)}`;
        } else if (removedFromGroups.length > 1) {
          return `Moved ${count} host${count > 1 ? 's' : ''} from multiple groups to ${formatGroupName(group, groupType)}`;
        }
      }

      return `Assigned ${count} host${count > 1 ? 's' : ''} to group ${formatGroupName(group, groupType)}`;
    }

    if (action === 'OPNSENSE_GROUP_IP_BATCH_UNASSIGN_SUCCESS') {
      const hostAliases = Array.isArray(details?.hostAliases) ? details.hostAliases : [];
      const groups = Array.isArray(details?.groups) ? details.groups : [];
      const count = hostAliases.length || (details?.successfulOperations as number) || 1;
      const group = groups[0]?.groupFriendlyName || groups[0]?.groupName || 'Unknown Group';
      const groupType = groups[0]?.groupType;

      // Show first few host names if available
      if (hostAliases.length > 0 && hostAliases.length <= 3) {
        const hostNames = hostAliases.map((ha: Record<string, unknown>) => ha.hostAliasName || ha.ipAddress).join(', ');
        return `Removed ${hostNames} from group ${formatGroupName(group, groupType)}`;
      }
      return `Removed ${count} host${count > 1 ? 's' : ''} from group ${formatGroupName(group, groupType)}`;
    }

    // DHCP reservations
    if (action === 'DHCP_RESERVATION_ADD_SUCCESS') {
      const ip = details?.ip_address || details?.ipAddress;
      const hostname = details?.hostname;
      const mac = details?.hw_address;
      const description = details?.description;

      let result = 'Added DHCP reservation';
      if (hostname && ip) {
        result = `Added DHCP reservation: ${hostname} → ${ip}`;
      } else if (ip) {
        result = `Added DHCP reservation for IP ${ip}`;
      }

      // Add MAC address if available
      if (mac) {
        result += ` (MAC: ${mac})`;
      }

      // Add description if available and different from hostname
      if (description && description !== hostname) {
        result += ` - ${description}`;
      }

      return result;
    }

    if (action === 'DHCP_RESERVATION_DELETE_SUCCESS') {
      const ip = details?.ip_address || details?.ipAddress;
      const hostname = details?.hostname;
      const mac = details?.hw_address;

      let result = 'Removed DHCP reservation';
      if (hostname && ip) {
        result = `Removed DHCP reservation: ${hostname} → ${ip}`;
      } else if (ip) {
        result = `Removed DHCP reservation for IP ${ip}`;
      }

      // Add MAC address if available
      if (mac) {
        result += ` (MAC: ${mac})`;
      }

      return result;
    }

    // Host alias operations
    if (action === 'HOST_ALIAS_CREATE_SUCCESS') {
      const aliasName = details?.aliasName;
      const content = details?.content;
      if (aliasName && content) {
        return `Created host alias: ${aliasName} (${content})`;
      } else if (aliasName) {
        return `Created host alias: ${aliasName}`;
      }
      return 'Created host alias';
    }

    // Authentication
    if (action === 'LOGIN_SUCCESS') return 'Logged in successfully';
    if (action === 'LOGOUT_SUCCESS') return 'Logged out';
    if (action === 'SETTINGS_UPDATE_SUCCESS') return 'Updated settings';
    if (action === 'PASSWORD_CHANGE_SUCCESS') return 'Changed password';

    // Fallback: format action name
    return action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  }, [formatGroupName]);

  // Handle client-side search with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!searchTerm.trim()) {
        setFilteredActivities(allActivities);
        return;
      }

      const searchTerms = searchTerm.trim().toLowerCase().split(/\s+/);

      const filtered = allActivities.filter(activity => {
        // Generate the same description that's displayed to the user
        const displayedDescription = getActionDescription(activity).toLowerCase();
        const userName = getUserDisplayName(activity.user).toLowerCase();

        // All search terms must match somewhere in the displayed description or user name
        return searchTerms.every(term => {
          // Split the description into words using various delimiters
          const words = displayedDescription.split(/[\s\-_.,()[\]"']+/).filter(word => word.length > 0);
          const userWords = userName.split(/[\s\-_.,()[\]"']+/).filter(word => word.length > 0);

          // Check if any word matches the search term exactly or as substring
          return words.some(word => word === term) ||
            displayedDescription.includes(term) ||
            userWords.some(word => word === term) ||
            userName.includes(term);
        });
      });

      setFilteredActivities(filtered);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, allActivities, getActionDescription]);

  // Get user display name
  const getUserDisplayName = (user: AllUsersActivity['user']) => {
    if (!user) return 'System';
    return user.name || user.username || user.email || `User ${user.id.slice(0, 8)}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <Users className="mr-2 h-5 w-5" />
            All Users Activity
            {totalCount > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({totalCount} total)
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchTerm(''); // Clear search when refreshing
              fetchActivities(true); // Use the centralized function
            }}
            disabled={isLoadingActivities}
          >
            {isLoadingActivities ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </CardTitle>
        <CardDescription>
          Recent activities from all users&apos; audit logs
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder='Search activities or users... (e.g., john assign, "exact phrase")'
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {isLoadingActivities ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <div className="space-y-2">
              <p className="text-sm">
                {searchTerm ? 'No activities found matching your search' : 'No recent activities found'}
              </p>
              {!searchTerm && (
                <p className="text-xs">
                  Activities will appear here when users perform actions like group assignments,
                  host alias operations, or profile updates.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {filteredActivities.map((activity) => {
              const ipAddress = activity.details?.ipAddress;
              const displayIpAddress = typeof ipAddress === 'string' ? ipAddress : null;

              return (
                <div key={activity.id} className="flex items-start space-x-3 p-3 rounded-lg border">
                  <div className="flex-shrink-0 mt-0.5">
                    {getActionIcon(activity.action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">
                        {getActionDescription(activity)}
                      </p>
                      <span className="text-xs text-muted-foreground font-medium">
                        {getUserDisplayName(activity.user)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 mt-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{format(new Date(activity.timestamp), 'MMM d, yyyy h:mm a')}</span>
                      {displayIpAddress && (
                        <span className="text-xs bg-muted px-2 py-0.5 rounded">
                          {displayIpAddress}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Load More Button */}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    const offset = activities.length;
                    setIsLoadingMore(true);
                    Promise.all([
                      fetch(`/api/admin/all-activities?limit=20&offset=${offset}`).then(res => res.json()),
                      new Promise(resolve => setTimeout(resolve, 500))
                    ])
                      .then(([data]) => {
                        setActivities(prev => [...prev, ...(data.activities || [])]);
                        setHasMore(data.pagination?.hasMore || false);
                        setTotalCount(data.pagination?.total || 0);
                        if (typeof data.groupTypesEnabled === 'boolean') {
                          setGroupTypesEnabled(data.groupTypesEnabled);
                        }
                      })
                      .catch(error => {
                        console.error('Error loading more activities:', error);
                        toast({
                          title: 'Error',
                          description: 'Failed to load more activities',
                          variant: 'destructive',
                        });
                      })
                      .finally(() => setIsLoadingMore(false));
                  }}
                  disabled={isLoadingMore}
                  className="w-full"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading more...
                    </>
                  ) : (
                    'Load More'
                  )}
                </Button>
              </div>
            )}

            {/* Search Results Info */}
            {searchTerm.trim() && (
              <div className="text-center py-2 text-sm text-muted-foreground">
                {filteredActivities.length === 0 ? (
                  <p>No activities found matching &quot;{searchTerm}&quot;</p>
                ) : (
                  <p>Showing {filteredActivities.length} of {allActivities.length} activities matching &quot;{searchTerm}&quot;</p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
