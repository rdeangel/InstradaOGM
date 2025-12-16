# Public Endpoints

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
curl -X GET "${SERVER_URL}/api/ip" \
  -H "Authorization: Bearer ${API_KEY}"
```

This section covers all public API endpoints that can be accessed without authentication or with minimal authentication requirements.

## Role-Based Access Control

**Authentication Required:** No (for most endpoints)

**Role Requirements:**
- **Unauthenticated**: ✅ Can access public endpoints
- **USER**: ✅ Can access public endpoints
- **ADMIN**: ✅ Can access public endpoints
- **SUPER_ADMIN**: ✅ Can access public endpoints

**Example Responses:**

**Unauthenticated Success:**
```json
{
  "ip": "203.0.113.1",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

---

## Health Check

### GET /api/health

**Description**: Health check endpoint for load balancers, monitoring systems, and Docker health checks.

**Authentication**: Not required (public endpoint)

**Role Access:**
- **Unauthenticated**: ✅ Full access
- **USER**: ✅ Full access
- **ADMIN**: ✅ Full access
- **SUPER_ADMIN**: ✅ Full access

**Used By:**
- Traefik health checks
- Load balancers
- Monitoring systems (Prometheus, Datadog, etc.)
- Docker health checks
- Uptime monitoring services

#### Usage Case 1: Basic Health Check

**Scenario**: Load balancer checking if the application is healthy

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/health" \
  -H "Content-Type: application/json"
```

**Success Response** (200 OK):
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0"
}
```

**Response Fields:**
- `status`: Health status (`healthy`)
- `timestamp`: Current server timestamp in ISO 8601 format
- `version`: Application version from `NEXT_PUBLIC_APP_VERSION` environment variable

#### Usage Case 2: Unhealthy Application

**Scenario**: Database connection is down

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/health" \
  -H "Content-Type: application/json"
```

**Error Response** (503 Service Unavailable):
```json
{
  "status": "unhealthy",
  "error": "Database connection failed"
}
```

#### Integration Examples

**Docker Compose Health Check:**
```yaml
services:
  instrada-ogm:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

**Traefik Health Check:**
```yaml
http:
  services:
    instrada-ogm:
      loadBalancer:
        healthCheck:
          path: /api/health
          interval: 30s
          timeout: 5s
```

**Kubernetes Liveness Probe:**
```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
```

**Prometheus Monitoring:**
```yaml
scrape_configs:
  - job_name: 'instrada-ogm'
    metrics_path: '/api/health'
    static_configs:
      - targets: ['instrada-ogm.example.com']
```

#### Response Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Application is healthy and database is accessible |
| 503 | Application is unhealthy (database connection failed) |

#### Notes

1. **Database Check**: The endpoint performs a simple database query (`SELECT 1`) to verify connectivity
2. **No Authentication**: This endpoint is intentionally public for monitoring purposes
3. **Lightweight**: Designed to be called frequently without performance impact
4. **Version Info**: Returns application version for deployment verification
5. **Timestamp**: Useful for detecting time synchronization issues

---

## IP Address Information

### GET /api/ip

**Description**: Get the client's IP address information with network details.

**Authentication**: Not required

**Role Access:**
- **Unauthenticated**: ✅ Full access (when self-service enabled AND IP in allowed networks) / ❌ 403 Forbidden (when self-service globally disabled OR IP not in allowed networks)
- **USER**: ✅ Full access
- **ADMIN**: ✅ Full access
- **SUPER_ADMIN**: ✅ Full access

**Security Notes**:
- When self-service is globally disabled (`removeSelfServicePage: true`), unauthenticated requests to this endpoint will receive a 403 Forbidden response
- For unauthenticated users, IP address must be within Self-Service Access Control allowed networks
- Unauthenticated requests are tracked via session usage analytics (not audit logs) for real-time monitoring

#### Usage Case 1: Standard IP Address Request

**Scenario**: Client requests their IP address information

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/ip" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "ip": "192.168.1.100",
  "mac": "00:11:22:33:44:55",
  "vendor": "Dell Inc.",
  "vendorSource": "OPNsense",
  "hostname": "workstation-01",
  "clientIp": "192.168.1.100"
}
```

**Response Fields**:
- `ip`: Client's IP address (normalized from IPv4-mapped IPv6)
- `mac`: MAC address if available (private IPs only)
- `vendor`: Vendor information if MAC is detected
- `vendorSource`: Source of vendor information (`"OPNsense"` for OPNsense ARP Table, `"Local DB"` for local vendor database, or `null` if no vendor detected)
- `hostname`: Hostname if available from OPNsense
- `clientIp`: Original client IP address from headers

#### Usage Case 2: IPv6 Address Request

**Scenario**: Client with IPv6 address requests information

**Success Response**:
```json
  "ip": "2001:db8::1",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### Usage Case 3: IPv4-Mapped IPv6 Address

