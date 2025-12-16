import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';

function getDatabaseType(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return 'Unknown';
  }

  // Use the same logic as the backup route
  if (databaseUrl.startsWith('file:')) {
    return 'SQLite';
  } else if (databaseUrl.startsWith('postgresql:')) {
    return 'PostgreSQL';
  } else if (databaseUrl.startsWith('mysql:')) {
    return 'MySQL';
  } else {
    return 'Unknown';
  }
}

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    try {
      const dbType = getDatabaseType();
      return new NextResponse(JSON.stringify({ databaseType: dbType }), { status: 200 });
    } catch (error) {
      logger.error('Failed to get database info:', error);
      return new NextResponse(JSON.stringify({ error: 'Failed to get database info.' }), { status: 500 });
    }
  });
}