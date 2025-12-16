# Quick Guide: Setting Up a New Application in Authentik

[⬆️ Back to Documentation Home](DOCUMENTATION_INDEX.md)

## Overview

This guide provides step-by-step instructions for setting up a new application in Authentik, an open-source Identity Provider that supports various authentication protocols including OAuth2, SAML, LDAP, and SCIM.

## Prerequisites

- Authentik instance installed and running
- Admin access to Authentik
- Target application details (name, URL, etc.)

## Step 1: Access the Admin Interface

1. Log in to Authentik as an administrator
2. Navigate to the **Admin interface**
3. Go to **Applications > Applications** in the left sidebar

## Step 2: Create Application and Provider Pair

1. Click **Create with Provider** to create both an application and its provider simultaneously
   - Alternatively, you can click **Create** to create only an application without a provider

2. Configure the **Application** settings:
   - **Name**: Display name for the application card
   - **Slug**: Unique identifier (auto-generated from name)
   - **Policy Engine Mode**: Choose between `all` or `any` for policy evaluation
   - **Open in new tab**: Whether to launch in a new browser tab
   - **Group**: Optional categorization for the application

3. **Choose a Provider** type based on your application's requirements:
   - **OAuth2 Provider**: For web applications using OAuth2/OIDC
   - **SAML Provider**: For SAML-based applications
   - **Proxy Provider**: For reverse proxy authentication
   - **LDAP Provider**: For LDAP directory services
   - **RADIUS Provider**: For network authentication
   - **SCIM Provider**: For user provisioning
   - **RAC Provider**: For Remote Access Control

4. **Configure the Provider** settings:
   - **Name**: Provider name (auto-generated from application name)
   - **Authorization Flow**: Flow used for authorization
   - **Authentication Flow**: Flow for unauthenticated users
   - **Provider-specific settings**: Vary by provider type
   - **Property Mappings**: Optional attribute mappings
   - **Connection Expiry**: Session duration settings

5. **Configure Bindings** (optional):
   - Bind to specific users, groups, or policies
   - If no bindings are defined, all users have access
   - Use Policy Engine Mode to control access requirements

## Step 3: Configure Application Appearance

1. **Launch URL**: The URL opened when users click the application
   - Must start with `http://` or `https://` to appear on My Applications page
   - Can use placeholders like `https://app.example.com/%(username)s`
   - Set to `blank://blank` to hide from My Applications page

2. **Icon**: Upload an application icon or provide a URL
   - If using a volume mount under `/media`, reference with `https://authentik.company/media/my-file.png`

3. **Publisher**: Text shown below the application name

4. **Description**: Subtext displayed on the application card

## Step 4: Review and Create

1. Review all configuration settings in the **Review and Submit Application** panel
2. Click **Submit** to create the application and provider pair

## Step 5: Configure Access Control (Optional)

### Policy-Driven Authorization

1. Click on the application in the applications list
2. Select the **Policy/Group/User Bindings** tab
3. Bind users, groups, or policies to control access
4. Configure Policy Engine Mode:
   - **ALL**: Users must pass all bindings/be member of all groups
   - **ANY**: Users must pass either binding/be member of either group

### Application Entitlements (Advanced)

For fine-grained authorization within applications:

1. Navigate to **Applications > Applications**
2. Click the application name
3. Go to **Application entitlements** tab
4. Click **Create entitlement**
5. Provide a name and optional attributes
6. Bind users/groups to the entitlement

## Step 6: Add Backchannel Providers (Optional)

To augment functionality with additional protocols:

1. Navigate to **Applications > Providers**
2. Click **Create** and select a backchannel provider type:
   - SCIM for user provisioning
   - LDAP for directory syncing
   - Google Workspace for G Suite integration
   - Microsoft Entra ID for Azure integration
3. Configure the provider settings
4. Edit the application and add the backchannel provider in the **Backchannel Providers** field

## Step 7: Test the Application

1. Verify the application appears on users' **My Applications** page
2. Test authentication flow by clicking the application
3. Confirm proper redirection to the target application
4. Verify user access based on configured policies

## Direct Launch URLs

Users can directly access applications using:
```
https://authentik.company/application/launch/<slug>/
```

If already logged in, users are redirected automatically. Otherwise, they go through authentication first.

## API Example (Programmatic Setup)

For automated application creation using the API:

```python
import requests

API_URL = "http://localhost:9000/api/v3"
headers = {
    "Authorization": "Bearer your-api-token-here",
    "Content-Type": "application/json"
}

# Create an application
application = {
    "name": "My Web Application",
    "slug": "my-web-app",
    "provider": "your-oauth2-provider-uuid",
    "policy_engine_mode": "all",
    "open_in_new_tab": False,
    "meta_launch_url": "https://app.example.com",
    "meta_description": "Internal web application for team collaboration",
    "meta_publisher": "IT Department",
    "group": ""
}

response = requests.post(
    f"{API_URL}/core/applications/",
    headers=headers,
    json=application
)

if response.status_code == 201:
    app = response.json()
    print(f"Application created: {app['slug']}")
    print(f"Application URL: {app['meta_launch_url']}")
else:
    print(f"Error: {response.status_code} - {response.json()}")
```

## Troubleshooting

### Application Not Visible on My Applications Page
- Verify Launch URL starts with `http://` or `https://`
- Check if application is hidden with `blank://blank` launch URL
- Confirm user has proper access through policies

### Authentication Issues
- Verify provider configuration matches application requirements
- Check authentication and authorization flow settings
- Ensure proper redirect URIs are configured (for OAuth2/SAML)

### Access Denied
- Review policy bindings and engine mode
- Check user/group memberships
- Verify application entitlements if used

## Best Practices

1. Use descriptive names and slugs for easy identification
2. Configure appropriate launch URLs for seamless user experience
3. Implement proper access controls using policies and entitlements
4. Test thoroughly before deploying to production
5. Document application configurations for future reference
6. Regularly review and update access policies as needed

## Related Documentation

- [📚 Documentation Home](DOCUMENTATION_INDEX.md) - Main documentation index
- [🔧 SSO Provider Config](CONFIGURATION/SSO_PROVIDER_CONFIG.md) - Configure SSO providers in InstradaOGM
- [🚀 Getting Started](SETUP/INSTALLATION_GUIDE.md) - Installation and setup

---

## Getting Help

- [📋 Documentation Index](DOCUMENTATION_INDEX.md) - Complete documentation overview
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - Report bugs or request features
- [💬 Discussions](https://github.com/rdeangel/InstradaOGM/discussions) - Community discussions

---

## Additional Resources

- [Authentik Applications Documentation](https://docs.goauthentik.io/add-secure-apps/applications/)
- [Authentik Providers Documentation](https://docs.goauthentik.io/providers/)
- [Authentik API Reference](https://api.goauthentik.io/)
- [Authentik Community Support](https://goauthentik.io/discord)

---

**Last Updated**: 2025-11-06 | **Section**: Configuration | **Category**: Authentication