**Scenario**: Client with IPv4-mapped IPv6 address (normalized to IPv4)

**Success Response**:
```json
{
  "ip": "192.168.1.100",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### Usage Case 4: Self-Service Globally Disabled

**Scenario**: Unauthenticated request when self-service is globally disabled

**Error Response** (403 Forbidden):
```json
{
  "error": "Forbidden: Self-service functionality is disabled"
}
```

**Response Fields**:
- `ip`: Client's IP address (normalized from IPv4-mapped IPv6 if applicable)
- `timestamp`: Request timestamp in ISO 8601 format

## Public Settings

### GET /api/ui/config

**Description**: Retrieve secure UI configuration settings without exposing sensitive organizational details.

**Authentication**: Not required

**Security Features:**
- ✅ Uses generic labels instead of custom organizational names for unauthenticated users
- ✅ Returns custom organizational names for authenticated users
- ✅ Removes sensitive configuration details
- ✅ Essential UI behavior flags only
- ✅ No infrastructure information exposed

**Role Access:**
- **Unauthenticated**: ✅ Full access (generic labels)
- **USER**: ✅ Full access (custom labels)
- **ADMIN**: ✅ Full access (custom labels)
- **SUPER_ADMIN**: ✅ Full access (custom labels)

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/ui/config" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
{
  "selfServiceEnabled": true,
  "registrationEnabled": false,
  "selfServiceRenamingEnabled": true,
  "groupTypesEnabled": true,
  "selfServiceMultiSelectEnabled": true,
  "assignmentMode": "smart",
  "groupTypeConfig": {
    "showTypeIndicators": true,
    "singleSelectLabel": "Primary Group",
    "multiSelectLabel": "Additional Groups",
    "singleSelectIcon": "dot",
    "multiSelectIcon": "dots"
  },
  "subtitleEnabled": true,
  "subtitleText": "Production Environment"
}
```

**Response Fields**:
- `selfServiceEnabled`: Whether self-service operations are allowed (see Three-Tier Access Control below)
- `registrationEnabled`: Whether user registration is enabled
- `selfServiceRenamingEnabled`: Whether self-service page renaming is enabled
- `groupTypesEnabled`: Whether group types (SingleSelect/MultiSelect) are enabled
- `selfServiceMultiSelectEnabled`: Whether self-service users can see/use MultiSelect groups
- `assignmentMode`: Assignment behavior mode ("smart" or "moveOnly")
- `groupTypeConfig`: Group type display configuration
  - `showTypeIndicators`: Whether to show type indicator icons
  - `singleSelectLabel`: Generic label for SingleSelect groups
  - `multiSelectLabel`: Generic label for MultiSelect groups
- `subtitleEnabled`: Whether application subtitle is enabled
- `subtitleText`: Custom subtitle text to display below main title (null when disabled or empty)

**Three-Tier Self-Service Access Control with Network-Based Optimization:**

The `selfServiceEnabled` field is determined by an optimized three-tier access control system:

**For Authenticated Users (Optimized Flow):**
1. **Global Setting Check**: If `removeSelfServicePage: true`, returns `false`
2. **Network-Based Access Optimization**: If user's IP is allowed by Self-Service Access Control network rules, grant access immediately (bypasses complex device checks)
3. **Device Management Scope Check**: Only if IP not in allowed networks, check if user's IP is in their permitted devices list
4. **Fallback Check**: If device scope fails, checks if IP would be allowed for unauthenticated users

**For Unauthenticated Users:**
1. **Global Setting Check**: If `removeSelfServicePage: true`, returns `false`
2. **IP Network Restrictions**: IP must be in Self-Service Access Control allowed networks

This ensures that authentication never reduces access compared to unauthenticated access from the same IP.
  - `singleSelectIcon`: Simplified icon identifier for SingleSelect groups
  - `multiSelectIcon`: Simplified icon identifier for MultiSelect groups

**Security Notes**:
- ✅ No custom organizational names exposed (uses generic labels)
- ✅ `enableRenamingDeviceManagementPage` removed (not needed for unauthenticated users)
- ✅ Simplified icon identifiers (no internal CSS class names)
- ✅ Essential UI behavior flags only

