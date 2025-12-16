/**
 * State management system for bulk network group member operations
 * Provides comprehensive progress tracking for assign, unassign, and move operations
 * on multiple host aliases
 */

export type BulkOperationType = 'assign' | 'unassign' | 'move';

export type BulkOperationState =
  | 'idle'
  | 'validating'
  | 'processing'
  | 'reconfiguring'
  | 'refreshing'
  | 'success'
  | 'error';

export type ErrorType =
  | 'validation'
  | 'network'
  | 'permission'
  | 'conflict'
  | 'timeout'
  | 'unknown';

export interface BulkOperationProgress {
  state: BulkOperationState;
  operationType: BulkOperationType;
  totalHosts: number;
  currentStep: number;
  totalSteps: number;
  stepMessage: string;
  canCancel: boolean;
  error?: {
    type: ErrorType;
    message: string;
    details?: string;
  };
}

export interface BulkOperationConfig {
  operationType: BulkOperationType;
  hostNames: string[];
  groupName: string;
  groupFriendlyName?: string;
  targetGroupName?: string; // For move operations
  targetGroupFriendlyName?: string; // For move operations
}

/**
 * State machine transitions for bulk operations
 */
export const BULK_OPERATION_STATE_MACHINE: Record<BulkOperationState, {
  nextStates: BulkOperationState[];
  canCancel: boolean;
  defaultMessage: string;
}> = {
  idle: {
    nextStates: ['validating', 'processing', 'error'],
    canCancel: true,
    defaultMessage: 'Ready to process',
  },
  validating: {
    nextStates: ['processing', 'error'],
    canCancel: true,
    defaultMessage: 'Validating hosts...',
  },
  processing: {
    nextStates: ['reconfiguring', 'error'],
    canCancel: false,
    defaultMessage: 'Processing hosts...',
  },
  reconfiguring: {
    nextStates: ['refreshing', 'error'],
    canCancel: false,
    defaultMessage: 'Reconfiguring network...',
  },
  refreshing: {
    nextStates: ['success', 'error'],
    canCancel: false,
    defaultMessage: 'Refreshing data...',
  },
  success: {
    nextStates: [],
    canCancel: false,
    defaultMessage: 'Operation completed successfully',
  },
  error: {
    nextStates: ['idle'],
    canCancel: true,
    defaultMessage: 'An error occurred',
  },
};

/**
 * Create initial bulk operation progress state
 */
export function createInitialBulkProgress(config: BulkOperationConfig): BulkOperationProgress {
  const totalHosts = config.hostNames.length;
  const baseSteps = 4; // validating, processing, reconfiguring, refreshing
  const successStep = 1;
  const totalSteps = baseSteps + successStep;

  return {
    state: 'idle',
    operationType: config.operationType,
    totalHosts,
    currentStep: 0,
    totalSteps,
    stepMessage: BULK_OPERATION_STATE_MACHINE.idle.defaultMessage,
    canCancel: BULK_OPERATION_STATE_MACHINE.idle.canCancel,
  };
}

/**
 * Update progress state with new state
 */
export function updateBulkProgress(
  current: BulkOperationProgress,
  newState: BulkOperationState,
  customMessage?: string
): BulkOperationProgress {
  // eslint-disable-next-line security/detect-object-injection
  if (!BULK_OPERATION_STATE_MACHINE[newState]) {
    console.warn(`Invalid state: ${newState}`);
    return current;
  }

  // eslint-disable-next-line security/detect-object-injection
  const machine = BULK_OPERATION_STATE_MACHINE[newState];
  const stepIncrement = newState === 'idle' ? 0 : 1;

  return {
    ...current,
    state: newState,
    currentStep: current.currentStep + stepIncrement,
    stepMessage: customMessage || machine.defaultMessage,
    canCancel: machine.canCancel,
    error: undefined,
  };
}



/**
 * Get operation type display name
 */
export function getOperationTypeLabel(operationType: BulkOperationType): string {
  switch (operationType) {
    case 'assign':
      return 'Assign';
    case 'unassign':
      return 'Unassign';
    case 'move':
      return 'Move';
    default:
      return 'Operation';
  }
}

/**
 * Get operation type description
 */
export function getOperationTypeDescription(operationType: BulkOperationType): string {
  switch (operationType) {
    case 'assign':
      return 'Assigning hosts to group';
    case 'unassign':
      return 'Removing hosts from group';
    case 'move':
      return 'Moving hosts between groups';
    default:
      return 'Processing hosts';
  }
}



