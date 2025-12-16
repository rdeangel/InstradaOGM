'use client';

/* eslint-disable security/detect-object-injection */
// This component uses bracket notation with icon names from lucide-react. All uses are safe.
import React, { useState, useCallback, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Define a curated list of Lucide icons suitable for group types
// Only include icons that are confirmed to exist in the lucide-react package
const groupTypeIconNames = [
  // Default CSS option (special handling)
  'DEFAULT',

  // Single dot/circle icons
  'Dot', 'Circle', 'CircleDot',

  // Multi-dot/dice icons
  'Dice1', 'Dice2', 'Dice3', 'Dice4', 'Dice5', 'Dice6',

  // Group/collection icons
  'Users', 'UserCheck', 'UserPlus', 'User',

  // Network/connection icons
  'Network', 'Wifi', 'Router', 'Server', 'Globe',

  // Shape icons
  'Square', 'Triangle', 'Hexagon', 'Octagon', 'Diamond',

  // Selection/choice icons
  'CheckSquare', 'CheckCircle', 'Check',

  // Organization icons
  'Folder', 'FolderOpen', 'Archive', 'Package', 'Box',

  // Security icons
  'Shield', 'ShieldCheck', 'Lock', 'Key', 'ShieldAlert',

  // Status icons
  'CheckCircle2', 'XCircle', 'AlertCircle', 'Info', 'AlertTriangle',

  // Basic shapes and symbols
  'Plus', 'Minus', 'X', 'Hash', 'AtSign',

  // Misc useful icons
  'Star', 'Heart', 'Bookmark', 'Tag', 'Flag', 'Target', 'Zap',
];

// Create CSS preview component for default option (shows both single and multi dots)
const DefaultPreview: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <div className="flex items-center gap-1" style={{ width: size * 2.5, height: size }}>
    {/* Single dot preview */}
    <div className="relative" style={{ width: size * 0.6, height: size * 0.6 }}>
      <div
        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-blue-600 rounded-full"
        style={{ width: size * 0.15, height: size * 0.15 }}
      ></div>
    </div>
    {/* Separator */}
    <div className="text-xs text-gray-400">|</div>
    {/* Multi dots preview */}
    <div className="relative" style={{ width: size * 0.6, height: size * 0.6 }}>
      <div
        className="absolute bg-blue-600 rounded-full"
        style={{
          top: size * 0.05,
          left: size * 0.05,
          width: size * 0.1,
          height: size * 0.1
        }}
      ></div>
      <div
        className="absolute bg-blue-600 rounded-full"
        style={{
          top: size * 0.05,
          right: size * 0.05,
          width: size * 0.1,
          height: size * 0.1
        }}
      ></div>
      <div
        className="absolute bg-blue-600 rounded-full"
        style={{
          bottom: size * 0.05,
          left: size * 0.05,
          width: size * 0.1,
          height: size * 0.1
        }}
      ></div>
      <div
        className="absolute bg-blue-600 rounded-full"
        style={{
          bottom: size * 0.05,
          right: size * 0.05,
          width: size * 0.1,
          height: size * 0.1
        }}
      ></div>
    </div>
  </div>
);

// Create the icon list by filtering existing icons and adding default option
const groupTypeIcons: { name: string; icon: LucideIcon | React.FC<{ size?: number }> }[] = groupTypeIconNames
  .map(name => {
    if (name === 'DEFAULT') {
      return { name, icon: DefaultPreview } as const;
    }

    const icon = (LucideIcons as Record<string, unknown>)[name] as LucideIcon | undefined;
    return icon ? ({ name, icon } as { name: string; icon: LucideIcon | React.FC<{ size?: number }> }) : null;
  })
  .filter((item): item is { name: string; icon: LucideIcon | React.FC<{ size?: number }> } => item !== null);

interface LucideIconPickerProps {
  selectedIcon: string;
  onIconSelect: (iconName: string) => void;
  triggerClassName?: string;
  customIcons?: { name: string; icon: LucideIcon }[];
  customLucideIcons?: string[]; // Array of custom Lucide icon names from global settings
}

export const LucideIconPicker: React.FC<LucideIconPickerProps> = ({
  selectedIcon,
  onIconSelect,
  triggerClassName,
  customIcons = [],
  customLucideIcons = []
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Combine default icons with custom icons and custom Lucide icons
  const allIcons = useMemo(() => {
    // Start with the curated group type icons
    const combinedIcons = [...groupTypeIcons];

    // Add custom icons (if any)
    combinedIcons.push(...customIcons);

    // Add custom Lucide icons from global settings
    customLucideIcons.forEach(iconName => {
      // Check if this icon name is already in the list
      const alreadyExists = combinedIcons.some(icon => icon.name === iconName);
      if (!alreadyExists) {
        // Try to get the Lucide icon
        const lucideIcon = (LucideIcons as Record<string, unknown>)[iconName] as LucideIcon;
        if (lucideIcon) {
          combinedIcons.push({ name: iconName, icon: lucideIcon });
        }
      }
    });

    return combinedIcons as { name: string; icon: LucideIcon | React.FC<{ size?: number }> }[];
  }, [customIcons, customLucideIcons]);

  // Filter icons based on search query
  const filteredIcons = useMemo(() => {
    if (!searchQuery.trim()) return allIcons;
    
    const query = searchQuery.toLowerCase();
    return allIcons.filter(icon => 
      icon.name.toLowerCase().includes(query)
    );
  }, [allIcons, searchQuery]);

  const handleIconSelect = useCallback((iconName: string) => {
    onIconSelect(iconName);
    setIsOpen(false);
    setSearchQuery('');
  }, [onIconSelect]);

  // Get the selected icon component with safety fallback
  const SelectedIconComponent = useMemo(() => {
    if (!selectedIcon) return LucideIcons.Circle;

    if (selectedIcon === 'DEFAULT') return DefaultPreview;

    const icon = (LucideIcons as Record<string, unknown>)[selectedIcon] as LucideIcon;
    return icon || LucideIcons.Circle;
  }, [selectedIcon]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "flex items-center justify-center",
            triggerClassName
          )}
        >
          <SelectedIconComponent size={16} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b">
          <Input
            placeholder="Search icons..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8"
          />
        </div>
        <ScrollArea className="h-64">
          <div className="grid grid-cols-6 gap-2 p-3">
            {filteredIcons.map((iconItem) => {
              const IconComponent = iconItem.icon;
              const isSelected = selectedIcon === iconItem.name;
              const displayName = iconItem.name === 'DEFAULT' ? 'Default' : iconItem.name;

              return (
                <Button
                  key={iconItem.name}
                  variant={isSelected ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-10 w-10 p-0 flex items-center justify-center",
                    isSelected && "bg-primary text-primary-foreground"
                  )}
                  onClick={() => handleIconSelect(iconItem.name)}
                  title={displayName}
                >
                  {iconItem.name === 'DEFAULT' ? (
                    <IconComponent size={16} />
                  ) : (
                    <IconComponent size={16} />
                  )}
                </Button>
              );
            })}
          </div>
          {filteredIcons.length === 0 && (
            <div className="p-4 text-center text-muted-foreground">
              No icons found matching &quot;{searchQuery}&quot;
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
