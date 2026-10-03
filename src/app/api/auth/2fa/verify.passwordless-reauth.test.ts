import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authenticateAndTrackRequest,
  prismaMock,
  getSessionIssuedAt,
  getTotpSecretWithMigration,
  storeBackupCodes,
} = vi.hoisted(() => ({
  authenticateAndTrackRequest: vi.fn(),
  prismaMock: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
  getSessionIssuedAt: vi.fn(),
  getTotpSecretWithMigration: vi.fn(),
  storeBackupCodes: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auditLog', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/auth-middleware', () => ({
  authenticateAndTrackRequest: (req: Request, handler: (auth: unknown) => Promise<Response>) =>
    authenticateAndTrackRequest(req, handler),
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/totp-encryption', () => ({
  getTotpSecretWithMigration,
}));
vi.mock('@/lib/backup-codes', () => ({
  generateBackupCodes: vi.fn(() => ['AAAA-BBBB', 'CCCC-DDDD']),
  storeBackupCodes,
  verifyAndConsumeBackupCode: vi.fn(),
}));
vi.mock('otplib', () => ({
  authenticator: {
    generateSecret: vi.fn(),
    keyuri: vi.fn(),
    verify: vi.fn(() => true),
  },
}));
// Real re-auth logic; only the session-issued-at lookup is stubbed so the test
// can control the sign-in age without a real NextAuth token.
vi.mock('@/lib/server/sensitive-reauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/sensitive-reauth')>();
  return { ...actual, getSessionIssuedAt };
});

import { POST } from '@/app/api/auth/2fa/verify/route';

function verifyRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/2fa/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/2fa/verify passwordless re-auth (real lib)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateAndTrackRequest.mockImplementation(
      async (_req: Request, handler: (auth: unknown) => Promise<Response>) =>
        handler({ user: { id: 'user-1' }, method: 'session' }),
    );
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      password: null,
      is2FAEnabled: false,
      totpSecret: 'encrypted-secret',
      backupCodes: null,
    });
    prismaMock.user.update.mockResolvedValue({ id: 'user-1' });
    getTotpSecretWithMigration.mockResolvedValue('plaintext-secret');
    storeBackupCodes.mockResolvedValue(true);
    getSessionIssuedAt.mockResolvedValue(Math.floor(Date.now() / 1000));
  });

  it('enrols a passwordless account after a recent sign-in, ignoring the enrolment code as re-auth', async () => {
    const response = await POST(verifyRequest({ code: '123456' }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.backupCodes).toEqual(['AAAA-BBBB', 'CCCC-DDDD']);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { is2FAEnabled: true },
    });
  });

  it('rejects a passwordless account with a stale sign-in even though the body carries a code', async () => {
    getSessionIssuedAt.mockResolvedValue(Math.floor(Date.now() / 1000) - 86400);

    const response = await POST(verifyRequest({ code: '123456' }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('A recent login or authenticator code is required');
    expect(storeBackupCodes).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
