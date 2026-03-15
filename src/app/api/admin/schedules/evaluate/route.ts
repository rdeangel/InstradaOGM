/**
 * POST /api/admin/schedules/evaluate
 *
 * Dry-run evaluation of all enabled schedules at an arbitrary point in time.
 * No execution records are written and no state is mutated.
 *
 * Name resolution:
 *   - HOST_ALIAS target UUIDs  → resolved to OPNsense alias names via exportAliases()
 *   - NETWORK_GROUP target UUID → resolved to group name via getNetworkGroups()
 *   - Action targetGroupUuid   → resolved to group name via the same groups fetch
 * OPNsense data is fetched once per request (two concurrent calls) and reused
 * across all matches.
 *
 * Request body:
 *   { "dateTime": "<ISO 8601 string>" }
 *
 * Response:
 *   {
 *     "evaluatedAt": "<ISO 8601 string>",
 *     "matches": [
 *       {
 *         "scheduleId": string,
 *         "scheduleName": string,
 *         "scheduleType": string,
 *         "timezone": string,
 *         "matchStatus": "START boundary" | "END boundary" | "Active window (mid-run)" | "Fires at this time",
 *         "matchedWindowLabel"?: string,
 *         "windowStartTime"?: string,
 *         "windowEndTime"?: string,
 *         "actions": Array<{
 *           operation: string,
 *           boundaryType: string,
 *           targetGroupUuid: string | null,
 *           targetGroupName: string | null,   // resolved from OPNsense
 *           fromGroupUuid: string | null,
 *           sortOrder: number
 *         }>,
 *         "targetType": string,
 *         "targetSelector": unknown,
 *         "targetSummary": string,    // human-readable resolved target description
 *         "targetNames": string[]     // individual resolved target names for badge rendering
 *       }
 *     ]
 *   }
 *
 * Authentication: ADMIN or SUPER_ADMIN role required (via withAdminApiTracking).
 * API key access is supported through the standard auth middleware.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminApiTracking } from '@/lib/api-route-wrapper';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { exportAliases, getNetworkGroups } from '@/lib/opnsense-api';
import { evaluateSchedulesAt, type EvaluatorSchedule, type EvaluationAction } from '@/lib/schedule-evaluator';

// ── Request validation ─────────────────────────────────────────────────────────

const evaluateRequestSchema = z.object({
  /** ISO 8601 datetime string — interpreted as the exact UTC instant to evaluate. */
  dateTime: z.string().datetime({ message: 'dateTime must be a valid ISO 8601 datetime string' }),
});

// ── Route handler ──────────────────────────────────────────────────────────────

