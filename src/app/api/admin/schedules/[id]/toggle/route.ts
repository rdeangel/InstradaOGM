import { NextRequest, NextResponse } from 'next/server';
import { withAdminApiTracking } from '@/lib/api-route-wrapper';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { logAuditEvent } from '@/lib/auditLog';
import { toggleScheduleSchema } from '@/types/schedule';
import { scheduleExecutionService } from '@/lib/schedule-execution-service';

// POST /api/admin/schedules/[id]/toggle - Toggle enabled status
export const POST = withAdminApiTracking(
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

      const body = await request.json();
      const validation = toggleScheduleSchema.safeParse(body);

      if (!validation.success) {
        return NextResponse.json(
          { message: 'Validation error', errors: validation.error.errors },
          { status: 400 }
        );
      }

      const schedule = await prisma.scheduledAssignment.update({
        where: { id },
        data: { enabled: validation.data.enabled },
      });

      // Re-arm the precision timer immediately so the change takes effect
      // without waiting for the next reconciliation sweep (up to 5 min).
      await scheduleExecutionService.notifyScheduleChanged();

      // Audit log
      await logAuditEvent({
        action: validation.data.enabled ? 'SCHEDULE_ENABLED' : 'SCHEDULE_DISABLED',
        details: {
          scheduleId: id,
          name: schedule.name,
        },
      });

      return NextResponse.json(schedule);
    } catch (error) {
      logger.error('Error toggling schedule:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
