import { NextResponse } from 'next/server';
import { authenticateRequest, handleAuthResponse } from '@/lib/auth-middleware';
import { isHostInUnmanagedGroups, fetchUnmanagedGroupFilterData } from '@/lib/unmanaged-group-utils';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { isIpAllowedForSelfService, getClientIp } from '@/lib/network-utils';
import { toJsonArrayOrUndefined } from '@/lib/utils';
import type { NetworkGroup } from '@/types/opnsense';
import type { ValidLocalNetwork } from '@/types/settings';
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

    // Self-service view: when the caller qualifies for self-service (own IP in allowed networks,
    // self-service enabled), evaluate unmanaged status WITHOUT the caller's per-user group filters —
    // matching the unauthenticated experience and the assign-side self-service grant. Otherwise a
    // self-service user could be locked out by their own per-user filters right after assigning their device.
    const globalSettings = await prisma.globalSettings.findFirst({ orderBy: { id: 'asc' } });
    const allowedNetworks = toJsonArrayOrUndefined<ValidLocalNetwork>(globalSettings?.allowedNetworks) || [];
    const clientIp = getClientIp(request) || '0.0.0.0';
    const isSelfServiceView =
      !globalSettings?.removeSelfServicePage &&
      isIpAllowedForSelfService(clientIp, clientIp, allowedNetworks, false).isAllowed;

    // Get user object if userId is provided (skipped for the self-service view).
    let user: User | null = null;
    if (!isSelfServiceView && userId && auth.user && auth.user.id === userId) {
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
