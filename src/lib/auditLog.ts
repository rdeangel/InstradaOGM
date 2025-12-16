import { prisma } from "./prisma";
import { logger } from './logger';
import { Prisma } from "@prisma/client"; // Import Prisma namespace for JsonValue type

export interface AuditEventData {
    userId?: string | null;
    action: string; // Standardized action name (e.g., OPNSENSE_ALIAS_ADD_IP_ATTEMPT)
    event?: string; // Standardized event name (e.g., LOGIN_SUCCESS) - Keep for existing auth logs
    method?: string | null; // CREDENTIALS, OIDC, API_KEY, SESSION
    provider?: string | null; // e.g., GOOGLE, credentials
    ipAddress?: string | null;
    userAgent?: string | null;
    details?: Record<string, unknown>; // Allow any type for details initially, will be stringified
    reason?: string | null; // Often used for failure events
    sessionId?: string | null; // For logout/session related events
    email?: string | null; // User email if available
    isNewUser?: boolean; // For signin events
    role?: string | null; // Added for registration/role change events
    // API Key specific fields
    apiKeyId?: string | null; // ID of the API key used
    apiKeyName?: string | null; // Name of the API key used
    apiEndpoint?: string | null; // API endpoint being accessed
}

/**
 * Actions that create too much noise in audit logs and should be filtered out.
 * Only success actions are filtered - failures are always logged for security purposes.
 */
const FILTERED_SUCCESS_ACTIONS = new Set([
    '2FA_STATUS_CHECK_SUCCESS',
    'API_KEYS_LISTED',
    'SETTINGS_FETCH_SUCCESS',
    'USER_PROFILE_FETCH_SUCCESS',
    'SESSION_REFRESH_SUCCESS',
    'TOKEN_REFRESH_SUCCESS',
    // Add other noisy success actions here as needed
]);

/**
 * Logs an authentication or security-related event to the AuditLog table.
 * Handles potential errors during logging gracefully.
 * Filters out noisy success actions to reduce audit log noise.
 *
 * @param eventData - An object containing the details of the event to log.
 */
export async function logAuditEvent(eventData: AuditEventData): Promise<void> {
    // Filter out noisy success actions to reduce audit log noise
    if (FILTERED_SUCCESS_ACTIONS.has(eventData.action)) {
        logger.debug(`Skipping noisy audit event: ${eventData.action}`, {
            userId: eventData.userId,
            reason: 'Action filtered to reduce audit log noise'
        });
        return;
    }

    logger.debug(`Attempting to log audit event: ${eventData.action}`, {
        userId: eventData.userId,
        event: eventData.event,
        details: eventData.details,
        reason: eventData.reason,
        method: eventData.method,
        apiKeyId: eventData.apiKeyId,
        apiEndpoint: eventData.apiEndpoint,
    });
    try {
        // Construct the details object, including reason if provided
        const logDetails: Record<string, unknown> = {
            ...(eventData.details ?? {}), // Include existing details if they are an object
        };
        if (eventData.reason) {
            logDetails.reason = eventData.reason;
        }
        if (eventData.sessionId) {
            logDetails.sessionId = eventData.sessionId;
        }
         if (eventData.email) {
            logDetails.email = eventData.email;
        }
        if (eventData.isNewUser !== undefined) {
            logDetails.isNewUser = eventData.isNewUser;
        }
        if (eventData.role) { // Add role to details if provided
            logDetails.role = eventData.role;
        }
        // Add API key specific information
        if (eventData.apiKeyId) {
            logDetails.apiKeyId = eventData.apiKeyId;
        }
        if (eventData.apiKeyName) {
            logDetails.apiKeyName = eventData.apiKeyName;
        }
        if (eventData.apiEndpoint) {
            logDetails.apiEndpoint = eventData.apiEndpoint;
        }
        if (eventData.method) {
            logDetails.authMethod = eventData.method;
        }

        // Assign details object directly if not empty, otherwise undefined
        const detailsData: Prisma.InputJsonValue | undefined = Object.keys(logDetails).length > 0 ? logDetails as Prisma.InputJsonValue : undefined;

        await prisma.auditLog.create({
            data: {
                action: eventData.action,
                userId: eventData.userId || null,
                details: detailsData,
            },
        });
    } catch (error: unknown) {
        logger.error("Failed to write audit log:", {
            error: error instanceof Error ? error.message : String(error),
            action: eventData.action,
            userId: eventData.userId,
            stack: error instanceof Error ? error.stack : undefined
        });
        // Decide how to handle logging failures (e.g., log to console, metrics)
        // Avoid crashing the primary operation due to audit log failure.
    }
}

