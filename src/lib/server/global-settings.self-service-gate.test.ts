import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    globalSettings: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { isAnonSelfServiceAllowed, isAnonSelfServiceTarget } from '@/lib/server/global-settings';

const INSIDE_NETWORKS = [{ type: 'include' as const, network: '192.168.1.0/24' }];

function requestWithXff(xff: string | null) {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === 'x-forwarded-for' ? xff : null),
    },
  };
}

function stubSettings(overrides: Record<string, unknown> = {}) {
  prismaMock.globalSettings.findFirst.mockResolvedValue({
    removeSelfServicePage: false,
    enableRenamingSelfServicePage: true,
    allowedNetworks: INSIDE_NETWORKS,
    ...overrides,
  });
}

describe('isAnonSelfServiceAllowed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubSettings();
  });

  it('allows a client inside Allowed Networks', async () => {
    const gate = await isAnonSelfServiceAllowed(requestWithXff('192.168.1.10'));
    expect(gate.allowed).toBe(true);
    expect(gate.clientIp).toBe('192.168.1.10');
  });

  it('denies a client outside Allowed Networks with the network message', async () => {
    const gate = await isAnonSelfServiceAllowed(requestWithXff('10.9.9.9'));
    expect(gate.allowed).toBe(false);
    expect(gate.message).toBe('Unauthorized: IP address is not in allowed networks for self-service access');
  });

  it('denies when Allowed Networks is empty', async () => {
    stubSettings({ allowedNetworks: [] });
    const gate = await isAnonSelfServiceAllowed(requestWithXff('192.168.1.10'));
    expect(gate.allowed).toBe(false);
    expect(gate.message).toBe('Unauthorized: IP address is not in allowed networks for self-service access');
  });

  it('denies when self-service is disabled, with the disabled message', async () => {
    stubSettings({ removeSelfServicePage: true });
    const gate = await isAnonSelfServiceAllowed(requestWithXff('192.168.1.10'));
    expect(gate.allowed).toBe(false);
    expect(gate.message).toBe('Forbidden: Self-service functionality is disabled');
  });

  it('allows an IPv4-mapped client ::ffff:192.168.1.10 inside the v4 network', async () => {
    const gate = await isAnonSelfServiceAllowed(requestWithXff('::ffff:192.168.1.10'));
    expect(gate.allowed).toBe(true);
  });
});

describe('isAnonSelfServiceTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubSettings();
  });

  it('is true for the caller own IP, false for a foreign IP, false for a null target', async () => {
    const gate = await isAnonSelfServiceAllowed(requestWithXff('192.168.1.10'));
    expect(isAnonSelfServiceTarget(gate, '192.168.1.10')).toBe(true);
    expect(isAnonSelfServiceTarget(gate, '192.168.1.99')).toBe(false);
    expect(isAnonSelfServiceTarget(gate, null)).toBe(false);
  });
});
