# UI Configuration Endpoints

[⬆️ Back to API Index](API_Index.md) | [📚 Back to Documentation Home](../../DOCUMENTATION_INDEX.md)

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
curl -X GET "${SERVER_URL}/api/ui/config" \
  -H "Authorization: Bearer ${API_KEY}"
```

This section covers all UI configuration-related API endpoints for managing interface settings, global settings timestamps, and group configuration timestamps.

## UI Configuration

### GET /api/ui/config

**Description**: Retrieve UI configuration settings for the authenticated user. This endpoint provides all necessary configuration data for the frontend interface, including theme settings, feature flags, navigation structure, and user preferences.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can access UI configuration
- **ADMIN**: ✅ Can access UI configuration
- **SUPER_ADMIN**: ✅ Can access UI configuration

#### Usage Case 1: Successful UI Configuration Retrieval

**Scenario**: User loads the application and needs UI configuration

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/ui/config" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "theme": {
    "mode": "light",
    "primaryColor": "#1976d2",
    "secondaryColor": "#dc004e",
    "customCSS": ".custom-button { border-radius: 8px; }",
    "fontFamily": "Roboto, sans-serif",
    "fontSize": "medium"
  },
  "features": {
    "darkMode": true,
    "notifications": true,
    "analytics": true,
    "betaFeatures": false,
    "advancedSettings": true,
    "exportData": true,
    "apiAccess": true
  },
  "navigation": {
    "header": [
      {
        "id": "dashboard",
        "label": "Dashboard",
        "icon": "dashboard",
        "path": "/dashboard",
        "order": 1
      },
      {
        "id": "users",
        "label": "Users",
        "icon": "people",
        "path": "/users",
        "order": 2,
        "roles": ["ADMIN", "SUPER_ADMIN"]
      }
    ],
    "sidebar": [
      {
        "id": "profile",
        "label": "Profile",
        "icon": "person",
        "path": "/profile",
        "order": 1
      }
    ]
  },
  "userPreferences": {
    "language": "en",
    "timezone": "UTC",
    "dateFormat": "MM/DD/YYYY",
    "timeFormat": "12h",
    "defaultPage": "/dashboard",
    "itemsPerPage": 25,
    "autoRefresh": true,
    "refreshInterval": 30
  },
  "system": {
    "version": "1.2.3",
    "environment": "production",
    "maintenanceMode": false,
    "announcement": {
      "enabled": true,
      "message": "System maintenance scheduled for this weekend",
      "type": "info",
      "dismissible": true
    }
  },
  "permissions": {
    "canManageUsers": false,
    "canViewAnalytics": true,
    "canExportData": true,
    "canAccessAPI": true,
    "canManageSettings": false
  },
  "lastModified": "2024-01-01T12:00:00Z",
  "cacheKey": "ui-config-v1-20240101-120000"
}
```

#### Usage Case 2: UI Configuration with Custom Theme

**Scenario**: User has customized their UI theme

**Success Response**:
```json
{
  "theme": {
    "mode": "dark",
    "primaryColor": "#90caf9",
    "secondaryColor": "#f48fb1",
    "customCSS": ".dark-theme { background: #121212; }",
    "fontFamily": "Open Sans, sans-serif",
    "fontSize": "large"
  },
  "userPreferences": {
    "language": "es",
    "timezone": "America/New_York",
    "dateFormat": "DD/MM/YYYY",
    "timeFormat": "24h"
  }
}
```

#### Usage Case 3: Admin UI Configuration

**Scenario**: ADMIN user receives additional configuration options

**Success Response**:
```json
{
  "theme": {
    "mode": "light",
    "primaryColor": "#1976d2"
  },
  "features": {
    "darkMode": true,
    "notifications": true,
    "analytics": true,
    "betaFeatures": true,
    "advancedSettings": true,
    "exportData": true,
    "apiAccess": true,
    "adminPanel": true,
    "userManagement": true,
    "systemSettings": true
  },
  "navigation": {
    "header": [
      {
        "id": "admin",
        "label": "Admin",
        "icon": "admin_panel_settings",
        "path": "/admin",
        "order": 0,
        "roles": ["ADMIN", "SUPER_ADMIN"]
      }
    ]
  },
  "permissions": {
    "canManageUsers": true,
    "canViewAnalytics": true,
    "canExportData": true,
    "canAccessAPI": true,
    "canManageSettings": true,
    "canViewSystemLogs": true,
    "canManagePermissions": false
  }
}
```

