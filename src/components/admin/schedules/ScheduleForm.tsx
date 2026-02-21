'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Loader2, AlertTriangle, Info, ArrowUp, ArrowDown, Trash2, Plus, Play } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScheduleTimelineGrid, type ScheduleDayFormData } from './ScheduleTimelineGrid';
import { PreviewPanel } from './PreviewPanel';
import { GroupCombobox } from './GroupCombobox';
import { useOpnsenseNetworkGroups } from '@/hooks/use-opnsense-network-groups';
import type { NetworkGroup } from '@/types/opnsense';
import { CronExpressionParser } from 'cron-parser';

// Inline pure helper — avoids importing server-only schedule-validation module
function checkWindowOverlaps(windows: Array<{ startTime: string; endTime: string }>): {
  hasOverlap: boolean;
} {
  function timeToMinutes(t: string) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
        // eslint-disable-next-line security/detect-object-injection -- i and j are controlled loop variables, not user input
      const wi = windows[i];
      // eslint-disable-next-line security/detect-object-injection -- i and j are controlled loop variables, not user input
      const wj = windows[j];
      if (
        timeToMinutes(wi.startTime) < timeToMinutes(wj.endTime) &&
        timeToMinutes(wj.startTime) < timeToMinutes(wi.endTime)
      ) {
        return { hasOverlap: true };
      }
    }
  }
  return { hasOverlap: false };
}

// ─── Types ──────────────────────────────────────────────────────────────────

type StandaloneAction = {
  operation: 'ASSIGN' | 'REMOVE' | 'MOVE' | 'CLEAR_ALL';
  targetGroupUuid?: string;
  fromGroupUuid?: string;
  sortOrder: number;
};

export type ScheduleFormValues = {
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  scheduleType: 'COMPLEX_WEEKLY' | 'ONCE' | 'RECURRING';
  timezone: string;
  // ONCE
  executeAt: Date | undefined;
  onceActions: StandaloneAction[];
  // RECURRING
  cronExpression: string;
  recurringActions: StandaloneAction[];
  // COMPLEX_WEEKLY — managed separately as `days` state
  // Targeting
  targetType: 'HOST_ALIAS';
  hostAliasUuids: string[];
};

const emptyFormValues: ScheduleFormValues = {
  name: '',
  description: '',
  enabled: true,
  priority: 0,
  scheduleType: 'COMPLEX_WEEKLY',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  executeAt: undefined,
  onceActions: [],
  cronExpression: '',
  recurringActions: [],
  targetType: 'HOST_ALIAS',
  hostAliasUuids: [],
};

const defaultDays: ScheduleDayFormData[] = Array.from({ length: 7 }, (_, i) => ({
  dayOfWeek: i,
  windows: [],
}));

interface ScheduleFormProps {
  initialValues?: Partial<ScheduleFormValues>;
  initialDays?: ScheduleDayFormData[];
  onSubmit: (data: unknown) => Promise<void>;
  submitLabel?: string;
}

// ─── Standalone Action Row ────────────────────────────────────────────────────

