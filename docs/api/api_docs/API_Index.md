
# InstradaOGM - API Documentation Index

[⬆️ Back to Documentation Home](../../DOCUMENTATION_INDEX.md)

## Variables

Replace the following variables in the examples below:

- `{{SERVER_URL}}` - Your server URL (e.g., `https://instrada-ogm.example.com`)
- `{{API_KEY}}` - Your API key for authentication

**Example:**
```bash
# Set variables
SERVER_URL="https://instrada-ogm.example.com"
API_KEY="your-api-key-here"

# Use in curl commands
curl -X GET "${SERVER_URL}/api/endpoint" \
  -H "Authorization: Bearer ${API_KEY}"
```

## Introduction

This document serves as the **primary navigation hub** for the InstradaOGM API ecosystem. It provides a comprehensive overview of all available endpoints, authentication patterns, and system capabilities, with detailed implementation examples available in specialized documentation files.

**🎯 Purpose**: Use this file to quickly discover available endpoints, understand authentication requirements, and navigate to detailed documentation for specific API functionality.

**📚 For detailed endpoint documentation** with comprehensive examples, error handling, and use cases, please refer to the individual API documentation files linked in the Quick Reference Guide section below.

## Documentation Structure & Usage

| File | Description | Key Endpoints |
|------|-------------|---------------|
| [01_public_endpoints.md](01_public_endpoints.md) | Public/unauthenticated endpoints | IP detection, self-service operations, password reset |
| [02_authentication_endpoints.md](02_authentication_endpoints.md) | Authentication and session management | 2FA setup/management, auth status, activity tracking |
| [03_settings_endpoints.md](03_settings_endpoints.md) | Global settings and configuration | System settings, group filters, UI configuration |
| [04_admin_endpoints.md](04_admin_endpoints.md) | Administrative operations | User management, audit logs, system monitoring |
| [05_account_endpoints.md](05_account_endpoints.md) | User account and API key management | Profile management, API key lifecycle, usage statistics |
| [06_user_endpoints.md](06_user_endpoints.md) | User-specific device and group access | Device permissions, group filters, user profile |
| [07_opnsense_endpoints.md](07_opnsense_endpoints.md) | OPNsense integration endpoints | Host aliases, network groups, VPN mappings |
| [08_host_group_management_endpoints.md](08_host_group_management_endpoints.md) | Device group assignment operations | Self-service group management, IP validation |
| [09_utility_endpoints.md](09_utility_endpoints.md) | System utilities and testing | Rate limit testing, system diagnostics |
| [10_vpn_endpoints.md](10_vpn_endpoints.md) | VPN status and management | Connection states, service control, public status |
| [11_analytics_endpoints.md](11_analytics_endpoints.md) | Analytics and audit logs | Activity tracking, usage statistics |
| [12_self_service_group_types.md](12_self_service_group_types.md) | Self-service group type management | Group type validation, multi-select support |
| [13_mac_tracking_endpoints.md](13_mac_tracking_endpoints.md) | MAC address tracking | Device tracking, MAC randomization detection |
| [14_unmanaged_groups_endpoints.md](14_unmanaged_groups_endpoints.md) | Unmanaged group filtering | Group filtering, access control |
| [15_host_alias_last_operation_endpoint.md](15_host_alias_last_operation_endpoint.md) | Host alias operation history | Last operation tracking, audit trail |
| [16_network_group_host_aliases_endpoint.md](16_network_group_host_aliases_endpoint.md) | Network group host aliases | ARP status, connectivity validation |
| [17_mac_exclusion_endpoints.md](17_mac_exclusion_endpoints.md) | MAC exclusion management | Exclusion policies, device filtering |
| [18_2fa_management_endpoints.md](18_2fa_management_endpoints.md) | Two-factor authentication | TOTP setup, backup codes, verification |
| [19_admin_analytics_endpoints.md](19_admin_analytics_endpoints.md) | Administrative analytics | System-wide usage, performance metrics |
| [20_account_analytics_endpoints.md](20_account_analytics_endpoints.md) | User account analytics | Personal usage statistics, activity tracking |
| [21_mac_tracking_analytics_endpoints.md](21_mac_tracking_analytics_endpoints.md) | MAC tracking analytics | Device discovery metrics, exclusion analytics |
| [22_api_key_analytics_endpoints.md](22_api_key_analytics_endpoints.md) | API key analytics | API usage tracking, key performance metrics |
| [23_system_services_endpoints.md](23_system_services_endpoints.md) | System services management | Service status, control operations |
| [24_ui_configuration_endpoints.md](24_ui_configuration_endpoints.md) | UI configuration | Interface settings, customization options |
| [25_audit_log_management_endpoints.md](25_audit_log_management_endpoints.md) | Audit log management | Log retention, export, filtering |
| [26_vpn_service_control_endpoints.md](26_vpn_service_control_endpoints.md) | VPN service control | Service management, configuration |
| [27_opnsense_advanced_endpoints.md](27_opnsense_advanced_endpoints.md) | Advanced OPNsense integration | Advanced firewall rules, traffic shaping |
| [28_additional_settings_endpoints.md](28_additional_settings_endpoints.md) | Additional settings | Extended configuration options |
| [29_self_service_additional_endpoints.md](29_self_service_additional_endpoints.md) | Extended self-service | Additional self-service operations |
| [30_backup_endpoints.md](30_backup_endpoints.md) | Backup API and script usage | Complete backup creation and download workflows |
| [31_update_endpoints.md](31_update_endpoints.md) | Update detection and management | Check for updates, release notes |
| [32_schedule_endpoints.md](32_schedule_endpoints.md) | Schedule system endpoints | List, create, toggle, and view executions |

