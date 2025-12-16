/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, handleAuthResponse, trackApiUsage } from './auth-middleware';
import { logger } from './logger';

export type ApiRouteHandler = (
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) => Promise<NextResponse> | NextResponse;

export interface ApiRouteOptions {
  requireAuth?: boolean;
  trackUsage?: boolean;
  allowedRoles?: string[];
}

/**
 * Wrapper for API routes that provides authentication, usage tracking, and error handling
 */
export function withApiTracking(
  handler: ApiRouteHandler,
  options: ApiRouteOptions = {}
) {
  const {
    requireAuth = true,
    trackUsage = true,
    allowedRoles = [],
  } = options;

  return async function wrappedHandler(
    request: NextRequest,
    context?: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> {
    const startTime = Date.now();
    let auth: Record<string, unknown> | null = null;
    let response: NextResponse;
    let statusCode = 200;
    let errorType: string | undefined;
    let errorMessage: string | undefined;

    try {
      // Authentication check
      if (requireAuth) {
        auth = await authenticateRequest(request);
        const authError = handleAuthResponse(auth as any);
        if (authError) {
          statusCode = authError.status || 401;
          errorType = 'AUTH_ERROR';
          errorMessage = (auth as any).authError || 'Authentication failed';
          
          // Track failed authentication if we have an API key
          if (trackUsage && auth && (auth as any).apiKeyId) {
            const responseTime = Date.now() - startTime;
            await trackApiUsage(
              (auth as any).apiKeyId,
              request,
              statusCode,
              responseTime,
              errorType,
              errorMessage
            );
          }
          
          return authError;
        }

        // Role-based access control
        if (allowedRoles.length > 0 && auth && (auth as any).user) {
          if (!allowedRoles.includes((auth as any).user.role)) {
            statusCode = 403;
            errorType = 'ROLE_ERROR';
            errorMessage = 'Insufficient permissions';
            
            const forbiddenResponse = NextResponse.json(
              { message: 'Insufficient permissions' },
              { status: 403 }
            );

            // Track permission denied if we have an API key
            if (trackUsage && auth && (auth as any).apiKeyId) {
              const responseTime = Date.now() - startTime;
              await trackApiUsage(
                (auth as any).apiKeyId,
                request,
                statusCode,
                responseTime,
                errorType,
                errorMessage
              );
            }

            return forbiddenResponse;
          }
        }
      }

      // Execute the actual handler
      response = await handler(request, context);
      statusCode = response.status;

      // Track successful request
      if (trackUsage && auth && (auth as any).apiKeyId) {
        const responseTime = Date.now() - startTime;
        
        // Response size tracking could be added here if needed

        await trackApiUsage(
          (auth as any).apiKeyId,
          request,
          statusCode,
          responseTime
        );
      }

      return response;

    } catch (error) {
      logger.error('API route error:', error);
      
      statusCode = 500;
      errorType = 'INTERNAL_ERROR';
      errorMessage = error instanceof Error ? error.message : 'Internal server error';

      // Track error if we have an API key
      if (trackUsage && auth && (auth as any).apiKeyId) {
        const responseTime = Date.now() - startTime;
        await trackApiUsage(
          (auth as any).apiKeyId,
          request,
          statusCode,
          responseTime,
          errorType,
          errorMessage
        );
      }

      return NextResponse.json(
        { 
          success: false, 
          message: 'Internal server error' 
        },
        { status: 500 }
      );
    }
  };
}

/**
 * Simplified wrapper for public routes that don't require authentication
 */
export function withPublicApiTracking(handler: ApiRouteHandler) {
  return withApiTracking(handler, {
    requireAuth: false,
    trackUsage: false, // Public routes typically don't use API keys
  });
}

/**
 * Wrapper for admin-only routes
 */
export function withAdminApiTracking(handler: ApiRouteHandler) {
  return withApiTracking(handler, {
    requireAuth: true,
    trackUsage: true,
    allowedRoles: ['ADMIN', 'SUPER_ADMIN'],
  });
}

/**
 * Wrapper for super admin-only routes
 */
export function withSuperAdminApiTracking(handler: ApiRouteHandler) {
  return withApiTracking(handler, {
    requireAuth: true,
    trackUsage: true,
    allowedRoles: ['SUPER_ADMIN'],
  });
}

/**
 * Manual usage tracking for routes that handle their own authentication
 */
export async function trackManualApiUsage(
  apiKeyId: string,
  request: NextRequest,
  statusCode: number,
  startTime: number,
  errorType?: string,
  errorMessage?: string
): Promise<void> {
  const responseTime = Date.now() - startTime;
  await trackApiUsage(
    apiKeyId,
    request,
    statusCode,
    responseTime,
    errorType,
    errorMessage
  );
}
