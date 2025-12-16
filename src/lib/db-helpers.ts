/**
 * Database-agnostic helpers for handling differences between PostgreSQL and SQLite
 */
import type { Prisma } from '@prisma/client';

// Detect database type from environment
const DATABASE_URL = process.env.DATABASE_URL || '';
export const IS_SQLITE = DATABASE_URL.startsWith('file:');
export const IS_POSTGRES = DATABASE_URL.startsWith('postgresql:') || DATABASE_URL.startsWith('postgres:');

/**
 * Type for JSON values that works with both databases
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * Helper to convert JSON data for storage
 * PostgreSQL: stores as Json type (returns Prisma.InputJsonValue)
 * SQLite: stores as String (returns stringified JSON)
 */
export function toDbJson<T extends JsonValue>(data: T): string | Prisma.InputJsonValue {
    if (IS_SQLITE) {
        return JSON.stringify(data);
    }
    return data as Prisma.InputJsonValue;
}

/**
 * Helper to parse JSON data from database
 * PostgreSQL: returns as-is (already parsed)
 * SQLite: parses from string
 */
export function fromDbJson<T extends JsonValue>(data: unknown): T {
    if (IS_SQLITE && typeof data === 'string') {
        return JSON.parse(data) as T;
    }
    return data as T;
}

/**
 * Type-safe helper for Prisma JSON path queries
 * PostgreSQL: accepts string[]
 * SQLite: accepts string
 */
export function jsonPath(path: string[]): string[] | string {
    if (IS_SQLITE) {
        // SQLite expects a single string path (dot notation)
        return path.join('.');
    }
    // PostgreSQL expects an array
    return path;
}

/**
 * Build a JSON filter for querying nested properties
 * Handles database-specific syntax differences
 */
export function buildJsonFilter(
    path: string[],
    equals: string
): Prisma.JsonNullableFilter<"AuditLog"> {
    return {
        path: jsonPath(path),
        equals,
    } as Prisma.JsonNullableFilter<"AuditLog">;
}

/**
 * Check if database supports array_contains for JSON queries
 */
export function supportsArrayContains(): boolean {
    return IS_POSTGRES;
}
