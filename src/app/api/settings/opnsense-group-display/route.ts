import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma'; // Import Prisma client
import { logAuditEvent } from '@/lib/auditLog';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import type { OpnsenseGroupDisplay } from '@/types/settings'; // Import the type
import { Role } from '@/types/opnsense'; // Import Role enum

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    try {
      if (!auth.user || (auth.user.role !== Role.SUPER_ADMIN && auth.user.role !== Role.ADMIN)) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }
    const opnsenseGroupDisplays = await prisma.opnsenseGroupDisplay.findMany({
      orderBy: {
        friendlyName: 'asc',
      },
    });
    const globallyDisabledGroups = await prisma.globallyDisabledGroup.findMany({
      orderBy: {
        opnsenseUuid: 'asc',
      },
    });

    const disabledUuids = new Set(globallyDisabledGroups.map(g => g.opnsenseUuid.toLowerCase()));

    const enrichedGroupDisplays = opnsenseGroupDisplays.map(display => ({
      ...display,
      isGloballyDisabled: disabledUuids.has(display.opnsenseUuid.toLowerCase()),
    }));

    return NextResponse.json(enrichedGroupDisplays);
  } catch (error) {
    logger.error('Error fetching OPNsense group mappings:', error);
    return NextResponse.json({ error: 'Failed to fetch OPNsense group mappings' }, { status: 500 });
  }
  });
}

