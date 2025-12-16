# Self-Service Group Types API Documentation

[⬆️ Back to API Index](API_Index.md) | [📚 Back to Documentation Home](../../DOCUMENTATION_INDEX.md)

## Overview

This document provides comprehensive documentation for how group types (SingleSelect/MultiSelect) affect self-service API endpoints and operations. Self-service operations have different behaviors based on the `enableGroupTypes` and `enableSelfServiceMultiSelect` global settings.

## Variables

Replace the following variables in the examples below:

- `{{SERVER_URL}}` - Your server URL (e.g., `https://instrada-ogm.example.com`)
- `{{CLIENT_IP}}` - Client IP address for self-service validation

## Configuration Impact on Self-Service APIs

### Setting Combinations

#### Move-Only Mode
```json
{
  "enableGroupTypes": false,
  "enableSelfServiceMultiSelect": false
}
```
**Behavior**: All groups behave as SingleSelect, assignment replaces all memberships

#### Controlled Rollout
```json
{
  "enableGroupTypes": true,
  "enableSelfServiceMultiSelect": false
}
```
**Behavior**: Only SingleSelect groups visible to self-service, MultiSelect groups hidden

#### Full Functionality
```json
{
  "enableGroupTypes": true,
  "enableSelfServiceMultiSelect": true
}
```
**Behavior**: All group types visible and functional for self-service

## Self-Service Group Filtering

### GET /api/self-service/groups

**Description**: Retrieve groups available for self-service operations, filtered by group type settings.

**Authentication**: Not required (IP-based validation)

**Parameters**:
- `clientIp` (string, required): Client IP address for validation
  - **Validation**: Must be a valid IPv4 or IPv6 address
  - **Example**: `"192.168.1.100"`

#### Move-Only Mode Response
```bash
curl -X GET "{{SERVER_URL}}/api/self-service/groups" \
  -H "X-Forwarded-For: {{CLIENT_IP}}" \
  -H "Content-Type: application/json"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "groups": [
      {
        "id": "group1",
        "name": "VPN Users",
        "groupType": null,
        "visible": true,
        "assignmentBehavior": "replace"
      },
      {
        "id": "group2", 
        "name": "Admin Access",
        "groupType": null,
        "visible": true,
        "assignmentBehavior": "replace"
      }
    ],
    "configuration": {
      "enableGroupTypes": false,
      "enableSelfServiceMultiSelect": false,
      "assignmentMode": "moveOnly"
    }
  }
}
```

#### Controlled Rollout Response
**Response**:
```json
{
  "success": true,
  "data": {
    "groups": [
      {
        "id": "group1",
        "name": "VPN Users",
        "groupType": "SingleSelect",
        "visible": true,
        "assignmentBehavior": "smartMove"
      }
    ],
    "hiddenGroups": [
      {
        "id": "group2",
        "name": "Admin Access", 
        "groupType": "MultiSelect",
        "visible": false,
        "reason": "MultiSelect groups hidden from self-service"
      }
    ],
    "configuration": {
      "enableGroupTypes": true,
      "enableSelfServiceMultiSelect": false,
      "assignmentMode": "filtered"
    }
  }
}
```

#### Full Functionality Response
**Response**:
```json
{
  "success": true,
  "data": {
    "groups": [
      {
        "id": "group1",
        "name": "VPN Users",
        "groupType": "SingleSelect", 
        "visible": true,
        "assignmentBehavior": "smartMove"
      },
      {
        "id": "group2",
        "name": "Admin Access",
        "groupType": "MultiSelect",
        "visible": true, 
        "assignmentBehavior": "additive"
      }
    ],
    "configuration": {
      "enableGroupTypes": true,
      "enableSelfServiceMultiSelect": true,
      "assignmentMode": "full"
    }
  }
}
```

## Self-Service Group Assignment

### POST /api/self-service/assign-group

**Description**: Assign a device to a group using self-service, with behavior varying by group type configuration.

