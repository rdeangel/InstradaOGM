import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { getUserApiKeyUsageSummary, getBatchApiKeyUsageStats } from '@/lib/api-key-usage-stats';
import { prisma } from '@/lib/prisma';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ userId: string }>;
}

// GET /api/admin/api-keys/usage/users/[userId] - Get API key usage for a specific user (admin only)
export async function GET(request: Request, context: RouteContext) {
  return authenticateAndTrackRequest(request, async (auth) => {
    // Check if the user is authenticated and has admin privileges
    if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized'
      }, { status: 401 });
    }

    const { userId } = await context.params;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({
        success: false,
        message: 'Valid user ID parameter is missing'
      }, { status: 400 });
    }

    try {
      // Verify that the user exists
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });

      if (!targetUser) {
        return NextResponse.json({
          success: false,
          message: 'User not found'
        }, { status: 404 });
      }

      // Get URL parameters for additional options
      const url = new URL(request.url);
      const includeDetailedStats = url.searchParams.get('includeDetailedStats') === 'true';

      logger.debug(`Admin ${auth.user.id} fetching API key usage for user ${userId} (${targetUser.email})`);

      // Get usage summary for the target user
      const usageSummary = await getUserApiKeyUsageSummary(userId);

      let detailedStats = null;
      if (includeDetailedStats && usageSummary.totalApiKeys > 0) {
        try {
          // Get target user's API key IDs
          const userApiKeys = await prisma.apiKey.findMany({
            where: { userId },
            select: { id: true },
          });

          const apiKeyIds = userApiKeys.map(key => key.id);

          // Get detailed stats for all API keys
          detailedStats = await getBatchApiKeyUsageStats(apiKeyIds);
        } catch (error) {
          logger.warn(`Failed to fetch detailed stats for user ${userId}:`, error);
          // Don't fail the entire request if detailed stats fail
        }
      }

      const response = {
        success: true,
        data: {
          user: {
            id: targetUser.id,
            name: targetUser.name,
            email: targetUser.email,
            role: targetUser.role,
            createdAt: targetUser.createdAt,
          },
          usage: {
            summary: usageSummary,
            ...(detailedStats && { detailedStats }),
          },
        },
      };

      return NextResponse.json(response);
    } catch (error) {
      logger.error(`Error fetching API key usage for user ${userId}:`, error);
      return NextResponse.json({
        success: false,
        message: 'Failed to retrieve user API key usage'
      }, { status: 500 });
    }
  });
}
