export interface RefreshableDevice {
  uuid: string;
  content: string;
}

/**
 * Resolve which device's details should be refreshed when a refresh is triggered
 * (manual refresh icon or window focus) while a device is selected.
 *
 * The selected-device membership panel is driven by state that is only updated when
 * the selected device's details are refreshed. The focus path used to require the
 * device to be present in an in-memory details cache and silently skipped the refresh
 * on a cache miss; the manual refresh omitted it entirely. Both left the panel showing
 * stale membership after external changes until a full page reload.
 *
 * Prefer the cached details (the richer object) but fall back to the live selected
 * device so a cache miss never causes the refresh to be skipped. A device without an
 * IP (`content`) cannot have its membership fetched, so it is treated as nothing to do.
 */
export function resolveDeviceToRefresh<T extends RefreshableDevice>(
  selectedUuid: string | null,
  cachedDevice: T | undefined,
  liveDevice: T | null,
): T | null {
  if (!selectedUuid) return null;
  if (cachedDevice && cachedDevice.uuid === selectedUuid && cachedDevice.content) {
    return cachedDevice;
  }
  if (liveDevice && liveDevice.uuid === selectedUuid && liveDevice.content) {
    return liveDevice;
  }
  return null;
}
