# VPN Service Control API Endpoints

[⬆️ Back to API Index](API_Index.md) | [📚 Back to Documentation Home](../../DOCUMENTATION_INDEX.md)

## Overview
This document covers the VPN service control API endpoints in InstradaOGM. These endpoints provide administrative functionality for managing and restarting VPN services including IPsec, OpenVPN, and WireGuard services for administrative users.

VPN identifiers interpolated into OPNsense paths (`vpnUuid`) must match `[A-Za-z0-9_-]{1,64}`. Numeric OpenVPN `vpnid` values such as `1` are accepted. Identifiers that do not match return `400 Bad Request`.

---

## Authentication Requirements

### VPN Service Control Endpoints
- **Authentication**: Valid session or API key
- **Role**: ADMIN or SUPER_ADMIN required
- **Access**: VPN service management and control operations

---

## POST /api/opnsense/ipsec-service/restart

Restart a specific IPsec VPN session on the OPNsense firewall. This operation disconnects the specified IPsec session, waits 5 seconds for OPNsense to process the disconnect, and reconnects it.

### HTTP Methods
- `POST` - Restart specific IPsec session

### Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access endpoint (returns 401 "Unauthorized")
- **ADMIN**: ✅ Can access endpoint
- **SUPER_ADMIN**: ✅ Can access endpoint

**Role Access:**
- **USER**: ❌ Forbidden - insufficient permissions
- **ADMIN**: ✅ Can restart IPsec session with administrative permissions
- **SUPER_ADMIN**: ✅ Can restart IPsec session with full system permissions

**Example Responses:**

**ADMIN/SUPER_ADMIN Success:**
```json
{
  "message": "IPsec restart initiated successfully",
  "disconnectResponse": {
    "result": "ok"
  },
  "connectResponse": {
    "result": "ok"
  }
}
```

**USER Role Failure (401 Unauthorized):**
```json
{
  "error": "Unauthorized"
}
```

### Request Parameters

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `vpnUuid` | string | Yes | Valid OPNsense identifier (`[A-Za-z0-9_-]{1,64}`) | The OPNsense identifier of the IPsec session to restart |

### Example Request
```bash
curl -X POST "https://instrada-ogm.example.com/api/opnsense/ipsec-service/restart" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "vpnUuid": "b157c526-7fd7-40c4-b5a6-d90db7230192"
  }'
```

### Security Considerations
- Requires ADMIN or SUPER_ADMIN role
- `vpnUuid` must match `[A-Za-z0-9_-]{1,64}` or the request returns `400`
- Service restart will temporarily disconnect the target IPsec tunnel
- All operations are tracked by auth middleware for audit purposes
- Rate limiting applies to prevent service disruption

### Rate Limiting

**Rate Limit Strategy:** User-based

