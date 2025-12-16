/**
 * Prisma Utility Functions
 * 
 * Provides database-agnostic query helpers for cross-database compatibility
 */

/**
 * Detect if the current database is PostgreSQL
 * SQLite doesn't support case-insensitive mode, PostgreSQL does
 */
export function isPostgreSQL(): boolean {
    const databaseUrl = process.env.DATABASE_URL || '';
    return databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://');
}

/**
 * Get the appropriate mode for case-insensitive queries
 * Returns 'insensitive' for PostgreSQL, undefined for SQLite
 * 
 * @example
 * ```typescript
 * {
 *   email: {
 *     contains: search,
 *     ...getCaseInsensitiveMode() // Only adds mode for PostgreSQL
 *   }
 * }
 * ```
 */
export function getCaseInsensitiveMode(): { mode: 'insensitive' } | Record<string, never> {
    return isPostgreSQL() ? { mode: 'insensitive' } : {};
}

/**
 * Create a case-insensitive contains filter
 * Works across both PostgreSQL and SQLite
 * 
 * For PostgreSQL: Uses mode: 'insensitive'
 * For SQLite: Converts search term to lowercase (requires lowercase column data)
 * 
 * @param value - The value to search for
 * @returns Prisma filter object
 * 
 * @example
 * ```typescript
 * {
 *   email: caseInsensitiveContains(searchTerm)
 * }
 * ```
 */
export function caseInsensitiveContains(value: string) {
    if (isPostgreSQL()) {
        return {
            contains: value,
            mode: 'insensitive' as const
        };
    } else {
        // For SQLite, use lowercase comparison
        // Note: This requires the column data to be stored in lowercase
        return {
            contains: value.toLowerCase()
        };
    }
}

/**
 * Create a case-insensitive equals filter
 * Works across both PostgreSQL and SQLite
 * 
 * @param value - The value to match
 * @returns Prisma filter object
 */
export function caseInsensitiveEquals(value: string) {
    if (isPostgreSQL()) {
        return {
            equals: value,
            mode: 'insensitive' as const
        };
    } else {
        return {
            equals: value.toLowerCase()
        };
    }
}
