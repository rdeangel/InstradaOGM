# SSO Provider Configuration (for Login and Group Mappings)

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Configuration](./)

## Overview

This document outlines the configuration required for InstradaOGM to integrate with OIDC providers for authentication and group mapping.

## General OIDC Configuration

InstradaOGM supports OIDC authentication and can map external groups from your OIDC provider to local groups within the application. To configure an OIDC provider, you need to set environment variables following the pattern `AUTH_OIDC_PROVIDER_<ALIAS>_<SETTING>`.

The following settings are generally required for any OIDC provider:

*   `AUTH_OIDC_PROVIDER_<ALIAS>_ENABLED=true`: Enables the OIDC provider with the specified alias.
*   `AUTH_OIDC_PROVIDER_<ALIAS>_CLIENT_ID=<Your Client ID>`: The Client ID obtained from your OIDC provider's application registration.
*   `AUTH_OIDC_PROVIDER_<ALIAS>_CLIENT_SECRET=<Your Client Secret>`: The Client Secret obtained from your OIDC provider's application registration.
*   `AUTH_OIDC_PROVIDER_<ALIAS>_ISSUER=<Your Issuer URL>`: The issuer URL of your OIDC provider. This is used for OIDC discovery to find the provider's endpoints (authorization, token, userinfo, jwks).
*   `AUTH_OIDC_PROVIDER_<ALIAS>_SCOPES=<Required Scopes>`: A space-separated string of scopes. At a minimum, `openid`, `email`, and `profile` are usually required. Additional scopes may be needed to retrieve group information.
*   `AUTH_OIDC_PROVIDER_<ALIAS>_DISPLAY_NAME=<Display Name>`: (Optional) The name that will be displayed on the login button. Defaults to the alias if not provided.

You can optionally provide explicit endpoint URLs if discovery is not desired or available:

*   `AUTH_OIDC_PROVIDER_<ALIAS>_AUTHORIZATION_URL=<Authorization Endpoint URL>`
*   `AUTH_OIDC_PROVIDER_<ALIAS>_TOKEN_URL=<Token Endpoint URL>`
*   `AUTH_OIDC_PROVIDER_<ALIAS>_USERINFO_URL=<Userinfo Endpoint URL>`
*   `AUTH_OIDC_PROVIDER_<ALIAS>_JWKS_URI=<JWKS Endpoint URI>`

Replace `<ALIAS>` with a unique uppercase identifier for your provider (e.g., `AUTHENTIK`, `MICROSOFT`, `KEYCLOAK`).

## Authentik Configuration

To configure Authentik as an OIDC provider for InstradaOGM with group mapping:

### Create an Application and Provider in Authentik

1.  **Log in to Authentik as an administrator** and open the authentik Admin interface.

