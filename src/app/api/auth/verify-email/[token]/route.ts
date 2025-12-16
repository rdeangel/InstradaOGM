// app/api/auth/verify-email/[token]/route.ts
import { NextRequest, NextResponse } from 'next/server'; // Import NextRequest
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/auditLog';
import { Role } from '@/types/opnsense'; // Import Role enum from module types
import type { AuditEventData } from '@/lib/auditLog'; // Import AuditEventData
// import { serverLogger } from '@/app/lib/logger'; // Use module's logging or audit log

// No custom interface needed for context

// Correct signature for App Router dynamic route handler
export async function GET(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ token: string }> } // Use Promise type
) {
  const params = await paramsPromise; // Await the promise
  const { token } = params; // Destructure token from resolved params
    const auditData: AuditEventData = { action: 'EMAIL_VERIFY_ATTEMPT', details: { token } };

    if (!token) {
        await logAuditEvent({ ...auditData, action: 'EMAIL_VERIFY_FAILURE', reason: 'Missing token' });
        // Redirect to an error page or show a generic message
        return NextResponse.redirect(new URL('/auth/signin?error=VerificationFailed', process.env.NEXTAUTH_URL));
    }

    try {
        // 1. Find the verification token
        const verificationToken = await prisma.verificationToken.findUnique({
            where: { token: token },
        });

        if (!verificationToken) {
            await logAuditEvent({ ...auditData, action: 'EMAIL_VERIFY_FAILURE', reason: 'Token not found' });
            return NextResponse.redirect(new URL('/auth/signin?error=VerificationInvalidToken', process.env.NEXTAUTH_URL));
        }

        // 2. Check if the token has expired
        const hasExpired = new Date() > verificationToken.expires;
        if (hasExpired) {
            // Optionally delete the expired token
            await prisma.verificationToken.delete({ where: { token: token } });
            await logAuditEvent({ 
                ...auditData, 
                action: 'EMAIL_VERIFY_FAILURE', 
                reason: 'Token expired',
                details: { ...auditData.details, identifier: verificationToken.identifier }
            });
            return NextResponse.redirect(new URL('/auth/signin?error=VerificationExpired', process.env.NEXTAUTH_URL));
        }

        // 3. Find the user associated with the token's identifier (email)
        const user = await prisma.user.findUnique({
            where: { email: verificationToken.identifier },
        });

        if (!user) {
            // This case is unlikely if token exists but user doesn't, but handle it
            await logAuditEvent({ 
                ...auditData, 
                action: 'EMAIL_VERIFY_FAILURE', 
                reason: 'User not found for token',
                details: { ...auditData.details, identifier: verificationToken.identifier }
            });
            return NextResponse.redirect(new URL('/auth/signin?error=VerificationUserNotFound', process.env.NEXTAUTH_URL));
        }

        auditData.userId = user.id;
        auditData.email = user.email;

        // 4. Update the user: set emailVerified and change role from PENDING to USER
        await prisma.user.update({
            where: { id: user.id },
            data: {
                emailVerified: new Date(),
                role: user.role === Role.PENDING ? Role.USER : user.role, // Only change role if it was PENDING
            },
        });

        // 5. Delete the used verification token
        await prisma.verificationToken.delete({
            where: { token: token },
        });

        await logAuditEvent({ ...auditData, action: 'EMAIL_VERIFY_SUCCESS' });

        // 6. Redirect to a success page or sign-in page with success message
        // Redirecting to sign-in is common
        return NextResponse.redirect(new URL('/auth/signin?verified=true', process.env.NEXTAUTH_URL));

    } catch (error) {
        // Log the error using the audit log
        const reason = error instanceof Error ? error.message : 'Unknown error';
        await logAuditEvent({
            ...auditData,
            action: 'API_ERROR',
            method: 'API',
            reason: `Internal server error during email verification: ${reason}`,
            details: {
                apiRoute: '/api/auth/verify-email/[token]',
                error: reason,
            },
        });
        // Redirect to a generic error page
        return NextResponse.redirect(new URL('/auth/signin?error=VerificationFailed', process.env.NEXTAUTH_URL));
    }
}