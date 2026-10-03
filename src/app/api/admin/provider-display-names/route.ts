import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { loadOidcProviders } from '@/lib/auth-config';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';

type SessionUserWithRole = {
  id: string;
  role?: Role;
};

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    const user = auth.user as SessionUserWithRole | undefined;

    if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    try {
      const providers = loadOidcProviders();

      const displayNames = providers.reduce((acc, provider) => {
        acc[provider.id] = provider.name;
        return acc;
      }, {} as Record<string, string>);

      logger.debug(`Provider display names mapping: ${JSON.stringify(displayNames)}`);

      return NextResponse.json(displayNames);
    } catch (error) {
      logger.error('Error fetching provider display names:', error);
      return NextResponse.json({ error: 'Failed to fetch provider display names' }, { status: 500 });
    }
  });
}
