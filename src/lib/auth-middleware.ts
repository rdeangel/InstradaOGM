import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { validateApiKey } from './api-key-auth';
import { checkRateLimit, incrementRequestCount } from './rate-limiter';
import { prisma } from './prisma';
import { NextResponse, NextRequest } from 'next/server';
import { logger } from './logger';
import { logAuditEvent } from './auditLog';
import { trackApiUsageEvent } from './api-usage-tracker';
import { trackSessionUsageEvent } from './session-usage-tracker';
import { isAdvancedAnalyticsEnabled } from './analytics-settings';
import { shouldExcludeFromAnalytics } from './analytics-exclusions';
import { User } from '@prisma/client';

// Define types for authentication response
interface AuthResponse {
  user: User | null;
  method?: string;
  apiKeyId?: string;
  apiKeyName?: string;
  sessionToken?: string;
  authError?: string;
  rateLimitInfo?: {
    remaining: number;
    resetTime: number;
    limit: number;
    windowType: string;
  };
}

// Helper function to handle authentication and rate limiting errors
export function handleAuthResponse(auth: AuthResponse) {
  if (!auth.user) {
    return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
  }

  // Check for rate limiting errors
  if (auth.authError) {
    const status = auth.authError === 'Rate limit exceeded' ? 429 : 401;
    logger.debug(`Rate limit error returned: ${auth.authError}, status: ${status}`);

    // Log rate limit violations for audit purposes
    if (auth.authError === 'Rate limit exceeded' && auth.apiKeyId) {
      logAuditEvent({
        userId: auth.user.id,
        action: 'API_RATE_LIMIT_EXCEEDED',
        method: 'API_KEY',
        details: {
          apiKeyId: auth.apiKeyId,
          apiKeyName: auth.apiKeyName,
          rateLimitInfo: auth.rateLimitInfo,
          endpoint: 'unknown', // We don't have the endpoint info here
        },
        reason: `Rate limit exceeded: ${auth.rateLimitInfo?.windowType} window (${auth.rateLimitInfo?.limit} limit)`,
      }).catch(err => {
        logger.error('Failed to log rate limit audit event:', err);
      });
    }

    return NextResponse.json({
      message: auth.authError,
      ...(auth.rateLimitInfo && {
        rateLimitInfo: auth.rateLimitInfo
      })
    }, { status });
  }

  return null; // No error, continue with the request
}

/**
 * Track API usage after a successful request
 */
export async function trackApiUsage(
  apiKeyId: string,
  req: Request,
  statusCode: number,
  responseTime?: number,
  errorType?: string,
  errorMessage?: string
): Promise<void> {
  try {
    const url = new URL(req.url);
    const endpoint = url.pathname;
    const method = req.method;
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    // Get request size from content-length header
    const requestSize = req.headers.get('content-length') ? parseInt(req.headers.get('content-length')!) : undefined;

    await trackApiUsageEvent({
      apiKeyId,
      endpoint,
      method,
      statusCode,
      responseTime,
      ipAddress,
      userAgent,
      requestSize,
      errorType,
      errorMessage,
      rateLimitHit: statusCode === 429,
    });
  } catch (error) {
    logger.error('Failed to track API usage:', error);
    // Don't throw - we don't want to break the API request if tracking fails
  }
}

/**
 * Track session usage for analytics
 */