**Authentication**: Not required (IP-based validation)

**Request Body**:
```json
{
  "hostAliasId": "host-uuid",
  "groupId": "group-uuid",
  "clientIp": "192.168.1.100"
}
```

#### Move-Only Mode Assignment

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/self-service/assign-group" \
  -H "X-Forwarded-For: {{CLIENT_IP}}" \
  -H "Content-Type: application/json" \
  -d '{
    "hostAliasId": "host123",
    "groupId": "group1"
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "operation": "replace",
    "message": "Device moved to VPN Users group",
    "hostAlias": {
      "id": "host123",
      "name": "My Device"
    },
    "previousGroups": ["group2"],
    "currentGroups": ["group1"],
    "assignmentDetails": {
      "mode": "moveOnly",
      "moveFromExisting": true,
      "preservedGroups": []
    }
  }
}
```

#### Smart Assignment (SingleSelect)

**Response**:
```json
{
  "success": true,
  "data": {
    "operation": "smartMove",
    "message": "Device moved to VPN Users group",
    "hostAlias": {
      "id": "host123", 
      "name": "My Device"
    },
    "removedGroups": ["oldSingleSelectGroup"],
    "preservedGroups": ["multiSelectGroup1"],
    "addedGroups": ["group1"],
    "currentGroups": ["group1", "multiSelectGroup1"],
    "assignmentDetails": {
      "mode": "smart",
      "groupType": "SingleSelect",
      "preservedMultiSelect": true
    }
  }
}
```

#### Additive Assignment (MultiSelect)

**Response** (when `enableSelfServiceMultiSelect: true`):
```json
{
  "success": true,
  "data": {
    "operation": "add",
    "message": "Device added to Admin Access group",
    "hostAlias": {
      "id": "host123",
      "name": "My Device"
    },
    "addedGroups": ["group2"],
    "currentGroups": ["group1", "group2"],
    "assignmentDetails": {
      "mode": "additive",
      "groupType": "MultiSelect",
      "conflictResolution": "none"
    }
  }
}
```

## Error Responses

### 403 Forbidden - MultiSelect Not Allowed
```json
{
  "success": false,
  "error": "MultiSelect groups not available for self-service",
  "details": {
    "groupId": "group2",
    "groupType": "MultiSelect",
    "setting": "enableSelfServiceMultiSelect: false",
    "suggestion": "Contact administrator to enable MultiSelect for self-service"
  }
}
```

### 400 Bad Request - Invalid Group Type
```json
{
  "success": false,
  "error": "Invalid group configuration",
  "details": {
    "groupId": "group1",
    "issue": "Group type not recognized",
    "validTypes": ["SingleSelect", "MultiSelect"]
  }
}
```

### 429 Rate Limited
```json
{
  "success": false,
  "error": "Rate limit exceeded for self-service operations",
  "retryAfter": 60,
  "details": {
    "clientIp": "192.168.1.100",
    "limit": "10 requests per minute"
  }
}
```

## Implementation Notes

### Client-Side Considerations

1. **Settings Polling**: Poll `/api/settings/global-public` to get current group type configuration
2. **Group Filtering**: Filter available groups based on `enableSelfServiceMultiSelect` setting
3. **UI Adaptation**: Show/hide group type indicators based on `enableGroupTypes`
4. **Assignment Logic**: Use appropriate assignment behavior based on group type

### Security Considerations

1. **IP Validation**: All self-service operations validate client IP against allowed networks
2. **Rate Limiting**: Self-service endpoints have stricter rate limits
3. **Audit Logging**: All self-service operations are logged for security monitoring
4. **Group Visibility**: MultiSelect groups are properly hidden when disabled for self-service

### Performance Optimization

1. **Caching**: Group type settings are cached for performance
2. **Filtering**: Server-side filtering reduces payload size for self-service clients
3. **Batch Operations**: Multiple group assignments can be batched when supported


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
