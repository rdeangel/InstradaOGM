'use client';

import React, { useCallback, useMemo, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { SortableTable } from "@/components/ui/sortable-table"; // Import SortableTable
import { ScrollArea } from '@/components/ui/scroll-area';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { Sparkles, Loader2, RefreshCcw, Info, Plus, XCircle, Save, AlertCircle } from 'lucide-react';
import { ClientOnly } from '@/components/util/ClientOnly';
import { useToast } from '@/hooks/use-toast';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CustomLucideIcon, CustomEmoji, CustomFlag } from '@/types/settings';
import { useIsMobile, useIsPhone } from '@/hooks/use-mobile';
import { PaginationControls } from "@/components/ui/pagination-controls";
import { AllLucideIconsPicker } from "@/components/ui/all-lucide-icons-picker";
import { AllEmojiPicker } from "@/components/ui/all-emoji-picker";
import { AllFlagPicker } from "@/components/ui/all-flag-picker";
import { generalEmojis, flags, curatedLucideIcons } from '@/components/ui/icon-picker';
import { cn } from '@/lib/utils';
import packageJson from '../../../../package.json';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';

interface CustomSymbolsTabProps {
  customLucideIcons: CustomLucideIcon[];
  setCustomLucideIcons: React.Dispatch<React.SetStateAction<CustomLucideIcon[]>>;
  customEmojis: CustomEmoji[];
  setCustomEmojis: React.Dispatch<React.SetStateAction<CustomEmoji[]>>;
  customFlags: CustomFlag[];
  setCustomFlags: React.Dispatch<React.SetStateAction<CustomFlag[]>>;
  newCustomIconName: string;
  setNewCustomIconName: React.Dispatch<React.SetStateAction<string>>;
  newCustomIconIdentifier: string;
  setNewCustomIconIdentifier: React.Dispatch<React.SetStateAction<string>>;
  newCustomIconType: 'lucide' | 'emoji' | 'flag';
  setNewCustomIconType: React.Dispatch<React.SetStateAction<'lucide' | 'emoji' | 'flag'>>;
  isSavingGlobalSettings: boolean;
  handleSaveGlobalSettings: () => Promise<void>;
  onSaveSuccess?: () => void; // Callback to reset initial state after successful save
  isRefreshing?: boolean;
  sortBy: string;
  sortDirection: 'asc' | 'desc';
  onSortChange: (newSortBy: string, newSortDirection: 'asc' | 'desc') => void;
  onRefresh?: () => void;
  // Add pagination props
  currentPage: number;
  pageSize: number | 'ALL';
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number | 'ALL') => void;
}

