import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { userHasDeviceAccess } from '@/lib/user-permissions';

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    try {
      // Check if user is authenticated
      if (!auth.user) {
        return NextResponse.json({ hasAccess: false, message: 'Unauthorized' }, { status: 401 });
      }

      const userId = auth.user.id;

    if (!userId) {
        logger.error("User ID not found in session for has-device-access API check.");
        return NextResponse.json({ hasAccess: false, message: 'User ID not found in session' }, { status: 401 });
    }

    const hasAccess = await userHasDeviceAccess(userId);

    return NextResponse.json({ hasAccess });

  } catch (error) {
    logger.error("API Error checking Device Management:", error);
    return NextResponse.json({ hasAccess: false, message: 'Internal server error' }, { status: 500 });
  }
  });
}