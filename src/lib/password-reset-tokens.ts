import crypto from 'crypto';

const TOKEN_BYTES = 32; // 256-bit CSPRNG token; high entropy, so a fast hash is fine (not a password)

export function hashPasswordResetToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generatePasswordResetToken(): { plaintextToken: string; tokenHash: string } {
  const plaintextToken = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  return { plaintextToken, tokenHash: hashPasswordResetToken(plaintextToken) };
}

/**
 * Generates a password reset token expiry date.
 * @param hoursValid - Number of hours the token should be valid (default: 1 hour)
 * @returns Date object representing when the token expires
 */
export function generatePasswordResetExpiry(hoursValid: number = 1): Date {
  const expiryTime = Date.now() + (hoursValid * 60 * 60 * 1000);
  return new Date(expiryTime);
}

/**
 * Checks if a password reset token has expired.
 * @param expiryDate - The expiry date from the database
 * @returns True if the token has expired, false otherwise
 */
export function isPasswordResetTokenExpired(expiryDate: Date | null): boolean {
  if (!expiryDate) {
    return true; // No expiry date means expired
  }

  return new Date() > expiryDate;
}

/**
 * Validates the format of a password reset token.
 * @param token - The token to validate
 * @returns True if the token format is valid, false otherwise
 */
export function isValidPasswordResetTokenFormat(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  // Token should be a hex string of the expected length
  const expectedLength = TOKEN_BYTES * 2; // Each byte becomes 2 hex characters
  const hexPattern = /^[a-f0-9]+$/i;

  return token.length === expectedLength && hexPattern.test(token);
}

export const PASSWORD_RESET_INVALID_MESSAGE =
  'This password reset link is invalid or has expired. Please request a new link.';