2.  **Navigate to Applications > Applications** and click **Create with Provider** to create an application and provider pair. (Alternatively you can first create a provider separately, then create the application and connect it with the provider.)
    *   **Application**: provide a descriptive name (e.g., "InstradaOGM"), an optional group for the type of application, the policy engine mode, and optional UI settings.
    *   **Choose a Provider type**: select OAuth2/OpenID Connect as the provider type.
    *   **Configure the Provider**: provide a name (or accept the auto-provided name), the authorization flow to use for this provider, and the following required configurations:
        *   Note the **Client ID**, **Client Secret**, and **slug** values because they will be required later.
        *   Set **Authorization Flow**: default-provider-autheorization-explicit-consent
        *   Set a **Strict redirect URI** to `https://your-opengm-url/api/auth/callback/AUTHENTIK` (replace `your-opengm-url` with your InstradaOGM application's URL).
        *   Set the **Back-Channel Logout URI** to `https://your-opengm-url/api/auth/signout`.
        *   Select any available signing key.
    *   **Configure Bindings (optional)**: you can create a binding (policy, group, or user) to manage the listing and access to applications on a user's My applications page.

3.  **Click Submit** to save the new application and provider.

### Configure Policy / Group / User Bindings in Authentik

**Policy/Group/User Bindings** control which users and groups can access the InstradaOGM application in Authentik. This provides an additional layer of access control at the OIDC provider level.

1.  **Navigate to the Application** you created and go to the **Policy / Group / User Bindings** tab.

2.  **Add Bindings** to control application access:
    *   **Bind Existing Policy**: Create or bind an existing policy to enforce custom access rules (e.g., IP-based restrictions, time-based access, etc.)
    *   **Bind Existing Group**: Bind specific groups to allow only members of those groups to access the application
    *   **Bind Existing User**: Bind specific users to allow only those users to access the application

3.  **Policy Engine Mode**: The application uses the policy engine mode configured during application creation. Common modes include:
    *   **ANY**: Any policy must match to grant access (default)
    *   **ALL**: All policies must match to grant access

4.  **Save** your bindings. Users and groups that don't match the bindings will not be able to access the application through Authentik.

**Note**: Bindings in Authentik control whether users can see and access the application. Once authenticated, InstradaOGM will also perform its own authorization checks based on local group mappings and device access rules (see "Group Membership and Local Mapping" section below).

### Configure Groups in Authentik

1.  **Navigate to Directory > Groups** to view and manage groups in Authentik.

2.  **Create Groups** (if not already created):
    *   Click **Create** to add new groups
    *   Provide a descriptive name for each group (e.g., "Admins", "Users", "Devices-Team-A")
    *   Optionally add a description
    *   Save the group

3.  **Assign Users to Groups**:
    *   Open each group and add users as members
    *   Users can belong to multiple groups

4.  **Configure Group Mapping in the OIDC Provider**:
    *   Navigate to **Applications > Providers** and edit the provider you created earlier
    *   In the **Advanced protocol settings** section, add the `groups` scope to the "Allowed scopes" list
    *   Ensure the provider is configured to include group information in the OIDC token response

5.  **Verify Group Retrieval**:
    *   After a user logs in, InstradaOGM will automatically retrieve their group memberships from Authentik
    *   Groups are included in the OIDC claims and are stored in the user's session for local group mapping
    *   See [Group Membership and Local Mapping](#group-membership-and-local-mapping) for details on how groups are used within InstradaOGM

### Configure InstradaOGM Environment Variables

Set the following environment variables in your InstradaOGM deployment:

*   `AUTH_OIDC_PROVIDER_AUTHENTIK_ENABLED=true`
*   `AUTH_OIDC_PROVIDER_AUTHENTIK_CLIENT_ID=<Your Authentik Client ID>` (from step 2)
*   `AUTH_OIDC_PROVIDER_AUTHENTIK_CLIENT_SECRET=<Your Authentik Client Secret>` (from step 2)
*   `AUTH_OIDC_PROVIDER_AUTHENTIK_ISSUER=<Your Authentik Issuer URL>` (e.g., `https://authentik.your-domain.com/application/o/<slug>/`)
*   `AUTH_OIDC_PROVIDER_AUTHENTIK_SCOPES="openid email profile groups"`
*   `AUTH_OIDC_PROVIDER_AUTHENTIK_DISPLAY_NAME="Authentik"` (Optional)

**Group Retrieval for Authentik:**

The application attempts to retrieve groups from the OIDC profile claims first. If groups are not available in the claims (e.g., in a `groups` claim), it will attempt to fetch them using the `fetchAuthentikGroups` function in [`../../src/lib/auth.ts`](../../src/lib/auth.ts). This function uses the Authentik API endpoint `/api/v3/core/users/me/groups` to retrieve the user's group memberships.

The function checks for groups in multiple possible claim locations:
*   `groups` - Standard groups claim
*   `ak_groups` - Authentik-specific groups claim

Ensure that your Authentik provider is configured to include group information in the token response as described in the group mapping steps above. If using the API fallback method, ensure that the application has the necessary permissions to access the Authentik API.

## Microsoft Entra ID Configuration

To configure Microsoft Entra ID (formerly Azure AD) as an OIDC provider with group mapping:

1.  **Register an Application in Microsoft Entra ID:**
    *   Go to the Azure portal -> Azure Active Directory -> App registrations.
    *   Register a new application.
    *   Add a Redirect URI of type "Web" to `https://your-opengm-url/api/auth/callback/MICROSOFT` (replace `your-opengm-url` with your application's URL). The alias `MICROSOFT` in the callback URL must match the alias used in the environment variables.
    *   Go to "API permissions" and add the "Microsoft Graph" permission `Group.Read.All` (Delegated permissions). Grant admin consent for this permission.
    *   Go to "Certificates & secrets" and create a new client secret. Copy the **Value** of the secret (you will not be able to see it again after leaving the page).
2.  **Configure Environment Variables:**
    *   `AUTH_OIDC_PROVIDER_MICROSOFT_ENABLED=true`
    *   `AUTH_OIDC_PROVIDER_MICROSOFT_CLIENT_ID=<Your Microsoft Entra ID Application (client) ID>`
    *   `AUTH_OIDC_PROVIDER_MICROSOFT_CLIENT_SECRET=<Your Microsoft Entra ID Client Secret Value>`
    *   `AUTH_OIDC_PROVIDER_MICROSOFT_ISSUER=https://login.microsoftonline.com/<Your Tenant ID>/v2.0` (Replace `<Your Tenant ID>` with your actual tenant ID, found in the Microsoft Entra ID overview page).
    *   `AUTH_OIDC_PROVIDER_MICROSOFT_SCOPES="openid email profile User.Read GroupMember.Read.All Group.Read.All"` - Ensure "GroupMember.Read.All" is included and consented in Microsoft Entra ID ("Group.Read.All" might not be necessary)
    *   `AUTH_OIDC_PROVIDER_MICROSOFT_DISPLAY_NAME="Microsoft"` (Optional)

**Group Retrieval for Microsoft:**

The application attempts to retrieve groups from the OIDC profile claims first. If groups are not available in the claims, it will attempt to fetch them using the `fetchMicrosoftGroups` function in [`../../src/lib/auth.ts`](../../src/lib/auth.ts). This function uses the Microsoft Graph API (`https://graph.microsoft.com/v1.0/me/memberOf`) to retrieve the user's group memberships. The `Group.Read.All` scope is required for this.

Once groups are retrieved, see [Group Membership and Local Mapping](#group-membership-and-local-mapping) for details on how they are used within InstradaOGM.

## Keycloak Configuration

To configure Keycloak as an OIDC provider:

1.  **Create a Client in Keycloak:**
    *   Log into your Keycloak admin console.
    *   Navigate to your realm and go to "Clients".
    *   Create a new client with the following settings:
        *   **Client ID**: Choose a unique identifier (e.g., `InstradaOGM`)
        *   **Client Protocol**: `openid-connect`
        *   **Access Type**: `confidential`
        *   **Valid Redirect URIs**: `https://your-opengm-url/api/auth/callback/KEYCLOAK` (replace `your-opengm-url` with your application's URL). The alias `KEYCLOAK` in the callback URL must match the alias used in the environment variables.
        *   **Web Origins**: `https://your-opengm-url` (your application's base URL)
    *   Save the client and note the **Client Secret** from the "Credentials" tab.

2.  **Configure Group Mapping in Keycloak:**
    *   In your client settings, go to the "Mappers" tab.
    *   Create a new mapper with the following settings:
        *   **Name**: `groups`
        *   **Mapper Type**: `Group Membership`
        *   **Token Claim Name**: `groups`
        *   **Full group path**: `OFF` (recommended for simpler group names)
        *   **Add to ID token**: `ON`
        *   **Add to access token**: `ON`
        *   **Add to userinfo**: `ON`
    *   This ensures that group information is included in the userinfo endpoint response.

3.  **Configure Environment Variables:**
    *   `AUTH_OIDC_PROVIDER_KEYCLOAK_ENABLED=true`
    *   `AUTH_OIDC_PROVIDER_KEYCLOAK_CLIENT_ID=<Your Keycloak Client ID>`
    *   `AUTH_OIDC_PROVIDER_KEYCLOAK_CLIENT_SECRET=<Your Keycloak Client Secret>`
    *   `AUTH_OIDC_PROVIDER_KEYCLOAK_ISSUER=<Your Keycloak Issuer URL>` (e.g., `https://keycloak.your-domain.com/realms/your-realm`)
    *   `AUTH_OIDC_PROVIDER_KEYCLOAK_SCOPES="openid email profile groups"` (Include `groups` scope to retrieve group information)
    *   `AUTH_OIDC_PROVIDER_KEYCLOAK_DISPLAY_NAME="Keycloak"` (Optional)

**Group Retrieval for Keycloak:**

The application attempts to retrieve groups from the OIDC profile claims first. If groups are not available in the claims, it will attempt to fetch them using the `fetchKeycloakGroups` function in [`../../src/lib/auth.ts`](../../src/lib/auth.ts). This function calls the Keycloak userinfo endpoint (`/protocol/openid-connect/userinfo`) to retrieve the user's group memberships. The function checks for groups in multiple possible claim locations (in order of preference):

*   `groups` - Standard groups claim (from Group Membership mapper)
*   `roles` - Alternative roles claim
*   `realm_access.roles` - Realm-level roles
*   `resource_access` - Client-specific roles (extracted from each client's roles array)

Ensure that your Keycloak client is configured to include group information in the userinfo response as described in step 2 above. The `groups` scope should be included in your environment variable configuration to enable group retrieval.

Once groups are retrieved, see [Group Membership and Local Mapping](#group-membership-and-local-mapping) for details on how they are used within InstradaOGM.

## Adding More Provider Compatibility

To add compatibility for a new OIDC provider:

1.  **Configure Environment Variables:** Set the necessary `AUTH_OIDC_PROVIDER_<ALIAS>_` environment variables for your new provider, replacing `<ALIAS>` with a unique identifier.
2.  **Check Group Claims:** Log in with the new provider and check the server-side console logs (as added in the previous steps) to see if group information is included in the OIDC profile claims (`Profile claims:` log).
3.  **Implement Group Fetching (if needed):** If group information is not available in the profile claims, you may need to implement a new function similar to `fetchMicrosoftGroups` or `fetchAuthentikGroups` in [`../../src/lib/auth.ts`](../../src/lib/auth.ts) to fetch groups from your provider's API.
    *   This function should take the `accessToken` as input and return a `Promise<string[]>` of group identifiers.
    *   You will then need to add a condition in the `signIn` callback (around line 330 in the current [`../../src/lib/auth.ts`](../../src/lib/auth.ts)) to call your new fetching function based on the `account.provider` name (which corresponds to your chosen `<ALIAS>`).
4.  **Update Group Mapping Logic:** Ensure that the group mapping logic in the application (e.g., in the API routes that display user information or manage group memberships) correctly uses the `externalGroups` stored in the database account record and the `ssoProvider` to find relevant local group mappings. The current implementation in [`src/app/api/admin/users/[id]/route.ts`](src/app/api/admin/users/[id]/route.ts) already uses the stored `externalGroups` and `ssoProvider` from the session (after the previous fix) to find mapped groups.

By following these steps, you can extend the application's compatibility to other OIDC providers and leverage their group information for access control and management within InstradaOGM.

## Group Membership and Local Mapping

### How Group Membership is Retrieved and Used

When a user authenticates through an OIDC provider, InstradaOGM retrieves their group memberships from the provider. These external groups are then used for:

1.  **Local Group Mapping**: External groups from your OIDC provider are mapped to local groups within InstradaOGM. This allows you to:
    *   Control which users have access to specific features and administrative functions
    *   Organize users into logical groups that reflect your organizational structure
    *   Apply role-based access control (RBAC) based on group membership

2.  **Device Management and Access Control**: Group membership is used to determine:
    *   Which devices a user can access and manage
    *   Which device groups a user belongs to
    *   Device-level permissions and restrictions based on group policies

3.  **Application Authorization**: After successful authentication, InstradaOGM uses the retrieved group memberships to:
    *   Determine the user's role (USER, ADMIN, SUPER_ADMIN)
    *   Control access to protected resources and API endpoints
    *   Enforce device access policies

### Configuration in InstradaOGM

To set up local group mapping:

1.  **Navigate to Admin > Group Mappings** in InstradaOGM
2.  **Create mappings** between your OIDC provider groups and local InstradaOGM groups
3.  **Assign users** to local groups based on their external group memberships

## Section Navigation

### Configuration Documentation
- [📋 Configuration Overview](./) - Section index and overview
- [🌐 Proxy Settings](CADDY-PROXY-SETTINGS.md) - Configure reverse proxy
- [🗄️ Database Configuration](../SETUP/DATABASE_CONFIGURATION_GUIDE.md) - Database setup and configuration
- [🔓 Allow HTTP Guide](ALLOW_HTTP_COMPREHENSIVE_GUIDE.md) - HTTP access configuration

---

## Related Documentation

- [📚 Documentation Home](../DOCUMENTATION_INDEX.md) - Main documentation index
- [🚀 Getting Started](../SETUP/INSTALLATION_GUIDE.md) - Installation and setup
- [🔧 API Reference](../api/api_docs/API_Index.md) - API documentation

---

## Getting Help

- [📋 Documentation Index](../DOCUMENTATION_INDEX.md) - Complete documentation overview
- [📁 Configuration Section](./) - Section-specific help
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - Report configuration problems

---

This allows you to maintain a flexible access control system where changes to group membership in your OIDC provider are automatically reflected in InstradaOGM's authorization decisions.

**Last Updated**: 2025-11-06 | **Section**: Configuration | **Category**: Authentication