**Default Rate Limits:**
- **Public Endpoints**: N/A (authenticated only)
- **Authenticated Endpoints**: 10 requests per hour
- **API Key Endpoints**: Configurable per key (default: 10/hour)

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
    "limit": 10,
    "remaining": 0,
    "resetTime": 1640995200,
    "windowType": "hourly",
    "retryAfter": 3600
  }
}
```

**Best Practices for Handling Rate Limits:**
1. **Monitor Headers**: Always check rate limit headers in API responses
2. **Exponential Backoff**: Implement exponential backoff when receiving 429 responses
3. **Respect Retry-After**: Use the `Retry-After` header to determine when to retry
4. **Cache Responses**: Cache non-sensitive responses to reduce API calls
5. **Batch Operations**: Use batch endpoints when available to reduce request count
6. **API Key Limits**: Configure appropriate limits for your use case

---

## POST /api/opnsense/openvpn-service/restart

Restart an individual OpenVPN instance or an enabled WireGuard client on the OPNsense firewall.

### HTTP Methods
- `POST` - Restart OpenVPN or WireGuard connection

### Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access endpoint (returns 401 "Unauthorized")
- **ADMIN**: ❌ Cannot access endpoint (returns 401 "Unauthorized")
- **SUPER_ADMIN**: ✅ Can access endpoint

**Role Access:**
- **USER**: ❌ Forbidden - insufficient permissions
- **ADMIN**: ❌ Forbidden - requires SUPER_ADMIN
- **SUPER_ADMIN**: ✅ Can restart OpenVPN and WireGuard VPNs with full system permissions

**Example Responses:**

**SUPER_ADMIN Success (OpenVPN):**
```json
{
  "message": "VPN restart initiated successfully",
  "opnsenseResponse": {
    "result": "ok"
  }
}
```

**SUPER_ADMIN Success (WireGuard):**
```json
{
  "message": "VPN restart initiated successfully",
  "opnsenseResponse": {
    "ok": true,
    "result": "Enabled"
  }
}
```

**Unauthorized Role Failure (401 Unauthorized):**
```json
{
  "error": "Unauthorized"
}
```

**WireGuard Client Disabled (400 Bad Request):**
```json
{
  "error": "WireGuard client is not enabled. Restart requires an enabled client."
}
```

**WireGuard Client Not Found (404 Not Found):**
```json
{
  "error": "WireGuard client with UUID wg-uuid-here not found."
}
```

### Request Parameters

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `vpnUuid` | string | Yes | Valid OPNsense identifier (`[A-Za-z0-9_-]{1,64}`) | The OPNsense UUID or identifier of the VPN to restart |
| `vpnType` | string | Yes | `OpenVPN` or `WireGuard` | Type of VPN to restart |

### Example Request
```bash
curl -X POST "https://instrada-ogm.example.com/api/opnsense/openvpn-service/restart" \
  -H "Authorization: Bearer your-superadmin-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "vpnUuid": "c3d4e5f6-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
    "vpnType": "WireGuard"
  }'
```

### Security Considerations
- Requires SUPER_ADMIN role
- WireGuard clients must be enabled prior to restart; disabled clients return 400
- Missing WireGuard clients return 404
- Upstream failure returns 500 without leaking sensitive internal details
- All operations are tracked by auth middleware for audit purposes

### Rate Limiting

**Rate Limit Strategy:** User-based

**Default Rate Limits:**
- **Public Endpoints**: N/A (authenticated only)
- **Authenticated Endpoints**: 10 requests per hour
- **API Key Endpoints**: Configurable per key (default: 10/hour)

**Rate Limit Identification:**
- **Authenticated Endpoints**: Identified by user ID
- **API Key Endpoints**: Identified by API key ID

**Rate Limit Headers:**
All rate limited responses include the following headers:
- `X-RateLimit-Limit`: Maximum requests allowed in the current window
- `X-RateLimit-Remaining`: Remaining requests in the current window
- `X-RateLimit-Reset`: Unix timestamp when the rate limit window resets
- `X-RateLimit-Retry-After`: Seconds until client can retry (only on 429 responses)

---

## POST /api/opnsense/wireguard/service/restart

Restart an individual WireGuard client on the OPNsense firewall. If the client is currently enabled, it is restarted via a toggle-twice operation (`restartWireguardClient`) with firewall reconfigure. If currently disabled, it is toggled once to enable and reconfigured.

### HTTP Methods
- `POST` - Restart WireGuard client

### Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access endpoint (returns 401 "Unauthorized")
- **ADMIN**: ❌ Cannot access endpoint (returns 401 "Unauthorized")
- **SUPER_ADMIN**: ✅ Can access endpoint

**Role Access:**
- **USER**: ❌ Forbidden - insufficient permissions
- **ADMIN**: ❌ Forbidden - requires SUPER_ADMIN
- **SUPER_ADMIN**: ✅ Can restart WireGuard client with full system permissions

**Example Responses:**

**SUPER_ADMIN Success (Enabled Client Restart):**
```json
{
  "message": "WireGuard VPN restart initiated successfully",
  "opnsenseResponse": {
    "result": "Enabled",
    "uuid": "wg-client-uuid-here"
  }
}
```

**WireGuard Client Not Found (404 Not Found):**
```json
{
  "error": "WireGuard client with UUID wg-client-uuid-here not found."
}
```

### Request Parameters

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `vpnUuid` | string | Yes | Valid OPNsense identifier (`[A-Za-z0-9_-]{1,64}`) | WireGuard client UUID to restart |

### Example Request
```bash
curl -X POST "https://instrada-ogm.example.com/api/opnsense/wireguard/service/restart" \
  -H "Authorization: Bearer your-superadmin-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "vpnUuid": "c3d4e5f6-7a8b-9c0d-1e2f-3a4b5c6d7e8f"
  }'
