/**
 * Utility functions for rename operations
 * Provides helper functions for state management, API calls, and progress tracking
 */

// Re-export types from rename-state for convenience
export type {
  RenameState,
  RenameProgress,
  RenameStateConfig,
  ErrorType,
  RecoveryAction
} from './rename-state';

import {
  RenameProgress,
  RenameStateConfig,
  ErrorType,
  RecoveryAction,
  updateProgress,
  setErrorState,
  createInitialProgress,
  getDefaultRecoveryActions,
  debounce
} from './rename-state';

/**
 * Execute a rename operation with comprehensive progress tracking
 */
export async function executeRenameOperation(
  config: RenameStateConfig,
  onProgressUpdate: (progress: RenameProgress) => void,
  signal?: AbortSignal
): Promise<{ success: boolean; error?: Error; nameChanged?: boolean; dhcpCreated?: boolean }> {
  // Determine what operations need to be performed
  const isNameChanging = config.currentAliasName !== config.newAliasName;
  const needsDhcpReservation = config.shouldCreateDhcpReservation && !config.hasDhcpReservation;
  
  // Calculate total steps based on what work needs to be done
  // Base steps: reconfigure (1) + refresh (1) + success (1) = 3
  // Additional steps: validation (1 if name changing) + update alias (1 if name changing) + create DHCP (1 if needed)
  const baseSteps = 3; // reconfigure, refresh, success
  const additionalSteps = (isNameChanging ? 2 : 0) + (needsDhcpReservation ? 1 : 0);
  const totalSteps = baseSteps + additionalSteps;
  
  // Create initial progress with correct total steps
  let progress = createInitialProgress(config);
  progress = { ...progress, totalSteps };
  onProgressUpdate(progress);

  // Track what operations were actually performed
  let nameChanged = false;
  let dhcpCreated = false;

  try {
    // Step 1: Validate (only if name is changing)
    if (isNameChanging) {
      progress = updateProgress(progress, 'validating');
      onProgressUpdate(progress);
      
      const validationResult = await validateAliasName(config.newAliasName);
      if (!validationResult.isValid) {
        progress = setErrorState(
          progress,
          'validation',
          validationResult.message || 'Invalid alias name',
          validationResult.details
        );
        onProgressUpdate(progress);
        return { success: false, error: new Error(validationResult.message || 'Invalid alias name') };
      }
    }

    // Step 2: Update alias (only if name is actually changing)
    if (isNameChanging) {
      progress = updateProgress(progress, 'updating_alias');
      onProgressUpdate(progress);
      
      const updateResult = await updateHostAlias(config, signal);
      if (!updateResult.success) {
        progress = setErrorState(
          progress,
          updateResult.errorType || 'unknown',
          updateResult.message || 'Failed to update host alias',
          updateResult.details
        );
        onProgressUpdate(progress);
        return { success: false, error: updateResult.error };
      }
      
      // Track that name was actually changed
      nameChanged = true;
    }

    // Step 3: Create DHCP reservation (if needed)
    if (needsDhcpReservation) {
      progress = updateProgress(progress, 'creating_dhcp');
      onProgressUpdate(progress);
      
      const dhcpResult = await createDhcpReservation(config, signal);
      if (!dhcpResult.success) {
        // DHCP creation failure is not fatal, but we should show a warning
        console.warn('DHCP reservation creation failed:', dhcpResult.message);
        // Continue with the operation but note the failure
      } else {
        // Track that DHCP was actually created
        dhcpCreated = true;
      }
    }

    // Step 4: Reconfigure (always performed)
    progress = updateProgress(progress, 'reconfiguring');
    onProgressUpdate(progress);
    
    const reconfigureResult = await reconfigureNetwork(config, signal);
    if (!reconfigureResult.success) {
      // Reconfiguration failure is not fatal
      console.warn('Network reconfiguration failed:', reconfigureResult.message);
    }

    // Step 5: Refresh devices
    progress = updateProgress(progress, 'refreshing_devices');
    onProgressUpdate(progress);
    
    const refreshResult = await refreshDevices(signal);
    if (!refreshResult.success) {
      // Refresh failure is not fatal for the rename operation itself
      console.warn('Device refresh failed:', refreshResult.message);
    }

    // Step 6: Success
    progress = updateProgress(progress, 'success');
    onProgressUpdate(progress);
    
    return { success: true, nameChanged, dhcpCreated };
  } catch (error) {
    let errorType: ErrorType = 'unknown';
    let message = 'An unexpected error occurred';
    
    if (error instanceof Error) {
      message = error.message;
      
      // Classify error type based on message content
      if (error.message.includes('network') || error.message.includes('fetch')) {
        errorType = 'network';
      } else if (error.message.includes('permission') || error.message.includes('unauthorized')) {
        errorType = 'permission';
      } else if (error.message.includes('conflict') || error.message.includes('already exists')) {
        errorType = 'conflict';
      } else if (error.message.includes('timeout') || error.message.includes('aborted')) {
        errorType = 'timeout';
      } else if (error.message.includes('validation') || error.message.includes('invalid')) {
        errorType = 'validation';
      }
    }
    
    progress = setErrorState(progress, errorType, message, error instanceof Error ? error.stack : undefined);
    onProgressUpdate(progress);
    
    return { success: false, error: error instanceof Error ? error : new Error(message) };
  }
}

