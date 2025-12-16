/**
 * Utility functions for formatting "Last Operation" display
 * 
 * This module provides consistent formatting for displaying the last group assignment operation
 * across different components (SelfServiceCard, DeviceManagementCard, etc.)
 */

export interface GroupInfo {
  id: string;
  name: string;
  friendlyName: string | null;
}

export interface LastAssignmentData {
  timestamp: string;
  operationType: string;
  action: string;
  groupName: string | null;
  userName?: string | null;
  sourceGroups?: GroupInfo[];
  targetGroup?: GroupInfo;
  allGroups?: GroupInfo[];
  operationCount?: number;
}

/**
 * Format a group for display (prefer friendlyName over name)
 */
function formatGroupName(group: GroupInfo): string {
  return group.friendlyName || group.name || 'Unknown Group';
}

/**
 * Format a list of groups for display
 * @param groups - Array of groups
 * @param maxDisplay - Maximum number of groups to display before showing "+N more"
 * @returns Formatted string like "Group1, Group2, +3 more"
 */
function formatGroupList(groups: GroupInfo[], maxDisplay: number = 2): string {
  if (groups.length === 0) return '';
  
  const displayGroups = groups.slice(0, maxDisplay).map(formatGroupName);
  
  if (groups.length > maxDisplay) {
    const remaining = groups.length - maxDisplay;
    return `${displayGroups.join(', ')}, +${remaining} more`;
  }
  
  return displayGroups.join(', ');
}

/**
 * Calculate relative time from a timestamp
 */
export function getRelativeTime(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffYears > 0) return `${diffYears} year${diffYears > 1 ? 's' : ''} ago`;
  if (diffMonths > 0) return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
  if (diffWeeks > 0) return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffMinutes > 0) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
  return 'just now';
}

/**
 * Format the last operation for display
 * @param data - Last assignment data from API
 * @param includeUserName - Whether to include user name (false for unauthenticated)
 * @returns Formatted display string
 */
export function formatLastOperation(data: LastAssignmentData, includeUserName: boolean = true): string {
  const relativeTime = getRelativeTime(data.timestamp);
  let displayText = '';

  switch (data.operationType) {
    case 'assign': {
      // Use targetGroup if available, otherwise fall back to groupName
      const groupName = data.targetGroup 
        ? formatGroupName(data.targetGroup)
        : data.groupName || 'Unknown Group';
      displayText = `Assigned to "${groupName}"`;
      break;
    }

    case 'unassign': {
      // Use sourceGroups if available, otherwise fall back to groupName
      const groupName = data.sourceGroups && data.sourceGroups.length > 0
        ? formatGroupName(data.sourceGroups[0])
        : data.groupName || 'Unknown Group';
      displayText = `Unassigned from "${groupName}"`;
      break;
    }

    case 'move': {
      // Enhanced display: "Moved from X → Y"
      if (data.sourceGroups && data.sourceGroups.length > 0 && data.targetGroup) {
        const sourceList = formatGroupList(data.sourceGroups, 2);
        const targetName = formatGroupName(data.targetGroup);
        displayText = `Moved from "${sourceList}" → "${targetName}"`;
      } else if (data.targetGroup) {
        // Fallback if source groups not available
        const targetName = formatGroupName(data.targetGroup);
        displayText = `Moved to "${targetName}"`;
      } else if (data.groupName) {
        // Legacy fallback
        displayText = `Moved to "${data.groupName}"`;
      } else {
        displayText = 'Moved';
      }
      break;
    }

    case 'batch_assign': {
      // Enhanced display: "Batch assigned to N groups (Group1, Group2, +X more)"
      if (data.allGroups && data.allGroups.length > 0) {
        const count = data.allGroups.length;
        const groupList = formatGroupList(data.allGroups, 2);
        displayText = `Batch assigned to ${count} group${count > 1 ? 's' : ''} (${groupList})`;
      } else if (data.groupName) {
        // Legacy fallback
        displayText = `Batch assigned to ${data.groupName}`;
      } else {
        displayText = 'Batch assigned';
      }
      break;
    }

    case 'batch_unassign': {
      // Enhanced display: "Batch unassigned from N groups (Group1, Group2, +X more)"
      if (data.allGroups && data.allGroups.length > 0) {
        const count = data.allGroups.length;
        const groupList = formatGroupList(data.allGroups, 2);
        displayText = `Batch unassigned from ${count} group${count > 1 ? 's' : ''} (${groupList})`;
      } else if (data.groupName) {
        // Legacy fallback
        displayText = `Batch unassigned from ${data.groupName}`;
      } else {
        displayText = 'Batch unassigned';
      }
      break;
    }

    case 'unassign_all': {
      // Enhanced display: "Unassigned from all groups (N total: Group1, Group2, +X more)"
      if (data.allGroups && data.allGroups.length > 0) {
        const count = data.allGroups.length;
        const groupList = formatGroupList(data.allGroups, 3);
        displayText = `Unassigned from all groups (${count} total: ${groupList})`;
      } else if (data.operationCount) {
        displayText = `Unassigned from all groups (${data.operationCount} total)`;
      } else if (data.groupName) {
        // Legacy fallback
        displayText = `Unassigned from all groups (${data.groupName})`;
      } else {
        displayText = 'Unassigned from all groups';
      }
      break;
    }

    default: {
      // Fallback for unknown operation types
      const opType = data.operationType.replace('_', ' ');
      displayText = data.groupName ? `${opType} - ${data.groupName}` : opType;
    }
  }

  // Add user name if available and requested
  if (includeUserName) {
    if (data.userName) {
      displayText += ` by ${data.userName}`;
    } else if (data.userName === null && data.hasOwnProperty('userName')) {
      // userName is explicitly null (authenticated response but no user)
      displayText += ` by system`;
    }
  }

  // Add relative time
  displayText += ` - ${relativeTime}`;

  return displayText;
}

