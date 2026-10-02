import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { withAdminApiTracking } from '@/lib/api-route-wrapper';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { logAuditEvent } from '@/lib/auditLog';

const MAX_NAME_LENGTH = 100;

function duplicateScheduleName(sourceName: string): string {
  return `Copy of ${sourceName}`.slice(0, MAX_NAME_LENGTH);
}

// POST /api/admin/schedules/[id]/duplicate - Clone a schedule as a disabled copy
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

      const source = await prisma.scheduledAssignment.findUnique({
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

      if (!source) {
        return NextResponse.json(
          { message: 'Schedule not found' },
          { status: 404 }
        );
      }

      if (source.targetType === 'NETWORK_ALIAS') {
        const settings = await prisma.globalSettings.findFirst({ orderBy: { id: 'asc' } });
        if (!settings?.manageNetworkAliasesEnabled) {
          return NextResponse.json(
            { message: 'Network alias management is disabled' },
            { status: 403 }
          );
        }
      }

      const schedule = await prisma.scheduledAssignment.create({
        data: {
          name: duplicateScheduleName(source.name),
          description: source.description,
          enabled: false,
          priority: source.priority,
          scheduleType: source.scheduleType,
          timezone: source.timezone,
          executeAt: source.executeAt,
          cronExpression: source.cronExpression,
          targetType: source.targetType,
          targetSelector: source.targetSelector as Prisma.InputJsonValue,

          days: source.days.length > 0 ? {
            create: source.days.map(day => ({
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

          onceActions: source.onceActions.length > 0 ? {
            create: source.onceActions.map(action => ({
              operation: action.operation,
              boundaryType: action.boundaryType,
              targetGroupUuid: action.targetGroupUuid,
              fromGroupUuid: action.fromGroupUuid,
              sortOrder: action.sortOrder,
            })),
          } : undefined,

          recurringActions: source.recurringActions.length > 0 ? {
            create: source.recurringActions.map(action => ({
              operation: action.operation,
              boundaryType: action.boundaryType,
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

      await logAuditEvent({
        action: 'SCHEDULE_DUPLICATED',
        details: {
          scheduleId: schedule.id,
          sourceScheduleId: source.id,
          name: schedule.name,
        },
      });

      return NextResponse.json(schedule, { status: 201 });
    } catch (error) {
      logger.error('Error duplicating schedule:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