**Group Type Settings Impact**:
These settings control how group types behave in self-service and authenticated interfaces:

- When `groupTypesEnabled: false`: All groups behave as SingleSelect (move-only mode)
- When `groupTypesEnabled: true` + `selfServiceMultiSelectEnabled: false`: Self-service only shows SingleSelect groups
- When `groupTypesEnabled: true` + `selfServiceMultiSelectEnabled: true`: Self-service shows all group types

## Secure Authentication Providers

### GET /api/public/auth-providers

**Description**: Retrieve minimal authentication provider information without exposing sensitive infrastructure details.

**Authentication**: Not required

**Security Features:**
- ✅ No issuer URLs or authentication server details exposed
- ✅ Generic display names instead of specific provider names
- ✅ No client IDs, secrets, or configuration details
- ✅ Essential provider availability information only

**Role Access:**
- **Unauthenticated**: ✅ Full access
- **USER**: ✅ Full access
- **ADMIN**: ✅ Full access
- **SUPER_ADMIN**: ✅ Full access

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/public/auth-providers" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
[
  {
    "id": "credentials",
    "name": "Credentials",
    "type": "credentials",
    "displayName": "Credentials",
    "available": true
  },
  {
    "id": "authentik",
    "name": "Authentik",
    "type": "oauth",
    "displayName": "SSO Login",
    "available": true
  }
]
```

**Response Fields**:
- `id`: Provider identifier for authentication
- `name`: Internal provider name
- `type`: Provider type ("credentials", "oauth", etc.)
- `displayName`: Generic display name for UI (no specific provider names)
- `available`: Whether the provider is available for use

**Security Notes**:
- ✅ No issuer URLs exposed (prevents infrastructure reconnaissance)
- ✅ Generic "SSO Login" display name (no specific provider identification)
- ✅ No authentication server details or endpoints
- ✅ Essential provider availability information only

## OIDC Provider Information

### GET /api/settings/oidc-providers

**Description**: Retrieve OIDC provider configurations for authentication.

**Authentication**: Not required

**Role Access:**
- **Unauthenticated**: ✅ Full access
- **USER**: ✅ Full access
- **ADMIN**: ✅ Full access
- **SUPER_ADMIN**: ✅ Full access

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/settings/oidc-providers" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
[
  {
    "id": "AUTHENTIK",
    "name": "Authentik",
    "issuer": "https://authentik.example.com/application/o/InstradaOGM/"
  }
]
```

**Response Fields**:
- `id`: Unique provider identifier
- `name`: Provider name
- `clientId`: OAuth client ID
- `issuer`: OIDC issuer URL
- `enabled`: Whether provider is enabled
- `createdAt`: Provider creation timestamp

## Public VPN Status

### GET /api/vpn/status

**Description**: Get VPN status information (context-aware endpoint - returns minimal data for unauthenticated users).

**Authentication**: Not required for basic status, optional for detailed data

