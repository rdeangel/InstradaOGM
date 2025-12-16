# Additional Settings Endpoints Documentation

[⬆️ Back to API Index](API_Index.md) | [📚 Back to Documentation Home](../../DOCUMENTATION_INDEX.md)

## Table of Contents

1. [Overview](#overview)
2. [Authentication & Authorization](#authentication--authorization)
3. [Endpoints](#endpoints)
   - [GET /api/settings/analytics-enabled](#get-apisettingsanalytics-enabled)
   - [GET /api/settings/backup/versions](#get-apisettingsbackupversions)
4. [Error Handling](#error-handling)
5. [Rate Limiting](#rate-limiting)
6. [Security Considerations](#security-considerations)

## Overview

The additional settings endpoints provide access to system configuration settings and backup version information. These endpoints are primarily used by administrative interfaces to retrieve system status and configuration information.

## Authentication & Authorization

### Authentication Requirements
All endpoints in this category require authentication:
- **Session-based authentication**: Valid user session cookie
- **API Key authentication**: Valid API key in `Authorization: Bearer <key>` header
- **JWT authentication**: Valid JWT token in `Authorization: Bearer <token>` header

### Authorization Requirements
- **Minimum role**: User (most endpoints)
- **Admin role**: Required for backup version access
- **System permissions**: May require specific system configuration permissions

## Endpoints

### GET /api/settings/analytics-enabled

Retrieves the current analytics enabled status for the system.

#### Endpoint Details
- **URL**: `/api/settings/analytics-enabled`
- **Method**: `GET`
- **Content-Type**: `application/json`
- **Authentication**: Required
- **Rate Limiting**: 60 requests per minute per user

#### Request Parameters
No parameters required.

#### Request Example
```bash
# Using curl with session cookie
curl -X GET "https://api.example.com/api/settings/analytics-enabled" \
  -H "Content-Type: application/json" \
  --cookie "session_cookie=..."

# Using curl with API key
curl -X GET "https://api.example.com/api/settings/analytics-enabled" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key"
```

#### Response Examples

**Success Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "analyticsEnabled": true
  },
  "message": "Analytics status retrieved successfully"
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
  "message": "You don't have permission to access analytics settings"
}
```

*500 Internal Server Error*
```json
{
  "success": false,
  "error": "Internal server error",
  "message": "Failed to retrieve analytics status"
}
```

#### Role-Based Access Control
- **Guest**: No access
- **User**: Read access
- **Admin**: Read access
- **System Admin**: Read access

#### Security Considerations
- This endpoint only returns a boolean status and does not expose sensitive configuration details
- Analytics status is considered non-sensitive public information within the system
- No additional security headers required beyond standard authentication

---

### GET /api/settings/backup/versions

Retrieves available backup versions for system restore operations.

#### Endpoint Details
- **URL**: `/api/settings/backup/versions`
- **Method**: `GET`
- **Content-Type**: `application/json`
- **Authentication**: Required
- **Rate Limiting**: 30 requests per minute per user

#### Request Parameters
No parameters required.

#### Request Example
```bash
# Using curl with session cookie
curl -X GET "https://api.example.com/api/settings/backup/versions" \
  -H "Content-Type: application/json" \
  --cookie "session_cookie=..."

# Using curl with API key
curl -X GET "https://api.example.com/api/settings/backup/versions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key"
```

#### Response Examples

**Success Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "versions": [
      {
        "id": "backup_20231115_120000",
        "timestamp": "2023-11-15T12:00:00Z",
        "size": 1048576,
        "type": "full",
        "description": "Scheduled daily backup",
        "checksum": "sha256:a1b2c3d4e5f6...",
        "encrypted": true
      },
      {
        "id": "backup_20231114_120000",
        "timestamp": "2023-11-14T12:00:00Z",
        "size": 983040,
        "type": "incremental",
        "description": "Scheduled daily backup",
        "checksum": "sha256:f6e5d4c3b2a1...",
        "encrypted": true
      }
    ],
    "totalVersions": 2,
    "retentionDays": 30
  },
  "message": "Backup versions retrieved successfully"
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
  "message": "Admin privileges required to access backup versions"
}
```

*500 Internal Server Error*
```json
{
  "success": false,
  "error": "Internal server error",
  "message": "Failed to retrieve backup versions"
}
```

#### Role-Based Access Control
- **Guest**: No access
- **User**: No access
- **Admin**: Read access
- **System Admin**: Read access

#### Security Considerations
- Backup version information may expose system metadata and should be protected
- Checksums are provided to verify backup integrity
- Backup sizes and timestamps could potentially reveal system usage patterns
- Consider additional audit logging for access to backup information
- Ensure backup storage is properly encrypted at rest

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
- `GET /api/settings/analytics-enabled`: 60 requests/minute
- `GET /api/settings/backup/versions`: 30 requests/minute

## Security Considerations

### General Security Measures
1. **Authentication**: All endpoints require valid authentication
2. **Authorization**: Role-based access control enforced
3. **Input Validation**: All inputs validated and sanitized
4. **Audit Logging**: All access logged for security monitoring
5. **Rate Limiting**: Protection against abuse and DoS attacks

### Data Protection
1. **Sensitive Data**: Backup information considered sensitive
2. **Encryption**: Backup data encrypted at rest
3. **Access Control**: Strict access controls for backup operations
4. **Audit Trail**: Complete audit trail for backup access

### Best Practices
1. **Regular Review**: Periodically review access logs
2. **Principle of Least Privilege**: Users only get necessary access
3. **Secure Storage**: Ensure backup storage is secure
4. **Monitoring**: Monitor for unusual access patterns
5. **Documentation**: Keep security documentation up to date

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