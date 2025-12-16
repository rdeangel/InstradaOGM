# Global Self-Service Disable Feature

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Features](./)

## Overview

The **Global Self-Service Disable** feature provides administrators with the ability to completely remove self-service functionality from InstradaOGM (OGM) for enhanced security in environments where end-user self-service is not required.

## 🔒 Security Benefits

### Complete Functionality Removal
- **Application-Level Disable**: Removes all self-service functionality at the server level
- **API Protection**: Automatically disables unauthenticated APIs that support self-service
- **Reduced Attack Surface**: Minimizes exposed functionality for potential security vulnerabilities
- **Server-Side Enforcement**: Redirects are handled server-side before any client components load

### Automatic API Security
When self-service is globally disabled, the following APIs are automatically protected:
- `/api/opnsense/ip-group-membership` - Returns 403 Forbidden for all requests
- `/api/ui/config` - Excludes self-service configuration data
- Other unauthenticated endpoints that support self-service functionality

### Real-Time Cache Invalidation
The system now includes enhanced cache invalidation to ensure immediate UI updates:
- **Automatic Timestamp Updates**: Global settings changes automatically update cache invalidation timestamps
- **Immediate Effect**: Changes to self-service settings invalidate cached permissions within 1 hour
- **Consistent UI State**: Header menu visibility accurately reflects current access control settings
- **Performance Maintained**: Caching optimization preserved while ensuring accuracy

## 🎯 Use Cases

### Corporate Environments
- **IT-Managed Networks**: Where only IT administrators should control network access
- **Centralized Management**: All device and group management handled by admin staff
- **Policy Compliance**: Environments requiring centralized control for compliance reasons

### High-Security Deployments
- **Minimal Exposure**: Reduce potential attack vectors by disabling unused functionality
- **Defense in Depth**: Additional security layer beyond authentication and authorization
- **Audit Requirements**: Simplified audit scope when self-service is not needed

### Educational Institutions
- **Centralized IT Control**: Network access managed by IT department
- **Student/Faculty Separation**: Clear separation between users and administrators
- **Policy Enforcement**: Consistent network policies without user override

## ⚙️ Implementation Details

### Database Schema
- **Field**: `removeSelfServicePage` (boolean)
- **Default**: `false` (self-service enabled)
- **Table**: `GlobalSettings`
- **Migration**: Automatically added via database migration

### Server-Side Components

#### SelfServiceGuard Component
- **Location**: `src/components/SelfServiceGuard.tsx`
- **Function**: Server-side redirect logic before client components mount
- **Behavior**: 
  - Checks global settings on server
  - Redirects authenticated users to `/devices`
  - Redirects unauthenticated users to `/login`

#### API Middleware
- **Protection**: Automatic 403 responses for disabled endpoints
- **Scope**: Unauthenticated APIs that support self-service
- **Implementation**: Server-side validation before request processing

### Client-Side Behavior
- **Menu Updates**: Navigation menu automatically updates based on global settings
- **Routing**: Self-service routes are inaccessible when disabled
- **UI Components**: Self-service components are not rendered when disabled

## 🔧 Configuration

### Access Requirements
- **Role**: SUPER_ADMIN only
- **Location**: Global Settings page
- **Setting**: "Remove Self-Service Page" toggle

### Configuration Steps
1. **Login**: Access InstadaOGM with SUPER_ADMIN credentials
2. **Navigate**: Go to Settings → Global Settings
3. **Toggle**: Enable "Remove Self-Service Page"
4. **Save**: Setting is automatically saved to database
5. **Refresh**: Page refresh is required to update menu and routing

### Refresh Requirement
Changes to the global self-service disable setting require a **full page refresh** to:
- Update navigation menu structure
- Apply new routing behavior
- Refresh all UI components
- Update API endpoint availability

A refresh dialog automatically appears after successful setting changes.

## 🔄 User Experience & Access Logic

### Self-Service Access Logic
The self-service functionality uses a **three-tier access control system** with different rules for authenticated vs unauthenticated users:

#### For Authenticated Users
Self-service access is determined by **three sequential checks**:

1. **Global Setting Check**: `removeSelfServicePage` setting
   - If enabled, blocks all users regardless of other factors
   - Takes precedence over all other access controls

2. **Device Management Scope Check**: User's current IP must be in their permitted devices
   - Checks if user has permission to manage devices at their current IP address
   - Based on user's group memberships and device permissions
   - Ensures users can only access self-service for devices they can manage

3. **Fallback to Unauthenticated Rules**: If device scope check fails
   - **NEW**: Checks if the IP would be allowed for unauthenticated users
   - Ensures authentication never reduces access compared to unauthenticated access
   - If IP passes unauthenticated network restrictions, access is granted

**Access Granted If**: Global setting allows AND (Device scope check passes OR IP allowed for unauthenticated users)

#### For Unauthenticated Users
Self-service access is determined by **two sequential checks**:

1. **Global Setting Check**: `removeSelfServicePage` setting
   - If enabled, blocks all users regardless of IP address

2. **IP Network Restrictions**: Must be on Self-Service Access Control allowed networks
   - Based on include/exclude network rules configured in global settings
   - Additional security layer for users who haven't authenticated

**Access Granted If**: Global setting allows AND IP is in allowed networks

### Before Disable (Normal Operation)
- **Root Path (`/`)**: Loads self-service page
- **Authenticated Users**:
  - ✅ Can access self-service if their IP is in their device management scope
  - ✅ **Fallback**: Can access if their IP would be allowed for unauthenticated users
  - ✅ Self-Service menu item visible when access conditions are met
  - ✅ Can choose between self-service and device management
