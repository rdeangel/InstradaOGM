# VPN Endpoints

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
curl -X GET "${SERVER_URL}/api/vpn/status" \
  -H "Authorization: Bearer ${API_KEY}"
```

## Overview

This section covers all VPN-related API endpoints for managing VPN connections, configurations, and status monitoring.

## Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ✅ Can access VPN endpoints
- **ADMIN**: ✅ Can access VPN endpoints
- **SUPER_ADMIN**: ✅ Can access VPN endpoints

**Example Responses:**

**All Roles Success:**
```json
{
  "success": true,
  "data": {
    "vpnConnections": [
      {
        "id": "vpn-uuid-1",
        "name": "OpenVPN Connection",
        "status": "connected",
        "type": "openvpn"
      }
    ]
  }
}
```

## VPN Status Monitoring

### GET /api/vpn/status

**Description**: Get current VPN connection status and information (context-aware).

**Authentication**: Context-aware - returns appropriate data based on authentication status

**Role Access:**
- **Unauthenticated**: ✅ Can get minimal VPN data (for badges)
- **USER**: ✅ Can get minimal VPN data (same as unauthenticated)
- **ADMIN**: ✅ Can check VPN status (filtered data)
- **SUPER_ADMIN**: ✅ Can check VPN status (full data)

#### Usage Case 1: Successful VPN Status Retrieval (SUPER_ADMIN)

**Scenario**: SUPER_ADMIN user retrieves complete VPN status information

**Example Request**:
```bash
curl -X GET "https://instrada-ogm.example.com/api/vpn/status" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json"
```

**Success Response** (SUPER_ADMIN - Full Data):
```json
{
  "vpnStatuses": [
    {
      "id": "vpn-uuid-1",
      "name": "OpenVPN Connection",
      "status": "connected",
      "enabled": "1",
      "opnsenseNetworkGroupId": "group-uuid-1",
      "vpnName": "Office VPN",
      "friendlyName": "Main Office OpenVPN",
      "networkGroupFriendlyName": "VPN Users",
      "type": "openvpn",
      "details": {
        "type": "openvpn",
        "status": "up",
        "virtualAddress": "10.0.0.2",
        "realAddress": "192.168.1.100",
        "bytesReceived": "1024000",
        "bytesSent": "512000",
        "connectedSince": "2024-01-01T12:00:00Z"
      }
    },
    {
      "id": "vpn-uuid-2",
      "name": "WireGuard Connection",
      "status": "disconnected",
      "enabled": "1",
      "opnsenseNetworkGroupId": "group-uuid-2",
      "vpnName": "Remote VPN",
      "friendlyName": "Remote Access WireGuard",
      "networkGroupFriendlyName": "Remote Workers",
      "type": "wireguard",
      "details": {
        "type": "wireguard",
        "status": "offline",
        "enabled": "1",
        "publicKey": "abc123def456...",
        "allowedIPs": "10.1.0.0/24",
        "endpoint": "vpn.example.com:51820",
        "lastHandshake": "2024-01-01T11:30:00Z",
        "transferRx": "2048000",
        "transferTx": "1024000"
      }
    },
    {
      "id": "vpn-uuid-3",
      "name": "IPsec Connection",
      "status": "disabled",
      "enabled": "0",
      "opnsenseNetworkGroupId": "group-uuid-3",
      "vpnName": "Site-to-Site",
      "friendlyName": "Branch Office IPsec",
      "networkGroupFriendlyName": "Branch Network",
      "type": "ipsec",
      "details": {
        "type": "ipsec",
        "connected": false,
        "localSubnet": "192.168.1.0/24",
        "remoteSubnet": "192.168.2.0/24",
        "remoteEndpoint": "203.0.113.1"
      }
    }
  ],
  "groupVpnMap": {
    "group-uuid-1": "vpn-uuid-1",
    "group-uuid-2": "vpn-uuid-2",
    "group-uuid-3": "vpn-uuid-3"
  },
  "totalCount": 3,
  "summary": {
    "connected": 1,
    "disconnected": 1,
    "disabled": 1
  }
}
```

#### Usage Case 2: Filtered VPN Status Retrieval (ADMIN)

**Scenario**: ADMIN user retrieves filtered VPN status information

**Success Response** (ADMIN - Filtered Data):
```json
{
  "vpnStatuses": [
    {
      "id": "vpn-uuid-1",
      "status": "connected",
      "enabled": true,
      "opnsenseNetworkGroupId": "group-uuid-1",
      "type": "openvpn",
      "vpnName": "Office VPN",
      "friendlyName": "Main Office OpenVPN"
    },
    {
      "id": "vpn-uuid-2",
      "status": "disconnected",
      "enabled": true,
      "opnsenseNetworkGroupId": "group-uuid-2",
      "type": "wireguard",
      "vpnName": "Remote VPN",
      "friendlyName": "Remote Access WireGuard"
    }
  ],
  "groupVpnMap": {
    "group-uuid-1": "vpn-uuid-1",
    "group-uuid-2": "vpn-uuid-2"
  },
  "totalCount": 2,
  "summary": {
    "connected": 1,
    "disconnected": 1,
    "disabled": 0
  }
}
```

#### Usage Case 3: USER Role Access (Minimal Data)

**Scenario**: USER role requests VPN status information

**Example Request**:
```bash
curl -X GET "https://instrada-ogm.example.com/api/vpn/status" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json"
```

**Success Response** (USER - Minimal Data):
```json
{
  "vpnStatuses": [
    {
      "id": "vpn-uuid-1",
      "status": "connected",
      "enabled": true,
      "opnsenseNetworkGroupId": "group-uuid-1",
      "type": "openvpn"
    },
    {
      "id": "vpn-uuid-2",
      "status": "disconnected",
      "enabled": true,
      "opnsenseNetworkGroupId": "group-uuid-2",
      "type": "wireguard"
    }
  ],
  "groupVpnMap": {
    "group-uuid-1": "vpn-uuid-1",
    "group-uuid-2": "vpn-uuid-2"
  }
}
```

#### Usage Case 4: Unauthenticated Access

**Scenario**: Request without valid authentication

**Error Response**:
```json
{
  "message": "Unauthorized"
}
```

#### Usage Case 5: OPNsense Connection Error

**Scenario**: Unable to connect to OPNsense API

**Error Response**:
```json
{
  "error": "Failed to fetch VPN status"
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
    - `config`: Connection configuration
  - `summary`: Connection summary statistics

## VPN Safe Restart

### POST /api/vpn/safe-restart

**Description**: Safely restart a VPN connection.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can restart VPN connections
- **ADMIN**: ✅ Can restart VPN connections
- **SUPER_ADMIN**: ✅ Can restart VPN connections

#### Usage Case 1: Successful OpenVPN Restart

**Scenario**: User restarts a disconnected OpenVPN connection

**Example Request**:
```bash
curl -X POST "https://instrada-ogm.example.com/api/vpn/safe-restart" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "vpnUuid": "vpn-uuid-1",
    "vpnType": "openvpn"
  }'
```

**Success Response**:
```json
{
  "message": "VPN restart initiated successfully",
  "opnsenseResponse": {
    "result": "ok"
  }
}
```

#### Usage Case 2: Successful WireGuard Restart

**Scenario**: User restarts a WireGuard connection using toggle method

**Example Request**:
```bash
curl -X POST "https://instrada-ogm.example.com/api/vpn/safe-restart" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "vpnUuid": "vpn-uuid-2",
    "vpnType": "wireguard"
  }'
```

**Success Response**:
```json
{
  "message": "VPN restart initiated successfully",
  "opnsenseResponse": {
    "result": "ok"
  }
}
```

#### Usage Case 3: Successful IPsec Connection

**Scenario**: User connects a disconnected IPsec VPN

**Example Request**:
```bash
curl -X POST "https://instrada-ogm.example.com/api/vpn/safe-restart" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "vpnUuid": "vpn-uuid-3",
    "vpnType": "ipsec"
  }'
```

**Success Response**:
```json
{
  "message": "VPN restart initiated successfully",
  "opnsenseResponse": {
    "result": "ok"
  }
}
```

#### Usage Case 4: Already Connected VPN Error

**Scenario**: User tries to restart an already connected OpenVPN

**Error Response**:
```json
{
  "error": "OpenVPN is already connected. Cannot restart via this endpoint."
}
```

**Scenario**: User tries to restart an already connected IPsec

**Error Response**:
```json
{
  "error": "IPsec is already connected. Cannot restart via this endpoint."
}
```

#### Usage Case 5: Missing Required Fields

**Scenario**: Request missing VPN UUID or type

**Error Response**:
```json
{
  "error": "VPN UUID and type are required"
}
```

#### Usage Case 6: Unsupported VPN Type

**Scenario**: Request with invalid VPN type

**Error Response**:
```json
{
  "error": "Unsupported VPN type for safe restart."
}
```

#### Usage Case 7: OPNsense API Error

**Scenario**: Error communicating with OPNsense

**Error Response**:
```json
{
  "error": "Failed to restart VPN"
}
```

#### Usage Case 8: Unmanaged Groups Restriction

**Scenario**: Unauthenticated user tries to restart VPN for host in unmanaged groups

**Error Response**:
```json
{
  "error": "Self-service is restricted: Your device is associated with network groups that have been disabled by administrators. Self-service modifications are not allowed."
}
```

**Scenario**: Unauthenticated user tries to restart VPN for host in filtered groups

**Error Response**:
```json
{
  "error": "Self-service is restricted: Your device is associated with network groups that are not available for self-service access. Please contact your network administrator for assistance."
}
```

**Required Fields**:
- `vpnUuid`: VPN connection UUID
- `vpnType`: VPN type (`openvpn`, `wireguard`, `ipsec`)

**VPN Type Behaviors**:
- **OpenVPN**: Calls restart service API (only if disconnected)
- **WireGuard**: Performs toggle-twice operation (disable then re-enable)
- **IPsec**: Calls connect API (only if disconnected)

## Context-Aware VPN Status Access

The `/api/vpn/status` endpoint is now context-aware and handles both unauthenticated and authenticated access patterns:

### Unauthenticated Access (Self-Service Badges)

**Description**: Get minimal VPN status information for self-service page badges.

**Authentication**: Not required

**Example Request**:
```bash
curl -X GET "https://instrada-ogm.example.com/api/vpn/status" \
  -H "Content-Type: application/json"
```

**Unauthenticated Response (Minimal Data)**:
```json
{
  "vpnStatuses": [
    {
      "id": "vpn-uuid-1",
      "status": "connected",
      "enabled": true,
      "opnsenseNetworkGroupId": "group-uuid-1",
      "type": "openvpn"
    },
    {
      "id": "vpn-uuid-2",
      "status": "disconnected",
      "enabled": true,
      "opnsenseNetworkGroupId": "group-uuid-2",
      "type": "wireguard"
    },
    {
      "id": "vpn-uuid-3",
      "status": "disabled",
      "enabled": false,
      "opnsenseNetworkGroupId": "group-uuid-3",
      "type": "ipsec"
    }
  ],
  "groupVpnMap": {
    "group-uuid-1": "vpn-uuid-1",
    "group-uuid-2": "vpn-uuid-2",
    "group-uuid-3": "vpn-uuid-3"
  }
}
```

#### Usage Case 2: No VPN Connections Available

**Scenario**: System has no configured VPN connections

**Success Response**:
```json
{
  "vpnStatuses": [],
  "groupVpnMap": {}
}
```

#### Usage Case 3: OPNsense Connection Error

**Scenario**: Unable to fetch VPN status from OPNsense

**Error Response**:
```json
{
  "error": "Failed to fetch VPN status"
}
```

**Response Fields**:
- `vpnStatuses`: Array of minimal VPN status information
  - `id`: VPN connection identifier
  - `status`: Connection status (`connected`, `disconnected`, `disabled`)
  - `enabled`: Whether VPN is enabled
  - `opnsenseNetworkGroupId`: Associated network group ID
  - `type`: VPN type (`openvpn`, `wireguard`, `ipsec`)
- `groupVpnMap`: Mapping of group IDs to VPN IDs

**Note**: This endpoint returns minimal data suitable for public display (VPN badges) without sensitive configuration details.

## Error Responses

### 400 Bad Request

**Missing Required Fields**:
```json
{
  "error": "VPN UUID and type are required"
}
```

**Unsupported VPN Type**:
```json
{
  "error": "Unsupported VPN type for safe restart."
}
```

### 401 Unauthorized

**Authentication Required**:
```json
{
  "message": "Unauthorized"
}
```

**General Unauthorized**:
```json
{
  "error": "Unauthorized"
}
```

### 403 Forbidden

**Insufficient Permissions**:
```json
{
  "error": "Insufficient permissions - ADMIN or SUPER_ADMIN required"
}
```

**Already Connected OpenVPN**:
```json
{
  "error": "OpenVPN is already connected. Cannot restart via this endpoint."
}
```

**Already Connected IPsec**:
```json
{
  "error": "IPsec is already connected. Cannot restart via this endpoint."
}
```

### 500 Internal Server Error

**VPN Status Fetch Error**:
```json
{
  "error": "Failed to fetch VPN status"
}
```

**VPN Restart Error**:
```json
{
  "error": "Failed to restart VPN"
}
```

**OPNsense API Error**:
```json
{
  "error": "Failed to restart VPN connection"
}
```

**Server Utility Error**:
```json
{
  "error": "Failed to fetch VPN status"
}
```

## Notes

### VPN Connection States

1. **Connected**: VPN is actively connected and passing traffic
2. **Disconnected**: VPN is configured but not currently connected
3. **Disabled**: VPN is disabled in OPNsense configuration
4. **Error**: VPN is in an error state or unreachable

### Authentication and Authorization

1. **Context-Aware VPN Status**: Returns appropriate data based on authentication status
   - **Unauthenticated**: Minimal data for self-service badges
   - **ADMIN**: Filtered data for admin operations
   - **SUPER_ADMIN**: Full data with detailed information
2. **Safe Restart**: Available to all authenticated users (USER, ADMIN, SUPER_ADMIN) for self-service
3. **Service Control**: Advanced VPN service control requires SUPER_ADMIN role

### VPN Type Support

1. **OpenVPN**: Full support for status monitoring and safe restart
2. **WireGuard**: Full support with toggle-based restart mechanism
3. **IPsec**: Full support for site-to-site connections
4. **Real-time Data**: All status information is fetched in real-time from OPNsense

### Error Handling

1. **Consistent Format**: All errors follow standard JSON error response format
2. **Connection State Validation**: Safe restart validates current connection state
3. **OPNsense Integration**: Handles OPNsense API communication errors gracefully
4. **Public vs Private**: Different error handling for public vs authenticated endpoints

### Self-Service Features

1. **Safe Restart**: Users can restart disconnected VPNs without admin intervention
2. **Connection Validation**: Prevents restart of already connected VPNs
3. **Type-Specific Logic**: Different restart mechanisms for different VPN types
4. **Public Monitoring**: Basic status information available for public monitoring

## VPN Service Control Endpoints

### POST /api/opnsense/openvpn-service/stop

**Description**: Stop the OpenVPN service on OPNsense.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ❌ Cannot access endpoint (returns "Unauthorized")
- **ADMIN**: ❌ Cannot access endpoint (returns "Unauthorized")
- **SUPER_ADMIN**: ✅ Can stop OpenVPN service

#### Usage Case 1: Successful OpenVPN Service Stop

**Scenario**: SUPER_ADMIN stops the OpenVPN service

**Example Request**:
```bash
curl -X POST "https://instrada-ogm.example.com/api/opnsense/openvpn-service/stop" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "vpnUuid": "vpn-uuid-1"
  }'
```

**Success Response**:
```json
{
  "success": true,
  "message": "OpenVPN service stopped successfully",
  "opnsenseResponse": {
    "result": "ok"
  }
}
```

#### Usage Case 2: Missing VPN UUID

**Scenario**: Request missing required VPN UUID

**Error Response**:
```json
{
  "error": "VPN UUID is required"
}
```

#### Usage Case 3: Unauthorized Access

**Scenario**: USER or ADMIN attempts to stop OpenVPN service

**Error Response**:
```json
{
  "error": "Unauthorized: SUPER_ADMIN role required"
}
```

#### Usage Case 4: OPNsense API Error

**Scenario**: Error communicating with OPNsense

**Error Response**:
```json
{
  "error": "Failed to stop OpenVPN service"
}
```

**Required Fields**:
- `vpnUuid`: VPN connection UUID (string)

**Security Considerations**:
- This endpoint immediately stops all OpenVPN connections
- Use with caution as it will disconnect all active OpenVPN clients
- Consider notifying users before stopping the service
- Service restart requires manual intervention or separate API call

### POST /api/opnsense/ipsec-service/stop

**Description**: Stop the IPsec service on OPNsense.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ❌ Cannot access endpoint (returns "Unauthorized")
- **ADMIN**: ✅ Can stop IPsec service
- **SUPER_ADMIN**: ✅ Can stop IPsec service

#### Usage Case 1: Successful IPsec Service Stop (ADMIN)

**Scenario**: ADMIN stops the IPsec service

**Example Request**:
```bash
curl -X POST "https://instrada-ogm.example.com/api/opnsense/ipsec-service/stop" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "vpnUuid": "vpn-uuid-2"
  }'
```

**Success Response**:
```json
{
  "success": true,
  "message": "IPsec service stopped successfully",
  "opnsenseResponse": {
    "result": "ok"
  }
}
```

#### Usage Case 2: Successful IPsec Service Stop (SUPER_ADMIN)

**Scenario**: SUPER_ADMIN stops the IPsec service

**Example Request**:
```bash
curl -X POST "https://instrada-ogm.example.com/api/opnsense/ipsec-service/stop" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "vpnUuid": "vpn-uuid-2"
  }'
```

**Success Response**:
```json
{
  "success": true,
  "message": "IPsec service stopped successfully",
  "opnsenseResponse": {
    "result": "ok"
  }
}
```

#### Usage Case 3: Missing VPN UUID

**Scenario**: Request missing required VPN UUID

**Error Response**:
```json
{
  "error": "VPN UUID is required"
}
```

#### Usage Case 4: Unauthorized Access

**Scenario**: USER attempts to stop IPsec service

**Error Response**:
```json
{
  "error": "Unauthorized: ADMIN or SUPER_ADMIN role required"
}
```

#### Usage Case 5: OPNsense API Error

**Scenario**: Error communicating with OPNsense

**Error Response**:
```json
{
  "error": "Failed to stop IPsec service"
}
```

**Required Fields**:
- `vpnUuid`: VPN connection UUID (string)

**Security Considerations**:
- This endpoint immediately stops all IPsec tunnels
- Will disconnect all site-to-site VPN connections
- May impact network connectivity between sites
- Consider business hours and maintenance windows
- Service restart requires manual intervention or separate API call

### POST /api/opnsense/wireguard/service/stop

**Description**: Stop the WireGuard service on OPNsense.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ❌ Cannot access endpoint (returns "Unauthorized")
- **ADMIN**: ❌ Cannot access endpoint (returns "Unauthorized")
- **SUPER_ADMIN**: ✅ Can stop WireGuard service

#### Usage Case 1: Successful WireGuard Service Stop

**Scenario**: SUPER_ADMIN stops the WireGuard service

**Example Request**:
```bash
curl -X POST "https://instrada-ogm.example.com/api/opnsense/wireguard/service/stop" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "vpnUuid": "vpn-uuid-3"
  }'
```

**Success Response**:
```json
{
  "success": true,
  "message": "WireGuard service stopped successfully",
  "opnsenseResponse": {
    "result": "ok"
  }
}
```

#### Usage Case 2: Missing VPN UUID

**Scenario**: Request missing required VPN UUID

**Error Response**:
```json
{
  "error": "VPN UUID is required"
}
```

#### Usage Case 3: Unauthorized Access

**Scenario**: USER or ADMIN attempts to stop WireGuard service

**Error Response**:
```json
{
  "error": "Unauthorized: SUPER_ADMIN role required"
}
```

#### Usage Case 4: OPNsense API Error

**Scenario**: Error communicating with OPNsense

**Error Response**:
```json
{
  "error": "Failed to stop WireGuard service"
}
```

**Required Fields**:
- `vpnUuid`: VPN connection UUID (string)

**Security Considerations**:
- This endpoint immediately stops all WireGuard tunnels
- Will disconnect all active WireGuard peers
- Consider notifying users before stopping the service
- Service restart requires manual intervention or separate API call
- WireGuard's stateless nature means connections must be re-established after restart

## VPN Service Control Error Responses

### 400 Bad Request

**Missing VPN UUID**:
```json
{
  "error": "VPN UUID is required"
}
```

### 401 Unauthorized

**Authentication Required**:
```json
{
  "error": "Unauthorized"
}
```

### 403 Forbidden

**Insufficient Permissions for OpenVPN/WireGuard**:
```json
{
  "error": "Unauthorized: SUPER_ADMIN role required"
}
```

**Insufficient Permissions for IPsec**:
```json
{
  "error": "Unauthorized: ADMIN or SUPER_ADMIN role required"
}
```

### 500 Internal Server Error

**OpenVPN Service Stop Error**:
```json
{
  "error": "Failed to stop OpenVPN service"
}
```

**IPsec Service Stop Error**:
```json
{
  "error": "Failed to stop IPsec service"
}
```

**WireGuard Service Stop Error**:
```json
{
  "error": "Failed to stop WireGuard service"
}
```

**OPNsense Communication Error**:
```json
{
  "error": "Failed to communicate with OPNsense API"
}
```

## VPN Service Control Notes

### Service Control vs. Connection Control

1. **Service Control**: These endpoints stop the entire VPN service daemon
   - Affects all VPN connections of that type simultaneously
   - Requires higher privileges (ADMIN/SUPER_ADMIN)
   - Used for maintenance, troubleshooting, or emergency shutdowns

2. **Connection Control**: The `/api/vpn/safe-restart` endpoint controls individual connections
   - Affects only the specified VPN connection
   - Available to all authenticated users
   - Used for self-service connection management

### Safety Considerations

1. **Impact Assessment**: Before stopping a service, assess the impact on:
   - Active users and their connections
   - Site-to-site connectivity
   - Critical business operations

2. **Maintenance Windows**: Schedule service stops during:
   - Low-usage periods
   - Planned maintenance windows
   - Emergency situations only

3. **User Notification**: Consider notifying users before:
   - Stopping services for maintenance
   - Emergency service disruptions
   - Extended downtime

4. **Service Recovery**: Plan for service restart:
   - Manual restart may be required
   - Have documented procedures
   - Test restart procedures regularly

### Role-Based Access Rationale

1. **OpenVPN & WireGuard**: SUPER_ADMIN only
   - These services typically handle critical infrastructure
   - Misconfiguration can cause widespread disruption
   - Requires highest level of trust and technical knowledge

2. **IPsec**: ADMIN and SUPER_ADMIN
   - Often used for site-to-site connections
   - More common operational task
   - Still requires elevated privileges but not as restrictive

---

## API Navigation

### API Documentation
- [🔍 API Index](API_Index.md) - Complete API endpoint index
- [🔑 Authentication](02_authentication_endpoints.md) - Authentication methods

### Related API Categories
- [🌐 Public Endpoints](01_public_endpoints.md) - Unauthenticated access points
- [🔐 Authentication Endpoints](02_authentication_endpoints.md) - Authentication and session management
- [👤 User Management](05_account_endpoints.md) - User account APIs
- [👨‍💼 Admin Functions](04_admin_endpoints.md) - Administrative APIs
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