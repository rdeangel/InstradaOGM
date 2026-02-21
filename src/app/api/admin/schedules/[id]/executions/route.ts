import { NextRequest, NextResponse } from 'next/server';
import { withAdminApiTracking } from '@/lib/api-route-wrapper';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { executionHistoryQuerySchema } from '@/types/schedule';

// GET /api/admin/schedules/[id]/executions - Get execution history
export const GET = withAdminApiTracking(
  async (request: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    try {
      const params = await context?.params;
      const id = params?.id;

      if (!id) {
        return NextResponse.json(
          { message: 'Schedule ID is required' },
          { status: 400 }
        );
      }

      // Verify schedule exists
      const schedule = await prisma.scheduledAssignment.findUnique({ where: { id } });
      if (!schedule) {
        return NextResponse.json(
          { message: 'Schedule not found' },
          { status: 404 }
        );
      }

      const { searchParams } = new URL(request.url);
      const queryValidation = executionHistoryQuerySchema.safeParse({
        page: searchParams.get('page'),
        limit: searchParams.get('limit'),
        status: searchParams.get('status') ?? undefined,
      });

      if (!queryValidation.success) {
        return NextResponse.json(
          { message: 'Invalid query parameters', errors: queryValidation.error.errors },
          { status: 400 }
        );
      }

      const { page, limit, status } = queryValidation.data;
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = { scheduleId: id };
      if (status) where.status = status;

      const [executions, totalCount] = await Promise.all([
        prisma.scheduleExecution.findMany({
          where,
          orderBy: { executedAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.scheduleExecution.count({ where }),
      ]);

      return NextResponse.json({
        executions,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      });
    } catch (error) {
      logger.error('Error fetching execution history:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