/**
 * Validate alias name according to system requirements
 */
export async function validateAliasName(aliasName: string): Promise<{
  isValid: boolean;
  message?: string;
  details?: string;
}> {
  // Basic validation
  if (!aliasName || aliasName.trim().length === 0) {
    return {
      isValid: false,
      message: 'Alias name cannot be empty',
      details: 'Please enter a valid alias name'
    };
  }

  const trimmedName = aliasName.trim();

  // Length validation
  if (trimmedName.length >= 32) {
    return {
      isValid: false,
      message: 'Alias name must be less than 32 characters',
      details: `Current length: ${trimmedName.length}, Maximum allowed: 31`
    };
  }

  // Character validation
  if (!/^[a-zA-Z_]/.test(trimmedName)) {
    return {
      isValid: false,
      message: 'Alias name must start with a letter or underscore',
      details: 'First character must be a letter (a-z, A-Z) or underscore (_)'
    };
  }

  if (!/^[a-zA-Z0-9_]*$/.test(trimmedName)) {
    return {
      isValid: false,
      message: 'Alias name can only contain alphanumeric characters and underscores',
      details: 'Allowed characters: letters (a-z, A-Z), numbers (0-9), and underscores (_)'
    };
  }

  // Server-side validation (check for duplicates, etc.)
  try {
    const response = await fetch('/api/opnsense/validate-alias-name', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ aliasName: trimmedName }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        isValid: false,
        message: errorData.message || 'Server validation failed',
        details: errorData.details
      };
    }

    const validationResult = await response.json();
    return {
      isValid: validationResult.isValid,
      message: validationResult.message,
      details: validationResult.details
    };
  } catch (error) {
    // If server validation fails, fall back to client-side validation
    console.warn('Server validation failed, using client-side validation:', error);
    return { isValid: true };
  }
}

/**
 * Update host alias via API
 */
