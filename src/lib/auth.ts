// app/lib/auth.ts
import { AuthOptions, Profile, Account, User, Session } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";
import { authenticator } from 'otplib';
import { User as DbUser, Account as DbAccount, Prisma } from "@prisma/client"; // Import Prisma models and Prisma namespace
import { Role } from "@/types/opnsense";
import { loadOidcProviders, mapConfigToProvider } from "./auth-config";
import { logAuditEvent } from './auditLog';
import { logger } from '@/lib/logger';
import { getCaseInsensitiveMode } from '@/lib/prisma-utils';
import { getTotpSecretWithMigration } from './totp-encryption';
import { verifyAndConsumeBackupCode } from './backup-codes';

// Extended interfaces for better type safety
interface ExtendedProfile extends Profile {
  groups?: string[];
  picture?: string;
  preferred_username?: string;
  email_verified?: boolean;
  iss?: string;
  username?: string;
}

interface ExtendedAccount extends Account {
  externalGroups?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  ext_expires_in?: number;
}

interface ExtendedUser extends User {
  role?: Role;
  username?: string;
  groups?: { id: string; name: string }[];
  authMethod?: string;
  provider?: string;
}

// Extended JWT interface
interface ExtendedJWT {
  id?: string;
  role?: Role;
  username?: string;
  groups?: { id: string; name: string }[];
  authMethod?: string;
  provider?: string;
  [key: string]: unknown;
}

// Functions for fetching external groups from identity providers
async function fetchAzureAdGroups(accessToken: string): Promise<string[]> {
  logger.debug("Fetching Azure AD groups.");
  logger.debug(`Azure AD Access Token (first 10 chars): ${accessToken.substring(0, 10)}...`); // Log partial token for debugging
  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/me/memberOf', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    logger.debug(`Azure AD group fetch response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      logger.error(`Azure AD group fetch failed: ${response.status} ${response.statusText}`);
      // Attempt to read error body if available
      try {
        const errorBody = await response.json();
        logger.error('Azure AD error details:', errorBody);
      } catch (jsonError) {
        logger.error('Could not parse Azure AD error response body:', jsonError);
      }
      return []; // Return empty array on failure
    }

    const data = await response.json();
    // logger.debug('Azure AD group fetch response body:', JSON.stringify(data, null, 2)); // Commented out to reduce verbosity
    // Microsoft Graph returns groups in the 'value' array
    logger.debug(`Azure AD group fetch response body (IDs only): Fetched ${data.value?.length || 0} groups. Sample IDs: ${JSON.stringify(data.value?.slice(0, 5).map((group: { id: string }) => group.id))}`);
    // We'll return the group IDs. Depending on requirements, you might prefer displayName.
    const groups = data.value?.map((group: { id: string }) => group.id).filter(Boolean) || [];
    logger.debug(`Fetched ${groups.length} Azure AD groups.`);
    return groups;
  } catch (error) {
    logger.error("Error fetching Azure AD groups:", error);
    return []; // Return empty array on error
  }
}

async function fetchAuthentikGroups(accessToken: string): Promise<string[]> {
  logger.debug('Fetching Authentik groups.');
  // Note: The exact Authentik API endpoint for fetching user groups might vary.
  // This is a plausible example. You may need to adjust the URL and response parsing
  // based on your specific Authentik setup and API version.
  // A backend API route might be a more robust approach for Authentik integration.
  try {
    // Assuming an endpoint like /api/v3/core/users/me/groups or similar
    // You might need to find the correct user ID or use a different endpoint
    // depending on how Authentik exposes user-specific group memberships.
    // This example assumes a direct call to a user-specific endpoint.
    const response = await fetch(`${process.env.AUTHENTIK_API_URL}/api/v3/core/users/me/groups`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        // Depending on Authentik setup, you might need an additional API key
        // 'X-Api-Key': process.env.AUTHENTIK_API_KEY,
      },
    });

    if (!response.ok) {
      logger.error(`Authentik group fetch failed: ${response.status} ${response.statusText}`);
      // Attempt to read error body if available
      try {
        const errorBody = await response.json();
        logger.error('Authentik error details:', errorBody);
      } catch (jsonError) {
        logger.error('Could not parse Authentik error response body:', jsonError);
      }
      return []; // Return empty array on failure
    }

    const data = await response.json();
    // Assuming Authentik returns a list of group objects with an 'id' or 'name' field
    // Adjust the mapping based on the actual API response structure.
    const groups = data.results?.map((group: { id?: string; name?: string }) => group.id || group.name).filter(Boolean) || [];
    logger.debug(`Fetched ${groups.length} Authentik groups.`);
    return groups;
  } catch (error) {
    logger.error("Error fetching Authentik groups:", error);
    return []; // Return empty array on error
  }
}

