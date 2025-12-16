'use server';
import { logger } from '@/lib/logger';

import type { User } from '@prisma/client';
import { z } from 'zod';
import { headers } from 'next/headers'; // Import headers
import { Role } from '@/types/opnsense'; // Import the Role enum

const getPasswordMinLength = () => parseInt(process.env.AUTH_PASSWORD_MIN_LENGTH || '8');

const UserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  username: z.string().optional().or(z.literal('')), // Add username as optional
  email: z.string().email("Invalid email address"),
  password: z.string().min(getPasswordMinLength(), `Password must be at least ${getPasswordMinLength()} characters`).optional().or(z.literal('')), // Optional for updates
  role: z.nativeEnum(Role), // Use z.nativeEnum for TypeScript enums
  mustChangePassword: z.boolean().optional(), // Optional password change flag
});

export type UserFormData = z.infer<typeof UserSchema>;

// Define a type that matches the detailed user object returned by the /api/admin/users/[id] endpoint
type DetailedUser = User & {
  accounts: { provider: string }[];
  authMethod?: string; // Add authMethod here
  directGroups?: { id: string; name: string; description: string | null; }[];
  mappedGroups?: { id: string; name: string; description: string | null; }[];
  externalGroups?: string[];
  ssoProvider?: string;
};


export async function getUsers() {
  try {
    // Smart fallback: Use INTERNAL_APP_URL if set, otherwise fall back to NEXTAUTH_URL, then default
    const baseUrl = process.env.INTERNAL_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const headersList = await headers();
    const cookieHeader = headersList.get('cookie');

    // Fetch users
    const usersResponse = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader && { 'Cookie': cookieHeader }),
      },
    });

    if (!usersResponse.ok) {
      const errorData = await usersResponse.json();
      logger.error("Failed to fetch users:", errorData);
      throw new Error(errorData.message || "Could not retrieve users.");
    }

    const users = await usersResponse.json() as (User & {
      accounts: { provider: string; externalGroups: string[] | null; }[]; // Include externalGroups
      groups: { id: string; name: string; description: string | null; }[];
    })[];

    // Fetch group mappings
    const SsoGroupMappingsResponse = await fetch(`${baseUrl}/api/admin/group-mappings`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...(cookieHeader && { 'Cookie': cookieHeader }),
        },
    });

    if (!SsoGroupMappingsResponse.ok) {
        const errorData = await SsoGroupMappingsResponse.json();
        logger.error("Failed to fetch group mappings:", errorData);
        throw new Error(errorData.message || "Could not retrieve group mappings.");
    }

    const SsoGroupMappings = await SsoGroupMappingsResponse.json() as {
        id: string;
        ssoProvider: string;
        ssoGroupName: string;
        localGroupId: string;
        localGroup: { id: string; name: string; description: string | null; };
    }[];


    // Map the fetched data to the UserWithDetails type, including directGroups and mappedGroups
    const usersWithDetails = users.map(user => {
      const authMethod = user.accounts && user.accounts.length > 0 ? 'oauth' : 'Local';
      const ssoProvider = user.accounts && user.accounts.length > 0 ? user.accounts[0].provider : undefined;

      // Get external groups from the first account
      const externalGroups = user.accounts && user.accounts.length > 0 
        ? (user.accounts[0].externalGroups || []) as string[]
        : [];

      // Find mapped groups for SSO users
      const mappedGroups = authMethod === 'oauth' && ssoProvider
          ? Array.from(new Set(SsoGroupMappings
              .filter(mapping => {
                  // Find the account for the current provider (case-insensitive comparison)
                  const account = user.accounts.find(acc => acc.provider.toLowerCase() === ssoProvider.toLowerCase());
                  const userExternalGroups = (account?.externalGroups || []) as string[];
                  // Only map if the SSO group name is present in the user's external groups (case-insensitive provider comparison)
                  return mapping.ssoProvider.toLowerCase() === ssoProvider.toLowerCase() && userExternalGroups.includes(mapping.ssoGroupName);
              })
              .map(mapping => mapping.localGroup.id))) // Get unique localGroup IDs
              .map(groupId => SsoGroupMappings.find(mapping => mapping.localGroup.id === groupId)?.localGroup) // Map back to localGroup objects
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
    return usersWithDetails;
  } catch (error) {
    logger.error("Failed to fetch users or group mappings:", error);
    throw new Error(error instanceof Error ? error.message : "Could not retrieve users or group mappings.");
  }
}

