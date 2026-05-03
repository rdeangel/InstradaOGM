'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatDistanceToNow } from 'date-fns';
import { Edit, Trash2, Search, Info } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ScheduleInfoModal } from './ScheduleInfoModal';

export interface ScheduleListItem {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  priority: number;
  scheduleType: 'COMPLEX_WEEKLY' | 'ONCE' | 'RECURRING';
  targetType: string;
  targetSelector: unknown;
  timezone: string;
  lastExecutedAt?: string | null;
  _count: { executions: number };
}

interface ScheduleListTableProps {
  schedules: ScheduleListItem[];
  onRefresh: () => void;
  onEnabledFilterChange?: (enabled: boolean | null) => void;
}

function typeVariant(type: string): 'default' | 'secondary' | 'outline' {
  switch (type) {
    case 'COMPLEX_WEEKLY': return 'default';
    case 'RECURRING': return 'secondary';
    case 'ONCE': return 'outline';
    default: return 'outline';
  }
}

function typeLabel(type: string): string {
  switch (type) {
    case 'COMPLEX_WEEKLY': return 'Weekly';
    default: return type;
  }
}

function formatTargetSummary(item: ScheduleListItem): string {
  const selector = item.targetSelector as Record<string, unknown>;
  if (item.targetType === 'NETWORK_ALIAS') {
    const uuids = selector?.networkAliasUuids as string[] | undefined;
    const count = uuids?.length ?? 0;
    return `${count} range${count !== 1 ? 's' : ''}`;
  }
  if (item.targetType === 'NETWORK_GROUP') {
    return selector?.networkGroupUuid ? '1 group' : '—';
  }
  if (item.targetType === 'IP_LIST') {
    const ips = selector?.ips as string[] | undefined;
    const count = ips?.length ?? 0;
    return `${count} IP${count !== 1 ? 's' : ''}`;
  }
  const uuids = selector?.hostAliasUuids as string[] | undefined;
  const count = uuids?.length ?? 0;
  return `${count} alias${count !== 1 ? 'es' : ''}`;
}

