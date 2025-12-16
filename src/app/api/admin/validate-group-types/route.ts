import { NextResponse } from 'next/server';
import { authenticateRequest, handleAuthResponse, trackUsageByAuthMethod } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';
import { exportAliases } from '@/lib/opnsense-api';

export async function GET(request: Request) {
  // Determine authentication level first
  let isSuperAdmin = false;
  let isAuthenticated = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let authResult: any = null;

  try {
    const auth = await authenticateRequest(request);
    authResult = auth;

    // Check for rate limiting errors for authenticated users
    if (auth.user) {
      const authError = handleAuthResponse(auth);
      if (authError) return authError;
    }

    // Set authentication flags
    isSuperAdmin = auth.user?.role === Role.SUPER_ADMIN;
    isAuthenticated = !!auth.user;
  } catch (authError) {
    // If authentication fails, continue as unauthenticated user
    logger.debug('Authentication failed, continuing as unauthenticated user:', authError);
  }

  try {

    // Fetch all network groups from OPNsense using the proper API function
    let opnsenseData;
    try {
      opnsenseData = await exportAliases();
    } catch (opnsenseError) {
      logger.error('OPNsense API call failed in group type validation:', opnsenseError);

      if (isSuperAdmin) {
        return NextResponse.json({
          error: `Failed to fetch network groups from OPNsense: ${opnsenseError instanceof Error ? opnsenseError.message : 'Unknown error'}`,
          canDisableGroupTypes: false,
          violations: [],
          violationCount: 0
        }, { status: 500 });
      } else if (isAuthenticated) {
        return NextResponse.json({
          canDisableGroupTypes: false,
          violationCount: 0
        }, { status: 500 });
      } else {
        return NextResponse.json({
          hasMultipleGroupAssignments: false
        }, { status: 500 });
      }
    }

    if (!opnsenseData?.aliases?.alias) {
      logger.error('No aliases data returned from OPNsense for group type validation');

      if (isSuperAdmin) {
        return NextResponse.json({
          error: 'No network groups data returned from OPNsense',
          canDisableGroupTypes: false,
          violations: [],
          violationCount: 0
        }, { status: 500 });
      } else if (isAuthenticated) {
        return NextResponse.json({
          canDisableGroupTypes: false,
          violationCount: 0
        }, { status: 500 });
      } else {
        return NextResponse.json({
          hasMultipleGroupAssignments: false
        }, { status: 500 });
      }
    }

    const allAliases = Object.values(opnsenseData.aliases.alias);

    // Create a map to track which groups each host alias belongs to
    const hostAliasGroupMap = new Map<string, string[]>();

    // Process network groups to find host alias memberships
    allAliases.forEach((alias: { type: string; content?: string; name: string }) => {
      if (alias.type === 'networkgroup' && alias.content) {
        // This is a network group - check which host aliases are members
        const memberAliasNames = alias.content.split(/\n|,/).map(name => name.trim()).filter(Boolean);

        memberAliasNames.forEach((memberName: string) => {
          if (!hostAliasGroupMap.has(memberName)) {
            hostAliasGroupMap.set(memberName, []);
          }
          hostAliasGroupMap.get(memberName)!.push(alias.name);
        });
      }
    });

    // Find host aliases that are in multiple groups
    const violations: Array<{
      hostAlias: string;
      groups: string[];
      groupCount: number;
    }> = [];

    hostAliasGroupMap.forEach((groups, hostAlias) => {
      if (groups.length > 1) {
        violations.push({
          hostAlias,
          groups: groups.sort(),
          groupCount: groups.length
        });
      }
    });

    // Sort violations by group count (descending) then by host alias name
    violations.sort((a, b) => {
      if (a.groupCount !== b.groupCount) {
        return b.groupCount - a.groupCount;
      }
      return a.hostAlias.localeCompare(b.hostAlias);
    });

    const canDisableGroupTypes = violations.length === 0;

    logger.info(`Group type validation completed: ${violations.length} violations found`);

    // Return different response levels based on authentication
    if (isSuperAdmin) {
      // Full detailed response for super admins
      return NextResponse.json({
        canDisableGroupTypes,
        violations,
        violationCount: violations.length,
        totalHostAliases: hostAliasGroupMap.size,
        totalGroups: allAliases.filter(a => a.type === 'networkgroup').length
      });
    } else if (isAuthenticated) {
      // Basic response for authenticated users
      // Track usage for authenticated requests
      if (authResult && authResult.user) {
        await trackUsageByAuthMethod(request, authResult, 200);
      }

      return NextResponse.json({
        canDisableGroupTypes,
        violationCount: violations.length
      });
    } else {
      // Track usage for authenticated requests (even if not super admin)
      if (authResult && authResult.user) {
        await trackUsageByAuthMethod(request, authResult, 200);
      }

      // Minimal response for unauthenticated users (for self-service page)
      return NextResponse.json({
        hasMultipleGroupAssignments: !canDisableGroupTypes
      });
    }

  } catch (error) {
    logger.error('Error validating group types:', error);

    // Track usage for authenticated requests (even failed ones)
    if (authResult && authResult.user) {
      await trackUsageByAuthMethod(request, authResult, 500);
    }

    // Return appropriate error response based on authentication level
    if (isSuperAdmin) {
      return NextResponse.json({
        error: 'Failed to validate group types',
        canDisableGroupTypes: false,
        violations: [],
        violationCount: 0
      }, { status: 500 });
    } else if (isAuthenticated) {
      return NextResponse.json({
        canDisableGroupTypes: false,
        violationCount: 0
      }, { status: 500 });
    } else {
      return NextResponse.json({
        hasMultipleGroupAssignments: false
      }, { status: 500 });
    }
  }
}