/**
 * Generate tooltip content for the last operation
 * @param data - Last assignment data from API
 * @returns Tooltip content (can be string or JSX)
 */
export function getLastOperationTooltip(data: LastAssignmentData): string {
  const timestamp = new Date(data.timestamp).toLocaleString();
  
  // For move operations with multiple source groups, show full details
  if (data.operationType === 'move' && data.sourceGroups && data.sourceGroups.length > 2 && data.targetGroup) {
    const allSources = data.sourceGroups.map(formatGroupName).join(', ');
    const target = formatGroupName(data.targetGroup);
    return `Full details:\nFrom: ${allSources}\nTo: ${target}\nTimestamp: ${timestamp}`;
  }

  // For batch operations with many groups, show all groups
  if ((data.operationType === 'batch_assign' || data.operationType === 'batch_unassign') && 
      data.allGroups && data.allGroups.length > 2) {
    const allGroupNames = data.allGroups.map(formatGroupName).join(', ');
    const opCount = data.operationCount ? `\nTotal operations: ${data.operationCount}` : '';
    return `All groups: ${allGroupNames}${opCount}\nTimestamp: ${timestamp}`;
  }

  // For unassign_all with many groups, show all groups
  if (data.operationType === 'unassign_all' && data.allGroups && data.allGroups.length > 3) {
    const allGroupNames = data.allGroups.map(formatGroupName).join(', ');
    return `All groups removed: ${allGroupNames}\nTotal: ${data.allGroups.length} groups\nTimestamp: ${timestamp}`;
  }

  // Default tooltip: just show full timestamp
  return `Full timestamp: ${timestamp}`;
}

/**
 * Check if the tooltip should show enhanced details
 * (i.e., more than just the timestamp)
 */
export function shouldShowEnhancedTooltip(data: LastAssignmentData): boolean {
  // Move with multiple source groups
  if (data.operationType === 'move' && data.sourceGroups && data.sourceGroups.length > 2) {
    return true;
  }

  // Batch operations with many groups
  if ((data.operationType === 'batch_assign' || data.operationType === 'batch_unassign') && 
      data.allGroups && data.allGroups.length > 2) {
    return true;
  }

  // Unassign all with many groups
  if (data.operationType === 'unassign_all' && data.allGroups && data.allGroups.length > 3) {
    return true;
  }

  return false;
}

