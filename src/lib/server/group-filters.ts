// src/lib/server/group-filters.ts
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { GroupFilter } from '@/types/settings';

/**
 * Server-side function to fetch group filters from the database
 * This function can be used in server components, API routes, and other server-side code
 * @returns Promise<GroupFilter[]> Array of group filters
 */
export async function getGroupFilters(): Promise<GroupFilter[]> {
  try {
    const filterSettings = await prisma.groupFilterSetting.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    // Map Prisma model to our application type
    const responseFilters: GroupFilter[] = filterSettings.map(dbFilter => ({
        id: dbFilter.id,
        pattern: dbFilter.pattern,
        description: dbFilter.description || '',
        type: dbFilter.type as 'include' | 'exclude',
    }));
    
    return responseFilters;
  } catch (error) {
    logger.error('Failed to fetch group filter settings (server-side):', error);
    return [];
  }
} 