async function fetchKeycloakGroups(accessToken: string, issuer: string): Promise<string[]> {
  logger.debug('Fetching Keycloak groups.');
  try {
    // Keycloak userinfo endpoint typically includes groups if configured
    // The issuer should be in format: https://keycloak.domain.com/realms/realm-name
    const userinfoUrl = issuer.endsWith('/')
      ? `${issuer}protocol/openid-connect/userinfo`
      : `${issuer}/protocol/openid-connect/userinfo`;

    logger.debug(`Keycloak userinfo URL: ${userinfoUrl}`);

    const response = await fetch(userinfoUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      logger.error(`Keycloak group fetch failed: ${response.status} ${response.statusText}`);
      // Attempt to read error body if available
      try {
        const errorBody = await response.json();
        logger.error('Keycloak error details:', errorBody);
      } catch (jsonError) {
        logger.error('Could not parse Keycloak error response body:', jsonError);
      }
      return []; // Return empty array on failure
    }

    const data = await response.json();
    logger.debug(`Keycloak userinfo response keys: ${Object.keys(data).join(', ')}`);

    // Keycloak can return groups in various claim names depending on configuration
    // Common claim names: 'groups', 'roles', 'realm_access.roles', 'resource_access'
    let groups: string[] = [];

    // Try different possible group claim locations in order of preference
    if (data.groups && Array.isArray(data.groups)) {
      groups = data.groups.filter(Boolean);
      logger.debug(`Found groups in 'groups' claim: ${groups.length} groups`);
    } else if (data.roles && Array.isArray(data.roles)) {
      groups = data.roles.filter(Boolean);
      logger.debug(`Found groups in 'roles' claim: ${groups.length} groups`);
    } else if (data.realm_access?.roles && Array.isArray(data.realm_access.roles)) {
      groups = data.realm_access.roles.filter(Boolean);
      logger.debug(`Found groups in 'realm_access.roles' claim: ${groups.length} groups`);
    } else if (data.resource_access && typeof data.resource_access === 'object') {
      // Extract roles from resource_access (client-specific roles)
      // resource_access is typically: { "client-name": { "roles": ["role1", "role2"] } }
      const allResourceRoles: string[] = [];
      for (const [, clientData] of Object.entries(data.resource_access)) {
        if (clientData && typeof clientData === 'object' && 'roles' in clientData) {
          const clientRoles = (clientData as { roles?: string[] }).roles;
          if (Array.isArray(clientRoles)) {
            allResourceRoles.push(...clientRoles.filter(Boolean));
          }
        }
      }
      if (allResourceRoles.length > 0) {
        groups = allResourceRoles;
        logger.debug(`Found groups in 'resource_access' claim: ${groups.length} groups from ${Object.keys(data.resource_access).length} clients`);
      }
    }

    if (groups.length === 0) {
      logger.warn('No groups found in Keycloak claims. Checked: groups, roles, realm_access.roles, resource_access');
      logger.debug(`Full userinfo response: ${JSON.stringify(data, null, 2)}`);
    }

    logger.debug(`Fetched ${groups.length} Keycloak groups.`);
    return groups;
  } catch (error) {
    logger.error("Error fetching Keycloak groups:", error);
    return []; // Return empty array on error
  }
}

// Helper function to prepare user data for Prisma operations
interface PreparedUserData {
  name?: string | null;
  username?: string | null;
  email?: string | null;
  emailVerified?: Date | null;
  image?: string | null;
}

function prepareUserData(profile: ExtendedProfile, existingUser?: DbUser | null): PreparedUserData {
  const data: PreparedUserData = {};

  if (profile.name !== undefined) {
    data.name = profile.name;
  }
  if (profile.email !== undefined) {
    data.email = profile.email;
  }
  if (profile.picture !== undefined) {
    data.image = profile.picture;
  } else if (profile.image !== undefined) {
    data.image = profile.image;
  }

  if (profile?.email_verified === true && !existingUser?.emailVerified) {
    data.emailVerified = new Date();
  } else if (existingUser?.emailVerified !== undefined) {
    data.emailVerified = existingUser.emailVerified;
  }

  if (profile?.preferred_username !== undefined) {
    data.username = profile.preferred_username;
  } else if (profile?.username !== undefined) {
    data.username = profile.username;
  } else if (existingUser?.username !== undefined) {
    data.username = existingUser.username;
  }

  if (data.name === undefined) data.name = null;
  if (data.email === undefined) data.email = null;
  if (data.image === undefined) data.image = null;
  if (data.username === undefined) data.username = null;
  if (data.emailVerified === undefined) data.emailVerified = null;

  return data;
}

// Helper function to prepare account data for Prisma operations
interface PreparedAccountData {
  type: string;
  provider: string;
  providerAccountId: string;
  refresh_token?: string | null;
  access_token?: string | null;
  expires_at?: number | null;
  ext_expires_in?: number | null;
  token_type?: string | null;
  scope?: string | null;
  id_token?: string | null;
  session_state?: string | null;
  issuer?: string | null;
  externalGroups?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput; // Use Prisma.InputJsonValue for Json? type
}

function prepareAccountData(account: ExtendedAccount, profile: ExtendedProfile, externalGroups: string[]): PreparedAccountData {
  // Extract issuer with explicit type handling
  let issuer: string | null = null;
  if (typeof account.issuer === 'string' && account.issuer.trim().length > 0) {
    issuer = account.issuer;
  } else if (profile?.iss) {
    // Only assign if iss is a non-empty string
    if (typeof profile.iss === 'string' && profile.iss.trim().length > 0) {
      issuer = profile.iss;
    } else {
      issuer = null; // Explicitly set to null if not a string
    }
  }

  const data: PreparedAccountData = {
    type: account.type,
    provider: account.provider,
    providerAccountId: account.providerAccountId,
    access_token: account.access_token ?? null,
    refresh_token: account.refresh_token ?? null,
    expires_at: account.expires_at ?? null,
    token_type: account.token_type ?? null,
    scope: account.scope ?? null,
    id_token: account.id_token ?? null,
    session_state: account.session_state ?? null,
    issuer: issuer, // Use the extracted issuer
    ext_expires_in: account.ext_expires_in ?? null,
    externalGroups: externalGroups.length > 0 ? externalGroups : Prisma.JsonNull, // Use Prisma.JsonNull for empty array to explicitly set JSON null
  };

  return data;
}


// Initialize providers array
const providers = [];

