import { NextRequest, NextResponse } from 'next/server';
import { withAdminApiTracking } from '@/lib/api-route-wrapper';
import { logger } from '@/lib/logger';
import { createScheduleSchema } from '@/types/schedule';
import { getNetworkGroups, exportAliases } from '@/lib/opnsense-api';

// POST /api/admin/schedules/preview - Dry-run preview
// Uses POST (not GET) because the schedule definition in the body can be large
export const POST = withAdminApiTracking(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const at = searchParams.get('at');

    if (!at) {
      return NextResponse.json(
        { message: 'Missing required query parameter: at (ISO 8601 datetime)' },
        { status: 400 }
      );
    }

    const simulatedAt = new Date(at);
    if (isNaN(simulatedAt.getTime())) {
      return NextResponse.json(
        { message: 'Invalid datetime format for "at" parameter. Use ISO 8601.' },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Validate schedule structure
    const validation = createScheduleSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { message: 'Invalid schedule data', errors: validation.error.errors },
        { status: 400 }
      );
    }

    const schedule = validation.data;

    // Resolve target IPs (simplified — full resolution is in the execution engine)
    let resolvedTargets: string[] = [];
    const skippedAliasUuids: string[] = [];

    if (schedule.targetType === 'IP_LIST' && 'ips' in schedule.targetSelector) {
      resolvedTargets = schedule.targetSelector.ips;
    } else if (schedule.targetType === 'NETWORK_ALIAS' && 'networkAliasUuids' in schedule.targetSelector) {
      const uuids = schedule.targetSelector.networkAliasUuids as string[];
      const aliasesResponse = await exportAliases().catch(() => null);
      const aliases = aliasesResponse?.aliases?.alias ?? {};

      for (const uuid of uuids) {
        // eslint-disable-next-line security/detect-object-injection
        const alias = aliases[uuid];
        if (!alias || alias.type !== 'network') {
          skippedAliasUuids.push(uuid);
          continue;
        }
        if (alias.enabled !== '1') {
          skippedAliasUuids.push(uuid);
          continue;
        }
        resolvedTargets.push(alias.name);
      }
    } else if (schedule.targetType === 'HOST_ALIAS' && 'hostAliasUuids' in schedule.targetSelector) {
      const uuids = schedule.targetSelector.hostAliasUuids as string[];
      const aliasesResponse = await exportAliases().catch(() => null);
      const aliases = aliasesResponse?.aliases?.alias ?? {};

      for (const uuid of uuids) {
        // eslint-disable-next-line security/detect-object-injection
        const alias = aliases[uuid];
        if (!alias || alias.type !== 'host' || alias.enabled !== '1' || !alias.content?.trim()) {
          skippedAliasUuids.push(uuid);
          continue;
        }
        resolvedTargets.push(alias.content.trim());
      }
    }
    // For HOST_ALIAS and NETWORK_GROUP, the full resolution requires OPNsense queries.
    // The preview endpoint shows what it can resolve; the execution engine does full resolution.

    // Determine which boundaries would fire at the simulated time
    const boundariesFiring: Array<{
      windowLabel: string;
      boundaryType: string;
      actions: Array<{
        operation: string;
        targetGroupUuid?: string;
        targetGroupName?: string;
      }>;
    }> = [];

    if (schedule.scheduleType === 'COMPLEX_WEEKLY' && schedule.days) {
      const dayOfWeek = simulatedAt.getDay();
      const timeStr = `${String(simulatedAt.getHours()).padStart(2, '0')}:${String(simulatedAt.getMinutes()).padStart(2, '0')}`;

      const day = schedule.days.find(d => d.dayOfWeek === dayOfWeek);
      if (day) {
        // Fetch groups once for name resolution
        const groups = await getNetworkGroups();

        for (const window of day.windows) {
          const matchesBoundaries: Array<{ type: 'START' | 'END' }> = [];
          if (window.startTime === timeStr) matchesBoundaries.push({ type: 'START' });
          if (window.endTime === timeStr) matchesBoundaries.push({ type: 'END' });

          for (const boundary of matchesBoundaries) {
            boundariesFiring.push({
              windowLabel: window.label || `${window.startTime}-${window.endTime}`,
              boundaryType: boundary.type,
              actions: window.actions
                .filter(a => a.boundaryType === boundary.type)
                .map(a => ({
                  operation: a.operation,
                  targetGroupUuid: a.targetGroupUuid,
                  targetGroupName: a.targetGroupUuid
                    ? groups.find(g => g.uuid === a.targetGroupUuid)?.name
                    : undefined,
                })),
            });
          }
        }
      }
    }

    if (schedule.scheduleType === 'ONCE' && schedule.executeAt && schedule.onceActions) {
      const executeTime = new Date(schedule.executeAt);
      // Check if simulated time matches the ONCE execution time (within the same minute)
      if (
        simulatedAt.getFullYear() === executeTime.getFullYear() &&
        simulatedAt.getMonth() === executeTime.getMonth() &&
        simulatedAt.getDate() === executeTime.getDate() &&
        simulatedAt.getHours() === executeTime.getHours() &&
        simulatedAt.getMinutes() === executeTime.getMinutes()
      ) {
        const groups = await getNetworkGroups();
        boundariesFiring.push({
          windowLabel: 'One-time execution',
          boundaryType: 'ONCE',
          actions: schedule.onceActions.map(a => ({
            operation: a.operation,
            targetGroupUuid: a.targetGroupUuid,
            targetGroupName: a.targetGroupUuid
              ? groups.find(g => g.uuid === a.targetGroupUuid)?.name
              : undefined,
          })),
        });
      }
    }

    // Note: RECURRING preview requires cron-parser to compute next occurrence.
    // This will be fully implemented in Phase 2 (execution engine).

    return NextResponse.json({
      simulatedAt: simulatedAt.toISOString(),
      scheduleDisabled: !schedule.enabled,
      resolvedTargets,
      skippedAliasUuids,
      boundariesFiring,
    });
  } catch (error) {
    logger.error('Error in schedule preview:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
});