async function updateHostAlias(
  config: RenameStateConfig,
  signal?: AbortSignal
): Promise<{ success: boolean; error?: Error; errorType?: ErrorType; message?: string; details?: string }> {
  try {
    const response = await fetch(`/api/opnsense/host-alias-management?uuid=${config.deviceUuid || config.deviceName}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        alias: { 
          name: config.newAliasName, 
          type: 'host', 
          content: config.ipAddress, 
          enabled: '1' 
        } 
      }),
      signal,
    });

    if (!response.ok) {
      const errorData = await response.json();
      let errorType: ErrorType = 'unknown';
      
      if (response.status === 400) errorType = 'validation';
      else if (response.status === 401 || response.status === 403) errorType = 'permission';
      else if (response.status === 409) errorType = 'conflict';
      else if (response.status >= 500) errorType = 'network';
      
      return {
        success: false,
        error: new Error(errorData.message || 'Failed to update host alias'),
        errorType,
        message: errorData.message || 'Failed to update host alias',
        details: errorData.details
      };
    }

    return { success: true };
  } catch (error) {
    let errorType: ErrorType = 'network';
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorType = 'timeout';
      }
    }
    
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Network error'),
      errorType,
      message: error instanceof Error ? error.message : 'Network error',
      details: error instanceof Error ? error.stack : undefined
    };
  }
}

/**
 * Create DHCP reservation via API
 */
async function createDhcpReservation(
  config: RenameStateConfig,
  signal?: AbortSignal
): Promise<{ success: boolean; error?: Error; errorType?: ErrorType; message?: string; details?: string }> {
  if (!config.ipAddress || !config.macAddress) {
    return {
      success: false,
      error: new Error('Missing IP address or MAC address for DHCP reservation'),
      errorType: 'validation',
      message: 'Missing IP address or MAC address for DHCP reservation'
    };
  }

  try {
    // First, fetch available subnets to determine correct subnet for IP
    const subnetsResponse = await fetch('/api/opnsense/dhcp?action=subnets', { signal });
    if (!subnetsResponse.ok) {
      throw new Error('Failed to fetch DHCP subnets');
    }
    const subnets = await subnetsResponse.json();

    // Find matching subnet for IP address
    const matchingSubnet = subnets.find((subnet: { subnet: string; uuid: string }) => {
      return isIpInSubnet(config.ipAddress!, subnet.subnet);
    });

    if (!matchingSubnet) {
      return {
        success: false,
        error: new Error(`No matching subnet found for IP address ${config.ipAddress}`),
        errorType: 'validation',
        message: `No matching subnet found for IP address ${config.ipAddress}`
      };
    }

    const dhcpResponse = await fetch('/api/opnsense/dhcp?action=add_reservation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payload: {
          subnet: matchingSubnet.uuid,
          ip_address: config.ipAddress,
          hw_address: config.macAddress.toLowerCase(),
          hostname: config.newAliasName,
          description: `Auto-created during host alias rename to ${config.newAliasName}`,
        },
      }),
      signal,
    });

    if (!dhcpResponse.ok) {
      const errorData = await dhcpResponse.json();
      let errorType: ErrorType = 'unknown';
      
      if (dhcpResponse.status === 400) errorType = 'validation';
      else if (dhcpResponse.status === 401 || dhcpResponse.status === 403) errorType = 'permission';
      else if (dhcpResponse.status === 409) errorType = 'conflict';
      else if (dhcpResponse.status >= 500) errorType = 'network';
      
      return {
        success: false,
        error: new Error(errorData.message || 'Failed to create DHCP reservation'),
        errorType,
        message: errorData.message || 'Failed to create DHCP reservation',
        details: errorData.details
      };
    }

    const dhcpData = await dhcpResponse.json();
    if (!dhcpData.success) {
      return {
        success: false,
        error: new Error(dhcpData.message || 'DHCP reservation creation failed'),
        errorType: 'unknown',
        message: dhcpData.message || 'DHCP reservation creation failed'
      };
    }

    return { success: true };
  } catch (error) {
    let errorType: ErrorType = 'network';
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorType = 'timeout';
      }
    }
    
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Network error'),
      errorType,
      message: error instanceof Error ? error.message : 'Network error',
      details: error instanceof Error ? error.stack : undefined
    };
  }
}

/**
 * Reconfigure network settings (placeholder for future implementation)
 */
async function reconfigureNetwork(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _config: RenameStateConfig,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _signal?: AbortSignal
): Promise<{ success: boolean; error?: Error; message?: string }> {
  // This is a placeholder for future network reconfiguration
  // For now, we'll just simulate a delay and return success
  await new Promise(resolve => setTimeout(resolve, 1000));
  return { success: true };
}

/**
 * Refresh device list
 */
async function refreshDevices(
  signal?: AbortSignal
): Promise<{ success: boolean; error?: Error; message?: string }> {
  try {
    const response = await fetch('/api/user/devices', { 
      cache: 'no-store',
      signal 
    });
    
    if (!response.ok) {
      throw new Error('Failed to refresh device list');
    }
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Network error'),
      message: error instanceof Error ? error.message : 'Network error'
    };
  }
}

/**
 * Helper function to check if an IP is within a CIDR subnet
 */
function isIpInSubnet(ip: string, subnetCidr: string): boolean {
  try {
    const [subnetIp, cidrStr] = subnetCidr.split('/');
    const cidr = parseInt(cidrStr, 10);

    if (isNaN(cidr) || cidr < 0 || cidr > 32) {
      return false;
    }

    const ipParts = ip.split('.').map(Number);
    const subnetParts = subnetIp.split('.').map(Number);

    if (ipParts.length !== 4 || subnetParts.length !== 4) {
      return false;
    }

    let ipNetwork = 0;
    let subnetNetwork = 0;
    for (let i = 0; i < 4; i++) {
      // eslint-disable-next-line security/detect-object-injection
      ipNetwork = (ipNetwork << 8) | ipParts[i];
      // eslint-disable-next-line security/detect-object-injection
      subnetNetwork = (subnetNetwork << 8) | subnetParts[i];
    }

    const mask = -1 << (32 - cidr);
    return (ipNetwork & mask) === (subnetNetwork & mask);
  } catch (e) {
    console.error("Error checking IP in subnet:", e);
    return false;
  }
}

/**
 * Create a debounced progress updater to prevent excessive re-renders
 */
export function createDebouncedProgressUpdater(
  onProgressUpdate: (progress: RenameProgress) => void,
  delay: number = 100
) {
  return debounce(onProgressUpdate, delay);
}

/**
 * Get recovery actions for a specific error type
 */
export function getRecoveryActionsForError(
  errorType: ErrorType,
  retryAction?: () => void,
  config?: RenameStateConfig
): RecoveryAction[] {
  const actions = getDefaultRecoveryActions(errorType, retryAction);
  
  // Add specific actions based on error type and config
  if (errorType === 'validation' && config) {
    actions.push({
      label: 'Use Detected Hostname',
      action: () => {
        // This would be handled by the component
        const event = new CustomEvent('use-detected-hostname');
        window.dispatchEvent(event);
      },
      variant: 'secondary',
    });
  }
  
  if (errorType === 'network') {
    actions.push({
      label: 'Test Connection',
      action: async () => {
        try {
          const response = await fetch('/api/health');
          if (response.ok) {
            alert('Connection to server is working. Please try the operation again.');
          } else {
            alert('Server connection issue detected. Please try again later.');
          }
        } catch {
          alert('Network connection issue detected. Please check your internet connection.');
        }
      },
      variant: 'secondary',
    });
  }
  
  return actions;
}

/**
 * Format progress message with device information
 */
export function formatProgressMessage(
  baseMessage: string,
  config?: RenameStateConfig
): string {
  if (!config) return baseMessage;
  
  return baseMessage
    .replace('{device}', config.deviceUuid || config.deviceName)
    .replace('{newAlias}', config.newAliasName)
    .replace('{ip}', config.ipAddress || 'unknown');
}

/**
 * Check if operation can be cancelled based on current state
 */
export function canCancelOperation(progress: RenameProgress): boolean {
  return progress.canCancel && progress.state !== 'success' && progress.state !== 'error';
}

/**
 * Get estimated time remaining for operation
 */
export function getEstimatedTimeRemaining(progress: RenameProgress): number {
  // Simple estimation based on progress percentage
  // This could be enhanced with actual timing data
  const baseTimeMs = 10000; // 10 seconds base time
  const progressPercentage = progress.currentStep / progress.totalSteps;
  const remainingPercentage = 1 - progressPercentage;
  return Math.round(baseTimeMs * remainingPercentage);
}