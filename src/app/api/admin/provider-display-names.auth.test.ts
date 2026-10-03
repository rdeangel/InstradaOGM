import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticateAndTrackRequest, loadOidcProviders } = vi.hoisted(() => ({
  authenticateAndTrackRequest: vi.fn(),
  loadOidcProviders: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auth-middleware', () => ({
  authenticateAndTrackRequest: (req: Request, handler: (auth: unknown) => Promise<Response>) =>
    authenticateAndTrackRequest(req, handler),
}));
vi.mock('@/lib/auth-config', () => ({ loadOidcProviders }));

import { GET } from '@/app/api/admin/provider-display-names/route';

function getRequest(): Request {
  return new Request('http://localhost/api/admin/provider-display-names');
}

describe('GET /api/admin/provider-display-names', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadOidcProviders.mockReturnValue([{ id: 'authentik', name: 'Authentik' }]);
  });

  it('returns 401 for an anonymous caller', async () => {
    authenticateAndTrackRequest.mockImplementation(async () =>
      new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }),
    );
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
    expect(loadOidcProviders).not.toHaveBeenCalled();
  });

  it('returns 403 for a signed-in USER', async () => {
    authenticateAndTrackRequest.mockImplementation(async (_req: Request, handler: (auth: unknown) => Promise<Response>) =>
      handler({ user: { id: 'user-1', role: 'USER' }, method: 'session' }),
    );
    const response = await GET(getRequest());
    expect(response.status).toBe(403);
    expect(loadOidcProviders).not.toHaveBeenCalled();
  });

  it('returns 200 with display names for ADMIN', async () => {
    authenticateAndTrackRequest.mockImplementation(async (_req: Request, handler: (auth: unknown) => Promise<Response>) =>
      handler({ user: { id: 'admin-1', role: 'ADMIN' }, method: 'session' }),
    );
    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authentik: 'Authentik' });
  });
});