```

### Security Considerations
- Requires SUPER_ADMIN role
- Only restarts or enables the targeted client without restarting other clients or services
- All operations are logged and tracked via middleware

### Rate Limiting

**Rate Limit Strategy:** User-based

**Default Rate Limits:**
- **Public Endpoints**: N/A (authenticated only)
- **Authenticated Endpoints**: 10 requests per hour
- **API Key Endpoints**: Configurable per key (default: 10/hour)

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
    "limit": 10,
    "remaining": 0,
    "resetTime": 1640995200,
    "windowType": "hourly",
    "retryAfter": 3600
  }
}
```

**Best Practices for Handling Rate Limits:**
1. **Monitor Headers**: Always check rate limit headers in API responses
2. **Exponential Backoff**: Implement exponential backoff when receiving 429 responses
3. **Respect Retry-After**: Use the `Retry-After` header to determine when to retry
4. **Cache Responses**: Cache non-sensitive responses to reduce API calls
5. **Batch Operations**: Use batch endpoints when available to reduce request count
6. **API Key Limits**: Configure appropriate limits for your use case

---

## Common Error Responses

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "Insufficient permissions - ADMIN or SUPER_ADMIN role required"
}
```

### 409 Conflict
```json
{
  "success": false,
  "error": "Service operation already in progress",
  "details": {
    "operationId": "ipsec-restart-12344",
    "status": "running",
    "initiatedAt": "2024-01-15T10:29:00Z"
  }
}
```

### 422 Validation Error
```json
{
  "success": false,
  "error": "Validation failed",
  "details": {
    "field": "timeout",
    "message": "Timeout must be between 30 and 300 seconds"
  }
}
```

### 503 Service Unavailable
```json
{
  "success": false,
  "error": "VPN service temporarily unavailable",
  "details": {
    "service": "ipsec",
    "reason": "Configuration reload in progress"
  }
}
```

### 429 Rate Limited
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "rateLimitInfo": {
    "limit": 10,
    "remaining": 0,
    "resetTime": 1640995200,
    "windowType": "hourly",
    "retryAfter": 3600
  }
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Internal server error",
  "message": "Failed to restart VPN service"
}
```

---

## Usage Notes

### Service Impact
- Restarting VPN services will temporarily disconnect all active connections
- IPsec tunnels may take several minutes to re-establish
- OpenVPN clients will need to reconnect manually
- WireGuard peers should reconnect automatically
- Consider scheduling restarts during maintenance windows

### Operation Monitoring
- All restart operations generate unique operation IDs for tracking
- Service status is monitored before and after restart
- Detailed information about affected connections is provided
- Operations may take varying amounts of time depending on service type

### Performance Considerations
- IPsec restarts typically take 30-60 seconds
- OpenVPN restarts may take 1-3 minutes depending on client count
- WireGuard restarts are usually fastest (15-45 seconds)
- Large numbers of connections may increase restart time

### Security
- All VPN service control endpoints require ADMIN or SUPER_ADMIN role
- All operations are logged for audit purposes
- Rate limiting prevents service disruption attacks
- Dry-run mode available for testing without actual restart

### Best Practices
1. **Use Dry Run**: Test operations with dryRun=true before executing
2. **Monitor Impact**: Check active user count before restarting
3. **Schedule Maintenance**: Plan restarts during low-usage periods
4. **Monitor Status**: Verify service status after restart completes
5. **Handle Timeouts**: Set appropriate timeout values for your environment
6. **Check Rate Limits**: Monitor rate limit headers to avoid throttling

### Integration Examples