// --- Credentials Provider ---
if (process.env.AUTH_ALLOW_LOCAL_LOGIN === 'true') {
  providers.push(
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "jsmith@example.com" },
        password: { label: "Password", type: "password" },
        totpCode: { label: "Authenticator Code", type: "text" }, // For 2FA
        isBackupCode: { label: "Is Backup Code", type: "text" } // Flag to indicate backup code usage
      },
      async authorize(credentials): Promise<User | null> {
        const auditData: { method: string; email: string | null | undefined; identifierUsed?: string; userId?: string } = { method: 'CREDENTIALS', email: credentials?.email }; // Keep email in audit data for now, will update if username is used, added userId
        await logAuditEvent({ action: 'USER_LOGIN_ATTEMPT', event: 'LOGIN_ATTEMPT', ...auditData });

        if (!credentials?.email || !credentials?.password) { // 'email' field is used for either email or username input
          logger.error("[Authorize] Missing identifier or password");
          await logAuditEvent({ action: 'USER_LOGIN_FAILURE', event: 'LOGIN_FAILURE', ...auditData, reason: 'Missing identifier or password' });
          return null;
        }

        const identifier = credentials.email; // This can be either email or username

        // Try finding user by email OR username
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: identifier },
              { username: identifier },
            ],
          },
        });

        if (!user) {
          logger.error("[Authorize] User not found with identifier:", identifier);
          await logAuditEvent({ action: 'USER_LOGIN_FAILURE', event: 'LOGIN_FAILURE', ...auditData, reason: 'User not found' });
          throw new Error('CredentialsSignin'); // Explicitly throw for consistency
        }

        // Update audit data to reflect the actual user found
        auditData.userId = user.id;
        auditData.email = user.email; // Use the actual user email for logging
        auditData.identifierUsed = user.email === identifier ? 'email' : 'username'; // Indicate if email or username was used

        if (!user.password) {
          logger.error("[Authorize] User found but has no password set (potentially OIDC only):", user.email);
          await logAuditEvent({ action: 'USER_LOGIN_FAILURE', event: 'LOGIN_FAILURE', ...auditData, userId: user.id, reason: 'Password not set' });
          throw new Error('CredentialsSignin'); // Explicitly throw for consistency
        }

        const isValidPassword = await bcrypt.compare(credentials.password, user.password);

        if (!isValidPassword) {
          logger.error("[Authorize] Invalid password for:", user.email);
          await logAuditEvent({ action: 'USER_LOGIN_FAILURE', event: 'LOGIN_FAILURE', ...auditData, userId: user.id, reason: 'Invalid password' });
          throw new Error('CredentialsSignin'); // Explicitly throw for consistency
        }

        // --- Account Status & Email Verification Check ---
        // Only check AUTH_REQUIRE_VERIFIED_EMAIL_LOCAL since this is inside the CredentialsProvider (local login only)
        const requireVerifiedEmail = process.env.AUTH_REQUIRE_VERIFIED_EMAIL_LOCAL === 'true';

        // Check if account is PENDING or if email is unverified (when required)
        // Note: Role is now a string in the DB, but we use the Role enum for type safety in code
        if (user.role === Role.PENDING || (requireVerifiedEmail && !user.emailVerified)) {
          const reason = user.role === Role.PENDING ? 'Account pending verification' : 'Email not verified';
          logger.warn(`[Authorize] Login blocked for ${user.email}: ${reason}`);
          await logAuditEvent({ action: 'USER_LOGIN_FAILURE', event: 'LOGIN_FAILURE', ...auditData, userId: user.id, reason: reason });
          // Throw the same error for both cases to prompt user to check email
          throw new Error('EMAIL_NOT_VERIFIED');
        }

        // Check specifically for SUSPENDED status
        if (user.role === Role.SUSPENDED) {
          logger.error("[Authorize] Account suspended for:", user.email);
          await logAuditEvent({ action: 'USER_LOGIN_FAILURE', event: 'LOGIN_FAILURE', ...auditData, userId: user.id, reason: 'Account suspended' });
          throw new Error('ACCOUNT_SUSPENDED'); // Use specific error for suspension
        }
        // --- End Status & Verification Check ---

        // --- Password Change Required Check ---
        // Check if user must change password (e.g., default admin password, admin-forced reset)
        if (user.mustChangePassword) {
          logger.warn(`[Authorize] Password change required for user: ${user.email}`);
          await logAuditEvent({ action: 'USER_LOGIN_FAILURE', event: 'LOGIN_FAILURE', ...auditData, userId: user.id, reason: 'Password change required' });
          // Return null to deny login - the client will need to check the user's status
          return null;
        }
        // --- End Password Change Required Check ---

        // --- 2FA Check (Only for Credentials Provider) ---
        if (user.is2FAEnabled) {
          if (!credentials.totpCode) {
            logger.debug(`[Authorize] 2FA required but not provided for user: ${user.email}`);
            await logAuditEvent({ action: 'USER_LOGIN_FAILURE', event: 'LOGIN_FAILURE', ...auditData, userId: user.id, reason: '2FA code required but not provided' });
            throw new Error('2FA_REQUIRED'); // Signal frontend
          }

          logger.debug(`[Authorize] Verifying 2FA for user: ${user.email}`);

          // Determine if this is a backup code or TOTP code
          // Backup codes are typically longer than 6 digits and alphanumeric
          const isBackupCode = credentials.isBackupCode === 'true' ||
            (credentials.totpCode.length > 6 && /[A-Za-z]/.test(credentials.totpCode));

          let isValid = false;

          if (isBackupCode) {
            // Verify backup code
            logger.debug(`[Authorize] Attempting backup code verification for user: ${user.email}`);

            if (!user.backupCodes) {
              logger.error("[Authorize] Backup code provided but no backup codes available for:", user.email);
              await logAuditEvent({ action: 'USER_LOGIN_FAILURE', event: 'LOGIN_FAILURE', ...auditData, userId: user.id, reason: 'No backup codes available' });
              throw new Error('INVALID_2FA_CODE'); // Signal frontend
            }

            try {
              // Verify and consume backup code (handles both hashed and plaintext for migration)
              const verification = await verifyAndConsumeBackupCode(user.id, credentials.totpCode, user.backupCodes);

              if (verification.isValid && verification.updatedCodes !== null) {
                // Update the database with remaining codes
                await prisma.user.update({
                  where: { id: user.id },
                  data: { backupCodes: JSON.stringify(verification.updatedCodes) },
                });

                isValid = true;
                logger.debug(`[Authorize] Backup code verified and consumed for user: ${user.email}`);
                await logAuditEvent({ action: 'USER_LOGIN_SUCCESS', event: 'LOGIN_SUCCESS', ...auditData, userId: user.id, reason: 'Backup code used for 2FA' });
              }
            } catch (error) {
              logger.error("[Authorize] Error processing backup codes for:", user.email, error);
              await logAuditEvent({ action: 'USER_LOGIN_FAILURE', event: 'LOGIN_FAILURE', ...auditData, userId: user.id, reason: 'Backup code processing error' });
              throw new Error('INVALID_2FA_CODE'); // Signal frontend
            }
          } else {
            // Verify TOTP token
            if (!user.totpSecret) {
              logger.error("[Authorize] 2FA enabled but no secret found for:", user.email);
              await logAuditEvent({ action: 'USER_LOGIN_FAILURE', event: 'LOGIN_FAILURE', ...auditData, userId: user.id, reason: '2FA enabled but no secret configured' });
              throw new Error('Configuration'); // Use a configuration error for this inconsistent state
            }

            try {
              // Decrypt TOTP secret (handles both encrypted and plaintext for migration)
              const plaintextSecret = await getTotpSecretWithMigration(user.id, user.totpSecret);
              if (!plaintextSecret) {
                logger.error(`[Authorize] Failed to decrypt TOTP secret for user ${user.email}`);
                await logAuditEvent({ action: 'USER_LOGIN_FAILURE', event: 'LOGIN_FAILURE', ...auditData, userId: user.id, reason: 'Failed to decrypt TOTP secret' });
                throw new Error('TOTP secret unavailable');
              }

              isValid = authenticator.verify({
                token: credentials.totpCode,
                secret: plaintextSecret,
              });
              logger.debug(`[Authorize] TOTP verification result for user ${user.email}: ${isValid}`);
            } catch (error) {
              logger.error("[Authorize] Error verifying TOTP for:", user.email, error);
              await logAuditEvent({ action: 'USER_LOGIN_FAILURE', event: 'LOGIN_FAILURE', ...auditData, userId: user.id, reason: 'TOTP verification error' });
              throw new Error('INVALID_2FA_CODE'); // Signal frontend
            }
          }

          if (!isValid) {
            logger.error("[Authorize] Invalid 2FA code for:", user.email);
            await logAuditEvent({ action: 'USER_LOGIN_FAILURE', event: 'LOGIN_FAILURE', ...auditData, userId: user.id, reason: 'Invalid 2FA code' });
            throw new Error('INVALID_2FA_CODE'); // Signal frontend
          }

          logger.debug(`[Authorize] 2FA code verified for user: ${user.email}`);
        }
        // --- End 2FA Check ---

        logger.debug(`[Authorize] Authorization successful for user: ${user.email}`);
        // Audit log for success happens in the 'signIn' event

        logger.debug(`[Authorize] Preparing user object for session for user: ${user.email}`);
        // Return user object without sensitive fields, ensuring it matches the NextAuth User type
        const { password, totpSecret, backupCodes, ...userForSession } = user;
        void password; void totpSecret; void backupCodes; // Mark as intentionally unused
        logger.debug("[Authorize] User object prepared for session. Returning.");
        return userForSession as User;
      }
    })
  );
}

