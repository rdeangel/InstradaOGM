'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NetworkGroup } from '@/types/opnsense';

interface GroupComboboxProps {
  groups: NetworkGroup[];
  value: string | null | undefined;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  /** Group UUIDs the selected host aliases are currently assigned to */
  assignedGroupUuids?: Set<string>;
  /** How to filter based on current assignment */
  filterMode?: 'exclude-assigned' | 'only-assigned' | 'none';
  /** Additional UUIDs to always exclude (e.g. the "from" group when picking "to") */
  excludeUuids?: string[];
  className?: string;
  disabled?: boolean;
}

export function GroupCombobox({
  groups,
  value,
  onValueChange,
  placeholder = 'Select group…',
  assignedGroupUuids,
  filterMode = 'none',
  excludeUuids = [],
  className,
  disabled,
}: GroupComboboxProps) {
  const [open, setOpen] = useState(false);

  const filteredGroups = useMemo(() => {
    return groups.filter(g => {
      if (excludeUuids.includes(g.uuid)) return false;
      if (filterMode === 'exclude-assigned' && assignedGroupUuids?.has(g.uuid)) return false;
      if (filterMode === 'only-assigned' && assignedGroupUuids && !assignedGroupUuids.has(g.uuid)) return false;
      return true;
    });
  }, [groups, filterMode, assignedGroupUuids, excludeUuids]);

  const selectedLabel = useMemo(
    () => groups.find(g => g.uuid === value)?.friendlyName ?? groups.find(g => g.uuid === value)?.name,
    [groups, value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-8 justify-between font-normal text-sm',
            !selectedLabel && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">{selectedLabel ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search groups…" className="h-8" />
          <CommandList>
            <CommandEmpty>No groups found.</CommandEmpty>
            <CommandGroup>
              {filteredGroups.map(g => (
                <CommandItem
                  key={g.uuid}
                  value={g.friendlyName ?? g.name}
                  onSelect={() => {
                    onValueChange(g.uuid === value ? null : g.uuid);
                    setOpen(false);
                  }}
                  disabled={!g.enabled}
                  className={cn(!g.enabled && 'opacity-50')}
                >
                  <Check
                    className={cn(
                      'mr-2 h-3.5 w-3.5',
                      value === g.uuid ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="flex-1 truncate">{g.friendlyName ?? g.name}</span>
                  {!g.enabled && (
                    <span className="ml-1 text-xs text-muted-foreground">(disabled)</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