export function CustomSymbolsTab({
  customLucideIcons,
  setCustomLucideIcons,
  customEmojis,
  setCustomEmojis,
  customFlags,
  setCustomFlags,
  newCustomIconName,
  setNewCustomIconName,
  newCustomIconIdentifier,
  setNewCustomIconIdentifier,
  newCustomIconType,
  setNewCustomIconType,
  isSavingGlobalSettings,
  handleSaveGlobalSettings,
  onSaveSuccess,
  isRefreshing = false,
  sortBy,
  sortDirection,
  onSortChange,
  onRefresh,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: CustomSymbolsTabProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const isPhone = useIsPhone();
  const [isCustomIconInfoDialogOpen, setIsCustomIconInfoDialogOpen] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isButtonRefreshing, setIsButtonRefreshing] = useState(false);

  // Track initial state for unsaved changes detection
  const [initialCustomLucideIcons, setInitialCustomLucideIcons] = useState<CustomLucideIcon[]>([]);
  const [initialCustomEmojis, setInitialCustomEmojis] = useState<CustomEmoji[]>([]);
  const [initialCustomFlags, setInitialCustomFlags] = useState<CustomFlag[]>([]);

  // Track initial state when data first loads (including empty arrays)
  const [hasInitialized, setHasInitialized] = useState(false);
  const [prevIsRefreshing, setPrevIsRefreshing] = useState(false);
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);

  useEffect(() => {
    if (!hasInitialized) {
      setInitialCustomLucideIcons([...customLucideIcons]);
      setInitialCustomEmojis([...customEmojis]);
      setInitialCustomFlags([...customFlags]);
      setHasInitialized(true);
    }
  }, [customLucideIcons, customEmojis, customFlags, hasInitialized]);

  // Reset initial state when refresh completes (isRefreshing transitions from true to false)
  useEffect(() => {
    if (prevIsRefreshing && !isRefreshing) {
      // Refresh just completed, update initial state to the fresh data
      setInitialCustomLucideIcons([...customLucideIcons]);
      setInitialCustomEmojis([...customEmojis]);
      setInitialCustomFlags([...customFlags]);
      // Mark that initial load is complete - change detection can now run
      if (!hasCompletedInitialLoad) {
        setHasCompletedInitialLoad(true);
      }
    }
    setPrevIsRefreshing(isRefreshing);
  }, [isRefreshing, prevIsRefreshing, customLucideIcons, customEmojis, customFlags, hasCompletedInitialLoad]);

  // Check if there are unsaved changes in any of the three arrays
  // Suppress change detection while data is refreshing
  const hasUnsavedLucideChangesRaw = useUnsavedChanges(customLucideIcons, initialCustomLucideIcons);
  const hasUnsavedEmojiChangesRaw = useUnsavedChanges(customEmojis, initialCustomEmojis);
  const hasUnsavedFlagChangesRaw = useUnsavedChanges(customFlags, initialCustomFlags);
  const hasUnsavedChangesRaw = hasUnsavedLucideChangesRaw || hasUnsavedEmojiChangesRaw || hasUnsavedFlagChangesRaw;

  // Suppress change detection until initial load completes AND while refreshing
  // This prevents false positives during the initial data load
  const hasUnsavedChanges = (!hasCompletedInitialLoad || isRefreshing) ? false : hasUnsavedChangesRaw;

  // Show toast notification when unsaved changes are first detected (but not during initial load)
  const [hasShownUnsavedToast, setHasShownUnsavedToast] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Track when initial loading is complete
  useEffect(() => {
    if (hasInitialized) {
      // Add a small delay to ensure all initial state comparisons are complete
      const timer = setTimeout(() => {
        setIsInitialLoad(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [hasInitialized]);

  useEffect(() => {
    if (hasUnsavedChanges && !hasShownUnsavedToast && hasInitialized && !isInitialLoad) {
      toast({
        title: "You have unsaved changes",
        description: "Click Save to persist your changes.",
        variant: "default"
      });
      setHasShownUnsavedToast(true);
    } else if (!hasUnsavedChanges) {
      setHasShownUnsavedToast(false);
    }
  }, [hasUnsavedChanges, hasShownUnsavedToast, hasInitialized, isInitialLoad, toast]);

  // Wrapper function to handle save and reset initial state
  const handleSaveWithReset = useCallback(async () => {
    await handleSaveGlobalSettings();
    // Reset initial state to current state after successful save
    setInitialCustomLucideIcons([...customLucideIcons]);
    setInitialCustomEmojis([...customEmojis]);
    setInitialCustomFlags([...customFlags]);
    onSaveSuccess?.();
  }, [handleSaveGlobalSettings, customLucideIcons, customEmojis, customFlags, onSaveSuccess]);

  // Combine all custom symbols for pagination
  const allCustomSymbols = useMemo(() => {
    const lucideSymbols = customLucideIcons.map((icon, index) => ({
      ...icon,
      type: 'lucide' as const,
      displayName: icon.name,
      identifier: icon.icon.displayName || icon.icon.name,
      originalIndex: index
    }));

    const emojiSymbols = customEmojis.map((emoji, index) => ({
      ...emoji,
      type: 'emoji' as const,
      displayName: emoji.name,
      identifier: emoji.value,
      originalIndex: index
    }));

    const flagSymbols = customFlags.map((flag, index) => ({
      ...flag,
      type: 'flag' as const,
      displayName: flag.name,
      identifier: flag.value,
      originalIndex: index
    }));

    return [...lucideSymbols, ...emojiSymbols, ...flagSymbols];
  }, [customLucideIcons, customEmojis, customFlags]);

  // Pagination logic
  const totalItems = allCustomSymbols.length;
  const totalPages = pageSize === 'ALL' ? 1 : Math.ceil(totalItems / pageSize);

  const paginatedSymbols = useMemo(() => {
    if (pageSize === 'ALL') {
      return allCustomSymbols;
    }

    if (isPhone) {
      return allCustomSymbols.slice(0, currentPage * pageSize);
    }

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return allCustomSymbols.slice(startIndex, endIndex);
  }, [allCustomSymbols, currentPage, pageSize, isPhone]);

  // Reset to first page when data length changes or when current page is greater than total pages
  useEffect(() => {
    if (totalPages === 0 && currentPage !== 1) {
      onPageChange(1);
    } else if (currentPage > totalPages && totalPages > 0) {
      onPageChange(1);
    }
  }, [allCustomSymbols.length, currentPage, totalPages, onPageChange]);



  const handleAddCustomIconFromDialog = useCallback(async () => {
    setIsAdding(true);
    try {
      if (!newCustomIconName.trim() || !newCustomIconIdentifier.trim()) {
        toast({ title: "Validation Error", description: "Name and Identifier cannot be empty.", variant: "destructive" });
        return;
      }

      if (newCustomIconType === 'lucide') {
        const IconComponent = LucideIcons[newCustomIconIdentifier as keyof typeof LucideIcons] as LucideIcon;
        if (!IconComponent) {
          toast({ title: "Validation Error", description: `Lucide icon "${newCustomIconIdentifier}" not found. Please check the name.`, variant: "destructive" });
          return;
        }
        setCustomLucideIcons([...customLucideIcons, { name: newCustomIconName.trim(), icon: IconComponent }]);
      } else if (newCustomIconType === 'emoji') {
        setCustomEmojis([...customEmojis, { name: newCustomIconName.trim(), value: newCustomIconIdentifier.trim() }]);
      } else if (newCustomIconType === 'flag') {
        setCustomFlags([...customFlags, { name: newCustomIconName.trim(), value: newCustomIconIdentifier.trim() }]);
      }

      setNewCustomIconName('');
      setNewCustomIconIdentifier('');
      setIsAddDialogOpen(false); // Close dialog
    } finally {
      setIsAdding(false);
    }
  }, [newCustomIconName, newCustomIconIdentifier, newCustomIconType, customLucideIcons, customEmojis, customFlags, setCustomLucideIcons, setCustomEmojis, setCustomFlags, setNewCustomIconName, setNewCustomIconIdentifier, toast]);

  const handleDeleteCustomIcon = useCallback((type: 'lucide' | 'emoji' | 'flag', index: number) => {
    if (type === 'lucide') {
      setCustomLucideIcons(customLucideIcons.filter((_item, i) => i !== index));
    } else if (type === 'emoji') {
      setCustomEmojis(customEmojis.filter((_item, i) => i !== index));
    } else if (type === 'flag') {
      setCustomFlags(customFlags.filter((_item, i) => i !== index));
    }
  }, [customLucideIcons, customEmojis, customFlags, setCustomLucideIcons, setCustomEmojis, setCustomFlags]);

  return (
    <>
      <Card className="flex flex-col flex-1 mb-0 min-h-0">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center text-xl md:text-2xl">
              <ClientOnly><Sparkles size={28} className="mr-2 text-primary" /></ClientOnly> Custom Symbols
              <ClientOnly>
                <Info
                  size={20}
                  className="ml-2 text-muted-foreground cursor-pointer hover:text-primary"
                  onClick={() => setIsCustomIconInfoDialogOpen(true)}
                />
              </ClientOnly>
            </CardTitle>
            <CardDescription className="hidden md:block">
              Manage custom Lucide icons, emojis, and flags for network groups.
            </CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center">
            {hasUnsavedChanges && (
              <div className="flex items-center gap-2 text-orange-600 text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>You have unsaved changes</span>
              </div>
            )}
            <div className="flex w-full justify-end md:w-auto gap-2">
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button size={isMobile ? "icon" : "default"}>
                    <Plus className={cn("h-4 w-4", !isMobile && "mr-2")} />
                    {!isMobile && "Add Symbol"}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add Custom Symbol</DialogTitle>
                    <DialogDescription>
                      Add a new custom Lucide icon, emoji, or flag for network groups.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    {/* Name Input */}
                    <div>
                      <label htmlFor="symbolName" className="block text-sm font-medium text-muted-foreground mb-1">Name</label>
                      <Input
                        id="symbolName"
                        type="text"
                        placeholder="Name (e.g., 'My Custom Icon', 'Party Popper')"
                        value={newCustomIconName}
                        onChange={(e) => setNewCustomIconName(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Display name for the custom symbol.
                      </p>
                    </div>

                    {/* Identifier Input */}
                    <div>
                      <label htmlFor="symbolIdentifier" className="block text-sm font-medium text-muted-foreground mb-1">Identifier</label>
                      <Input
                        id="symbolIdentifier"
                        type="text"
                        placeholder="Identifier (e.g., 'Zap', '🎉', '🇺🇸')"
                        value={newCustomIconIdentifier}
                        onChange={(e) => setNewCustomIconIdentifier(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {newCustomIconType === 'lucide' && 'Lucide icon name (e.g., Zap, Heart, Star)'}
                        {newCustomIconType === 'emoji' && 'Emoji character (e.g., 🎉, 🚀, ⭐)'}
                        {newCustomIconType === 'flag' && 'Flag emoji (e.g., 🇺🇸, 🇬🇧, 🇫🇷)'}
                      </p>
                    </div>

                    {/* Lucide Icon Picker (only visible when type is lucide) */}
                    {newCustomIconType === 'lucide' && (
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Search Icon</label>
                        <AllLucideIconsPicker
                          selectedIcon={newCustomIconIdentifier}
                          disabledValues={[
                            ...customLucideIcons.map(i => i.icon.displayName || (i.icon as { name?: string }).name || ''),
                            ...curatedLucideIcons.map(i => i.name)
                          ]}
                          onIconSelect={(iconName) => {
                            setNewCustomIconIdentifier(iconName);
                            // Auto-fill name if it's empty or looks like a previous auto-fill
                            if (!newCustomIconName || newCustomIconName === newCustomIconIdentifier) {
                              setNewCustomIconName(iconName);
                            }
                          }}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Search and select a Lucide icon to populate the Identifier field.
                        </p>
                      </div>
                    )}

                    {/* Emoji Picker (only visible when type is emoji) */}
                    {newCustomIconType === 'emoji' && (
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Search Emoji</label>
                        <AllEmojiPicker
                          selectedEmoji={newCustomIconIdentifier}
                          disabledValues={[
                            ...customEmojis.map(e => e.value),
                            ...generalEmojis.map(e => e.value)
                          ]}
                          onEmojiSelect={(emojiValue, emojiName) => {
                            setNewCustomIconIdentifier(emojiValue);
                            // Auto-fill name if it's empty
                            if (!newCustomIconName && emojiName) {
                              setNewCustomIconName(emojiName);
                            }
                          }}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Search and select an emoji to populate the Identifier field.
                        </p>
                      </div>
                    )}

                    {/* Flag Picker (only visible when type is flag) */}
                    {newCustomIconType === 'flag' && (
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Search Flag</label>
                        <AllFlagPicker
                          selectedFlag={newCustomIconIdentifier}
                          disabledValues={[
                            ...customFlags.map(f => f.value),
                            ...flags.map(f => f.value)
                          ]}
                          onFlagSelect={(flagValue, flagName) => {
                            setNewCustomIconIdentifier(flagValue);
                            // Auto-fill name if it's empty
                            if (!newCustomIconName && flagName) {
                              setNewCustomIconName(flagName);
                            }
                          }}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Search and select a flag to populate the Identifier field.
                        </p>
                      </div>
                    )}

                    {/* Type Select */}
                    <div>
                      <label htmlFor="symbolType" className="block text-sm font-medium text-muted-foreground mb-1">Type</label>
                      <select
                        id="symbolType"
                        value={newCustomIconType}
                        onChange={(e) => setNewCustomIconType(e.target.value as 'lucide' | 'emoji' | 'flag')}
                        className="block w-full p-2 border border-input bg-background rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm h-10"
                      >
                        <option value="lucide">Lucide Icon</option>
                        <option value="emoji">Emoji</option>
                        <option value="flag">Flag</option>
                      </select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Choose the type of symbol to add.
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleAddCustomIconFromDialog} disabled={isAdding}>
                      {isAdding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                      Add Symbol
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              {onRefresh && (
                <Button variant="outline" onClick={onRefresh} disabled={isRefreshing} size={isMobile ? "icon" : "default"}>
                  <ClientOnly>
                    {isRefreshing ? (
                      <Loader2 className={cn("h-4 w-4 animate-spin", !isMobile && "mr-2")} />
                    ) : (
                      <RefreshCcw className={cn("h-4 w-4", !isMobile && "mr-2")} />
                    )}
                  </ClientOnly>
                  {!isMobile && "Refresh"}
                </Button>
              )}
              <Button
                onClick={handleSaveWithReset}
                disabled={isSavingGlobalSettings || !hasUnsavedChanges}
                size={isMobile ? "icon" : "default"}
                variant={hasUnsavedChanges ? "default" : "outline"}
                className={cn(
                  hasUnsavedChanges ? "bg-orange-600 hover:bg-orange-700" : "",
                  !isMobile && "min-w-[120px]" // Fixed width to prevent layout shifts
                )}
              >
                {isSavingGlobalSettings ? <Loader2 className={cn("h-4 w-4 animate-spin", !isMobile && "mr-2")} /> : <Save className={cn("h-4 w-4", !isMobile && "mr-2")} />}
                {!isMobile && (hasUnsavedChanges ? "Save Changes" : "Save Settings")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-2 md:p-6 pb-8 md:pb-6 relative flex flex-col flex-1 overflow-hidden">
          <h3 className="text-lg font-semibold mb-4">Current Custom Icons/Emojis</h3>

          {(customLucideIcons.length === 0 && customEmojis.length === 0 && customFlags.length === 0) ? (
            <p className="text-muted-foreground">No custom icons or emojis defined yet.</p>
          ) : (
            <>
              {isMobile ? (
                // Mobile View: Render as Cards with ScrollArea
                <ScrollArea className="flex-1 min-h-0 pr-4">
                  <div className="space-y-4">
                    {paginatedSymbols.map((item, index) => (
                      <Card key={index} className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Name</p>
                            <p className="text-base font-semibold">{item.displayName}</p>
                          </div>
                          <Button
                            variant="destructive"
                            size={isMobile ? "icon" : "sm"}
                            onClick={() => {
                              if (item.type === 'lucide') handleDeleteCustomIcon('lucide', item.originalIndex);
                              else if (item.type === 'emoji') handleDeleteCustomIcon('emoji', item.originalIndex);
                              else if (item.type === 'flag') handleDeleteCustomIcon('flag', item.originalIndex);
                            }}
                          >
                            <XCircle className={cn("h-4 w-4", !isMobile && "mr-2")} />
                            {!isMobile && "Delete"}
                          </Button>
                        </div>
                        <div className="mt-2">
                          <p className="text-sm font-medium text-muted-foreground">Identifier</p>
                          <p className="text-base">{item.identifier}</p>
                        </div>
                        <div className="mt-2">
                          <p className="text-sm font-medium text-muted-foreground">Type</p>
                          <p className="text-base">{item.type}</p>
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                // Desktop View: Render as Table with ScrollArea
                <ScrollArea className="flex-1 min-h-0 w-full">
                  <SortableTable<({ name: string; identifier: string; type: string; originalIndex: number; }) >
                    data={paginatedSymbols}
                    columns={[
                      {
                        key: 'name',
                        label: 'Name',
                        sortable: true,
                        headerClassName: "w-[30%]",
                      },
                      {
                        key: 'identifier',
                        label: 'Identifier',
                        sortable: true,
                        headerClassName: "w-[30%]",
                      },
                      {
                        key: 'type',
                        label: 'Type',
                        sortable: true,
                        headerClassName: "w-[20%]",
                      },
                      {
                        key: 'actions',
                        label: 'Actions',
                        sortable: false,
                        headerClassName: "w-[20%] text-right",
                        render: (item) => (
                          <div className="text-right">
                            <Button
                              variant="destructive"
                              size={isMobile ? "icon" : "sm"}
                              onClick={() => {
                                if (item.type === 'lucide') handleDeleteCustomIcon('lucide', item.originalIndex);
                                else if (item.type === 'emoji') handleDeleteCustomIcon('emoji', item.originalIndex);
                                else if (item.type === 'flag') handleDeleteCustomIcon('flag', item.originalIndex);
                              }}
                            >
                              <XCircle className={cn("h-4 w-4", !isMobile && "mr-2")} />
                              {!isMobile && "Delete"}
                            </Button>
                          </div>
                        ),
                      },
                    ]}
                    sortBy={sortBy}
                    sortDirection={sortDirection}
                    onSortChange={onSortChange}
                  />
                </ScrollArea>
              )}
            </>
          )}
          {/* Pagination Controls */}
          {allCustomSymbols.length > 0 && (
            <div className="mt-4 px-2">
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                totalCount={totalItems}
                filteredCount={totalItems}
                pageSize={pageSize}
                onPageChange={async (page) => {
                  setIsButtonRefreshing(true);
                  await new Promise(resolve => setTimeout(resolve, 500));
                  onPageChange(page);
                  setIsButtonRefreshing(false);
                }}
                onPageSizeChange={onPageSizeChange}
                isLoadMoreMode={isPhone}
                isLoading={isRefreshing || isButtonRefreshing}
                pageSizeOptions={[5, 10, 50, 100, 500]}
                showAllOption={true}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Custom Icon Info Dialog */}
      <Dialog open={isCustomIconInfoDialogOpen} onOpenChange={setIsCustomIconInfoDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>How to Add Custom Icons and Emojis</DialogTitle>
            <DialogDescription>
              Here&apos;s how to define custom icons, emojis, and flags for use in group mappings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4 text-sm">
            {isMobile ? (
              // Mobile version - more concise
              <div className="space-y-3">
                <div>
                  <strong>Lucide Icons:</strong> Enter exact React component name (e.g., &quot;Server&quot;, &quot;ChevronDown&quot;).
                  <br />
                  <span className="text-xs text-muted-foreground">You can also search and select icons directly from the &quot;Add Symbol&quot; dialog when &quot;Lucide Icon&quot; is selected.</span>
                  <br />
                  <br />
                  <span className="text-xs text-muted-foreground">Using lucide-react v{packageJson.dependencies['lucide-react']?.replace('^', '')} - most icons available</span>
                  <br />
                  <Link href="https://lucide.dev/icons/" target="_blank" rel="noopener noreferrer" className="underline text-primary">Browse icons →</Link>
                  <br />
                  <button
                    onClick={async () => {
                      const availableIcons = Object.keys(LucideIcons).filter(key => key !== 'default' && !key.endsWith('Icon')).sort();
                      const { getClipboardErrorDescription } = await import('@/lib/clipboard-utils');
                      navigator.clipboard.writeText(availableIcons.join('\n')).then(() => {
                        toast({ title: "Icons List Copied", description: "Available icon names copied to clipboard", variant: "default" });
                      }).catch(() => {
                        toast({ title: "Copy Failed", description: getClipboardErrorDescription(), variant: "destructive" });
                      });
                    }}
                    className="text-xs underline text-primary hover:text-primary/80"
                  >
                    Copy available icons list
                  </button>
                </div>
                <div>
                  <strong>Emojis:</strong> Copy/paste emoji directly (e.g., 🎉, 🚀, 💡).
                  <br />
                  <Link href="https://www.alt-codes.net" target="_blank" rel="noopener noreferrer" className="underline text-primary">Find emojis →</Link>
                </div>
                <div>
                  <strong>Flag Emojis:</strong> Copy/paste flag emoji (e.g., 🇺🇸, 🇬🇧, 🇨🇦).
                  <br />
                  <span className="text-xs text-muted-foreground text-yellow-600 dark:text-yellow-500">Note: Flag emojis may not render correctly on Chromium-based browsers (Chrome, Edge) on Windows/Linux.</span>
                  <br />
                  <Link href="https://www.alt-codes.net/flags" target="_blank" rel="noopener noreferrer" className="underline text-primary">Find flags →</Link>
                </div>
                <p className="text-xs text-muted-foreground mt-3">Remember to click &quot;Save Settings&quot; to persist changes.</p>
              </div>
            ) : (
              // Desktop version - detailed
              <div className="text-muted-foreground">
                <p>You can define three types of custom visual identifiers:</p>
                <ul className="list-disc list-inside space-y-2 mt-2">
                  <li>
                    <strong>Lucide Icons:</strong> Vector icons from the Lucide library (v{packageJson.dependencies['lucide-react']?.replace('^', '')}).
                    <br />
                    Enter a name and the exact React component name (e.g., &quot;Server&quot;, &quot;ChevronDown&quot;, &quot;ArrowDown&quot;).
                    <br />
                    <span className="text-sm text-muted-foreground">Tip: You can search and select icons directly from the &quot;Add Symbol&quot; dialog when &quot;Lucide Icon&quot; is selected.</span>
                    <br />
                    <br />
                    <Link href="https://lucide.dev/icons/" target="_blank" rel="noopener noreferrer" className="underline text-primary">Browse available icons</Link> or
                    <button
                      onClick={async () => {
                        const availableIcons = Object.keys(LucideIcons).filter(key => key !== 'default' && !key.endsWith('Icon')).sort();
                        const { getClipboardErrorDescription } = await import('@/lib/clipboard-utils');
                        navigator.clipboard.writeText(availableIcons.join('\n')).then(() => {
                          toast({ title: "Icons List Copied", description: "Available icon names copied to clipboard", variant: "default" });
                        }).catch(() => {
                          toast({ title: "Copy Failed", description: getClipboardErrorDescription(), variant: "destructive" });
                        });
                      }}
                      className="underline text-primary hover:text-primary/80 ml-1"
                    >
                      copy available icons
                    </button>.
                  </li>
                  <li>
                    <strong>Emojis:</strong> Standard Unicode emojis.
                    <br />
                    Enter a name and copy/paste the emoji (e.g., 🎉, 🚀, 💡).
                    <Link href="https://www.alt-codes.net" target="_blank" rel="noopener noreferrer" className="underline text-primary">Find emojis</Link>.
                  </li>
                  <li>
                    <strong>Flag Emojis:</strong> Regional indicator symbol emojis.
                    <br />
                    Enter a name and copy/paste the flag emoji (e.g., 🇺🇸, 🇬🇧, 🇨🇦, 🇯🇵).
                    <br />
                    <span className="text-xs text-muted-foreground text-yellow-600 dark:text-yellow-500">Note: Flag emojis may not render correctly on Chromium-based browsers (Chrome, Edge) on Windows/Linux.</span>
                    <br />
                    <Link href="https://www.alt-codes.net/flags" target="_blank" rel="noopener noreferrer" className="underline text-primary">Find flag emojis</Link>.
                  </li>
                </ul>
                <p className="mt-3">Remember to click &quot;Save Settings&quot; after making changes.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsCustomIconInfoDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}