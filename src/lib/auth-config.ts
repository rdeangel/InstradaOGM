/* eslint-disable security/detect-object-injection */
// This file uses bracket notation with typed keys from configuration objects. All uses are safe.
import { OAuthConfig } from "next-auth/providers/oauth";
import { Profile, User, Awaitable } from "next-auth"; // Import necessary types
import { Role } from "@/types/opnsense"; // Import Role enum from module types
import { logger } from '@/lib/logger';

// Define the structure for our loaded OIDC provider configuration
export interface LoadedOidcProviderConfig {
    id: string; // The alias, e.g., "GOOGLE", "KEYCLOAK", "AUTHENTIK"
    name: string; // Display name for the button
    clientId: string;
    clientSecret: string;
    issuer: string;
    scopes?: string; // Optional scopes string
    authorizationUrl?: string; // Optional: Explicit authorization endpoint URL
    tokenUrl?: string; // Optional: Explicit token endpoint URL
    userInfoUrl?: string; // Optional: Explicit userinfo endpoint URL
    jwksUri?: string; // Optional: Explicit JWKS endpoint URL
}

// Extended Profile interface to include non-standard OIDC claims
interface ExtendedProfile extends Profile {
    picture?: string;
    preferred_username?: string;
    email_verified?: boolean;
}

// Extended User interface to include role
interface ExtendedUser extends User {
    role?: Role;
}

/**
 * Parses environment variables to load configurations for enabled OIDC providers.
 *
 * Looks for variables following the pattern:
 * AUTH_OIDC_PROVIDER_<ALIAS>_ENABLED=true
 * AUTH_OIDC_PROVIDER_<ALIAS>_CLIENT_ID=...
 * AUTH_OIDC_PROVIDER_<ALIAS>_CLIENT_SECRET=...
 * AUTH_OIDC_PROVIDER_<ALIAS>_ISSUER=...
 * AUTH_OIDC_PROVIDER_<ALIAS>_SCOPES=... (optional)
 * AUTH_OIDC_PROVIDER_<ALIAS>_DISPLAY_NAME=... (optional, defaults to ALIAS)
 * AUTH_OIDC_PROVIDER_<ALIAS>_AUTHORIZATION_URL=... (optional)
 * AUTH_OIDC_PROVIDER_<ALIAS>_TOKEN_URL=... (optional)
 * AUTH_OIDC_PROVIDER_<ALIAS>_USERINFO_URL=... (optional)
 * AUTH_OIDC_PROVIDER_<ALIAS>_JWKS_URI=... (optional)
 *
 * @returns An array of validated OIDC provider configurations.
 */
export function loadOidcProviders(): LoadedOidcProviderConfig[] {
    const providers: LoadedOidcProviderConfig[] = [];
    const env = process.env;
    const providerAliases: Set<string> = new Set();

    // First, find all enabled provider aliases using the new prefix
    for (const key in env) {
        const match = key.match(/^AUTH_OIDC_PROVIDER_([A-Z0-9_]+)_ENABLED$/);
        if (match && env[key]?.toLowerCase() === 'true') {
            providerAliases.add(match[1]); // Add the alias (e.g., GOOGLE)
        }
    }

    // For each enabled alias, load and validate its configuration using the new prefix
    providerAliases.forEach(alias => {
        const clientId = env[`AUTH_OIDC_PROVIDER_${alias}_CLIENT_ID`];
        const clientSecret = env[`AUTH_OIDC_PROVIDER_${alias}_CLIENT_SECRET`];
        const issuer = env[`AUTH_OIDC_PROVIDER_${alias}_ISSUER`];
        const displayName = env[`AUTH_OIDC_PROVIDER_${alias}_DISPLAY_NAME`] || alias; // Default to alias
        const scopes = env[`AUTH_OIDC_PROVIDER_${alias}_SCOPES`]; // Optional
        const authorizationUrl = env[`AUTH_OIDC_PROVIDER_${alias}_AUTHORIZATION_URL`]; // Optional
        const tokenUrl = env[`AUTH_OIDC_PROVIDER_${alias}_TOKEN_URL`]; // Optional
        const userInfoUrl = env[`AUTH_OIDC_PROVIDER_${alias}_USERINFO_URL`]; // Optional
        const jwksUri = env[`AUTH_OIDC_PROVIDER_${alias}_JWKS_URI`]; // Optional

        if (!clientId) {
            logger.warn(`AUTH_OIDC Provider ${alias} is enabled but missing AUTH_OIDC_PROVIDER_${alias}_CLIENT_ID. Skipping.`);
            return; // Skip this provider
        }
        if (!clientSecret) {
            logger.warn(`AUTH_OIDC Provider ${alias} is enabled but missing AUTH_OIDC_PROVIDER_${alias}_CLIENT_SECRET. Skipping.`);
            return; // Skip this provider
        }
        if (!issuer) {
            logger.warn(`AUTH_OIDC Provider ${alias} is enabled but missing AUTH_OIDC_PROVIDER_${alias}_ISSUER. Skipping.`);
            return; // Skip this provider
        }

        providers.push({
            id: alias,
            name: displayName,
            clientId,
            clientSecret,
            issuer,
            ...(scopes && { scopes }), // Add scopes only if defined
            ...(authorizationUrl && { authorizationUrl }), // Add explicit URLs if defined
            ...(tokenUrl && { tokenUrl }),
            ...(userInfoUrl && { userInfoUrl }),
            ...(jwksUri && { jwksUri }), // Add explicit JWKS URI if defined
        });
    });

    if (providers.length > 0) {
        logger.info(`Loaded ${providers.length} enabled AUTH_OIDC providers: ${providers.map(p => p.id).join(', ')}`);
    } else {
        logger.info("No enabled AUTH_OIDC providers found in environment variables.");
    }


    return providers;
}