### 🚀 Enhanced Features Overview
- **Complete Endpoint Coverage**: 100+ endpoints across 9 major categories
- **Context-Aware Endpoints**: Dynamic responses based on authentication status
- **Comprehensive 2FA Management**: Full two-factor authentication lifecycle
- **Self-Service Operations**: Unauthenticated operations with IP validation
- **Standardized Role Access**: Consistent permission patterns across all endpoints
- **Real Response Examples**: Verified against actual API responses
- **Advanced Analytics**: Usage tracking, audit logs, and system monitoring

### 📚 Documentation Organization
- **Master Overview**: This file provides system-wide navigation and cross-references
- **Specialized Files**: Individual files contain detailed implementation examples
- **Use Case Specific**: Each specialized file covers comprehensive scenarios
- **Authentication Patterns**: Clear distinction between access methods
- **Error Handling**: Consistent patterns with detailed troubleshooting guides

### 🔧 Key Development Patterns
- **Authentication Methods**: Session-based, API key, and context-aware authentication
- **IP Validation**: Self-service operations with network restrictions
- **Error Handling**: Consistent JSON format with appropriate HTTP status codes
- **Rate Limiting**: Comprehensive API key management with configurable windows
- **Audit Logging**: Complete security monitoring and compliance tracking

### 📖 How to Use This Documentation
1. **Quick Reference**: Use the Table of Contents to find endpoint categories
2. **Implementation Details**: Follow links to specialized files for comprehensive examples
3. **Error Handling**: Refer to individual files for specific error scenarios
4. **Integration Guide**: Follow authentication and error handling patterns
5. **Cross-References**: Use the relationship mappings to understand endpoint interactions

## Authentication Methods

The API supports multiple authentication methods with different capabilities and security levels:

### 1. Session Authentication (Web UI)
Uses cookies from a logged-in session for browser-based access:
```bash
-H "Cookie: next-auth.session-token=${SESSION_TOKEN}"
```

**Features:**
- Full user session with role-based permissions
- Automatic session management
- Secure cookie-based authentication
- Ideal for web interface interactions

### 2. API Key Authentication (Automation/CLI)
Uses Bearer token or X-API-Key header for programmatic access:

#### Standard API Keys
```bash
-H "Authorization: Bearer ${API_KEY}"
# OR
-H "X-API-Key: ${API_KEY}"
```

**Features:**
- Named API keys with expiration dates
- Configurable rate limiting (hourly, daily, monthly, burst)
- User-specific permissions and access control
- Audit logging with API key identification
- Revocable and manageable through web interface

#### API Key Types and Capabilities

**User API Keys:**
- **Owner**: Regular users can create their own API keys
- **Permissions**: Inherit user's role permissions (USER, ADMIN, SUPER_ADMIN)
- **Rate Limiting**: Configurable per key with individual limits
- **Expiration**: Optional expiration date
- **Scope**: Limited to user's own permissions and accessible resources