// Update the return type to DetailedUser | null
export async function getUserById(id: string): Promise<DetailedUser | null> {
  try {
    // Smart fallback: Use INTERNAL_APP_URL if set, otherwise fall back to NEXTAUTH_URL, then default
    const baseUrl = process.env.INTERNAL_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const headersList = await headers(); // Get headers from the incoming request and await the result
    const cookieHeader = headersList.get('cookie'); // Get the cookie header

    const response = await fetch(`${baseUrl}/api/admin/users/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Explicitly forward the cookie header
        ...(cookieHeader && { 'Cookie': cookieHeader }),
      },
      // credentials: 'include', // May not be needed if manually forwarding
    });

    if (!response.ok) {
      // If the API returns a 404, it means the user was not found, which is a valid scenario.
      if (response.status === 404) {
        return null;
      }
      const errorData = await response.json();
      logger.error(`Failed to fetch user ${id}:`, errorData);
      throw new Error(errorData.message || `Could not retrieve user ${id}.`);
    }

    // Cast the response to the DetailedUser type
    const user: DetailedUser = await response.json();
    return user;
  } catch (error) {
    logger.error(`Failed to fetch user ${id}:`, error);
    throw new Error(error instanceof Error ? error.message : `Could not retrieve user ${id}.`);
  }
}

export async function createUser(data: UserFormData): Promise<{ success: boolean; user?: User; errors?: { path: string[], message: string }[] }> {
  const validation = UserSchema.safeParse(data);
  if (!validation.success) {
    // Map Zod errors to the expected API error format
    const apiErrors = validation.error.errors.map(err => ({
      path: err.path.map(p => p.toString()), // Convert path elements to string
      message: err.message,
    }));
    return { success: false, errors: apiErrors };
  }

  const { name, username, email, password, role, mustChangePassword } = validation.data; // Include username and mustChangePassword here

  if (!password) {
    return { success: false, errors: [{ path: ["password"], message: "Password is required for new users." }] };
  }

  try {
    // Smart fallback: Use INTERNAL_APP_URL if set, otherwise fall back to NEXTAUTH_URL, then default
    const baseUrl = process.env.INTERNAL_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const headersList = await headers(); // Get headers from the incoming request and await the result
    const cookieHeader = headersList.get('cookie'); // Get the cookie header

    const response = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Explicitly forward the cookie header
        ...(cookieHeader && { 'Cookie': cookieHeader }),
      },
      // credentials: 'include', // May not be needed if manually forwarding
      body: JSON.stringify({ name, username, email, password, role, mustChangePassword }), // Include username and mustChangePassword here
    });

    const result: { success: boolean; user?: User; errors?: { path: string[], message: string }[], message?: string } = await response.json();

    if (!response.ok) {
       logger.error("Failed to create user:", result);
       // Return API errors with a special path that won't be displayed in form Alert
       // but can be extracted for toast display
       return { success: false, errors: result.errors || [{ path: ["_api_only"], message: result.message || "Could not create user." }] };
    }

    return { success: true, user: result.user };
  } catch (error) {
    logger.error("Failed to create user:", error);
    return { success: false, errors: [{ path: ["_form"], message: error instanceof Error ? error.message : "Could not create user." }] };
  }
}

export async function updateUser(id: string, data: UserFormData): Promise<{ success: boolean; user?: User; errors?: { path: string[], message: string }[] }> {
  const validation = UserSchema.safeParse(data);
  if (!validation.success) {
    // Map Zod errors to the expected API error format
    const apiErrors = validation.error.errors.map(err => ({
      path: err.path.map(p => p.toString()), // Convert path elements to string
      message: err.message,
    }));
    return { success: false, errors: apiErrors };
  }

  const { name, username, email, password, role, mustChangePassword } = validation.data; // Include username and mustChangePassword here

  try {
    // Smart fallback: Use INTERNAL_APP_URL if set, otherwise fall back to NEXTAUTH_URL, then default
    const baseUrl = process.env.INTERNAL_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const headersList = await headers(); // Get headers from the incoming request and await the result
    const cookieHeader = headersList.get('cookie'); // Get the cookie header

    const response = await fetch(`${baseUrl}/api/admin/users/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        // Explicitly forward the cookie header
        ...(cookieHeader && { 'Cookie': cookieHeader }),
      },
      // credentials: 'include', // May not be needed if manually forwarding
      body: JSON.stringify({ name, username, email, password, role, mustChangePassword }), // Include username and mustChangePassword here
    });

    const result: { success: boolean; user?: User; errors?: { path: string[], message: string }[], message?: string } = await response.json();

    if (!response.ok) {
       logger.error(`Failed to update user ${id}:`, result);
       // Return API errors with a special path that won't be displayed in form Alert
       // but can be extracted for toast display
       return { success: false, errors: result.errors || [{ path: ["_api_only"], message: result.message || `Could not update user ${id}.` }] };
    }

    return { success: true, user: result.user };
  } catch (error) {
    logger.error(`Failed to update user ${id}:`, error);
    return { success: false, errors: [{ path: ["_form"], message: error instanceof Error ? error.message : `Could not update user ${id}.` }] };
  }
}

