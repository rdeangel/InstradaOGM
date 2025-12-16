// src/lib/server/auth-actions.ts
'use server';

import { getAuthConfig } from './auth-config';
import { logger } from '@/lib/logger';

export async function getAuthConfigAction() {
  try {
    return await getAuthConfig();
  } catch (error) {
    logger.error('Failed to fetch auth config in server action:', error);
    throw new Error('Failed to fetch auth configuration');
  }
} 