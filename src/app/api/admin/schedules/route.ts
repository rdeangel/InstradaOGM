import { NextRequest, NextResponse } from 'next/server';
import { withAdminApiTracking } from '@/lib/api-route-wrapper';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { logAuditEvent } from '@/lib/auditLog';
import { createScheduleSchema } from '@/types/schedule';
import { validateScheduleData } from '@/lib/schedule-validation';

// GET /api/admin/schedules - List all schedules
export const GET = withAdminApiTracking(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const enabled = searchParams.get('enabled');
    const scheduleType = searchParams.get('scheduleType');

    const where: Record<string, unknown> = {};
    if (enabled !== null) where.enabled = enabled === 'true';
    if (scheduleType) where.scheduleType = scheduleType;

    const schedules = await prisma.scheduledAssignment.findMany({
      where,
      include: {
        _count: {
          select: { executions: true },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { name: 'asc' },
      ],
    });

    return NextResponse.json(schedules);
  } catch (error) {
    logger.error('Error listing schedules:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
});

// POST /api/admin/schedules - Create new schedule
export const POST = withAdminApiTracking(async (request: NextRequest) => {
  try {
    const body = await request.json();

    // Validate with Zod
    const validation = createScheduleSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { message: 'Validation error', errors: validation.error.errors },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Shared validation (cron, group UUIDs, action constraints, overlaps)
    const validationError = await validateScheduleData(data);
    if (validationError) {
      return NextResponse.json(
        { message: validationError.message },
        { status: validationError.status }
      );
    }

    // Create schedule with nested relations
    const schedule = await prisma.scheduledAssignment.create({
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

        // Create nested days/windows/actions for COMPLEX_WEEKLY
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
                    sortOrder: action.sortOrder,
                  })),
                },
              })),
            },
          })),
        } : undefined,

        // Create ONCE actions
        onceActions: data.onceActions ? {
          create: data.onceActions.map(action => ({
            operation: action.operation,
            boundaryType: 'START',
            targetGroupUuid: action.targetGroupUuid,
            sortOrder: action.sortOrder,
          })),
        } : undefined,

        // Create RECURRING actions
        recurringActions: data.recurringActions ? {
          create: data.recurringActions.map(action => ({
            operation: action.operation,
            boundaryType: 'START',
            targetGroupUuid: action.targetGroupUuid,
            sortOrder: action.sortOrder,
          })),
        } : undefined,
      },
      include: {
        days: {
          include: {
            windows: {
              include: {
                actions: true,
              },
            },
          },
        },
        onceActions: true,
        recurringActions: true,
      },
    });

    // Audit log
    await logAuditEvent({
      action: 'SCHEDULE_CREATED',
      details: {
        scheduleId: schedule.id,
        name: schedule.name,
        scheduleType: schedule.scheduleType,
        targetType: schedule.targetType,
        enabled: schedule.enabled,
        priority: schedule.priority,
      },
    });

    return NextResponse.json(schedule, { status: 201 });
  } catch (error) {
    logger.error('Error creating schedule:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
});
