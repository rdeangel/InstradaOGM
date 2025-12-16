import { z } from 'zod';

export type ExclusionMode = 'FULL' | 'PARTIAL';

// MAC address validation regex (supports various formats)
// eslint-disable-next-line security/detect-unsafe-regex
const MAC_ADDRESS_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^([0-9A-Fa-f]{12})$/;

// Base MAC exclusion type
export interface MacExclusion {
  id: string;
  macAddressId: string;
  macAddress?: {
    id: string;
    macAddress: string;
    deviceName?: string | null;
    vendor?: string | null;
  };
  enabled: boolean;
  exclusionMode: ExclusionMode;
  reason?: string | null;
  excludedBy?: string | null;
  excludedAt: Date;
  lastModifiedBy?: string | null;
  lastModifiedAt: Date;
}

// Request/Response types
export interface CreateExclusionRequest {
  macAddress: string;
  reason?: string;
}

export interface UpdateExclusionRequest {
  enabled?: boolean;
  exclusionMode?: ExclusionMode;
  reason?: string;
}

export interface ToggleExclusionRequest {
  enabled: boolean;
  exclusionMode?: ExclusionMode;
  reason?: string;
}

export interface ExclusionListResponse {
  success: boolean;
  data: {
    exclusions: MacExclusion[];
    totalCount: number;
    currentPage: number;
    totalPages: number;
  };
}

export interface CreateExclusionResponse {
  success: boolean;
  data: MacExclusion;
  message?: string;
}

export interface UpdateExclusionResponse {
  success: boolean;
  data: MacExclusion;
  message?: string;
}

export interface DeleteExclusionResponse {
  success: boolean;
  message: string;
}

export interface ToggleExclusionResponse {
  success: boolean;
  data: MacExclusion;
  message: string;
}

export interface ExclusionSettingsResponse {
  success: boolean;
  data: {
    enableMacExclusions: boolean;
    macExclusionRetentionDays: number;
  };
}

export interface UpdateExclusionSettingsRequest {
  enableMacExclusions?: boolean;
  macExclusionRetentionDays?: number; // 1-365 days
}

export interface UpdateExclusionSettingsResponse {
  success: boolean;
  data: {
    enableMacExclusions: boolean;
    macExclusionRetentionDays: number;
  };
  message: string;
}

// Enhanced MAC history response with exclusion info
export interface EnhancedMacHistoryResponse {
  success: boolean;
  data: {
    macAddress: {
      id: string;
      macAddress: string;
      firstSeen: Date;
      lastSeen: Date;
      isActive: boolean;
      isPrivacyMac: boolean;
      deviceName?: string;
      vendor?: string;
      isOpnsenseMac?: boolean;
    };
    history: Array<{
      id: string;
      macAddressId: string;
      ipAddress: string;
      networkInterface?: string;
      firstSeen: Date;
      lastSeen: Date;
      detectionCount: number;
      isOpnsenseMac?: boolean;
    }>;
    ipHistory?: Array<{
      id: string;
      ipAddress: string;
      networkInterface?: string;
      firstSeen: Date;
      lastSeen: Date;
      detectionCount: number;
    }>;
    exclusion?: MacExclusion;
    isExcludedAndEnabled?: boolean;
    currentIps?: Array<{
      id: string;
      macAddressId: string;
      ipAddress: string;
      networkInterface?: string | null;
      firstSeen: Date;
      lastSeen: Date;
      detectionCount: number;
    }>;
    pagination?: {
      currentPage: number;
      pageSize: number;
      totalCount: number;
      totalPages: number;
    };
  };
}

export interface IpHistoryResponse {
  success: boolean;
  data: {
    ipHistory: Array<{
      id: string;
      ipAddress: string;
      networkInterface?: string;
      firstSeen: Date;
      lastSeen: Date;
      detectionCount: number;
    }>;
    totalCount: number;
    currentPage: number;
    totalPages: number;
  };
}

export interface ClearIpHistoryResponse {
  success: boolean;
  message: string;
  deletedCount: number;
}

// Zod validation schemas
export const createExclusionSchema = z.object({
  macAddress: z.string()
    .regex(MAC_ADDRESS_REGEX, 'Invalid MAC address format')
    .transform(val => val.replace(/[:-]/g, '').toLowerCase()), // Normalize to lowercase without separators
  reason: z.string().max(500, 'Reason must be less than 500 characters').optional(),
});

const exclusionModeEnum = z.enum(['FULL', 'PARTIAL']);

export const updateExclusionSchema = z.object({
  enabled: z.boolean().optional(),
  exclusionMode: exclusionModeEnum.optional(),
  reason: z.string().max(500, 'Reason must be less than 500 characters').optional(),
}).refine(data => data.enabled !== undefined || data.reason !== undefined || data.exclusionMode !== undefined, {
  message: 'At least one field must be provided for update',
});

export const toggleExclusionSchema = z.object({
  enabled: z.boolean(),
  exclusionMode: exclusionModeEnum.optional(),
  reason: z.string().max(500, 'Reason must be less than 500 characters').optional(),
});

export const updateExclusionSettingsSchema = z.object({
  enableMacExclusions: z.boolean().optional(),
  macExclusionRetentionDays: z.number()
    .int('Retention days must be an integer')
    .min(1, 'Retention days must be at least 1')
    .max(365, 'Retention days cannot exceed 365')
    .optional(),
}).refine(data => data.enableMacExclusions !== undefined || data.macExclusionRetentionDays !== undefined, {
  message: 'At least one field must be provided for update',
});

// Query parameter schemas
export const exclusionListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().optional(),
  enabled: z.coerce.boolean().optional(),
  sortBy: z.enum(['excludedAt', 'macAddress', 'reason']).default('excludedAt'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
});

export const macHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(500).default(25),
  days: z.coerce.number().int().positive().optional(),
  includeIpHistory: z.coerce.boolean().default(true),
});

export const ipHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  days: z.coerce.number().int().positive().optional(),
  sortBy: z.enum(['lastSeen', 'firstSeen', 'detectionCount']).default('lastSeen'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
});

// Helper function to normalize MAC address
export function normalizeMacAddress(macAddress: string): string {
  return macAddress.replace(/[:-]/g, '').toLowerCase();
}

// Helper function to validate MAC address format
export function validateMacAddress(macAddress: string): boolean {
  const cleanMac = macAddress.replace(/[:-]/g, '').toUpperCase();
  return /^[0-9A-F]{12}$/.test(cleanMac);
}

// Helper function to format MAC address for display
export function formatMacAddress(macAddress: string): string {
  const cleanMac = macAddress.replace(/[:-]/g, '').toUpperCase();
  if (cleanMac.length !== 12) return macAddress;
  
  return cleanMac.match(/.{2}/g)?.join(':') || macAddress;
}