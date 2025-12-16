/* eslint-disable security/detect-object-injection */
// This hook uses bracket notation with typed keys from objects for comparison. All uses are safe.
import { useMemo } from 'react';

/**
 * Hook to detect unsaved changes by comparing working data with saved data
 * @param workingData - Current working data (local state)
 * @param savedData - Saved data (from server/database)
 * @param compareFunction - Optional custom comparison function
 * @returns boolean indicating if there are unsaved changes
 */
export function useUnsavedChanges<T>(
  workingData: T,
  savedData: T,
  compareFunction?: (working: T, saved: T) => boolean
): boolean {
  return useMemo(() => {
    // If no data is loaded yet, no changes
    if (!workingData || !savedData) {
      return false;
    }

    // Use custom comparison function if provided
    if (compareFunction) {
      return compareFunction(workingData, savedData);
    }

    // Default deep comparison using JSON.stringify
    // Note: This works for most cases but may not be perfect for complex objects
    try {
      return JSON.stringify(workingData) !== JSON.stringify(savedData);
    } catch {
      // Fallback to reference comparison if JSON.stringify fails
      return workingData !== savedData;
    }
  }, [workingData, savedData, compareFunction]);
}

/**
 * Specialized hook for array-based unsaved changes detection
 * @param workingArray - Current working array (local state)
 * @param savedArray - Saved array (from server/database)
 * @param keyField - Field to use as unique identifier for array items
 * @returns boolean indicating if there are unsaved changes
 */
export function useUnsavedArrayChanges<T extends Record<string, unknown>>(
  workingArray: T[],
  savedArray: T[],
  keyField: keyof T = 'id'
): boolean {
  return useMemo(() => {
    if (workingArray.length === 0 && savedArray.length === 0) {
      return false;
    }

    // Different lengths = changes
    if (workingArray.length !== savedArray.length) {
      return true;
    }

    // Create maps for efficient comparison
    const workingMap = new Map(workingArray.map(item => [item[keyField], item]));
    const savedMap = new Map(savedArray.map(item => [item[keyField], item]));

    // Check if any working item differs from saved item
    for (const [key, workingItem] of workingMap) {
      const savedItem = savedMap.get(key);
      if (!savedItem) {
        return true; // New item
      }

      // Compare all fields except the key field
      const workingFields = { ...workingItem };
      const savedFields = { ...savedItem };
      delete workingFields[keyField];
      delete savedFields[keyField];

      try {
        if (JSON.stringify(workingFields) !== JSON.stringify(savedFields)) {
          return true;
        }
      } catch {
        // Fallback comparison
        for (const field in workingFields) {
          if (workingFields[field] !== savedFields[field]) {
            return true;
          }
        }
      }
    }

    return false;
  }, [workingArray, savedArray, keyField]);
}

/**
 * Specialized hook for OpnsenseGroupDisplay unsaved changes detection
 * (extracted from NetworkDisplayMappingsTab for reuse)
 */
export function useUnsavedOpnsenseGroupDisplayChanges(
  workingDisplays: Array<{
    id: string;
    opnsenseUuid: string;
    friendlyName: string;
    iconIdentifier?: string | null;
    isGloballyDisabled?: boolean;
    groupType?: string;
  }>,
  savedDisplays: Array<{
    id: string;
    opnsenseUuid: string;
    friendlyName: string;
    iconIdentifier?: string | null;
    isGloballyDisabled?: boolean;
    groupType?: string;
  }>
): boolean {
  return useMemo(() => {
    // If both are empty, no changes
    if (workingDisplays.length === 0 && savedDisplays.length === 0) {
      return false;
    }

    // If working has items but saved is empty, check if any working items have non-default values
    if (savedDisplays.length === 0 && workingDisplays.length > 0) {
      // Check if any working display has been modified from defaults
      return workingDisplays.some(d =>
        d.friendlyName !== '' ||
        d.iconIdentifier !== null ||
        d.isGloballyDisabled !== false ||
        d.groupType !== 'SingleSelect'
      );
    }

    // If saved has items but working is empty, that's a change (everything deleted)
    if (workingDisplays.length === 0 && savedDisplays.length > 0) {
      return true;
    }

    // Create maps for efficient comparison
    const workingMap = new Map(workingDisplays.map(d => [d.opnsenseUuid, d]));
    const savedMap = new Map(savedDisplays.map(d => [d.opnsenseUuid, d]));

    // Check if any working display differs from saved display
    for (const [uuid, workingDisplay] of workingMap) {
      const savedDisplay = savedMap.get(uuid);
      if (!savedDisplay) {
        // New mapping that doesn't exist in saved state
        if (workingDisplay.friendlyName || workingDisplay.iconIdentifier || workingDisplay.isGloballyDisabled || workingDisplay.groupType !== 'SingleSelect') {
          return true;
        }
      } else {
        // Compare existing mapping
        if (
          workingDisplay.friendlyName !== savedDisplay.friendlyName ||
          workingDisplay.iconIdentifier !== savedDisplay.iconIdentifier ||
          workingDisplay.isGloballyDisabled !== savedDisplay.isGloballyDisabled ||
          workingDisplay.groupType !== savedDisplay.groupType
        ) {
          return true;
        }
      }
    }

    return false;
  }, [workingDisplays, savedDisplays]);
}
