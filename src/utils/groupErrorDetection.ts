/**
 * Utility functions for detecting group assignment errors
 */

export interface GroupWithType {
  groupType?: 'SingleSelect' | 'MultiSelect';
  uuid?: string;
  name?: string;
  friendlyName?: string;
}

/**
 * Detects if there's a multi-group error (when group types are disabled and multiple groups assigned)
 */
export const hasMultiGroupError = (groups: GroupWithType[], enableGroupTypes: boolean): boolean => {
  return !enableGroupTypes && groups.length > 1;
};

/**
 * Detects if there's a single-select group error (when group types are enabled and multiple single-select groups assigned)
 */
export const hasSingleSelectGroupError = (groups: GroupWithType[], enableGroupTypes: boolean): boolean => {
  if (!enableGroupTypes) return false;
  const singleSelectGroups = groups.filter(g => g.groupType === 'SingleSelect');
  return singleSelectGroups.length > 1;
};

/**
 * Detects if there's any group assignment error
 */
export const hasAnyGroupError = (groups: GroupWithType[], enableGroupTypes: boolean): boolean => {
  return hasMultiGroupError(groups, enableGroupTypes) || hasSingleSelectGroupError(groups, enableGroupTypes);
};

/**
 * Returns the type of group error, if any
 */
export const getGroupErrorType = (groups: GroupWithType[], enableGroupTypes: boolean): 'multi-group' | 'single-select' | null => {
  if (hasMultiGroupError(groups, enableGroupTypes)) return 'multi-group';
  if (hasSingleSelectGroupError(groups, enableGroupTypes)) return 'single-select';
  return null;
};

/**
 * Gets the appropriate error message for the group error type
 */
export const getGroupErrorMessage = (errorType: 'multi-group' | 'single-select' | null): string => {
  switch (errorType) {
    case 'multi-group':
      return 'Multi Group Error';
    case 'single-select':
      return 'Single Select Group Error';
    default:
      return '';
  }
};
