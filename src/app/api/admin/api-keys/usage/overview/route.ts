import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { getSystemWideUsageStats } from '@/lib/api-key-usage-stats';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';

// GET /api/admin/api-keys/usage/overview - Get system-wide API key usage overview (admin only)
export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    // Check if the user is authenticated and has admin privileges
    if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized'
      }, { status: 401 });
    }

    try {
      logger.debug(`Admin ${auth.user.id} (${auth.user.email}) fetching system-wide API key usage overview`);

      // Get system-wide usage statistics
      const systemStats = await getSystemWideUsageStats();

      const response = {
        success: true,
        data: systemStats,
      };

      return NextResponse.json(response);
    } catch (error) {
      logger.error('Error fetching system-wide API key usage overview:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to retrieve system-wide usage statistics'
      }, { status: 500 });
    }
  });
}