export async function trackSessionUsage(
  req: Request,
  sessionToken: string,
  userId: string,
  statusCode: number,
  responseTime?: number,
  errorType?: string,
  errorMessage?: string
): Promise<void> {
  try {
    // Check if advanced analytics is enabled
    const analyticsEnabled = await isAdvancedAnalyticsEnabled();
    if (!analyticsEnabled) {
      // logger.debug('Session tracking skipped - advanced analytics disabled');
      return;
    }

    // Extract endpoint from request
    const url = new URL(req.url);
    const endpoint = url.pathname;

    // Skip tracking for analytics-related endpoints and frequent session endpoints
    if (shouldExcludeFromAnalytics(endpoint, 'session')) {
      logger.debug(`Session tracking skipped for excluded endpoint: ${endpoint}`);
      return;
    }
    const method = req.method;
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;
    const referrer = req.headers.get('referer') || undefined;

    // Get request size from content-length header
    const requestSize = req.headers.get('content-length') ? parseInt(req.headers.get('content-length')!) : undefined;

    // Determine action type based on endpoint and method
    let actionType: 'api_call' | 'page_view' | 'form_submit' | 'click' | 'navigation' = 'api_call';

    if (endpoint.startsWith('/api/')) {
      actionType = 'api_call';
    } else if (method === 'GET') {
      actionType = 'page_view';
    } else if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      actionType = 'form_submit';
    } else {
      actionType = 'navigation';
    }

    await trackSessionUsageEvent({
      sessionToken,
      userId,
      endpoint,
      method,
      actionType,
      statusCode,
      responseTime,
      ipAddress,
      userAgent,
      pageUrl: endpoint.startsWith('/api/') ? undefined : url.href,
      referrer,
      requestSize,
      errorType,
      errorMessage,
    });
  } catch (error) {
    logger.error('Failed to track session usage:', error);
    // Don't throw - we don't want to break the request if tracking fails
  }
}

export async function authenticateRequest(req: Request) {
  // Try API key auth first (for automation, CLI, etc.)
  const authHeader = req.headers.get('authorization') || req.headers.get('x-api-key');
  let apiKey: string | null = null;
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7);
    } else {
      apiKey = authHeader;
    }
  }

  if (apiKey) {
    logger.debug(`API key authentication attempt: ${apiKey.substring(0, 8)}...`);
    const apiKeyResult = await validateApiKey(req as NextRequest); // NextRequest compatible
    if (apiKeyResult.isValid && apiKeyResult.user && apiKeyResult.apiKeyId) {
      logger.debug(`API key valid for user: ${apiKeyResult.user.email}`);

      // Fetch the full user record from Prisma
      const dbUser = await prisma.user.findUnique({ where: { id: apiKeyResult.user.id } });
      if (!dbUser || dbUser.role === 'SUSPENDED' || dbUser.role === 'PENDING') {
        logger.debug(`User account not active: ${apiKeyResult.user.email}`);
        return {
          user: null,
          method: 'apiKey',
          apiKeyId: apiKeyResult.apiKeyId,
          apiKeyName: apiKeyResult.apiKeyName,
          authError: 'User account is not active',
        };
      }

      // Rate limiting
      logger.debug(`Checking rate limits for API key: ${apiKeyResult.apiKeyId}`);
      const rateLimitInfo = await checkRateLimit(apiKeyResult.apiKeyId);
      logger.debug(`Rate limit check result: allowed=${rateLimitInfo.allowed}, windowType=${rateLimitInfo.windowType}`);

      if (!rateLimitInfo.allowed) {
        logger.debug(`Rate limit exceeded for API key: ${apiKeyResult.apiKeyId}`);

        // Log rate limit violation for audit purposes
        await logAuditEvent({
          userId: dbUser.id,
          action: 'API_RATE_LIMIT_EXCEEDED',
          method: 'API_KEY',
          details: {
            apiKeyId: apiKeyResult.apiKeyId,
            apiKeyName: apiKeyResult.apiKeyName,
            rateLimitInfo,
            endpoint: req.url || 'unknown',
            userAgent: req.headers.get('user-agent') || 'unknown',
            ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
          },
          reason: `Rate limit exceeded: ${rateLimitInfo.windowType} window (${rateLimitInfo.limit} limit)`,
        });

        return {
          user: dbUser,
          method: 'apiKey',
          apiKeyId: apiKeyResult.apiKeyId,
          apiKeyName: apiKeyResult.apiKeyName,
          authError: 'Rate limit exceeded',
          rateLimitInfo: {
            ...rateLimitInfo,
            resetTime: rateLimitInfo.resetTime.getTime(),
          },
        };
      }

      // Increment request count after successful rate limit check
      logger.debug(`Incrementing request count for API key: ${apiKeyResult.apiKeyId}`);
      await incrementRequestCount(apiKeyResult.apiKeyId);

      return {
        user: dbUser,
        method: 'apiKey',
        apiKeyId: apiKeyResult.apiKeyId,
        apiKeyName: apiKeyResult.apiKeyName,
        rateLimitInfo: {
          ...rateLimitInfo,
          resetTime: rateLimitInfo.resetTime.getTime(),
        },
      };
    } else {
      logger.debug(`API key validation failed: ${apiKeyResult.error}`);
      return {
        user: null,
        method: 'apiKey',
        authError: apiKeyResult.error || 'Invalid API key',
      };
    }
  }

  // Fallback to session auth
  const session = await getServerSession(authOptions);
  if (session && session.user) {
    // Create a consistent session token for tracking
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const sessionToken = `session_${session.user.id}_${today}`;

    // Check user status
    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!dbUser || dbUser.role === 'SUSPENDED' || dbUser.role === 'PENDING') {
      return {
        user: null,
        method: 'session',
        sessionToken,
        authError: 'User account is not active',
      };
    }
    return {
      user: dbUser,
      method: 'session',
      sessionToken,
    };
  }

  return {
    user: null,
    method: undefined,
    authError: 'Not authenticated',
  };
}

