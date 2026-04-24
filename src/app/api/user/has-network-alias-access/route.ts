import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user) {
      return NextResponse.json({ hasAccess: false }, { status: 401 });
    }

    const isAdmin = auth.user.role === Role.ADMIN || auth.user.role === Role.SUPER_ADMIN;

    if (!isAdmin) {
      return NextResponse.json({ hasAccess: false });
    }

    const settings = await prisma.globalSettings.findFirst({ orderBy: { id: 'asc' } });
    const featureEnabled = settings?.manageNetworkAliasesEnabled ?? false;

    return NextResponse.json({ hasAccess: featureEnabled });
  });
}
