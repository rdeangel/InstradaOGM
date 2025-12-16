import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { loadOidcProviders } from '@/lib/auth-config';

export async function GET() {
  try {
    // Always include credentials provider
    const minimalProviders = [
      {
        id: 'credentials',
        name: 'Credentials',
        type: 'credentials',
        displayName: 'Credentials',
        available: true
      }
    ];

    // Load OIDC providers and add them as generic SSO options
    try {
      const oidcProviders = loadOidcProviders();

      // Add each OIDC provider as a generic SSO option
      oidcProviders.forEach(provider => {
        minimalProviders.push({
          id: provider.id, // Keep original case to match NextAuth.js provider registration
          name: provider.name,
          type: 'oauth',
          // Use generic display name instead of revealing specific provider
          displayName: 'SSO Login',
          available: true
        });
      });
    } catch (oidcError) {
      logger.warn('No OIDC providers configured or error loading them:', oidcError);
      // Continue with just credentials provider
    }

    return NextResponse.json(minimalProviders);
  } catch (error) {
    logger.error('Error fetching minimal auth providers:', error);
    return NextResponse.json({ error: 'Failed to fetch authentication providers' }, { status: 500 });
  }
}
