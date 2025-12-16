// app/api/auth/resend-verification/route.ts
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/auditLog';
import { sendVerificationEmail } from '@/lib/email';
import crypto from 'crypto';
import { Role } from '@/types/opnsense'; // Import Role enum from module types
import type { AuditEventData } from '@/lib/auditLog'; // Import AuditEventData

const VERIFICATION_TOKEN_EXPIRY_HOURS = 24; // Consistent expiry time

export async function POST(request: Request) {
    const auditData: AuditEventData = { event: 'RESEND_VERIFICATION_ATTEMPT', action: 'USER_ACTION' };

    try {
        const body = await request.json();
        const { email } = body;
        auditData.email = email;

        if (!email) {
            await logAuditEvent({ ...auditData, event: 'RESEND_VERIFICATION_FAILURE', reason: 'Missing email' });
            return NextResponse.json({ message: 'Email is required' }, { status: 400 });
        }

        // Find the user by email
        const user = await prisma.user.findUnique({
            where: { email: email },
        });

        // Check if user exists and needs verification (is PENDING or emailVerified is null)
        if (!user || (user.emailVerified && user.role !== Role.PENDING)) {
            // Don't reveal if the email exists or is already verified for security.
            // Log the actual reason internally.
            const reason = !user ? 'User not found' : 'User already verified or not pending';
            await logAuditEvent({ ...auditData, event: 'RESEND_VERIFICATION_IGNORED', reason: reason, userId: user?.id });
            // Return a generic success message to prevent email enumeration
            return NextResponse.json({ message: 'If an account with that email requires verification, a new email has been sent.' }, { status: 200 });
        }

        auditData.userId = user.id;

        // --- Generate and send new token ---
        // Optionally: Delete old tokens for this identifier first
        await prisma.verificationToken.deleteMany({
            where: { identifier: email },
        });

        // Generate new verification token
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date();
        expires.setHours(expires.getHours() + VERIFICATION_TOKEN_EXPIRY_HOURS);

        // Store verification token in the database
        await prisma.verificationToken.create({
            data: {
                identifier: user.email!,
                token: token,
                expires: expires,
            },
        });

        // Construct verification URL
        const verificationUrl = `${process.env.NEXTAUTH_URL}/api/auth/verify-email/${token}`;

        // Send verification email
        try {
            await sendVerificationEmail(user.email!, verificationUrl);
            await logAuditEvent({ ...auditData, event: 'RESEND_VERIFICATION_SUCCESS' });
            return NextResponse.json({ message: 'A new verification email has been sent.' }, { status: 200 });
        } catch (emailError) {
            logger.error(`Failed to resend verification email to ${user.email}:`, emailError);
            await logAuditEvent({ ...auditData, event: 'RESEND_VERIFICATION_FAILURE', reason: `Email sending failed: ${emailError instanceof Error ? emailError.message : 'Unknown email error'}` });
            // Return a generic server error
            return NextResponse.json({ message: 'Failed to send verification email. Please try again later.' }, { status: 500 });
        }
        // --- End generate and send ---

    } catch (error) {
        logger.error('Resend verification error:', error);
        const reason = error instanceof Error ? error.message : 'Unknown error';
        await logAuditEvent({ ...auditData, event: 'RESEND_VERIFICATION_FAILURE', reason: `Internal server error: ${reason}` });
        return NextResponse.json({ message: 'An error occurred while processing your request.' }, { status: 500 });
    }
}