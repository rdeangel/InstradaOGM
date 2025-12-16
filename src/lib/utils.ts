import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Prisma } from '@prisma/client'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) {
    return 'N/A';
  }

  const days = Math.floor(seconds / (3600 * 24));
  seconds %= (3600 * 24);
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (remainingSeconds > 0 || parts.length === 0) { // Show seconds if no other parts, or if it's just seconds
    parts.push(`${remainingSeconds}s`);
  }

  return parts.join(' ');
}

/**
 * Helper to safely transform JsonValue to T[] or undefined
 * Handles cases where empty objects {} were stored instead of empty arrays []
 */
export function toJsonArrayOrUndefined<T>(jsonValue: Prisma.JsonValue | undefined | null): T[] | undefined {
  if (Array.isArray(jsonValue)) {
    return jsonValue as T[];
  }
  // Handle case where empty object {} was stored instead of empty array []
  if (jsonValue !== null && jsonValue !== undefined && typeof jsonValue === 'object' && Object.keys(jsonValue).length === 0) {
    return [] as T[];
  }
  return undefined;
}

/**
 * Helper to safely transform JsonValue to T[] (returns empty array if undefined/null)
 * Handles cases where empty objects {} were stored instead of empty arrays []
 */
export function toJsonArray<T>(jsonValue: Prisma.JsonValue | undefined | null): T[] {
  if (Array.isArray(jsonValue)) {
    return jsonValue as T[];
  }
  // Handle case where empty object {} was stored instead of empty array []
  if (jsonValue !== null && jsonValue !== undefined && typeof jsonValue === 'object' && Object.keys(jsonValue).length === 0) {
    return [] as T[];
  }
  return [] as T[];
}