function StandaloneActionRow({
  action,
  index,
  total,
  groups,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  action: StandaloneAction;
  index: number;
  total: number;
  groups: NetworkGroup[];
  onUpdate: (a: StandaloneAction) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="flex items-start gap-2 p-3 border rounded-lg bg-muted/30">
      <div className="flex flex-col gap-1">
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={index === 0} onClick={onMoveUp}>
          <ArrowUp className="h-3 w-3" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={index === total - 1} onClick={onMoveDown}>
          <ArrowDown className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-muted-foreground mb-1">Operation</Label>
          <Select
            value={action.operation}
            onValueChange={val => onUpdate({ ...action, operation: val as StandaloneAction['operation'] })}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ASSIGN">Assign</SelectItem>
              <SelectItem value="REMOVE">Remove</SelectItem>
              <SelectItem value="MOVE">Move</SelectItem>
              <SelectItem value="CLEAR_ALL">Clear All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(action.operation === 'ASSIGN' || action.operation === 'REMOVE' || action.operation === 'MOVE') && (
          <div>
            <Label className="text-xs text-muted-foreground mb-1">
              {action.operation === 'MOVE' ? 'To Group' : 'Group'}
            </Label>
            <GroupCombobox
              groups={groups}
              value={action.targetGroupUuid ?? null}
              onValueChange={val => onUpdate({ ...action, targetGroupUuid: val ?? undefined })}
              placeholder="Select group..."
              filterMode="none"
              excludeUuids={action.operation === 'MOVE' && action.fromGroupUuid ? [action.fromGroupUuid] : []}
              className="w-full"
            />
          </div>
        )}
        {action.operation === 'MOVE' && (
          <div>
            <Label className="text-xs text-muted-foreground mb-1">From Group</Label>
            <GroupCombobox
              groups={groups}
              value={action.fromGroupUuid ?? null}
              onValueChange={val => onUpdate({ ...action, fromGroupUuid: val ?? undefined })}
              placeholder="Select source group..."
              filterMode="none"
              excludeUuids={action.targetGroupUuid ? [action.targetGroupUuid] : []}
              className="w-full"
            />
          </div>
        )}
      </div>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive mt-4" onClick={onRemove}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ─── Main Form ────────────────────────────────────────────────────────────────

export function ScheduleForm({
  initialValues,
  initialDays,
  onSubmit,
  submitLabel = 'Save',
}: ScheduleFormProps) {
  const router = useRouter();
  const { groups, isLoading: groupsLoading, error: groupsError } = useOpnsenseNetworkGroups();

  const [values, setValues] = useState<ScheduleFormValues>({
    ...emptyFormValues,
    ...initialValues,
  });
  const [days, setDays] = useState<ScheduleDayFormData[]>(initialDays ?? defaultDays);
  const [mirroredDays, setMirroredDays] = useState<Set<number>>(new Set());
  const [templateDay, setTemplateDay] = useState(1); // Monday
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [hostAliasOptions, setHostAliasOptions] = useState<{ value: string; label: string; isDisabled: boolean }[]>([]);

  const timezones = Intl.supportedValuesOf('timeZone');
  const timezoneOptions = timezones.map(tz => ({ value: tz, label: tz, isDisabled: false }));

  // Fetch host aliases on mount
  useEffect(() => {
    fetch('/api/opnsense/filtered-host-aliases')
      .then(r => r.json())
      .then(data => {
        const aliases = Array.isArray(data) ? data : (data.displayableHostAliases ?? []);
        setHostAliasOptions(
          aliases.map((a: { uuid?: string; name?: string; description?: string }) => ({
            value: a.uuid ?? '',
            label: a.name ?? a.uuid ?? '',
            isDisabled: false,
          })),
        );
      })
      .catch(() => setHostAliasOptions([]));
  }, []);

  // Compute overlap warnings for COMPLEX_WEEKLY
  const overlapWarnings = values.scheduleType === 'COMPLEX_WEEKLY'
    ? days
        .filter(d => checkWindowOverlaps(d.windows.map(w => ({ startTime: w.startTime, endTime: w.endTime }))).hasOverlap)
        .map(d => `Day ${d.dayOfWeek}`)
    : [];

  // Cron human-readable preview
  let cronPreview = '';
  if (values.scheduleType === 'RECURRING' && values.cronExpression) {
    try {
      CronExpressionParser.parse(values.cronExpression);
      cronPreview = 'Valid cron expression';
    } catch {
      cronPreview = 'Invalid cron expression';
    }
  }

  function set<K extends keyof ScheduleFormValues>(key: K, val: ScheduleFormValues[K]) {
    setValues(prev => ({ ...prev, [key]: val }));
  }

  function updateStandaloneAction(
    field: 'onceActions' | 'recurringActions',
    index: number,
    updated: StandaloneAction,
  ) {
    // eslint-disable-next-line security/detect-object-injection -- field is a typed union 'onceActions'|'recurringActions', not user input
    const actions = [...values[field]];
    // eslint-disable-next-line security/detect-object-injection -- index is a controlled component prop (list item index), not user input
    actions[index] = updated;
    set(field, actions);
  }

  function removeStandaloneAction(field: 'onceActions' | 'recurringActions', index: number) {
    // eslint-disable-next-line security/detect-object-injection -- field is a typed union, not user input
    set(field, values[field].filter((_, i) => i !== index));
  }

  function moveStandaloneAction(
    field: 'onceActions' | 'recurringActions',
    from: number,
    to: number,
  ) {
    // eslint-disable-next-line security/detect-object-injection -- field is a typed union, not user input
    const actions = [...values[field]];
    const [item] = actions.splice(from, 1);
    actions.splice(to, 0, item);
    set(field, actions.map((a, i) => ({ ...a, sortOrder: i })));
  }

  function addStandaloneAction(field: 'onceActions' | 'recurringActions') {
    // eslint-disable-next-line security/detect-object-injection -- field is a typed union, not user input
    const existing = values[field];
    const newAction: StandaloneAction = {
      operation: 'ASSIGN',
      sortOrder: existing.length,
    };
    set(field, [...existing, newAction]);
  }

  function handleMirrorChange(newMirrored: Set<number>, newTemplateDay: number) {
    setMirroredDays(newMirrored);
    setTemplateDay(newTemplateDay);
  }

  const buildPayload = useCallback(() => {
    // Apply mirroring: copy template day to all mirrored days
    const finalDays = days.map(d => {
      if (mirroredDays.has(d.dayOfWeek)) {
        const templateDayData = days.find(td => td.dayOfWeek === templateDay);
        return templateDayData ? { ...d, windows: templateDayData.windows } : d;
      }
      return d;
    });

    const base = {
      name: values.name,
      description: values.description || undefined,
      enabled: values.enabled,
      priority: values.priority,
      scheduleType: values.scheduleType,
      timezone: values.timezone,
      targetType: 'HOST_ALIAS',
      targetSelector: { hostAliasUuids: values.hostAliasUuids },
    };

    if (values.scheduleType === 'COMPLEX_WEEKLY') {
      return {
        ...base,
        days: finalDays.filter(d => d.windows.length > 0),
      };
    }
    if (values.scheduleType === 'ONCE') {
      return {
        ...base,
        executeAt: values.executeAt?.toISOString(),
        onceActions: values.onceActions,
      };
    }
    // RECURRING
    return {
      ...base,
      cronExpression: values.cronExpression,
      recurringActions: values.recurringActions,
    };
  }, [values, days, mirroredDays, templateDay]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!values.name.trim()) errs.name = 'Name is required';
    if (values.priority < 0 || values.priority > 100) errs.priority = 'Priority must be 0–100';
    if (!values.timezone) errs.timezone = 'Timezone is required';

    if (values.scheduleType === 'ONCE') {
      if (!values.executeAt) errs.executeAt = 'Execution time is required';
      if (values.onceActions.length === 0) errs.onceActions = 'At least one action is required';
    }
    if (values.scheduleType === 'RECURRING') {
      if (!values.cronExpression.trim()) errs.cronExpression = 'Cron expression is required';
      try { CronExpressionParser.parse(values.cronExpression); } catch { errs.cronExpression = 'Invalid cron expression'; }
      if (values.recurringActions.length === 0) errs.recurringActions = 'At least one action is required';
    }
    if (values.hostAliasUuids.length === 0) errs.targetSelector = 'Select at least one host alias';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(buildPayload());
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderStandaloneActionList(field: 'onceActions' | 'recurringActions') {
    // eslint-disable-next-line security/detect-object-injection -- field is a typed union, not user input
    const actions = values[field];
    return (
      <div className="space-y-2">
        {groupsError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Failed to load network groups: {groupsError}. Group selectors will be empty.</AlertDescription>
          </Alert>
        )}
        {!groupsError && !groupsLoading && groups.length === 0 && (
          <Alert variant="default" className="border-amber-400 bg-amber-50 dark:bg-amber-950/20">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700 dark:text-amber-400">
              No network groups found. Groups must exist in OPNsense before actions can be configured.
            </AlertDescription>
          </Alert>
        )}
        {groupsLoading && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading network groups…
          </p>
        )}
        {actions.map((action, i) => (
          <StandaloneActionRow
            key={i}
            action={action}
            index={i}
            total={actions.length}
            groups={groups}
            onUpdate={updated => updateStandaloneAction(field, i, updated)}
            onRemove={() => removeStandaloneAction(field, i)}
            onMoveUp={() => moveStandaloneAction(field, i, i - 1)}
            onMoveDown={() => moveStandaloneAction(field, i, i + 1)}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => addStandaloneAction(field)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Action
        </Button>
        {/* eslint-disable-next-line security/detect-object-injection -- field is a typed union, not user input */}
        {errors[field] && <p className="text-xs text-destructive">{errors[field]}</p>}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Basic info ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="sched-name">Name *</Label>
            <Input
              id="sched-name"
              value={values.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Business Hours"
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Label htmlFor="sched-priority">Priority</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Higher priority schedules execute first (0 = lowest, 100 = highest). When multiple schedules conflict, higher priority wins.
                </TooltipContent>
              </Tooltip>
            </div>
            <Input
              id="sched-priority"
              type="number"
              min={0}
              max={100}
              value={values.priority}
              onChange={e => set('priority', parseInt(e.target.value) || 0)}
            />
            {errors.priority && <p className="text-xs text-destructive">{errors.priority}</p>}
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="sched-description">Description</Label>
            <Textarea
              id="sched-description"
              value={values.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Optional description..."
              rows={2}
            />
          </div>

          <div className="flex items-center gap-3 md:col-span-2">
            <Switch
              id="sched-enabled"
              checked={values.enabled}
              onCheckedChange={val => set('enabled', val)}
            />
            <Label htmlFor="sched-enabled" className="cursor-pointer">
              {values.enabled ? 'Enabled' : 'Disabled'}
            </Label>
            {!values.enabled && (
              <span className="text-xs text-muted-foreground">
                — schedule will not run until enabled
              </span>
            )}
          </div>

          <div className="space-y-1">
            <Label>Timezone</Label>
            <SearchableSelect
              options={timezoneOptions}
              value={values.timezone}
              onValueChange={val => set('timezone', val ?? '')}
              placeholder="Select timezone..."
              className="w-full"
            />
            {errors.timezone && <p className="text-xs text-destructive">{errors.timezone}</p>}
          </div>
        </div>

        {/* ── Schedule type ── */}
        <div className="space-y-2">
          <Label>Schedule Type</Label>
          <RadioGroup
            value={values.scheduleType}
            onValueChange={val => set('scheduleType', val as ScheduleFormValues['scheduleType'])}
            className="flex flex-wrap gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="COMPLEX_WEEKLY" id="type-weekly" />
              <Label htmlFor="type-weekly">Complex Weekly</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="ONCE" id="type-once" />
              <Label htmlFor="type-once">Once</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="RECURRING" id="type-recurring" />
              <Label htmlFor="type-recurring">Recurring</Label>
            </div>
          </RadioGroup>
        </div>

        {/* ── Schedule type content ── */}
        {values.scheduleType === 'COMPLEX_WEEKLY' && (
          <div className="space-y-3">
            <Label>Weekly Schedule</Label>

            <Alert variant="default" className="border-blue-300 bg-blue-50 dark:bg-blue-950/20">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-700 dark:text-blue-400">
                <strong>How to add actions:</strong> Click and drag on any day row to create a time window. Then click the coloured block to open the action editor — where you define which network group operations (Assign, Remove, Move) fire at the start and end of that window.
              </AlertDescription>
            </Alert>

            {/* Overlap warning */}
            {overlapWarnings.length > 0 && (
              <Alert variant="default" className="border-amber-400 bg-amber-50 dark:bg-amber-950/20">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700 dark:text-amber-400">
                  Overlapping windows detected on: {overlapWarnings.join(', ')}. Schedules will still run but may produce unexpected results.
                </AlertDescription>
              </Alert>
            )}

            <div className="border rounded-lg p-3 bg-card overflow-x-auto">
              <ScheduleTimelineGrid
                days={days}
                onChange={setDays}
                mirroredDays={mirroredDays}
                templateDay={templateDay}
                onMirrorChange={handleMirrorChange}
              />
            </div>
          </div>
        )}

        {values.scheduleType === 'ONCE' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Execution Time</Label>
              <div className="max-w-xs">
                <DateTimePicker
                  date={values.executeAt}
                  setDate={d => set('executeAt', d)}
                />
              </div>
              {errors.executeAt && <p className="text-xs text-destructive">{errors.executeAt}</p>}
            </div>

            <div className="space-y-1">
              <Label>Actions</Label>
              {renderStandaloneActionList('onceActions')}
            </div>
          </div>
        )}

        {values.scheduleType === 'RECURRING' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="cron-expr">Cron Expression</Label>
              <Input
                id="cron-expr"
                value={values.cronExpression}
                onChange={e => set('cronExpression', e.target.value)}
                placeholder="e.g. 0 9 * * 1-5"
                className="font-mono"
              />
              {cronPreview && (
                <p className={`text-xs ${cronPreview.startsWith('Invalid') ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {cronPreview}
                </p>
              )}
              {errors.cronExpression && <p className="text-xs text-destructive">{errors.cronExpression}</p>}
            </div>

            <div className="space-y-1">
              <Label>Actions</Label>
              {renderStandaloneActionList('recurringActions')}
            </div>
          </div>
        )}

        {/* ── Target host aliases ── */}
        <div className="space-y-3">
          <Label>Target Host Aliases</Label>
          <div className="flex flex-wrap gap-2 min-h-[36px] p-2 border rounded-md bg-muted/20">
            {values.hostAliasUuids.map((uuid, i) => {
              const opt = hostAliasOptions.find(o => o.value === uuid);
              return (
                <Badge key={i} variant="secondary" className="gap-1">
                  {opt?.label ?? uuid}
                  <button
                    type="button"
                    className="ml-1 text-muted-foreground hover:text-foreground"
                    onClick={() => set('hostAliasUuids', values.hostAliasUuids.filter(id => id !== uuid))}
                  >
                    ×
                  </button>
                </Badge>
              );
            })}
          </div>
          <SearchableSelect
            options={hostAliasOptions.filter(o => !values.hostAliasUuids.includes(o.value))}
            value={null}
            onValueChange={val => {
              if (val && !values.hostAliasUuids.includes(val)) {
                set('hostAliasUuids', [...values.hostAliasUuids, val]);
              }
            }}
            placeholder="Add host alias..."
            className="w-full"
          />
          {errors.targetSelector && <p className="text-xs text-destructive">{errors.targetSelector}</p>}
        </div>

        {/* ── Form footer ── */}
        <div className="flex items-center gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {submitLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="ml-auto text-muted-foreground hover:text-foreground"
            onClick={() => setPreviewOpen(true)}
          >
            <Play className="h-4 w-4 mr-2" />
            Dry Run
          </Button>
        </div>
      </form>

      {/* ── Dry run sheet ── */}
      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Schedule Preview (Dry Run)</SheetTitle>
            <SheetDescription>
              Simulate what this schedule would do at a specific time, based on the current form values.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <PreviewPanel getFormData={buildPayload} />
          </div>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}
