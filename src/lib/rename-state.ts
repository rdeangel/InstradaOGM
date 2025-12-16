/**
 * State management system for rename operations
 * Provides comprehensive visual feedback throughout the rename process
 */

export type RenameState = 
  | 'idle'
  | 'validating'
  | 'updating_alias'
  | 'creating_dhcp'
  | 'reconfiguring'
  | 'refreshing_devices'
  | 'success'
  | 'error';

export type ErrorType = 
  | 'validation'
  | 'network'
  | 'permission'
  | 'conflict'
  | 'timeout'
  | 'unknown';

export interface RenameProgress {
  state: RenameState;
  currentStep: number;
  totalSteps: number;
  stepMessage: string;
  canCancel: boolean;
  error?: {
    type: ErrorType;
    message: string;
    details?: string;
    recoveryActions?: RecoveryAction[];
  };
}

export interface RecoveryAction {
  label: string;
  action: () => void | Promise<void>;
  variant?: 'primary' | 'secondary' | 'destructive';
}

export interface RenameStateConfig {
  deviceName: string;
  deviceUuid?: string; // Add optional deviceUuid property
  currentAliasName: string; // Add current alias name for comparison
  newAliasName: string;
  ipAddress?: string;
  macAddress?: string;
  shouldCreateDhcpReservation: boolean;
  isDeviceOnline: boolean;
  hasDhcpReservation: boolean;
}

/**
 * State machine transitions for rename operations
 */
export const RENAME_STATE_MACHINE: Record<RenameState, {
  nextStates: RenameState[];
  canCancel: boolean;
  defaultMessage: string;
  progressWeight: number; // Weight for progress calculation (0-1)
}> = {
  idle: {
    nextStates: ['validating', 'creating_dhcp', 'reconfiguring', 'error'],
    canCancel: true,
    defaultMessage: 'Ready to rename device',
    progressWeight: 0,
  },
  validating: {
    nextStates: ['updating_alias', 'error'],
    canCancel: true,
    defaultMessage: 'Validating new alias name...',
    progressWeight: 0.1,
  },
  updating_alias: {
    nextStates: ['creating_dhcp', 'reconfiguring', 'refreshing_devices', 'success', 'error'],
    canCancel: false, // Once we start updating, we shouldn't cancel
    defaultMessage: 'Updating host alias...',
    progressWeight: 0.3,
  },
  creating_dhcp: {
    nextStates: ['reconfiguring', 'refreshing_devices', 'success', 'error'],
    canCancel: false,
    defaultMessage: 'Creating DHCP reservation...',
    progressWeight: 0.5,
  },
  reconfiguring: {
    nextStates: ['refreshing_devices', 'success', 'error'],
    canCancel: false,
    defaultMessage: 'Reconfiguring network settings...',
    progressWeight: 0.7,
  },
  refreshing_devices: {
    nextStates: ['success', 'error'],
    canCancel: false,
    defaultMessage: 'Refreshing device information...',
    progressWeight: 0.9,
  },
  success: {
    nextStates: [], // Terminal state
    canCancel: false,
    defaultMessage: 'Rename completed successfully',
    progressWeight: 1.0,
  },
  error: {
    nextStates: ['idle'], // Can retry from error
    canCancel: true,
    defaultMessage: 'An error occurred during rename',
    progressWeight: 0,
  },
};

/**
 * Calculate progress percentage based on current state
 */
export function calculateProgress(state: RenameState): number {
  // eslint-disable-next-line security/detect-object-injection
  return Math.round(RENAME_STATE_MACHINE[state].progressWeight * 100);
}

/**
 * Check if a state transition is valid
 */
export function isValidTransition(from: RenameState, to: RenameState): boolean {
  // eslint-disable-next-line security/detect-object-injection
  return RENAME_STATE_MACHINE[from].nextStates.includes(to);
}

/**
 * Get the next logical state in the flow
 */
export function getNextState(currentState: RenameState, config: RenameStateConfig): RenameState {
  switch (currentState) {
    case 'idle':
      // Check if we need to validate or can skip directly to the next step
      const isNameChanging = config.currentAliasName !== config.newAliasName;
      if (isNameChanging) {
        return 'validating';
      } else if (config.shouldCreateDhcpReservation && !config.hasDhcpReservation) {
        return 'creating_dhcp';
      } else {
        return 'reconfiguring';
      }
    case 'validating':
      // Check if alias name is actually changing
      const isNameChangingAfterValidation = config.currentAliasName !== config.newAliasName;
      return isNameChangingAfterValidation ? 'updating_alias' :
             (config.shouldCreateDhcpReservation && !config.hasDhcpReservation) ? 'creating_dhcp' : 'reconfiguring';
    case 'updating_alias':
      // Only go to creating_dhcp if DHCP reservation will actually be created
      if (config.shouldCreateDhcpReservation && !config.hasDhcpReservation) {
        return 'creating_dhcp';
      }
      return 'reconfiguring';
    case 'creating_dhcp':
      return 'reconfiguring';
    case 'reconfiguring':
      return 'refreshing_devices';
    case 'refreshing_devices':
      return 'success';
    case 'success':
    case 'error':
    default:
      return currentState;
  }
}

