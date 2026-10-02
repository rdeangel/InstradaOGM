import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTotpSecretWithMigration } from '@/lib/totp-encryption';
import { verifyAndConsumeBackupCode } from '@/lib/backup-codes';

export const RECENT_LOGIN_WINDOW_SECONDS = 600;

export type ReauthInput = {
  currentPassword?: unknown;
  totpCode?: unknown;
  code?: unknown;
  backupCode?: unknown;
  isBackupCode?: unknown;
};

export type ReauthUser = {
  id: string;
  password: string | null;
  is2FAEnabled: boolean;
  totpSecret: string | null;
  backupCodes: string | null;
};

export type ReauthResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function isRecentLogin(iat: number | null | undefined, nowSeconds: number = Math.floor(Date.now() / 1000)): boolean {
  if (typeof iat !== 'number') {
    return false;
  }
  return nowSeconds - iat <= RECENT_LOGIN_WINDOW_SECONDS;
}

export async function getSessionIssuedAt(req: Request): Promise<number | null> {
  const token = await getToken({
    req: req as NextRequest,
    secret: process.env.NEXTAUTH_SECRET,
  });
  return typeof token?.iat === 'number' ? token.iat : null;
}

async function verifyTotpOrBackup(user: ReauthUser, code: string, isBackupCode: boolean): Promise<boolean> {
  if (!user.is2FAEnabled) {
    return false;
  }

  if (isBackupCode || (code.length > 6 && /[A-Za-z]/.test(code))) {
    const verification = await verifyAndConsumeBackupCode(user.id, code, user.backupCodes);
    if (verification.isValid && verification.updatedCodes !== null) {
      await prisma.user.update({
        where: { id: user.id },
        data: { backupCodes: JSON.stringify(verification.updatedCodes) },
      });
      return true;
    }
    return false;
  }

  if (!user.totpSecret) {
    return false;
  }
  const plaintextSecret = await getTotpSecretWithMigration(user.id, user.totpSecret);
  if (!plaintextSecret) {
    return false;
  }
  return authenticator.verify({ token: code, secret: plaintextSecret });
}

export async function verifySensitiveReauth(
  user: ReauthUser,
  input: ReauthInput,
  sessionIat: number | null,
): Promise<ReauthResult> {
  const currentPassword = asNonEmptyString(input.currentPassword);
  const totpCode = asNonEmptyString(input.totpCode) ?? asNonEmptyString(input.code);
  const backupCode = asNonEmptyString(input.backupCode);
  const isBackupCode = input.isBackupCode === true || input.isBackupCode === 'true';
  const code = backupCode ?? totpCode;

  if (code) {
    const valid = await verifyTotpOrBackup(user, code, isBackupCode || !!backupCode);
    if (!valid) {
      return { ok: false, status: 400, message: 'Invalid authenticator or backup code' };
    }
    return { ok: true };
  }

  if (currentPassword) {
    if (!user.password) {
      return { ok: false, status: 400, message: 'No password is set on this account' };
    }
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return { ok: false, status: 400, message: 'Current password is incorrect' };
    }
    return { ok: true };
  }

  if (!user.password && isRecentLogin(sessionIat)) {
    return { ok: true };
  }

  return {
    ok: false,
    status: 400,
    message: user.password
      ? 'Current password or authenticator code is required'
      : 'A recent login or authenticator code is required',
  };
}

export async function revokeOtherCredentials(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.apiKey.updateMany({ where: { userId }, data: { enabled: false } });
}

export function sessionAuthDenied(method: string | undefined): { status: number; message: string } | null {
  if (!method || method === 'session') {
    return null;
  }
  if (method === 'apiKey') {
    return { status: 403, message: 'This action requires an interactive session' };
  }
  return { status: 401, message: 'Unauthorized' };
}
