import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role } from '@/types/opnsense';
import { logAuditEvent } from '@/lib/auditLog';
import { logger } from '@/lib/logger';
import { authenticateRequest, handleAuthResponse, trackUsageByAuthMethod } from '@/lib/auth-middleware';
import bcrypt from 'bcryptjs';

// Define the type for the auth object returned by authenticateRequest
interface AuthenticatedRequest {
  user?: {
    id: string;
    role: Role | string;
  };
  authError?: string;
}

// Helper function to check if user is admin or super admin
function isAdminOrSuperAdmin(auth: AuthenticatedRequest): boolean {
  return !!(auth.user && (auth.user.role === Role.ADMIN || auth.user.role === Role.SUPER_ADMIN));
}

// GET /api/admin/users/[id] - Get a user by ID
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);

  // Check for rate limiting errors for authenticated users
  if (auth.user) {
    const authError = handleAuthResponse(auth);
    if (authError) return authError;
  }

  // Check for rate limiting errors
  const authError = handleAuthResponse(auth);
  if (authError) return authError;

  if (!auth.user) {
    return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
  }

  if (!isAdminOrSuperAdmin(auth)) {
    const { id } = await context.params;
    await logAuditEvent({
      userId: auth.user.id,
      action: 'USER_READ_FAILURE',
      details: { targetUserId: id },
      reason: 'Unauthorized: User does not have sufficient role to read users.',
    });
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { id: userId } = await context.params;

  try {
    // Fetch the user with accounts and groups
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        lastActive: true,
        is2FAEnabled: true,
        mustChangePassword: true,
        passwordChangedAt: true,
        accounts: {
          select: {
            provider: true,
            externalGroups: true,
          },
        },
        groups: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

    if (!user) {
      await logAuditEvent({
        userId: auth.user.id,
        action: 'USER_READ_FAILURE',
        details: { targetUserId: userId },
        reason: 'User not found.',
      });
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // Fetch all SSO group mappings
    const ssoGroupMappings = await prisma.ssoGroupMapping.findMany({
      select: {
        id: true,
        ssoProvider: true,
        ssoGroupName: true,
        localGroupId: true,
        localGroup: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

    // Calculate auth method and provider
    const authMethod = user.accounts && user.accounts.length > 0 ? 'oauth' : 'Local';
    const ssoProvider = user.accounts && user.accounts.length > 0 ? user.accounts[0].provider : undefined;

    // Debug logging
    logger.debug(`[GET /api/admin/users/${userId}] User auth method: ${authMethod}, provider: ${ssoProvider}`);
    logger.debug(`[GET /api/admin/users/${userId}] User accounts: ${JSON.stringify(user.accounts)}`);
    logger.debug(`[GET /api/admin/users/${userId}] SSO group mappings count: ${ssoGroupMappings.length}`);

    // Find mapped groups for SSO users
    const mappedGroups = authMethod === 'oauth' && ssoProvider
      ? Array.from(new Set(ssoGroupMappings
        .filter(mapping => {
          // Find the account for the current provider (case-insensitive comparison)
          const account = user.accounts.find(acc => acc.provider.toLowerCase() === ssoProvider.toLowerCase());
          const userExternalGroups = (account?.externalGroups || []) as string[];

          // Debug logging for this specific user
          logger.debug(`[GET /api/admin/users/${userId}] Account for provider ${ssoProvider}: ${JSON.stringify(account)}`);
          logger.debug(`[GET /api/admin/users/${userId}] User external groups: ${JSON.stringify(userExternalGroups)}`);
          logger.debug(`[GET /api/admin/users/${userId}] Checking mapping: ${mapping.ssoProvider}:${mapping.ssoGroupName}`);

          // Only map if the SSO group name is present in the user's external groups (case-insensitive provider comparison)
          const isMatch = mapping.ssoProvider.toLowerCase() === ssoProvider.toLowerCase() && userExternalGroups.includes(mapping.ssoGroupName);
          logger.debug(`[GET /api/admin/users/${userId}] Mapping match: ${isMatch}`);
          return isMatch;
        })
        .map(mapping => mapping.localGroup.id))) // Get unique localGroup IDs
        .map(groupId => ssoGroupMappings.find(mapping => mapping.localGroup.id === groupId)?.localGroup) // Map back to localGroup objects
        .filter(Boolean) as { id: string; name: string; description: string | null; }[] // Filter out undefined and assert type
      : [];

    logger.debug(`[GET /api/admin/users/${userId}] Final mapped groups: ${JSON.stringify(mappedGroups)}`);

    // Get external groups from the first account
    const externalGroups = user.accounts && user.accounts.length > 0
      ? (user.accounts[0].externalGroups || []) as string[]
      : [];

    // Construct the detailed user response
    const detailedUser = {
      ...user,
      authMethod,
      ssoProvider,
      directGroups: user.groups,
      mappedGroups,
      externalGroups,
    };



    // Track usage for authenticated requests
    await trackUsageByAuthMethod(request, auth, 200);

    return NextResponse.json(detailedUser);
  } catch (error) {
    logger.error(`Error fetching user ${userId}:`, error);
    await logAuditEvent({
      userId: auth.user.id,
      action: 'USER_READ_FAILURE',
      details: { targetUserId: userId },
      reason: 'Database error',
    });
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/admin/users/[id] - Update a user by ID
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);

  // Check for rate limiting errors
  if (auth.user) {
    const authError = handleAuthResponse(auth);
    if (authError) return authError;
  }

  if (!auth.user) {
    return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
  }

  if (!isAdminOrSuperAdmin(auth)) {
    const { id } = await context.params;
    await logAuditEvent({
      userId: auth.user.id,
      action: 'USER_UPDATE_FAILURE',
      details: { targetUserId: id },
      reason: 'Unauthorized: User does not have sufficient role to update users.',
    });
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { id: userId } = await context.params;
  let data;
  try {
    data = await request.json();
    logger.debug("Received data for user update.");
  } catch {
    await logAuditEvent({
      userId: auth.user.id,
      action: 'USER_UPDATE_FAILURE',
      details: { targetUserId: userId },
      reason: 'Invalid JSON body',
    });
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  await logAuditEvent({
    userId: auth.user.id,
    action: 'USER_UPDATE_ATTEMPT',
    details: {
      targetUserId: userId,
      updateData: data,
    },
  });

  const { name, username, email, role, password, mustChangePassword } = data;

  // Basic validation (can be expanded)
  if (role && !Object.values(Role).includes(role)) {
    await logAuditEvent({
      userId: auth.user.id,
      action: 'USER_UPDATE_FAILURE',
      details: { targetUserId: userId, role },
      reason: 'Invalid role value',
    });
    return NextResponse.json({ message: 'Invalid role value' }, { status: 400 });
  }

  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        username: true,
        email: true,
        password: true,
        accounts: {
          select: {
            provider: true,
          },
        },
      },
    });

    if (!currentUser) {
      await logAuditEvent({
        userId: auth.user.id,
        action: 'USER_UPDATE_FAILURE',
        details: { targetUserId: userId },
        reason: 'User not found for update.',
      });
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // Check if user is an SSO user (has OAuth accounts)
    const isSSO = currentUser.accounts && currentUser.accounts.length > 0;

    // Prevent setting mustChangePassword for SSO users
    if (isSSO && mustChangePassword !== undefined) {
      await logAuditEvent({
        userId: auth.user.id,
        action: 'USER_UPDATE_FAILURE',
        details: { targetUserId: userId },
        reason: 'Cannot set password change requirement for SSO users',
      });
      return NextResponse.json({
        message: 'Cannot set password change requirement for SSO users. SSO users authenticate through their identity provider.'
      }, { status: 400 });
    }

    // Prevent setting password for SSO users
    if (isSSO && password !== undefined && password !== '') {
      await logAuditEvent({
        userId: auth.user.id,
        action: 'USER_UPDATE_FAILURE',
        details: { targetUserId: userId },
        reason: 'Cannot set password for SSO users',
      });
      return NextResponse.json({
        message: 'Cannot set password for SSO users. SSO users authenticate through their identity provider.'
      }, { status: 400 });
    }

    // Scenario 1: ADMIN trying to change their own role.
    if (auth.user.role === Role.ADMIN && auth.user.id === userId) {
      if (role && role !== currentUser.role) {
        await logAuditEvent({
          userId: auth.user.id,
          action: 'USER_UPDATE_FAILURE',
          details: { targetUserId: userId, requestedRole: role, currentRole: currentUser.role },
          reason: 'ADMIN cannot change their own role.',
        });
        return NextResponse.json({ message: 'ADMIN cannot change their own role.' }, { status: 403 });
      }
    }

    // Scenario 2: ADMIN trying to change another ADMIN's role.
    if (auth.user.role === Role.ADMIN && currentUser.role === Role.ADMIN && auth.user.id !== userId) {
      if (role && role !== currentUser.role) {
        await logAuditEvent({
          userId: auth.user.id,
          action: 'USER_UPDATE_FAILURE',
          details: { targetUserId: userId, requestedRole: role, currentRole: currentUser.role },
          reason: 'ADMIN cannot change another ADMIN role.',
        });
        return NextResponse.json({ message: 'ADMIN cannot change another ADMIN role.' }, { status: 403 });
      }
    }

    // Scenario 3: ADMIN trying to change a SUPER_ADMIN's role.
    if (auth.user.role === Role.ADMIN && currentUser.role === Role.SUPER_ADMIN) {
      if (role && role !== currentUser.role) {
        await logAuditEvent({
          userId: auth.user.id,
          action: 'USER_UPDATE_FAILURE',
          details: { targetUserId: userId, requestedRole: role, currentRole: currentUser.role },
          reason: 'ADMIN cannot change SUPER_ADMIN role.',
        });
        return NextResponse.json({ message: 'ADMIN cannot change SUPER_ADMIN role.' }, { status: 403 });
      }
    }

    // Scenario 4: SUPER_ADMIN can change any role except their own.
    if (auth.user.role === Role.SUPER_ADMIN && auth.user.id === userId) {
      if (role && role !== currentUser.role) {
        await logAuditEvent({
          userId: auth.user.id,
          action: 'USER_UPDATE_FAILURE',
          details: { targetUserId: userId, requestedRole: role, currentRole: currentUser.role },
          reason: 'SUPER_ADMIN cannot change their own role.',
        });
        return NextResponse.json({ message: 'SUPER_ADMIN cannot change their own role.' }, { status: 403 });
      }
    }

    // Replace 'any' with Record<string, unknown> for updateData
    const updateData: Record<string, unknown> = {};

    if (name !== undefined) updateData.name = name;
    if (username !== undefined) updateData.username = username;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (mustChangePassword !== undefined) updateData.mustChangePassword = mustChangePassword;

    // Check for duplicate email if it's being changed
    if (email !== undefined && email !== currentUser.email) {
      const existingUserWithEmail = await prisma.user.findUnique({
        where: { email: email },
      });
      if (existingUserWithEmail) {
        await logAuditEvent({
          userId: auth.user.id,
          action: 'USER_UPDATE_FAILURE',
          details: { targetUserId: userId, email },
          reason: 'Email is already in use.',
        });
        return NextResponse.json({ message: 'Email is already in use.' }, { status: 409 });
      }
    }

    // Check for duplicate username if it's being changed
    if (username !== undefined && currentUser?.username !== username) {
      const existingUserWithUsername = await prisma.user.findUnique({
        where: { username: username },
      });
      if (existingUserWithUsername) {
        await logAuditEvent({
          userId: auth.user.id,
          action: 'USER_UPDATE_FAILURE',
          details: { targetUserId: userId, username },
          reason: 'Username is already taken.',
        });
        return NextResponse.json({ message: 'Username is already taken.' }, { status: 409 });
      }
    }

    if (password && password !== '') {
      // Password length validation
      const minLength = parseInt(process.env.AUTH_PASSWORD_MIN_LENGTH || '8');
      if (password.length < minLength) {
        await logAuditEvent({
          userId: auth.user.id,
          action: 'USER_UPDATE_FAILURE',
          details: { targetUserId: userId },
          reason: `Password must be at least ${minLength} characters`,
        });
        return NextResponse.json({ message: `Password must be at least ${minLength} characters` }, { status: 400 });
      }

      // Check if new password is the same as current password
      if (currentUser.password) {
        const isSamePassword = await bcrypt.compare(password, currentUser.password);
        if (isSamePassword) {
          await logAuditEvent({
            userId: auth.user.id,
            action: 'USER_UPDATE_FAILURE',
            details: { targetUserId: userId },
            reason: 'New password is the same as current password',
          });
          return NextResponse.json({ message: 'New password must be different from the current password' }, { status: 400 });
        }
      }

      updateData.password = await bcrypt.hash(password, 10);
      // When password is changed by admin, update passwordChangedAt and clear mustChangePassword
      updateData.passwordChangedAt = new Date();
      updateData.mustChangePassword = false;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        lastActive: true,
        is2FAEnabled: true,
      },
    });

    await logAuditEvent({
      userId: auth.user.id,
      action: 'USER_UPDATE_SUCCESS',
      details: {
        targetUserId: updatedUser.id,
        targetUserEmail: updatedUser.email,
        targetUsername: updatedUser.username,
        targetRole: updatedUser.role,
      },
    });

    // Track usage for authenticated requests
    await trackUsageByAuthMethod(request, auth, 200);

    return NextResponse.json(updatedUser);
  } catch (error) {
    logger.error(`Error updating user ${userId}:`, error);
    await logAuditEvent({
      userId: auth.user.id,
      action: 'USER_UPDATE_FAILURE',
      details: { targetUserId: userId },
      reason: 'Database error',
    });
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/users/[id] - Delete a user by ID
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);

  // Check for rate limiting errors
  if (auth.user) {
    const authError = handleAuthResponse(auth);
    if (authError) return authError;
  }

  if (!auth.user) {
    return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
  }

  if (!isAdminOrSuperAdmin(auth)) {
    const { id } = await context.params;
    await logAuditEvent({
      userId: auth.user.id,
      action: 'USER_DELETE_FAILURE',
      details: { targetUserId: id },
      reason: 'Unauthorized: User does not have sufficient role to delete users.',
    });
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { id: userId } = await context.params;

  // Prevent self-deletion
  if (auth.user.id === userId) {
    await logAuditEvent({
      userId: auth.user.id,
      action: 'USER_DELETE_FAILURE',
      details: { targetUserId: userId },
      reason: 'Cannot delete own account.',
    });
    return NextResponse.json({ message: 'Cannot delete your own account' }, { status: 400 });
  }

  try {
    const userToDelete = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true },
    });

    if (!userToDelete) {
      await logAuditEvent({
        userId: auth.user.id,
        action: 'USER_DELETE_FAILURE',
        details: { targetUserId: userId },
        reason: 'User not found for deletion.',
      });
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // Prevent ADMIN from deleting SUPER_ADMIN
    if (auth.user.role === Role.ADMIN && userToDelete.role === Role.SUPER_ADMIN) {
      await logAuditEvent({
        userId: auth.user.id,
        action: 'USER_DELETE_FAILURE',
        details: { targetUserId: userId, targetRole: userToDelete.role },
        reason: 'ADMIN cannot delete SUPER_ADMIN.',
      });
      return NextResponse.json({ message: 'ADMIN cannot delete SUPER_ADMIN' }, { status: 403 });
    }

    // Prevent ADMIN from deleting another ADMIN
    if (auth.user.role === Role.ADMIN && userToDelete.role === Role.ADMIN) {
      await logAuditEvent({
        userId: auth.user.id,
        action: 'USER_DELETE_FAILURE',
        details: { targetUserId: userId, targetRole: userToDelete.role },
        reason: 'ADMIN cannot delete another ADMIN.',
      });
      return NextResponse.json({ message: 'ADMIN cannot delete another ADMIN' }, { status: 403 });
    }

    await logAuditEvent({
      userId: auth.user.id,
      action: 'USER_DELETE_ATTEMPT',
      details: { targetUserId: userId, targetEmail: userToDelete.email },
    });

    await prisma.user.delete({
      where: { id: userId },
    });

    await logAuditEvent({
      userId: auth.user.id,
      action: 'USER_DELETE_SUCCESS',
      details: { targetUserId: userId, targetEmail: userToDelete.email },
    });

    // Track usage for authenticated requests
    await trackUsageByAuthMethod(request, auth, 200);

    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting user ${userId}:`, error);
    await logAuditEvent({
      userId: auth.user.id,
      action: 'USER_DELETE_FAILURE',
      details: { targetUserId: userId },
      reason: 'Database error',
    });
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}