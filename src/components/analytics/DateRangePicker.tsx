'use client';

import React, { useState } from 'react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { DateRange } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIsMobile } from '@/hooks/use-mobile';


interface DateRangePickerProps {
  value?: DateRange;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
  placeholder?: string;
  showPresets?: boolean;
}

const PRESET_RANGES = [
  {
    label: 'Last 24 hours',
    value: 'last24h',
    getRange: () => ({
      from: subDays(new Date(), 1),
      to: new Date(),
    }),
  },
  {
    label: 'Last 7 days',
    value: 'last7d',
    getRange: () => ({
      from: subDays(new Date(), 7),
      to: new Date(),
    }),
  },
  {
    label: 'Last 30 days',
    value: 'last30d',
    getRange: () => ({
      from: subDays(new Date(), 30),
      to: new Date(),
    }),
  },
  {
    label: 'Last 90 days',
    value: 'last90d',
    getRange: () => ({
      from: subDays(new Date(), 90),
      to: new Date(),
    }),
  },
  {
    label: 'This week',
    value: 'thisWeek',
    getRange: () => {
      const now = new Date();
      const startOfWeek = subDays(now, now.getDay());
      return {
        from: startOfDay(startOfWeek),
        to: endOfDay(now),
      };
    },
  },
  {
    label: 'This month',
    value: 'thisMonth',
    getRange: () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        from: startOfDay(startOfMonth),
        to: endOfDay(now),
      };
    },
  },
];

export function DateRangePicker({
  value,
  onChange,
  className,
  placeholder = 'Select date range',
  showPresets = true,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();

  const handlePresetSelect = (presetValue: string) => {
    const preset = PRESET_RANGES.find(p => p.value === presetValue);
    if (preset) {
      const range = preset.getRange();
      onChange(range);
      setIsOpen(false);
    }
  };

  const handleDateChange = (range: DateRange | undefined) => {
    if (range?.to) {
      // Set the end date to the end of the day (23:59:59) to include all records for that day
      const endOfDay = new Date(range.to);
      endOfDay.setHours(23, 59, 59, 999);
      onChange({ ...range, to: endOfDay });
    } else {
      onChange(range);
    }
  };

  const formatDateRange = (range: DateRange | undefined) => {
    if (!range?.from) return placeholder;
    if (!range.to) return format(range.from, 'MMM dd, yyyy');
    return `${format(range.from, 'MMM dd, yyyy')} - ${format(range.to, 'MMM dd, yyyy')}`;
  };

  return (
    <div className={cn('grid gap-2', className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="outline"
            type="button"
            className={cn(
              'w-full justify-start text-left font-normal cursor-pointer',
              !value && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {formatDateRange(value)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className={cn("w-auto p-0", isMobile && "w-screen max-w-sm")} align="start">
          <div className={cn("flex", isMobile && "flex-col")}>
            {showPresets && (
              <div className={cn("border-r p-3", isMobile && "border-r-0 border-b")}>
                <div className="text-sm font-medium mb-2">Quick Select</div>
                <div className={cn("space-y-1", isMobile && "grid grid-cols-2 gap-1 space-y-0")}>
                  {PRESET_RANGES.map((preset) => (
                    <Button
                      key={preset.value}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs cursor-pointer"
                      onClick={() => handlePresetSelect(preset.value)}
                      type="button"
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="p-3">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={value?.from}
                selected={value}
                onSelect={handleDateChange}
                numberOfMonths={isMobile ? 1 : 2}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
