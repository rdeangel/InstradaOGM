'use client';

/* eslint-disable security/detect-object-injection */
// This component uses bracket notation with typed keys from objects. All uses are safe.
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useSession } from 'next-auth/react';
import { Loader2, Plus, Key, Copy, Eye, EyeOff, Calendar, Clock, Activity, Info, MoreHorizontal, BarChart3, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';
import { isRunningOverHttp } from '@/lib/clipboard-utils';
import { format } from 'date-fns';
import { Progress } from '@/components/ui/progress';
import { logger } from '@/lib/logger';
import { DateTimePicker } from '@/components/ui/date-time-picker';

interface ApiKey {
  id: string;
  name: string;
  createdAt: string;
  lastUsed: string | null;
  expiresAt: string | null;
  hourlyLimit: number | null;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  burstLimit: number | null;
  enabled: boolean;
}

interface ApiKeyUsageStats {
  apiKeyId: string;
  apiKeyName: string;
  totalRequests: number;
  successfulRequests: number;
  rateLimitHits: number;
  topEndpoints: Array<{
    endpoint: string;
    count: number;
    percentage: number;
  }>;
  usageByPeriod: {
    hourly: number;
    daily: number;
    monthly: number;
    burst: number;
  };
  currentLimits: {
    hourly: number | null;
    daily: number | null;
    monthly: number | null;
    burst: number | null;
  };
  lastUsed: string | null;
  createdAt: string;
}

interface CreateApiKeyData {
  name: string;
  hourlyLimit?: number | null;
  dailyLimit?: number | null;
  monthlyLimit?: number | null;
  burstLimit?: number | null;
  expiresAt?: string;
}

interface CreateApiKeyResponse {
  id: string;
  name: string;
  createdAt: string;
  expiresAt: string | null;
  hourlyLimit: number | null;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  burstLimit: number | null;
  apiKey: string; // Only returned once
  message?: string; // Error message if creation fails
}

export default function ApiKeyManagement() {
  const { data: session, status: sessionStatus } = useSession();
  const { toast } = useToast();

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false);
  const [showEditLimitsDialog, setShowEditLimitsDialog] = useState(false);
  const [editingApiKey, setEditingApiKey] = useState<ApiKey | null>(null);
  const [deletingApiKey, setDeletingApiKey] = useState<ApiKey | null>(null);
  const [newApiKey, setNewApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdatingLimits, setIsUpdatingLimits] = useState(false);
  const [neverExpires, setNeverExpires] = useState(true);
  const [expiresAtDirty, setExpiresAtDirty] = useState(false);
  const [noLimit, setNoLimit] = useState({
    hourly: false,
    daily: false,
    monthly: false,
    burst: false,
  });
  const [editNoLimit, setEditNoLimit] = useState({
    hourly: false,
    daily: false,
    monthly: false,
    burst: false,
  });
  const [createForm, setCreateForm] = useState<CreateApiKeyData>({
    name: '',
    hourlyLimit: 1000,
    dailyLimit: 10000,
    monthlyLimit: 100000,
    burstLimit: 100,
    expiresAt: '',
  });
  const [editNeverExpires, setEditNeverExpires] = useState(false);
  const [editForm, setEditForm] = useState<CreateApiKeyData>({
    name: '',
    hourlyLimit: 1000,
    dailyLimit: 10000,
    monthlyLimit: 100000,
    burstLimit: 100,
    expiresAt: '',
  });

  // Usage statistics state
  const [usageStats, setUsageStats] = useState<Record<string, ApiKeyUsageStats>>({});
  const [loadingUsageStats, setLoadingUsageStats] = useState<Record<string, boolean>>({});
  const [showUsageDetails, setShowUsageDetails] = useState<Record<string, boolean>>({});

  // Helper to check if expiresAt is valid
  const isValidExpiresAt = (val: string | undefined) => {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(val || '');
  };

  // Fetch API keys on component mount
  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (!session) {
      setIsLoading(false);
      return;
    }
    fetchApiKeys();
  }, [session, sessionStatus]);

  const fetchApiKeys = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/account/api-keys');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to fetch API keys (${response.status})`);
      }
      const data: ApiKey[] = await response.json();
      setApiKeys(data);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load API keys.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsageStats = async (apiKeyId: string) => {
    if (loadingUsageStats[apiKeyId]) return; // Prevent duplicate requests

    // Always set loading state for spinner animation
    setLoadingUsageStats(prev => ({ ...prev, [apiKeyId]: true }));

    try {
      const response = await fetch(`/api/account/api-keys/${apiKeyId}/usage`);
      if (!response.ok) {
        throw new Error(`Failed to fetch usage stats (${response.status})`);
      }
      const result = await response.json();
      if (result.success && result.data) {
        setUsageStats(prev => ({ ...prev, [apiKeyId]: result.data }));
      }
    } catch (err: unknown) {
      logger.error(`Failed to fetch usage stats for API key ${apiKeyId}:`, err);
      // Don't show error toast for usage stats as it's not critical
    } finally {
      setLoadingUsageStats(prev => ({ ...prev, [apiKeyId]: false }));
    }
  };

  const toggleUsageDetails = (apiKeyId: string) => {
    const isCurrentlyShown = showUsageDetails[apiKeyId];
    setShowUsageDetails(prev => ({ ...prev, [apiKeyId]: !isCurrentlyShown }));

    // Fetch usage stats when showing details for the first time
    if (!isCurrentlyShown && !usageStats[apiKeyId]) {
      fetchUsageStats(apiKeyId);
    }
  };

  const handleCreateApiKey = async () => {
    if (!createForm.name.trim()) {
      toast({
        title: "Error",
        description: "API key name is required",
        variant: "destructive",
      });
      return;
    }
    // Prevent if date is set but no time is specified or if time is 00:00
    if (!neverExpires && !isValidExpiresAt(createForm.expiresAt)) {
      toast({
        title: "Error",
        description: "Please select both date and time.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      // Prepare POST body with proper handling of unlimited values
      // Use the actual form values, not defaults
      const postBody = {
        name: createForm.name,
        expiresAt: neverExpires ? undefined : createForm.expiresAt,
        hourlyLimit: noLimit.hourly ? null : (createForm.hourlyLimit || 1000),
        dailyLimit: noLimit.daily ? null : (createForm.dailyLimit || 10000),
        monthlyLimit: noLimit.monthly ? null : (createForm.monthlyLimit || 100000),
        burstLimit: noLimit.burst ? null : (createForm.burstLimit || 100),
      };

      logger.debug('Creating API key with limits:', postBody);

      const response = await fetch('/api/account/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postBody),
      });

      const data: CreateApiKeyResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create API key');
      }

      // Show the new API key to the user
      setNewApiKey(data.apiKey);
      setShowNewKeyDialog(true);
      setShowCreateDialog(false);

      // Reset form to defaults
      setCreateForm({
        name: '',
        hourlyLimit: 1000,
        dailyLimit: 10000,
        monthlyLimit: 100000,
        burstLimit: 100,
        expiresAt: '',
      });
      setNoLimit({
        hourly: false,
        daily: false,
        monthly: false,
        burst: false,
      });
      setExpiresAtDirty(false);
      setNeverExpires(true);

      // Refresh the list
      await fetchApiKeys();

      toast({
        title: "Success",
        description: "API key created successfully",
        variant: "default",
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create API key';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteApiKey = async (apiKeyId: string) => {
    try {
      const response = await fetch(`/api/account/api-keys/${apiKeyId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to delete API key');
      }

      // Remove from local state
      setApiKeys(apiKeys.filter(key => key.id !== apiKeyId));
      setDeletingApiKey(null); // Close the modal

      toast({
        title: "Success",
        description: "API key deleted successfully",
        variant: "default",
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete API key';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = async (text: string) => {
    const { safeClipboardCopy, getClipboardErrorDescription } = await import('@/lib/clipboard-utils');
    const success = await safeClipboardCopy(text);
    if (success) {
      toast({
        title: "Copied!",
        description: "API key copied to clipboard.",
        variant: "success",
      });
    } else {
      logger.error('Failed to copy API key');
      toast({
        title: "Copy Failed",
        description: getClipboardErrorDescription(),
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return format(new Date(dateString), 'MMM dd, yyyy HH:mm');
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const getStatusBadge = (apiKey: ApiKey) => {
    if (isExpired(apiKey.expiresAt)) {
      return <Badge variant="destructive">Expired</Badge>;
    }
    if (apiKey.expiresAt) {
      return <Badge variant="secondary">Expires {format(new Date(apiKey.expiresAt), 'MMM dd, yyyy')}</Badge>;
    }
    return <Badge variant="default">Active</Badge>;
  };

  // PATCH handler for enable/disable
  const handleToggleEnabled = async (apiKeyId: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/account/api-keys/${apiKeyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) throw new Error('Failed to update API key');
      await fetchApiKeys();
      toast({ title: 'Success', description: `API key ${enabled ? 'enabled' : 'disabled'}.`, variant: 'default' });
    } catch {
      toast({ title: 'Error', description: 'Failed to update API key', variant: 'destructive' });
    }
  };

  // Open edit rate limits dialog
  const handleOpenEditLimits = (apiKey: ApiKey) => {
    setEditingApiKey(apiKey);
    setEditForm({
      name: apiKey.name,
      hourlyLimit: apiKey.hourlyLimit || 1000,
      dailyLimit: apiKey.dailyLimit || 10000,
      monthlyLimit: apiKey.monthlyLimit || 100000,
      burstLimit: apiKey.burstLimit || 100,
      expiresAt: apiKey.expiresAt ? format(new Date(apiKey.expiresAt), "yyyy-MM-dd'T'HH:mm") : '',
    });
    setEditNeverExpires(!apiKey.expiresAt);
    setEditNoLimit({
      hourly: apiKey.hourlyLimit === null,
      daily: apiKey.dailyLimit === null,
      monthly: apiKey.monthlyLimit === null,
      burst: apiKey.burstLimit === null,
    });
    setShowEditLimitsDialog(true);
  };

  // Check if there are changes to save
  const hasChanges = () => {
    if (!editingApiKey) return false;

    // Check expiry changes
    const originalNeverExpires = !editingApiKey.expiresAt;
    if (editNeverExpires !== originalNeverExpires) return true;

    if (!editNeverExpires) {
      // Both have expiry dates, check if they are different
      const originalExpiresAt = editingApiKey.expiresAt ? format(new Date(editingApiKey.expiresAt), "yyyy-MM-dd'T'HH:mm") : '';
      if (editForm.expiresAt !== originalExpiresAt) return true;
    }

    // Check limits
    const getEffectiveLimit = (isUnlimited: boolean, formValue: number | null | undefined, defaultValue: number) => {
      return isUnlimited ? null : (formValue ?? defaultValue);
    };

    if (getEffectiveLimit(editNoLimit.hourly, editForm.hourlyLimit, 1000) !== editingApiKey.hourlyLimit) return true;
    if (getEffectiveLimit(editNoLimit.daily, editForm.dailyLimit, 10000) !== editingApiKey.dailyLimit) return true;
    if (getEffectiveLimit(editNoLimit.monthly, editForm.monthlyLimit, 100000) !== editingApiKey.monthlyLimit) return true;
    if (getEffectiveLimit(editNoLimit.burst, editForm.burstLimit, 100) !== editingApiKey.burstLimit) return true;

    return false;
  };

  // Update rate limits for existing API key
  const handleUpdateRateLimits = async () => {
    if (!editingApiKey) return;

    // Validate expiry date if not "Never Expires"
    if (!editNeverExpires && !isValidExpiresAt(editForm.expiresAt)) {
      toast({
        title: "Error",
        description: "Please select both date and time.",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingLimits(true);
    try {
      const updateData = {
        hourlyLimit: editNoLimit.hourly ? null : (editForm.hourlyLimit || 1000),
        dailyLimit: editNoLimit.daily ? null : (editForm.dailyLimit || 10000),
        monthlyLimit: editNoLimit.monthly ? null : (editForm.monthlyLimit || 100000),
        burstLimit: editNoLimit.burst ? null : (editForm.burstLimit || 100),
        expiresAt: editNeverExpires ? null : new Date(editForm.expiresAt || '').toISOString(),
      };

      const response = await fetch(`/api/account/api-keys/${editingApiKey.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to update rate limits');
      }

      await fetchApiKeys();
      setShowEditLimitsDialog(false);
      setEditingApiKey(null);

      toast({ title: 'Success', description: `API Key ${editingApiKey.name} updated sccessfully`, variant: 'default' });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update rate limits';
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsUpdatingLimits(false);
    }
  };

  // Helper functions for usage statistics
  const calculateUsagePercentage = (current: number, limit: number | null): number => {
    if (limit === null || limit === 0) return 0;
    return Math.min((current / limit) * 100, 100);
  };

  const getUsageColor = (percentage: number): string => {
    if (percentage >= 90) return 'text-red-600';
    if (percentage >= 75) return 'text-orange-600';
    if (percentage >= 50) return 'text-yellow-600';
    return 'text-green-600';
  };



  const formatUsageDisplay = (current: number, limit: number | null): string => {
    if (limit === null) return `${current.toLocaleString()} / No Limit`;
    return `${current.toLocaleString()} / ${limit.toLocaleString()}`;
  };

  if (sessionStatus === 'loading' || (isLoading && apiKeys.length === 0)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>API Key Management</CardTitle>
          <CardDescription className="mt-1">
            Create and manage API keys for programmatic access to your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!session) {
    return (
      <div className="p-6 space-y-6 border border-gray-200 rounded-lg shadow-sm dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">
          API Key Management
        </h3>
        <p className="text-gray-600 dark:text-gray-400">Please sign in to manage API keys.</p>
      </div>
    );
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>API Key Management</CardTitle>
            <CardDescription className="mt-1">
              Create and manage API keys for programmatic access to your account.
            </CardDescription>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (!open) { setExpiresAtDirty(false); } }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create API Key
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-w-[95vw]">
              <DialogHeader>
                <DialogTitle>Create New API Key</DialogTitle>
                <DialogDescription>
                  Create a new API key for programmatic access. The key will be shown only once.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    placeholder="e.g., Production API, Development Script"
                  />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="neverExpires"
                    checked={neverExpires}
                    onChange={(e) => {
                      setNeverExpires(e.target.checked);
                      if (e.target.checked) {
                        setCreateForm({ ...createForm, expiresAt: '' });
                        setExpiresAtDirty(false);
                      }
                    }}
                  />
                  <Label htmlFor="neverExpires">Never Expires</Label>
                </div>
                <Label htmlFor="expiresAt">Expiration Date and Time</Label>
                <DateTimePicker
                  date={createForm.expiresAt ? new Date(createForm.expiresAt) : undefined}
                  setDate={(date) => {
                    setCreateForm({ ...createForm, expiresAt: date ? format(date, "yyyy-MM-dd'T'HH:mm") : '' });
                    setExpiresAtDirty(true);
                  }}
                  disabled={neverExpires}
                />
                {!neverExpires && expiresAtDirty && !isValidExpiresAt(createForm.expiresAt) && (
                  <span className="text-red-600 text-xs mt-1">Please select both date and time.</span>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="hourlyLimit">Hourly Limit</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-gray-500 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Maximum number of API requests allowed per hour. Resets every hour on the hour.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        id="hourlyLimit"
                        type="number"
                        value={noLimit.hourly ? '' : (createForm.hourlyLimit || '')}
                        onChange={(e) => setCreateForm({ ...createForm, hourlyLimit: e.target.value === '' ? null : parseInt(e.target.value) })}
                        disabled={noLimit.hourly}
                        placeholder={noLimit.hourly ? 'No Limit' : '1000'}
                        className="min-w-0 flex-1"
                      />
                      <Button
                        type="button"
                        variant={noLimit.hourly ? "default" : "outline"}
                        size="sm"
                        onClick={() => setNoLimit({ ...noLimit, hourly: !noLimit.hourly })}
                        className="whitespace-nowrap"
                      >
                        {noLimit.hourly ? "Unlimited" : "Set Limit"}
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="dailyLimit">Daily Limit</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-gray-500 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Maximum number of API requests allowed per day. Resets every day at midnight UTC.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        id="dailyLimit"
                        type="number"
                        value={noLimit.daily ? '' : (createForm.dailyLimit || '')}
                        onChange={(e) => setCreateForm({ ...createForm, dailyLimit: e.target.value === '' ? null : parseInt(e.target.value) })}
                        disabled={noLimit.daily}
                        placeholder={noLimit.daily ? 'No Limit' : '10000'}
                        className="min-w-0 flex-1"
                      />
                      <Button
                        type="button"
                        variant={noLimit.daily ? "default" : "outline"}
                        size="sm"
                        onClick={() => setNoLimit({ ...noLimit, daily: !noLimit.daily })}
                        className="whitespace-nowrap"
                      >
                        {noLimit.daily ? "Unlimited" : "Set Limit"}
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="monthlyLimit">Monthly Limit</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-gray-500 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Maximum number of API requests allowed per month. Resets on the 1st of each month.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        id="monthlyLimit"
                        type="number"
                        value={noLimit.monthly ? '' : (createForm.monthlyLimit || '')}
                        onChange={(e) => setCreateForm({ ...createForm, monthlyLimit: e.target.value === '' ? null : parseInt(e.target.value) })}
                        disabled={noLimit.monthly}
                        placeholder={noLimit.monthly ? 'No Limit' : '100000'}
                        className="min-w-0 flex-1"
                      />
                      <Button
                        type="button"
                        variant={noLimit.monthly ? "default" : "outline"}
                        size="sm"
                        onClick={() => setNoLimit({ ...noLimit, monthly: !noLimit.monthly })}
                        className="whitespace-nowrap"
                      >
                        {noLimit.monthly ? "Unlimited" : "Set Limit"}
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="burstLimit">Burst Limit</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-gray-500 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Maximum number of API requests allowed per minute (60 seconds). This provides fine-grained control over request frequency.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        id="burstLimit"
                        type="number"
                        value={noLimit.burst ? '' : (createForm.burstLimit || '')}
                        onChange={(e) => setCreateForm({ ...createForm, burstLimit: e.target.value === '' ? null : parseInt(e.target.value) })}
                        disabled={noLimit.burst}
                        placeholder={noLimit.burst ? 'No Limit' : '100'}
                        className="min-w-0 flex-1"
                      />
                      <Button
                        type="button"
                        variant={noLimit.burst ? "default" : "outline"}
                        size="sm"
                        onClick={() => setNoLimit({ ...noLimit, burst: !noLimit.burst })}
                        className="whitespace-nowrap"
                      >
                        {noLimit.burst ? "Unlimited" : "Set Limit"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateApiKey} disabled={!!(isCreating || (!neverExpires && !isValidExpiresAt(createForm.expiresAt)))}>
                  {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Key
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0 flex flex-col">
        <ScrollArea className="flex-1 h-full w-full">
          <div className="space-y-6 p-6">

            {error && (
              <div className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
                {error}
              </div>
            )}

            {apiKeys.length === 0 ? (
              <div className="text-center py-8">
                <Key className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No API Keys</h4>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  You haven&apos;t created any API keys yet. Create your first key to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {apiKeys.map((apiKey) => (
                  <Card key={apiKey.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            {apiKey.name}
                            {getStatusBadge(apiKey)}
                          </CardTitle>
                          <CardDescription>
                            Created {formatDate(apiKey.createdAt)}
                            {apiKey.lastUsed && ` • Last used ${formatDate(apiKey.lastUsed)}`}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={apiKey.enabled} onCheckedChange={checked => handleToggleEnabled(apiKey.id, checked)} />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => handleOpenEditLimits(apiKey)}>Edit Limits</DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setDeletingApiKey(apiKey)}
                                className="text-red-600 focus:text-red-600"
                              >
                                Delete API Key
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-gray-500" />
                          <div className="flex items-center gap-1">
                            <span>Hourly:</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 text-gray-400 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p>Maximum number of API requests allowed per hour. Resets every hour on the hour.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <span>{apiKey.hourlyLimit === null ? 'No Limit' : apiKey.hourlyLimit.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-500" />
                          <div className="flex items-center gap-1">
                            <span>Daily:</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 text-gray-400 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p>Maximum number of API requests allowed per day. Resets every day at midnight UTC.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <span>{apiKey.dailyLimit === null ? 'No Limit' : apiKey.dailyLimit.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-gray-500" />
                          <div className="flex items-center gap-1">
                            <span>Monthly:</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 text-gray-400 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p>Maximum number of API requests allowed per month. Resets on the 1st of each month.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <span>{apiKey.monthlyLimit === null ? 'No Limit' : apiKey.monthlyLimit.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Key className="h-4 w-4 text-gray-500" />
                          <div className="flex items-center gap-1">
                            <span>Burst:</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 text-gray-400 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p>Maximum number of API requests allowed per minute (60 seconds). This provides fine-grained control over request frequency.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <span>{apiKey.burstLimit === null ? 'No Limit' : apiKey.burstLimit.toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Usage Statistics Section */}
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-gray-500" />
                            <span className="text-sm font-medium">Usage Statistics</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {showUsageDetails[apiKey.id] && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => fetchUsageStats(apiKey.id)}
                                disabled={loadingUsageStats[apiKey.id]}
                                className="text-xs"
                              >
                                <RefreshCw className={`h-3 w-3 ${loadingUsageStats[apiKey.id] ? 'animate-spin' : ''}`} />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleUsageDetails(apiKey.id)}
                              className="text-xs"
                            >
                              {showUsageDetails[apiKey.id] ? 'Hide Details' : 'Show Details'}
                              <TrendingUp className="h-3 w-3 ml-1" />
                            </Button>
                          </div>
                        </div>

                        {showUsageDetails[apiKey.id] && (
                          <div className="space-y-3">
                            {loadingUsageStats[apiKey.id] && !usageStats[apiKey.id] ? (
                              <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">Loading usage statistics...</span>
                              </div>
                            ) : usageStats[apiKey.id] ? (
                              <div className="space-y-3">
                                {/* Current Usage vs Limits */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {/* Hourly Usage */}
                                  {apiKey.hourlyLimit !== null && (
                                    <div className="space-y-1">
                                      <div className="flex justify-between text-xs">
                                        <span>Hourly Usage</span>
                                        <span className={getUsageColor(calculateUsagePercentage(usageStats[apiKey.id].usageByPeriod.hourly, apiKey.hourlyLimit))}>
                                          {formatUsageDisplay(usageStats[apiKey.id].usageByPeriod.hourly, apiKey.hourlyLimit)}
                                        </span>
                                      </div>
                                      <Progress
                                        value={calculateUsagePercentage(usageStats[apiKey.id].usageByPeriod.hourly, apiKey.hourlyLimit)}
                                        className="h-2"
                                      />
                                    </div>
                                  )}

                                  {/* Daily Usage */}
                                  {apiKey.dailyLimit !== null && (
                                    <div className="space-y-1">
                                      <div className="flex justify-between text-xs">
                                        <span>Daily Usage</span>
                                        <span className={getUsageColor(calculateUsagePercentage(usageStats[apiKey.id].usageByPeriod.daily, apiKey.dailyLimit))}>
                                          {formatUsageDisplay(usageStats[apiKey.id].usageByPeriod.daily, apiKey.dailyLimit)}
                                        </span>
                                      </div>
                                      <Progress
                                        value={calculateUsagePercentage(usageStats[apiKey.id].usageByPeriod.daily, apiKey.dailyLimit)}
                                        className="h-2"
                                      />
                                    </div>
                                  )}

                                  {/* Monthly Usage */}
                                  {apiKey.monthlyLimit !== null && (
                                    <div className="space-y-1">
                                      <div className="flex justify-between text-xs">
                                        <span>Monthly Usage</span>
                                        <span className={getUsageColor(calculateUsagePercentage(usageStats[apiKey.id].usageByPeriod.monthly, apiKey.monthlyLimit))}>
                                          {formatUsageDisplay(usageStats[apiKey.id].usageByPeriod.monthly, apiKey.monthlyLimit)}
                                        </span>
                                      </div>
                                      <Progress
                                        value={calculateUsagePercentage(usageStats[apiKey.id].usageByPeriod.monthly, apiKey.monthlyLimit)}
                                        className="h-2"
                                      />
                                    </div>
                                  )}

                                  {/* Burst Usage */}
                                  {apiKey.burstLimit !== null && (
                                    <div className="space-y-1">
                                      <div className="flex justify-between text-xs">
                                        <span>Burst Usage (Current Minute)</span>
                                        <span className={getUsageColor(calculateUsagePercentage(usageStats[apiKey.id].usageByPeriod.burst, apiKey.burstLimit))}>
                                          {formatUsageDisplay(usageStats[apiKey.id].usageByPeriod.burst, apiKey.burstLimit)}
                                        </span>
                                      </div>
                                      <Progress
                                        value={calculateUsagePercentage(usageStats[apiKey.id].usageByPeriod.burst, apiKey.burstLimit)}
                                        className="h-2"
                                      />
                                    </div>
                                  )}
                                </div>

                                {/* Summary Statistics */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                  <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                    <div className="font-medium text-gray-900 dark:text-white">
                                      {usageStats[apiKey.id].totalRequests.toLocaleString()}
                                    </div>
                                    <div className="text-gray-600 dark:text-gray-400">Total Requests</div>
                                  </div>
                                  <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                    <div className="font-medium text-green-600">
                                      {usageStats[apiKey.id].successfulRequests.toLocaleString()}
                                    </div>
                                    <div className="text-gray-600 dark:text-gray-400">Successful</div>
                                  </div>
                                  <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                    <div className="font-medium text-red-600">
                                      {usageStats[apiKey.id].rateLimitHits.toLocaleString()}
                                    </div>
                                    <div className="text-gray-600 dark:text-gray-400">Rate Limit Hits</div>
                                  </div>
                                  <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                    <div className="font-medium text-blue-600">
                                      {usageStats[apiKey.id].topEndpoints.length}
                                    </div>
                                    <div className="text-gray-600 dark:text-gray-400">Endpoints Used</div>
                                  </div>
                                </div>

                                {/* Top Endpoints */}
                                {usageStats[apiKey.id].topEndpoints.length > 0 && (
                                  <div className="space-y-2">
                                    <h4 className="text-xs font-medium text-gray-900 dark:text-white">Top Endpoints</h4>
                                    <div className="space-y-1">
                                      {usageStats[apiKey.id].topEndpoints.slice(0, 3).map((endpoint, index) => (
                                        <div key={index} className="flex justify-between items-center text-xs">
                                          <span className="font-mono text-gray-600 dark:text-gray-400 truncate">
                                            {endpoint.endpoint}
                                          </span>
                                          <span className="text-gray-900 dark:text-white ml-2">
                                            {endpoint.count} ({endpoint.percentage.toFixed(1)}%)
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Rate Limit Warning */}
                                {usageStats[apiKey.id].rateLimitHits > 0 && (
                                  <div className="flex items-center gap-2 p-2 bg-orange-50 dark:bg-orange-900/20 rounded text-xs">
                                    <AlertTriangle className="h-3 w-3 text-orange-600" />
                                    <span className="text-orange-800 dark:text-orange-200">
                                      This API key has hit rate limits {usageStats[apiKey.id].rateLimitHits} times. Consider increasing limits if needed.
                                    </span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-center py-4 text-sm text-gray-600 dark:text-gray-400">
                                No usage data available yet. Usage statistics will appear after the API key is used.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Dialog to show newly created API key */}
            <Dialog open={showNewKeyDialog} onOpenChange={(open) => {
              setShowNewKeyDialog(open);
              // Auto-reveal key on HTTP when dialog opens
              if (open && isRunningOverHttp()) {
                setShowApiKey(true);
              }
            }}>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>API Key Created Successfully</DialogTitle>
                  <DialogDescription>
                    Your new API key has been created. Copy it now as it won&apos;t be shown again.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label>API Key</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="api-key-input"
                        type={showApiKey ? 'text' : 'password'}
                        value={newApiKey}
                        readOnly
                        className="font-mono"
                        onClick={(e) => {
                          // Auto-select on click for easy manual copying
                          (e.target as HTMLInputElement).select();
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isRunningOverHttp()}
                        onClick={() => {
                          // Auto-show key before copying on HTTP
                          if (isRunningOverHttp() && !showApiKey) {
                            setShowApiKey(true);
                            // Give time for UI to update
                            setTimeout(() => copyToClipboard(newApiKey), 100);
                          } else {
                            copyToClipboard(newApiKey);
                          }
                        }}
                        title={isRunningOverHttp() ? "Automatic copy disabled on HTTP - use manual copy instead" : "Copy to clipboard"}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {isRunningOverHttp() && (
                    <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-md border border-orange-200 dark:border-orange-800">
                      <p className="text-sm text-orange-800 dark:text-orange-200">
                        <strong>HTTP Connection:</strong> Copy button is disabled when not using HTTPS. Unhide the API key then click the field above to select the API key, then press Ctrl+C (or Cmd+C on Mac) to copy manually.
                      </p>
                    </div>
                  )}
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-md">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      <strong>Important:</strong> This is the only time you&apos;ll see this API key.
                      Make sure to copy it to a secure location.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => setShowNewKeyDialog(false)}>
                    I&apos;ve Copied the Key
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Dialog to edit rate limits */}
            <Dialog open={showEditLimitsDialog} onOpenChange={setShowEditLimitsDialog}>
              <DialogContent className="sm:max-w-3xl max-w-[95vw]">
                <DialogHeader>
                  <DialogTitle>Edit Rate Limits for {editingApiKey?.name}</DialogTitle>
                  <DialogDescription>
                    Modify the rate limits for &quot;{editingApiKey?.name}&quot;.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        id="editNeverExpires"
                        checked={editNeverExpires}
                        onChange={(e) => {
                          setEditNeverExpires(e.target.checked);
                          if (e.target.checked) {
                            setEditForm({ ...editForm, expiresAt: '' });
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <Label htmlFor="editNeverExpires">Never Expires</Label>
                    </div>
                    <Label htmlFor="editExpiresAt">Expiration Date and Time</Label>
                    <DateTimePicker
                      date={editForm.expiresAt ? new Date(editForm.expiresAt) : undefined}
                      setDate={(date) => setEditForm({ ...editForm, expiresAt: date ? format(date, "yyyy-MM-dd'T'HH:mm") : '' })}
                      disabled={editNeverExpires}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="editHourlyLimit">Hourly Limit</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-4 w-4 text-gray-500 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>Maximum number of API requests allowed per hour. Resets every hour on the hour.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          id="editHourlyLimit"
                          type="number"
                          value={editNoLimit.hourly ? '' : (editForm.hourlyLimit || '')}
                          onChange={(e) => setEditForm({ ...editForm, hourlyLimit: e.target.value === '' ? null : parseInt(e.target.value) })}
                          disabled={editNoLimit.hourly}
                          placeholder={editNoLimit.hourly ? 'No Limit' : '1000'}
                          className="min-w-0 flex-1"
                        />
                        <Button
                          type="button"
                          variant={editNoLimit.hourly ? "default" : "outline"}
                          size="sm"
                          onClick={() => setEditNoLimit({ ...editNoLimit, hourly: !editNoLimit.hourly })}
                          className="whitespace-nowrap"
                        >
                          {editNoLimit.hourly ? "Unlimited" : "Set Limit"}
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="editDailyLimit">Daily Limit</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-4 w-4 text-gray-500 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>Maximum number of API requests allowed per day. Resets every day at midnight UTC.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          id="editDailyLimit"
                          type="number"
                          value={editNoLimit.daily ? '' : (editForm.dailyLimit || '')}
                          onChange={(e) => setEditForm({ ...editForm, dailyLimit: e.target.value === '' ? null : parseInt(e.target.value) })}
                          disabled={editNoLimit.daily}
                          placeholder={editNoLimit.daily ? 'No Limit' : '10000'}
                          className="min-w-0 flex-1"
                        />
                        <Button
                          type="button"
                          variant={editNoLimit.daily ? "default" : "outline"}
                          size="sm"
                          onClick={() => setEditNoLimit({ ...editNoLimit, daily: !editNoLimit.daily })}
                          className="whitespace-nowrap"
                        >
                          {editNoLimit.daily ? "Unlimited" : "Set Limit"}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="editMonthlyLimit">Monthly Limit</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-4 w-4 text-gray-500 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>Maximum number of API requests allowed per month. Resets on the 1st of each month.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          id="editMonthlyLimit"
                          type="number"
                          value={editNoLimit.monthly ? '' : (editForm.monthlyLimit || '')}
                          onChange={(e) => setEditForm({ ...editForm, monthlyLimit: e.target.value === '' ? null : parseInt(e.target.value) })}
                          disabled={editNoLimit.monthly}
                          placeholder={editNoLimit.monthly ? 'No Limit' : '100000'}
                          className="min-w-0 flex-1"
                        />
                        <Button
                          type="button"
                          variant={editNoLimit.monthly ? "default" : "outline"}
                          size="sm"
                          onClick={() => setEditNoLimit({ ...editNoLimit, monthly: !editNoLimit.monthly })}
                          className="whitespace-nowrap"
                        >
                          {editNoLimit.monthly ? "Unlimited" : "Set Limit"}
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="editBurstLimit">Burst Limit</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-4 w-4 text-gray-500 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>Maximum number of API requests allowed per minute (60 seconds). This provides fine-grained control over request frequency.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          id="editBurstLimit"
                          type="number"
                          value={editNoLimit.burst ? '' : (editForm.burstLimit || '')}
                          onChange={(e) => setEditForm({ ...editForm, burstLimit: e.target.value === '' ? null : parseInt(e.target.value) })}
                          disabled={editNoLimit.burst}
                          placeholder={editNoLimit.burst ? 'No Limit' : '100'}
                          className="min-w-0 flex-1"
                        />
                        <Button
                          type="button"
                          variant={editNoLimit.burst ? "default" : "outline"}
                          size="sm"
                          onClick={() => setEditNoLimit({ ...editNoLimit, burst: !editNoLimit.burst })}
                          className="whitespace-nowrap"
                        >
                          {editNoLimit.burst ? "Unlimited" : "Set Limit"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowEditLimitsDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleUpdateRateLimits} disabled={isUpdatingLimits || !hasChanges()}>
                    {isUpdatingLimits && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save Changes
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Dialog to confirm deletion */}
            {deletingApiKey && (
              <AlertDialog open={!!deletingApiKey} onOpenChange={(open) => !open && setDeletingApiKey(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete your API key.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setDeletingApiKey(null)}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDeleteApiKey(deletingApiKey.id)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
} 