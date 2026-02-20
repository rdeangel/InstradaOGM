import { NextRequest, NextResponse } from 'next/server';
import { withAdminApiTracking } from '@/lib/api-route-wrapper';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { logAuditEvent } from '@/lib/auditLog';
import { updateScheduleSchema } from '@/types/schedule';
import { validateScheduleData } from '@/lib/schedule-validation';
import { scheduleExecutionService } from '@/lib/schedule-execution-service';

// GET /api/admin/schedules/[id] - Get schedule detail
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

      const schedule = await prisma.scheduledAssignment.findUnique({
        where: { id },
        include: {
          days: {
            include: {
              windows: {
                include: {
                  actions: {
                    orderBy: { sortOrder: 'asc' },
                  },
                },
              },
            },
            orderBy: { dayOfWeek: 'asc' },
          },
          onceActions: {
            orderBy: { sortOrder: 'asc' },
          },
          recurringActions: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      if (!schedule) {
        return NextResponse.json(
          { message: 'Schedule not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(schedule);
    } catch (error) {
      logger.error('Error fetching schedule:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

// PUT /api/admin/schedules/[id] - Update schedule (full replacement)
export const PUT = withAdminApiTracking(
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
      const existing = await prisma.scheduledAssignment.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json(
          { message: 'Schedule not found' },
          { status: 404 }
        );
      }

      const body = await request.json();
      const validation = updateScheduleSchema.safeParse(body);

      if (!validation.success) {
        return NextResponse.json(
          { message: 'Validation error', errors: validation.error.errors },
          { status: 400 }
        );
      }

      const data = validation.data;

      // Shared validation — same logic as POST (cron, group UUIDs, action constraints, overlaps)
      const validationError = await validateScheduleData(data);
      if (validationError) {
        return NextResponse.json(
          { message: validationError.message },
          { status: validationError.status }
        );
      }

      // Use transaction: delete all nested data, then update with new data
      const schedule = await prisma.$transaction(async (tx) => {
        // Delete existing nested data
        await tx.scheduledAssignment.update({
          where: { id },
          data: {
            days: { deleteMany: {} },
            onceActions: { deleteMany: {} },
            recurringActions: { deleteMany: {} },
          },
        });

        // Update with new data
        return tx.scheduledAssignment.update({
          where: { id },
          data: {
            name: data.name,
            description: data.description,
            enabled: data.enabled,
            priority: data.priority,
            scheduleType: data.scheduleType,
            timezone: data.timezone,
            executeAt: data.executeAt ? new Date(data.executeAt) : null,
            cronExpression: data.cronExpression,
            targetType: data.targetType,
            targetSelector: data.targetSelector,

            // Recreate nested days/windows/actions
            days: data.days ? {
              create: data.days.map(day => ({
                dayOfWeek: day.dayOfWeek,
                windows: {
                  create: day.windows.map(window => ({
                    startTime: window.startTime,
                    endTime: window.endTime,
                    label: window.label,
                    actions: {
                      create: window.actions.map(action => ({
                        operation: action.operation,
                        boundaryType: action.boundaryType,
                        targetGroupUuid: action.targetGroupUuid,
                        fromGroupUuid: action.fromGroupUuid,
                        sortOrder: action.sortOrder,
                      })),
                    },
                  })),
                },
              })),
            } : undefined,

            onceActions: data.onceActions ? {
              create: data.onceActions.map(action => ({
                operation: action.operation,
                boundaryType: 'START',
                targetGroupUuid: action.targetGroupUuid,
                fromGroupUuid: action.fromGroupUuid,
                sortOrder: action.sortOrder,
              })),
            } : undefined,

            recurringActions: data.recurringActions ? {
              create: data.recurringActions.map(action => ({
                operation: action.operation,
                boundaryType: 'START',
                targetGroupUuid: action.targetGroupUuid,
                fromGroupUuid: action.fromGroupUuid,
                sortOrder: action.sortOrder,
              })),
            } : undefined,
          },
          include: {
            days: {
              include: {
                windows: {
                  include: { actions: true },
                },
              },
            },
            onceActions: true,
            recurringActions: true,
          },
        });
      });

      // Re-arm the precision timer so enabled/disabled state and any timing
      // changes take effect immediately without waiting for reconciliation.
      await scheduleExecutionService.notifyScheduleChanged();

      // Audit log
      await logAuditEvent({
        action: 'SCHEDULE_UPDATED',
        details: {
          scheduleId: schedule.id,
          name: schedule.name,
          scheduleType: schedule.scheduleType,
          targetType: schedule.targetType,
          enabled: schedule.enabled,
          priority: schedule.priority,
        },
      });

      return NextResponse.json(schedule);
    } catch (error) {
      logger.error('Error updating schedule:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

// DELETE /api/admin/schedules/[id] - Delete schedule
export const DELETE = withAdminApiTracking(
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

      const schedule = await prisma.scheduledAssignment.findUnique({
        where: { id },
      });

      if (!schedule) {
        return NextResponse.json(
          { message: 'Schedule not found' },
          { status: 404 }
        );
      }

      await prisma.scheduledAssignment.delete({
        where: { id },
      });

      // Audit log
      await logAuditEvent({
        action: 'SCHEDULE_DELETED',
        details: {
          scheduleId: id,
          name: schedule.name,
          scheduleType: schedule.scheduleType,
        },
      });

      return NextResponse.json(
        { message: 'Schedule deleted successfully' },
        { status: 200 }
      );
    } catch (error) {
      logger.error('Error deleting schedule:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
