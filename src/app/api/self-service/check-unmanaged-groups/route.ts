import { NextResponse } from 'next/server';
import { authenticateRequest, handleAuthResponse } from '@/lib/auth-middleware';
import { isHostInUnmanagedGroups, fetchUnmanagedGroupFilterData } from '@/lib/unmanaged-group-utils';
import { logger } from '@/lib/logger';
import type { NetworkGroup } from '@/types/opnsense';
import type { User } from 'next-auth';

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request);

    // Check for rate limiting errors
    if (auth.user) {
      const authError = handleAuthResponse(auth);
      if (authError) return authError;
    }

    const body = await request.json();
    const { hostGroups, userId } = body;

    // Validate input
    if (!Array.isArray(hostGroups)) {
      return NextResponse.json({
        error: 'Invalid input: hostGroups must be an array'
      }, { status: 400 });
    }

    // Get user object if userId is provided
    let user: User | null = null;
    if (userId && auth.user && auth.user.id === userId) {
      user = auth.user as User;
    }

    // Fetch filter data
    const filterData = await fetchUnmanagedGroupFilterData(user);

    // Check if host is in unmanaged groups
    const result = await isHostInUnmanagedGroups(
      hostGroups as NetworkGroup[],
      filterData.globalFilters,
      filterData.globallyDisabledGroups,
      user,
      filterData.userSpecificFilters
    );

    return NextResponse.json(result);

  } catch (error) {
    logger.error('Error checking unmanaged groups:', error);

    // Fail open - return not unmanaged on error
    return NextResponse.json({
      isUnmanaged: false,
      unmanagedGroups: [],
      reason: 'none',
      message: 'Unable to determine group management status. Self-service is available.'
    });
  }
}