/**
 * Track usage based on authentication method (API key or session)
 */
export async function trackUsageByAuthMethod(
  req: Request,
  auth: AuthResponse,
  statusCode: number,
  responseTime?: number,
  errorType?: string,
  errorMessage?: string
): Promise<void> {
  if (auth.method === 'apiKey' && auth.apiKeyId) {
    await trackApiUsage(auth.apiKeyId, req, statusCode, responseTime, errorType, errorMessage);
  } else if (auth.method === 'session' && auth.sessionToken && auth.user) {
    await trackSessionUsage(req, auth.sessionToken, auth.user.id, statusCode, responseTime, errorType, errorMessage);
  }
}

/**
 * Enhanced authentication and response handler that automatically tracks usage
 * This is a drop-in replacement for the manual authenticateRequest + handleAuthResponse pattern
 */
export async function authenticateAndTrackRequest(
  req: Request,
  handler: (auth: AuthResponse) => Promise<Response>
): Promise<Response> {
  const startTime = Date.now();
  let response: Response;
  let statusCode = 200;
  let errorType: string | undefined;
  let errorMessage: string | undefined;

  try {
    // Authenticate the request
    const auth = await authenticateRequest(req);

    // Check for authentication errors
    const authError = handleAuthResponse(auth);
    if (authError) {
      statusCode = authError.status || 401;
      errorType = 'AUTH_ERROR';
      errorMessage = auth.authError || 'Authentication failed';

      // Track failed authentication
      const responseTime = Date.now() - startTime;
      await trackUsageByAuthMethod(req, auth, statusCode, responseTime, errorType, errorMessage);

      return authError;
    }

    // Execute the handler
    response = await handler(auth);
    statusCode = response.status;

    // Track successful request
    const responseTime = Date.now() - startTime;
    await trackUsageByAuthMethod(req, auth, statusCode, responseTime);

    return response;

  } catch (error) {
    statusCode = 500;
    errorType = 'INTERNAL_ERROR';
    errorMessage = error instanceof Error ? error.message : 'Internal server error';

    // Track error
    const responseTime = Date.now() - startTime;
    const auth = { method: undefined, user: null } as AuthResponse;
    await trackUsageByAuthMethod(req, auth, statusCode, responseTime, errorType, errorMessage);

    return new Response(
      JSON.stringify({
        success: false,
        message: 'Internal server error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}