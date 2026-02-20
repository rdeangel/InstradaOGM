'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useOpnsenseNetworkGroups } from '@/hooks/use-opnsense-network-groups';
import { GroupCombobox } from './GroupCombobox';
import { ArrowUp, ArrowDown, Trash2, Plus, AlertTriangle, Loader2 } from 'lucide-react';
import type { NetworkGroup } from '@/types/opnsense';

type ActionFormData = {
  operation: 'ASSIGN' | 'REMOVE' | 'MOVE' | 'CLEAR_ALL';
  boundaryType: 'START' | 'END';
  targetGroupUuid?: string;
  fromGroupUuid?: string;
  sortOrder: number;
};

export type TimeWindowFormData = {
  startTime: string;
  endTime: string;
  label?: string;
  actions: ActionFormData[];
};

interface BoundaryActionEditorProps {
  open: boolean;
  window: TimeWindowFormData;
  onSave: (window: TimeWindowFormData) => void;
  onClose: () => void;
}

function ActionRow({
  action,
  index,
  total,
  groups,
  boundaryType,
  startTargetUuids,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  action: ActionFormData;
  index: number;
  total: number;
  groups: NetworkGroup[];
  boundaryType: 'START' | 'END';
  /** Group UUIDs targeted by start actions — used to filter end-action group selectors. */
  startTargetUuids?: Set<string>;
  onUpdate: (updated: ActionFormData) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  // Start actions: always show all groups freely.
  // End actions: REMOVE/MOVE-from are restricted to what start actions assigned;
  //   ASSIGN/MOVE-to are unrestricted (you may assign/move to any group at window end).
  const hasStartTargets = boundaryType === 'END' && startTargetUuids && startTargetUuids.size > 0;

  const targetFilterMode =
    hasStartTargets && action.operation === 'REMOVE' ? 'only-assigned' : 'none';

  const fromFilterMode =
    hasStartTargets && action.operation === 'MOVE' ? 'only-assigned' : 'none';

  return (
    <div className="flex items-start gap-2 p-3 border rounded-lg bg-muted/30">
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={index === 0}
          onClick={onMoveUp}
        >
          <ArrowUp className="h-3 w-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={index === total - 1}
          onClick={onMoveDown}
        >
          <ArrowDown className="h-3 w-3" />
        </Button>
      </div>

      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-muted-foreground mb-1">Operation</Label>
          <Select
            value={action.operation}
            onValueChange={val =>
              onUpdate({ ...action, operation: val as ActionFormData['operation'] })
            }
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

        {(action.operation === 'ASSIGN' ||
          action.operation === 'REMOVE' ||
          action.operation === 'MOVE') && (
          <div>
            <Label className="text-xs text-muted-foreground mb-1">
              {action.operation === 'MOVE' ? 'To Group' : 'Group'}
            </Label>
            <GroupCombobox
              groups={groups}
              value={action.targetGroupUuid ?? null}
              onValueChange={val => onUpdate({ ...action, targetGroupUuid: val ?? undefined })}
              placeholder="Select group..."
              assignedGroupUuids={hasStartTargets ? startTargetUuids : undefined}
              filterMode={targetFilterMode}
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
              assignedGroupUuids={hasStartTargets ? startTargetUuids : undefined}
              filterMode={fromFilterMode}
              excludeUuids={action.targetGroupUuid ? [action.targetGroupUuid] : []}
              className="w-full"
            />
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive mt-4"
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function BoundaryActionEditor({
  open,
  window: initialWindow,
  onSave,
  onClose,
}: BoundaryActionEditorProps) {
  const [editedWindow, setEditedWindow] = useState<TimeWindowFormData>(initialWindow);
  const { groups, isLoading: groupsLoading, error: groupsError } = useOpnsenseNetworkGroups();

  const startActions = editedWindow.actions.filter(a => a.boundaryType === 'START');
  const endActions = editedWindow.actions.filter(a => a.boundaryType === 'END');

  // Groups targeted by start ASSIGN/MOVE actions — used to filter end-action group selectors.
  const startTargetUuids = new Set(
    startActions
      .map(a => a.targetGroupUuid)
      .filter((uuid): uuid is string => Boolean(uuid)),
  );

  function updateActions(boundaryType: 'START' | 'END', newActions: ActionFormData[]) {
    const other = editedWindow.actions.filter(a => a.boundaryType !== boundaryType);
    const reordered = newActions.map((a, i) => ({ ...a, sortOrder: i }));
    setEditedWindow({ ...editedWindow, actions: [...other, ...reordered] });
  }

  function addAction(boundaryType: 'START' | 'END') {
    const existing = editedWindow.actions.filter(a => a.boundaryType === boundaryType);
    const newAction: ActionFormData = {
      operation: 'ASSIGN',
      boundaryType,
      sortOrder: existing.length,
    };
    setEditedWindow({ ...editedWindow, actions: [...editedWindow.actions, newAction] });
  }

  function updateAction(
    boundaryType: 'START' | 'END',
    index: number,
    updated: ActionFormData,
  ) {
    const actions = editedWindow.actions.filter(a => a.boundaryType === boundaryType);
    // eslint-disable-next-line security/detect-object-injection -- index is a controlled component prop (list item index), not user input
    actions[index] = updated;
    updateActions(boundaryType, actions);
  }

  function removeAction(boundaryType: 'START' | 'END', index: number) {
    const actions = editedWindow.actions.filter(a => a.boundaryType === boundaryType);
    actions.splice(index, 1);
    updateActions(boundaryType, actions);
  }

  function moveAction(boundaryType: 'START' | 'END', from: number, to: number) {
    const actions = editedWindow.actions.filter(a => a.boundaryType === boundaryType);
    const [item] = actions.splice(from, 1);
    actions.splice(to, 0, item);
    updateActions(boundaryType, actions);
  }

  function renderActionList(boundaryType: 'START' | 'END') {
    const actions = editedWindow.actions.filter(a => a.boundaryType === boundaryType);
    return (
      <div className="space-y-2">
        {groupsError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Failed to load network groups. Group selectors will be empty.</AlertDescription>
          </Alert>
        )}
        {!groupsError && !groupsLoading && groups.length === 0 && (
          <Alert variant="default" className="border-amber-400 bg-amber-50 dark:bg-amber-950/20">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700 dark:text-amber-400">
              No network groups found in OPNsense. Groups must exist before actions can be configured.
            </AlertDescription>
          </Alert>
        )}
        {groupsLoading && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 py-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading network groups…
          </p>
        )}
        {actions.length === 0 && !groupsLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No actions defined. Add one below.
          </p>
        )}
        {actions.map((action, i) => (
          <ActionRow
            key={i}
            action={action}
            index={i}
            total={actions.length}
            groups={groups}
            boundaryType={boundaryType}
            startTargetUuids={startTargetUuids}
            onUpdate={updated => updateAction(boundaryType, i, updated)}
            onRemove={() => removeAction(boundaryType, i)}
            onMoveUp={() => moveAction(boundaryType, i, i - 1)}
            onMoveDown={() => moveAction(boundaryType, i, i + 1)}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => addAction(boundaryType)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add {boundaryType === 'START' ? 'Start' : 'End'} Action
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Time Window</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="window-label">Label (optional)</Label>
              <Input
                id="window-label"
                value={editedWindow.label ?? ''}
                onChange={e =>
                  setEditedWindow({ ...editedWindow, label: e.target.value || undefined })
                }
                placeholder="e.g. Business Hours"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-muted-foreground">Time Range</Label>
              <p className="mt-1 text-sm font-mono bg-muted px-3 py-2 rounded-md">
                {editedWindow.startTime} – {editedWindow.endTime}
              </p>
            </div>
          </div>

          <Tabs defaultValue="start">
            <TabsList className="w-full">
              <TabsTrigger value="start" className="flex-1">
                Start Actions ({startActions.length})
              </TabsTrigger>
              <TabsTrigger value="end" className="flex-1">
                End Actions ({endActions.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="start" className="mt-3">
              {renderActionList('START')}
            </TabsContent>
            <TabsContent value="end" className="mt-3">
              {renderActionList('END')}
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onSave(editedWindow)}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