/**
 * Create initial rename progress state
 */
export function createInitialProgress(config: RenameStateConfig): RenameProgress {
  return {
    state: 'idle',
    currentStep: 0,
    totalSteps: calculateTotalSteps(config),
    stepMessage: RENAME_STATE_MACHINE.idle.defaultMessage,
    canCancel: RENAME_STATE_MACHINE.idle.canCancel,
  };
}

/**
 * Calculate total number of steps based on configuration
 */
function calculateTotalSteps(config: RenameStateConfig): number {
  let steps = 0; // Start with 0, only count steps that will actually be performed

  // Only add validating step if name is actually changing
  const isNameChanging = config.currentAliasName !== config.newAliasName;
  if (isNameChanging) {
    steps += 1; // validating
    steps += 1; // updating_alias
  }

  // Only add DHCP step if it will actually be performed
  if (config.shouldCreateDhcpReservation && !config.hasDhcpReservation) {
    steps += 1; // creating_dhcp
  }

  steps += 2; // reconfiguring + refreshing_devices are always present
  steps += 1; // success step is always present at the end

  return steps;
}

/**
 * Update progress state with new state
 */
export function updateProgress(
  current: RenameProgress,
  newState: RenameState,
  customMessage?: string
): RenameProgress {
  // Special case: allow direct transitions from idle to creating_dhcp or reconfiguring
  // when only performing DHCP operations (no name change)
  const isDirectTransitionAllowed =
    current.state === 'idle' &&
    (newState === 'creating_dhcp' || newState === 'reconfiguring');
    
  if (!isValidTransition(current.state, newState) && !isDirectTransitionAllowed) {
    console.warn(`Invalid state transition from ${current.state} to ${newState}`);
    return current;
  }

  // eslint-disable-next-line security/detect-object-injection
  const machine = RENAME_STATE_MACHINE[newState];
  const stepIncrement = newState === 'idle' ? 0 : 1;
  
  return {
    ...current,
    state: newState,
    currentStep: current.currentStep + stepIncrement,
    stepMessage: customMessage || machine.defaultMessage,
    canCancel: machine.canCancel,
    error: undefined, // Clear error when transitioning to a new state
  };
}

/**
 * Set error state with recovery actions
 */
export function setErrorState(
  current: RenameProgress,
  errorType: ErrorType,
  message: string,
  details?: string,
  recoveryActions?: RecoveryAction[]
): RenameProgress {
  return {
    ...current,
    state: 'error',
    stepMessage: message,
    canCancel: RENAME_STATE_MACHINE.error.canCancel,
    error: {
      type: errorType,
      message,
      details,
      recoveryActions,
    },
  };
}

/**
 * Get human-readable error type description
 */
export function getErrorTypeDescription(errorType: ErrorType): string {
  switch (errorType) {
    case 'validation':
      return 'Validation Error';
    case 'network':
      return 'Network Error';
    case 'permission':
      return 'Permission Error';
    case 'conflict':
      return 'Conflict Error';
    case 'timeout':
      return 'Timeout Error';
    case 'unknown':
    default:
      return 'Unknown Error';
  }
}

/**
 * Get appropriate recovery actions for error type
 */
export function getDefaultRecoveryActions(
  errorType: ErrorType,
  retryAction?: () => void | Promise<void>
): RecoveryAction[] {
  const actions: RecoveryAction[] = [];
  
  if (retryAction) {
    actions.push({
      label: 'Retry',
      action: retryAction,
      variant: 'primary',
    });
  }
  
  switch (errorType) {
    case 'validation':
      actions.push({
        label: 'Check Alias Name',
        action: () => {
          // Focus on the alias name input
          const input = document.getElementById('new-alias-name') as HTMLInputElement;
          if (input) {
            input.focus();
            input.select();
          }
        },
        variant: 'secondary',
      });
      break;
    case 'network':
      actions.push({
        label: 'Check Connection',
        action: () => {
          // Could open a network diagnostic or refresh page
          window.location.reload();
        },
        variant: 'secondary',
      });
      break;
    case 'permission':
      actions.push({
        label: 'Contact Administrator',
        action: () => {
          // Could open a support ticket or email
          window.open('mailto:support@example.com');
        },
        variant: 'secondary',
      });
      break;
  }
  
  return actions;
}

/**
 * Debounce function for state updates to prevent excessive re-renders
 */
export function debounce(
  func: (state: RenameProgress) => void,
  wait: number
): (state: RenameProgress) => void {
  let timeout: NodeJS.Timeout;
  return (state: RenameProgress) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(state), wait);
  };
}

/**
 * Create a debounced state update function
 */
export function createDebouncedStateUpdater(
  setState: (state: RenameProgress) => void,
  delay: number = 100
) {
  return debounce(setState, delay);
}