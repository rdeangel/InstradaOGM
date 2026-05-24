import { describe, it, expect } from 'vitest';
import { resolveDeviceToRefresh, type RefreshableDevice } from '@/lib/device-refresh';

const cached: RefreshableDevice = { uuid: 'dev-1', content: '10.0.0.1' };
const live: RefreshableDevice = { uuid: 'dev-1', content: '10.0.0.1' };

describe('resolveDeviceToRefresh', () => {
  it('returns null when no device is selected', () => {
    expect(resolveDeviceToRefresh(null, undefined, null)).toBeNull();
  });

  it('returns the cached device when present in cache', () => {
    expect(resolveDeviceToRefresh('dev-1', cached, null)).toBe(cached);
  });

  // Regression: the focus refresh used to require a details-cache hit and would
  // silently skip refreshing the selected device on a cache miss, leaving the
  // membership panel stale until a full page reload. A live selection of the same
  // device must still be refreshed.
  it('falls back to the live selected device on a cache miss', () => {
    expect(resolveDeviceToRefresh('dev-1', undefined, live)).toBe(live);
  });

  it('prefers the cached device over the live device when both are present', () => {
    expect(resolveDeviceToRefresh('dev-1', cached, live)).toBe(cached);
  });

  it('returns null when neither cache nor live selection matches the selected uuid', () => {
    const other: RefreshableDevice = { uuid: 'dev-2', content: '10.0.0.2' };
    expect(resolveDeviceToRefresh('dev-1', other, other)).toBeNull();
  });

  it('returns null when the matching device has no IP to fetch membership for', () => {
    const noIp: RefreshableDevice = { uuid: 'dev-1', content: '' };
    expect(resolveDeviceToRefresh('dev-1', noIp, noIp)).toBeNull();
  });
});
