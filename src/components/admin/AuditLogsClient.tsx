"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RotateCw, Search, X, Filter, Loader2, ChevronDown, ChevronUp, Info, Check, Copy, Download } from 'lucide-react'; // Import icons
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SortableTable, Column } from "@/components/ui/sortable-table"; // Import SortableTable
import { sortData } from "@/lib/table-utils"; // Import sortData utility
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton
import { DateRangePicker } from '@/components/analytics/DateRangePicker';
import { DateRange } from 'react-day-picker';
import { ResponsiveActionButton } from '@/components/analytics/ResponsiveActionButton';
import { useIsMobile, useIsPhone } from '@/hooks/use-mobile';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { PaginationControls } from '@/components/ui/pagination-controls';

interface AuditLogEntry {
    id: string;
    timestamp: Date;
    userId: string | null;
    action: string;
    details: Record<string, unknown>;
    matchedFields?: string[]; // New: fields that matched the search
    user?: {
        name: string | null;
        email: string | null;
    } | null;
}



const camelCaseToTitle = (text: string) => {
    const result = text.replace(/([A-Z])/g, " $1");
    return result.charAt(0).toUpperCase() + result.slice(1);
};

// Helper function to recursively remove null and undefined values from objects
const removeNullValues = (obj: unknown): unknown => {
    if (obj === null || obj === undefined) {
        return undefined;
    }

    if (Array.isArray(obj)) {
        return obj.map(removeNullValues).filter(item => item !== undefined);
    }

    if (typeof obj === 'object') {
        const cleaned: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            const cleanedValue = removeNullValues(value);
            if (cleanedValue !== undefined && cleanedValue !== null) {
                // eslint-disable-next-line security/detect-object-injection
                cleaned[key] = cleanedValue;
            }
        }
        return Object.keys(cleaned).length > 0 ? cleaned : undefined;
    }

    return obj;
};

const formatPlainText = (data: Record<string, unknown> | unknown, depth = 0): string => {
    if (typeof data !== 'object' || data === null) {
        return String(data);
    }

    // Remove null values before formatting
    const cleanedData = removeNullValues(data) as Record<string, unknown>;
    if (!cleanedData || typeof cleanedData !== 'object') {
        return '';
    }

    return Object.entries(cleanedData)
        .map(([key, value]) => {
            const indent = '  '.repeat(depth);
            const title = camelCaseToTitle(key);
            if (typeof value === 'object' && value !== null) {
                return `${indent}${title}:\n${formatPlainText(value, depth + 1)}`;
            }
            return `${indent}${title}: ${value}`;
        })
        .join('\n');
};

