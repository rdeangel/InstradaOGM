import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'fs';
import path from 'path';

const {
  authenticateAndTrackRequest,
  prismaMock,
  verifySensitiveReauth,
  sessionAuthDenied,
  storeTotpSecret,
  getTotpSecretWithMigration,
  storeBackupCodes,
} = vi.hoisted(() => ({
  authenticateAndTrackRequest: vi.fn(),
  prismaMock: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
  verifySensitiveReauth: vi.fn(),
  sessionAuthDenied: vi.fn(),
  storeTotpSecret: vi.fn(),
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
vi.mock('@/lib/network-utils', () => ({
  getClientIp: vi.fn(() => '10.3.0.1'),
}));
vi.mock('otplib', () => ({
  authenticator: {
    generateSecret: vi.fn(() => 'NEWSECRET'),
    keyuri: vi.fn(() => 'otpauth://totp/OGM-OPNsenseGroupManager:admin@example.com?secret=NEWSECRET'),
    verify: vi.fn(),
  },
}));
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,qr') },
}));
vi.mock('@/lib/totp-encryption', () => ({
  storeTotpSecret,
  getTotpSecretWithMigration,
}));
vi.mock('@/lib/backup-codes', () => ({
  generateBackupCodes: vi.fn(() => ['AAAA-BBBB', 'CCCC-DDDD']),
  storeBackupCodes,
}));
vi.mock('@/lib/server/sensitive-reauth', () => ({
  verifySensitiveReauth,
  sessionAuthDenied,
  getSessionIssuedAt: vi.fn(async () => Math.floor(Date.now() / 1000)),
}));

