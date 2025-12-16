# VPN Service Control API Endpoints

[⬆️ Back to API Index](API_Index.md) | [📚 Back to Documentation Home](../../DOCUMENTATION_INDEX.md)

## Overview
This document covers the VPN service control API endpoints in InstradaOGM. These endpoints provide administrative functionality for managing and restarting VPN services including IPsec, OpenVPN, and WireGuard services for administrative users.

---

## Authentication Requirements

### VPN Service Control Endpoints
- **Authentication**: Valid session or API key
- **Role**: ADMIN or SUPER_ADMIN required
- **Access**: VPN service management and control operations

---

## POST /api/opnsense/ipsec-service/restart

Restart the IPsec VPN service on the OPNsense firewall. This operation will terminate all active IPsec tunnels and re-establish them according to the current configuration.

### HTTP Methods
- `POST` - Restart IPsec service

### Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access endpoint (returns "Unauthorized")
- **ADMIN**: ✅ Can access endpoint
- **SUPER_ADMIN**: ✅ Can access endpoint

**Role Access:**
- **USER**: ❌ Forbidden - insufficient permissions
- **ADMIN**: ✅ Can restart IPsec service with administrative permissions
- **SUPER_ADMIN**: ✅ Can restart IPsec service with full system permissions

**Example Responses:**

**ADMIN/SUPER_ADMIN Success:**
```json
{
  "success": true,
  "data": {
    "operationId": "ipsec-restart-12345",
    "service": "ipsec",
    "action": "restart",
    "status": "completed",
    "initiatedAt": "2024-01-15T10:30:00Z",
    "completedAt": "2024-01-15T10:30:45Z",
    "duration": 45,
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
      },
      {
        "name": "branch-office-2",
        "peer": "203.0.113.20",
        "status": "reconnected",
        "reconnectTime": "2024-01-15T10:30:30Z"
      }
    ]
  }
}
```

**USER Role Failure:**
```json
{
  "success": false,
  "error": "Unauthorized: ADMIN or SUPER_ADMIN role required"
}
```

### Request Parameters

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `force` | boolean | No | Must be true or false | Force restart without confirmation (default: false) |
| `timeout` | number | No | Must be between 30 and 300 seconds | Maximum time to wait for restart (default: 120) |
| `dryRun` | boolean | No | Must be true or false | Simulate restart without executing (default: false) |
| `tunnelFilter` | array | No | Valid tunnel names | Restart specific tunnels only (default: all tunnels) |

### Example Request
```bash
curl -X POST "https://instrada-ogm.example.com/api/opnsense/ipsec-service/restart" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "force": true,
    "timeout": 120,
    "dryRun": false
  }'
```

### Security Considerations
- Requires ADMIN or SUPER_ADMIN role
- Service restart will temporarily terminate VPN connections
- All operations are logged for audit purposes
- Rate limiting applies to prevent service disruption
- Consider impact on active users before restarting

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

Restart the OpenVPN service on the OPNsense firewall. This operation will disconnect all active OpenVPN clients and restart the service according to the current configuration.

### HTTP Methods
- `POST` - Restart OpenVPN service

### Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access endpoint (returns "Unauthorized")
- **ADMIN**: ✅ Can access endpoint
- **SUPER_ADMIN**: ✅ Can access endpoint

**Role Access:**
- **USER**: ❌ Forbidden - insufficient permissions
- **ADMIN**: ✅ Can restart OpenVPN service with administrative permissions
- **SUPER_ADMIN**: ✅ Can restart OpenVPN service with full system permissions

**Example Responses:**

**ADMIN/SUPER_ADMIN Success:**
```json
{
  "success": true,
  "data": {
    "operationId": "openvpn-restart-12345",
    "service": "openvpn",
    "action": "restart",
    "status": "completed",
    "initiatedAt": "2024-01-15T10:30:00Z",
    "completedAt": "2024-01-15T10:31:15Z",
    "duration": 75,
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
      },
      {
        "name": "vpn-server-2",
        "port": 443,
        "protocol": "TCP",
        "status": "restarted",
        "clientsBefore": 20,
        "clientsAfter": 19,
        "restartTime": "2024-01-15T10:30:45Z"
      }
    ]
  }
}
```

**USER Role Failure:**
```json
{
  "success": false,
  "error": "Unauthorized: ADMIN or SUPER_ADMIN role required"
}
```

### Request Parameters

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `force` | boolean | No | Must be true or false | Force restart without confirmation (default: false) |
| `timeout` | number | No | Must be between 30 and 300 seconds | Maximum time to wait for restart (default: 180) |
| `dryRun` | boolean | No | Must be true or false | Simulate restart without executing (default: false) |
| `instanceFilter` | array | No | Valid instance names | Restart specific instances only (default: all instances) |
| `gracefulDisconnect` | boolean | No | Must be true or false | Gracefully disconnect clients before restart (default: true) |

### Example Request
```bash
curl -X POST "https://instrada-ogm.example.com/api/opnsense/openvpn-service/restart" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "force": true,
    "timeout": 180,
    "dryRun": false,
    "gracefulDisconnect": true
  }'
```

### Security Considerations
- Requires ADMIN or SUPER_ADMIN role
- Service restart will disconnect all active VPN clients
- All operations are logged for audit purposes
- Rate limiting applies to prevent service disruption
- Consider impact on active users before restarting

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

## POST /api/opnsense/wireguard/service/restart

