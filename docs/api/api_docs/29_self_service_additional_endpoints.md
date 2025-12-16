# Self-Service Additional Endpoints Documentation

[⬆️ Back to API Index](API_Index.md) | [📚 Back to Documentation Home](../../DOCUMENTATION_INDEX.md)

## Table of Contents

1. [Overview](#overview)
2. [Authentication & Authorization](#authentication--authorization)
3. [Endpoints](#endpoints)
   - [GET /api/self-service/check-unmanaged-groups](#get-apiself-servicecheck-unmanaged-groups)
4. [Error Handling](#error-handling)
5. [Rate Limiting](#rate-limiting)
6. [Security Considerations](#security-considerations)

## Overview

The additional self-service endpoints provide functionality for checking unmanaged groups status within the self-service portal. These endpoints are designed to allow users to verify group management status and determine which groups are available for self-service operations.

## Authentication & Authorization

### Authentication Requirements
All endpoints in this category require authentication:
- **Session-based authentication**: Valid user session cookie
- **API Key authentication**: Valid API key in `Authorization: Bearer <key>` header
- **JWT authentication**: Valid JWT token in `Authorization: Bearer <token>` header

### Authorization Requirements
- **Minimum role**: User
- **Self-service permissions**: May require specific self-service permissions
- **Group membership**: Access may be limited based on group membership

## Endpoints

### GET /api/self-service/check-unmanaged-groups

Checks for unmanaged groups that are available for self-service operations. This endpoint allows users to determine which groups they can manage through the self-service portal.

#### Endpoint Details
- **URL**: `/api/self-service/check-unmanaged-groups`
- **Method**: `GET`
- **Content-Type**: `application/json`
- **Authentication**: Required
- **Rate Limiting**: 60 requests per minute per user

#### Request Parameters
No parameters required.

#### Request Example
```bash
# Using curl with session cookie
curl -X GET "https://api.example.com/api/self-service/check-unmanaged-groups" \
  -H "Content-Type: application/json" \
  --cookie "session_cookie=..."

# Using curl with API key
curl -X GET "https://api.example.com/api/self-service/check-unmanaged-groups" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key"
```

#### Response Examples

**Success Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "unmanagedGroups": [
      {
        "id": "group_123",
        "name": "Development Team",
        "description": "Development team group for self-service management",
        "memberCount": 15,
        "selfServiceEnabled": true,
        "allowedOperations": [
          "add_members",
          "remove_members",
          "update_description"
        ],
        "lastChecked": "2023-11-15T10:30:00Z",
        "managedBy": "self_service"
      },
      {
        "id": "group_456",
        "name": "Marketing Department",
        "description": "Marketing department group",
        "memberCount": 8,
        "selfServiceEnabled": true,
        "allowedOperations": [
          "add_members",
          "remove_members"
        ],
        "lastChecked": "2023-11-15T10:30:00Z",
        "managedBy": "self_service"
      }
    ],
    "totalGroups": 2,
    "selfServiceEnabled": true,
    "lastSyncTime": "2023-11-15T10:30:00Z"
  },
  "message": "Unmanaged groups retrieved successfully"
}
```

**Empty Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "unmanagedGroups": [],
    "totalGroups": 0,
    "selfServiceEnabled": true,
    "lastSyncTime": "2023-11-15T10:30:00Z"
  },
  "message": "No unmanaged groups available for self-service"
}
```

**Self-Service Disabled Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "unmanagedGroups": [],
    "totalGroups": 0,
    "selfServiceEnabled": false,
    "lastSyncTime": "2023-11-15T10:30:00Z",
    "disabledReason": "Self-service functionality is disabled by administrator"
  },
  "message": "Self-service is currently disabled"
}
```

**Error Responses**

*401 Unauthorized*
```json
{
  "success": false,
  "error": "Authentication required",
  "message": "You must be authenticated to access this endpoint"
}
```

*403 Forbidden*
```json
{
  "success": false,
  "error": "Insufficient permissions",
  "message": "You don't have permission to access self-service features"
}
```

*429 Too Many Requests*
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please try again later."
}
```

*500 Internal Server Error*
```json
{
  "success": false,
  "error": "Internal server error",
  "message": "Failed to retrieve unmanaged groups"
}
```

#### Role-Based Access Control
- **Guest**: No access
- **User**: Read access to groups they are members of
- **Admin**: Read access to all unmanaged groups
- **System Admin**: Read access to all unmanaged groups

#### Security Considerations
- Only returns groups that the user has permission to manage
- Sensitive group information is filtered based on user permissions
- Member counts may be rounded or obscured for privacy in some configurations
- Operation permissions are explicitly listed to prevent privilege escalation
- Consider caching this data to reduce database load for frequent checks

#### Response Data Fields

**Group Object Fields**
- `id`: Unique identifier for the group
- `name`: Human-readable group name
- `description`: Group description (may be sanitized)
- `memberCount`: Number of members in the group
- `selfServiceEnabled`: Whether self-service is enabled for this group
- `allowedOperations`: Array of operations the user can perform
- `lastChecked`: Timestamp when group status was last verified
- `managedBy`: System managing the group (e.g., "self_service", "admin")

**Allowed Operations Values**
- `add_members`: Add new members to the group
- `remove_members`: Remove existing members from the group
- `update_description`: Update group description
- `delete_group`: Delete the entire group (admin only)
- `transfer_ownership`: Transfer group ownership (admin only)

## Error Handling

### Standard Error Response Format
All endpoints return errors in a consistent format:
```json
{
  "success": false,
  "error": "Error type",
  "message": "Human-readable error message",
  "details": {
    "field": "Additional error details (optional)"
  }
}
```

### Common HTTP Status Codes
- `200 OK`: Request successful
- `400 Bad Request`: Invalid request parameters
- `401 Unauthorized`: Authentication required or failed
- `403 Forbidden`: Insufficient permissions
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server-side error

### Specific Error Scenarios

**Self-Service Disabled**
When self-service functionality is disabled system-wide:
```json
{
  "success": false,
  "error": "Feature disabled",
  "message": "Self-service functionality is currently disabled",
  "details": {
    "disabledBy": "administrator",
    "disabledAt": "2023-11-10T15:30:00Z",
    "reason": "System maintenance"
  }
}
```

**Group Access Denied**
When user doesn't have permission to access specific groups:
```json
{
  "success": false,
  "error": "Access denied",
  "message": "You don't have permission to manage the requested groups",
  "details": {
    "requiredPermission": "group_management",
    "currentPermissions": ["group_view"]
  }
}
```

## Rate Limiting

### Rate Limiting Strategy
- **Per-user rate limiting**: Limits are applied per authenticated user
- **Endpoint-specific limits**: Different endpoints have different rate limits
- **Burst allowance**: Short bursts allowed within limits
- **Progressive backoff**: Exponential backoff for repeated violations

### Rate Limit Headers
Rate limit information is included in response headers:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 1699489200
```

### Rate Limits by Endpoint
- `GET /api/self-service/check-unmanaged-groups`: 60 requests/minute

### Rate Limiting Best Practices
1. **Client-side Caching**: Cache responses for reasonable periods
2. **Batch Operations**: Use batch endpoints when available
3. **Exponential Backoff**: Implement backoff on rate limit errors
4. **Respect Headers**: Honor rate limit headers in responses

## Security Considerations

### General Security Measures
1. **Authentication**: All endpoints require valid authentication
2. **Authorization**: Role-based access control enforced
3. **Input Validation**: All inputs validated and sanitized
4. **Audit Logging**: All access logged for security monitoring
5. **Rate Limiting**: Protection against abuse and DoS attacks

### Data Protection
1. **Group Privacy**: Only return groups user has permission to access
2. **Member Privacy**: Member counts may be obscured for privacy
3. **Operation Filtering**: Only show operations user can perform
4. **Audit Trail**: Complete audit trail for all self-service operations

### Access Control
1. **Permission Verification**: Verify permissions before returning data
2. **Group Membership**: Check user's relationship to groups
3. **Operation Restrictions**: Restrict operations based on user role
4. **Administrative Override**: Admins can override some restrictions

### Best Practices
1. **Regular Review**: Periodically review access logs
2. **Principle of Least Privilege**: Users only get necessary access
3. **Secure Caching**: Cache sensitive data appropriately
4. **Monitoring**: Monitor for unusual access patterns
5. **Documentation**: Keep security documentation up to date

### Implementation Considerations
1. **Performance**: Consider caching for frequently accessed data
2. **Scalability**: Design for large numbers of groups and users
3. **Consistency**: Ensure data consistency across distributed systems
4. **Error Handling**: Provide meaningful error messages without exposing sensitive information
5. **Testing**: Regular security testing of access controls

---

## API Navigation

### API Documentation
- [🔍 API Index](API_Index.md) - Complete API endpoint index
- [🔑 Authentication](02_authentication_endpoints.md) - Authentication methods

### Related API Categories
- [🔗 Public Endpoints](01_public_endpoints.md) - Public API endpoints
- [👤 User Management](05_account_endpoints.md) - User account APIs
- [👨‍💼 Admin Functions](04_admin_endpoints.md) - Administrative APIs
- [🔧 Settings Endpoints](03_settings_endpoints.md) - Settings management APIs

---

## Related Documentation

- [📚 Documentation Home](../../DOCUMENTATION_INDEX.md) - Main documentation index
- [🚀 Getting Started](../../SETUP/INSTALLATION_GUIDE.md) - Installation and setup
- [🔧 Configuration](../../CONFIGURATION/) - System configuration

---

## Getting Help

- [📋 Documentation Index](../../DOCUMENTATION_INDEX.md) - Complete documentation overview
- [🔍 API Index](API_Index.md) - Complete API reference
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - Report API issues

---

**Last Updated**: 2025-11-06 | **API Version**: v1.0.0 | **Category**: API Documentation