**Admin API Keys:**
- **Owner**: ADMIN users can create admin API keys
- **Permissions**: Full administrative access based on user role
- **Rate Limiting**: Configurable per key with individual limits
- **Expiration**: Configurable expiration for security
- **Scope**: Full system access within role constraints

**System API Keys:**
- **Owner**: SUPER_ADMIN only
- **Permissions**: Complete system access
- **Rate Limiting**: Configurable per key with individual limits
- **Expiration**: Long-term or permanent keys available
- **Scope**: Unrestricted access to all endpoints and resources

### 3. Public/Unauthenticated Access
Some endpoints are available without authentication for self-service functionality and public access:

**Self-Service Endpoints:**
- IP information lookup
- Host alias management (with IP restrictions)
- Group membership checking
- DHCP reservation status

**Security Features:**
- IP-based access control
- Allowed networks validation
- Rate limiting for abuse prevention
- Comprehensive audit logging

### 4. Self-Service Access Control for Authenticated Users

For authenticated users accessing self-service functionality, a **three-tier access control system** ensures users can only manage devices within their authorized scope:

**Access Control Logic:**
1. **Global Setting Check**: `removeSelfServicePage` setting must be disabled
2. **Device Management Scope Check**: User's current IP must be in their permitted devices list
3. **Fallback Check**: If device scope fails, checks if IP would be allowed for unauthenticated users

**Security Benefits:**
- **Enhanced Security**: Users can only access self-service for devices they can manage
- **Authentication Never Reduces Access**: Authenticated users get at least the same access as unauthenticated users
- **IP-Based Validation**: Ensures users are operating from authorized locations
- **Fallback Protection**: Prevents authentication from blocking legitimate access

## Endpoint Categories Summary

### Base URL
```
${SERVER_URL}/api
```

**Common Variables:**
- `${SERVER_URL}`: Your server URL (e.g., `https://instrada-ogm.example.com`)
- `${API_KEY}`: Your API key for authenticated requests
- `${SESSION_TOKEN}`: Your session token for browser-based authentication

### 🎯 Key Enhancement Highlights

- **Self-Service Operations**: Detailed coverage of unauthenticated user operations with IP validation
- **Error Scenarios**: 100+ specific error cases with exact HTTP status codes and messages
- **Authentication Patterns**: Session vs API key authentication with role-based access control
- **Standardized Role Access Format**: All endpoint documentation follows consistent permission requirements
- **Rate Limiting**: Comprehensive rate limit handling and testing scenarios
- **Security Validation**: IP-based access control, network restrictions, and audit logging

### 💡 Usage Recommendation

1. **🔍 Quick Reference**: Use this master file for endpoint discovery and basic usage
2. **📋 Implementation Details**: Refer to individual breakdown files for comprehensive examples
3. **🚨 Error Handling**: Check breakdown files for specific error scenarios and troubleshooting
4. **🧪 Testing**: Use the detailed examples in breakdown files for API testing and validation

## Cross-Endpoint Relationships

### Authentication Flow Dependencies
```
Public Endpoints → Authentication Endpoints → Account/User Endpoints → Admin/OPNsense Endpoints
```

### Common Usage Patterns

#### Self-Service Workflow
1. **IP Detection** (`/api/ip`) → Identify client device
2. **Host Alias Lookup** (`/api/opnsense/aliases`) → Find device configuration
3. **Group Management** (`/api/opnsense/host-group-management`) → Assign to network groups
4. **Status Verification** (`/api/opnsense/ip-group-membership`) → Confirm changes

#### Administrative Workflow
1. **System Status** (`/api/admin/system-summary`) → Overview of system state
2. **User Management** (`/api/admin/users`) → Manage user accounts
3. **Group Configuration** (`/api/admin/groups`) → Configure access groups
4. **Audit Monitoring** (`/api/admin/monitoring-analytics`) → Track changes

#### API Key Management Workflow
1. **Key Creation** (`/api/account/api-keys`) → Generate new API key
2. **Usage Monitoring** (`/api/account/api-keys/usage/summary`) → Track usage patterns
3. **Rate Limit Testing** (`/api/test-rate-limit`) → Validate configuration
4. **Key Rotation** (`/api/account/api-keys/{id}`) → Update or revoke keys

### Data Flow Patterns