export async function POST(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    try {
      if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

    const userId = auth.user.id;
    const ipAddress = request.headers.get('x-forwarded-for') || null;
    const userAgent = request.headers.get('user-agent') || null;

    const incomingGroupDisplays: OpnsenseGroupDisplay[] = await request.json();

    // Validate input
    if (!Array.isArray(incomingGroupDisplays)) {
      return NextResponse.json({ error: 'Invalid input: Expected an array of OPNsense group mappings' }, { status: 400 });
    }

    const existingDisplays = await prisma.opnsenseGroupDisplay.findMany({
      orderBy: {
        friendlyName: 'asc',
      },
    });
    const existingDisabledGroups = await prisma.globallyDisabledGroup.findMany({
      orderBy: {
        opnsenseUuid: 'asc',
      },
    });

    const incomingDisplayUuids = new Set(incomingGroupDisplays.map(m => m.opnsenseUuid));
    const incomingDisabledUuids = new Set(incomingGroupDisplays.filter(m => m.isGloballyDisabled).map(m => m.opnsenseUuid));

    const displaysToDelete = existingDisplays.filter(
      (existing) => !incomingDisplayUuids.has(existing.opnsenseUuid)
    );

    const disabledGroupsToDelete = existingDisabledGroups.filter(
      (existing) => !incomingDisabledUuids.has(existing.opnsenseUuid)
    );

    const transactionActions: Array<ReturnType<typeof prisma.opnsenseGroupDisplay.deleteMany | typeof prisma.opnsenseGroupDisplay.upsert | typeof prisma.globallyDisabledGroup.deleteMany | typeof prisma.globallyDisabledGroup.upsert>> = [];

    // Handle deletions for OpnsenseGroupDisplay
    if (displaysToDelete.length > 0) {
      transactionActions.push(
        prisma.opnsenseGroupDisplay.deleteMany({
          where: {
            opnsenseUuid: {
              in: displaysToDelete.map((m) => m.opnsenseUuid),
            },
          },
        })
      );
    }

    // Handle deletions for GloballyDisabledGroup
    if (disabledGroupsToDelete.length > 0) {
      transactionActions.push(
        prisma.globallyDisabledGroup.deleteMany({
          where: {
            opnsenseUuid: {
              in: disabledGroupsToDelete.map((m) => m.opnsenseUuid),
            },
          },
        })
      );
    }

    incomingGroupDisplays.forEach((display) => {
      // Upsert OpnsenseGroupDisplay
      transactionActions.push(
        prisma.opnsenseGroupDisplay.upsert({
          where: { opnsenseUuid: display.opnsenseUuid.toLowerCase() }, // Ensure lowercase for consistency
          update: {
            friendlyName: display.friendlyName,
            iconIdentifier: display.iconIdentifier || null,
            groupType: display.groupType || 'SingleSelect'
          },
          create: {
            opnsenseUuid: display.opnsenseUuid.toLowerCase(), // Ensure lowercase for consistency
            friendlyName: display.friendlyName,
            iconIdentifier: display.iconIdentifier || null,
            groupType: display.groupType || 'SingleSelect',
          },
        })
      );

      // Handle GloballyDisabledGroup
      if (display.isGloballyDisabled) {
        transactionActions.push(
          prisma.globallyDisabledGroup.upsert({
            where: { opnsenseUuid: display.opnsenseUuid.toLowerCase() }, // Ensure lowercase for consistency
            update: {}, // No specific fields to update if it exists
            create: { opnsenseUuid: display.opnsenseUuid.toLowerCase() }, // Ensure lowercase for consistency
          })
        );
      } else {
        // If it's not disabled, ensure it's not in the GloballyDisabledGroup table
        transactionActions.push(
          prisma.globallyDisabledGroup.deleteMany({
            where: { opnsenseUuid: display.opnsenseUuid.toLowerCase() }, // Ensure lowercase for consistency
          })
        );
      }
    });

    const result = await prisma.$transaction(transactionActions);

    // Fetch the updated list of mappings and disabled groups for the audit log
    const updatedDisplays = await prisma.opnsenseGroupDisplay.findMany({
      orderBy: {
        friendlyName: 'asc',
      },
    });
    // const updatedDisabledGroups = await prisma.globallyDisabledGroup.findMany({
    //   orderBy: {
    //     opnsenseUuid: 'asc',
    //   },
    // });

    // Log audit event for synchronizing group mappings and disabled status
    await logAuditEvent({
      userId,
      action: 'syncOpnsenseGroupDisplayAndDisabledStatus',
      details: {
        newDisplays: updatedDisplays,
        deletedDisplayUuids: displaysToDelete.map(m => m.opnsenseUuid),
        newlyDisabledUuids: incomingGroupDisplays.filter(m => m.isGloballyDisabled && !existingDisabledGroups.some(ed => ed.opnsenseUuid === m.opnsenseUuid)).map(m => m.opnsenseUuid),
        reEnabledUuids: existingDisabledGroups.filter(ed => !incomingDisabledUuids.has(ed.opnsenseUuid)).map(ed => ed.opnsenseUuid),
      },
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ message: 'OPNsense group mappings saved successfully', result });
  } catch (error) {
    logger.error('Error saving OPNsense group mappings:', error);
    return NextResponse.json({ error: 'Failed to save OPNsense group mappings' }, { status: 500 });
  }
  });
}

export async function DELETE(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    try {
      if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

    const userId = auth.user.id;
    const ipAddress = request.headers.get('x-forwarded-for') || null;
    const userAgent = request.headers.get('user-agent') || null;

    const { opnsenseUuid } = await request.json();

    if (!opnsenseUuid) {
      return NextResponse.json({ error: 'Missing opnsenseUuid' }, { status: 400 });
    }

    // Delete from OpnsenseGroupDisplay
    await prisma.opnsenseGroupDisplay.delete({
      where: { opnsenseUuid },
    });

    // Also delete from GloballyDisabledGroup if it exists there
    await prisma.globallyDisabledGroup.deleteMany({
      where: { opnsenseUuid },
    });

    // Log audit event for deleting a group mapping
    await logAuditEvent({
      userId,
      action: 'deleteOpnsenseGroupDisplayAndDisabledStatus',
      details: { opnsenseUuid },
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ message: 'OPNsense group display and disabled status deleted successfully' });
  } catch (error) {
    logger.error('Error deleting OPNsense group display or disabled status:', error);
    return NextResponse.json({ error: 'Failed to delete OPNsense group display or disabled status' }, { status: 500 });
  }
  });
}