**Role Access:**
- **Unauthenticated**: ✅ Minimal VPN data (for self-service badges)
- **USER**: ✅ Minimal VPN data (same as unauthenticated)
- **ADMIN**: ✅ Filtered VPN data
- **SUPER_ADMIN**: ✅ Full VPN data

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/vpn/status" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "vpnConnections": [
      {
        "id": "vpn-uuid-1",
        "name": "OpenVPN Connection",
        "type": "openvpn",
        "status": "connected",
        "interface": "ovpnc1",
        "localIp": "10.0.0.1",
        "remoteIp": "203.0.113.1",
        "bytesIn": 1024000,
        "bytesOut": 512000,
        "connectedSince": "2024-01-01T12:00:00Z",
        "uptime": "1 hour, 30 minutes"
      }
    ],
    "summary": {
      "totalConnections": 1,
      "connected": 1,
      "disconnected": 0,
      "totalBytesIn": 1024000,
      "totalBytesOut": 512000
    }
  }
}
```

**Response Fields**:
- `success`: Boolean indicating request success
- `data`: VPN connection data
  - `vpnConnections`: Array of VPN connections
    - `id`: Unique connection identifier
    - `name`: Connection name
    - `type`: VPN type (openvpn, wireguard, ipsec)
    - `status`: Connection status (connected, disconnected, connecting)
    - `interface`: Network interface name
    - `localIp`: Local IP address
    - `remoteIp`: Remote IP address
    - `bytesIn`: Bytes received
    - `bytesOut`: Bytes sent
    - `connectedSince`: Connection start time
    - `uptime`: Connection duration
  - `summary`: Connection summary statistics

## Self-Service Group Operations

### Group Type Filtering for Self-Service

**Description**: Self-service operations automatically filter available groups based on the `enableSelfServiceMultiSelect` setting.

**Filtering Logic**:

#### When `enableGroupTypes: false` (Move-Only Mode)
```json
{
  "availableGroups": [
    {
      "id": "group1",
      "name": "VPN Users",
      "groupType": null
    }
  ],
  "assignmentBehavior": "moveFromExisting"
}
```
- All groups are treated as SingleSelect
- Assignment replaces all existing group memberships
- No group type indicators shown

#### When `enableGroupTypes: true` + `enableSelfServiceMultiSelect: false`
```json
{
  "availableGroups": [
    {
      "id": "group1",
      "name": "VPN Users",
      "groupType": "SingleSelect"
    }
  ],
  "hiddenGroups": [
    {
      "id": "group2",
      "name": "Admin Access",
      "groupType": "MultiSelect",
      "reason": "MultiSelect groups hidden from self-service"
    }
  ],
  "assignmentBehavior": "smartAssignment"
}
```
- Only SingleSelect groups are visible to self-service users
- MultiSelect groups are filtered out
- Smart assignment preserves existing MultiSelect memberships

#### When `enableGroupTypes: true` + `enableSelfServiceMultiSelect: true`
```json
{
  "availableGroups": [
    {
      "id": "group1",
      "name": "VPN Users",
      "groupType": "SingleSelect"
    },
    {
      "id": "group2",
      "name": "Admin Access",
      "groupType": "MultiSelect"
    }
  ],
  "assignmentBehavior": "smartAssignment"
}
```
- All group types are visible to self-service users
- Full smart assignment behavior available

**Response Fields**:
- `providers`: Available authentication providers
  - `credentials`: Local credentials provider
  - `authentik`: Authentik OAuth provider (if configured)
- `pages`: Authentication page URLs
- `callbacks`: Authentication callback URLs

## Error Responses

### 400 Bad Request

**Invalid Request Parameters**:
```json
{
  "error": "Invalid request parameters"
}
```

### 404 Not Found

**Endpoint Not Found**:
```json
{
  "error": "Endpoint not found"
}
```

### 429 Too Many Requests

**Rate Limit Exceeded**:
```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 60
}
```

### 500 Internal Server Error

**General Server Error**:
```json
{
  "error": "Internal server error"
}
```

**Settings Fetch Error**:
```json
{
  "error": "Failed to fetch public settings"
}
```

**IP Detection Error**:
```json
{
  "error": "Failed to determine client IP address"
}
```

## Notes

### Public Access Design

1. **No Authentication Required**: These endpoints are designed for public access without authentication
2. **Universal Access**: Available to all users regardless of authentication status
3. **Minimal Data Exposure**: Only non-sensitive information is exposed through public endpoints
4. **Self-Service Support**: Enables self-service operations for unauthenticated users

### Performance and Security

1. **Rate Limiting**: May be subject to rate limiting for abuse prevention
2. **Caching**: Responses may be cached for performance optimization
3. **CORS Support**: May support Cross-Origin Resource Sharing for web applications
4. **IP Normalization**: IPv4-mapped IPv6 addresses are normalized to IPv4 format

### Use Cases

1. **IP Detection**: Used by self-service operations to validate client IP addresses
2. **Public Configuration**: Provides public settings for UI configuration
3. **Authentication Setup**: Supports authentication provider discovery
4. **System Integration**: Enables integration with external systems without authentication

### Error Handling

1. **Consistent Format**: All errors follow standard JSON error response format
2. **Graceful Degradation**: Endpoints continue to work even if some features fail
3. **Rate Limiting**: Appropriate rate limiting to prevent abuse
4. **Monitoring**: All public endpoint usage is monitored for security

---

## API Navigation

### API Documentation
- [🔍 API Index](API_Index.md) - Complete API endpoint index
- [🔑 Authentication](02_authentication_endpoints.md) - Authentication methods

### Related API Categories
- [🔐 Authentication Endpoints](02_authentication_endpoints.md) - Authentication and session management
- [👤 User Management](05_account_endpoints.md) - User account APIs
- [👨‍💼 Admin Functions](04_admin_endpoints.md) - Administrative APIs
- [🔒 VPN Management](10_vpn_endpoints.md) - VPN service control
- [📊 Analytics](11_analytics_endpoints.md) - Usage analytics and reporting

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

**Last Updated**: 2025-11-06 | **API Version**: 1.0 | **Category**: API Documentation