#### Usage Case 4: Unauthenticated Request

**Scenario**: Request without valid authentication

**Error Response**:
```json
{
  "error": "Unauthorized: Authentication required to access UI configuration"
}
```

**Query Parameters**:
- `cache` (boolean, optional): Force refresh of cached configuration (default: false)
- `section` (string, optional): Specific configuration section to retrieve (theme, features, navigation)
- `minimal` (boolean, optional): Return minimal configuration for faster loading (default: false)

**Response Fields**:
- `theme`: Theme configuration including colors and styling
- `features`: Feature flags and capabilities
- `navigation`: Navigation structure for header and sidebar
- `userPreferences`: User-specific preferences and settings
- `system`: System-wide configuration and status
- `permissions`: User permissions and access rights
- `lastModified`: When the configuration was last updated
- `cacheKey`: Cache key for client-side caching

## Global Settings Timestamp

### GET /api/user/global-settings-timestamp

**Description**: Retrieve the timestamp of the last modification to global settings. This endpoint helps clients determine if their cached global settings need to be refreshed.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can access global settings timestamp
- **ADMIN**: ✅ Can access global settings timestamp
- **SUPER_ADMIN**: ✅ Can access global settings timestamp

#### Usage Case 1: Successful Global Settings Timestamp Retrieval

**Scenario**: Client checks if global settings have been updated

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/user/global-settings-timestamp" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "unixTimestamp": 1704110400,
  "version": "v1.2.3",
  "lastModifiedBy": "admin-uuid-123",
  "modifiedByRole": "SUPER_ADMIN",
  "changeType": "system_configuration",
  "affectedComponents": [
    "theme",
    "features",
    "navigation"
  ],
  "cacheHeaders": {
    "etag": "\"global-settings-1704110400\"",
    "cacheControl": "public, max-age=300"
  }
}
```

#### Usage Case 2: No Changes Since Last Check

**Scenario**: Client provides If-Modified-Since header

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/user/global-settings-timestamp" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "If-Modified-Since: Mon, 01 Jan 2024 12:00:00 GMT" \
  -H "Content-Type: application/json"
```

**Success Response (304 Not Modified)**:
```json
{
  "status": "not_modified",
  "message": "Global settings have not been modified since the specified time"
}
```

#### Usage Case 3: Unauthenticated Request

**Scenario**: Request without valid authentication

**Error Response**:
```json
{
  "error": "Unauthorized: Authentication required to access global settings timestamp"
}
```

**Query Parameters**:
- `component` (string, optional): Specific component to check (theme, features, navigation)
- `format` (string, optional): Response format (json, iso, unix)

**Response Fields**:
- `timestamp`: ISO 8601 formatted timestamp of last modification
- `unixTimestamp`: Unix timestamp of last modification
- `version`: Version identifier for the settings
- `lastModifiedBy`: ID of who last modified the settings
- `modifiedByRole`: Role of the person who last modified the settings
- `changeType`: Type of change that occurred
- `affectedComponents`: List of components that were affected
- `cacheHeaders`: Caching information for client-side optimization

## Group Timestamps

### GET /api/user/group-timestamps

**Description**: Retrieve timestamps for group-related settings and configurations. This endpoint provides modification timestamps for user groups, permissions, and group-specific settings to help clients manage caching.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can access own group timestamps
- **ADMIN**: ✅ Can access all group timestamps
- **SUPER_ADMIN**: ✅ Can access all group timestamps

#### Usage Case 1: Successful Group Timestamps Retrieval

