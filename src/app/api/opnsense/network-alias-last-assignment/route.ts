import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { buildJsonFilter, supportsArrayContains } from '@/lib/db-helpers';

export async function GET(request: NextRequest) {
  return authenticateAndTrackRequest(request, async (auth) => {
    try {
      if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const settings = await prisma.globalSettings.findFirst({ orderBy: { id: 'asc' } });
      if (!settings?.manageNetworkAliasesEnabled) {
        return NextResponse.json({ error: 'Feature disabled' }, { status: 403 });
      }

      const { searchParams } = new URL(request.url);
      const aliasUuid = searchParams.get('aliasUuid');
      const aliasName = searchParams.get('aliasName');

      if (!aliasUuid && !aliasName) {
        return NextResponse.json({ error: 'aliasUuid or aliasName parameter is required' }, { status: 400 });
      }

      const actions = [
        'NETWORK_ALIAS_GROUP_ASSIGN_SUCCESS',
        'NETWORK_ALIAS_GROUP_UNASSIGN_SUCCESS',
      ];

      let assignments: Array<{
        id: string;
        userId: string | null;
        timestamp: Date;
        action: string;
        details: unknown;
        user: { id: string; name: string | null; email: string | null } | null;
      }>;

      if (supportsArrayContains()) {
        assignments = await prisma.auditLog.findMany({
          where: {
            action: { in: actions },
            ...(aliasUuid
              ? { details: buildJsonFilter(['aliasUuid'], aliasUuid) }
              : { details: buildJsonFilter(['aliasName'], aliasName!) }
            ),
          },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { timestamp: 'desc' },
          take: 1,
        }) as typeof assignments;
      } else {
        const allAssignments = await prisma.auditLog.findMany({
          where: { action: { in: actions } },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { timestamp: 'desc' },
        }) as typeof assignments;

        assignments = allAssignments.filter(a => {
          const details = a.details as Record<string, unknown> | null;
          if (!details) return false;
          if (aliasUuid && details.aliasUuid === aliasUuid) return true;
          if (aliasName && details.aliasName === aliasName) return true;
          return false;
        }).slice(0, 1);
      }

      const lastAssignment = assignments[0] || null;

      if (!lastAssignment) {
        return NextResponse.json({
          timestamp: null,
          operationType: null,
          action: null,
          groupName: null,
          userName: null,
        });
      }

      const details = lastAssignment.details as Record<string, unknown>;
      let operationType: string;
      if (lastAssignment.action.includes('ASSIGN') && !lastAssignment.action.includes('UNASSIGN')) {
        operationType = 'assign';
      } else {
        operationType = 'unassign';
      }

      const groupName = (typeof details.groupName === 'string' ? details.groupName : null) || null;

      return NextResponse.json({
        timestamp: lastAssignment.timestamp.toISOString(),
        operationType,
        action: lastAssignment.action,
        groupName,
        userName: lastAssignment.user?.name || lastAssignment.user?.email || null,
      });
    } catch (error) {
      logger.error('Error fetching network alias last assignment:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}