const RenderPlainDetails = ({ data, depth = 0 }: { data: Record<string, unknown> | unknown, depth?: number }) => {
    if (typeof data !== 'object' || data === null) {
        return <span className="text-sm text-foreground">{String(data)}</span>;
    }

    // Remove null values before rendering
    const cleanedData = removeNullValues(data) as Record<string, unknown>;
    if (!cleanedData || typeof cleanedData !== 'object') {
        return <span className="text-sm text-muted-foreground">No data available</span>;
    }

    return (
        <div className={`flex flex-col ${depth > 0 ? 'ml-1 pl-4 border-l-2 border-muted mt-2 mb-2' : 'space-y-0'}`}>
            {Object.entries(cleanedData).map(([key, value]) => {
                const isObject = typeof value === 'object' && value !== null;
                return (
                    <div key={key} className={`
                        ${isObject ? 'flex flex-col py-2' : 'flex items-baseline gap-4 py-2 border-b border-gray-200 dark:border-gray-800 last:border-0'}
                    `}>
                        <span className={`text-sm font-medium text-muted-foreground shrink-0 ${isObject ? 'mb-1' : 'w-48'}`}>
                            {camelCaseToTitle(key)}
                        </span>
                        {isObject ? (
                            <RenderPlainDetails data={value} depth={depth + 1} />
                        ) : (
                            <span className="text-sm text-foreground break-all">{String(value)}</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export function AuditLogsClient() {
    const isMobile = useIsMobile();
    const isPhone = useIsPhone();
    const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
    const [loading, setLoading] = useState(false); // Changed: start as false, only show skeleton on initial load
    const [isInitialLoad, setIsInitialLoad] = useState(true); // New: track if this is the first load
    const [search, setSearch] = useState('');
    const [userSearch] = useState(''); // Keep for legacy API support
    const [actionSearch] = useState(''); // Keep for legacy API support
    const [detailsSearch] = useState(''); // Keep for legacy API support
    const [detailsOnlySearch, setDetailsOnlySearch] = useState(''); // New: dedicated details search
    const [detailsFieldFilter, setDetailsFieldFilter] = useState('all'); // New: field-specific filter
    const [showAdvancedSearch, setShowAdvancedSearch] = useState(false); // New: toggle for advanced search
    const [searchHelpOpen, setSearchHelpOpen] = useState(false); // New: search help dialog state
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

    // Legacy date support for backward compatibility
    const startDate = dateRange?.from;
    const endDate = dateRange?.to;
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [modalDetails, setModalDetails] = useState<Record<string, unknown> | null>(null);
    const [modalMatchedFields, setModalMatchedFields] = useState<string[] | undefined>(undefined);
    const [activeTab, setActiveTab] = useState('plain');
    const [copySuccess, setCopySuccess] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [logsPerPage, setLogsPerPage] = useLocalStorage<number | 'ALL'>('audit-logs-page-size', 10); // Default logs per page
    const [totalLogs, setTotalLogs] = useState(0);
    const [currentLogIndex, setCurrentLogIndex] = useState<number>(-1); // New: track current log index for navigation
    const [refreshTrigger, setRefreshTrigger] = useState(0); // New state for refresh
    const [isRefreshingAuditLogs, setIsRefreshingAuditLogs] = useState(false); // New: track refresh state for button spinner
    const [isButtonRefreshing, setIsButtonRefreshing] = useState(false);
    const [sortBy, setSortBy] = useState<string>('timestamp');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [excludeAttempts, setExcludeAttempts] = useState(false); // New: exclude ATTEMPT actions
    const [exportDialogOpen, setExportDialogOpen] = useState(false); // New: export dialog state
    const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv'); // New: export format
    const [exportScope, setExportScope] = useState<'current' | 'all'>('current'); // New: export scope
    const [isExporting, setIsExporting] = useState(false); // New: export loading state
    const handleSortChange = (newSortBy: string, newSortDirection: 'asc' | 'desc') => {
        setSortBy(newSortBy);
        setSortDirection(newSortDirection);
    };

    useEffect(() => {
        const delayMs = 500; // Reduced delay for snappier pagination/page size changes

        const handler = setTimeout(() => {
            const fetchLogs = async () => {
                // Only show skeleton loading on initial load
                if (isInitialLoad) {
                    setLoading(true);
                } else {
                    // For non-initial loads, show spinner in refresh button
                    setIsRefreshingAuditLogs(true);
                }
                try {
                    // Build query string including search, pagination, and date filters
                    const queryParams = new URLSearchParams();
                    if (search) queryParams.append('search', search); // Use unified search
                    if (userSearch) queryParams.append('user', userSearch); // Legacy support
                    if (actionSearch) queryParams.append('action', actionSearch); // Legacy support
                    if (detailsSearch) queryParams.append('details', detailsSearch); // Legacy support
                    if (detailsOnlySearch) queryParams.append('detailsOnly', detailsOnlySearch); // New: dedicated details search
                    if (detailsFieldFilter) queryParams.append('detailsField', detailsFieldFilter); // New: field filter
                    if (excludeAttempts) queryParams.append('excludeAttempts', 'true'); // New: exclude ATTEMPTs
                    if (startDate) queryParams.append('startDate', startDate.toISOString());
                    if (endDate) queryParams.append('endDate', endDate.toISOString());
                    queryParams.append('page', String(currentPage));
                    const pageSizeToSend = logsPerPage === 'ALL' ? 10000 : logsPerPage;
                    queryParams.append('pageSize', String(pageSizeToSend));

                    const response = await fetch(`/api/admin/audit-logs?${queryParams.toString()}`);

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(`Error fetching audit logs: ${response.statusText} - ${errorData.error}`);
                    }
                    const data: { auditLogs: AuditLogEntry[]; totalCount: number } = await response.json();

                    if (isPhone && currentPage > 1) {
                        setAuditLogs(prev => {
                            const existingIds = new Set(prev.map(log => log.id));
                            const newLogs = data.auditLogs.filter(log => !existingIds.has(log.id));
                            return [...prev, ...newLogs];
                        });
                    } else {
                        setAuditLogs(data.auditLogs);
                    }

                    setTotalLogs(data.totalCount);
                } catch {
                    setAuditLogs([]);
                    setTotalLogs(0); // Reset total count on error
                } finally {
                    setLoading(false);
                    setIsRefreshingAuditLogs(false); // Always set to false when fetch completes
                    // Mark initial load as complete after first fetch
                    if (isInitialLoad) {
                        setIsInitialLoad(false);
                    }
                }
            };

            fetchLogs();
        }, delayMs);

        // Cleanup function to clear the timeout if the dependencies change before the delay
        return () => {
            clearTimeout(handler);
        };
    }, [search, userSearch, actionSearch, detailsSearch, detailsOnlySearch, detailsFieldFilter, excludeAttempts, startDate, endDate, currentPage, logsPerPage, refreshTrigger, isInitialLoad, isPhone]); // Add excludeAttempts dependency

    const totalPages = logsPerPage === 'ALL' ? 1 : Math.ceil(totalLogs / logsPerPage);

    const handlePageChange = (page: number) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    const handleLogsPerPageChange = (value: number | 'ALL') => {
        setLogsPerPage(value);
        setCurrentPage(1); // Reset to first page when logs per page changes
    };

    // Reset page to 1 when search or date filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [search, userSearch, actionSearch, detailsSearch, detailsOnlySearch, detailsFieldFilter, excludeAttempts, startDate, endDate, isPhone]);

    // Export handlers
    const handleConfirmExport = async () => {
        setIsExporting(true);

        try {
            let logsToExport: AuditLogEntry[];

            if (exportScope === 'current') {
                logsToExport = sortedAuditLogs;
            } else {
                // Fetch ALL matching logs
                const queryParams = new URLSearchParams();
                if (search) queryParams.append('search', search);
                if (detailsOnlySearch) queryParams.append('detailsOnly', detailsOnlySearch);
                if (detailsFieldFilter) queryParams.append('detailsField', detailsFieldFilter);
                if (excludeAttempts) queryParams.append('excludeAttempts', 'true');
                if (startDate) queryParams.append('startDate', startDate.toISOString());
                if (endDate) queryParams.append('endDate', endDate.toISOString());
                queryParams.append('page', '1');
                queryParams.append('pageSize', '10000');

                const response = await fetch(`/api/admin/audit-logs?${queryParams.toString()}`);
                const data = await response.json();
                logsToExport = data.auditLogs;
            }

            if (exportFormat === 'csv') {
                exportToCSV(logsToExport);
            } else {
                exportToJSON(logsToExport);
            }

            setExportDialogOpen(false);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };
    const exportToCSV = (logs: AuditLogEntry[]) => {
        const headers = ['Timestamp', 'User', 'Action', 'Details'];
        const rows = logs.map(log => [
            format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
            log.user?.name || log.user?.email || log.userId || 'N/A',
            log.action,
            JSON.stringify(removeNullValues(log.details))
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell =>
                `"${String(cell).replace(/"/g, '""')}"`
            ).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-logs-${exportScope}-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };
    const exportToJSON = (logs: AuditLogEntry[]) => {
        const exportData = {
            exported: new Date().toISOString(),
            exportScope,
            filters: {
                search,
                detailsOnlySearch,
                detailsFieldFilter,
                excludeAttempts,
                dateRange: dateRange ? {
                    from: dateRange.from?.toISOString(),
                    to: dateRange.to?.toISOString()
                } : null
            },
            totalLogs: logs.length,
            logs: logs.map(log => ({
                timestamp: log.timestamp,
                user: log.user,
                userId: log.userId,
                action: log.action,
                details: removeNullValues(log.details),
                matchedFields: log.matchedFields
            }))
        };

        const jsonContent = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-logs-${exportScope}-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Memoize sorted logs to ensure consistent navigation
    const sortedAuditLogs = useMemo(() => {
        return sortData(auditLogs, sortBy, sortDirection, []);
    }, [auditLogs, sortBy, sortDirection]);

    const columns: Column<AuditLogEntry>[] = [
        {
            key: 'timestamp',
            label: 'Timestamp',
            sortable: true,
            render: (log) => format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
        },
        {
            key: 'user.email', // Use nested key for sorting/rendering
            label: 'User',
            sortable: true,
            render: (log) => (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger>{log.user?.name || log.user?.email || log.userId || 'N/A'}</TooltipTrigger>
                        <TooltipContent>
                            <p>{log.user?.email}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            ),
        },
        {
            key: 'action',
            label: 'Action',
            sortable: true,
            render: (log) => log.action,
        },
        {
            key: 'details',
            label: 'Details',
            sortable: false,
            headerClassName: 'text-left', // Justify Actions header to the left
            render: (log) => (
                <div className="flex flex-col gap-1">
                    <div
                        className="text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:underline"
                        onClick={() => {
                            // Find the index of this log in the sorted list
                            const index = sortedAuditLogs.findIndex(l => l.id === log.id);
                            setCurrentLogIndex(index);
                            setModalDetails(log.details);
                            setModalMatchedFields(log.matchedFields);
                            setActiveTab('plain'); // Reset to plain tab
                            setIsDetailsModalOpen(true);
                            setCopySuccess(''); // Reset copy success message
                        }}
                    >
                        {log.details ? 'View Details' : 'N/A'}
                    </div>
                    {log.matchedFields && log.matchedFields.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {log.matchedFields.slice(0, 3).map((field, idx) => (
                                <span
                                    key={idx}
                                    className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded"
                                >
                                    {field}
                                </span>
                            ))}
                            {log.matchedFields.length > 3 && (
                                <span className="text-xs text-muted-foreground">
                                    +{log.matchedFields.length - 3} more
                                </span>
                            )}
                        </div>
                    )}
                </div>
            ),
        },
    ];



    // Update modal details when currentLogIndex changes
    useEffect(() => {
        if (currentLogIndex >= 0 && currentLogIndex < sortedAuditLogs.length) {
            const log = sortedAuditLogs.at(currentLogIndex);
            if (log) {
                setModalDetails(log.details);
                setModalMatchedFields(log.matchedFields);
            }
        }
    }, [currentLogIndex, sortedAuditLogs]);

    return (
        <Card className="flex flex-col flex-grow min-h-[300px]"> {/* Use flex-grow to fill available space with minimum height */}
            <CardHeader className="pb-3 shrink-0">
                <div className="flex items-center justify-between">
                    <CardTitle className={`${isMobile ? 'text-sm' : 'text-base'}`}>Audit Logs</CardTitle>
                    <div className="flex items-center gap-2">
                        {/* Export Dropdown */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    size={isMobile ? "icon" : "sm"}
                                    className={isMobile ? "w-10 h-10" : "gap-2"}
                                >
                                    <Download className="h-4 w-4" />
                                    {!isMobile && <span>Export</span>}
                                    {!isMobile && <ChevronDown className="h-4 w-4" />}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => {
                                    setExportFormat('csv');
                                    setExportDialogOpen(true);
                                }}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Export CSV
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                    setExportFormat('json');
                                    setExportDialogOpen(true);
                                }}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Export JSON
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Refresh Button */}
                        <ResponsiveActionButton
                            icon={isRefreshingAuditLogs ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                            label="Refresh"
                            onClick={() => setRefreshTrigger(prev => prev + 1)}
                            className="flex items-center gap-2"
                            disabled={isRefreshingAuditLogs}
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex flex-col flex-grow p-4 min-h-0"> {/* Reduced padding, min-h-0 for proper flex */}
                {/* Search and Date Range Controls */}
                <div className="space-y-4 mb-6 shrink-0">
                    {/* Main Search Field */}
                    <div className="flex items-center gap-2">
                        <div className="relative flex items-center flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder='Search... Use | for OR (e.g., "admin | root", "192.168.1.1 | 192.168.1.2")'
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className={search ? "pl-10 pr-16" : "pl-10 pr-10"}
                            />
                            <div className="absolute right-1 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                                {search && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => setSearch('')}
                                        aria-label="Clear search"
                                    >
                                        <X className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                )}
                                <Dialog open={searchHelpOpen} onOpenChange={setSearchHelpOpen}>
                                    <DialogTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                                            onClick={() => setSearchHelpOpen(true)}
                                        >
                                            <Info className="h-4 w-4" />
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-md">
                                        <DialogHeader>
                                            <DialogTitle>Search Help</DialogTitle>
                                            <DialogDescription>
                                                Learn how to search audit logs using various keywords and filters.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="max-h-96 overflow-y-auto">
                                            <div className="space-y-3">
                                                <div>
                                                    <p className="font-semibold mb-2">Basic Search:</p>
                                                    <ul className="list-disc list-inside space-y-1 text-sm">
                                                        <li><strong>AND logic:</strong> All terms must match (e.g., &quot;john assign&quot;)</li>
                                                        <li><strong>OR logic:</strong> Use pipe | for alternatives (e.g., &quot;admin | root&quot;)</li>
                                                        <li><strong>Exact phrase:</strong> Use quotes (e.g., &quot;VPN Users&quot;)</li>
                                                        <li><strong>Case-insensitive:</strong> Search ignores case</li>
                                                    </ul>
                                                </div>

                                                <div>
                                                    <p className="font-semibold mb-2">Examples:</p>
                                                    <ul className="list-disc list-inside space-y-1 text-sm">
                                                        <li>192.168.1.100 | 192.168.1.200 - Either IP</li>
                                                        <li>&quot;API Key&quot; | Local - Either auth method</li>
                                                        <li>john assign | mary delete - John&apos;s assigns OR Mary&apos;s deletes</li>
                                                        <li>assign operationType - Find logs with both terms</li>
                                                    </ul>
                                                </div>

                                                <div>
                                                    <p className="font-semibold mb-2">Advanced Search:</p>
                                                    <p className="text-sm mb-2">
                                                        Filter by specific fields. Also supports | for OR logic.
                                                    </p>
                                                    <ul className="list-disc list-inside space-y-1 text-sm">
                                                        <li>Select field: &quot;IP Address&quot;</li>
                                                        <li>Enter: &quot;192.168.1.100 | 192.168.1.200&quot;</li>
                                                        <li>Result: Logs matching either IP in that field only</li>
                                                    </ul>
                                                </div>

                                                <div>
                                                    <p className="font-semibold mb-2">Export:</p>
                                                    <p className="text-sm">
                                                        Use Export CSV or Export JSON buttons to download logs.
                                                        Choose between current page or all filtered results.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </div>
                        {/* Advanced Search Toggle */}
                        <Button
                            variant={showAdvancedSearch || detailsOnlySearch ? "default" : "outline"}
                            size="sm"
                            onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
                            className="flex items-center gap-1 shrink-0"
                        >
                            <Filter className="h-4 w-4" />
                            <span className="hidden sm:inline">Advanced</span>
                            {showAdvancedSearch ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                    </div>

                    {/* Advanced Search Section - Collapsible */}
                    {showAdvancedSearch && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 bg-muted/50 rounded-md border border-border">
                            <div className="relative flex items-center flex-1">
                                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder='Multiple values: Use | for OR (e.g., "192.168.1.100 | 192.168.1.200")'
                                    value={detailsOnlySearch}
                                    onChange={(e) => setDetailsOnlySearch(e.target.value)}
                                    className="pl-10 pr-8"
                                />
                                {detailsOnlySearch && (
                                    <button
                                        className="absolute right-2 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                                        onClick={() => setDetailsOnlySearch('')}
                                        aria-label="Clear details search"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                            {/* Field Filter Dropdown */}
                            <Select value={detailsFieldFilter} onValueChange={setDetailsFieldFilter}>
                                <SelectTrigger className="w-full sm:w-[180px] shrink-0">
                                    <SelectValue placeholder="Filter by field" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Fields</SelectItem>
                                    <SelectItem value="groupName">Group Name</SelectItem>
                                    <SelectItem value="ipAddress">IP Address</SelectItem>
                                    <SelectItem value="hostAlias">Host Alias</SelectItem>
                                    <SelectItem value="authMethod">Auth Method</SelectItem>
                                    <SelectItem value="targetGroup">Target Group</SelectItem>
                                    <SelectItem value="operationType">Operation Type</SelectItem>
                                </SelectContent>
                            </Select>
                            {/* Exclude ATTEMPTs Checkbox */}
                            <div className="flex items-center gap-2 shrink-0 px-3 py-2 bg-background rounded-md border border-border">
                                <input
                                    type="checkbox"
                                    id="exclude-attempts"
                                    checked={excludeAttempts}
                                    onChange={(e) => setExcludeAttempts(e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                <label
                                    htmlFor="exclude-attempts"
                                    className="text-sm font-medium cursor-pointer select-none whitespace-nowrap"
                                >
                                    Exclude ATTEMPTs
                                </label>
                            </div>
                        </div>
                    )}

                    {/* Date Range Picker */}
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                        <DateRangePicker
                            value={dateRange}
                            onChange={setDateRange}
                            placeholder="Select date range (optional)"
                            className="w-full sm:w-auto"
                        />
                        {dateRange && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDateRange(undefined)}
                                className="text-muted-foreground hover:text-foreground"
                            >
                                Clear dates
                            </Button>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                ) : auditLogs.length === 0 ? (
                    <p className="text-muted-foreground text-center">No audit logs found.</p>
                ) : (
                    <ScrollArea className="flex-grow min-h-0 pr-2">
                        {/* Desktop Table View */}
                        <div className="hidden md:block">
                            <SortableTable<AuditLogEntry>
                                data={auditLogs}
                                columns={columns}
                                sortBy={sortBy}
                                sortDirection={sortDirection}
                                onSortChange={handleSortChange}
                            />
                        </div>

                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-3">
                            {auditLogs.map((log) => (
                                <Card key={log.id} className="p-4">
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-start">
                                            <div className="text-sm font-medium">
                                                {log.user?.name || log.user?.email || log.userId || 'N/A'}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {format(new Date(log.timestamp), 'MMM dd, HH:mm')}
                                            </div>
                                        </div>
                                        <div className="text-sm text-foreground">
                                            {log.action}
                                        </div>
                                        {log.details && (
                                            <div className="space-y-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                                                    onClick={() => {
                                                        // Find the index of this log in the sorted list
                                                        const index = sortedAuditLogs.findIndex(l => l.id === log.id);
                                                        setCurrentLogIndex(index);
                                                        setModalDetails(log.details);
                                                        setModalMatchedFields(log.matchedFields);
                                                        setActiveTab('plain'); // Reset to plain tab
                                                        setIsDetailsModalOpen(true);
                                                        setCopySuccess('');
                                                    }}
                                                >
                                                    View Details →
                                                </Button>
                                                {log.matchedFields && log.matchedFields.length > 0 && (
                                                    <div className="flex flex-wrap gap-1">
                                                        {log.matchedFields.slice(0, 3).map((field, idx) => (
                                                            <span
                                                                key={idx}
                                                                className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded"
                                                            >
                                                                {field}
                                                            </span>
                                                        ))}
                                                        {log.matchedFields.length > 3 && (
                                                            <span className="text-xs text-muted-foreground">
                                                                +{log.matchedFields.length - 3} more
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </ScrollArea>
                )}

                {/* Pagination Controls */}
                {loading ? (
                    <div className="mt-4">
                        <Skeleton className="h-6 w-32" />
                    </div>
                ) : (
                    <div className="mt-4">
                        <PaginationControls
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalCount={totalLogs}
                            filteredCount={totalLogs}
                            pageSize={logsPerPage}
                            onPageChange={async (page) => {
                                setIsButtonRefreshing(true);
                                await new Promise(resolve => setTimeout(resolve, 500));
                                handlePageChange(page);
                                setIsButtonRefreshing(false);
                            }}
                            onPageSizeChange={handleLogsPerPageChange}
                            isLoadMoreMode={isPhone}
                            isLoading={loading || isRefreshingAuditLogs || isButtonRefreshing}
                            pageSizeOptions={[5, 10, 50, 100, 500]}
                            showAllOption={true}
                        />
                    </div>
                )}
            </CardContent>

            {/* Details Modal */}
            <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
                <DialogContent className="sm:max-w-4xl resize min-w-[320px] min-h-[400px] max-h-[90vh] h-[80vh] flex flex-col p-0 overflow-hidden">
                    <div className="px-6 pt-6 pb-3 shrink-0">
                        <DialogHeader>
                            <DialogTitle>
                                Audit Log Details
                            </DialogTitle>
                            <DialogDescription>
                                View detailed information about this audit log entry, including matched fields and JSON data.
                            </DialogDescription>
                        </DialogHeader>
                    </div>

                    {/* Display Timestamp, User, and Action - Fixed Section */}
                    {(() => {
                        const currentLog = currentLogIndex >= 0 && currentLogIndex < sortedAuditLogs.length
                            ? sortedAuditLogs.at(currentLogIndex) as AuditLogEntry | undefined
                            : undefined;

                        if (!currentLog) return null;

                        return (
                            <div className="px-6 pb-4 shrink-0">
                                <div className="p-3 bg-muted/50 rounded-lg border border-border">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div>
                                            <p className="text-xs font-medium text-muted-foreground mb-1">Timestamp</p>
                                            <p className="text-sm font-mono">{format(new Date(currentLog.timestamp), 'yyyy-MM-dd HH:mm:ss')}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium text-muted-foreground mb-1">User</p>
                                            <p className="text-sm">{currentLog.user?.name || currentLog.user?.email || currentLog.userId || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium text-muted-foreground mb-1">Action</p>
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <p className="text-sm font-medium truncate cursor-help">{currentLog.action}</p>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>{currentLog.action}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Scrollable Content Area - Grows to fill space */}
                    <div className="flex-1 min-h-0 px-6 flex flex-col">
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
                            <TabsList className="grid w-full grid-cols-2 mb-4 shrink-0">
                                <TabsTrigger value="plain">Plain</TabsTrigger>
                                <TabsTrigger value="json">JSON</TabsTrigger>
                            </TabsList>
                            <ScrollArea className="flex-1 min-h-0 pr-4">
                                {modalMatchedFields && modalMatchedFields.length > 0 && (
                                    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                                        <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                                            Matched in these fields:
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {modalMatchedFields.map((field, idx) => (
                                                <span
                                                    key={idx}
                                                    className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded font-medium"
                                                >
                                                    {field}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <TabsContent value="plain" className="mt-0">
                                    {modalDetails ? (
                                        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md border border-gray-200 dark:border-gray-800">
                                            <RenderPlainDetails data={modalDetails} />
                                        </div>
                                    ) : (
                                        <p>No details available.</p>
                                    )}
                                </TabsContent>
                                <TabsContent value="json" className="mt-0">
                                    {modalDetails ? (
                                        <pre className="whitespace-pre-wrap break-all text-wrap text-sm bg-gray-100 dark:bg-gray-800 p-4 rounded">
                                            {JSON.stringify(removeNullValues(modalDetails), null, 2)}
                                        </pre>
                                    ) : (
                                        <p>No details available.</p>
                                    )}
                                </TabsContent>
                            </ScrollArea>
                        </Tabs>
                    </div>

                    {/* Footer with buttons - Fixed Section */}
                    <div className="px-6 pb-6 pt-4 shrink-0 border-t border-border">
                        <div className="flex justify-between items-center">
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setCurrentLogIndex(prev => prev - 1)}
                                    disabled={currentLogIndex <= 0}
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => setCurrentLogIndex(prev => prev + 1)}
                                    disabled={currentLogIndex >= sortedAuditLogs.length - 1}
                                >
                                    Next
                                </Button>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    onClick={() => {
                                        const currentLog = currentLogIndex >= 0 && currentLogIndex < sortedAuditLogs.length
                                            ? sortedAuditLogs.at(currentLogIndex)
                                            : undefined;

                                        if (modalDetails && currentLog) {
                                            const timestamp = format(new Date(currentLog.timestamp), 'yyyy-MM-dd HH:mm:ss');
                                            const user = currentLog.user?.name || currentLog.user?.email || currentLog.userId || 'N/A';
                                            const action = currentLog.action;

                                            // Clean the details to remove null/undefined values
                                            const cleanedDetails = removeNullValues(modalDetails);

                                            let textToCopy = '';
                                            if (activeTab === 'plain') {
                                                textToCopy = `Timestamp: ${timestamp}\nUser: ${user}\nAction: ${action}\n\n${formatPlainText(cleanedDetails)}`;
                                            } else {
                                                const fullData = {
                                                    timestamp,
                                                    user,
                                                    action,
                                                    details: cleanedDetails
                                                };
                                                textToCopy = JSON.stringify(fullData, null, 2);
                                            }

                                            navigator.clipboard.writeText(textToCopy)
                                                .then(() => {
                                                    setCopySuccess('Copied!');
                                                    setTimeout(() => setCopySuccess(''), 2000);
                                                })
                                                .catch(() => setCopySuccess('Copy failed!'));
                                        }
                                    }}
                                    className="w-[120px]"
                                >
                                    {copySuccess === 'Copied!' ? (
                                        <>
                                            <Check className="mr-2 h-4 w-4" />
                                            Copied!
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="mr-2 h-4 w-4" />
                                            Copy
                                        </>
                                    )}
                                </Button>
                                <Button variant="outline" onClick={() => setIsDetailsModalOpen(false)}>Close</Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Export Dialog - Must be outside Details Modal */}
            <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Export Audit Logs</DialogTitle>
                        <DialogDescription>
                            Choose what to export as {exportFormat.toUpperCase()}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-3">
                            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                                <input
                                    type="radio"
                                    name="export-scope"
                                    value="current"
                                    checked={exportScope === 'current'}
                                    onChange={(e) => setExportScope(e.target.value as 'current' | 'all')}
                                    className="h-4 w-4"
                                />
                                <div className="flex-1">
                                    <div className="font-medium">Current page only</div>
                                    <div className="text-sm text-muted-foreground">
                                        Export {auditLogs.length} log{auditLogs.length !== 1 ? 's' : ''} from this page
                                    </div>
                                </div>
                            </label>

                            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                                <input
                                    type="radio"
                                    name="export-scope"
                                    value="all"
                                    checked={exportScope === 'all'}
                                    onChange={(e) => setExportScope(e.target.value as 'current' | 'all')}
                                    className="h-4 w-4"
                                />
                                <div className="flex-1">
                                    <div className="font-medium">All filtered results</div>
                                    <div className="text-sm text-muted-foreground">
                                        Export all {totalLogs.toLocaleString()} matching log{totalLogs !== 1 ? 's' : ''}
                                        {totalLogs > 1000 && (
                                            <span className="block text-amber-600 dark:text-amber-400 mt-1">
                                                ⚠️ Large export - may take a moment
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </label>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleConfirmExport} disabled={isExporting}>
                            {isExporting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Exporting...
                                </>
                            ) : (
                                <>
                                    <Download className="mr-2 h-4 w-4" />
                                    Export {exportFormat.toUpperCase()}
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </Card >
    );
}