import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/lib/logger';

export interface GroupTypeViolation {
  hostAlias: string;
  groups: string[];
  groupCount: number;
}

export interface GroupTypeValidationResult {
  canDisableGroupTypes: boolean;
  violations: GroupTypeViolation[];
  violationCount: number;
  totalHostAliases: number;
  totalGroups: number;
}

export function useGroupTypeValidation() {
  const [validationResult, setValidationResult] = useState<GroupTypeValidationResult>({
    canDisableGroupTypes: true,
    violations: [],
    violationCount: 0,
    totalHostAliases: 0,
    totalGroups: 0
  });
  const [isValidating, setIsValidating] = useState(false);
  const [lastValidated, setLastValidated] = useState<Date | null>(null);
  const [apiAvailable, setApiAvailable] = useState(true);

  const validateGroupTypes = useCallback(async () => {
    setIsValidating(true);
    try {
      const response = await fetch('/api/admin/validate-group-types');
      if (!response.ok) {
        throw new Error(`Failed to validate group types: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Handle different response formats based on user authentication level
      let result: GroupTypeValidationResult;

      if ('violations' in data) {
        // Super admin response - full details
        result = data as GroupTypeValidationResult;
      } else if ('violationCount' in data) {
        // Authenticated user response - basic info
        result = {
          canDisableGroupTypes: data.canDisableGroupTypes,
          violations: [],
          violationCount: data.violationCount,
          totalHostAliases: 0,
          totalGroups: 0
        };
      } else {
        // Unauthenticated user response - minimal info
        result = {
          canDisableGroupTypes: !data.hasMultipleGroupAssignments,
          violations: [],
          violationCount: data.hasMultipleGroupAssignments ? 1 : 0,
          totalHostAliases: 0,
          totalGroups: 0
        };
      }

      setValidationResult(result);
      setLastValidated(new Date());
      setApiAvailable(true);

      return result;
    } catch (error) {
      logger.error('Error validating group types:', error);
      setApiAvailable(false);

      // On error, assume we can't disable group types for safety
      const errorResult: GroupTypeValidationResult = {
        canDisableGroupTypes: false,
        violations: [],
        violationCount: 0,
        totalHostAliases: 0,
        totalGroups: 0
      };
      setValidationResult(errorResult);
      return errorResult;
    } finally {
      setIsValidating(false);
    }
  }, []);

  // Auto-validate on mount, but don't fail if API is not available
  useEffect(() => {
    validateGroupTypes().catch(() => {
      // Silently handle validation failures on mount
      logger.warn('Group type validation failed on mount - API may not be available');
    });
  }, [validateGroupTypes]);

  return {
    validationResult,
    isValidating,
    lastValidated,
    validateGroupTypes,
    apiAvailable,
    // Convenience getters
    canDisableGroupTypes: validationResult.canDisableGroupTypes,
    violations: validationResult.violations,
    violationCount: validationResult.violationCount,
  };
}
