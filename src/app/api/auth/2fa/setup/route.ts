import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import { logAuditEvent } from '@/lib/auditLog'; // Import logAuditEvent
import { storeTotpSecret } from '@/lib/totp-encryption';

export async function POST(req: Request) {
  return authenticateAndTrackRequest(req, async (auth) => {
    const userId = auth.user?.id || null;
    const ipAddressReq = req.headers.get('x-forwarded-for') || req.headers.get('remote-addr') || 'N/A';
    const userAgent = req.headers.get('user-agent') || 'N/A';

    if (!userId) {
    await logAuditEvent({
      userId,
      action: '2FA_SETUP_FAILURE',
      ipAddress: ipAddressReq,
      userAgent,
      reason: 'Unauthorized: User not logged in.',
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userEmail = auth.user?.email; // Assuming email is available in session

  if (!userEmail) {
    await logAuditEvent({
      userId,
      action: '2FA_SETUP_FAILURE',
      ipAddress: ipAddressReq,
      userAgent,
      reason: 'User email not found in session.',
    });
    return NextResponse.json({ error: 'User email not found in session' }, { status: 400 });
  }

  await logAuditEvent({
    userId,
    action: '2FA_SETUP_ATTEMPT',
    ipAddress: ipAddressReq,
    userAgent,
  });

  try {
    // Generate a new TOTP secret
    const secret = authenticator.generateSecret();
    const serviceName = 'OGM-OPNsenseGroupManager'; // Or your app name
    const otpauth = authenticator.keyuri(userEmail, serviceName, secret);

    // Store the *unverified* secret in the database (encrypted)
    // We won't set is2FAEnabled to true until the user verifies the code
    const storeSuccess = await storeTotpSecret(userId, secret);
    if (!storeSuccess) {
      await logAuditEvent({
        userId,
        action: '2FA_SETUP_FAILURE',
        reason: 'Failed to encrypt and store TOTP secret.',
        ipAddress: ipAddressReq,
        userAgent,
      });
      return NextResponse.json({ error: 'Failed to setup 2FA' }, { status: 500 });
    }

    // Ensure 2FA is not enabled until verified
    await prisma.user.update({
      where: { id: userId },
      data: { is2FAEnabled: false },
    });

    // Generate QR code data URL
    const qrCodeDataURL = await qrcode.toDataURL(otpauth);

    await logAuditEvent({
      userId,
      action: '2FA_SETUP_SUCCESS',
      ipAddress: ipAddressReq,
      userAgent,
    });

    // Return the QR code and secret for manual entry
    return NextResponse.json({
      secret: secret, // For manual entry
      qrCodeDataURL: qrCodeDataURL,
    });

  } catch (error) {
    logger.error('Error setting up 2FA:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await logAuditEvent({
      userId,
      action: '2FA_SETUP_FAILURE',
      ipAddress: ipAddressReq,
      userAgent,
      reason: `Failed to set up 2FA: ${errorMessage}`,
    });
    return NextResponse.json({ error: 'Failed to set up 2FA' }, { status: 500 });
  }
  });
}