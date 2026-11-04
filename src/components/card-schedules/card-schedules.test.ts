import { describe, expect, it } from 'vitest';
import { isEligibleForAlias, simulateActions, isNoOpSchedule, visibleCardSchedules, type CardSchedule } from './card-schedules';

const A = 'alias-1';
const opts = { enableGroupTypes: true, groupTypes: { g1: 'SingleSelect', g2: 'SingleSelect', m1: 'MultiSelect' } as const };
const once = (over: Partial<CardSchedule> = {}): CardSchedule => ({
  id: 's', name: 's', enabled: true, scheduleType: 'ONCE', targetType: 'HOST_ALIAS',
  targetSelector: { hostAliasUuids: [A] },
  onceActions: [{ operation: 'ASSIGN', targetGroupUuid: 'g1', sortOrder: 0 }], ...over,
});

describe('isEligibleForAlias', () => {
  it('single host alias match', () => expect(isEligibleForAlias(once(), 'HOST_ALIAS', A)).toBe(true));
  it('multi-alias never', () => expect(isEligibleForAlias(once({ targetSelector: { hostAliasUuids: [A, 'x'] } }), 'HOST_ALIAS', A)).toBe(false));
  it('other alias', () => expect(isEligibleForAlias(once(), 'HOST_ALIAS', 'x')).toBe(false));
  it('kind mismatch', () => expect(isEligibleForAlias(once(), 'NETWORK_ALIAS', A)).toBe(false));
  it('network alias match', () => expect(isEligibleForAlias(once({ targetType: 'NETWORK_ALIAS', targetSelector: { networkAliasUuids: [A] } }), 'NETWORK_ALIAS', A)).toBe(true));
  it('IP_LIST / NETWORK_GROUP never', () => {
    expect(isEligibleForAlias(once({ targetType: 'IP_LIST', targetSelector: { ips: ['1.1.1.1'] } }), 'HOST_ALIAS', A)).toBe(false);
    expect(isEligibleForAlias(once({ targetType: 'NETWORK_GROUP', targetSelector: { networkGroupUuid: 'g1' } }), 'HOST_ALIAS', A)).toBe(false);
  });
  it('malformed selector is ineligible', () => {
    for (const sel of [null, 'x', {}, { hostAliasUuids: 'alias-1' }]) expect(isEligibleForAlias(once({ targetSelector: sel }), 'HOST_ALIAS', A)).toBe(false);
  });
});

describe('simulateActions', () => {
  it('ASSIGN single evicts other singles, keeps multi', () =>
    expect([...simulateActions(['g2', 'm1'], [{ operation: 'ASSIGN', targetGroupUuid: 'g1', sortOrder: 0 }], opts)].sort()).toEqual(['g1', 'm1']));
  it('ASSIGN multi evicts nothing', () =>
    expect([...simulateActions(['g1'], [{ operation: 'ASSIGN', targetGroupUuid: 'm1', sortOrder: 0 }], opts)].sort()).toEqual(['g1', 'm1']));
  it('enableGroupTypes=false: ASSIGN to MultiSelect-typed group still evicts all', () =>
    expect([...simulateActions(['g1', 'm1'], [{ operation: 'ASSIGN', targetGroupUuid: 'g2', sortOrder: 0 }], { ...opts, enableGroupTypes: false })]).toEqual(['g2']));
  it('unknown group type defaults SingleSelect', () =>
    expect([...simulateActions(['g1'], [{ operation: 'ASSIGN', targetGroupUuid: 'zz', sortOrder: 0 }], opts)]).toEqual(['zz']));
  it('respects sortOrder, not array order', () =>
    expect([...simulateActions([], [
      { operation: 'ASSIGN', targetGroupUuid: 'g1', sortOrder: 1 },
      { operation: 'CLEAR_ALL', targetGroupUuid: null, sortOrder: 0 },
    ], opts)]).toEqual(['g1']));
  it('UNASSIGN and CLEAR_ALL', () => {
    expect([...simulateActions(['g1', 'm1'], [{ operation: 'UNASSIGN', targetGroupUuid: 'g1', sortOrder: 0 }], opts)]).toEqual(['m1']);
    expect(simulateActions(['g1', 'm1'], [{ operation: 'CLEAR_ALL', targetGroupUuid: null, sortOrder: 0 }], opts).size).toBe(0);
  });
});

describe('isNoOpSchedule / visibleCardSchedules', () => {
  it('enabled ONCE that changes nothing is hidden', () => {
    expect(isNoOpSchedule(once(), ['g1'], opts)).toBe(true);
    expect(visibleCardSchedules([once()], 'HOST_ALIAS', A, ['g1'], opts)).toEqual([]);
  });
  it('disabled ONCE that changes nothing is also hidden', () => {
    expect(isNoOpSchedule(once({ enabled: false }), ['g1'], opts)).toBe(true);
    expect(visibleCardSchedules([once({ enabled: false })], 'HOST_ALIAS', A, ['g1'], opts)).toEqual([]);
  });
  it('disabled schedule that changes state is shown', () => {
    expect(isNoOpSchedule(once({ enabled: false }), ['g2'], opts)).toBe(false);
    expect(visibleCardSchedules([once({ enabled: false })], 'HOST_ALIAS', A, ['g2'], opts)).toHaveLength(1);
  });
  it('already in target but another single present is NOT no-op', () => expect(isNoOpSchedule(once(), ['g1', 'g2'], opts)).toBe(false));
  it('NETWORK_ALIAS ASSIGN never evicts → no-op when already in target', () => {
    const n = once({ targetType: 'NETWORK_ALIAS', targetSelector: { networkAliasUuids: [A] } });
    expect(isNoOpSchedule(n, ['g1', 'g2'], opts)).toBe(true);
    expect(isNoOpSchedule(n, ['g2'], opts)).toBe(false);
  });
  it('RECURRING uses recurringActions', () => {
    const r = once({ scheduleType: 'RECURRING', onceActions: undefined, recurringActions: [{ operation: 'UNASSIGN', targetGroupUuid: 'g1', sortOrder: 0 }] });
    expect(isNoOpSchedule(r, ['g1'], opts)).toBe(false);
    expect(isNoOpSchedule(r, [], opts)).toBe(true);
  });
  it('COMPLEX_WEEKLY never hidden', () => expect(visibleCardSchedules([once({ scheduleType: 'COMPLEX_WEEKLY', onceActions: undefined })], 'HOST_ALIAS', A, [], opts)).toHaveLength(1));
  it('multi-alias never shown', () => expect(visibleCardSchedules([once({ enabled: false, targetSelector: { hostAliasUuids: [A, 'b'] } })], 'HOST_ALIAS', A, [], opts)).toEqual([]));
});
