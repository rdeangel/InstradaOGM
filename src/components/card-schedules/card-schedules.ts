export type GroupType = 'SingleSelect' | 'MultiSelect';
export type AliasKind = 'HOST_ALIAS' | 'NETWORK_ALIAS';

export interface CardScheduleAction {
  operation: 'ASSIGN' | 'UNASSIGN' | 'CLEAR_ALL';
  targetGroupUuid: string | null;
  sortOrder: number;
}

export interface CardSchedule {
  id: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  scheduleType: 'COMPLEX_WEEKLY' | 'ONCE' | 'RECURRING';
  targetType: string;
  targetSelector: unknown;
  executeAt?: string | null;
  cronExpression?: string | null;
  lastExecutedAt?: string | null;
  onceActions?: CardScheduleAction[];
  recurringActions?: CardScheduleAction[];
}

export interface SimOptions {
  enableGroupTypes: boolean;
  groupTypes?: Record<string, GroupType>;
  noEviction?: boolean;
}

export function simulateActions(
  current: Iterable<string>,
  actions: CardScheduleAction[],
  opts: SimOptions,
): Set<string> {
  const set = new Set(current);
  const sorted = [...actions].sort((a, b) => a.sortOrder - b.sortOrder);
  const typeOf = (u: string): GroupType => opts.groupTypes?.[u] ?? 'SingleSelect';
  const isSingle = (u: string) => !opts.enableGroupTypes || typeOf(u) === 'SingleSelect';

  for (const action of sorted) {
    const g = action.targetGroupUuid;
    switch (action.operation) {
      case 'ASSIGN': {
        if (!g) break;
        if (!opts.noEviction && isSingle(g)) {
          for (const m of [...set]) {
            if (isSingle(m)) set.delete(m);
          }
        }
        set.add(g);
        break;
      }
      case 'UNASSIGN': {
        if (!g) break;
        set.delete(g);
        break;
      }
      case 'CLEAR_ALL': {
        set.clear();
        break;
      }
    }
  }
  return set;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) {
    if (!b.has(x)) return false;
  }
  return true;
}

export function isNoOpSchedule(s: CardSchedule, current: string[], opts: SimOptions): boolean {
  if (s.scheduleType !== 'ONCE' && s.scheduleType !== 'RECURRING') return false;
  const actions = s.scheduleType === 'ONCE' ? s.onceActions : s.recurringActions;
  if (!actions || actions.length === 0) return true;
  const result = simulateActions(current, actions, {
    ...opts,
    noEviction: s.targetType === 'NETWORK_ALIAS',
  });
  return setsEqual(result, new Set(current));
}

export function isEligibleForAlias(s: CardSchedule, kind: AliasKind, aliasUuid: string): boolean {
  if (s.targetType !== kind) return false;
  const sel = s.targetSelector;
  if (sel === null || typeof sel !== 'object') return false;
  const key = kind === 'HOST_ALIAS' ? 'hostAliasUuids' : 'networkAliasUuids';
  const arr = (sel as Record<string, unknown>)[key];
  return Array.isArray(arr) && arr.length === 1 && arr[0] === aliasUuid;
}

export function visibleCardSchedules(
  list: CardSchedule[],
  kind: AliasKind,
  aliasUuid: string,
  current: string[],
  opts: SimOptions,
): CardSchedule[] {
  return list.filter((s) => isEligibleForAlias(s, kind, aliasUuid) && !isNoOpSchedule(s, current, opts));
}
