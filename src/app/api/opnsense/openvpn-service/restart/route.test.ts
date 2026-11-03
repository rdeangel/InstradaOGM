import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticateAndTrackRequest, fetchFromOpnsense, restartWireguardClient } = vi.hoisted(() => ({
  authenticateAndTrackRequest: vi.fn(),
  fetchFromOpnsense: vi.fn(),
  restartWireguardClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auth-middleware', () => ({
  authenticateAndTrackRequest: (req: Request, handler: (auth: unknown) => Promise<Response>) =>
    authenticateAndTrackRequest(req, handler),
}));
vi.mock('@/lib/opnsense-api', () => ({
  fetchFromOpnsense,
  restartWireguardClient,
}));

import { POST } from '@/app/api/opnsense/openvpn-service/restart/route';

const superAdmin = { user: { id: 'admin-1', role: 'SUPER_ADMIN' }, method: 'session' };

function restartRequest(vpnType = 'WireGuard', vpnUuid = 'wg-client-1'): Request {
  return new Request('http://localhost/api/opnsense/openvpn-service/restart', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ vpnUuid, vpnType }),
  });
}

describe('POST /api/opnsense/openvpn-service/restart WireGuard precondition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateAndTrackRequest.mockImplementation(async (_req: Request, handler: (auth: unknown) => Promise<Response>) =>
      handler(superAdmin),
    );
  });

  it('returns 404 and does not restart when search_client has no matching client', async () => {
    fetchFromOpnsense.mockResolvedValue({ rows: [] });

    const response = await POST(restartRequest());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'WireGuard client with UUID wg-client-1 not found.',
    });
    expect(fetchFromOpnsense).toHaveBeenCalledWith('/api/wireguard/client/search_client', 'POST', {});
    expect(restartWireguardClient).not.toHaveBeenCalled();
  });

  it('returns 400 and does not restart when the client is not enabled', async () => {
    fetchFromOpnsense.mockResolvedValue({ rows: [{ uuid: 'wg-client-1', enabled: '0' }] });

    const response = await POST(restartRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'WireGuard client is not enabled. Restart requires an enabled client.',
    });
    expect(restartWireguardClient).not.toHaveBeenCalled();
  });

  it('restarts an enabled client and returns the helper result', async () => {
    fetchFromOpnsense.mockResolvedValue({ rows: [{ uuid: 'wg-client-1', enabled: '1' }] });
    restartWireguardClient.mockResolvedValue({ ok: true, result: 'Enabled' });

    const response = await POST(restartRequest());

    expect(response.status).toBe(200);
    expect(restartWireguardClient).toHaveBeenCalledWith('wg-client-1');
    await expect(response.json()).resolves.toEqual({
      message: 'VPN restart initiated successfully',
      opnsenseResponse: { ok: true, result: 'Enabled' },
    });
  });

  it('returns 500 when an enabled client does not come back enabled', async () => {
    fetchFromOpnsense.mockResolvedValue({ rows: [{ uuid: 'wg-client-1', enabled: '1' }] });
    restartWireguardClient.mockResolvedValue({ ok: false, result: '' });

    const response = await POST(restartRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to restart WireGuard VPN' });
  });
});