**Scenario**: User checks for updates to group configurations

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/user/group-timestamps" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "userGroups": [
    {
      "groupId": "group-uuid-123",
      "groupName": "Standard Users",
      "timestamp": "2024-01-01T10:00:00Z",
      "unixTimestamp": 1704103200,
      "lastModifiedBy": "admin-uuid-456",
      "changeType": "membership_update",
      "memberCount": 25
    },
    {
      "groupId": "group-uuid-124",
      "groupName": "VPN Access",
      "timestamp": "2024-01-01T11:30:00Z",
      "unixTimestamp": 1704108600,
      "lastModifiedBy": "admin-uuid-456",
      "changeType": "permission_change",
      "memberCount": 12
    }
  ],
  "globalGroups": {
    "timestamp": "2024-01-01T09:00:00Z",
    "unixTimestamp": 1704099600,
    "totalGroups": 8,
    "lastModifiedBy": "admin-uuid-789",
    "changeType": "group_creation"
  },
  "permissions": {
    "timestamp": "2024-01-01T08:00:00Z",
    "unixTimestamp": 1704096000,
    "lastModifiedBy": "admin-uuid-789",
    "changeType": "permission_update"
  },
  "cacheHeaders": {
    "etag": "\"group-timestamps-1704110400\"",
    "cacheControl": "public, max-age=600"
  }
}
```

#### Usage Case 2: Admin Group Timestamps

**Scenario**: ADMIN user retrieves comprehensive group timestamps

**Success Response**:
```json
{
  "userGroups": [
    {
      "groupId": "group-uuid-123",
      "groupName": "Standard Users",
      "timestamp": "2024-01-01T10:00:00Z",
      "unixTimestamp": 1704103200,
      "lastModifiedBy": "admin-uuid-456",
      "changeType": "membership_update",
      "memberCount": 25,
      "permissions": ["read", "write"]
    }
  ],
  "allGroups": [
    {
      "groupId": "group-uuid-125",
      "groupName": "Administrators",
      "timestamp": "2024-01-01T12:00:00Z",
      "unixTimestamp": 1704110400,
      "lastModifiedBy": "super-admin-uuid-001",
      "changeType": "group_creation",
      "memberCount": 3,
      "permissions": ["read", "write", "admin"]
    }
  ],
  "groupMappings": {
    "timestamp": "2024-01-01T11:00:00Z",
    "unixTimestamp": 1704106400,
    "lastModifiedBy": "admin-uuid-456",
    "changeType": "mapping_update"
  }
}
```

#### Usage Case 3: Specific Group Timestamp

**Scenario**: User checks timestamp for specific group

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/user/group-timestamps?groupId=group-uuid-123" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "group": {
    "groupId": "group-uuid-123",
    "groupName": "Standard Users",
    "timestamp": "2024-01-01T10:00:00Z",
    "unixTimestamp": 1704103200,
    "lastModifiedBy": "admin-uuid-456",
    "changeType": "membership_update",
    "memberCount": 25,
    "permissions": ["read", "write"]
  }
}
```

#### Usage Case 4: Unauthenticated Request

**Scenario**: Request without valid authentication

**Error Response**:
```json
{
  "error": "Unauthorized: Authentication required to access group timestamps"
}
```

**Query Parameters**:
- `groupId` (string, optional): Specific group ID to check
- `includeAll` (boolean, optional): Include all groups (ADMIN/SUPER_ADMIN only)
- `includeMappings` (boolean, optional): Include group mapping timestamps
- `format` (string, optional): Response format (json, iso, unix)

**Response Fields**:
- `userGroups`: Array of user's group timestamps
- `globalGroups`: Global group configuration timestamp
- `allGroups`: All groups (ADMIN/SUPER_ADMIN only)
- `permissions`: Permission configuration timestamp
- `groupMappings`: Group mapping timestamps
- `cacheHeaders`: Caching information for client-side optimization

## Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ✅ Can access own UI configuration and timestamps
- **ADMIN**: ✅ Can access UI configuration and all timestamps
- **SUPER_ADMIN**: ✅ Can access UI configuration and all timestamps

**Role Access:**
- **USER**: ✅ Can access personal UI configuration, global settings timestamp, and own group timestamps
- **ADMIN**: ✅ Can access UI configuration with admin features, all timestamps, and group information
- **SUPER_ADMIN**: ✅ Can access all UI configuration, timestamps, and comprehensive group information

**Example Responses:**

**USER Role Success:**
```json
{
  "theme": {
    "mode": "light",
    "primaryColor": "#1976d2"
  },
  "permissions": {
    "canManageUsers": false,
    "canViewAnalytics": true
  }
}
```

