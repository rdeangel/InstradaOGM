import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { logAuditEvent } from '@/lib/auditLog';
import { Role } from '@/types/opnsense'; // Assuming Role is defined here or similar

// Define a type for the group-specific filter settings for API consistency
interface GroupSpecificFilter {
  id?: string; // Optional for creation
  pattern: string;
  description?: string;
  type: 'include' | 'exclude';
}

// GET /api/admin/groups/[groupId]/network-filters
export async function GET(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  return authenticateAndTrackRequest(request, async (auth) => {
  if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { groupId } = await params;

  try {
    const filters = await prisma.groupSpecificFilterSetting.findMany({
      where: { groupId },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return NextResponse.json(filters);
  } catch (error) {
    logger.error(`Failed to fetch group-specific network filters for group ${groupId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
  });
}

// POST /api/admin/groups/[groupId]/network-filters
// This endpoint will replace all existing filters for a given group with the new set.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  return authenticateAndTrackRequest(request, async (auth) => {
    const userId = auth.user?.id || null;
  const ipAddress = request.headers.get('x-forwarded-for') || null;
  const userAgent = request.headers.get('user-agent') || null;

  if (!auth.user) {
    return NextResponse.json({ error: auth.authError || 'Unauthorized' }, { status: 401 });
  }
  if (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { groupId } = await params;

  try {
    const newFilters: GroupSpecificFilter[] = await request.json();

    if (!Array.isArray(newFilters)) {
      return NextResponse.json({ error: 'Invalid input: Expected an array of filters.' }, { status: 400 });
    }

    // Validate each filter
    for (const filter of newFilters) {
      if (!filter.pattern || !filter.type || (filter.type !== 'include' && filter.type !== 'exclude')) {
        return NextResponse.json({ error: `Invalid filter object: ${JSON.stringify(filter)}` }, { status: 400 });
      }
    }

    // Fetch existing filters for audit logging
    const oldFilters = await prisma.groupSpecificFilterSetting.findMany({
      where: { groupId },
      orderBy: {
        createdAt: 'desc',
      },
    });

    await prisma.$transaction(async (tx) => {
      // Delete all existing filters for this group
      await tx.groupSpecificFilterSetting.deleteMany({
        where: { groupId },
      });

      // Create new filters if any are provided
      if (newFilters.length > 0) {
        await tx.groupSpecificFilterSetting.createMany({
          data: newFilters.map(f => ({
            groupId: groupId,
            pattern: f.pattern,
            description: f.description,
            type: f.type,
          })),
        });
      }
    });

    await logAuditEvent({
      userId,
      action: 'updateGroupSpecificNetworkFilters',
      details: { groupId, oldFilters, newFilters },
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ message: 'Group-specific network filters applied successfully' }, { status: 200 });
  } catch (error) {
    logger.error(`Failed to apply group-specific network filters for group ${groupId}:`, error);
    return NextResponse.json({ error: 'Failed to Save Settings' }, { status: 500 });
  }
  });
}