export function ScheduleListTable({ schedules, onRefresh, onEnabledFilterChange }: ScheduleListTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [enabledFilter, setEnabledFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ScheduleListItem | null>(null);
  const [infoTarget, setInfoTarget] = useState<ScheduleListItem | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleEnabledFilterChange(value: string) {
    setEnabledFilter(value);
    if (onEnabledFilterChange) {
      onEnabledFilterChange(value === '' ? null : value === 'true');
    }
  }

  const filtered = schedules.filter(s => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter && s.scheduleType !== typeFilter) return false;
    if (enabledFilter !== '' && s.enabled !== (enabledFilter === 'true')) return false;
    return true;
  });

  async function handleToggle(schedule: ScheduleListItem, enabled: boolean) {
    setTogglingId(schedule.id);
    try {
      const res = await fetch(`/api/admin/schedules/${schedule.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error('Toggle failed');
      onRefresh();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to toggle schedule.' });
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(schedule: ScheduleListItem) {
    setDeletingId(schedule.id);
    try {
      const res = await fetch(`/api/admin/schedules/${schedule.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      toast({ title: 'Deleted', description: `Schedule "${schedule.name}" deleted.` });
      onRefresh();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete schedule.' });
    } finally {
      setDeletingId(null);
      setDeleteTarget(null);
    }
  }

  const emptyMessage = schedules.length === 0
    ? 'No schedules yet. Create one to get started.'
    : 'No schedules match your filters.';

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      {/* Filter bar */}
      <div className="shrink-0 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search schedules..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 w-full"
          />
        </div>
        <div className="flex gap-2 sm:contents">
          <Select value={typeFilter || 'all'} onValueChange={v => setTypeFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="flex-1 sm:w-44 h-9">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="COMPLEX_WEEKLY">Complex Weekly</SelectItem>
              <SelectItem value="ONCE">Once</SelectItem>
              <SelectItem value="RECURRING">Recurring</SelectItem>
            </SelectContent>
          </Select>
          <Select value={enabledFilter || 'all'} onValueChange={v => handleEnabledFilterChange(v === 'all' ? '' : v)}>
            <SelectTrigger className="flex-1 sm:w-36 h-9">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="true">Enabled</SelectItem>
              <SelectItem value="false">Disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Mobile card view */}
      {isMobile ? (
        <ScrollArea className="flex-1 pr-4 -mr-4">
          <div className="space-y-3">
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground py-8">{emptyMessage}</p>
            )}
            {filtered.map(schedule => (
              <Card key={schedule.id}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <CardTitle className="text-base leading-tight">{schedule.name}</CardTitle>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => setInfoTarget(schedule)}
                          title="View schedule info"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {schedule.description && (
                        <CardDescription className="mt-0.5 text-xs">{schedule.description}</CardDescription>
                      )}
                    </div>
                    <Badge variant={typeVariant(schedule.scheduleType)} className="text-xs shrink-0 mt-0.5">
                      {typeLabel(schedule.scheduleType)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0 space-y-3">
                  {/* Info grid */}
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm items-center">
                    <span className="text-muted-foreground">Target</span>
                    <span className="text-right">{formatTargetSummary(schedule)}</span>

                    <span className="text-muted-foreground">Executions</span>
                    <span className="flex justify-end">
                      <Badge variant="outline" className="text-xs">{schedule._count.executions}</Badge>
                    </span>

                    <span className="text-muted-foreground">Last Executed</span>
                    <span className="text-xs text-muted-foreground text-right">
                      {schedule.lastExecutedAt
                        ? formatDistanceToNow(new Date(schedule.lastExecutedAt), { addSuffix: true })
                        : '—'}
                    </span>

                    <span className="text-muted-foreground">Enabled</span>
                    <div className="flex justify-end">
                      <Switch
                        checked={schedule.enabled}
                        disabled={togglingId === schedule.id}
                        onCheckedChange={checked => handleToggle(schedule, checked)}
                      />
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => router.push(`/admin/schedules/${schedule.id}/edit`)}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      disabled={deletingId === schedule.id}
                      onClick={() => setDeleteTarget(schedule)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      ) : (
        /* Desktop table view */
        <ScrollArea className="flex-1 pr-4 -mr-4">
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Priority</th>
                    <th className="text-left p-3 font-medium">Target</th>
                    <th className="text-left p-3 font-medium">Executions</th>
                    <th className="text-left p-3 font-medium">Last Executed</th>
                    <th className="text-left p-3 font-medium">Enabled</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-muted-foreground">
                        {emptyMessage}
                      </td>
                    </tr>
                  )}
                  {filtered.map(schedule => (
                    <tr key={schedule.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <p className="font-medium">{schedule.name}</p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={() => setInfoTarget(schedule)}
                            title="View schedule info"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {schedule.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-xs">{schedule.description}</p>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge variant={typeVariant(schedule.scheduleType)} className="text-xs">
                          {typeLabel(schedule.scheduleType)}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">{schedule.priority}</td>
                      <td className="p-3">
                        <p className="text-xs text-muted-foreground">{schedule.targetType}</p>
                        <p className="text-sm">{formatTargetSummary(schedule)}</p>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs">{schedule._count.executions}</Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {schedule.lastExecutedAt
                          ? formatDistanceToNow(new Date(schedule.lastExecutedAt), { addSuffix: true })
                          : '—'}
                      </td>
                      <td className="p-3">
                        <Switch
                          checked={schedule.enabled}
                          disabled={togglingId === schedule.id}
                          onCheckedChange={checked => handleToggle(schedule, checked)}
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => router.push(`/admin/schedules/${schedule.id}/edit`)}
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            disabled={deletingId === schedule.id}
                            onClick={() => setDeleteTarget(schedule)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </ScrollArea>
      )}

      {/* Schedule info modal */}
      <ScheduleInfoModal schedule={infoTarget} onClose={() => setInfoTarget(null)} />

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone. All execution history will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