#### JavaScript/Node.js Example
```javascript
const axios = require('axios');

async function restartIPSecSession(vpnUuid) {
  try {
    const response = await axios.post(
      'https://instrada-ogm.example.com/api/opnsense/ipsec-service/restart',
      { vpnUuid },
      {
        headers: {
          'Authorization': `Bearer ${process.env.ADMIN_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('IPSec Restart Result:', response.data);
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 429) {
      const retryAfter = error.response.data.rateLimitInfo?.retryAfter || 60;
      console.log(`Rate limited. Retry after ${retryAfter} seconds`);
    } else {
      console.error('Error restarting IPSec session:', error.response?.data?.error || error.message);
    }
  }
}

async function restartOpenVPNSession(vpnUuid) {
  try {
    const response = await axios.post(
      'https://instrada-ogm.example.com/api/opnsense/openvpn-service/restart',
      {
        vpnUuid,
        vpnType: 'OpenVPN'
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.SUPER_ADMIN_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('OpenVPN Restart Result:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error restarting OpenVPN session:', error.response?.data?.error || error.message);
  }
}
```

#### Python Example
```python
import requests
import time

def restart_wireguard_client(api_key, vpn_uuid):
    url = "https://instrada-ogm.example.com/api/opnsense/wireguard/service/restart"
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }
    data = {
        'vpnUuid': vpn_uuid
    }
    
    try:
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 429:
            retry_after = e.response.json().get('rateLimitInfo', {}).get('retryAfter', 60)
            print(f"Rate limited. Retrying after {retry_after} seconds...")
            time.sleep(retry_after)
            return restart_wireguard_client(api_key, vpn_uuid)
        else:
            print(f"Error: {e.response.json().get('error', e)}")
            return None
```

---

## Data Structures Reference

### Service Restart Operation Structure
```json
{
  "operationId": "ipsec-restart-12345",
  "service": "ipsec",
  "action": "restart",
  "status": "completed",
  "initiatedAt": "2024-01-15T10:30:00Z",
  "completedAt": "2024-01-15T10:30:45Z",
  "duration": 45
}
```

### IPSec Tunnel Status Structure
```json
{
  "tunnelStatus": {
    "before": {
      "activeTunnels": 8,
      "totalTunnels": 12,
      "status": "running"
    },
    "after": {
      "activeTunnels": 8,
      "totalTunnels": 12,
      "status": "running"
    }
  },
  "affectedTunnels": [
    {
      "name": "branch-office-1",
      "peer": "203.0.113.10",
      "status": "reconnected",
      "reconnectTime": "2024-01-15T10:30:25Z"
    }
  ]
}
```

### OpenVPN Instance Status Structure
```json
{
  "instanceStatus": {
    "before": {
      "activeInstances": 2,
      "connectedClients": 45,
      "status": "running"
    },
    "after": {
      "activeInstances": 2,
      "connectedClients": 42,
      "status": "running"
    }
  },
  "instances": [
    {
      "name": "vpn-server-1",
      "port": 1194,
      "protocol": "UDP",
      "status": "restarted",
      "clientsBefore": 25,
      "clientsAfter": 23,
      "restartTime": "2024-01-15T10:30:30Z"
    }
  ]
}
```

### WireGuard Interface Status Structure
```json
{
  "interfaceStatus": {
    "before": {
      "activeInterfaces": 3,
      "connectedPeers": 28,
      "status": "running"
    },
    "after": {
      "activeInterfaces": 3,
      "connectedPeers": 27,
      "status": "running"
    }
  },
  "interfaces": [
    {
      "name": "wg0",
      "listenPort": 51820,
      "status": "restarted",
      "peersBefore": 15,
      "peersAfter": 14,
      "restartTime": "2024-01-15T10:30:10Z"
    }
  ]
}
```

### Rate Limit Info Structure
```json
{
  "limit": 10,
  "remaining": 8,
  "resetTime": 1640995200,
  "windowType": "hourly",
  "retryAfter": 3600
}
```

### Conflict Error Structure
```json
{
  "success": false,
  "error": "Service operation already in progress",
  "details": {
    "operationId": "ipsec-restart-12344",
    "status": "running",
    "initiatedAt": "2024-01-15T10:29:00Z"
  }
}

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