import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    // At this point, auth.user is guaranteed to be non-null
    if (!auth.user) {
      return NextResponse.json({ message: 'Unexpected authentication error' }, { status: 500 });
    }

  logger.info(`Rate limit test endpoint called by user ${auth.user.id} (${auth.user.email})`);
  
  return NextResponse.json({ 
    message: 'Rate limit test successful',
    user: {
      id: auth.user.id,
      email: auth.user.email,
      role: auth.user.role
    },
    authMethod: auth.method,
    ...(auth.apiKeyId && { apiKeyId: auth.apiKeyId }),
    ...(auth.apiKeyName && { apiKeyName: auth.apiKeyName }),
    ...(auth.rateLimitInfo && { rateLimitInfo: auth.rateLimitInfo })
  });
  });
}