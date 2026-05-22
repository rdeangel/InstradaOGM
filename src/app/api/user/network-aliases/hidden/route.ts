import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const settings = await prisma.globalSettings.findFirst({ orderBy: { id: 'asc' } });
    if (!settings?.manageNetworkAliasesEnabled) {
      return NextResponse.json({ hiddenUuids: [] });
    }

    const hidden = await prisma.networkAliasDisplaySettings.findMany({
      where: { hidden: true },
      select: { opnsenseAliasUuid: true },
    });

    return NextResponse.json({ hiddenUuids: hidden.map(h => h.opnsenseAliasUuid) });
  });
}