Restart the WireGuard VPN service on the OPNsense firewall. This operation will disconnect all active WireGuard peers and restart the service according to the current configuration.

### HTTP Methods
- `POST` - Restart WireGuard service

### Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access endpoint (returns "Unauthorized")
- **ADMIN**: ✅ Can access endpoint
- **SUPER_ADMIN**: ✅ Can access endpoint

**Role Access:**
- **USER**: ❌ Forbidden - insufficient permissions
- **ADMIN**: ✅ Can restart WireGuard service with administrative permissions
- **SUPER_ADMIN**: ✅ Can restart WireGuard service with full system permissions

**Example Responses:**

**ADMIN/SUPER_ADMIN Success:**
```json
{
  "success": true,
  "data": {
    "operationId": "wireguard-restart-12345",
    "service": "wireguard",
    "action": "restart",
    "status": "completed",
    "initiatedAt": "2024-01-15T10:30:00Z",
    "completedAt": "2024-01-15T10:30:30Z",
    "duration": 30,
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
      },
      {
        "name": "wg1",
        "listenPort": 51821,
        "status": "restarted",
        "peersBefore": 8,
        "peersAfter": 8,
        "restartTime": "2024-01-15T10:30:15Z"
      },
      {
        "name": "wg2",
        "listenPort": 51822,
        "status": "restarted",
        "peersBefore": 5,
        "peersAfter": 5,
        "restartTime": "2024-01-15T10:30:20Z"
      }
    ]
  }
}
```

**USER Role Failure:**
```json
{
  "success": false,
  "error": "Unauthorized: ADMIN or SUPER_ADMIN role required"
}
```

### Request Parameters

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `force` | boolean | No | Must be true or false | Force restart without confirmation (default: false) |
| `timeout` | number | No | Must be between 30 and 300 seconds | Maximum time to wait for restart (default: 60) |
| `dryRun` | boolean | No | Must be true or false | Simulate restart without executing (default: false) |
| `interfaceFilter` | array | No | Valid interface names | Restart specific interfaces only (default: all interfaces) |
| `preserveHandshakes` | boolean | No | Must be true or false | Attempt to preserve active handshakes (default: false) |

### Example Request
```bash
curl -X POST "https://instrada-ogm.example.com/api/opnsense/wireguard/service/restart" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "force": true,
    "timeout": 60,
    "dryRun": false,
    "preserveHandshakes": false
  }'
```

### Security Considerations
- Requires ADMIN or SUPER_ADMIN role
- Service restart will disconnect all active WireGuard peers
- All operations are logged for audit purposes
- Rate limiting applies to prevent service disruption
- Consider impact on active users before restarting

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

async function restartIPSecService(force = false, timeout = 120) {
  try {
    const response = await axios.post(
      'https://instrada-ogm.example.com/api/opnsense/ipsec-service/restart',
      {
        force: force,
        timeout: timeout,
        dryRun: false
      },
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
      const retryAfter = error.response.data.rateLimitInfo.retryAfter;
      console.log(`Rate limited. Retry after ${retryAfter} seconds`);
    } else if (error.response && error.response.status === 409) {
      console.log('Operation already in progress:', error.response.data);
    } else {
      console.error('Error restarting IPSec service:', error.message);
    }
  }
}

async function restartOpenVPNService(instanceFilter = null) {
  try {
    const requestBody = {
      force: true,
      timeout: 180,
      dryRun: false,
      gracefulDisconnect: true
    };
    
    if (instanceFilter) {
      requestBody.instanceFilter = instanceFilter;
    }
    
    const response = await axios.post(
      'https://instrada-ogm.example.com/api/opnsense/openvpn-service/restart',
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${process.env.ADMIN_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('OpenVPN Restart Result:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error restarting OpenVPN service:', error.message);
  }
}
```

#### Python Example
```python
import requests
import time

def restart_wireguard_service(api_key, interface_filter=None, timeout=60):
    url = "https://instrada-ogm.example.com/api/opnsense/wireguard/service/restart"
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }
    data = {
        'force': True,
        'timeout': timeout,
        'dryRun': False,
        'preserveHandshakes': False
    }
    
    if interface_filter:
        data['interfaceFilter'] = interface_filter
    
    try:
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 429:
            retry_after = e.response.json().get('rateLimitInfo', {}).get('retryAfter', 60)
            print(f"Rate limited. Retrying after {retry_after} seconds...")
            time.sleep(retry_after)
            return restart_wireguard_service(api_key, interface_filter, timeout)
        elif e.response.status_code == 409:
            print("Operation already in progress")
            return e.response.json()
        else:
            print(f"Error: {e}")
            return None

def dry_run_restart(api_key, service_type):
    """Perform a dry run of service restart"""
    service_urls = {
        'ipsec': 'https://instrada-ogm.example.com/api/opnsense/ipsec-service/restart',
        'openvpn': 'https://instrada-ogm.example.com/api/opnsense/openvpn-service/restart',
        'wireguard': 'https://instrada-ogm.example.com/api/opnsense/wireguard/service/restart'
    }
    
    if service_type not in service_urls:
        print(f"Invalid service type: {service_type}")
        return None
    
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }
    data = {
        'dryRun': True,
        'force': False
    }
    
    try:
        response = requests.post(service_urls[service_type], headers=headers, json=data)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as e:
        print(f"Error in dry run: {e}")
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