import { POST as setupPost } from '@/app/api/auth/2fa/setup/route';
import { POST as verifyPost } from '@/app/api/auth/2fa/verify/route';
import { GET as backupCodesGet, POST as backupCodesPost } from '@/app/api/auth/2fa/backup-codes/route';
import { authenticator } from 'otplib';

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('2FA enrolment re-auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionAuthDenied.mockReturnValue(null);
    authenticateAndTrackRequest.mockImplementation(
      async (req: Request, handler: (auth: unknown) => Promise<Response>) =>
        handler({ user: { id: 'user-1', email: 'admin@example.com' }, method: 'session' }),
    );
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      password: 'hash',
      is2FAEnabled: false,
      totpSecret: 'encrypted',
      backupCodes: null,
    });
    prismaMock.user.update.mockResolvedValue({ id: 'user-1' });
    storeTotpSecret.mockResolvedValue(true);
    storeBackupCodes.mockResolvedValue(true);
    getTotpSecretWithMigration.mockResolvedValue('plaintext-secret');
  });

  function asApiKey() {
    sessionAuthDenied.mockReturnValue({ status: 403, message: 'This action requires an interactive session' });
  }

  describe('POST /api/auth/2fa/setup', () => {
    it('rejects API key authentication', async () => {
      asApiKey();
      const response = await setupPost(jsonRequest('http://localhost/api/auth/2fa/setup', {}));
      expect(response.status).toBe(403);
      expect(storeTotpSecret).not.toHaveBeenCalled();
    });

    it('rejects anonymous callers', async () => {
      authenticateAndTrackRequest.mockImplementation(
        async (req: Request, handler: (auth: unknown) => Promise<Response>) =>
          handler({ user: null, method: 'session' }),
      );
      const response = await setupPost(jsonRequest('http://localhost/api/auth/2fa/setup', {}));
      expect(response.status).toBe(401);
      expect(storeTotpSecret).not.toHaveBeenCalled();
    });

    it('refuses setup when 2FA is already enabled', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', is2FAEnabled: true });
      const response = await setupPost(jsonRequest('http://localhost/api/auth/2fa/setup', {}));
      expect(response.status).toBe(400);
      expect(storeTotpSecret).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/2fa/verify', () => {
    it('rejects API key authentication', async () => {
      asApiKey();
      const response = await verifyPost(jsonRequest('http://localhost/api/auth/2fa/verify', { code: '123456' }));
      expect(response.status).toBe(403);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('rejects a missing password and does not enable 2FA', async () => {
      verifySensitiveReauth.mockResolvedValue({
        ok: false,
        status: 400,
        message: 'Current password is required',
      });
      const response = await verifyPost(jsonRequest('http://localhost/api/auth/2fa/verify', { code: '123456' }));
      expect(response.status).toBe(400);
      expect(verifySensitiveReauth).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1' }),
        { currentPassword: undefined },
        expect.any(Number),
      );
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('rejects a wrong password even with a valid code', async () => {
      verifySensitiveReauth.mockResolvedValue({
        ok: false,
        status: 400,
        message: 'Current password is incorrect',
      });
      vi.mocked(authenticator.verify).mockReturnValue(true);
      const response = await verifyPost(jsonRequest('http://localhost/api/auth/2fa/verify', {
        code: '123456',
        currentPassword: 'wrong',
      }));
      expect(response.status).toBe(400);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('enables 2FA with the correct password and a valid code', async () => {
      verifySensitiveReauth.mockResolvedValue({ ok: true });
      vi.mocked(authenticator.verify).mockReturnValue(true);
      const response = await verifyPost(jsonRequest('http://localhost/api/auth/2fa/verify', {
        code: '123456',
        currentPassword: 'current-pass',
      }));
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.backupCodes).toEqual(['AAAA-BBBB', 'CCCC-DDDD']);
      expect(verifySensitiveReauth).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1' }),
        { currentPassword: 'current-pass' },
        expect.any(Number),
      );
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { is2FAEnabled: true },
      });
    });

    it('refuses verification when 2FA is already enabled', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        password: 'hash',
        is2FAEnabled: true,
        totpSecret: 'encrypted',
        backupCodes: null,
      });
      const response = await verifyPost(jsonRequest('http://localhost/api/auth/2fa/verify', {
        code: '123456',
        currentPassword: 'current-pass',
      }));
      expect(response.status).toBe(400);
      expect(verifySensitiveReauth).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/2fa/backup-codes', () => {
    it('rejects API key authentication', async () => {
      asApiKey();
      const response = await backupCodesPost(jsonRequest('http://localhost/api/auth/2fa/backup-codes', {}));
      expect(response.status).toBe(403);
      expect(storeBackupCodes).not.toHaveBeenCalled();
    });

    it('rejects regeneration without the password', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        password: 'hash',
        is2FAEnabled: true,
        totpSecret: 'encrypted',
        backupCodes: null,
      });
      verifySensitiveReauth.mockResolvedValue({
        ok: false,
        status: 400,
        message: 'Current password is required',
      });
      const response = await backupCodesPost(jsonRequest('http://localhost/api/auth/2fa/backup-codes', {}));
      expect(response.status).toBe(400);
      expect(storeBackupCodes).not.toHaveBeenCalled();
    });

    it('regenerates codes when the password is correct', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        password: 'hash',
        is2FAEnabled: true,
        totpSecret: 'encrypted',
        backupCodes: null,
      });
      verifySensitiveReauth.mockResolvedValue({ ok: true });
      const response = await backupCodesPost(jsonRequest('http://localhost/api/auth/2fa/backup-codes', {
        currentPassword: 'current-pass',
      }));
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.backupCodes).toEqual(['AAAA-BBBB', 'CCCC-DDDD']);
      expect(verifySensitiveReauth).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1' }),
        { currentPassword: 'current-pass' },
        expect.any(Number),
      );
    });
  });

  describe('GET /api/auth/2fa/backup-codes', () => {
    it('still returns the status for API key callers', async () => {
      authenticateAndTrackRequest.mockImplementation(
        async (req: Request, handler: (auth: unknown) => Promise<Response>) =>
          handler({ user: { id: 'user-1', email: 'admin@example.com' }, method: 'apiKey' }),
      );
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        is2FAEnabled: true,
        backupCodes: null,
      });
      const request = new Request('http://localhost/api/auth/2fa/backup-codes');
      const response = await backupCodesGet(request);
      expect(response.status).toBe(200);
    });
  });

  describe('removed legacy endpoints', () => {
    it('no longer exist on disk', () => {
      const dir = path.join(process.cwd(), 'src', 'app', 'api', 'auth', '2fa');
      expect(existsSync(path.join(dir, 'enable', 'route.ts'))).toBe(false);
      expect(existsSync(path.join(dir, 'route.ts'))).toBe(false);
    });
  });
});
