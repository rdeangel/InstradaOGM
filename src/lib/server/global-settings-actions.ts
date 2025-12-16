// src/lib/server/global-settings-actions.ts
'use server';

import { logger } from '@/lib/logger';
import { getGlobalSettings } from './global-settings';

export async function getGlobalSettingsAction(clientIp?: string | null) {
  try {
    return await getGlobalSettings(clientIp);
  } catch (error) {
    logger.error('Failed to fetch global settings in server action:', error);
    throw new Error('Failed to fetch global settings');
  }
}