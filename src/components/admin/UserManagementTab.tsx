'use client';

/* eslint-disable security/detect-object-injection */
// This component uses bracket notation with typed keys from objects. All uses are safe.
import type { User } from '@prisma/client';
import { Role } from '@/types/opnsense';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { format } from 'date-fns';


import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { PaginationControls } from '@/components/ui/pagination-controls';
import { SortableTable } from "@/components/ui/sortable-table";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; // Added Tooltip import
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { User as UserIcon, PlusCircle, Edit, Trash2, Loader2, CheckCircle, XCircle, AlertCircle as AlertCircleIcon, RefreshCcw, KeyRound, ShieldOff } from 'lucide-react';
import { ClientOnly } from '@/components/util/ClientOnly';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useIsMobile, useIsPhone } from '@/hooks/use-mobile'; // Import useIsMobile hook
import { cn } from '@/lib/utils'; // Import cn utility
// import { logger } from '@/lib/logger'; // Import logger for error handling
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { createUser, updateUser, deleteUser, getUserById, UserFormData } from '@/lib/actions/user.actions'; // Import getUserById
import { useAuth } from '@/context/AuthContext'; // Import useAuth to get session user for delete logic
import { Disable2FAConfirmDialog } from './Disable2FAConfirmDialog';
import { logger } from '@/lib/logger';

// Define a type that extends the Prisma User type to include username, accounts, and group information
type UserWithDetails = User & {
  username: string | null;
  accounts: { provider: string }[]; // Add accounts relation
  authMethod?: string; // Add authMethod
  provider?: string; // Add provider for OIDC
  externalGroups?: string[]; // Add raw external groups
  directGroups?: { id: string; name: string; description: string | null; }[]; // Add direct groups
  mappedGroups?: { id: string; name: string; description: string | null; }[]; // Add mapped groups
  ssoProvider?: string; // Add SSO provider
};

// Update UserWithUsername to use UserWithDetails for consistency in the list
type UserWithUsername = UserWithDetails;


type UserManagementFormState = UserFormData & {
  id?: string,
  username: string,
  confirmPassword: string,
  // Add optional properties for group display
  directGroups?: { id: string; name: string; description: string | null; }[];
  mappedGroups?: { id: string; name: string; description: string | null; }[];
  externalGroups?: string[];
  ssoProvider?: string;
  authMethod?: string;
};

const initialFormState: UserManagementFormState = {
  name: '',
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  role: Role.USER,
  mustChangePassword: false,
};

interface UserManagementTabProps {
  mounted: boolean;
  isPageScrollEnabled: boolean;
  oidcProviders: { id: string; name: string }[];
  isLoadingOidcProviders: boolean;
  users: UserWithUsername[];
  isLoadingInitialData: boolean;
  isRefreshing: boolean;
  usersError: string | null;
  onRefresh: () => void;
  sortBy: string;
  sortDirection: 'asc' | 'desc';
  onSortChange: (newSortBy: string, newSortDirection: 'asc' | 'desc') => void;
  // Add pagination props
  currentPage: number;
  pageSize: number | 'ALL';
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number | 'ALL') => void;
  // Add search props to persist across tab switches
  searchTerm: string;
  onSearchTermChange: (searchTerm: string) => void;
  // Add provider display names props
  providerDisplayNames: Record<string, string>;
  isLoadingDisplayNames: boolean;
}