- **Unauthenticated Users**:
  - ⚠️ Can access self-service only from allowed IP addresses (Self-Service Access Control)
  - ❌ No menu access (not logged in)
  - ✅ Direct page access if IP restrictions are met
- **APIs**: Unauthenticated APIs available for self-service operations (with IP restrictions)

### After Disable (Security Mode)
- **Root Path (`/`)**: Automatic redirect based on authentication
- **Authenticated Users**:
  - 🔄 Redirected to `/devices` (device management)
  - ❌ Self-Service menu item removed from header dropdown
  - ❌ Direct access to self-service page blocked
- **Unauthenticated Users**:
  - 🔄 Redirected to `/login`
  - ❌ All self-service functionality blocked
- **APIs**: Unauthenticated APIs return 403 Forbidden
- **Menu**: Self-service options removed from navigation

## 🛡️ Security Considerations

### Defense in Depth
- **Multiple Layers**: Combines with existing authentication and authorization
- **Fail-Safe**: Server-side enforcement prevents client-side bypasses
- **API Protection**: Comprehensive protection across all relevant endpoints

### Deployment Recommendations
- **Internal Networks**: Recommended for internal-only deployments
- **VPN Access**: Ideal for VPN-only access scenarios
- **High Security**: Additional protection for sensitive environments

### Monitoring and Auditing
- **Audit Logs**: All setting changes are logged with user and timestamp
- **API Tracking**: Failed API attempts are logged when self-service is disabled
- **Access Patterns**: Monitor for unexpected access attempts to disabled endpoints

## 🔧 Technical Implementation

### API Response Examples

#### When Self-Service is Enabled

**For Authenticated Users** (IP in device management scope):
```json
{
  "selfServiceEnabled": true,
  "registrationEnabled": false,
  "groupTypesEnabled": true,
  "subtitleEnabled": false,
  "subtitleText": null
}
```

**For Authenticated Users** (IP not in device scope, but allowed for unauthenticated):
```json
{
  "selfServiceEnabled": true,
  "registrationEnabled": false,
  "groupTypesEnabled": true,
  "subtitleEnabled": false,
  "subtitleText": null
}
```

**For Authenticated Users** (IP not in device scope and not allowed for unauthenticated):
```json
{
  "selfServiceEnabled": false,
  "registrationEnabled": false,
  "groupTypesEnabled": true,
  "subtitleEnabled": false,
  "subtitleText": null
}
```

**For Unauthenticated Users** (allowed IP addresses only):
```json
{
  "selfServiceEnabled": true,
  "registrationEnabled": false,
  "groupTypesEnabled": true,
  "subtitleEnabled": false,
  "subtitleText": null
}
```

**For Unauthenticated Users** (blocked IP addresses):
```json
{
  "selfServiceEnabled": false,
  "registrationEnabled": false,
  "groupTypesEnabled": true,
  "subtitleEnabled": false,
  "subtitleText": null
}
```

#### When Self-Service is Disabled

**For All Users** (authenticated and unauthenticated):
```json
{
  "selfServiceEnabled": false,
  "registrationEnabled": false,
  "groupTypesEnabled": true,
  "subtitleEnabled": false,
  "subtitleText": null
}
```

**For Unauthenticated API Endpoints** (when disabled):
```json
{
  "error": "Forbidden: Self-service functionality is disabled"
}
```

### Refresh Dialog Integration
The feature includes automatic refresh prompts for critical settings:
- **Remove Self-Service Page**: Requires refresh for menu updates
- **Enable Group Types**: Requires refresh for UI component updates
- **Enable Self-Service Multi Select**: Requires refresh for interface updates

## Section Navigation

### Features Documentation
- [📋 Features Overview](./) - Section index and overview
- [🔐 Two-Factor Authentication Guide](./TWO_FACTOR_AUTHENTICATION_GUIDE.md) - 2FA setup and usage
- [📊 Account Activity Dashboard](./ACCOUNT_ACTIVITY_DASHBOARD.md) - User activity monitoring
- [📱 MAC Address Tracking](./MAC_ADDRESS_TRACKING.md) - Device tracking and management
- [🔓 MAC Randomization Guide](./MAC_RANDOMIZATION_GUIDE.md) - Privacy MAC detection and handling
- [🔧 Password Management](./PASSWORD_MANAGEMENT.md) - Password policies and management
- [🔗 Network Group Validation](./NETWORK_GROUP_VALIDATION.md) - Network group safety checks
- [📋 Single/Multi Select Feature](./SINGLE_SELECT_MULTI_SELECT_FEATURE.md) - Group assignment options
- [🔓 Unmanaged Groups Feature](./UNMANAGED_GROUPS_FEATURE.md) - Group access restrictions

---

## Related Documentation

- [📚 Documentation Home](../DOCUMENTATION_INDEX.md) - Main documentation index
- [🚀 Getting Started](../SETUP/INSTALLATION_GUIDE.md) - Installation and setup
- [🔧 Configuration](../CONFIGURATION/) - System configuration
- [🔧 API Reference](../api/api_docs/API_Index.md) - API documentation

---

## Getting Help

- [📋 Documentation Index](../DOCUMENTATION_INDEX.md) - Complete documentation overview
- [📁 Features Section](./) - Section-specific help
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - Report feature problems

---

## 📚 Related Documentation

- [API Documentation](../api/api_docs/03_settings_endpoints.md) - Global settings API endpoints
- [NGINX Proxy Settings](../CONFIGURATION/NGINX-PROXY-SETTINGS.md) - Deployment security considerations
- [Single/Multi Select Feature](./SINGLE_SELECT_MULTI_SELECT_FEATURE.md) - Group type functionality
- [README.md](../../README.md) - Main project documentation
