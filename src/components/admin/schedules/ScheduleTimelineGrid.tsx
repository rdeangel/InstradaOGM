'use client';

import { useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Link2, Unlink2, Copy, Plus, Trash2, Pencil, Undo2, Info } from 'lucide-react';
import { BoundaryActionEditor, type TimeWindowFormData } from './BoundaryActionEditor';
import { TimeWindowInfoModal } from './TimeWindowInfoModal';

// Inline pure helper — avoids importing server-only schedule-validation module
function checkWindowOverlaps(windows: Array<{ startTime: string; endTime: string }>): {
  hasOverlap: boolean;
  overlaps?: Array<{ window1: number; window2: number }>;
} {
  function timeToMinutes(t: string) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }
  const overlaps: Array<{ window1: number; window2: number }> = [];
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      /* eslint-disable security/detect-object-injection -- i and j are controlled loop variables, not user input */
      const w1Start = timeToMinutes(windows[i].startTime);
      const w1End = timeToMinutes(windows[i].endTime);
      const w2Start = timeToMinutes(windows[j].startTime);
      const w2End = timeToMinutes(windows[j].endTime);
      /* eslint-enable security/detect-object-injection */
      if (w1Start < w2End && w2Start < w1End) overlaps.push({ window1: i, window2: j });
    }
  }
  return overlaps.length > 0 ? { hasOverlap: true, overlaps } : { hasOverlap: false };
}

export type ScheduleDayFormData = {
  dayOfWeek: number;
  windows: TimeWindowFormData[];
};

interface ScheduleTimelineGridProps {
  days: ScheduleDayFormData[];
  onChange: (days: ScheduleDayFormData[]) => void;
  mirroredDays: Set<number>;
  templateDay: number;
  onMirrorChange: (mirroredDays: Set<number>, templateDay: number) => void;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TOTAL_MINUTES = 1440;

const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21, 24];
const ALL_HOURS = Array.from({ length: 25 }, (_, i) => i);

