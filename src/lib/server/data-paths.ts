/**
 * Centralized data folder path resolution
 * 
 * Supports configurable data folder via DATA_FOLDER_PATH environment variable.
 * Falls back to './data' for backward compatibility when not set.
 * 
 * @module data-paths
 */

import path from 'path';

// Get the base data folder path from environment or use default
const DATA_FOLDER_PATH = process.env.DATA_FOLDER_PATH || 'data';

// Resolve to absolute path
const BASE_DATA_PATH = path.isAbsolute(DATA_FOLDER_PATH)
    ? DATA_FOLDER_PATH
    : path.join(process.cwd(), DATA_FOLDER_PATH);

/**
 * Get the absolute path to a subdirectory within the data folder
 * 
 * @param subPath - Subdirectory path segments (e.g., 'backups', 'temp', '.service-state')
 * @returns Absolute path to the subdirectory
 * 
 * @example
 * ```typescript
 * // Get backups directory
 * const backupsDir = getDataPath('backups');
 * 
 * // Get temp directory
 * const tempDir = getDataPath('temp');
 * 
 * // Get nested path
 * const macVendorFile = getDataPath('mac-db', 'mac-vendors.json');
 * ```
 */
export function getDataPath(...subPath: string[]): string {
    return path.join(BASE_DATA_PATH, ...subPath);
}

/**
 * Get the base data folder path
 * 
 * @returns Absolute path to the base data folder
 * 
 * @example
 * ```typescript
 * const dataFolder = getBaseDataPath();
 * // Returns: /absolute/path/to/data (or custom path from DATA_FOLDER_PATH)
 * ```
 */
export function getBaseDataPath(): string {
    return BASE_DATA_PATH;
}
