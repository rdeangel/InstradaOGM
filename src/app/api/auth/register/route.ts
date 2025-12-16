// app/api/auth/register/route.ts
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/auditLog';
import { sendVerificationEmail } from '@/lib/email'; // Import sendVerificationEmail
import crypto from 'crypto'; // Import crypto for token generation
import type { AuditEventData } from '@/lib/auditLog'; // Import AuditEventData

const SALT_ROUNDS = 10;
const VERIFICATION_TOKEN_EXPIRY_HOURS = 24; // Token expiry time

export async function POST(request: Request) {
  // Check if local registration is allowed based on global settings
  const enableRegistrationSetting = await prisma.globalSettings.findFirst({
    orderBy: {
      id: 'asc',
    },
  });
  const isRegistrationEnabled = enableRegistrationSetting?.enableRegistration;

  if (!isRegistrationEnabled) {
    await logAuditEvent({ action: 'REGISTER_ATTEMPT_DENIED', reason: 'Local registration disabled via settings' });
    return NextResponse.json({ message: 'Local user registration is currently disabled' }, { status: 403 });
  }

  const auditData: AuditEventData = { method: 'CREDENTIALS', action: 'REGISTER_ATTEMPT', details: {} };

  try {
    const body = await request.json();
    const { name, username, email, password } = body; // Extract name and username from the body
    auditData.details = { email, name, username }; // Move email, name, username into details

    await logAuditEvent(auditData);

    // Basic validation
    if (!email || !password) {
      await logAuditEvent({ ...auditData, action: 'REGISTER_FAILURE', reason: 'Missing email or password' });
      return NextResponse.json({ message: 'Email and password are required' }, { status: 400 });
    }
    if (password.length < (parseInt(process.env.AUTH_PASSWORD_MIN_LENGTH || '8'))) {
      await logAuditEvent({ ...auditData, action: 'REGISTER_FAILURE', reason: 'Password too short' });
      return NextResponse.json({ message: `Password must be at least ${process.env.AUTH_PASSWORD_MIN_LENGTH || '8'} characters` }, { status: 400 });
    }

    // Check if user already exists by email
    const existingUserByEmail = await prisma.user.findUnique({
      where: { email: email },
    });

    if (existingUserByEmail) {
      // Handle case where user exists by email but is unverified/pending
      if (!existingUserByEmail.emailVerified && existingUserByEmail.role === 'PENDING') {
        // Optionally resend verification email here if desired
        await logAuditEvent({ ...auditData, action: 'REGISTER_ATTEMPT_USER_PENDING' });
        return NextResponse.json({ message: 'Registration pending. Please check your email for a verification link.' }, { status: 409 });
      }
      // Otherwise, user exists with this email and is likely active
      await logAuditEvent({ ...auditData, action: 'REGISTER_FAILURE', reason: 'User already exists with this email' });
      return NextResponse.json({ message: 'User already exists with this email' }, { status: 409 });
    }

    // Check if user already exists by username (username is unique)
    if (username) { // Only check if username is provided
      const existingUserByUsername = await prisma.user.findUnique({
        where: { username: username },
      });

      if (existingUserByUsername) {
        await logAuditEvent({ ...auditData, action: 'REGISTER_FAILURE', reason: 'User already exists with this username' });
        return NextResponse.json({ message: 'User already exists with this username' }, { status: 409 });
      }
    }

    // Check if user already exists by name (name is not unique, use findFirst)
    if (name) { // Only check if name is provided
      const existingUserByName = await prisma.user.findFirst({
        where: { name: name },
        orderBy: {
          id: 'asc',
        },
      });

      if (existingUserByName) {
        // Decide how to handle duplicate names if necessary.
        // For now, we'll allow duplicate names as username is the unique identifier for local auth.
        // Log a warning or handle as per requirements.
        logger.warn(`User with name "${name}" already exists. Allowing registration as username is unique.`);
      }
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Determine role based on email verification requirement
    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;
    const requireEmailVerification = process.env.AUTH_REQUIRE_VERIFIED_EMAIL_LOCAL === 'true';

    // First user is always SUPER_ADMIN
    // Subsequent users: PENDING if email verification required, USER if not
    const initialRole = isFirstUser ? 'SUPER_ADMIN' : (requireEmailVerification ? 'PENDING' : 'USER');

    // Create the user
    const user = await prisma.user.create({
      data: {
        name: name, // Include name in user creation
        username: username, // Include username in user creation
        email: email,
        password: hashedPassword,
        role: initialRole,
        // emailVerified will be null initially (or set to current date if verification not required)
        emailVerified: requireEmailVerification ? null : new Date(),
      },
    });

    // --- Start Email Verification Logic ---
    // Only send verification if email verification is required AND the user is PENDING
    if (requireEmailVerification && initialRole === 'PENDING') {
      // Generate verification token
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
        await logAuditEvent({ action: 'VERIFICATION_EMAIL_SENT', userId: user.id, email: user.email });
      } catch (emailError) {
        logger.error(`Failed to send verification email to ${user.email}:`, emailError);
        // Registration continues even if email notification fails
        // Currently, it proceeds, but the user won't be able to verify.
        await logAuditEvent({ action: 'VERIFICATION_EMAIL_FAILED', userId: user.id, email: user.email, reason: emailError instanceof Error ? emailError.message : 'Unknown email error' });
        // Optionally, you could delete the user here or return a specific error
        // return NextResponse.json({ message: 'User created, but failed to send verification email.' }, { status: 500 });
      }
    }
    // --- End Email Verification Logic ---



    const { password: userPassword, ...userWithoutPassword } = user;
    void userPassword; // Mark as intentionally unused

    await logAuditEvent({ action: 'REGISTER_SUCCESS', userId: user.id, email: user.email, method: 'CREDENTIALS', role: initialRole });

    // Return different response based on whether email verification is required
    return NextResponse.json({
      ...userWithoutPassword,
      requiresVerification: requireEmailVerification
    }, { status: 201 });
  } catch (error) {
    logger.error('Error creating user:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    await logAuditEvent({ ...auditData, action: 'REGISTER_FAILURE', reason: `Error creating user: ${errorMessage}` });
    return NextResponse.json({ message: 'Error creating user' }, { status: 500 });
  }
}