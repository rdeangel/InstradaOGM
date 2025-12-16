import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { loadOidcProviders } from '@/lib/auth-config';

export async function GET() {
  try {
    // Load configured OIDC providers
    const providers = loadOidcProviders();

    // Create a mapping of provider IDs to their display names
    // This uses the DISPLAY_NAME from environment variables
    const displayNames = providers.reduce((acc, provider) => {
      acc[provider.id] = provider.name; // provider.name comes from AUTH_OIDC_PROVIDER_${alias}_DISPLAY_NAME
      return acc;
    }, {} as Record<string, string>);

    logger.info(`Provider display names mapping: ${JSON.stringify(displayNames)}`);

    return NextResponse.json(displayNames);
  } catch (error) {
    logger.error('Error fetching provider display names:', error);
    return NextResponse.json({ error: 'Failed to fetch provider display names' }, { status: 500 });
  }
}