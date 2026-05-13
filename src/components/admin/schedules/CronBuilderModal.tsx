'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import cronstrue from 'cronstrue';
import { CronExpressionParser } from 'cron-parser';

interface CronBuilderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (cronExpression: string) => void;
  initialValue?: string;
}

const COMMON_PRESETS = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every 30 minutes', value: '*/30 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 2 hours', value: '0 */2 * * *' },
  { label: 'Every day at 00:00', value: '0 0 * * *' },
  { label: 'Every day at 08:00', value: '0 8 * * *' },
  { label: 'Monday to Friday at 08:00', value: '0 8 * * 1-5' },
  { label: 'Every Saturday at 00:00', value: '0 0 * * 6' },
  { label: 'Every Sunday at 00:00', value: '0 0 * * 0' },
  { label: 'First day of every month at 00:00', value: '0 0 1 * *' },
];

const DAYS_OF_WEEK = [
  { label: 'Sunday', value: '0' },
  { label: 'Monday', value: '1' },
  { label: 'Tuesday', value: '2' },
  { label: 'Wednesday', value: '3' },
  { label: 'Thursday', value: '4' },
  { label: 'Friday', value: '5' },
  { label: 'Saturday', value: '6' },
];

export function CronBuilderModal({
  open,
  onOpenChange,
  onSave,
  initialValue = '',
}: CronBuilderModalProps) {
  const [activeTab, setActiveTab] = useState('preset');
  
  // Preset State
  const [presetValue, setPresetValue] = useState(COMMON_PRESETS[0].value);
  
  // Free Text State
  const [freeTextValue, setFreeTextValue] = useState(initialValue || '* * * * *');
  
  // Custom State
  const [customDays, setCustomDays] = useState<string[]>([]);
  const [customTime, setCustomTime] = useState('00:00');

  useEffect(() => {
    if (open && initialValue) {
      setFreeTextValue(initialValue);
      // Try to match with preset
      const matchedPreset = COMMON_PRESETS.find(p => p.value === initialValue);
      if (matchedPreset) {
        setPresetValue(matchedPreset.value);
        setActiveTab('preset');
      } else {
        setActiveTab('free');
      }
    }
  }, [open, initialValue]);

  // Generate cron for Custom tab
  const getCustomCron = () => {
    const [hourStr, minStr] = customTime.split(':');
    const hour = parseInt(hourStr || '0', 10);
    const min = parseInt(minStr || '0', 10);
    
    // min hour day-of-month month day-of-week
    const days = customDays.length > 0 ? customDays.join(',') : '*';
    return `${min} ${hour} * * ${days}`;
  };

  const currentCron = () => {
    if (activeTab === 'preset') return presetValue;
    if (activeTab === 'custom') return getCustomCron();
    return freeTextValue;
  };

  const getPreview = (expr: string) => {
    try {
      if (!expr.trim()) return 'Please enter an expression';
      CronExpressionParser.parse(expr);
      return cronstrue.toString(expr);
    } catch {
      return 'Invalid cron expression';
    }
  };

  const isCurrentValid = () => {
    try {
      CronExpressionParser.parse(currentCron());
      return true;
    } catch {
      return false;
    }
  };

  const handleApply = () => {
    if (isCurrentValid()) {
      onSave(currentCron());
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Design Schedule</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="preset">Preset</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
            <TabsTrigger value="free">Free Text</TabsTrigger>
          </TabsList>
          
          <TabsContent value="preset" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Select a common schedule</Label>
              <Select value={presetValue} onValueChange={setPresetValue}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a preset..." />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_PRESETS.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="bg-muted/50 p-3 rounded-md border text-sm font-mono mt-2">
              Expression: {presetValue}
            </div>
          </TabsContent>
          
          <TabsContent value="custom" className="space-y-4 pt-4">
            <div className="space-y-3">
              <Label>Time of Day</Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                value={customTime}
                onChange={(e) => {
                  const val = e.target.value;
                  // eslint-disable-next-line security/detect-unsafe-regex -- Safe: simple time format validation
                  if (val === '' || /^\d{0,2}(:\d{0,2})?$/.test(val)) {
                    setCustomTime(val);
                  }
                }}
              />

              <div className="pt-2">
                <Label className="mb-2 block">Days of Week</Label>
                <p className="text-xs text-muted-foreground mb-3">
                  Leave all unchecked for &quot;Every day&quot;
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {DAYS_OF_WEEK.map((day) => (
                    <div key={day.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`day-${day.value}`}
                        checked={customDays.includes(day.value)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setCustomDays([...customDays, day.value].sort());
                          } else {
                            setCustomDays(customDays.filter((d) => d !== day.value));
                          }
                        }}
                      />
                      <label
                        htmlFor={`day-${day.value}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {day.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="bg-muted/50 p-3 rounded-md border text-sm font-mono mt-4">
              Expression: {getCustomCron()}
            </div>
          </TabsContent>
          
          <TabsContent value="free" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Cron Expression</Label>
              <Input
                value={freeTextValue}
                onChange={(e) => setFreeTextValue(e.target.value)}
                placeholder="* * * * *"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Format: <code className="bg-muted px-1 py-0.5 rounded">min hour day-of-month month day-of-week</code>
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Real-time Preview */}
        <div className="bg-muted p-3 my-2 rounded-md border border-primary/20">
          <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">
            Reads as:
          </p>
          <p className={`text-sm ${isCurrentValid() ? 'text-foreground' : 'text-destructive font-medium'}`}>
            {getPreview(currentCron())}
          </p>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!isCurrentValid()} onClick={handleApply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
