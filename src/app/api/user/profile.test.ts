import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticateAndTrackRequest, prismaMock, logAuditEvent } = vi.hoisted(() => ({
  authenticateAndTrackRequest: vi.fn(),
  prismaMock: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
  logAuditEvent: vi.fn(),
}));

vi.mock('@/lib/auditLog', () => ({ logAuditEvent }));
vi.mock('@/lib/auth-middleware', () => ({
  authenticateAndTrackRequest: (req: Request, handler: (auth: unknown) => Promise<Response>) =>
    authenticateAndTrackRequest(req, handler),
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { GET, PUT } from '@/app/api/user/profile/route';

function jsonRequest(method: string, body?: unknown): Request {
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json' },
  };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return new Request('http://localhost/api/user/profile', init);
}

function authAs(user: Record<string, unknown> | null, authError: string | null = null) {
  authenticateAndTrackRequest.mockImplementation(async (_req: Request, handler: (auth: unknown) => Promise<Response>) =>
    handler({ user, authError }),
  );
}

describe('GET /api/user/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    authAs(null, 'Unauthorized');
    const response = await GET(jsonRequest('GET'));
    expect(response.status).toBe(401);
  });

  it('returns 404 if user not found in database', async () => {
    authAs({ id: 'user-1' });
    prismaMock.user.findUnique.mockResolvedValue(null);

    const response = await GET(jsonRequest('GET'));
    expect(response.status).toBe(404);
  });

  it('returns profile data for authenticated user', async () => {
    authAs({ id: 'user-1' });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Existing User',
      email: 'user@example.com',
      role: 'USER',
      createdAt: new Date(),
      updatedAt: new Date(),
      groups: [],
    });

    const response = await GET(jsonRequest('GET'));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe('Existing User');
    expect(data.email).toBe('user@example.com');
  });
});

describe('PUT /api/user/profile (R4-1 hardening)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    authAs(null, 'Unauthorized');
    const response = await PUT(jsonRequest('PUT', { name: 'New Name' }));
    expect(response.status).toBe(401);
  });

  it('rejects invalid JSON body with 400', async () => {
    authAs({ id: 'user-1' });
    const req = new Request('http://localhost/api/user/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: 'invalid-json{',
    });
    const response = await PUT(req);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toBe('Invalid JSON body');
  });

  it('rejects null body with 400', async () => {
    authAs({ id: 'user-1' });
    const req = new Request('http://localhost/api/user/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: 'null',
    });
    const response = await PUT(req);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toBe('Request body must be a JSON object');
  });

  it('rejects array body with 400', async () => {
    authAs({ id: 'user-1' });
    const req = new Request('http://localhost/api/user/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '[]',
    });
    const response = await PUT(req);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toBe('Request body must be a JSON object');
  });

  it('R4-1: rejects any attempt to update email via PUT /api/user/profile with 400', async () => {
    authAs({ id: 'user-1', email: 'old@example.com' });

    const response = await PUT(jsonRequest('PUT', { email: 'attacker@example.com' }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toContain('Email cannot be updated via this endpoint');
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('R4-1: rejects requests containing both name and email with 400', async () => {
    authAs({ id: 'user-1', email: 'old@example.com' });

    const response = await PUT(jsonRequest('PUT', { name: 'Valid Name', email: 'attacker@example.com' }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toContain('Email cannot be updated via this endpoint');
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('rejects requests with no update data', async () => {
    authAs({ id: 'user-1' });
    const response = await PUT(jsonRequest('PUT', {}));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toBe('No update data provided');
  });

  it('rejects empty or whitespace-only names', async () => {
    authAs({ id: 'user-1' });
    const response = await PUT(jsonRequest('PUT', { name: '   ' }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toBe('Name must be a non-empty string');
  });

  it('rejects names exceeding 100 characters', async () => {
    authAs({ id: 'user-1' });
    const response = await PUT(jsonRequest('PUT', { name: 'a'.repeat(101) }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toBe('Name must not exceed 100 characters');
  });

  it('successfully updates name and logs audit event', async () => {
    authAs({ id: 'user-1' });
    prismaMock.user.update.mockResolvedValue({
      id: 'user-1',
      name: 'Updated Name',
      email: 'user@example.com',
      role: 'USER',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await PUT(jsonRequest('PUT', { name: '  Updated Name  ' }));
    expect(response.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Updated Name' },
      select: expect.any(Object),
    });
    expect(logAuditEvent).toHaveBeenCalledWith({
      userId: 'user-1',
      action: 'PROFILE_UPDATED',
      details: { updatedFields: { name: 'Updated Name' } },
    });
  });
});