/**
 * Maps OIDC profile claims to the NextAuth User object.
 */
function mapOidcProfileToNextAuthUser(profile: ExtendedProfile, configId: string): ExtendedUser {
    // The 'sub' claim is essential for linking the account. Throw if missing.
    if (!profile.sub) {
        throw new Error(`OIDC profile missing 'sub' claim for provider ${configId}`);
    }
    // The User object expected by NextAuth requires id, email, name, image.
    // Map OIDC claims to these fields.
    const user: ExtendedUser = {
        id: profile.sub, // 'sub' is guaranteed to be a string here
        name: profile.name ?? profile.preferred_username ?? profile.email, // Fallback logic for name
        email: profile.email, // Email might be null depending on provider/scope
        image: profile.picture, // Use picture claim for image
        // Add emailVerified to the user object if present in the profile
        // Note: The standard User type doesn't include emailVerified,
        // but the adapter/callbacks might use it. We cast to any temporarily.
        ...(profile.email_verified !== undefined && { emailVerified: profile.email_verified ? new Date() : null }) // Store as Date if verified
    };
    // Explicitly add role after the spread to ensure it's included
    user.role = Role.PENDING; // Set a default role for OIDC users
    return user;
}


/**
 * Helper function to map loaded config to NextAuth's OAuthConfig type.
 * Uses explicit endpoints if provided, otherwise relies on OIDC discovery via the issuer URL.
 */
export function mapConfigToProvider(config: LoadedOidcProviderConfig): OAuthConfig<ExtendedProfile> {
    const baseConfig = {
        id: config.id,
        name: config.name,
        type: "oauth" as const, // Ensure type is literal "oauth"
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        // Define the profile mapping function once, referencing the helper
        profile: (profile: ExtendedProfile): Awaitable<ExtendedUser> => mapOidcProfileToNextAuthUser(profile, config.id),
    };

    // If explicit endpoints are provided, use them.
    if (config.authorizationUrl && config.tokenUrl && config.userInfoUrl) {
        logger.info(`Using explicit endpoints for OIDC provider: ${config.id}`);
        return {
            ...baseConfig,
            wellKnown: undefined, // Explicitly disable discovery
            issuer: config.issuer, // Still useful for validation/context
            authorization: { url: config.authorizationUrl, params: { scope: config.scopes || "openid email profile" } },
            token: { url: config.tokenUrl },
            userinfo: { url: config.userInfoUrl },
            jwks_endpoint: config.jwksUri, // Use jwks_endpoint for the URI
        };
    }
    // Otherwise, rely on issuer discovery.
    else {
        logger.info(`Relying on explicit wellKnown URL for OIDC provider: ${config.id}`);
        // Construct the full well-known URL
        const wellKnownUrl = config.issuer.endsWith('/')
            ? `${config.issuer}.well-known/openid-configuration`
            : `${config.issuer}/.well-known/openid-configuration`;
        return {
            ...baseConfig,
            issuer: config.issuer, // Keep issuer for validation
            wellKnown: wellKnownUrl, // Provide the full discovery URL explicitly
            // Ensure authorization parameters (including scopes) are included
            authorization: { params: { scope: config.scopes || "openid email profile" } },
        };
    }
}