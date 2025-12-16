'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import emojiDataRaw from '@/data/emojis.json';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

interface EmojiEntry {
    emoji: string;
    description: string;
    category: string;
    aliases: string[];
    tags: string[];
}

const emojiData = emojiDataRaw as EmojiEntry[];
const nonFlagEmojis = emojiData.filter(e => e.category !== 'Flags');

interface AllEmojiPickerProps {
    onEmojiSelect: (emojiValue: string, emojiName?: string) => void;
    selectedEmoji?: string;
    disabledValues?: string[];
}

export function AllEmojiPicker({
    onEmojiSelect,
    selectedEmoji,
    disabledValues = [],
}: AllEmojiPickerProps) {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Filter emojis based on search query and limit results for performance
    const [displayLimit, setDisplayLimit] = useState(50);

    // Filter emojis based on search query
    const filteredEmojis = useMemo(() => {
        if (!searchQuery) return nonFlagEmojis;
        const lowerCaseQuery = searchQuery.toLowerCase();
        return nonFlagEmojis.filter((item) =>
            item.description.toLowerCase().includes(lowerCaseQuery) ||
            item.aliases.some(alias => alias.toLowerCase().includes(lowerCaseQuery)) ||
            item.tags.some(tag => tag.toLowerCase().includes(lowerCaseQuery)) ||
            item.emoji.includes(lowerCaseQuery)
        );
    }, [searchQuery]);

    // Slice for display
    const displayedEmojis = useMemo(() => {
        return filteredEmojis.slice(0, displayLimit);
    }, [filteredEmojis, displayLimit]);

    // Reset limit when search changes
    React.useEffect(() => {
        setDisplayLimit(50);
    }, [searchQuery]);

    const handleSelect = useCallback((value: string, name: string) => {
        onEmojiSelect(value, name);
        setOpen(false);
    }, [onEmojiSelect]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between"
                >
                    {selectedEmoji ? (
                        <span className="flex items-center gap-2">
                            <span className="text-lg leading-none">{selectedEmoji}</span>
                            <span className="truncate text-muted-foreground text-xs">
                                {emojiData.find(e => e.emoji === selectedEmoji)?.description || selectedEmoji}
                            </span>
                        </span>
                    ) : (
                        <span className="flex items-center gap-2 text-muted-foreground">
                            <Search className="h-4 w-4" />
                            Search emojis...
                        </span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <div className="flex items-center border-b px-3">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <input
                        className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="Search emoji name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div
                    className="max-h-[300px] overflow-hidden"
                    onWheel={(e) => e.stopPropagation()}
                >
                    <ScrollArea className="h-[300px]">
                        {filteredEmojis.length === 0 ? (
                            <div className="py-6 text-center text-sm">No emoji found.</div>
                        ) : (
                            <div className="overflow-hidden p-1 text-foreground">
                                {displayedEmojis.map((item, index) => {
                                    const isSelected = selectedEmoji === item.emoji;
                                    const isDisabled = disabledValues.includes(item.emoji);
                                    return (
                                        <div
                                            key={`${item.emoji}-${index}`}
                                            className={cn(
                                                "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none",
                                                isSelected && "bg-accent text-accent-foreground",
                                                isDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-accent hover:text-accent-foreground cursor-pointer"
                                            )}
                                            onClick={() => !isDisabled && handleSelect(item.emoji, item.description)}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    isSelected ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <span className="text-lg leading-none w-6 text-center flex-shrink-0">{item.emoji}</span>
                                                <span className="truncate" title={item.description}>
                                                    {item.description}
                                                    {isDisabled && " (Already added)"}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                                {displayedEmojis.length < filteredEmojis.length && (
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