**ADMIN Role Success:**
```json
{
  "theme": {
    "mode": "light",
    "primaryColor": "#1976d2"
  },
  "features": {
    "adminPanel": true,
    "userManagement": true
  },
  "permissions": {
    "canManageUsers": true,
    "canViewAnalytics": true
  }
}
```

**Unauthenticated Failure:**
```json
{
  "error": "Unauthorized: Authentication required to access UI configuration"
}
```

## Rate Limiting

**Rate Limit Strategy:** User-based

**Default Rate Limits:**
- **Public Endpoints**: N/A (all endpoints require authentication)
- **Authenticated Endpoints**: 1000 requests per hour per user
- **API Key Endpoints**: Configurable per key (default: 1000/hour)

**Rate Limit Identification:**
- **Authenticated Endpoints**: Identified by user ID
- **API Key Endpoints**: Identified by API key ID

**Rate Limit Headers:**
All rate limited responses include the following headers:
- `X-RateLimit-Limit`: Maximum requests allowed in the current window
- `X-RateLimit-Remaining`: Remaining requests in the current window
- `X-RateLimit-Reset`: Unix timestamp when the rate limit window resets
- `X-RateLimit-Retry-After`: Seconds until client can retry (only on 429 responses)

**Rate Limit Exceeded Response (429):**
```json
{
  "error": "Rate limit exceeded",
  "rateLimitInfo": {
    "limit": 1000,
    "remaining": 0,
    "resetTime": 1640995200,
    "windowType": "hourly",
    "retryAfter": 3600
  }
}
```

**Endpoint-Specific Rate Limits:**

### UI Configuration Endpoints
- **GET /api/ui/config**: 200 requests per hour per user
  - UI configuration retrieval
  - Window: 1 hour sliding window
  - Supports client-side caching to reduce requests

- **GET /api/user/global-settings-timestamp**: 500 requests per hour per user
  - Timestamp checking for cache invalidation
  - Window: 1 hour sliding window
  - Supports conditional requests with If-Modified-Since

- **GET /api/user/group-timestamps**: 300 requests per hour per user
  - Group timestamp checking for cache invalidation
  - Window: 1 hour sliding window
  - Higher limit for users with many group memberships

**Best Practices for Handling Rate Limits:**

1. **Client-Side Caching**: Implement aggressive caching for UI configuration
   ```javascript
   // Cache UI configuration for 5 minutes
   const cacheConfig = {
     key: 'ui-config',
     ttl: 300000, // 5 minutes
     data: null
   };
   ```

2. **Conditional Requests**: Use conditional requests for timestamp endpoints
   ```javascript
   // Use If-Modified-Since header
   const lastModified = localStorage.getItem('global-settings-timestamp');
   const headers = {};
   if (lastModified) {
     headers['If-Modified-Since'] = new Date(lastModified).toUTCString();
   }
   ```

3. **Batch Timestamp Checks**: Check multiple timestamps in a single request
   ```javascript
   // Check all timestamps at once instead of individual requests
   const response = await fetch('/api/user/group-timestamps?includeAll=true');
   ```

4. **Exponential Backoff**: Implement exponential backoff when receiving 429 responses
   ```javascript
   async function fetchWithRetry(url, options, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       const response = await fetch(url, options);
       
       if (response.status === 429) {
         const retryAfter = parseInt(response.headers.get('X-RateLimit-Retry-After'));
         const delay = Math.pow(2, i) * 1000;
         
         await new Promise(resolve => setTimeout(resolve, Math.max(delay, retryAfter * 1000)));
         continue;
       }
       
       return response;
     }
     throw new Error('Max retries exceeded');
   }
   ```

5. **Smart Refresh**: Only refresh configuration when necessary
   ```javascript
   // Check timestamps before refreshing full configuration
   const timestampResponse = await fetch('/api/user/global-settings-timestamp');
   if (timestampResponse.timestamp > lastConfigUpdate) {
     // Refresh full configuration
     const configResponse = await fetch('/api/ui/config');
   }
   ```

## Security Considerations

