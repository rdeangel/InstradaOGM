import crypto from 'crypto';

export function shouldCreateSeedAdmin(userCount: number): boolean {
  return userCount === 0;
}

export function resolveInitialAdminPassword(
  envPassword: string | undefined,
  randomPassword: () => string = () => crypto.randomBytes(18).toString('base64url'),
): { password: string; generated: boolean } {
  const trimmed = envPassword?.trim();
  if (trimmed) {
    return { password: trimmed, generated: false };
  }
  return { password: randomPassword(), generated: true };
}
