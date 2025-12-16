// src/lib/server/auth-config.ts
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export interface AuthConfig {
  providers: Array<{
    id: string;
    name: string;
    type: string;
  }>;
  isLocalLoginAllowed: boolean;
  showRegistrationLink: boolean;
}

export async function getAuthConfig(): Promise<AuthConfig> {
  const providers = authOptions.providers.map(p => ({
    id: p.id,
    name: p.name,
    type: p.type
  }));

  // Determine if local login is allowed based on the environment variable
  const isLocalLoginAllowed = process.env.AUTH_ALLOW_LOCAL_LOGIN === 'true';
  
  // Fetch global settings from the database
  const globalSettings = await prisma.globalSettings.findFirst({
    orderBy: {
      id: 'asc',
    },
  });

  // Determine if the registration link should be shown based on the setting
  // Default to true if settings are not found or enableRegistration is not explicitly false
  const showRegistrationLink = globalSettings?.enableRegistration ?? true;

  return { providers, isLocalLoginAllowed, showRegistrationLink };
} 