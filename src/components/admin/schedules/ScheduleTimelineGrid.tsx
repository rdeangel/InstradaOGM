'use client';

import { useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Link2, Unlink2, Copy } from 'lucide-react';
import { BoundaryActionEditor, type TimeWindowFormData } from './BoundaryActionEditor';

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
    case 'REMOVE': return 'bg-red-500';
    case 'MOVE': return 'bg-purple-500';
    case 'CLEAR_ALL': return 'bg-gray-500';
    default: return 'bg-gray-500';
  }
}

type DragState =
  | { type: 'create'; dayIndex: number; startMinutes: number; currentMinutes: number }
  | { type: 'resize-left'; dayIndex: number; windowIndex: number; currentMinutes: number }
  | { type: 'resize-right'; dayIndex: number; windowIndex: number; currentMinutes: number }
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
  const [dragState, setDragState] = useState<DragState>(null);
  const [editState, setEditState] = useState<EditState>(null);

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
    onChange(dayIndex === templateDay ? applyMirror(updated, dayIndex) : updated);
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

  // Pointer event handlers for a row
  function handleRowPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    dayIndex: number,
  ) {
    // Only trigger on the background (not on window blocks)
    if ((e.target as HTMLElement).closest('[data-window-block]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const minutes = getMinutesFromPointerX(dayIndex, e.clientX);
    setDragState({ type: 'create', dayIndex, startMinutes: minutes, currentMinutes: minutes });
  }

  function handleRowPointerMove(
    e: React.PointerEvent<HTMLDivElement>,
    dayIndex: number,
  ) {
    if (!dragState || dragState.dayIndex !== dayIndex) return;
    const minutes = getMinutesFromPointerX(dayIndex, e.clientX);

    if (dragState.type === 'create') {
      setDragState({ ...dragState, currentMinutes: minutes });
    } else if (dragState.type === 'resize-left') {
      setDragState({ ...dragState, currentMinutes: minutes });
    } else if (dragState.type === 'resize-right') {
      setDragState({ ...dragState, currentMinutes: minutes });
    }
  }

  function handleRowPointerUp(
    e: React.PointerEvent<HTMLDivElement>,
    dayIndex: number,
  ) {
    if (!dragState || dragState.dayIndex !== dayIndex) return;

    if (dragState.type === 'create') {
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
    } else if (dragState.type === 'resize-right') {
      const { windowIndex, currentMinutes } = dragState;
      updateDayWindows(dayIndex, windows =>
        windows.map((w, i) => {
          if (i !== windowIndex) return w;
          const startMinutes = parseTimeToMinutes(w.startTime);
          const newEnd = clamp(currentMinutes, startMinutes + 15, TOTAL_MINUTES);
          return { ...w, endTime: minutesToTime(newEnd) };
        }),
      );
    }

    setDragState(null);
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
        onChange(updated);
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
    onChange(updated);
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
    onChange(updated);
    onMirrorChange(newMirrored, templateDay);
  }

  return (
    <TooltipProvider>
      <div className="space-y-1">
        {/* Header row */}
        <div className="flex items-center gap-1 mb-1 pl-16">
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
        <div className="flex justify-end mb-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
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
              {/* Day label + mirror toggle */}
              <div className="w-16 flex items-center gap-1 shrink-0">
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
                  className={`text-sm font-medium ${
                    isTemplate ? 'text-primary' : isMirrored ? 'text-muted-foreground' : ''
                  }`}
                >
                  {/* eslint-disable-next-line security/detect-object-injection -- dayIndex is 0-6 from Array.from loop, not user input */}
                  {DAY_NAMES[dayIndex]}
                </span>
              </div>

              {/* Timeline row */}
              <div
                // eslint-disable-next-line security/detect-object-injection -- dayIndex is 0-6 from Array.from loop, not user input
                ref={el => { rowRefs.current[dayIndex] = el; }}
                className={`flex-1 relative h-8 border rounded cursor-crosshair select-none ${
                  isMirrored ? 'bg-muted/30 opacity-70' : 'bg-muted/10'
                } ${overlapResult.hasOverlap ? 'ring-1 ring-red-400' : ''}`}
                onPointerDown={e => handleRowPointerDown(e, dayIndex)}
                onPointerMove={e => handleRowPointerMove(e, dayIndex)}
                onPointerUp={e => handleRowPointerUp(e, dayIndex)}
              >
                {/* Hour grid lines */}
                {HOUR_LABELS.slice(1, -1).map(h => (
                  <div
                    key={h}
                    className="absolute top-0 bottom-0 w-px bg-border/50"
                    style={{ left: `${(h / 24) * 100}%` }}
                  />
                ))}

                {/* Window blocks */}
                {windows.map((win, wi) => {
                  const startMin = parseTimeToMinutes(win.startTime);
                  const endMin = parseTimeToMinutes(win.endTime);
                  const isOverlapping = overlappingWindowIndices.has(wi);

                  let leftPercent = minutesToPercent(startMin);
                  let widthPercent = minutesToPercent(endMin - startMin);

                  // Apply live resize preview
                  if (dragState?.type === 'resize-left' && dragState.dayIndex === dayIndex && dragState.windowIndex === wi) {
                    const newStart = clamp(dragState.currentMinutes, 0, endMin - 15);
                    leftPercent = minutesToPercent(newStart);
                    widthPercent = minutesToPercent(endMin - newStart);
                  } else if (dragState?.type === 'resize-right' && dragState.dayIndex === dayIndex && dragState.windowIndex === wi) {
                    const newEnd = clamp(dragState.currentMinutes, startMin + 15, TOTAL_MINUTES);
                    widthPercent = minutesToPercent(newEnd - startMin);
                  }

                  const colorClass = getWindowColor(win);

                  return (
                    <div
                      key={wi}
                      data-window-block
                      className={`absolute top-1 bottom-1 rounded ${colorClass} opacity-80 hover:opacity-100 cursor-pointer flex items-center ${
                        isOverlapping ? 'ring-2 ring-red-500' : ''
                      }`}
                      style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, minWidth: '4px' }}
                      onClick={e => {
                        e.stopPropagation();
                        if (!dragState) openEditDialog(dayIndex, wi);
                      }}
                    >
                      {/* Resize left handle */}
                      <div
                        data-window-block
                        className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-white/30 rounded-l"
                        onPointerDown={e => handleResizePointerDown(e, dayIndex, wi, 'left')}
                      />

                      {/* Label */}
                      {widthPercent > 5 && (
                        <span className="px-2 text-xs text-white truncate pointer-events-none">
                          {win.label || `${win.startTime}`}
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
                          handleDeleteWindow(dayIndex, wi);
                        }}
                        title="Delete window"
                      >
                        ×
                      </button>

                      {/* Resize right handle */}
                      <div
                        data-window-block
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-white/30 rounded-r"
                        onPointerDown={e => handleResizePointerDown(e, dayIndex, wi, 'right')}
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
                {previewBlock && (
                  <div
                    className="absolute top-1 bottom-1 rounded bg-blue-400/50 border border-blue-400 border-dashed pointer-events-none"
                    style={{ left: previewBlock.left, width: previewBlock.width }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit dialog */}
      {editState && (
        <BoundaryActionEditor
          open
          window={editState.window}
          onSave={handleSave}
          onClose={() => setEditState(null)}
        />
      )}
    </TooltipProvider>
  );
}
