'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle } from 'lucide-react';

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

interface ExecutionHistoryResponse {
  executions: ScheduleExecution[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
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

export function ExecutionHistory({ scheduleId }: ExecutionHistoryProps) {
  const [executions, setExecutions] = useState<ScheduleExecution[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setTotalCount(data.totalCount ?? 0);
      setTotalPages(data.totalPages ?? 1);
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

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {/* Error state */}
      {!isLoading && error && (
        <div className="flex items-center gap-2 text-destructive text-sm p-3 border border-destructive/30 rounded-md">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && executions.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No execution history found.
        </p>
      )}

      {/* Table */}
      {!isLoading && !error && executions.length > 0 && (
        <Accordion type="multiple" className="space-y-1">
          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_80px_120px_60px_80px] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground border-b">
            <span>Timestamp</span>
            <span>Boundary</span>
            <span>Status</span>
            <span>Target IPs</span>
            <span>Duration</span>
            <span>Error</span>
          </div>

          {executions.map(exec => (
            <AccordionItem key={exec.id} value={exec.id} className="border rounded-md">
              <AccordionTrigger className="px-4 py-2 hover:no-underline">
                <div className="grid grid-cols-[1fr_80px_80px_120px_60px_80px] gap-2 w-full text-left items-center">
                  <span className="text-sm">
                    {formatDistanceToNow(new Date(exec.executedAt), { addSuffix: true })}
                  </span>
                  <span className="text-xs text-muted-foreground">{exec.boundaryType}</span>
                  <Badge variant={statusVariant(exec.status)} className="text-xs w-fit">
                    {exec.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground truncate">
                    {formatTargetIps(exec.targetIps)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {exec.durationMs != null ? `${exec.durationMs}ms` : '—'}
                  </span>
                  <span className="text-xs text-destructive truncate">
                    {exec.errorMessage ?? '—'}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-3">
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium mb-1">Timestamp: {new Date(exec.executedAt).toLocaleString()}</p>
                  <p className="font-medium mb-2">Actions Run:</p>
                  <pre className="bg-muted p-3 rounded-md overflow-auto text-xs">
                    {JSON.stringify(exec.actionsRun, null, 2)}
                  </pre>
                  {exec.errorMessage && (
                    <p className="mt-2 text-destructive">
                      <span className="font-medium">Error:</span> {exec.errorMessage}
                    </p>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {/* Pagination */}
      {!isLoading && totalCount > 0 && (
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
  );
}
