import { describe, expect, it } from 'vitest';
import {
  mapToFormValues,
  scheduleFormResetKey,
  type ScheduleDetailForForm,
} from './schedule-form-mapping';

function baseSchedule(overrides: Partial<ScheduleDetailForForm> = {}): ScheduleDetailForForm {
  return {
    id: 'sched-1',
    name: "Block Olivia's iPad",
    description: null,
    enabled: true,
    priority: 0,
    scheduleType: 'ONCE',
    timezone: 'Europe/London',
    executeAt: '2026-10-18T12:35:00.000Z',
    cronExpression: null,
    targetType: 'HOST_ALIAS',
    targetSelector: { hostAliasUuids: ['olivia_ipad'] },
    ...overrides,
  };
}

describe('scheduleFormResetKey', () => {
  it('changes when executeAt changes so the edit form remounts with saved values', () => {
    const before = scheduleFormResetKey(baseSchedule());
    const after = scheduleFormResetKey(
      baseSchedule({ executeAt: '2026-10-18T13:35:00.000Z' }),
    );
    expect(after).not.toBe(before);
  });

  it('changes when other saved fields change (name, timezone, targets, actions)', () => {
    const original = scheduleFormResetKey(baseSchedule());
    expect(scheduleFormResetKey(baseSchedule({ name: 'Renamed' }))).not.toBe(original);
    expect(scheduleFormResetKey(baseSchedule({ timezone: 'UTC' }))).not.toBe(original);
    expect(scheduleFormResetKey(baseSchedule({ enabled: false }))).not.toBe(original);
    expect(scheduleFormResetKey(baseSchedule({ priority: 10 }))).not.toBe(original);
    expect(
      scheduleFormResetKey(
        baseSchedule({
          targetSelector: { hostAliasUuids: ['other'] },
        }),
      ),
    ).not.toBe(original);
    expect(
      scheduleFormResetKey(
        baseSchedule({
          onceActions: [{ operation: 'ASSIGN', sortOrder: 0 }],
        }),
      ),
    ).not.toBe(original);
  });
});

describe('mapToFormValues', () => {
  it('hydrates executeAt from the saved ISO timestamp', () => {
    const values = mapToFormValues(baseSchedule({ executeAt: '2026-10-18T13:35:00.000Z' }));
    expect(values.executeAt).toEqual(new Date('2026-10-18T13:35:00.000Z'));
    expect(values.name).toBe("Block Olivia's iPad");
    expect(values.timezone).toBe('Europe/London');
    expect(values.hostAliasUuids).toEqual(['olivia_ipad']);
  });
});