function minutesToPercent(minutes: number): number {
  return (minutes / TOTAL_MINUTES) * 100;
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function snapToGrid(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function getWindowColor(window: TimeWindowFormData): string {
  const firstStart = window.actions.find(a => a.boundaryType === 'START');
  if (!firstStart) return 'bg-gray-500';
  switch (firstStart.operation) {
    case 'ASSIGN': return 'bg-green-500';
    case 'UNASSIGN': return 'bg-red-500';
    case 'CLEAR_ALL': return 'bg-gray-500';
    default: return 'bg-gray-500';
  }
}

type DragState =
  | { type: 'create'; dayIndex: number; startMinutes: number; currentMinutes: number }
  | { type: 'resize-left'; dayIndex: number; windowIndex: number; currentMinutes: number }
  | { type: 'resize-right'; dayIndex: number; windowIndex: number; currentMinutes: number }
  | { type: 'move'; sourceDayIndex: number; targetDayIndex: number; windowIndex: number; startMinutes: number; initialStart: number; initialEnd: number; currentMinutes: number; isCopy: boolean }
  | null;

type EditState = {
  dayIndex: number;
  windowIndex: number | null; // null = new window
  window: TimeWindowFormData;
} | null;

export function ScheduleTimelineGrid({
  days,
  onChange,
  mirroredDays,
  templateDay,
  onMirrorChange,
}: ScheduleTimelineGridProps) {
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragDidMoveRef = useRef<boolean>(false);
  const [dragState, setDragState] = useState<DragState>(null);
  const [hoverState, setHoverState] = useState<{ dayIndex: number; minutes: number; windowIndex?: number } | null>(null);
  const [editState, setEditState] = useState<EditState>(null);
  const [infoState, setInfoState] = useState<{ dayIndex: number; windowIndex: number; window: TimeWindowFormData } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    dayIndex: number;
    windowIndex: number;
  } | null>(null);

  const [undoDays, setUndoDays] = useState<ScheduleDayFormData[] | null>(null);

  function handleStateChange(newDays: ScheduleDayFormData[]) {
    if (undoDays) setUndoDays(null);
    onChange(newDays);
  }

  const getMinutesFromPointerX = useCallback((dayIndex: number, clientX: number): number => {
    // eslint-disable-next-line security/detect-object-injection -- dayIndex is 0-6 integer from props, not user input
    const row = rowRefs.current[dayIndex];
    if (!row) return 0;
    const rect = row.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return snapToGrid(Math.round(ratio * TOTAL_MINUTES));
  }, []);

  function applyMirror(updatedDays: ScheduleDayFormData[], sourceDayIndex: number): ScheduleDayFormData[] {
    if (!mirroredDays.size) return updatedDays;
    const sourceDay = updatedDays.find(d => d.dayOfWeek === sourceDayIndex);
    if (!sourceDay) return updatedDays;
    return updatedDays.map(d =>
      mirroredDays.has(d.dayOfWeek) ? { ...d, windows: [...sourceDay.windows] } : d,
    );
  }

  function updateDayWindows(
    dayIndex: number,
    updater: (windows: TimeWindowFormData[]) => TimeWindowFormData[],
  ) {
    const updated = days.map(d =>
      d.dayOfWeek === dayIndex ? { ...d, windows: updater(d.windows) } : d,
    );
    handleStateChange(dayIndex === templateDay ? applyMirror(updated, dayIndex) : updated);
  }

  function openEditDialog(dayIndex: number, windowIndex: number) {
    const day = days.find(d => d.dayOfWeek === dayIndex);
    // eslint-disable-next-line security/detect-object-injection -- windowIndex is a controlled component prop, not user input
    const win = day?.windows[windowIndex];
    if (!win) return;

    // If clicking a mirrored day, unlink it first
    if (mirroredDays.has(dayIndex)) {
      const newMirrored = new Set(mirroredDays);
      newMirrored.delete(dayIndex);
      onMirrorChange(newMirrored, templateDay);
    }

    setEditState({ dayIndex, windowIndex, window: { ...win, actions: win.actions.map(a => ({ ...a })) } });
  }

  function openInfoDialog(dayIndex: number, windowIndex: number) {
    const day = days.find(d => d.dayOfWeek === dayIndex);
    // eslint-disable-next-line security/detect-object-injection
    const win = day?.windows[windowIndex];
    if (!win) return;
    setInfoState({ dayIndex, windowIndex, window: win });
  }

  function openCreateDialog(dayIndex: number, startMinutes: number, endMinutes: number) {
    if (mirroredDays.has(dayIndex)) {
      const newMirrored = new Set(mirroredDays);
      newMirrored.delete(dayIndex);
      onMirrorChange(newMirrored, templateDay);
    }
    setEditState({
      dayIndex,
      windowIndex: null,
      window: {
        startTime: minutesToTime(startMinutes),
        endTime: minutesToTime(endMinutes),
        actions: [],
      },
    });
  }

  function handleSave(savedWindow: TimeWindowFormData) {
    if (!editState) return;
    const { dayIndex, windowIndex } = editState;
    updateDayWindows(dayIndex, windows => {
      if (windowIndex === null) {
        return [...windows, savedWindow];
      }
      return windows.map((w, i) => (i === windowIndex ? savedWindow : w));
    });
    setEditState(null);
  }

  function handleDeleteWindow(dayIndex: number, windowIndex: number) {
    updateDayWindows(dayIndex, windows => windows.filter((_, i) => i !== windowIndex));
  }

  function handleCopyToDay(sourceDayIndex: number, windowIndex: number, targetDayIndex: number) {
    const sourceDay = days.find(d => d.dayOfWeek === sourceDayIndex);
    // eslint-disable-next-line security/detect-object-injection -- windowIndex is integer from state
    const winToCopy = sourceDay?.windows[windowIndex];
    if (!winToCopy) return;

    // Create deep copy of the window and its actions
    const newWindow = {
      ...winToCopy,
      actions: winToCopy.actions.map(a => ({ ...a }))
    };

    updateDayWindows(targetDayIndex, windows => [...windows, newWindow]);
  }

  // Pointer event handlers for a row
  function handleRowPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    dayIndex: number,
  ) {
    // Only trigger on the background (not on window blocks)
    if ((e.target as HTMLElement).closest('[data-window-block]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragDidMoveRef.current = false;
    const minutes = getMinutesFromPointerX(dayIndex, e.clientX);
    setDragState({ type: 'create', dayIndex, startMinutes: minutes, currentMinutes: minutes });
  }

  function handleRowPointerMove(
    e: React.PointerEvent<HTMLDivElement>,
    dayIndex: number,
  ) {
    let activeDayIndex = dayIndex;
    if (dragState?.type === 'move') {
      const overIndex = Array.from(rowRefs.current).findIndex((ref) => {
        if (!ref) return false;
        const rect = ref.getBoundingClientRect();
        return e.clientY >= rect.top && e.clientY <= rect.bottom;
      });
      if (overIndex !== -1) {
        activeDayIndex = overIndex;
      } else {
        activeDayIndex = dragState.targetDayIndex;
      }
    }

    const minutes = getMinutesFromPointerX(activeDayIndex, e.clientX);
    setHoverState(prev => ({ dayIndex: activeDayIndex, minutes, windowIndex: prev?.windowIndex }));

    if (!dragState) return;

    // Detect actual drag payload movement for preventing accidental clicks
    if (dragState.type === 'move' && minutes !== dragState.startMinutes) {
      dragDidMoveRef.current = true;
    } else if (dragState.type !== 'move' && minutes !== dragState.currentMinutes) {
      dragDidMoveRef.current = true;
    }

    if (dragState.type === 'create') {
      setDragState({ ...dragState, currentMinutes: minutes });
    } else if (dragState.type === 'resize-left') {
      setDragState({ ...dragState, currentMinutes: minutes });
    } else if (dragState.type === 'resize-right') {
      setDragState({ ...dragState, currentMinutes: minutes });
    } else if (dragState.type === 'move') {
      setDragState({ ...dragState, targetDayIndex: activeDayIndex, currentMinutes: minutes });
    }
  }

  function handleRowPointerUp(
    e: React.PointerEvent<HTMLDivElement>,
    dayIndex: number,
  ) {
    if (!dragState) return;

    if (dragState.type === 'create' && dragState.dayIndex === dayIndex) {
      const start = Math.min(dragState.startMinutes, dragState.currentMinutes);
      const end = Math.max(dragState.startMinutes, dragState.currentMinutes);
      if (end - start >= 15) {
        openCreateDialog(dayIndex, start, end);
      }
    } else if (dragState.type === 'resize-left') {
      const { windowIndex, currentMinutes } = dragState;
      updateDayWindows(dayIndex, windows =>
        windows.map((w, i) => {
          if (i !== windowIndex) return w;
          const endMinutes = parseTimeToMinutes(w.endTime);
          const newStart = clamp(currentMinutes, 0, endMinutes - 15);
          return { ...w, startTime: minutesToTime(newStart) };
        }),
      );
    } else if (dragState.type === 'resize-right' && dragState.dayIndex === dayIndex) {
      const { windowIndex, currentMinutes } = dragState;
      updateDayWindows(dayIndex, windows =>
        windows.map((w, i) => {
          if (i !== windowIndex) return w;
          const startMinutes = parseTimeToMinutes(w.startTime);
          const newEnd = clamp(currentMinutes, startMinutes + 15, TOTAL_MINUTES);
          return { ...w, endTime: minutesToTime(newEnd) };
        }),
      );
    } else if (dragState.type === 'move' && dragState.sourceDayIndex === dayIndex) {
      const { windowIndex, currentMinutes, startMinutes, initialStart, initialEnd } = dragState;
      const delta = currentMinutes - startMinutes;
      const duration = initialEnd - initialStart;
      let newStart = initialStart + delta;
      let newEnd = newStart + duration;

      if (newStart < 0) {
        newStart = 0;
        newEnd = duration;
      } else if (newEnd > TOTAL_MINUTES) {
        newEnd = TOTAL_MINUTES;
        newStart = TOTAL_MINUTES - duration;
      }

      if (dragState.sourceDayIndex === dragState.targetDayIndex) {
        updateDayWindows(dragState.sourceDayIndex, windows => {
          if (dragState.isCopy) {
            // eslint-disable-next-line security/detect-object-injection -- windowIndex is integer from state
            const originalWindow = windows[windowIndex];
            const copiedWindow = {
              ...originalWindow,
              startTime: minutesToTime(newStart),
              endTime: minutesToTime(newEnd),
              actions: originalWindow.actions.map(a => ({ ...a }))
            };
            return [...windows, copiedWindow];
          }
          return windows.map((w, i) => {
            if (i !== windowIndex) return w;
            return { ...w, startTime: minutesToTime(newStart), endTime: minutesToTime(newEnd) };
          });
        });
      } else {
        const sourceDayData = days.find(d => d.dayOfWeek === dragState.sourceDayIndex);
        // eslint-disable-next-line security/detect-object-injection -- windowIndex is integer from state
        const movedWindow = sourceDayData?.windows[windowIndex];
        if (movedWindow) {
          const updatedWindow = {
            ...movedWindow,
            startTime: minutesToTime(newStart),
            endTime: minutesToTime(newEnd),
            actions: dragState.isCopy ? movedWindow.actions.map(a => ({ ...a })) : movedWindow.actions
          };
          let nextDays = [...days];

          nextDays = nextDays.map(d => {
            if (d.dayOfWeek === dragState.sourceDayIndex && !dragState.isCopy) {
              return { ...d, windows: d.windows.filter((_, i) => i !== windowIndex) };
            }
            if (d.dayOfWeek === dragState.targetDayIndex) {
              return { ...d, windows: [...d.windows, updatedWindow] };
            }
            return d;
          });

          if (mirroredDays.size) {
            nextDays = applyMirror(nextDays, dragState.sourceDayIndex);
            nextDays = applyMirror(nextDays, dragState.targetDayIndex);
          }
          handleStateChange(nextDays);
        }
      }
    }

    // Defer clearing dragDidMove so onClick can check it, but clear state to let rendering catch up immediately.
    setTimeout(() => { dragDidMoveRef.current = false; }, 0);
    setDragState(null);
  }

  function handleRowPointerLeave(
    e: React.PointerEvent<HTMLDivElement>,
    dayIndex: number,
  ) {
    if (hoverState?.dayIndex === dayIndex) {
      setHoverState(null);
    }
  }

  function handleResizePointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    dayIndex: number,
    windowIndex: number,
    side: 'left' | 'right',
  ) {
    e.stopPropagation();
    // eslint-disable-next-line security/detect-object-injection -- dayIndex is 0-6 integer from props, not user input
    const row = rowRefs.current[dayIndex];
    if (row) row.setPointerCapture(e.pointerId);
    const minutes = getMinutesFromPointerX(dayIndex, e.clientX);
    if (side === 'left') {
      setDragState({ type: 'resize-left', dayIndex, windowIndex, currentMinutes: minutes });
    } else {
      setDragState({ type: 'resize-right', dayIndex, windowIndex, currentMinutes: minutes });
    }
  }

  function handleMovePointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    dayIndex: number,
    windowIndex: number,
  ) {
    e.stopPropagation();
    // eslint-disable-next-line security/detect-object-injection -- dayIndex is 0-6 integer from props, not user input
    const row = rowRefs.current[dayIndex];
    if (row) row.setPointerCapture(e.pointerId);
    dragDidMoveRef.current = false;
    const minutes = getMinutesFromPointerX(dayIndex, e.clientX);
    // eslint-disable-next-line security/detect-object-injection -- dayIndex is safe
    const w = days.find(d => d.dayOfWeek === dayIndex)?.windows[windowIndex];
    if (!w) return;
    setDragState({
      type: 'move',
      sourceDayIndex: dayIndex,
      targetDayIndex: dayIndex,
      windowIndex,
      currentMinutes: minutes,
      startMinutes: minutes,
      initialStart: parseTimeToMinutes(w.startTime),
      initialEnd: parseTimeToMinutes(w.endTime),
      isCopy: e.ctrlKey || e.metaKey
    });
  }

  function toggleMirror(dayIndex: number) {
    if (dayIndex === templateDay) return;
    const newMirrored = new Set(mirroredDays);
    if (newMirrored.has(dayIndex)) {
      newMirrored.delete(dayIndex);
    } else {
      newMirrored.add(dayIndex);
      // Copy template day windows to this day
      const templateDayData = days.find(d => d.dayOfWeek === templateDay);
      if (templateDayData) {
        const updated = days.map(d =>
          d.dayOfWeek === dayIndex ? { ...d, windows: [...templateDayData.windows] } : d,
        );
        handleStateChange(updated);
      }
    }
    onMirrorChange(newMirrored, templateDay);
  }

  function copyToWeekdays() {
    const templateDayData = days.find(d => d.dayOfWeek === templateDay);
    if (!templateDayData) return;
    const weekdays = [2, 3, 4, 5]; // Tue-Fri
    const newMirrored = new Set(mirroredDays);
    weekdays.forEach(d => newMirrored.add(d));
    const updated = days.map(d =>
      weekdays.includes(d.dayOfWeek) ? { ...d, windows: [...templateDayData.windows] } : d,
    );
    handleStateChange(updated);
    onMirrorChange(newMirrored, templateDay);
  }

  function copyToAllDays() {
    const templateDayData = days.find(d => d.dayOfWeek === templateDay);
    if (!templateDayData) return;
    const others = [0, 2, 3, 4, 5, 6]; // Sun, Tue-Sat
    const newMirrored = new Set(mirroredDays);
    others.forEach(d => newMirrored.add(d));
    const updated = days.map(d =>
      others.includes(d.dayOfWeek) ? { ...d, windows: [...templateDayData.windows] } : d,
    );
    handleStateChange(updated);
    onMirrorChange(newMirrored, templateDay);
  }

  function clearAllDays() {
    setUndoDays(days);
    const updated = days.map(d => ({ ...d, windows: [] }));
    onChange(updated); // Do NOT use handleStateChange here to keep undo active
  }

  function handleUndoClear() {
    if (undoDays) {
      onChange(undoDays);
      setUndoDays(null);
    }
  }

  return (
    <TooltipProvider>
      <div className="space-y-1">
        {/* Header row */}
        <div className="flex items-center gap-1 mb-1 pl-24">
          <div className="flex-1 relative h-4">
            {HOUR_LABELS.map(h => (
              <span
                key={h}
                className="absolute text-xs text-muted-foreground transform -translate-x-1/2"
                style={{ left: `${(h / 24) * 100}%` }}
              >
                {h === 0 || h === 24 ? '' : `${String(h).padStart(2, '0')}:00`}
              </span>
            ))}
          </div>
          <div className="w-8" />
        </div>

        {/* Copy controls */}
        <div className="flex justify-end mb-2 gap-2 h-9">
          {undoDays ? (
            <Button type="button" variant="outline" size="sm" onClick={handleUndoClear} className="text-primary hover:bg-primary/10 transition-colors animate-in fade-in slide-in-from-right-2 duration-300">
              <Undo2 className="h-4 w-4 mr-2" />
              Undo clear
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={clearAllDays} className="text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all duration-300">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear all
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Copy className="h-3 w-3 mr-2" />
                {/* eslint-disable-next-line security/detect-object-injection -- templateDay is 0-6 integer from state, not user input */}
                Copy {DAY_NAMES[templateDay]} to…
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={copyToWeekdays}>
                Weekdays (Tue–Fri)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copyToAllDays}>
                All days (Tue–Sun)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Day rows */}
        {Array.from({ length: 7 }, (_, i) => i).map(dayIndex => {
          const dayData = days.find(d => d.dayOfWeek === dayIndex);
          const windows = dayData?.windows ?? [];
          const isMirrored = mirroredDays.has(dayIndex);
          const isTemplate = dayIndex === templateDay;

          const overlapResult = checkWindowOverlaps(
            windows.map(w => ({ startTime: w.startTime, endTime: w.endTime })),
          );
          const overlappingWindowIndices = new Set<number>(
            overlapResult.overlaps?.flatMap(o => [o.window1, o.window2]) ?? [],
          );

          // Compute live drag preview
          let previewBlock: { left: string; width: string } | null = null;
          if (
            dragState?.type === 'create' &&
            dragState.dayIndex === dayIndex
          ) {
            const start = Math.min(dragState.startMinutes, dragState.currentMinutes);
            const end = Math.max(dragState.startMinutes, dragState.currentMinutes);
            if (end > start) {
              previewBlock = {
                left: `${minutesToPercent(start)}%`,
                width: `${minutesToPercent(end - start)}%`,
              };
            }
          }

          return (
            <div key={dayIndex} className="flex items-center gap-1">
              {/* Day label + mirror toggle + add button */}
              <div className="w-24 flex items-center gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={`h-5 w-5 ${isMirrored ? 'text-primary' : 'text-muted-foreground'}`}
                      onClick={() => toggleMirror(dayIndex)}
                      disabled={isTemplate}
                    >
                      {isMirrored ? (
                        <Link2 className="h-3 w-3" />
                      ) : (
                        <Unlink2 className="h-3 w-3" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isTemplate
                      ? 'Template day'
                      : isMirrored
                        ? 'Unlink from template'
                        : 'Mirror from template'}
                  </TooltipContent>
                </Tooltip>
                <span
                  className={`text-sm font-medium ${isTemplate ? 'text-primary' : isMirrored ? 'text-muted-foreground' : ''
                    }`}
                >
                  {/* eslint-disable-next-line security/detect-object-injection -- dayIndex is 0-6 from Array.from loop, not user input */}
                  {DAY_NAMES[dayIndex]}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-muted-foreground ml-auto"
                      onClick={() => openCreateDialog(dayIndex, 480, 540)} // default 08:00 to 09:00
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Add time range</TooltipContent>
                </Tooltip>
              </div>

              {/* Timeline row */}
              <div
                // eslint-disable-next-line security/detect-object-injection -- dayIndex is 0-6 from Array.from loop, not user input
                ref={el => { rowRefs.current[dayIndex] = el; }}
                className={`flex-1 relative h-8 border rounded cursor-crosshair select-none ${isMirrored ? 'bg-muted/30 opacity-70' : 'bg-muted/10'
                  } ${overlapResult.hasOverlap ? 'ring-1 ring-red-400' : ''}`}
                onPointerDown={e => handleRowPointerDown(e, dayIndex)}
                onPointerMove={e => handleRowPointerMove(e, dayIndex)}
                onPointerUp={e => handleRowPointerUp(e, dayIndex)}
                onPointerLeave={e => handleRowPointerLeave(e, dayIndex)}
              >
                {/* Hour grid lines */}
                {ALL_HOURS.slice(1, -1).map(h => (
                  <div
                    key={h}
                    className={`absolute top-0 bottom-0 w-px ${h % 3 === 0 ? 'bg-border/60' : 'bg-border/30'
                      }`}
                    style={{ left: `${(h / 24) * 100}%` }}
                  />
                ))}

                {/* Cross-day drag preview or same-day copy drag preview visible only on the target day row */}
                {dragState?.type === 'move' &&
                  dragState.targetDayIndex === dayIndex &&
                  (dragState.sourceDayIndex !== dayIndex || dragState.isCopy) &&
                  (() => {
                    const win = days.find(d => d.dayOfWeek === dragState.sourceDayIndex)?.windows[dragState.windowIndex];
                    if (!win) return null;

                    const delta = dragState.currentMinutes - dragState.startMinutes;
                    const duration = dragState.initialEnd - dragState.initialStart;
                    let newStart = dragState.initialStart + delta;
                    let newEnd = newStart + duration;

                    if (newStart < 0) {
                      newStart = 0;
                      newEnd = duration;
                    } else if (newEnd > TOTAL_MINUTES) {
                      newEnd = TOTAL_MINUTES;
                      newStart = TOTAL_MINUTES - duration;
                    }

                    const leftPercent = minutesToPercent(newStart);
                    const widthPercent = minutesToPercent(duration);
                    const colorClass = getWindowColor(win);

                    return (
                      <div
                        className={`absolute top-1 bottom-1 rounded ${colorClass} opacity-100 ring-2 ring-primary z-20 shadow-md scale-[1.02] flex items-center pointer-events-none`}
                        style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, minWidth: '4px' }}
                      >
                        {widthPercent > 5 && (
                          <span className="px-1 text-[10px] sm:text-xs text-white truncate w-full text-center">
                            {win.label || `${minutesToTime(newStart)} - ${minutesToTime(newEnd)}`}
                          </span>
                        )}
                      </div>
                    );
                  })()}

                {/* Window blocks */}
                {windows.map((win, wi) => {
                  const startMin = parseTimeToMinutes(win.startTime);
                  const endMin = parseTimeToMinutes(win.endTime);
                  const isOverlapping = overlappingWindowIndices.has(wi);

                  let leftPercent = minutesToPercent(startMin);
                  let widthPercent = minutesToPercent(endMin - startMin);

                  let displayStart = win.startTime;
                  let displayEnd = win.endTime;

                  // Apply live resize preview
                  if (dragState?.type === 'resize-left' && dragState.dayIndex === dayIndex && dragState.windowIndex === wi) {
                    const newStart = clamp(dragState.currentMinutes, 0, endMin - 15);
                    leftPercent = minutesToPercent(newStart);
                    widthPercent = minutesToPercent(endMin - newStart);
                    displayStart = minutesToTime(newStart);
                  } else if (dragState?.type === 'resize-right' && dragState.dayIndex === dayIndex && dragState.windowIndex === wi) {
                    const newEnd = clamp(dragState.currentMinutes, startMin + 15, TOTAL_MINUTES);
                    widthPercent = minutesToPercent(newEnd - startMin);
                    displayEnd = minutesToTime(newEnd);
                  } else if (dragState?.type === 'move' && dragState.sourceDayIndex === dayIndex && dragState.windowIndex === wi) {
                    if (!dragState.isCopy) {
                      const delta = dragState.currentMinutes - dragState.startMinutes;
                      const duration = endMin - startMin;
                      let newStart = startMin + delta;
                      let newEnd = newStart + duration;
                      if (newStart < 0) {
                        newStart = 0;
                        newEnd = duration;
                      } else if (newEnd > TOTAL_MINUTES) {
                        newEnd = TOTAL_MINUTES;
                        newStart = TOTAL_MINUTES - duration;
                      }
                      leftPercent = minutesToPercent(newStart);
                      widthPercent = minutesToPercent(duration);
                      displayStart = minutesToTime(newStart);
                      displayEnd = minutesToTime(newEnd);
                    }
                  }

                  const colorClass = getWindowColor(win);

                  return (
                    <div
                      key={wi}
                      data-window-block
                      className={`absolute top-1 bottom-1 rounded ${colorClass} opacity-80 hover:opacity-100 cursor-move flex items-center transition-opacity duration-150 ${(dragState?.type === 'move' && dragState.sourceDayIndex === dayIndex && dragState.windowIndex === wi && dragState.targetDayIndex !== dayIndex && !dragState.isCopy) ? 'opacity-20 hidden sm:flex pointer-events-none' : ''} ${isOverlapping ? 'ring-2 ring-red-500' : ''
                        }`}
                      style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, minWidth: '4px' }}
                      onPointerDown={e => {
                        // Left click only (button 0)
                        if (e.button === 0) handleMovePointerDown(e, dayIndex, wi);
                      }}
                      onClick={e => {
                        e.stopPropagation();
                        // Left click intentionally does nothing — use right-click menu
                      }}
                      onContextMenu={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          dayIndex,
                          windowIndex: wi
                        });
                      }}
                    >
                      {/* Track which window the pointer is hovering */}
                      {/* Invisible overlay to capture hover events over the whole window block */}
                      <div
                        className="absolute inset-0 pointer-events-none"
                        onPointerEnter={() => setHoverState(prev => prev ? { ...prev, windowIndex: wi } : null)}
                        onPointerLeave={() => setHoverState(prev => prev ? { ...prev, windowIndex: undefined } : null)}
                      />

                      {/* Resize left handle */}
                      <div
                        data-window-block
                        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-l"
                        onPointerDown={e => {
                          if (e.button === 0) handleResizePointerDown(e, dayIndex, wi, 'left')
                        }}
                      />

                      {/* Label */}
                      {widthPercent > 5 && (
                        <span className="px-1 text-[10px] sm:text-xs text-white truncate pointer-events-none w-full text-center">
                          {win.label || `${displayStart} - ${displayEnd}`}
                        </span>
                      )}

                      {/* Delete button */}
                      <button
                        data-window-block
                        type="button"
                        className="absolute top-0 right-4 bottom-0 px-0.5 text-white/70 hover:text-white text-xs opacity-0 group-hover:opacity-100 pointer-events-auto"
                        style={{ fontSize: '10px' }}
                        onClick={e => {
                          e.stopPropagation();
                          if (!dragDidMoveRef.current) handleDeleteWindow(dayIndex, wi);
                        }}
                        title="Delete window"
                      >
                        ×
                      </button>

                      {/* Resize right handle */}
                      <div
                        data-window-block
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-r"
                        onPointerDown={e => {
                          if (e.button === 0) handleResizePointerDown(e, dayIndex, wi, 'right')
                        }}
                      />

                      {/* Overlap warning tooltip */}
                      {isOverlapping && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              data-window-block
                              className="absolute inset-0 cursor-pointer"
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-destructive text-xs">Window overlaps with another window</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  );
                })}

                {/* Drag create preview */}
                {previewBlock && dragState?.type === 'create' && (
                  <div
                    className="absolute top-1 bottom-1 rounded bg-blue-400/50 border border-blue-400 border-dashed pointer-events-none"
                    style={{ left: previewBlock.left, width: previewBlock.width }}
                  />
                )}

                {/* Hover / Drag Tooltip */}
                {hoverState?.dayIndex === dayIndex && (() => {
                  let tooltipLabel: string | null = null;

                  if (dragState?.type === 'create' && dragState.dayIndex === dayIndex) {
                    // Creating — show the live preview range
                    const start = Math.min(dragState.startMinutes, dragState.currentMinutes);
                    const end   = Math.max(dragState.startMinutes, dragState.currentMinutes);
                    if (end > start) tooltipLabel = `${minutesToTime(start)} – ${minutesToTime(end)}`;

                  } else if (dragState?.type === 'move' &&
                             (dragState.sourceDayIndex === dayIndex || dragState.targetDayIndex === dayIndex)) {
                    // Moving a window — always show the window's live range, not cursor position
                    const delta    = dragState.currentMinutes - dragState.startMinutes;
                    const duration = dragState.initialEnd - dragState.initialStart;
                    let ns = dragState.initialStart + delta;
                    let ne = ns + duration;
                    if (ns < 0) { ns = 0; ne = duration; }
                    if (ne > TOTAL_MINUTES) { ne = TOTAL_MINUTES; ns = TOTAL_MINUTES - duration; }
                    tooltipLabel = `${minutesToTime(ns)} – ${minutesToTime(ne)}`;

                  } else if (dragState?.type === 'resize-left' && dragState.dayIndex === dayIndex) {
                    // Resizing left edge — show live start + fixed end
                    const win = days.find(d => d.dayOfWeek === dayIndex)?.windows[dragState.windowIndex];
                    if (win) {
                      const endMin  = parseTimeToMinutes(win.endTime);
                      const newStart = minutesToTime(clamp(dragState.currentMinutes, 0, endMin - 15));
                      tooltipLabel = `${newStart} – ${win.endTime}`;
                    }

                  } else if (dragState?.type === 'resize-right' && dragState.dayIndex === dayIndex) {
                    // Resizing right edge — show fixed start + live end
                    const win = days.find(d => d.dayOfWeek === dayIndex)?.windows[dragState.windowIndex];
                    if (win) {
                      const startMin = parseTimeToMinutes(win.startTime);
                      const newEnd   = minutesToTime(clamp(dragState.currentMinutes, startMin + 15, TOTAL_MINUTES));
                      tooltipLabel = `${win.startTime} – ${newEnd}`;
                    }

                  } else if (hoverState.windowIndex !== undefined) {
                    // Hovering over a window (no active drag) — show the window's fixed range
                    const hoveredWin = days.find(d => d.dayOfWeek === dayIndex)?.windows[hoverState.windowIndex];
                    if (hoveredWin) tooltipLabel = `${hoveredWin.startTime} – ${hoveredWin.endTime}`;

                  } else {
                    // Plain empty-timeline hover — show cursor position
                    tooltipLabel = minutesToTime(hoverState.minutes);
                  }

                  if (!tooltipLabel) return null;

                  return (
                    <div
                      className="absolute -top-8 pointer-events-none z-50 transform -translate-x-1/2 flex flex-col items-center"
                      style={{ left: `${minutesToPercent(hoverState.minutes)}%` }}
                    >
                      <div className="bg-popover text-popover-foreground text-xs font-medium py-1 px-2 rounded shadow-md border whitespace-nowrap">
                        {tooltipLabel}
                      </div>
                      <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-popover drop-shadow-sm -mt-px" />
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Info Modal */}
      {infoState && (
        <TimeWindowInfoModal
          open={!!infoState}
          dayName={DAY_NAMES[infoState.dayIndex]}
          window={infoState.window}
          onClose={() => setInfoState(null)}
          onEdit={() => {
            const { dayIndex, windowIndex } = infoState;
            setInfoState(null);
            openEditDialog(dayIndex, windowIndex);
          }}
        />
      )}

      {/* Edit Form */}
      {editState && (
        <BoundaryActionEditor
          open={!!editState}
          window={editState.window}
          onSave={handleSave}
          onClose={() => setEditState(null)}
        />
      )}

      {/* Context Menu Dropdown */}
      <DropdownMenu open={!!contextMenu} onOpenChange={(open) => !open && setContextMenu(null)}>
        <DropdownMenuTrigger
          className="fixed pointer-events-none opacity-0 m-0 p-0"
          style={{
            left: contextMenu?.x ?? 0,
            top: contextMenu?.y ?? 0,
            width: 0,
            height: 0,
          }}
        />
        <DropdownMenuContent align="start" sideOffset={5} className="w-48">
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => {
              if (contextMenu) openInfoDialog(contextMenu.dayIndex, contextMenu.windowIndex);
              setContextMenu(null);
            }}
          >
            <Info className="mr-2 h-4 w-4" />
            <span>View info</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => {
              if (contextMenu) openEditDialog(contextMenu.dayIndex, contextMenu.windowIndex);
              setContextMenu(null);
            }}
          >
            <Pencil className="mr-2 h-4 w-4" />
            <span>Edit</span>
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <Copy className="mr-2 h-4 w-4" />
              <span>Copy to day...</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              {DAY_NAMES.map((targetName, targetIndex) => (
                <DropdownMenuItem
                  key={targetIndex}
                  disabled={contextMenu?.dayIndex === targetIndex}
                  className="cursor-pointer"
                  onClick={() => {
                    if (contextMenu) handleCopyToDay(contextMenu.dayIndex, contextMenu.windowIndex, targetIndex);
                    setContextMenu(null);
                  }}
                >
                  {targetName}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive focus:text-destructive-foreground cursor-pointer"
            onClick={() => {
              if (contextMenu) handleDeleteWindow(contextMenu.dayIndex, contextMenu.windowIndex);
              setContextMenu(null);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
