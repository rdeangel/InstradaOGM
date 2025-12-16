/* eslint-disable security/detect-object-injection */
// This file uses bracket notation with typed keys from objects. All uses are safe.
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/auditLog';
import { logger } from '@/lib/logger';

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

/**
 * Validates an API key from the request headers
 * @param req - The NextRequest object
 * @returns Promise<ApiKeyValidationResult>
 */
export async function validateApiKey(req: NextRequest): Promise<ApiKeyValidationResult> {
  const authHeader = req.headers.get('authorization');
  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('remote-addr') || 'N/A';
  const userAgent = req.headers.get('user-agent') || 'N/A';
  const apiEndpoint = new URL(req.url).pathname;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      isValid: false,
      error: 'Missing or invalid Authorization header'
    };
  }

  const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix

  if (!apiKey || apiKey.length < 32) {
    return {
      isValid: false,
      error: 'Invalid API key format'
    };
  }

  try {
    // Find all API keys for the user (we'll need to check each one)
    const apiKeys = await prisma.apiKey.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          }
        }
      }
    });

    // Check each API key using constant-time approach to prevent timing attacks
    // We'll check all keys to prevent timing differences, but only process the first valid one
    let validKeyRecord: typeof apiKeys[0] | null = null;
    const validationPromises: Promise<boolean>[] = [];

    // Start all bcrypt comparisons simultaneously to reduce timing differences
    for (const keyRecord of apiKeys) {
      validationPromises.push(bcrypt.compare(apiKey, keyRecord.keyHash));
    }

    // Wait for all comparisons to complete
    const validationResults = await Promise.all(validationPromises);

    // Find the first valid key (if any) - this ensures constant time execution
    for (let i = 0; i < validationResults.length; i++) {
      if (validationResults[i] && !validKeyRecord) {
        validKeyRecord = apiKeys[i];
        // Continue the loop to ensure constant time execution
      }
    }

    if (validKeyRecord) {
      // Check if the key is disabled
      if (!validKeyRecord.enabled) {
        await logAuditEvent({
          userId: validKeyRecord.userId,
          action: 'API_KEY_VALIDATION_FAILURE',
          method: 'API_KEY',
          apiKeyId: validKeyRecord.id,
          apiKeyName: validKeyRecord.name,
          apiEndpoint,
          ipAddress,
          userAgent,
          reason: 'API key is disabled',
          details: {
            apiKeyId: validKeyRecord.id,
            apiKeyName: validKeyRecord.name,
            enabled: validKeyRecord.enabled,
            apiEndpoint,
          },
        });

        return {
          isValid: false,
          error: 'API key is disabled'
        };
      }

      // Check if the key has expired
      if (validKeyRecord.expiresAt && new Date() > validKeyRecord.expiresAt) {
        await logAuditEvent({
          userId: validKeyRecord.userId,
          action: 'API_KEY_VALIDATION_FAILURE',
          method: 'API_KEY',
          apiKeyId: validKeyRecord.id,
          apiKeyName: validKeyRecord.name,
          apiEndpoint,
          ipAddress,
          userAgent,
          reason: 'API key has expired',
          details: {
            apiKeyId: validKeyRecord.id,
            apiKeyName: validKeyRecord.name,
            expiresAt: validKeyRecord.expiresAt,
            apiEndpoint,
          },
        });

        return {
          isValid: false,
          error: 'API key has expired'
        };
      }

      // Update last used timestamp
      await prisma.apiKey.update({
        where: { id: validKeyRecord.id },
        data: { lastUsed: new Date() }
      });

      // Note: Successful API key validation is no longer logged to reduce audit log noise
      // Only failures are logged for security monitoring
      // Detailed API usage is tracked separately via ApiKeyUsageEvent table

      return {
        isValid: true,
        user: {
          id: validKeyRecord.user.id,
          name: validKeyRecord.user.name,
          email: validKeyRecord.user.email,
          role: validKeyRecord.user.role,
        },
        apiKeyId: validKeyRecord.id,
        apiKeyName: validKeyRecord.name,
      };
    }

    // If we get here, no valid key was found
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