export const POST = withAdminApiTracking(async (request: NextRequest) => {
  try {
    const body = await request.json();

    const validation = evaluateRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { message: 'Validation error', errors: validation.error.errors },
        { status: 400 },
      );
    }

    const { dateTime } = validation.data;
    const targetDate = new Date(dateTime);

    // Fetch schedules, OPNsense alias/group data, and friendly-name overrides concurrently.
    const [rawSchedules, aliasesResponse, networkGroups, groupDisplays] = await Promise.all([
      prisma.scheduledAssignment.findMany({
        where: { enabled: true },
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
        orderBy: [{ priority: 'desc' }, { name: 'asc' }],
      }),
      exportAliases().catch((err) => {
        logger.warn('Failed to fetch OPNsense aliases for evaluate endpoint:', err);
        return null;
      }),
      getNetworkGroups().catch((err) => {
        logger.warn('Failed to fetch OPNsense network groups for evaluate endpoint:', err);
        return [];
      }),
      // opnsenseGroupDisplay holds the user-defined friendly names for network groups.
      // getNetworkGroups() does NOT populate NetworkGroup.friendlyName, so we join manually.
      prisma.opnsenseGroupDisplay.findMany({
        select: { opnsenseUuid: true, friendlyName: true },
      }),
    ]);

    // Build UUID → alias name lookup from OPNsense export.
    const aliasNameMap = new Map<string, string>();
    if (aliasesResponse?.aliases?.alias) {
      for (const [uuid, alias] of Object.entries(aliasesResponse.aliases.alias)) {
        if (alias.name) aliasNameMap.set(uuid, alias.name);
      }
    }

    // Build UUID → display name lookup for network groups.
    // Prefer the user-defined friendly name from opnsenseGroupDisplay; fall back to
    // the raw OPNsense alias name when no friendly name has been configured.
    const friendlyNameOverrides = new Map(groupDisplays.map((d) => [d.opnsenseUuid, d.friendlyName]));
    const groupNameMap = new Map<string, string>();
    for (const g of networkGroups) {
      groupNameMap.set(g.uuid, friendlyNameOverrides.get(g.uuid) ?? g.name);
    }

    // Run the pure evaluation — no I/O inside this call.
    const rawMatches = evaluateSchedulesAt(
      rawSchedules as unknown as EvaluatorSchedule[],
      targetDate,
    );

    // Enrich each match with resolved names.
    const matches = rawMatches.map((match) => {
      const { targetSummary, targetNames } = resolveTarget(
        match.targetType,
        match.targetSelector,
        aliasNameMap,
        groupNameMap,
      );

      const actions = enrichActions(match.actions, groupNameMap);

      return { ...match, actions, targetSummary, targetNames };
    });

    return NextResponse.json({ evaluatedAt: dateTime, matches });
  } catch (error) {
    logger.error('Error in schedule evaluate endpoint:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
});

// ── Name resolution helpers ────────────────────────────────────────────────────

/**
 * Resolve a schedule's target into a summary string and a discrete name array.
 *
 * `targetNames` is the flat list of individual target items (alias names, IPs,
 * or group name) so the client can render each as a badge.
 * `targetSummary` is the same data joined for plain-text contexts.
 */
function resolveTarget(
  targetType: string,
  targetSelector: unknown,
  aliasNameMap: Map<string, string>,
  groupNameMap: Map<string, string>,
): { targetSummary: string; targetNames: string[] } {
  const selector = targetSelector as Record<string, unknown>;

  if (targetType === 'IP_LIST') {
    const typed = selector as { ips?: string[] };
    const ips = typed.ips ?? [];
    return {
      targetNames: ips,
      targetSummary: ips.length > 0 ? ips.join(', ') : '(no IPs configured)',
    };
  }

  if (targetType === 'HOST_ALIAS') {
    const typed = selector as { hostAliasUuids?: string[] };
    const uuids = typed.hostAliasUuids ?? [];
    if (uuids.length === 0) {
      return { targetNames: [], targetSummary: '(no aliases configured)' };
    }
    // Resolve each UUID to its OPNsense alias name; fall back to UUID if not found.
    const names = uuids.map((uuid) => aliasNameMap.get(uuid) ?? uuid);
    return { targetNames: names, targetSummary: names.join(', ') };
  }

  if (targetType === 'NETWORK_GROUP') {
    const typed = selector as { networkGroupUuid?: string };
    const uuid = typed.networkGroupUuid;
    if (!uuid) return { targetNames: [], targetSummary: '(no group configured)' };
    const name = groupNameMap.get(uuid) ?? uuid;
    return { targetNames: [name], targetSummary: name };
  }

  return { targetNames: [], targetSummary: `Unknown target type: ${targetType}` };
}

/**
 * Annotate each action with a resolved `targetGroupName` so the dialog can
 * display a human-readable name instead of a raw UUID.
 */
function enrichActions(
  actions: EvaluationAction[],
  groupNameMap: Map<string, string>,
): Array<EvaluationAction & { targetGroupName: string | null }> {
  return actions.map((action) => ({
    ...action,
    targetGroupName: action.targetGroupUuid
      ? (groupNameMap.get(action.targetGroupUuid) ?? action.targetGroupUuid)
      : null,
  }));
}
