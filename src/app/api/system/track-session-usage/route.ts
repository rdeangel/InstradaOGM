import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { trackSessionUsageEvent } from '@/lib/session-usage-tracker';
import { logger } from '@/lib/logger';
import { getClientIp } from '@/lib/network-utils';

export async function POST(request: Request) {
    return authenticateAndTrackRequest(request, async (auth) => {
        if (!auth.user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        try {
            // Parse request body
            const body = await request.json();

            // Extract event data from request
            const {
                actionType,
                endpoint,
                method,
                statusCode,
                responseTime,
                pageUrl,
                referrer,
                metadata,
                errorType,
                errorMessage,
            } = body;

            // Get client IP and user agent
            const ipAddress = getClientIp(request) || undefined;
            const userAgent = request.headers.get('user-agent') || undefined;

            // Get session token from the session
            const sessionToken = auth.sessionToken || `session_${auth.user.id}_${new Date().toISOString().split('T')[0]}`;

            // Track the session usage event
            await trackSessionUsageEvent({
                sessionToken,
                userId: auth.user.id,
                endpoint,
                method,
                actionType,
                statusCode,
                responseTime,
                ipAddress,
                userAgent,
                pageUrl,
                referrer,
                errorType,
                errorMessage,
                metadata,
            });

            return NextResponse.json({ success: true });
        } catch (error) {
            logger.error('Error tracking session usage:', error);

            // Return success anyway to avoid breaking the client
            // Session tracking is not critical to application functionality
            return NextResponse.json({ success: true });
        }
    });
}