export default function UserManagementTab({
  mounted,

  oidcProviders,
  // isLoadingOidcProviders,
  users,
  isLoadingInitialData,
  isRefreshing,
  onRefresh,
  sortBy,
  sortDirection,
  onSortChange,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  searchTerm,
  onSearchTermChange,
  providerDisplayNames,
  isLoadingDisplayNames,
}: UserManagementTabProps) {
  const { data: session } = useAuth(); // Use useAuth to get session user
  const { toast } = useToast();
  const isMobile = useIsMobile(); // Use the hook
  const isPhone = useIsPhone();

  // Remove all internal fetch logic/state
  // Use users for table data
  // Use isLoadingInitialData for skeleton
  // Use isRefreshing for refresh button spinner
  // Use usersError for error display

  const [isButtonRefreshing, setIsButtonRefreshing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [currentUser, setCurrentUser] = useState<UserManagementFormState>(initialFormState);
  const [originalUser, setOriginalUser] = useState<UserManagementFormState>(initialFormState);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof UserManagementFormState | '_form', string>>>({});
  const [isEditingSSOUser, setIsEditingSSOUser] = useState(false);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDeleteId, setUserToDeleteId] = useState<string | null>(null);

  // Disable 2FA dialog state
  const [isDisable2FADialogOpen, setIsDisable2FADialogOpen] = useState(false);
  const [userToDisable2FA, setUserToDisable2FA] = useState<UserWithUsername | null>(null);
  const [isDisabling2FA, setIsDisabling2FA] = useState(false);

  // Remove local provider display names state - now using props

  // Remove local sortBy, sortDirection, handleSortChange

  // Memoize formatted provider names to prevent re-renders
  const formattedProviderNames = useMemo(() => {
    return providerDisplayNames;
  }, [providerDisplayNames]);

  // Determine if the role select should be disabled
  const isRoleSelectDisabled = (targetUserRole: Role, targetUserId: string | undefined) => {
    if (!session?.user) return true; // No session, disable everything

    // SUPER_ADMIN cannot change their own role
    if (session.user.role === Role.SUPER_ADMIN && session.user.id === targetUserId) {
      return true;
    }

    // ADMIN cannot change their own role
    if (session.user.role === Role.ADMIN && session.user.id === targetUserId) {
      return true;
    }

    // ADMIN cannot change SUPER_ADMIN roles
    if (session.user.role === Role.ADMIN && targetUserRole === Role.SUPER_ADMIN) {
      return true;
    }

    return false;
  };

  // Determine if other input fields should be disabled for ADMIN editing SUPER_ADMIN
  const areOtherFieldsDisabled = (targetUserRole: Role) => {
    if (!session?.user) return true;
    return session.user.role === Role.ADMIN && targetUserRole === Role.SUPER_ADMIN;
  };

  // Filter roles available in the select dropdown
  const getFilteredRoleValues = (targetUserRole: Role) => {
    if (!session?.user) return [];

    const allRoles = Object.values(Role).filter(value => typeof value === 'string') as Role[];

    // If current user is ADMIN and target user is SUPER_ADMIN, no roles can be selected
    if (session.user.role === Role.ADMIN && targetUserRole === Role.SUPER_ADMIN) {
      return [Role.SUPER_ADMIN]; // Show current role but disable selection
    }

    // If current user is ADMIN, they cannot assign SUPER_ADMIN role
    if (session.user.role === Role.ADMIN) {
      return allRoles.filter(role => role !== Role.SUPER_ADMIN);
    }

    return allRoles; // SUPER_ADMIN can see all roles
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCurrentUser(prev => ({ ...prev, [name]: value }));
    setFormErrors(prev => ({ ...prev, [name]: undefined, _form: undefined }));
  };

  const handleRoleChange = (value: string) => {
    setCurrentUser(prev => ({ ...prev, role: value as Role }));
    setFormErrors(prev => ({ ...prev, role: undefined, _form: undefined }));
  };

  const handleOpenDialog = useCallback(async (mode: 'add' | 'edit', userToEdit?: UserWithUsername) => {
    setDialogMode(mode);
    setFormErrors({});
    // setIsProcessing(true); // Start processing for fetching user data - REMOVED

    if (mode === 'edit' && userToEdit) {
      try {
        // Fetch detailed user data including groups
        const detailedUser = await getUserById(userToEdit.id);

        if (detailedUser) {
          const isSSO = detailedUser.accounts && detailedUser.accounts.length > 0;
          setIsEditingSSOUser(isSSO);

          setCurrentUser({
            id: detailedUser.id,
            name: detailedUser.name || '',
            username: detailedUser.username || '', // Use username from detailed data
            email: detailedUser.email || '',
            password: '', // Never pre-fill password
            confirmPassword: '', // Never pre-fill confirm password
            role: detailedUser.role as Role,
            // Store group information for display
            directGroups: detailedUser.directGroups,
            mappedGroups: detailedUser.mappedGroups,
            externalGroups: detailedUser.externalGroups,
            ssoProvider: detailedUser.ssoProvider,
            authMethod: detailedUser.authMethod, // Ensure authMethod is included
          } as UserManagementFormState); // Cast to include group properties
          setOriginalUser({
            id: detailedUser.id,
            name: detailedUser.name || '',
            username: detailedUser.username || '',
            email: detailedUser.email || '',
            password: '',
            confirmPassword: '',
            role: detailedUser.role as Role,
            directGroups: detailedUser.directGroups,
            mappedGroups: detailedUser.mappedGroups,
            externalGroups: detailedUser.externalGroups,
            ssoProvider: detailedUser.ssoProvider,
            authMethod: detailedUser.authMethod,
          } as UserManagementFormState);
        } else {
          // Handle case where user is not found (shouldn't happen if called from list)
          toast({ variant: "destructive", title: "Error", description: "Could not fetch user details." });
          setIsDialogOpen(false); // Close dialog if user not found
        }
      } catch (error) {
        logger.error("Error fetching user details for edit:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not fetch user details." });
        setIsDialogOpen(false); // Close dialog on error
      } finally {
        // setIsProcessing(false); // Stop processing - REMOVED
      }
    } else {
      // Add mode
      setIsEditingSSOUser(false);
      setCurrentUser(initialFormState);
      setOriginalUser(initialFormState);
      // setIsProcessing(false); // Stop processing immediately for add mode - REMOVED
    }
    setIsDialogOpen(true);
  }, [toast]); // Add toast to dependencies

  const hasUserChanges = () => {
    if (dialogMode === 'add') return true; // Always allow saving for new users

    // For edit mode, check if any field has changed
    // Password change counts as a change even if it's the only field modified
    return (
      currentUser.name !== originalUser.name ||
      currentUser.username !== originalUser.username ||
      currentUser.email !== originalUser.email ||
      currentUser.role !== originalUser.role ||
      currentUser.mustChangePassword !== originalUser.mustChangePassword ||
      (currentUser.password && currentUser.password.trim() !== '') // Password entered counts as change
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mounted) return;

    setFormErrors({});
    setIsProcessing(true);

    // Password confirmation validation
    if (currentUser.password && currentUser.password !== currentUser.confirmPassword) {
      setFormErrors(prev => ({ ...prev, confirmPassword: "Passwords do not match." }));
      setIsProcessing(false);
      return;
    }

    let result;
    const formDataToSubmit: UserFormData = {
      name: currentUser.name,
      username: currentUser.username,
      email: currentUser.email,
      role: currentUser.role,
      mustChangePassword: currentUser.mustChangePassword,
    };

    if (currentUser.password) {
      formDataToSubmit.password = currentUser.password;
    } else if (dialogMode === 'add' && !currentUser.password) {
      setFormErrors(prev => ({ ...prev, password: "Password is required for new users." }));
      setIsProcessing(false);
      return;
    }


    if (dialogMode === 'add') {
      result = await createUser(formDataToSubmit);
    } else if (currentUser.id) {
      const updateData: UserFormData = { ...formDataToSubmit };
      if (!formDataToSubmit.password) {
        delete updateData.password;
      }
      result = await updateUser(currentUser.id, updateData);
    }


    setIsProcessing(false);
    return result;
  };



  const handleOpenDeleteDialog = (userId: string) => {
    setUserToDeleteId(userId);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDeleteId) return;


    const result = await deleteUser(userToDeleteId);
    if (result.success) {
      toast({ title: "Success", description: "User deleted successfully.", variant: "success" });
      onRefresh(); // Trigger in-place refresh
    } else {
      const errorMsg = result.errors?.[0]?.message || "Could not delete user.";
      toast({ variant: "destructive", title: "Error", description: errorMsg });
    }

    setIsDeleteDialogOpen(false);
    setUserToDeleteId(null);
  };

  // Disable 2FA handlers
  const handleOpenDisable2FADialog = (user: UserWithUsername) => {
    setUserToDisable2FA(user);
    setIsDisable2FADialogOpen(true);
  };

  const handleConfirmDisable2FA = async () => {
    if (!userToDisable2FA) return;

    setIsDisabling2FA(true);
    try {
      const response = await fetch(`/api/admin/users/${userToDisable2FA.id}/disable-2fa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast({
          title: "Success",
          description: result.message || "2FA has been disabled for this user.",
          variant: "success"
        });
        setIsDisable2FADialogOpen(false);
        setUserToDisable2FA(null);
        onRefresh(); // Trigger in-place refresh to update the user list
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.message || "Failed to disable 2FA for this user."
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred while disabling 2FA."
      });
    } finally {
      setIsDisabling2FA(false);
    }
  };

  const renderFieldError = (field: keyof UserManagementFormState | '_form') => {
    return formErrors[field] ? <p className="text-sm text-destructive mt-1">{formErrors[field]}</p> : null;
  };


  // userSearchTerm is now managed by parent component and passed as prop

  // Pagination state
  // const [currentPage, setCurrentPage] = useState(1);
  // const [pageSize, setPageSize] = useState<number | 'ALL'>(5); // Default to 5 entries

  const filteredUsers = users.filter(user => {
    const searchTermLower = (searchTerm || '').toLowerCase();
    return searchTermLower === '' ||
      user.name?.toLowerCase().includes(searchTermLower) ||
      user.username?.toLowerCase().includes(searchTermLower) ||
      user.email?.toLowerCase().includes(searchTermLower) ||
      user.role.toLowerCase().includes(searchTermLower) ||
      (user.accounts && user.accounts.length > 0 && `sso (${user.accounts[0].provider})`.toLowerCase().includes(searchTermLower)) ||
      (user.is2FAEnabled ? 'yes' : 'no').includes(searchTermLower) ||
      (user.lastActive ? format(new Date(user.lastActive), 'PPpp').toLowerCase().includes(searchTermLower) : false) ||
      format(new Date(user.createdAt), 'PPpp').toLowerCase().includes(searchTermLower);
  });

  // Pagination logic
  const totalItems = filteredUsers.length;
  const totalPages = pageSize === 'ALL' ? 1 : Math.ceil(totalItems / pageSize);

  // Reset to first page when search term changes or when current page is greater than total pages
  useEffect(() => {
    if (totalPages === 0 && currentPage !== 1) {
      onPageChange(1);
    } else if (currentPage > totalPages && totalPages > 0) {
      onPageChange(1);
    }
  }, [searchTerm, currentPage, totalPages, onPageChange]);

  // Get paginated data
  const paginatedUsers = useMemo(() => {
    if (pageSize === 'ALL') {
      return filteredUsers;
    }

    if (isPhone) {
      return filteredUsers.slice(0, currentPage * (typeof pageSize === 'number' ? pageSize : 10000));
    }

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredUsers.slice(startIndex, endIndex);
  }, [filteredUsers, currentPage, pageSize, isPhone]);

  // Handle page size change
  const handlePageSizeChange = (value: number | 'ALL') => {
    onPageSizeChange(value);
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      onPageChange(page);
    }
  };



  // Helper function to get provider name consistently - now using memoized display names
  const getProviderName = useCallback((user: UserWithDetails) => {
    if (user.authMethod === 'Local') return null;

    // Try to get provider name from memoized display names first (from environment variables)
    const providerId = user.ssoProvider || user.accounts?.[0]?.provider;
    if (providerId && formattedProviderNames[providerId]) {
      return formattedProviderNames[providerId];
    }

    // Fallback to oidcProviders if display names not loaded yet
    if (providerId) {
      const provider = oidcProviders.find(p => p.id === providerId);
      if (provider?.name) {
        return provider.name;
      }
      // If no provider found in oidcProviders but we have a providerId, return it
      return providerId;
    }

    // If we have accounts but no providerId, try to get from accounts
    if (user.accounts && user.accounts.length > 0) {
      return user.accounts[0].provider || 'Unknown Provider';
    }

    return 'Unknown Provider';
  }, [formattedProviderNames, oidcProviders]);

  // Helper function to safely check if groups exist
  const hasGroups = (groups: unknown[] | undefined | null) => {
    return groups && Array.isArray(groups) && groups.length > 0;
  };




  return (
    <>
      <Card className="flex flex-col flex-1 mb-0 min-h-0">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0 pb-4">
          <div>
            <CardTitle className={`flex items-center ${isMobile ? 'text-xl' : 'text-2xl'}`}>
              <ClientOnly><UserIcon size={28} className="mr-2 text-primary" /></ClientOnly> User Accounts
            </CardTitle>
            {!isMobile && <CardDescription>Manage user accounts, roles, and settings.</CardDescription>}
          </div>
          <div className="flex w-full justify-end md:w-auto">
            <Button
              variant="outline"
              onClick={onRefresh}
              disabled={isRefreshing}
              className={cn("mr-2", isMobile && "size-9 p-0")}
            >
              <ClientOnly>
                {isRefreshing ? (
                  <Loader2 className={cn("h-4 w-4 animate-spin", !isMobile && "mr-2")} />
                ) : (
                  <RefreshCcw className={cn("h-4 w-4", !isMobile && "mr-2")} />
                )}
              </ClientOnly>
              {!isMobile && "Refresh"}
            </Button>
            <Button onClick={() => handleOpenDialog('add')} className={cn(isMobile && "size-9 p-0")}>
              <ClientOnly>
                <PlusCircle className={cn("h-4 w-4", !isMobile && "mr-2")} />
              </ClientOnly>
              {!isMobile && "Add User"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-6 relative flex-1 overflow-hidden flex flex-col">
          {/* Search Input for Users */}
          <div className="relative max-w-sm">
            <Input
              type="search"
              placeholder="Search users..."
              value={searchTerm || ''}
              onChange={(e) => onSearchTermChange(e.target.value)}
              className="pr-8"
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                onClick={() => onSearchTermChange("")}
              >
                <XCircle className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
          </div>

          {isLoadingInitialData ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : paginatedUsers.length === 0 ? (
            <p className="text-muted-foreground text-center">No users found.</p>
          ) : isMobile ? (
            // Mobile View: Render as Cards
            <ScrollArea className="flex-1 pr-4 -mr-4">
              <div className="space-y-4 pr-4">
                {paginatedUsers.map(user => (
                  <Card key={user.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">{user.name}</CardTitle>
                      <CardDescription>{user.username}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">Email:</span>
                        <span className="flex items-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex items-center cursor-help">
                                  <ClientOnly><AlertCircleIcon className="h-4 w-4 mr-1 text-muted-foreground" /></ClientOnly>
                                  {user.email}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="font-semibold mb-1 text-center">Group Memberships</p>
                                {user.authMethod === 'oauth' && (
                                  <p className="text-xs text-muted-foreground mb-2">Only mapped Local groups are shown here.</p>
                                )}
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <p className="font-medium">Direct Local Groups:</p>
                                    {!hasGroups(user.directGroups) ? (
                                      <p className="text-muted-foreground">- None -</p>
                                    ) : (
                                      <div className="flex flex-wrap gap-1">
                                        {user.directGroups?.map((group: { id: string; name: string; description: string | null }) => (
                                          <span key={group.id} className="px-2 py-1 bg-secondary rounded-sm text-secondary-foreground">{group.name}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <p className="font-medium">
                                      {user.authMethod === 'Local'
                                        ? 'Not managed by SSO'
                                        : `Mapped SSO Groups (${getProviderName(user) || 'Unknown Provider'})`}
                                    </p>
                                    {user.authMethod !== 'Local' && (
                                      !hasGroups(user.mappedGroups) ? (
                                        <p className="text-muted-foreground">- None -</p>
                                      ) : (
                                        <div className="flex flex-wrap gap-1">
                                          {(Array.from(new Set<string>(user.mappedGroups?.map((group: { id: string; name: string }) => group.id))) as string[]).map((groupId: string) => {
                                            const group = user.mappedGroups?.find((g: { id: string; name: string }) => g.id === groupId);
                                            return group ? (
                                              <span key={group.id} className="px-2 py-1 bg-secondary rounded-sm text-secondary-foreground">{group.name}</span>
                                            ) : null;
                                          })}
                                        </div>
                                      )
                                    )}
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">Role:</span>
                        <span><Badge variant={user.role === Role.SUPER_ADMIN.toString() || user.role === Role.ADMIN.toString() ? "default" : "secondary"}>{user.role}</Badge></span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">Auth Method:</span>
                        <span>
                          {user.accounts && user.accounts.length > 0 ? (
                            isLoadingDisplayNames ? (
                              <Skeleton className="inline-block h-4 w-24 align-middle" />
                            ) : (
                              `SSO (${getProviderName(user) || 'Unknown Provider'})`
                            )
                          ) : 'Local'}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">2FA:</span>
                        <span className="flex items-center gap-2">
                          <ClientOnly>
                            {user.accounts && user.accounts.length > 0 ? (
                              // SSO users - show "-" since 2FA is not applicable (consistent with Password fields)
                              <span className="text-muted-foreground">-</span>
                            ) : user.is2FAEnabled ? (
                              <CheckCircle className="h-5 w-5 text-green-500" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-500" />
                            )}
                          </ClientOnly>
                          {session?.user?.role === Role.SUPER_ADMIN && user.is2FAEnabled && session?.user?.id !== user.id && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => handleOpenDisable2FADialog(user)}
                                  >
                                    <ClientOnly><ShieldOff className="h-3 w-3" /></ClientOnly>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Disable 2FA for this user</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">Password Change Required:</span>
                        <span>
                          <ClientOnly>
                            {user.accounts && user.accounts.length > 0 ? (
                              // SSO users - show "-" since password change is not applicable
                              <span className="text-muted-foreground">-</span>
                            ) : user.mustChangePassword ? (
                              <Badge variant="destructive" className="text-xs">
                                <KeyRound className="h-3 w-3 mr-1" />
                                Yes
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">No</Badge>
                            )}
                          </ClientOnly>
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">Password Changed:</span>
                        <span>
                          {user.accounts && user.accounts.length > 0
                            ? <span className="text-muted-foreground">-</span>
                            : (user.passwordChangedAt ? format(new Date(user.passwordChangedAt), 'PPpp') : <span className="text-muted-foreground">-</span>)
                          }
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">Last Active:</span>
                        <span>{user.lastActive ? format(new Date(user.lastActive), 'PPpp') : '-'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">Created At:</span>
                        <span>{format(new Date(user.createdAt), 'PPpp')}</span>
                      </div>
                      <div className="flex justify-end space-x-2 mt-2">
                        <Button variant="outline" size="icon" onClick={() => handleOpenDialog('edit', user)}
                          disabled={
                            (session?.user?.id === user.id && session?.user?.role === Role.SUPER_ADMIN) ||
                            (session?.user?.role === Role.ADMIN && user.role === Role.SUPER_ADMIN)
                          }
                        >
                          <ClientOnly><Edit className="h-3 w-3" /></ClientOnly>
                        </Button>
                        <Button variant="destructive" size="icon" onClick={() => handleOpenDeleteDialog(user.id)}
                          disabled={
                            (session?.user?.id === user.id) ||
                            (session?.user?.role === Role.ADMIN && user.role === Role.SUPER_ADMIN)
                          }
                        >
                          <ClientOnly><Trash2 className="h-3 w-3" /></ClientOnly>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          ) : (
            // Desktop View: Render as Table
            <ScrollArea className="flex-1 pr-4 -mr-4"> {/* ScrollArea handles overflow */}
              <SortableTable<UserWithDetails>
                data={paginatedUsers}
                columns={[
                  {
                    key: 'name',
                    label: 'Name',
                    sortable: true,
                    render: (user) => <span className="font-medium">{user.name}</span>,
                  },
                  {
                    key: 'username',
                    label: 'Username',
                    sortable: true,
                    render: (user) => user.username || '-',
                  },
                  {
                    key: 'email',
                    label: 'Email',
                    sortable: true,
                    render: (user) => (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center cursor-help">
                              <ClientOnly><AlertCircleIcon className="h-4 w-4 mr-1 text-muted-foreground" /></ClientOnly>
                              {user.email}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="font-semibold mb-1 text-center">Group Memberships</p>
                            {user.authMethod === 'oauth' && (
                              <p className="text-xs text-muted-foreground mb-2">Only mapped Local groups are shown here.</p>
                            )}
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <p className="font-medium">Direct Local Groups:</p>
                                {!hasGroups(user.directGroups) ? (
                                  <p className="text-muted-foreground">- None -</p>
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {user.directGroups?.map((group: { id: string; name: string; description: string | null }) => (
                                      <span key={group.id} className="px-2 py-1 bg-secondary rounded-sm text-secondary-foreground">{group.name}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div>
                                <p className="font-medium">
                                  {user.authMethod === 'Local'
                                    ? 'Not managed by SSO'
                                    : `Mapped SSO Groups (${getProviderName(user) || 'Unknown Provider'})`}
                                </p>
                                {user.authMethod !== 'Local' && (
                                  !hasGroups(user.mappedGroups) ? (
                                    <p className="text-muted-foreground">- None -</p>
                                  ) : (
                                    <div className="flex flex-wrap gap-1">
                                      {user.mappedGroups?.map((group: { id: string; name: string; description: string | null }) => (
                                        <span key={group.id} className="px-2 py-1 bg-secondary rounded-sm text-secondary-foreground">{group.name}</span>
                                      ))}
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ),
                  },
                  {
                    key: 'role',
                    label: 'Role',
                    sortable: true,
                    render: (user) => (
                      <Badge variant={user.role === Role.SUPER_ADMIN.toString() || user.role === Role.ADMIN.toString() ? "default" : "secondary"}>{user.role}</Badge>
                    ),
                  },
                  {
                    key: 'authMethod',
                    label: 'Auth Method',
                    sortable: true,
                    render: (user) => (
                      user.accounts && user.accounts.length > 0 ? (
                        isLoadingDisplayNames ? (
                          <Skeleton className="inline-block h-4 w-24 align-middle" />
                        ) : (
                          `SSO (${getProviderName(user) || 'Unknown Provider'})`
                        )
                      ) : 'Local'
                    ),
                  },
                  {
                    key: 'is2FAEnabled',
                    label: '2FA',
                    sortable: true,
                    headerClassName: "text-center",
                    render: (user) => (
                      <div className="flex justify-center items-center gap-2">
                        <ClientOnly>
                          {user.accounts && user.accounts.length > 0 ? (
                            // SSO users - show "-" since 2FA is not applicable (consistent with Password fields)
                            <span className="text-muted-foreground">-</span>
                          ) : user.is2FAEnabled ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500" />
                          )}
                        </ClientOnly>
                        {session?.user?.role === Role.SUPER_ADMIN && user.is2FAEnabled && session?.user?.id !== user.id && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => handleOpenDisable2FADialog(user)}
                                >
                                  <ClientOnly><ShieldOff className="h-3 w-3" /></ClientOnly>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Disable 2FA for this user</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'mustChangePassword',
                    label: 'Password Change Required',
                    sortable: true,
                    headerClassName: "text-center",
                    render: (user) => (
                      <div className="flex justify-center">
                        <ClientOnly>
                          {user.accounts && user.accounts.length > 0 ? (
                            // SSO users - show "-" since password change is not applicable
                            <span className="text-muted-foreground">-</span>
                          ) : user.mustChangePassword ? (
                            <Badge variant="destructive" className="text-xs">
                              <KeyRound className="h-3 w-3 mr-1" />
                              Yes
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">No</Badge>
                          )}
                        </ClientOnly>
                      </div>
                    ),
                  },
                  {
                    key: 'passwordChangedAt',
                    label: 'Password Changed',
                    sortable: true,
                    render: (user) => (
                      user.accounts && user.accounts.length > 0
                        ? <span className="text-muted-foreground">-</span>
                        : (user.passwordChangedAt ? format(new Date(user.passwordChangedAt), 'PPpp') : <span className="text-muted-foreground">-</span>)
                    ),
                  },
                  {
                    key: 'lastActive',
                    label: 'Last Active',
                    sortable: true,
                    render: (user) => (user.lastActive ? format(new Date(user.lastActive), 'PPpp') : '-'),
                  },
                  {
                    key: 'createdAt',
                    label: 'Created At',
                    sortable: true,
                    render: (user) => format(new Date(user.createdAt), 'PPpp'),
                  },
                  {
                    key: 'actions',
                    label: 'Actions',
                    headerClassName: 'text-left', // Justify Actions header to the left
                    render: (user) => (
                      <div className="text-left space-x-2">
                        <Button variant="outline" size="icon" onClick={() => handleOpenDialog('edit', user)}
                          disabled={
                            (session?.user?.id === user.id && session?.user?.role === Role.SUPER_ADMIN) ||
                            (session?.user?.role === Role.ADMIN && user.role === Role.SUPER_ADMIN)
                          }
                        >
                          <ClientOnly><Edit className="h-3 w-3" /></ClientOnly>
                        </Button>
                        <Button variant="destructive" size="icon" onClick={() => handleOpenDeleteDialog(user.id)}
                          disabled={
                            (session?.user?.id === user.id) ||
                            (session?.user?.role === Role.ADMIN && user.role === Role.SUPER_ADMIN)
                          }
                        >
                          <ClientOnly><Trash2 className="h-3 w-3" /></ClientOnly>
                        </Button>
                      </div>
                    ),
                  },
                ]}
                sortBy={sortBy}
                sortDirection={sortDirection}
                onSortChange={onSortChange}

              />
            </ScrollArea>
          )}
          {/* Pagination Controls */}
          {isLoadingInitialData ? (
            <div className="mt-4">
              <Skeleton className="h-6 w-32" />
            </div>
          ) : (
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={totalItems}
              filteredCount={totalItems}
              pageSize={pageSize}
              onPageChange={async (page) => {
                setIsButtonRefreshing(true);
                await new Promise(resolve => setTimeout(resolve, 500));
                handlePageChange(page);
                setIsButtonRefreshing(false);
              }}
              onPageSizeChange={handlePageSizeChange}
              isLoading={isLoadingInitialData || isButtonRefreshing}
              isLoadMoreMode={isPhone}
              pageSizeOptions={[5, 10, 50, 100, 500]}
              showAllOption={true}
            />
          )}
        </CardContent>
      </Card>

      {/* Add/Edit User Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setFormErrors({}); }}>
        <DialogContent className="sm:max-w-[600px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogMode === 'add' ? 'Add New User' : 'Edit User'}</DialogTitle>
            <DialogDescription>
              {dialogMode === 'add' ? 'Fill in the details for the new user.' : `Update details for ${currentUser.name}.`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const result = await handleSubmit(e);
            // Handle case where handleSubmit returns early due to validation errors
            if (result === undefined) {
              // Validation errors are already set in formErrors, no need to show toast
              return;
            }
            if (result?.success) {
              toast({ title: "Success", description: `User ${dialogMode === 'add' ? 'created' : 'updated'} successfully.`, variant: "success" });
              onRefresh(); // Trigger in-place refresh
              setIsDialogOpen(false);
            } else {
              const errorMsg = result?.errors?.[0]?.message || "An unknown error occurred.";
              toast({ variant: "destructive", title: "Error", description: errorMsg });
              // Only set form errors for field-specific validation errors, not for API errors that are already shown in toast
              const fieldErrors = result?.errors?.reduce((acc: Record<string, string>, err: { path?: string[]; message: string }) => {
                if (err.path && err.path.length > 0 && err.path[0] !== '_api_only') {
                  acc[err.path[0]] = err.message;
                }
                return acc;
              }, {}) || {};
              setFormErrors(fieldErrors);
            }
          }} className="gap-6 py-4">
            {/* Form elements arranged vertically */}
            <div className="flex flex-col gap-2 mb-4">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" value={currentUser.name} onChange={handleInputChange} disabled={(dialogMode === 'edit' && isEditingSSOUser) || (dialogMode === 'edit' && areOtherFieldsDisabled(currentUser.role))} />
              {renderFieldError('name')}
            </div>
            <div className="flex flex-col gap-2 mb-4">
              <Label htmlFor="username">Username</Label>
              <Input id="username" name="username" value={currentUser.username} onChange={handleInputChange} disabled={(dialogMode === 'edit' && isEditingSSOUser) || (dialogMode === 'edit' && areOtherFieldsDisabled(currentUser.role))} />
              {renderFieldError('username')}
            </div>
            <div className="flex flex-col gap-2 mb-4">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" value={currentUser.email} onChange={handleInputChange} disabled={(dialogMode === 'edit' && isEditingSSOUser) || (dialogMode === 'edit' && areOtherFieldsDisabled(currentUser.role))} />
              {renderFieldError('email')}
            </div>
            <div className="flex flex-col gap-2 mb-4">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" value={currentUser.password || ''} onChange={handleInputChange} placeholder={dialogMode === 'edit' ? "Leave blank to keep current" : "Required"} disabled={(dialogMode === 'edit' && isEditingSSOUser) || (dialogMode === 'edit' && areOtherFieldsDisabled(currentUser.role))} />
              {renderFieldError('password')}
            </div>
            <div className="flex flex-col gap-2 mb-4">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input id="confirmPassword" name="confirmPassword" type="password" value={currentUser.confirmPassword || ''} onChange={handleInputChange} placeholder={dialogMode === 'edit' ? "Leave blank to keep current" : "Confirm password"} disabled={(dialogMode === 'edit' && isEditingSSOUser) || (dialogMode === 'edit' && areOtherFieldsDisabled(currentUser.role))} />
              {renderFieldError('confirmPassword')}
            </div>
            <div className="flex flex-col gap-2 mb-4">
              <Label htmlFor="role">Role</Label>
              <Select value={currentUser.role} onValueChange={handleRoleChange} disabled={dialogMode === 'edit' && isRoleSelectDisabled(currentUser.role, currentUser.id)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {getFilteredRoleValues(currentUser.role).map((roleValue: Role) => (
                    <SelectItem key={roleValue} value={roleValue}>{roleValue}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {renderFieldError('role')}
            </div>

            {/* Password Change Required Checkbox - Only show for local users */}
            {!(dialogMode === 'edit' && isEditingSSOUser) && (
              <div className="flex items-center space-x-2 mb-4 p-3 border rounded-md">
                <Checkbox
                  id="mustChangePassword"
                  checked={currentUser.mustChangePassword || false}
                  onCheckedChange={(checked) => {
                    setCurrentUser(prev => ({
                      ...prev,
                      mustChangePassword: checked as boolean
                    }));
                  }}
                  disabled={dialogMode === 'edit' && areOtherFieldsDisabled(currentUser.role)}
                />
                <div className="grid gap-1.5 leading-none">
                  <Label
                    htmlFor="mustChangePassword"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Require password change on next login
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    User will be forced to change their password when they log in
                  </p>
                </div>
              </div>
            )}

            {/* Information note with tooltip for group membership */}
            {dialogMode === 'edit' && (
              <div className="col-span-4 text-sm mt-4 p-4 border rounded-md mb-4">
                <p className="font-semibold mb-2 text-center text-foreground">Group Memberships</p>
                {currentUser.authMethod === 'oauth' && (
                  <p className="text-xs text-muted-foreground mb-3 text-center">Only mapped Local groups are shown here.</p>
                )}
                {!hasGroups(currentUser.directGroups) && !hasGroups(currentUser.mappedGroups) ? (
                  <p className="text-muted-foreground text-center">No group memberships found.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="font-medium text-foreground mb-1">Direct Local Groups:</p>
                      {!hasGroups(currentUser.directGroups) ? (
                        <p className="text-muted-foreground">- None -</p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {currentUser.directGroups?.map((group: { id: string; name: string; description: string | null }) => (
                            <span key={group.id} className="px-2 py-1 bg-secondary rounded-sm text-secondary-foreground">{group.name}</span>
                          ))
                          }
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-foreground mb-1">
                        {currentUser.authMethod === 'Local'
                          ? 'Not managed by SSO'
                          : `Mapped SSO Groups (${getProviderName(currentUser as unknown as UserWithDetails) || 'Unknown Provider'})`}
                      </p>
                      {currentUser.authMethod !== 'Local' && (
                        !hasGroups(currentUser.mappedGroups) ? (
                          <p className="text-muted-foreground">- None -</p>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {(Array.from(new Set<string>(currentUser.mappedGroups?.map((group: { id: string; name: string }) => group.id))) as string[]).map((groupId: string) => {
                              const group = currentUser.mappedGroups?.find((g: { id: string; name: string }) => g.id === groupId);
                              return group ? (
                                <span key={group.id} className="px-2 py-1 bg-secondary rounded-sm text-secondary-foreground">{group.name}</span>
                              ) : null;
                            })}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {formErrors['_form'] && (
              <Alert variant="destructive" className="col-span-4">
                <ClientOnly><AlertCircleIcon className="h-4 w-4" /></ClientOnly>
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{formErrors['_form']}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isRefreshing}>Cancel</Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={isRefreshing || isProcessing || (dialogMode === 'edit' && areOtherFieldsDisabled(currentUser.role)) || !hasUserChanges()}
              >
                <ClientOnly fallback={null}>
                  {isRefreshing || isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                </ClientOnly>
                {dialogMode === 'add' ? 'Create User' : 'Update User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete User AlertDialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRefreshing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} disabled={isRefreshing}>
              <ClientOnly fallback={null}>
                {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              </ClientOnly>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disable 2FA Confirmation Dialog */}
      <Disable2FAConfirmDialog
        isOpen={isDisable2FADialogOpen}
        onClose={() => {
          setIsDisable2FADialogOpen(false);
          setUserToDisable2FA(null);
        }}
        onConfirm={handleConfirmDisable2FA}
        userName={userToDisable2FA?.username || userToDisable2FA?.email || 'Unknown User'}
        isProcessing={isDisabling2FA}
      />
    </>
  );
}