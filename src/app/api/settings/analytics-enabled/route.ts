import { NextResponse } from 'next/server';
import { getGlobalSettings } from '@/lib/server/global-settings';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const settings = await getGlobalSettings();
    return NextResponse.json({ 
      success: true,
      enableAdvancedAnalytics: settings.enableAdvancedAnalytics || false
    });
  } catch (error) {
    logger.error('Failed to check analytics setting:', error);
    return NextResponse.json({ 
      success: false,
      enableAdvancedAnalytics: false // Default to disabled on error
    });
  }
}
