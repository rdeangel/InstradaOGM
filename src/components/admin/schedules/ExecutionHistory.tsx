'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useOpnsenseNetworkGroups } from '@/hooks/use-opnsense-network-groups';

interface ScheduleExecution {
  id: string;
  scheduleId: string;
  boundaryType: string;
  executedAt: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
  targetIps: string[] | unknown;
  actionsRun: unknown;
  durationMs: number | null;
  errorMessage: string | null;
}

interface ActionRunDetail {
  success?: boolean;
  operation?: string;
  targetGroupUuid?: string;
  fromGroupUuid?: string;
  ip?: string;
  error?: string;
}


interface ExecutionHistoryResponse {
  executions: ScheduleExecution[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

interface ExecutionHistoryProps {
  scheduleId: string;
}

function statusVariant(
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'SUCCESS': return 'default';
    case 'PARTIAL': return 'secondary';
    case 'FAILED': return 'destructive';
    case 'SKIPPED': return 'outline';
    default: return 'outline';
  }
}

function formatTargetIps(targetIps: string[] | unknown): string {
  if (!Array.isArray(targetIps)) return '—';
  if (targetIps.length === 0) return '—';
  if (targetIps.length <= 3) return targetIps.join(', ');
  return `${targetIps.slice(0, 3).join(', ')} +${targetIps.length - 3} more`;
}

function formatGroupUuid(uuid: string, groups: { uuid: string; name: string; description?: string }[]): string {
  const group = groups.find(g => g.uuid === uuid);
  if (!group) return uuid;
  return group.description || group.name || uuid;
}

export function ExecutionHistory({ scheduleId }: ExecutionHistoryProps) {
  const { groups } = useOpnsenseNetworkGroups();
  const [executions, setExecutions] = useState<ScheduleExecution[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchExecutions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(
        `/api/admin/schedules/${scheduleId}/executions?${params}`,
      );
      if (!res.ok) throw new Error('Failed to fetch execution history');
      const data: ExecutionHistoryResponse = await res.json();
      setExecutions(data.executions ?? []);
      setTotalCount(data.pagination?.totalCount ?? 0);
      setTotalPages(data.pagination?.totalPages ?? 1);
      setHasLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load execution history');
    } finally {
      setIsLoading(false);
    }
  }, [scheduleId, page, pageSize, statusFilter]);

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Status:</span>
        <Select
          value={statusFilter || 'all'}
          onValueChange={v => {
            setStatusFilter(v === 'all' ? '' : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="SUCCESS">Success</SelectItem>
            <SelectItem value="PARTIAL">Partial</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
            <SelectItem value="SKIPPED">Skipped</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading skeleton — only on initial load */}
      {isLoading && !hasLoaded && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {/* Error state — only if no data has loaded yet */}
      {!isLoading && error && !hasLoaded && (
        <div className="flex items-center gap-2 text-destructive text-sm p-3 border border-destructive/30 rounded-md">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Content — stays visible after first load; dims while refreshing */}
      {hasLoaded && (
        <div className={isLoading ? 'opacity-50 pointer-events-none transition-opacity' : 'transition-opacity'}>
          {/* Empty state */}
          {executions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No execution history found.
            </p>
          )}

          {/* Table */}
          {executions.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="w-6 p-2" />
                    <th className="text-left p-2 text-xs font-medium text-muted-foreground">Timestamp</th>
                    <th className="text-left p-2 text-xs font-medium text-muted-foreground">Boundary</th>
                    <th className="text-left p-2 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-2 text-xs font-medium text-muted-foreground">Target IPs</th>
                    <th className="text-left p-2 text-xs font-medium text-muted-foreground">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {executions.map(exec => (
                    <Fragment key={exec.id}>
                      <tr
                        className="hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => setExpandedId(expandedId === exec.id ? null : exec.id)}
                      >
                        <td className="p-2 text-muted-foreground">
                          {expandedId === exec.id
                            ? <ChevronDown className="h-3.5 w-3.5" />
                            : <ChevronRight className="h-3.5 w-3.5" />}
                        </td>
                        <td className="p-2 text-xs">
                          {formatDistanceToNow(new Date(exec.executedAt), { addSuffix: true })}
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">{exec.boundaryType}</td>
                        <td className="p-2">
                          <Badge variant={statusVariant(exec.status)} className="text-xs">
                            {exec.status}
                          </Badge>
                        </td>
                        <td className="p-2 text-xs text-muted-foreground max-w-[140px] truncate">
                          {formatTargetIps(exec.targetIps)}
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {exec.durationMs != null ? `${exec.durationMs}ms` : '—'}
                        </td>
                      </tr>
                      {expandedId === exec.id && (
                        <tr className="bg-muted/20">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="text-xs text-muted-foreground space-y-2">
                              <p><span className="font-medium text-foreground">Executed at:</span> {new Date(exec.executedAt).toLocaleString()}</p>
                              {exec.errorMessage && (
                                <p className="text-destructive">
                                  <span className="font-medium">Error:</span> {exec.errorMessage}
                                </p>
                              )}
                              <div>
                                <p className="font-medium text-foreground mb-1">Actions Run:</p>
                                <div className="space-y-1 mt-2">
                                  {Array.isArray(exec.actionsRun) ? exec.actionsRun.map((action: ActionRunDetail, i: number) => (
                                    <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-muted p-2 rounded-md font-mono text-xs">
                                      <div className="flex items-center gap-2 min-w-40">
                                        <Badge variant={action.success ? 'default' : 'destructive'} className="text-[10px] px-1.5 py-0 h-4">
                                          {action.success ? 'SUCCESS' : 'FAILED'}
                                        </Badge>
                                        <span className="font-semibold">{action.operation}</span>
                                      </div>

                                      <div className="flex-1 text-muted-foreground break-all">
                                        {action.targetGroupUuid && (
                                          <span>
                                            <span className="text-foreground/50">Target:</span> {formatGroupUuid(action.targetGroupUuid, groups)}
                                          </span>
                                        )}
                                        {action.fromGroupUuid && (
                                          <span className="ml-2">
                                            <span className="text-foreground/50">From:</span> {formatGroupUuid(action.fromGroupUuid, groups)}
                                          </span>
                                        )}
                                      </div>

                                      {action.ip && (
                                        <div className="text-right whitespace-nowrap">
                                          <span className="text-foreground/50">IP:</span> {action.ip}
                                        </div>
                                      )}

                                      {action.error && (
                                        <div className="text-destructive sm:ml-2">
                                          <span className="text-foreground/50">Error:</span> {action.error}
                                        </div>
                                      )}
                                    </div>
                                  )) : (
                                    <pre className="bg-muted p-3 rounded-md overflow-auto text-xs leading-relaxed">
                                      {JSON.stringify(exec.actionsRun, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalCount > 0 && (
            <PaginationControls
              currentPage={page}
              totalPages={totalPages}
              totalCount={totalCount}
              filteredCount={totalCount}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={size => {
                setPageSize(size as number);
                setPage(1);
              }}
              isLoading={isLoading}
              pageSizeOptions={[10, 20, 50]}
            />
          )}
        </div>
      )}
    </div>
  );
}
