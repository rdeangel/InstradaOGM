import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { getGlobalSettingsServer } from '@/lib/server/global-settings-utils';

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    try {
      // Require authentication for this endpoint
      if (!auth.user) {
        logger.warn('Global Settings Full API: Unauthenticated access attempt blocked');
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }

      // Check role permissions - only ADMIN and SUPER_ADMIN can access full settings
      if (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN) {
        logger.warn(`Global Settings Full API: Unauthorized access attempt by role: ${auth.user.role}`);
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }

    logger.info(`Global Settings Full API: Authenticated access by user ${auth.user.id} (${auth.user.role})`);

    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null;
    const result = await getGlobalSettingsServer(clientIp);

    if (!result.success || !result.data) {
      logger.error('Failed to fetch global settings for full API');
      return NextResponse.json({ error: 'Failed to fetch global settings' }, { status: 500 });
    }

    // Return full settings for admin use
    return NextResponse.json(result.data);
  } catch (error) {
      logger.error('Error in global settings full API:', error);
      return NextResponse.json({ error: 'Failed to fetch global settings' }, { status: 500 });
    }
  });
}
