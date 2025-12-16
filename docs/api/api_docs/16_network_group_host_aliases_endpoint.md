# Network Group Host Aliases API Endpoint

[⬆️ Back to API Index](API_Index.md) | [📚 Back to Documentation Home](../../DOCUMENTATION_INDEX.md)

## Overview

The `/api/opnsense/network-groups/[uuid]/host-aliases` endpoint provides information about host aliases assigned to a specific network group, including their ARP status for connectivity validation.

## Endpoint Details

**URL**: `/api/opnsense/network-groups/[uuid]/host-aliases`
**Method**: `GET`
**Authentication**: Required (ADMIN/SUPER_ADMIN role)

## Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access network group host aliases (returns "Unauthorized")
- **ADMIN**: ✅ Can read network group host aliases
- **SUPER_ADMIN**: ✅ Can read network group host aliases

**Role Access:**
- **USER**: ❌ Forbidden - insufficient permissions
- **ADMIN**: ✅ Read-only access to network group host aliases
- **SUPER_ADMIN**: ✅ Read-only access to network group host aliases

**Example Responses:**

**ADMIN/SUPER_ADMIN Success:**
```json
[
  {
    "uuid": "alias-uuid-1",
    "name": "HOST_192_168_1_100",
    "content": "192.168.1.100",
    "description": "Production server",
    "enabled": "1",
    "hasArpEntry": true
  },
  {
    "uuid": "alias-uuid-2",
    "name": "HOST_192_168_1_101",
    "content": "192.168.1.101",
    "description": "Development server",
    "enabled": "1",
    "hasArpEntry": false
  }
]
```

**USER Role Failure:**
```json
{
  "message": "Unauthorized"
}
```

## Parameters

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uuid` | string | Yes | The UUID of the network group |

## Response Format

### Success Response (200)

Returns an array of host aliases assigned to the specified network group.

```json
[
  {
    "uuid": "alias-uuid-1",
    "name": "HOST_192_168_1_100",
    "content": "192.168.1.100",
    "description": "Production server",
    "enabled": "1",
    "hasArpEntry": true
  },
  {
    "uuid": "alias-uuid-2", 
    "name": "HOST_192_168_1_101",
    "content": "192.168.1.101",
    "description": "Development server",
    "enabled": "1",
    "hasArpEntry": false
  }
]
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `uuid` | string | Unique identifier for the host alias |
| `name` | string | Name of the host alias |
| `content` | string | IP address(es) associated with the alias |
| `description` | string | Description of the host alias |
| `enabled` | string | Whether the alias is enabled ("1") or disabled ("0") |
| `hasArpEntry` | boolean | Whether the IP has an active ARP entry (device is online) |

### Error Responses

#### 401 Unauthorized
```json
{
  "message": "Unauthorized"
}
```

#### 404 Not Found
```json
{
  "error": "Network group not found"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Failed to fetch host aliases for network group"
}
```

## ARP Status Integration

The `hasArpEntry` field indicates whether the host alias has an active ARP entry, meaning the device is currently online and reachable on the network.

### ARP Status Logic

1. **Fetch ARP Table**: The endpoint retrieves the current ARP table from OPNsense
2. **IP Matching**: For each host alias, it checks if any of its IP addresses appear in the ARP table
3. **Multi-IP Support**: If a host alias contains multiple IPs (comma or space separated), it's marked as online if ANY IP has an ARP entry
4. **Real-time Data**: ARP status reflects the current network state at the time of the API call

### Use Cases

- **Validation**: Check if disabling a network group would affect online devices
- **Connectivity Warnings**: Alert users before making changes that could impact active connections
- **Network Monitoring**: Identify which host aliases represent currently active devices

## Example Usage

### Basic Request
```bash
curl -X GET "https://your-domain.com/api/opnsense/network-groups/550e8400-e29b-41d4-a716-446655440000/host-aliases" \
  -H "Authorization: Bearer your-api-token" \
  -H "Content-Type: application/json"
```

### Response with Mixed Online/Offline Status
```json
[
  {
    "uuid": "alias-1",
    "name": "PROD_SERVER",
    "content": "192.168.1.10",
    "description": "Production web server",
    "enabled": "1",
    "hasArpEntry": true
  },
  {
    "uuid": "alias-2",
    "name": "BACKUP_SERVER", 
    "content": "192.168.1.20",
    "description": "Backup server (powered off)",
    "enabled": "1",
    "hasArpEntry": false
  },
  {
    "uuid": "alias-3",
    "name": "MULTI_IP_DEVICE",
    "content": "192.168.1.30, 192.168.1.31",
    "description": "Device with multiple IPs",
    "enabled": "1",
    "hasArpEntry": true
  }
]
```

## Integration with Validation System

This endpoint is used by the Network Display Mappings validation system to:

1. **Prevent Accidental Disconnections**: Warn users when trying to disable groups with online devices
2. **Show Connectivity Impact**: Display which devices would be affected by group changes
3. **Enable Informed Decisions**: Provide real-time network status for better decision making

## Rate Limiting

This endpoint follows the standard API rate limiting rules. For high-frequency monitoring, consider caching results appropriately.

## Security Considerations

- Requires ADMIN or SUPER_ADMIN authentication
- Returns only host aliases assigned to the specified network group
- ARP data reflects current network state and may contain sensitive network topology information

---

## API Navigation

### API Documentation
- [🔍 API Index](API_Index.md) - Complete API endpoint index
- [🔑 Authentication](02_authentication_endpoints.md) - Authentication methods

### Related API Categories
- [🔗 OPNsense Endpoints](07_opnsense_endpoints.md) - OPNsense firewall integration
- [👥 Host Group Management](08_host_group_management_endpoints.md) - Host group management
- [📊 Analytics Endpoints](11_analytics_endpoints.md) - Analytics and reporting

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

**Last Updated**: 2025-11-06 | **API Version**: v1.0 | **Category**: API Documentation
