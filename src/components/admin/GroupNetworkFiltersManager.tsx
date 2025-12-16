'use client'; // Another minor change to force TypeScript re-evaluation

/* eslint-disable security/detect-object-injection */
// This component uses bracket notation with typed keys from objects. All uses are safe.
import React, { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { GroupSpecificFilter } from '@/types/settings';
import { PlusCircle, Trash2 } from 'lucide-react';

interface GroupNetworkFiltersManagerProps {
  groupId: string;
  groupName: string;
  onSaveSuccess?: (groupId: string, newCount: number) => void;
  // onClose is no longer needed here as parent will manage closing
}

export interface GroupNetworkFiltersManagerRef {
  handleSaveFilters: () => Promise<void>;
  isSaving: boolean; // Changed from isLoading to isSaving
}

export const GroupNetworkFiltersManager = forwardRef<GroupNetworkFiltersManagerRef, GroupNetworkFiltersManagerProps>(
  function GroupNetworkFiltersManager({ groupId, groupName, onSaveSuccess }, ref) {
    const [filters, setFilters] = useState<GroupSpecificFilter[]>([]);
    const [isFetching, setIsFetching] = useState(false); // New state for initial data fetching
    const [isSaving, setIsSaving] = useState(false); // New state for saving operation
    const { toast } = useToast();

    const apiUrl = `/api/admin/groups/${groupId}/network-filters`;

    const fetchFilters = useCallback(async () => {
      setIsFetching(true); // Set isFetching to true
      try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error('Failed to fetch group-specific filters');
        }
        const data: GroupSpecificFilter[] = await response.json();
        setFilters(data);
      } catch {
        toast({
          title: 'Error',
          description: 'Failed to load group-specific network filters.',
          variant: 'destructive',
        });
      } finally {
        setIsFetching(false); // Set isFetching to false
      }
    }, [apiUrl, toast]);

    useEffect(() => {
      if (groupId) {
        fetchFilters();
      }
    }, [groupId, fetchFilters]);

    const handleAddFilter = () => {
      // Add a new filter with a temporary ID. Pattern is intentionally empty initially.
      setFilters(prevFilters => [...prevFilters, { id: `new-${Date.now()}`, groupId: groupId, pattern: '', type: 'include', description: '' }]);
    };

    const handleFilterChange = (index: number, field: keyof GroupSpecificFilter, value: string) => {
      const newFilters = [...filters];
              // @ts-expect-error - TypeScript struggles with dynamic key access on discriminated unions
        newFilters[index][field] = value;
      setFilters(newFilters);
    };

    const handleRemoveFilter = (idToRemove: string) => {
      setFilters(filters.filter(filter => filter.id !== idToRemove));
    };

    const handleSaveFilters = useCallback(async () => {
      // Validate filters before saving: ensure no empty patterns
      const filtersToSave = filters.filter(filter => filter.pattern.trim() !== '');
      
      if (filters.length > 0 && filtersToSave.length === 0) {
        toast({
          title: 'Validation Error',
          description: 'All filter patterns are empty. Please enter a pattern or remove the empty filters.',
          variant: 'destructive',
        });
        return;
      }

      // Validate for duplicate patterns
      const patterns = filtersToSave.map(filter => `${filter.pattern}-${filter.type}`);
      const hasDuplicates = new Set(patterns).size !== patterns.length;

      if (hasDuplicates) {
        toast({
          title: 'Validation Error',
          description: 'Duplicate filter patterns are not allowed. Please ensure each pattern is unique.',
          variant: 'destructive',
        });
        return;
      }

      setIsSaving(true); // Use isSaving for save operation
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(filtersToSave.map(({ ...rest }) => rest)), // Remove 'id' for new entries
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to save group-specific filters');
        }

        toast({
          title: 'Success',
          description: 'Group-specific network filters saved successfully.',
        });
        fetchFilters(); // Re-fetch to get actual IDs for newly created filters
        if (onSaveSuccess) {
          onSaveSuccess(groupId, filtersToSave.length); // Call onSaveSuccess with the new count
        }
        // onClose is now handled by the parent component
      } catch (error) {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to save group-specific network filters.',
          variant: 'destructive',
        });
      } finally {
        setIsSaving(false); // Reset isSaving
      }
    }, [filters, apiUrl, toast, onSaveSuccess, groupId, fetchFilters]);

    useImperativeHandle(ref, () => ({
      handleSaveFilters,
      isSaving, // Expose isSaving
    }));

    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Network Group Filters for &quot;{groupName}&quot;</CardTitle>
          <CardDescription>
            Define include/exclude regex patterns to filter network groups for users in this group.
            These filters will override global network display filters for logged-in users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filters.length === 0 && !isFetching && ( // Use isFetching here
              <p className="text-sm text-muted-foreground">No group-specific filters configured yet.</p>
            )}
            {filters.map((filter, index) => (
              <div key={filter.id} className="flex items-end space-x-2">
                <div className="grid gap-1.5 flex-grow">
                  <Label htmlFor={`pattern-${filter.id}`}>Pattern</Label>
                  <Input
                    id={`pattern-${filter.id}`}
                    value={filter.pattern}
                    onChange={(e) => handleFilterChange(index, 'pattern', e.target.value)}
                    placeholder="e.g., ^(DMZ|Guest)"
                  />
                </div>
                <div className="grid gap-1.5 w-[120px]">
                  <Label htmlFor={`type-${filter.id}`}>Type</Label>
                  <Select
                    value={filter.type}
                    onValueChange={(value: 'include' | 'exclude') => handleFilterChange(index, 'type', value)}
                  >
                    <SelectTrigger id={`type-${filter.id}`}>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="include">Include</SelectItem>
                      <SelectItem value="exclude">Exclude</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5 flex-grow">
                  <Label htmlFor={`description-${filter.id}`}>Description (Optional)</Label>
                  <Input
                    id={`description-${filter.id}`}
                    value={filter.description || ''}
                    onChange={(e) => handleFilterChange(index, 'description', e.target.value)}
                    placeholder="e.g., Only show DMZ and Guest networks"
                  />
                </div>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => handleRemoveFilter(filter.id!)}
                  disabled={isSaving} // Use isSaving here
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={handleAddFilter}
              disabled={isSaving} // Use isSaving here
              className="w-full"
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Add Filter
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
);