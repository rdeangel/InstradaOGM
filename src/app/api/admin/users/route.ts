import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import { Role } from '@/types/opnsense';
import { logApiAccess } from '@/lib/auditLog';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';

type SessionUserWithRole = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: Role;
};

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    const user = auth.user as SessionUserWithRole | undefined;

    if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
      await logApiAccess(auth, 'USER_LIST_ACCESS_DENIED', {}, request, 'Insufficient permissions');
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

  try {
    // Fetch users with their accounts and groups
    const users = await prisma.user.findMany({
      orderBy: {
        name: 'asc',
      },
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

    // Fetch SSO group mappings
    const ssoGroupMappings = await prisma.ssoGroupMapping.findMany({
      include: {
        localGroup: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

    // Process users to include mapped groups
    const usersWithDetails = users.map(user => {
      const authMethod = user.accounts && user.accounts.length > 0 ? 'oauth' : 'Local';
      const ssoProvider = user.accounts && user.accounts.length > 0 ? user.accounts[0].provider : undefined;

      // Get external groups from the first account
      const externalGroups = user.accounts && user.accounts.length > 0 
        ? (user.accounts[0].externalGroups || []) as string[]
        : [];

      // Find mapped groups for SSO users
      const mappedGroups = authMethod === 'oauth' && ssoProvider
          ? Array.from(new Set(ssoGroupMappings
              .filter(mapping => {
                  // Find the account for the current provider (case-insensitive comparison)
                  const account = user.accounts.find(acc => acc.provider.toLowerCase() === ssoProvider.toLowerCase());
                  const userExternalGroups = (account?.externalGroups || []) as string[];
                  // Only map if the SSO group name is present in the user's external groups (case-insensitive provider comparison)
                  return mapping.ssoProvider.toLowerCase() === ssoProvider.toLowerCase() && userExternalGroups.includes(mapping.ssoGroupName);
              })
              .map(mapping => mapping.localGroup.id))) // Get unique localGroup IDs
              .map(groupId => ssoGroupMappings.find(mapping => mapping.localGroup.id === groupId)?.localGroup) // Map back to localGroup objects
              .filter(Boolean) as { id: string; name: string; description: string | null; }[] // Filter out undefined and assert type
          : [];

      return {
        ...user,
        authMethod: authMethod,
        ssoProvider: ssoProvider,
        directGroups: user.groups, // Map the fetched groups to directGroups
        mappedGroups: mappedGroups, // Include the determined mapped groups
        externalGroups: externalGroups, // Include the external groups
      };
    });
    
    // Removed USER_LIST_SUCCESS audit log to reduce audit log noise
    return NextResponse.json(usersWithDetails);
  } catch (error) {
    logger.error('Error fetching users:', error);
    await logApiAccess(auth, 'USER_LIST_ERROR', { error: error instanceof Error ? error.message : 'Unknown error' }, request);
    return NextResponse.json({ message: 'Error fetching users' }, { status: 500 });
  }
  });
}

export async function POST(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    const user = auth.user as SessionUserWithRole | undefined;

    if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
      await logApiAccess(auth, 'USER_CREATE_FAILURE', {}, request, 'Unauthorized: User does not have sufficient role to create users.');
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

  try {
    const body = await request.json();
    const { email, name, username, role, password, mustChangePassword } = body;

    await logApiAccess(auth, 'USER_CREATE_ATTEMPT', {
      email,
      name,
      username,
      role,
      mustChangePassword,
      // Do not log password
    }, request);

    if (!email || !name || !role || !password) { // Removed username from strict check
      await logApiAccess(auth, 'USER_CREATE_FAILURE', {
        email,
        name,
        username,
        role,
        reason: 'Missing required fields',
      }, request);
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    // Password length validation
    const minLength = parseInt(process.env.AUTH_PASSWORD_MIN_LENGTH || '8');
    if (password.length < minLength) {
      await logApiAccess(auth, 'USER_CREATE_FAILURE', {
        email,
        name,
        username,
        role,
        reason: 'Password too short',
      }, request);
      return NextResponse.json({ message: `Password must be at least ${minLength} characters` }, { status: 400 });
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      await logApiAccess(auth, 'USER_CREATE_FAILURE', {
        email,
        name,
        username,
        role,
        reason: 'Invalid email format',
      }, request);
      return NextResponse.json({ message: 'Invalid email format' }, { status: 400 });
    }

    // Check if role is valid
    const validRoles = ['USER', 'ADMIN', 'SUPER_ADMIN'];
    if (!validRoles.includes(role)) {
        await logApiAccess(auth, 'USER_CREATE_FAILURE', {
          email,
          name,
          username,
          role,
          reason: 'Invalid role specified',
        }, request);
        return NextResponse.json({ message: 'Invalid role specified' }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      await logApiAccess(auth, 'USER_CREATE_FAILURE', {
        email,
        name,
        username,
        role,
        reason: 'User with this email already exists',
      }, request);
      return NextResponse.json({ message: 'User with this email already exists' }, { status: 409 });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        email,
        name,
        username,
        role,
        password: hashedPassword, // Use the hashed password
        mustChangePassword: mustChangePassword || false, // Set password change flag
        passwordChangedAt: mustChangePassword ? null : new Date(), // Set passwordChangedAt only if not requiring change
      },
    });

    await logApiAccess(auth, 'USER_CREATED_SUCCESS', {
      targetUserId: newUser.id,
      targetUserEmail: newUser.email,
      targetUsername: newUser.username,
      targetRole: newUser.role,
    }, request);

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    logger.error('Error creating user:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    await logApiAccess(auth, 'USER_CREATE_FAILURE', {
      reason: `Error creating user: ${errorMessage}`,
    }, request);
    return NextResponse.json({ message: 'Error creating user' }, { status: 500 });
  }
  });
}