export async function updateCurrentUserProfile(data: { name?: string; username?: string; email?: string; password?: string }): Promise<{ success: boolean; user?: User; errors?: { path: string[], message: string }[] }> {
  try {
    // Smart fallback: Use INTERNAL_APP_URL if set, otherwise fall back to NEXTAUTH_URL, then default
    const baseUrl = process.env.INTERNAL_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const headersList = await headers(); // Get headers from the incoming request and await the result
    const cookieHeader = headersList.get('cookie'); // Get the cookie header

    const response = await fetch(`${baseUrl}/api/account/update-profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        // Explicitly forward the cookie header
        ...(cookieHeader && { 'Cookie': cookieHeader }),
      },
      body: JSON.stringify(data),
    });

    const result: { success: boolean; user?: User; errors?: { path: string[], message: string }[], message?: string } = await response.json();

    if (!response.ok) {
       logger.error("Failed to update current user profile:", result);
       // Return API errors with a special path that won't be displayed in form Alert
       // but can be extracted for toast display
       return { success: false, errors: result.errors || [{ path: ["_api_only"], message: result.message || "Could not update profile." }] };
    }

    return { success: true, user: result.user };
  } catch (error) {
    logger.error("Failed to update current user profile:", error);
    return { success: false, errors: [{ path: ["_form"], message: error instanceof Error ? error.message : "Could not update profile." }] };
  }
}

export async function deleteUser(id: string): Promise<{ success: boolean; errors?: { path: string[], message: string }[] }> {
  try {
    // Smart fallback: Use INTERNAL_APP_URL if set, otherwise fall back to NEXTAUTH_URL, then default
    const baseUrl = process.env.INTERNAL_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const headersList = await headers(); // Get headers from the incoming request and await the result
    const cookieHeader = headersList.get('cookie'); // Get the cookie header

    const response = await fetch(`${baseUrl}/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        // Explicitly forward the cookie header
        ...(cookieHeader && { 'Cookie': cookieHeader }),
      },
      // credentials: 'include', // May not be needed if manually forwarding
    });

    const result: { success: boolean; errors?: { path: string[], message: string }[], message?: string } = await response.json();

    if (!response.ok) {
       logger.error(`Failed to delete user ${id}:`, result);
       // Return API errors with a special path that won't be displayed in form Alert
       // but can be extracted for toast display
       return { success: false, errors: result.errors || [{ path: ["_api_only"], message: result.message || `Could not delete user ${id}.` }] };
    }

    return { success: true };
  } catch (error) {
    logger.error(`Failed to delete user ${id}:`, error);
    return { success: false, errors: [{ path: ["_form"], message: error instanceof Error ? error.message : `Could not delete user ${id}.` }] };
  }
}
