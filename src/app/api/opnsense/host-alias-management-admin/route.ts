import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { getHostAliasesServer } from '@/lib/server/host-alias-management-utils';

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    try {
      // Require authentication for this endpoint
      if (!auth.user) {
        logger.warn('Host Aliases Admin API: Unauthenticated access attempt blocked');
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }

      // Check role permissions - only ADMIN and SUPER_ADMIN can access host aliases
      if (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN) {
        logger.warn(`Host Aliases Admin API: Unauthorized access attempt by role: ${auth.user.role}`);
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }

    logger.info(`Host Aliases Admin API: Authenticated access by user ${auth.user.id} (${auth.user.role})`);

    const result = await getHostAliasesServer();

    if (!result.success || !result.data) {
      logger.error('Failed to fetch host aliases for admin API');
      return NextResponse.json({ error: 'Failed to fetch host aliases' }, { status: 500 });
    }

    // Return host aliases for admin use
    return NextResponse.json(result.data);
    } catch (error) {
      logger.error('Error in host aliases admin API:', error);
      return NextResponse.json({ error: 'Failed to fetch host aliases' }, { status: 500 });
    }
  });
}
