import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { loadOidcProviders } from '@/lib/auth-config';

export async function GET() {
  try {
    // Load the configured OIDC providers
    const providers = loadOidcProviders();

    // Return only essential provider information for UI rendering
    // Remove sensitive details like issuer URLs, client IDs, etc.
    const minimalProviders = providers.map(provider => ({
      id: provider.id,
      name: provider.name,
      type: 'oauth', // All OIDC providers are OAuth type
      // Use generic display names instead of revealing internal provider names
      displayName: 'SSO Login',
      available: true
    }));

    return NextResponse.json(minimalProviders);
  } catch (error) {
    logger.error('Error fetching minimal providers:', error);
    return NextResponse.json({ error: 'Failed to fetch authentication providers' }, { status: 500 });
  }
}