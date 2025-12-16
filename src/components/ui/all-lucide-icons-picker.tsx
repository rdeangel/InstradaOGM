
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

interface AllLucideIconsPickerProps {
    onIconSelect: (iconName: string) => void;
    selectedIcon?: string;
    disabledValues?: string[];
}

export function AllLucideIconsPicker({
    onIconSelect,
    selectedIcon,
    disabledValues = [],
}: AllLucideIconsPickerProps) {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Get all valid Lucide icon names
    const allIconNames = useMemo(() => {
        return Object.keys(LucideIcons)
            .filter((key) => key !== 'default' && !key.endsWith('Icon'))
            .sort();
    }, []);

    // Filter icons based on search query and limit results for performance
    const [displayLimit, setDisplayLimit] = useState(50);

    // Filter icons based on search query
    const filteredIcons = useMemo(() => {
        if (!searchQuery) return allIconNames;
        return allIconNames.filter((name) =>
            name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [allIconNames, searchQuery]);

    // Slice for display
    const displayedIcons = useMemo(() => {
        return filteredIcons.slice(0, displayLimit);
    }, [filteredIcons, displayLimit]);

    // Reset limit when search changes
    React.useEffect(() => {
        setDisplayLimit(50);
    }, [searchQuery]);

    const handleSelect = useCallback((currentValue: string) => {
        onIconSelect(currentValue);
        setOpen(false);
    }, [onIconSelect]);

    // Safe access to icons to prevent object injection and type errors
    const iconList = LucideIcons as unknown as Record<string, LucideIcon>;
    const SelectedIconComponent = selectedIcon && Object.prototype.hasOwnProperty.call(iconList, selectedIcon)
        ? iconList[selectedIcon] // eslint-disable-line security/detect-object-injection
        : null;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between"
                >
                    {selectedIcon ? (
                        <span className="flex items-center gap-2">
                            {SelectedIconComponent && <SelectedIconComponent className="h-4 w-4" />}
                            {selectedIcon}
                        </span>
                    ) : (
                        <span className="flex items-center gap-2 text-muted-foreground">
                            <Search className="h-4 w-4" />
                            Search icons...
                        </span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <input
                        className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="Search icon name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div
                    className="max-h-[300px] overflow-hidden"
                    onWheel={(e) => e.stopPropagation()}
                >
                    <ScrollArea className="h-[300px]">
                        {filteredIcons.length === 0 ? (
                            <div className="py-6 text-center text-sm">No icon found.</div>
                        ) : (
                            <div className="overflow-hidden p-1 text-foreground">
                                {displayedIcons.map((iconName) => {
                                    const Icon = iconList[iconName]; // eslint-disable-line security/detect-object-injection
                                    const isSelected = selectedIcon === iconName;
                                    const isDisabled = disabledValues.includes(iconName);
                                    return (
                                        <div
                                            key={iconName}
                                            className={cn(
                                                "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none",
                                                isSelected && "bg-accent text-accent-foreground",
                                                isDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-accent hover:text-accent-foreground cursor-pointer"
                                            )}
                                            onClick={() => !isDisabled && handleSelect(iconName)}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    isSelected ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            <div className="flex items-center gap-2">
                                                <Icon className="h-4 w-4" />
                                                <span>
                                                    {iconName}
                                                    {isDisabled && " (Already added)"}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                                {displayedIcons.length < filteredIcons.length && (
                                    <div
                                        className="relative flex cursor-pointer select-none items-center justify-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground text-muted-foreground font-medium"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setDisplayLimit(prev => prev + 50);
                                        }}
                                    >
                                        Load more...
                                    </div>
                                )}
                            </div>
                        )}
                    </ScrollArea>
                </div>
            </PopoverContent>
        </Popover>
    );
}
