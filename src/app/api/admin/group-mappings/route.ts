import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';

// API endpoints for managing group mappings
// GET: List all group mappings
// POST: Create a new group mapping

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    try {
      if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

    const SsoGroupMappings = await prisma.ssoGroupMapping.findMany({
      orderBy: {
        ssoGroupName: 'asc',
      },
      include: {
        localGroup: true, // Include the associated local group details
      },
    });

    return NextResponse.json(SsoGroupMappings);
    } catch (error) {
      logger.error('Error listing group mappings:', error);
      return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
  });
}

export async function POST(req: Request) {
  return authenticateAndTrackRequest(req, async (auth) => {
    try {
      if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

    const { ssoProvider, ssoGroupName, localGroupId } = await req.json();

    if (!ssoProvider || !ssoGroupName || !localGroupId) {
      return NextResponse.json({ message: 'SSO Provider, SSO Group Name, and Local Group ID are required' }, { status: 400 });
    }

    const localGroup = await prisma.group.findUnique({
      where: { id: localGroupId },
    });

    if (!localGroup) {
      return NextResponse.json({ message: 'Local group not found' }, { status: 404 });
    }

    const existingMapping = await prisma.ssoGroupMapping.findUnique({
      where: {
        ssoProvider_ssoGroupName: {
          ssoProvider,
          ssoGroupName,
        },
      },
    });

    if (existingMapping) {
      return NextResponse.json({ message: `Mapping for SSO provider '${ssoProvider}' and group name '${ssoGroupName}' already exists` }, { status: 409 });
    }

    const newSsoGroupMapping = await prisma.ssoGroupMapping.create({
      data: {
        ssoProvider,
        ssoGroupName,
        localGroupId,
      },
      include: {
        localGroup: true, // Include the associated local group details in the response
      },
    });

    return NextResponse.json(newSsoGroupMapping, { status: 201 });
    } catch (error) {
      logger.error('Error creating group mapping:', error);
      return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
  });
}