### Authentication and Authorization
1. **Required Authentication**: All endpoints require valid authentication
2. **Role-Based Access**: Different configuration options based on user roles
3. **Session Validation**: Active session validation for all requests
4. **API Key Security**: Secure API key handling for programmatic access

### Data Protection
1. **Sensitive Information**: Sensitive configuration options are filtered based on user roles
2. **Admin Protection**: Administrative configuration options require appropriate roles
3. **User Privacy**: User preferences are only accessible to the owning user
4. **Group Privacy**: Group information is filtered based on membership

### Caching and Performance
1. **Cache Keys**: Secure cache keys that don't expose sensitive information
2. **ETag Headers**: Proper ETag implementation for conditional requests
3. **Cache Invalidation**: Secure cache invalidation when permissions change
4. **Rate Limiting**: Comprehensive rate limiting to prevent abuse

### Client-Side Security
1. **XSS Prevention**: Configuration data is properly sanitized for client-side use
2. **CSRF Protection**: CSRF tokens for configuration modification endpoints
3. **Content Security**: Content Security Policy headers for configuration resources
4. **Input Validation**: All configuration inputs are validated and sanitized

## Error Responses

### 400 Bad Request

**Invalid Query Parameters**:
```json
{
  "error": "Invalid query parameter",
  "details": "Unsupported format value. Use 'json', 'iso', or 'unix'"
}
```

**Invalid Group ID**:
```json
{
  "error": "Invalid group ID format",
  "details": "Group ID must be a valid UUID"
}
```

### 401 Unauthorized

**Missing Authentication**:
```json
{
  "error": "Unauthorized: Authentication required to access UI configuration"
}
```

**Invalid API Key**:
```json
{
  "error": "Invalid API key"
}
```

**Expired Session**:
```json
{
  "error": "Session expired. Please log in again."
}
```

### 403 Forbidden

**Insufficient Permissions**:
```json
{
  "error": "Forbidden: Insufficient permissions to access admin configuration"
}
```

**Access Denied**:
```json
{
  "error": "Forbidden: Cannot access configuration for other users"
}
```

### 404 Not Found

**Group Not Found**:
```json
{
  "error": "Group not found",
  "groupId": "group-uuid-123"
}
```

### 429 Too Many Requests

**Rate Limit Exceeded**:
```json
{
  "error": "Rate limit exceeded",
  "rateLimitInfo": {
    "limit": 200,
    "remaining": 0,
    "resetTime": 1640995200,
    "windowType": "hourly",
    "retryAfter": 3600
  }
}
```

### 500 Internal Server Error

**Configuration Load Error**:
```json
{
  "error": "Failed to load UI configuration",
  "details": "Database connection timeout"
}
```

**Timestamp Retrieval Error**:
```json
{
  "error": "Failed to retrieve timestamps",
  "details": "Internal server error"
}
```

## Notes

### Client-Side Implementation

1. **Configuration Caching**: Implement intelligent caching on the client side
2. **Cache Invalidation**: Use timestamp endpoints to determine when to refresh cache
3. **Conditional Requests**: Use conditional requests to reduce bandwidth
4. **Error Handling**: Implement proper error handling for configuration failures

### Performance Optimization

1. **Minimize Requests**: Use caching and conditional requests to minimize API calls
2. **Batch Operations**: Retrieve multiple configuration items in single requests
3. **Compression**: Use gzip compression for large configuration responses
4. **CDN Integration**: Consider CDN integration for static configuration assets

### User Experience

1. **Progressive Loading**: Load essential configuration first, then enhance
2. **Offline Support**: Cache configuration for offline functionality
3. **Theme Persistence**: Persist theme preferences across sessions
4. **Responsive Design**: Ensure configuration works across all device types

### Best Practices

1. **Version Control**: Version configuration changes for rollback capability
2. **A/B Testing**: Support for A/B testing different configurations
3. **Feature Flags**: Implement feature flags for gradual rollouts
4. **Analytics**: Track configuration usage for optimization

### Integration Points

1. **Authentication System**: Integration with user authentication and roles
2. **Permission System**: Integration with permission and access control
3. **Group Management**: Integration with user group management
4. **Theme System**: Integration with theming and personalization

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