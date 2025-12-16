import * as fs from 'fs';
import * as path from 'path';
import { logger } from '@/lib/logger';
import { getDataPath } from '@/lib/server/data-paths';

// State directory for service coordination across workers
const STATE_DIR = getDataPath('.service-state');

// Service state interface
export interface ServiceState {
    isRunning: boolean;
    startedAt: string;
    workerPid: number;
    lastActivity?: string;
    intervalMinutes?: number;
}

/**
 * Ensure state directory exists
 */
function ensureStateDir(): void {
    try {
        // Path is validated by getDataPath() utility
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        if (!fs.existsSync(STATE_DIR)) {
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o755 });
        }
    } catch (error) {
        logger.error(`Failed to create state directory: ${STATE_DIR}`, error);
    }
}

/**
 * Get the state file path for a service
 */
function getStateFilePath(serviceName: string): string {
    return path.join(STATE_DIR, `${serviceName}.json`);
}

/**
 * Set service state (write to file system)
 */
export function setServiceState(serviceName: string, state: ServiceState): void {
    try {
        ensureStateDir();
        const filePath = getStateFilePath(serviceName);
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
        logger.debug(`Service state updated for ${serviceName}:`, state);
    } catch (error) {
        logger.error(`Failed to write service state for ${serviceName}:`, error);
    }
}

/**
 * Get service state (read from file system)
 * Returns null if service is not running or state file doesn't exist
 */
export function getServiceState(serviceName: string): ServiceState | null {
    try {
        const filePath = getStateFilePath(serviceName);

        // eslint-disable-next-line security/detect-non-literal-fs-filename
        if (!fs.existsSync(filePath)) {
            return null;
        }

        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const content = fs.readFileSync(filePath, 'utf8');
        const state = JSON.parse(content) as ServiceState;

        return state;
    } catch (error) {
        logger.warn(`Failed to read service state for ${serviceName}:`, error);
        return null;
    }
}

/**
 * Clear service state (delete state file)
 */
export function clearServiceState(serviceName: string): void {
    try {
        const filePath = getStateFilePath(serviceName);

        // eslint-disable-next-line security/detect-non-literal-fs-filename
        if (fs.existsSync(filePath)) {
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            fs.unlinkSync(filePath);
            logger.debug(`Service state cleared for ${serviceName}`);
        }
    } catch (error) {
        logger.error(`Failed to clear service state for ${serviceName}:`, error);
    }
}

/**
 * Update last activity timestamp for a service
 */
export function updateServiceActivity(serviceName: string): void {
    try {
        const state = getServiceState(serviceName);

        if (state) {
            state.lastActivity = new Date().toISOString();
            setServiceState(serviceName, state);
        }
    } catch (error) {
        logger.error(`Failed to update activity for ${serviceName}:`, error);
    }
}