#### Context-Aware Endpoints
Several endpoints return different data based on authentication status:
- **VPN Status**: Public users get basic status, authenticated users get full details
- **UI Configuration**: Unauthenticated users get generic labels, authenticated users get custom configuration
- **Group Membership**: Different permission levels based on user role and authentication

#### Self-Service Security Chain
```
IP Validation → Network Restrictions → Group Management Status → Operation Execution
```

## Error Handling Patterns

### Common HTTP Status Codes

| Status Code | Description | Common Scenarios |
|-------------|-------------|------------------|
| **200 OK** | Successful request | Data retrieved, operation completed |
| **400 Bad Request** | Invalid request parameters | Missing fields, invalid format, validation errors |
| **401 Unauthorized** | Authentication required or failed | Missing/invalid credentials, expired sessions |
| **403 Forbidden** | Access denied | Insufficient permissions, IP restrictions |
| **404 Not Found** | Resource not found | Invalid endpoints, missing resources |
| **429 Too Many Requests** | Rate limit exceeded | API key rate limits, abuse prevention |
| **500 Internal Server Error** | Server-side error | Database errors, OPNsense API failures |

### Standard Error Response Format

All API endpoints return errors in a consistent JSON format:

```json
{
  "error": "Descriptive error message",
  "message": "Alternative error message format"
}
```

### Self-Service Error Patterns

For unauthenticated self-service operations:
```json
{
  "error": "Forbidden: Unauthenticated users can only operate on their own IP address"
}
```

### Rate Limiting Error Format

API key rate limit exceeded responses include detailed information:
```json
{
  "message": "Rate limit exceeded",
  "rateLimitInfo": {
    "allowed": false,
    "limit": 100,
    "remaining": 0,
    "resetTime": 1640995200000,
    "windowType": "hourly"
  }
}
```

## Summary Statistics

### API Coverage
- **Total Endpoints**: 100+ documented endpoints
- **Authentication Methods**: 4 distinct approaches (Session, API Key, Public, Context-Aware)
- **User Roles**: 3 permission levels (USER, ADMIN, SUPER_ADMIN)
- **Documentation Files**: 30 specialized files with detailed examples
- **Error Scenarios**: 100+ documented error cases
- **Security Features**: 8 major security mechanisms

### System Capabilities
- **Self-Service Operations**: Complete unauthenticated workflow support
- **Administrative Functions**: Full user and system management
- **Integration Support**: Comprehensive OPNsense firewall integration
- **Analytics & Monitoring**: Advanced usage tracking and audit capabilities
- **Device Management**: MAC address tracking and exclusion management
- **VPN Management**: Complete VPN service lifecycle control
- **API Key Management**: Full lifecycle with usage analytics

---

## API Navigation

### API Documentation
- [🔍 API Index](API_Index.md) - Complete API endpoint index
- [🔑 Authentication](02_authentication_endpoints.md) - Authentication methods
- [💾 Backup API Reference](30_backup_endpoints.md) - Complete backup API endpoints and examples

### Related API Categories
- [🌐 Public Endpoints](01_public_endpoints.md) - Unauthenticated access points
- [👤 User Management](05_account_endpoints.md) - User account APIs
- [👨‍💼 Admin Functions](04_admin_endpoints.md) - Administrative APIs
- [🔒 VPN Management](10_vpn_endpoints.md) - VPN service control
- [📊 Analytics](11_analytics_endpoints.md) - Usage analytics and reporting
- [🔄 Update Management](31_update_endpoints.md) - System update checking

---

## Related Documentation

- [📚 Documentation Home](../../DOCUMENTATION_INDEX.md) - Main documentation index
- [🚀 Getting Started](../../SETUP/INSTALLATION_GUIDE.md) - Installation and setup
- [🔧 Configuration](../../CONFIGURATION/) - System configuration
- [💾 Backup Management Guide](../../FEATURES/BACKUP_MANAGEMENT.md) - Backup feature guide and automation

---

## Getting Help

- [📋 Documentation Index](../../DOCUMENTATION_INDEX.md) - Complete documentation overview
- [🔍 API Index](API_Index.md) - Complete API reference
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - Report API issues

---

**Last Updated**: 2025-11-06 | **API Version**: 1.0 | **Documentation Version**: 2.0 | **Category**: API Documentation

For detailed implementation examples, comprehensive error handling, and specific use cases, please refer to the individual API documentation files listed in the Quick Reference Guide section.