// --- OIDC Providers ---
if (process.env.AUTH_ALLOW_OIDC_LOGIN === 'true') {
  const loadedOidcConfigs = loadOidcProviders();
  const oidcProviders = loadedOidcConfigs.map(mapConfigToProvider);
  providers.push(...oidcProviders);
}

// --- JWT Session Configuration ---
// Parse SSO_MAX_AGE from environment variable (in seconds)
// If not set, NextAuth.js uses its default of 30 days (2592000 seconds)
// Example: SSO_MAX_AGE=86400 for 1 day, SSO_MAX_AGE=604800 for 1 week
const ssoMaxAge = process.env.SSO_MAX_AGE
  ? parseInt(process.env.SSO_MAX_AGE, 10)
  : undefined; // undefined means use NextAuth.js default (30 days)

if (ssoMaxAge !== undefined && isNaN(ssoMaxAge)) {
  logger.warn(`Invalid SSO_MAX_AGE value: "${process.env.SSO_MAX_AGE}". Must be a number in seconds. Using default (30 days).`);
}

// --- Main AuthOptions ---
export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: providers, // Use the dynamically built providers array
  session: {
    strategy: "jwt",
    ...(ssoMaxAge && !isNaN(ssoMaxAge) && { maxAge: ssoMaxAge }), // Only add maxAge if valid
  },
  pages: {
    signIn: '/auth/signin',
    // newUser: '/auth/register' // Let signIn callback handle OIDC provisioning
    error: '/auth/error', // Optional: Custom error page
  },
  callbacks: {
    async signIn({ user, account, profile }): Promise<boolean | string> {
      logger.debug('signIn callback started');
      logger.debug('signIn callback called.');
      const isOidc = account?.type === 'oauth';
      const auditData: { method: string; provider?: string; email?: string | null; userId?: string } = {
        method: isOidc ? 'OIDC' : 'CREDENTIALS',
        provider: account?.provider,
        email: profile?.email ?? user?.email,
      };

      // For OIDC users, delay logging USER_SIGNIN_ATTEMPT until we confirm user exists
      // This prevents foreign key constraint violations for first-time SSO users
      if (!isOidc && user?.id) {
        auditData.userId = user.id;
        await logAuditEvent({ action: 'USER_SIGNIN_ATTEMPT', event: 'SIGNIN_ATTEMPT', ...auditData });
      }

      // Handle Credentials login
      if (account?.provider === 'credentials') {
        if (process.env.AUTH_ALLOW_LOCAL_LOGIN !== 'true') {
          await logAuditEvent({ action: 'USER_SIGNIN_FAILURE', event: 'SIGNIN_FAILURE', ...auditData, reason: 'Local login disabled' });
          return '/auth/error?error=CredentialsSigninDisabled'; // Redirect to error page
        }
        // Authorization (including 2FA) is handled by the `authorize` function.
        // If authorize succeeded, user object exists.
        // We just need to ensure the user object is passed through.
        return true; // Allow sign in
      }

      // Handle OIDC login
      if (isOidc) {
        if (process.env.AUTH_ALLOW_OIDC_LOGIN !== 'true') {
          await logAuditEvent({ action: 'USER_SIGNIN_FAILURE', event: 'SIGNIN_FAILURE', ...auditData, reason: 'OIDC login disabled' });
          return '/auth/error?error=OidcSigninDisabled'; // Redirect to error page
        }

        // Provider specific enabled check is handled by loadOidcProviders

        // Optional: Check email verification status from provider
        // const requireVerifiedEmail = process.env.REQUIRE_VERIFIED_EMAIL_OIDC === 'true';
        // if (requireVerifiedEmail && !(profile as any)?.email_verified) {
        //     logger.warn(`OIDC login denied for ${profile?.email}: Email not verified by provider ${account.provider}.`);
        //     await logAuditEvent({ action: 'USER_SIGNIN_FAILURE', event: 'SIGNIN_FAILURE', ...auditData, reason: 'OIDC email not verified' });
        //     return '/auth/error?error=EmailNotVerified';
        // }

        try {
          // --- Fetch External Group Memberships ---
          let externalGroups: string[] = [];

          // Attempt to get groups from claims first
          logger.debug('Attempting to get groups from OIDC profile claims.');
          if ((profile as ExtendedProfile)?.groups) {
            logger.debug(`OIDC Signin: Raw profile.groups claim: ${JSON.stringify((profile as ExtendedProfile).groups)}`);
            if (Array.isArray((profile as ExtendedProfile).groups)) {
              externalGroups = (profile as ExtendedProfile).groups!.map(String); // Ensure groups are strings
              logger.debug(`OIDC Signin: Found ${externalGroups.length} groups in claims for user ${profile?.email}.`);
            } else {
              logger.warn(`OIDC Signin: profile.groups is not an array for user ${profile?.email}. Type: ${typeof (profile as ExtendedProfile).groups}`);
            }
          }

          // If groups were not in claims or we need more, fetch via provider API
          // This logic can be adjusted based on whether claims are sufficient or API is always needed
          logger.debug(`External groups after checking claims: ${externalGroups.length} groups.`);
          // If groups were not in claims or we need more, fetch via provider API
          // This logic can be adjusted based on whether claims are sufficient or API is always needed
          if (externalGroups.length === 0 && account?.access_token) {
            logger.debug(`OIDC Signin: Groups not found in claims for user ${profile?.email}. Attempting to fetch via provider API for provider: ${account.provider}.`);
            try {
              const providerId = account.provider.toLowerCase(); // Convert to lowercase for consistent comparison
              if (providerId === 'azure_ad') { // Use 'azure_ad' as per the logs
                logger.info(`OIDC Signin: Calling fetchAzureAdGroups for user ${profile?.email}.`);
                externalGroups = await fetchAzureAdGroups(account.access_token);
                logger.info(`OIDC Signin: fetchAzureAdGroups returned ${externalGroups.length} groups for user ${profile?.email}.`);
                logger.debug(`OIDC Signin: Fetched ${externalGroups.length} groups from Azure AD for user ${profile?.email}.`);
              } else if (providerId === 'authentik') {
                logger.debug('Calling fetchAuthentikGroups...');
                externalGroups = await fetchAuthentikGroups(account.access_token);
                logger.debug(`OIDC Signin: Fetched ${externalGroups.length} groups from Authentik for user ${profile?.email}.`);
              } else if (providerId === 'keycloak') {
                logger.debug('Calling fetchKeycloakGroups...');
                // Get the issuer from the loaded OIDC config for this provider
                const loadedConfigs = loadOidcProviders();
                const keycloakConfig = loadedConfigs.find(config => config.id.toLowerCase() === 'keycloak');
                if (keycloakConfig?.issuer) {
                  externalGroups = await fetchKeycloakGroups(account.access_token, keycloakConfig.issuer);
                  logger.debug(`OIDC Signin: Fetched ${externalGroups.length} groups from Keycloak for user ${profile?.email}.`);
                } else {
                  logger.error('Keycloak issuer not found in configuration');
                }
              }
              // Add more providers here as needed
            } catch (apiError) {
              logger.error(`Error fetching groups from provider ${account.provider}:`, apiError);
              await logAuditEvent({ action: 'OIDC_GROUP_FETCH_FAILURE', event: 'GROUP_FETCH_FAILURE', userId: user?.id, provider: account.provider, reason: `Error fetching groups from API: ${(apiError as Error).message}` });
            }
          }

          // Pass externalGroups to the JWT callback via the account object
          // The actual storage in the database will happen in the JWT callback
          // after the account record is guaranteed to exist.
          (account as ExtendedAccount).externalGroups = externalGroups.length > 0 ? externalGroups : Prisma.JsonNull; // Use Prisma.JsonNull for empty array to explicitly set JSON null
          logger.debug(`OIDC Signin: externalGroups attached to account object for JWT callback: ${JSON.stringify((account as ExtendedAccount).externalGroups)}`);

          // --- End Fetch External Group Memberships ---

          // 1. Check if user already linked this specific OIDC account
          const existingAccount = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              }
            },
            select: { userId: true }
          });

          if (existingAccount) {
            logger.debug(`OIDC Signin: Found existing account link for provider ${account.provider} and user ID ${existingAccount.userId}.`);
            // Fetch the user associated with this existing account to check their role
            const dbUser = await prisma.user.findUnique({
              where: { id: existingAccount.userId },
              select: { id: true, role: true, email: true },
            });

            if (!dbUser) {
              logger.error(`OIDC Signin: Linked user with ID ${existingAccount.userId} not found in DB.`);
              await logAuditEvent({ action: 'USER_SIGNIN_FAILURE', event: 'SIGNIN_FAILURE', ...auditData, reason: 'Linked user not found in DB' });
              return '/auth/error?error=UserNotFound';
            }

            // Update auditData with the actual user ID and email from dbUser
            auditData.userId = dbUser.id;
            auditData.email = dbUser.email;

            // Now log the USER_SIGNIN_ATTEMPT since we have confirmed the user exists
            await logAuditEvent({ action: 'USER_SIGNIN_ATTEMPT', event: 'SIGNIN_ATTEMPT', ...auditData });

            // Apply SUSPENDED/PENDING checks for existing users
            if (dbUser.role === Role.SUSPENDED) {
              logger.error("[OIDC Signin] Account suspended for:", dbUser.email);
              await logAuditEvent({ action: 'USER_SIGNIN_FAILURE', event: 'SIGNIN_FAILURE', ...auditData, userId: dbUser.id, reason: 'Account suspended' });
              return '/auth/error?error=ACCOUNT_SUSPENDED';
            }
            if (dbUser.role === Role.PENDING) {
              logger.warn(`[OIDC Signin] Login blocked for ${dbUser.email}: Account pending approval.`);
              await logAuditEvent({ action: 'USER_SIGNIN_FAILURE', event: 'SIGNIN_FAILURE', ...auditData, userId: dbUser.id, reason: 'Account pending approval' });
              return '/auth/error?error=ACCOUNT_PENDING';
            }

            return true; // Allow sign in for existing, non-suspended/pending user
          }

          // 2. If no existing account link, check if user exists with this email (from a different OIDC or local registration)
          if (!profile?.email) {
            logger.error(`OIDC Signin: No email provided by ${account.provider} for subject ${account.providerAccountId}`);
            await logAuditEvent({ action: 'USER_SIGNIN_FAILURE', event: 'SIGNIN_FAILURE', ...auditData, reason: 'OIDC provider did not return email' });
            return '/auth/error?error=OidcEmailMissing';
          }

          const existingUserByEmail = await prisma.user.findUnique({
            where: { email: profile.email },
          });

          if (existingUserByEmail) {
            // 3. User exists by email, link this new OIDC account
            logger.debug(`OIDC Signin: Found existing user ${existingUserByEmail.id} by email ${profile.email}. Linking account for provider ${account.provider}.`);

            // Apply SUSPENDED/PENDING checks for existing users found by email
            if (existingUserByEmail.role === Role.SUSPENDED) {
              logger.error("[OIDC Signin] Account suspended for:", existingUserByEmail.email);
              await logAuditEvent({ action: 'USER_SIGNIN_FAILURE', event: 'SIGNIN_FAILURE', ...auditData, userId: existingUserByEmail.id, reason: 'Account suspended' });
              return '/auth/error?error=ACCOUNT_SUSPENDED';
            }
            if (existingUserByEmail.role === Role.PENDING) {
              logger.warn(`[OIDC Signin] Login blocked for ${existingUserByEmail.email}: Account pending approval.`);
              await logAuditEvent({ action: 'USER_SIGNIN_FAILURE', event: 'SIGNIN_FAILURE', ...auditData, userId: existingUserByEmail.id, reason: 'Account pending approval' });
              return '/auth/error?error=ACCOUNT_PENDING';
            }

            // Update auditData with the actual user ID and email before logging
            auditData.userId = existingUserByEmail.id;
            auditData.email = existingUserByEmail.email;

            // Now log the USER_SIGNIN_ATTEMPT since we have confirmed the user exists
            await logAuditEvent({ action: 'USER_SIGNIN_ATTEMPT', event: 'SIGNIN_ATTEMPT', ...auditData });

            const newAccountData = prepareAccountData(account as ExtendedAccount, profile as ExtendedProfile, externalGroups);
            await prisma.account.create({
              data: {
                userId: existingUserByEmail.id,
                ...newAccountData,
              }
            });
            const updatedUserData = prepareUserData(profile as ExtendedProfile, existingUserByEmail);
            await prisma.user.update({
              where: { id: existingUserByEmail.id },
              data: updatedUserData,
            });
            await logAuditEvent({ action: 'USER_ACCOUNT_LINKED', event: 'ACCOUNT_LINKED', userId: existingUserByEmail.id, provider: account.provider, method: 'OIDC' });
            user.id = existingUserByEmail.id;
            return true;
          } else {
            // 4. No existing user found by account link or email. This is a truly new user.
            logger.debug(`OIDC Signin: No user found for email ${profile.email}. This is a new user.`);
            const userCount = await prisma.user.count();
            const isFirstUser = userCount === 0;

            if (isFirstUser) {
              logger.debug(`OIDC Signin: Creating first user ${profile.email} as SUPER_ADMIN.`);
              if (!profile) {
                logger.error("OIDC Signin: Profile is undefined when attempting to create first user.");
                await logAuditEvent({ action: 'USER_SIGNIN_FAILURE', event: 'SIGNIN_FAILURE', ...auditData, reason: 'OIDC profile missing during first user creation' });
                return '/auth/error?error=OidcProfileMissing';
              }
              const newUserData = prepareUserData(profile as ExtendedProfile);
              const newAccountData = prepareAccountData(account as ExtendedAccount, profile as ExtendedProfile, externalGroups);

              const newUser = await prisma.user.create({
                data: {
                  ...newUserData,
                  email: newUserData.email || profile.email,
                  role: Role.SUPER_ADMIN,
                  accounts: {
                    create: {
                      ...newAccountData,
                    },
                  },
                },
              });

              // Update auditData with the actual user ID and email before logging
              auditData.userId = newUser.id;
              auditData.email = newUser.email;

              // Now log the USER_SIGNIN_ATTEMPT since we have confirmed the user exists
              await logAuditEvent({ action: 'USER_SIGNIN_ATTEMPT', event: 'SIGNIN_ATTEMPT', ...auditData });

              await logAuditEvent({ action: 'USER_CREATED', event: 'USER_CREATED', userId: newUser.id, email: newUser.email, provider: account.provider, method: 'OIDC', role: Role.SUPER_ADMIN });
              await logAuditEvent({ action: 'USER_ACCOUNT_LINKED', event: 'ACCOUNT_LINKED', userId: newUser.id, provider: account.provider, method: 'OIDC' });
              user.id = newUser.id;
              return true;
            } else {
              // Not the first user, create with default USER role.
              logger.debug(`OIDC Signin: No user found for email ${profile.email}. Not the first user. Provisioning new user with default role USER.`);
              if (!profile) {
                logger.error("OIDC Signin: Profile is undefined when allowing adapter to provision user.");
                await logAuditEvent({ action: 'USER_SIGNIN_FAILURE', event: 'SIGNIN_FAILURE', ...auditData, reason: 'OIDC profile missing for adapter provisioning' });
                return '/auth/error?error=OidcProfileMissing';
              }
              const newUserData = prepareUserData(profile as ExtendedProfile);
              const newAccountData = prepareAccountData(account as ExtendedAccount, profile as ExtendedProfile, externalGroups);

              const newUser = await prisma.user.create({
                data: {
                  ...newUserData,
                  email: newUserData.email || profile.email,
                  role: Role.USER, // Default role for new SSO users
                  accounts: {
                    create: {
                      ...newAccountData,
                    },
                  },
                },
              });

              // Update auditData with the actual user ID and email before logging
              auditData.userId = newUser.id;
              auditData.email = newUser.email;

              // Now log the USER_SIGNIN_ATTEMPT since we have confirmed the user exists
              await logAuditEvent({ action: 'USER_SIGNIN_ATTEMPT', event: 'SIGNIN_ATTEMPT', ...auditData });

              await logAuditEvent({ action: 'USER_CREATED', event: 'USER_CREATED', userId: newUser.id, email: newUser.email, provider: account.provider, method: 'OIDC', role: Role.USER });
              await logAuditEvent({ action: 'USER_ACCOUNT_LINKED', event: 'ACCOUNT_LINKED', userId: newUser.id, provider: account.provider, method: 'OIDC' });
              user.id = newUser.id;
              return true;
            }
          }

        } catch (error) {
          logger.error("Error during OIDC signIn callback:", error);

          // For OIDC errors, only log USER_SIGNIN_ATTEMPT if we have a valid user ID
          // This prevents foreign key constraint violations when user creation fails
          if (auditData.userId) {
            await logAuditEvent({ action: 'USER_SIGNIN_ATTEMPT', event: 'SIGNIN_ATTEMPT', ...auditData });
          }

          await logAuditEvent({ action: 'USER_SIGNIN_FAILURE', event: 'SIGNIN_FAILURE', ...auditData, reason: 'Internal server error during OIDC check' });
          return '/auth/error?error=SigninCallbackError';
        }
      }

      // Default deny if none of the above conditions are met (should not happen)

      // For OIDC, only log USER_SIGNIN_ATTEMPT if we have a valid user ID
      // This prevents foreign key constraint violations when user creation fails
      if (auditData.userId) {
        await logAuditEvent({ action: 'USER_SIGNIN_ATTEMPT', event: 'SIGNIN_ATTEMPT', ...auditData });
      }

      await logAuditEvent({ action: 'USER_SIGNIN_FAILURE', event: 'SIGNIN_FAILURE', ...auditData, reason: 'Unknown signin condition' });
      return false;
    },
    async jwt({ token, user, account }) {
      let userLocalGroups: { id: string; name: string }[] = []; // Initialize userLocalGroups
      const extendedToken = token as ExtendedJWT;

      // On initial sign-in, user object is available. Set token.id.
      if (user) {
        extendedToken.id = user.id;
      }

      // If this is the initial sign-in (account object is present),
      // store the external groups fetched in the signIn callback.
      if (account && account.type === 'oauth' && (account as ExtendedAccount).externalGroups) {
        const externalGroupsFromSignIn = (account as ExtendedAccount).externalGroups!;
        const extGroupsLength = Array.isArray(externalGroupsFromSignIn) ? externalGroupsFromSignIn.length : 0;
        logger.debug(`JWT Callback: Storing ${extGroupsLength} external groups for account ${account.providerAccountId}.`);
        try {
          await prisma.account.update({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              }
            },
            data: {
              externalGroups: extGroupsLength > 0 ? externalGroupsFromSignIn : Prisma.JsonNull,
            },
          });
          logger.debug(`JWT Callback: Successfully stored external groups for account ${account.providerAccountId}.`);
        } catch (error) {
          logger.error(`JWT Callback: Error storing external groups for account ${account.providerAccountId}:`, error);
        }
      }

      // Always fetch the user from the database using token.id to get the latest role, username, and directly assigned groups.
      // token.id should always be available after the initial sign-in.
      if (extendedToken.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: extendedToken.id },
          select: {
            role: true,
            username: true,
            groups: { // Include directly assigned groups
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        extendedToken.role = dbUser?.role as Role ?? Role.USER; // Default to USER if lookup fails
        extendedToken.username = dbUser?.username || undefined; // Add username to the token

        if (dbUser?.groups) {
          userLocalGroups = dbUser.groups; // Assign directly assigned groups
        }
      }

      // Add authentication method and provider info to the token
      // This block ensures external groups are fetched and mapped even on subsequent JWT calls
      // where the 'account' object might not be present.
      let currentAccount: DbAccount | null = null;

      if (account) {
        // On initial sign-in, 'account' is available
        token.authMethod = account.type;
        if (account.type === 'oauth') {
          token.provider = account.provider;
          // Use the account from the callback if available
          currentAccount = account as DbAccount;
        }
      } else if (token.id && token.provider) {
        // On subsequent JWT calls, 'account' is not available, but token.id and token.provider should be
        // Fetch the account from the database using userId and provider
        currentAccount = await prisma.account.findFirst({
          where: {
            userId: token.id as string,
            provider: token.provider as string,
          },
          select: {
            id: true,
            userId: true,
            type: true,
            provider: true,
            providerAccountId: true,
            refresh_token: true,
            access_token: true,
            expires_at: true,
            token_type: true,
            scope: true,
            id_token: true,
            session_state: true,
            issuer: true,
            externalGroups: true,
            ext_expires_in: true,
          }
        });
        if (currentAccount) {
          token.authMethod = currentAccount.type;
          token.provider = currentAccount.provider;
        }
      }

      if (currentAccount && currentAccount.type === 'oauth') {
        const externalGroupsFromDb = (currentAccount.externalGroups as string[] | null) || [];
        // IMPORTANT: Do NOT store externalGroups directly in the token to avoid large cookie size.
        // The externalGroups are already stored in the database (prisma.account.externalGroups).
        // (token as any).externalGroups = externalGroupsFromDb; // This line is intentionally removed/commented out.

        // Find local groups mapped from these external groups
        if (externalGroupsFromDb.length > 0) {
          const ssoMappings = await prisma.ssoGroupMapping.findMany({
            where: {
              ssoProvider: {
                equals: currentAccount.provider,
                ...getCaseInsensitiveMode(),
              },
              ssoGroupName: {
                in: externalGroupsFromDb,
              },
            },
            select: {
              localGroup: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          });
          const mappedLocalGroups = ssoMappings.map(m => m.localGroup);
          userLocalGroups = [...userLocalGroups, ...mappedLocalGroups];
        }
      }
      // Ensure unique groups and assign to token
      const uniqueGroups = Array.from(new Map(userLocalGroups.map((group: { id: string; name: string }) => [group.id, group])).values());
      token.groups = uniqueGroups; // Assign to token.groups
      return token;
    },
    async session({ session, token }): Promise<Session> {
      // Send properties to the client, like id, role, and auth method
      if (token && session.user) {
        const extendedToken = token as ExtendedJWT;
        const extendedUser = session.user as ExtendedUser;

        extendedUser.id = extendedToken.id || '';

        const dbUser = await prisma.user.findUnique({
          where: { id: extendedToken.id || '' },
          select: {
            role: true,
            username: true,
          },
        });

        // If user doesn't exist in database (e.g., after database restore), log warning but continue
        // The session will be returned without extended properties, which will cause client-side auth checks to fail
        if (!dbUser) {
          logger.warn(`Session callback: User ${extendedToken.id} not found in database. Session will be incomplete.`);
          return session;
        }

        extendedUser.role = dbUser.role as Role; // Use the role from the database
        extendedUser.username = dbUser.username || undefined; // Add username to session
        extendedUser.groups = extendedToken.groups || []; // Add user's groups to session from the token

        extendedUser.authMethod = extendedToken.authMethod || ''; // Add auth method to session
        extendedUser.provider = extendedToken.provider || ''; // Expose provider

        // IMPORTANT: Do NOT include externalGroups in the session object to avoid large cookie size.
        // The externalGroups are stored in the database and can be fetched from there if needed.
        // (session.user as any).externalGroups = (token as any).externalGroups || []; // This line is intentionally removed/commented out.
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Helper function to check if a URL is valid (matches NEXTAUTH_URL or is a local development URL)
      const isValidUrl = (checkUrl: string): boolean => {
        try {
          const urlObj = new URL(checkUrl);
          const baseUrlObj = new URL(baseUrl);

          // Check if it matches the baseUrl (NEXTAUTH_URL)
          if (urlObj.origin === baseUrlObj.origin) {
            return true;
          }

          // Allow local development URLs (localhost, 127.0.0.1, and local IPs)
          const hostname = urlObj.hostname;
          if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return true;
          }

          // Allow private IP ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
          if (/^(192\.168|10\.|172\.(1[6-9]|2[0-9]|3[01]))\./.test(hostname)) {
            return true;
          }

          return false;
        } catch {
          return false;
        }
      };

      // Check if self-service is disabled and redirect accordingly
      try {
        const globalSettings = await prisma.globalSettings.findFirst({
          orderBy: { id: 'asc' },
        });

        // If redirecting to root and self-service is disabled, redirect to devices instead
        if (globalSettings?.removeSelfServicePage && (url === baseUrl || url === baseUrl + '/')) {
          logger.debug('Self-service disabled, redirecting authenticated user to /devices');
          return new URL('/devices', baseUrl).toString();
        }
      } catch (error) {
        logger.error('Error checking global settings in redirect callback:', error);
      }

      // Allows relative callback URLs
      if (url.startsWith(baseUrl)) return url;
      // Allows relative callback URLs for NextAuth.js internal redirects
      if (url.startsWith('/')) return new URL(url, baseUrl).toString();

      // Allow valid URLs (including local development URLs)
      if (isValidUrl(url)) {
        return url;
      }

      return baseUrl; // Fallback to base URL
    }
  },
  events: {
    async signIn({ user, account, isNewUser }) {
      await logAuditEvent({
        action: 'USER_LOGIN_SUCCESS',
        event: 'LOGIN_SUCCESS',
        userId: user.id,
        email: user.email,
        method: account?.type === 'oauth' ? 'OIDC' : 'CREDENTIALS',
        provider: account?.provider,
        isNewUser: isNewUser ?? false,
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { lastActive: new Date() }
      });
    },
    async signOut({ session, token }) {
      const extendedToken = token as ExtendedJWT;
      await logAuditEvent({
        action: 'USER_LOGOUT',
        event: 'LOGOUT_SUCCESS',
        userId: extendedToken?.id || session?.user?.id || undefined,
        sessionId: token?.jti as string | undefined,
        email: session?.user?.email
      });
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: false,
  // Cookie configuration for HTTP/HTTPS compatibility
  // Uses ALLOW_HTTP environment variable to determine cookie security settings
  // - ALLOW_HTTP=true: Allow HTTP (development) - secure cookies disabled
  // - ALLOW_HTTP=false/unset: Enforce HTTPS (production) - secure cookies enabled
  // Also checks NEXTAUTH_URL protocol as fallback for backward compatibility
  cookies: {
    sessionToken: {
      // Cookie name logic:
      // 1. If ALLOW_HTTP=true, don't use __Secure- prefix (allows HTTP)
      // 2. If ALLOW_HTTP=false/unset AND in production, use __Secure- prefix
      // 3. Otherwise, no prefix
      name: `${process.env.ALLOW_HTTP !== 'true' && process.env.NODE_ENV === 'production' ? '__Secure-' : ''}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        // Secure cookies logic:
        // 1. If ALLOW_HTTP=true, disable secure cookies (allow HTTP)
        // 2. If ALLOW_HTTP=false/unset, enable secure cookies (enforce HTTPS)
        // 3. Fallback: Check if NEXTAUTH_URL uses HTTPS
        // 4. Default: false (allow HTTP if nothing else indicates HTTPS)
        secure: process.env.ALLOW_HTTP === 'true'
          ? false
          : (process.env.NODE_ENV === 'production' || process.env.NEXTAUTH_URL?.startsWith('https://') || false),
      },
    },
    callbackUrl: {
      name: `${process.env.ALLOW_HTTP !== 'true' && process.env.NODE_ENV === 'production' ? '__Secure-' : ''}next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.ALLOW_HTTP === 'true'
          ? false
          : (process.env.NODE_ENV === 'production' || process.env.NEXTAUTH_URL?.startsWith('https://') || false),
      },
    },
    csrfToken: {
      name: `${process.env.ALLOW_HTTP !== 'true' && process.env.NODE_ENV === 'production' ? '__Host-' : ''}next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.ALLOW_HTTP === 'true'
          ? false
          : (process.env.NODE_ENV === 'production' || process.env.NEXTAUTH_URL?.startsWith('https://') || false),
      },
    },
  },
  // Ensure NextAuth uses the correct URL for redirects
  // useSecureCookies determines if __Secure- and __Host- prefixes are used
  useSecureCookies: process.env.ALLOW_HTTP === 'true'
    ? false
    : (process.env.NODE_ENV === 'production' || process.env.NEXTAUTH_URL?.startsWith('https://') || false),
};