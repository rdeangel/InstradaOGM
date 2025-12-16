import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { logAuditEvent } from '@/lib/auditLog';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import type { User } from '@prisma/client';

export async function PUT(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user) {
    await logAuditEvent({
      userId: null,
      action: 'USER_PROFILE_UPDATE_FAILURE',
      reason: auth.authError || 'Unauthorized',
    });
    return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
  }

  // Only allow local users to update their profile via this route
  // Type guard to check if user has password property (local user)
  const hasPassword = 'password' in auth.user;
  if (!hasPassword) {
    await logAuditEvent({
      userId: auth.user.id,
      action: 'USER_PROFILE_UPDATE_FAILURE',
      reason: 'Forbidden: Profile updates are only available for local accounts via this route.',
    });
    return NextResponse.json({ message: 'Profile updates are only available for local accounts.' }, { status: 403 });
  }

  let data;
  try {
    data = await request.json();
  } catch {
    await logAuditEvent({
      userId: auth.user.id,
      action: 'USER_PROFILE_UPDATE_FAILURE',
      reason: 'Invalid JSON body',
    });
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  // Log the update attempt
  await logAuditEvent({
    userId: auth.user.id,
    action: 'USER_PROFILE_UPDATE_ATTEMPT',
    details: {
      updateData: {
        name: data.name,
        username: data.username,
        email: data.email,
      },
    },
  });

  const { name, username, email, password } = data; // Accept name, username, email, and password

  // Basic validation
  if (name === undefined && username === undefined && email === undefined && password === undefined) {
      await logAuditEvent({
        userId: auth.user.id,
        action: 'USER_PROFILE_UPDATE_FAILURE',
        reason: 'No update data provided',
      });
      return NextResponse.json({ message: 'No update data provided' }, { status: 400 });
  }

  const updateData: Partial<User> = {};

  // Handle Name update
  if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
          await logAuditEvent({
            userId: auth.user.id,
            action: 'USER_PROFILE_UPDATE_FAILURE',
            details: { name },
            reason: 'Invalid name format',
          });
          return NextResponse.json({ message: 'Invalid name format' }, { status: 400 });
      }
      updateData.name = name.trim();
  }

  // Handle Username update
  if (username !== undefined) {
      if (typeof username !== 'string' || username.trim() === '') {
          await logAuditEvent({
            userId: auth.user.id,
            action: 'USER_PROFILE_UPDATE_FAILURE',
            details: { username },
            reason: 'Invalid username format',
          });
          return NextResponse.json({ message: 'Invalid username format' }, { status: 400 });
      }
      // Check for duplicate username if it's being changed
      const currentUser = await prisma.user.findUnique({
          where: { id: auth.user.id },
          select: { username: true } // Explicitly select username
      });
      if (currentUser?.username !== username.trim()) {
          const existingUserWithUsername = await prisma.user.findUnique({
              where: { username: username.trim() },
          });
          if (existingUserWithUsername) {
              await logAuditEvent({
                userId: auth.user.id,
                action: 'USER_PROFILE_UPDATE_FAILURE',
                details: { username },
                reason: 'Username is already taken.',
              });
              return NextResponse.json({ message: 'Username is already taken.' }, { status: 409 });
          }
      }
      updateData.username = username.trim();
  }


  // Handle Email update
  if (email !== undefined) {
      // Basic email format validation
      if (typeof email !== 'string' || !email.includes('@')) {
           await logAuditEvent({
             userId: auth.user.id,
             action: 'USER_PROFILE_UPDATE_FAILURE',
             details: { email },
             reason: 'Invalid email format',
           });
           return NextResponse.json({ message: 'Invalid email format' }, { status: 400 });
      }
      // Check for duplicate email if it's being changed
      const currentUser = await prisma.user.findUnique({ where: { id: auth.user.id } });
      if (currentUser?.email !== email.trim()) {
           const existingUserWithEmail = await prisma.user.findUnique({
               where: { email: email.trim() },
           });
           if (existingUserWithEmail) {
               await logAuditEvent({
                 userId: auth.user.id,
                 action: 'USER_PROFILE_UPDATE_FAILURE',
                 details: { email },
                 reason: 'Email address is already in use.',
               });
               return NextResponse.json({ message: 'Email address is already in use.' }, { status: 409 });
           }
      }
      updateData.email = email.trim();
  }

  // Handle Password update
  if (password !== undefined && password !== '') {
      // Basic password length validation (should match frontend validation)
      const minLength = parseInt(process.env.AUTH_PASSWORD_MIN_LENGTH || '8');
      if (typeof password !== 'string' || password.length < minLength) {
          await logAuditEvent({
            userId: auth.user.id,
            action: 'USER_PROFILE_UPDATE_FAILURE',
            reason: 'Password too short',
          });
          return NextResponse.json({ message: `Password must be at least ${minLength} characters` }, { status: 400 });
      }

      // Check if new password is the same as current password
      const currentUser = await prisma.user.findUnique({
        where: { id: auth.user.id },
        select: { password: true },
      });

      if (currentUser?.password) {
        const isSamePassword = await bcrypt.compare(password, currentUser.password);
        if (isSamePassword) {
          await logAuditEvent({
            userId: auth.user.id,
            action: 'USER_PROFILE_UPDATE_FAILURE',
            reason: 'New password is the same as current password',
          });
          return NextResponse.json({ message: 'New password must be different from your current password' }, { status: 400 });
        }
      }

      updateData.password = await bcrypt.hash(password, 10);
  }

  // Prevent updating role via this route
  if (data.role !== undefined) {
       await logAuditEvent({
         userId: auth.user.id,
         action: 'USER_PROFILE_UPDATE_FAILURE',
         details: { role: data.role },
         reason: 'Updating role is not allowed via this route.',
       });
       return NextResponse.json({ message: 'Updating role is not allowed via this route.' }, { status: 400 });
  }


  try {
    const updatedUser = await prisma.user.update({
      where: { id: auth.user.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        username: true, // Include username in select
        email: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        lastActive: true,
        is2FAEnabled: true,
      },
    });

    // Log password change specifically if password was updated
    if (updateData.password !== undefined) {
        await logAuditEvent({
            userId: auth.user.id,
            action: 'USER_PASSWORD_CHANGED',
            details: {
                targetUserId: updatedUser.id,
                email: updatedUser.email, // Include email for context
                passwordChanged: true, // Indicate that the password was changed
            },
        });
    }

    // Log other profile updates if any fields other than password were updated
    const otherUpdatedFields = Object.keys(updateData).filter(key => key !== 'password');
    if (otherUpdatedFields.length > 0) {
        await logAuditEvent({
            userId: auth.user.id,
            action: 'USER_PROFILE_UPDATE_SUCCESS',
            details: {
                targetUserId: updatedUser.id,
                updatedFields: otherUpdatedFields,
            },
        });
    }


    return NextResponse.json(updatedUser);
    } catch {
      return NextResponse.json({ message: 'Failed to update profile' }, { status: 500 });
    }
  });
}