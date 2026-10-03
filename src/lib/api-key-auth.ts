/* eslint-disable security/detect-object-injection */
// This file uses bracket notation with typed keys from objects. All uses are safe.
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/auditLog';
import { logger } from '@/lib/logger';
import { getClientIp } from '@/lib/network-utils';
import { parsePresentedApiKey } from '@/lib/api-key-format';
import { legacyMemo, takeLegacyApiKeyScan } from '@/lib/api-key-legacy-limit';

export interface ApiKeyUser {
  id: string;
  name?: string | null;
  email?: string | null;
  role: string;
}

export interface ApiKeyValidationResult {
  isValid: boolean;
  user?: ApiKeyUser;
  apiKeyId?: string;
  apiKeyName?: string; // Add API key name to the result
  error?: string;
}

const API_KEY_USER_INCLUDE = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
} as const;

type ApiKeyWithUser = {
  id: string;
  name: string;
  keyHash: string;
  keyPrefix: string | null;
  userId: string;
  enabled: boolean;
  expiresAt: Date | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    role: string;
  };
};

function presentedKeyMemoId(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Validates an API key from the request headers
 * @param req - The NextRequest object
 * @returns Promise<ApiKeyValidationResult>
 */
export async function validateApiKey(req: NextRequest): Promise<ApiKeyValidationResult> {
  const authHeader = req.headers.get('authorization');
  const apiKeyHeader = req.headers.get('x-api-key');
  const ipAddress = getClientIp(req) || 'N/A';
  const userAgent = req.headers.get('user-agent') || 'N/A';
  const apiEndpoint = new URL(req.url).pathname;

  // Accept the key from either `Authorization: Bearer <key>` (primary) or `x-api-key: <key>`.
  let apiKey: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
  } else if (apiKeyHeader) {
    // x-api-key is normally sent raw, but tolerate a stray "Bearer " prefix
    apiKey = apiKeyHeader.startsWith('Bearer ') ? apiKeyHeader.substring(7) : apiKeyHeader;
  }

  if (!apiKey) {
    return {
      isValid: false,
      error: 'Missing API key (use "Authorization: Bearer <key>" or "x-api-key: <key>")'
    };
  }

  if (apiKey.length < 32) {
    return {
      isValid: false,
      error: 'Invalid API key format'
    };
  }

  const parsed = parsePresentedApiKey(apiKey);
  if (!parsed) {
    return {
      isValid: false,
      error: 'Invalid API key format'
    };
  }

  const invalidKey = async (): Promise<ApiKeyValidationResult> => {
    await logAuditEvent({
      userId: null,
      action: 'API_KEY_VALIDATION_FAILURE',
      method: 'API_KEY',
      apiEndpoint,
      ipAddress,
      userAgent,
      reason: 'Invalid API key provided',
      details: {
        apiEndpoint,
        providedKeyLength: apiKey.length,
      },
    });

    return {
      isValid: false,
      error: 'Invalid API key'
    };
  };

  const finish = async (row: ApiKeyWithUser): Promise<ApiKeyValidationResult> => {
    if (!row.enabled) {
      await logAuditEvent({
        userId: row.userId,
        action: 'API_KEY_VALIDATION_FAILURE',
        method: 'API_KEY',
        apiKeyId: row.id,
        apiKeyName: row.name,
        apiEndpoint,
        ipAddress,
        userAgent,
        reason: 'API key is disabled',
        details: {
          apiKeyId: row.id,
          apiKeyName: row.name,
          enabled: row.enabled,
          apiEndpoint,
        },
      });

      return {
        isValid: false,
        error: 'API key is disabled'
      };
    }

    if (row.expiresAt && new Date() > row.expiresAt) {
      await logAuditEvent({
        userId: row.userId,
        action: 'API_KEY_VALIDATION_FAILURE',
        method: 'API_KEY',
        apiKeyId: row.id,
        apiKeyName: row.name,
        apiEndpoint,
        ipAddress,
        userAgent,
        reason: 'API key has expired',
        details: {
          apiKeyId: row.id,
          apiKeyName: row.name,
          expiresAt: row.expiresAt,
          apiEndpoint,
        },
      });

      return {
        isValid: false,
        error: 'API key has expired'
      };
    }

    await prisma.apiKey.update({
      where: { id: row.id },
      data: { lastUsed: new Date() }
    });

    return {
      isValid: true,
      user: {
        id: row.user.id,
        name: row.user.name,
        email: row.user.email,
        role: row.user.role,
      },
      apiKeyId: row.id,
      apiKeyName: row.name,
    };
  };

  try {
    if (parsed.kind === 'prefixed') {
      const row = await prisma.apiKey.findUnique({
        where: { keyPrefix: parsed.prefix },
        include: API_KEY_USER_INCLUDE,
      });
      if (!row || !(await bcrypt.compare(apiKey, row.keyHash))) {
        return invalidKey();
      }
      return finish(row);
    }

    const memoKey = presentedKeyMemoId(apiKey);
    const memoId = legacyMemo.get(memoKey);
    if (memoId) {
      const row = await prisma.apiKey.findUnique({
        where: { id: memoId },
        include: API_KEY_USER_INCLUDE,
      });
      if (row && row.keyPrefix === null && (await bcrypt.compare(apiKey, row.keyHash))) {
        return finish(row);
      }
      legacyMemo.delete(memoKey);
    }

    if (!takeLegacyApiKeyScan(ipAddress)) {
      return {
        isValid: false,
        error: 'Legacy API key lookup limited'
      };
    }

    const now = new Date();
    const rows = await prisma.apiKey.findMany({
      where: {
        keyPrefix: null,
        enabled: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: API_KEY_USER_INCLUDE,
    });
    const results = await Promise.all(rows.map((r) => bcrypt.compare(apiKey, r.keyHash)));
    let match: (typeof rows)[0] | null = null;
    for (let i = 0; i < results.length; i++) {
      if (results[i] && !match) {
        match = rows[i];
      }
    }
    if (match) {
      legacyMemo.set(memoKey, match.id);
      return finish(match);
    }
    return invalidKey();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('API key validation error:', error);
    
    await logAuditEvent({
      userId: null,
      action: 'API_KEY_VALIDATION_FAILURE',
      method: 'API_KEY',
      apiEndpoint,
      ipAddress,
      userAgent,
      reason: `Internal Server Error: ${errorMessage}`,
      details: {
        apiEndpoint,
        error: errorMessage,
      },
    });

    return {
      isValid: false,
      error: 'Internal server error during API key validation'
    };
  }
}

/**
 * Middleware function to require API key authentication
 * @param req - The NextRequest object
 * @returns Promise<ApiKeyValidationResult>
 */
export async function requireApiKey(req: NextRequest): Promise<ApiKeyValidationResult> {
  const result = await validateApiKey(req);
  
  if (!result.isValid) {
    return result;
  }

  return result;
}

/**
 * Optional API key authentication - returns user if valid API key is provided
 * @param req - The NextRequest object
 * @returns Promise<ApiKeyValidationResult>
 */
export async function optionalApiKey(req: NextRequest): Promise<ApiKeyValidationResult> {
  const authHeader = req.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      isValid: false,
      error: 'No API key provided'
    };
  }

  return await validateApiKey(req);
}