// Define a type for the auth object structure
interface AuthResult {
    user?: { id: string } | null;
    method?: string;
    apiKeyId?: string;
    rateLimitInfo?: {
        remaining: number;
        resetTime: number;
        limit: number;
    };
}

/**
 * Helper function for logging API key usage with consistent information
 * @param auth - Authentication result from authenticateRequest
 * @param action - The action being performed
 * @param details - Additional details about the action
 * @param request - The original request object for extracting endpoint info
 * @param reason - Optional reason for failure events
 */
export async function logApiKeyEvent(
    auth: AuthResult,
    action: string,
    details: Record<string, unknown> = {},
    request?: Request,
    reason?: string
): Promise<void> {
    const apiEndpoint = request ? new URL(request.url).pathname : null;
    
    await logAuditEvent({
        userId: auth.user?.id || null,
        action,
        method: auth.method || 'API_KEY',
        apiKeyId: auth.apiKeyId || null,
        apiEndpoint,
        details: {
            ...details,
            // Include API key information if available
            ...(auth.apiKeyId && { apiKeyId: auth.apiKeyId }),
            ...(auth.rateLimitInfo && { 
                rateLimitInfo: {
                    remaining: auth.rateLimitInfo.remaining,
                    resetTime: auth.rateLimitInfo.resetTime,
                    limit: auth.rateLimitInfo.limit
                }
            })
        },
        reason,
        ipAddress: request?.headers.get('x-forwarded-for') || request?.headers.get('remote-addr') || null,
        userAgent: request?.headers.get('user-agent') || null,
    });
}

/**
 * Helper function for logging API endpoint access with authentication method
 * @param auth - Authentication result from authenticateRequest
 * @param action - The action being performed
 * @param details - Additional details about the action
 * @param request - The original request object
 * @param reason - Optional reason for failure events
 */
export async function logApiAccess(
    auth: AuthResult,
    action: string,
    details: Record<string, unknown> = {},
    request?: Request,
    reason?: string
): Promise<void> {
    const apiEndpoint = request ? new URL(request.url).pathname : null;
    
    await logAuditEvent({
        userId: auth.user?.id || null,
        action,
        method: auth.method || 'UNKNOWN',
        apiKeyId: auth.apiKeyId || null,
        apiEndpoint,
        details: {
            ...details,
            // Include authentication method information
            authMethod: auth.method,
            ...(auth.apiKeyId && { apiKeyId: auth.apiKeyId }),
            ...(auth.rateLimitInfo && { 
                rateLimitInfo: {
                    remaining: auth.rateLimitInfo.remaining,
                    resetTime: auth.rateLimitInfo.resetTime,
                    limit: auth.rateLimitInfo.limit
                }
            })
        },
        reason,
        ipAddress: request?.headers.get('x-forwarded-for') || request?.headers.get('remote-addr') || null,
        userAgent: request?.headers.get('user-agent') || null,
    });
}

// Example Usage (will be used in auth.ts, API routes, etc.)
/*
logAuditEvent({
    event: 'LOGIN_FAILURE',
    userId: 'user-123',
    method: 'CREDENTIALS',
    reason: 'Invalid password',
    ipAddress: '192.168.1.100', // Example
    userAgent: 'Mozilla/5.0...' // Example
});
*/
