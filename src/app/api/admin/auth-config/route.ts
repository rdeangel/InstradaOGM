import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { getAuthConfig } from '@/lib/server/auth-config';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    // Require authentication and admin privileges for accessing auth config
    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required to access auth configuration' }, { status: 401 });
    }

    // Check if user has admin privileges
    if (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
      const authConfig = await getAuthConfig();
      return NextResponse.json(authConfig);
    } catch (error) {
      logger.error('Failed to fetch auth config:', error);
      return NextResponse.json({ error: 'Failed to fetch auth configuration' }, { status: 500 });
    }
  });
}
