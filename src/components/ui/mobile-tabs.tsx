'use client';

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-mobile';

interface MobileTabsProps {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: React.ReactNode;
  tabs: Array<{
    value: string;
    label: string;
  }>;
}

export function MobileTabs({
  defaultValue,
  value,
  onValueChange,
  className,
  children,
  tabs,
}: MobileTabsProps) {
  const isMobile = useIsMobile();
  const [currentValue, setCurrentValue] = React.useState(value || defaultValue);

  const handleValueChange = (newValue: string) => {
    setCurrentValue(newValue);
    onValueChange?.(newValue);
  };

  React.useEffect(() => {
    if (value !== undefined) {
      setCurrentValue(value);
    }
  }, [value]);

  if (isMobile) {
    return (
      <Tabs
        value={currentValue}
        onValueChange={handleValueChange}
        className={className}
      >
        <div className="mb-4">
          <Select value={currentValue} onValueChange={handleValueChange}>
            <SelectTrigger className="w-full h-12 px-4 bg-muted/50 hover:bg-muted/70 text-left">
              <SelectValue placeholder="Select view" />
            </SelectTrigger>
            <SelectContent>
              {tabs.map((tab) => (
                <SelectItem key={tab.value} value={tab.value}>
                  {tab.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {children}
      </Tabs>
    );
  }

  return (
    <Tabs
      value={currentValue}
      onValueChange={handleValueChange}
      className={className}
    >
      <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  );
}

export { TabsContent };
