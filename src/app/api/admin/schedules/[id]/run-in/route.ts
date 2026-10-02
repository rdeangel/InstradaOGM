import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminApiTracking } from '@/lib/api-route-wrapper';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { logAuditEvent } from '@/lib/auditLog';
import { scheduleExecutionService } from '@/lib/schedule-execution-service';

const MAX_DELAY_MINUTES = 7 * 24 * 60; // 7 days

const runInSchema = z.object({
  delayMinutes: z
    .number()
    .int()
    .positive('delayMinutes must be a positive integer')
    .max(MAX_DELAY_MINUTES, `delayMinutes must be at most ${MAX_DELAY_MINUTES} (7 days)`),
});

// POST /api/admin/schedules/[id]/run-in - Reschedule a ONCE schedule to now + delay
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
      const validation = runInSchema.safeParse(body);

      if (!validation.success) {
        return NextResponse.json(
          { message: 'Validation error', errors: validation.error.errors },
          { status: 400 }
        );
      }

      const existing = await prisma.scheduledAssignment.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          scheduleType: true,
          enabled: true,
          executeAt: true,
        },
      });

      if (!existing) {
        return NextResponse.json(
          { message: 'Schedule not found' },
          { status: 404 }
        );
      }

      if (existing.scheduleType !== 'ONCE') {
        return NextResponse.json(
          { message: 'Run-in is only supported for ONCE schedules' },
          { status: 400 }
        );
      }

      const { delayMinutes } = validation.data;
      const executeAt = new Date(Date.now() + delayMinutes * 60_000);

      const schedule = await prisma.scheduledAssignment.update({
        where: { id },
        data: {
          executeAt,
          enabled: true,
        },
        select: {
          id: true,
          name: true,
          scheduleType: true,
          enabled: true,
          executeAt: true,
          timezone: true,
          priority: true,
          lastExecutedAt: true,
        },
      });

      await scheduleExecutionService.notifyScheduleChanged();

      await logAuditEvent({
        action: 'SCHEDULE_RUN_IN',
        details: {
          scheduleId: id,
          name: schedule.name,
          delayMinutes,
          executeAt: schedule.executeAt?.toISOString() ?? null,
        },
      });

      return NextResponse.json(schedule);
    } catch (error) {
      logger.error('Error applying run-in delay to schedule:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
