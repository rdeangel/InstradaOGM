import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { getUserApiKeyUsageSummary, getBatchApiKeyUsageStats } from '@/lib/api-key-usage-stats';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

// GET /api/account/api-keys/usage/summary - Get usage summary for all user's API keys
export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user) {
      return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
    }

  try {
    // Get URL parameters for additional options
    const url = new URL(request.url);
    const includeDetailedStats = url.searchParams.get('includeDetailedStats') === 'true';

    logger.debug(`Fetching API key usage summary for user ${auth.user.id}`);

    // Get basic usage summary
    const usageSummary = await getUserApiKeyUsageSummary(auth.user.id);

    let detailedStats = null;
    if (includeDetailedStats && usageSummary.totalApiKeys > 0) {
      try {
        // Get user's API key IDs
        const userApiKeys = await prisma.apiKey.findMany({
          where: { userId: auth.user.id },
          select: { id: true },
        });

        const apiKeyIds = userApiKeys.map(key => key.id);
        
        // Get detailed stats for all API keys
        detailedStats = await getBatchApiKeyUsageStats(apiKeyIds);
      } catch (error) {
        logger.warn(`Failed to fetch detailed stats for user ${auth.user.id}:`, error);
        // Don't fail the entire request if detailed stats fail
      }
    }

    const response = {
      success: true,
      data: {
        summary: usageSummary,
        ...(detailedStats && { detailedStats }),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error(`Error fetching API key usage summary for user ${auth.user.id}:`, error);
    return NextResponse.json({ 
      success: false,
      message: 'Failed to retrieve usage summary'
    }, { status: 500 });
  }
  });
}
