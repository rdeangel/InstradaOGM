# Host Alias Last Operation Endpoint

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
curl -X GET "${SERVER_URL}/api/opnsense/host-alias-last-assignment?ipAddress=192.168.1.100" \
  -H "Authorization: Bearer ${API_KEY}"
```

## Overview

The `/api/opnsense/host-alias-last-assignment` endpoint retrieves the most recent group assignment/unassignment operation for a given IP address from the AuditLog table. This endpoint supports both authenticated and unauthenticated access with different permission levels.

## Endpoint Details

**URL**: `/api/opnsense/host-alias-last-assignment`  
**Method**: `GET`  
**Authentication**: Mixed (Optional for self-service, Required for admin access)

## Authentication & Authorization

### Authenticated Users
- Can query any IP address within their device management scope
- Bypass Self-Service Access Control network rules
- Subject only to global settings and device management scope
- Must have valid session or API key
- **Receive `userName` field in responses** (shows who performed the operation)

### Unauthenticated Users
- Can only query their own detected IP address
- Subject to Self-Service Access Control network include/exclude rules
- Blocked if self-service is globally disabled (`ENABLE_SELF_SERVICE=false`)
- IP address must match the client's detected IP (via `x-forwarded-for` or `x-real-ip` headers)
- **Do NOT receive `userName` field in responses** (privacy protection)

## Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ipAddress` | string | Yes | The IP address to query for last operation |
| `excludeMultiSelectGroups` | boolean | No | Filter out operations involving MultiSelect groups (default: `false`) |

**Parameter Details:**

- **ipAddress**:
  - **Validation**: Must be a valid IPv4 or IPv6 address
  - **Example**: `"192.168.1.100"`

- **excludeMultiSelectGroups**:
  - **Use Case**: Self-service contexts when Group Types are enabled but Self-Service Multi-Select is disabled
  - **Behavior**: When `true`, filters operations to find the first one that doesn't involve MultiSelect groups
  - **Example**: `true`
  - **Filtering Rules**:
    - **ASSIGN operations**: Excluded if target group is MultiSelect
    - **UNASSIGN operations**: Excluded if source group is MultiSelect
    - **MOVE operations**: Excluded if target group is MultiSelect
    - **BATCH_ASSIGN operations**: Excluded if target group is MultiSelect
    - **BATCH_UNASSIGN operations**: Excluded if all groups are MultiSelect
    - **UNASSIGN_ALL operations**: Excluded if only MultiSelect groups were involved

## Response Format

### Success Response (200)

Returns information about the most recent group operation for the specified IP address.

**Authenticated User Response (Move Operation):**
```json
{
  "timestamp": "2025-01-19T14:30:45.123Z",
  "operationType": "move",
  "action": "OPNSENSE_GROUP_IP_MOVE_SUCCESS",
  "groupName": "Office Network",
  "userName": "John Doe",
  "sourceGroups": [
    {
      "id": "group-uuid-1",
      "name": "Guest_Network",
      "friendlyName": "Guest Network",
      "groupType": "SingleSelect"
    }
  ],
  "targetGroup": {
    "id": "group-uuid-2",
    "name": "Office_Network",
    "friendlyName": "Office Network",
    "groupType": "SingleSelect"
  }
}
```

**Unauthenticated User Response (Move Operation):**
```json
{
  "timestamp": "2025-01-19T14:30:45.123Z",
  "operationType": "move",
  "action": "OPNSENSE_GROUP_IP_MOVE_SUCCESS",
  "groupName": "Office Network",
  "sourceGroups": [
    {
      "id": "group-uuid-1",
      "name": "Guest_Network",
      "friendlyName": "Guest Network",
      "groupType": "SingleSelect"
    }
  ],
  "targetGroup": {
    "id": "group-uuid-2",
    "name": "Office_Network",
    "friendlyName": "Office Network",
    "groupType": "SingleSelect"
  }
}
```
**Note:** The `userName` field is excluded from unauthenticated responses for privacy protection.

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | string (ISO 8601) | Date and time of the last operation |
| `operationType` | string | Type of operation: `assign`, `unassign`, `move`, `batch_assign`, `batch_unassign`, `unassign_all` |
| `action` | string | Full audit action name from the AuditLog |
| `groupName` | string \| null | Friendly name or name of the group involved in the operation (kept for backward compatibility) |
| `userName` | string \| null | Name or email of the user who performed the operation (**Only included for authenticated users**) |
| `sourceGroups` | array \| undefined | Array of group objects that the IP was removed from (for `move` and `unassign` operations). Each object contains `id`, `name`, `friendlyName`, and `groupType` |
| `targetGroup` | object \| undefined | Group object that the IP was assigned to (for `assign` and `move` operations). Contains `id`, `name`, `friendlyName`, and `groupType` |
| `allGroups` | array \| undefined | Array of all group objects involved (for `batch_assign`, `batch_unassign`, and `unassign_all` operations). Each object contains `id`, `name`, `friendlyName`, and `groupType` |
| `operationCount` | number \| undefined | Total number of operations performed (for batch operations) |

### No Operation Found Response (200)

When no assignment operations exist for the IP address:

**Authenticated User Response:**
```json
{
  "timestamp": null,
  "operationType": null,
  "action": null,
  "groupName": null,
  "userName": null
}
```

**Unauthenticated User Response:**
```json
{
  "timestamp": null,
  "operationType": null,
  "action": null,
  "groupName": null
}
```

### Error Responses

#### 400 Bad Request
Missing required parameter:
```json
{
  "error": "ipAddress parameter is required"
}
```

#### 403 Forbidden (Self-Service Disabled)
When self-service is globally disabled for unauthenticated users:
```json
{
  "error": "Forbidden: Self-service functionality is disabled"
}
```

#### 403 Forbidden (IP Mismatch)
When unauthenticated user queries a different IP:
```json
{
  "error": "Forbidden: You can only query for your own device."
}
```

#### 500 Internal Server Error
Server-side error:
```json
{
  "error": "Internal server error"
}
```

## Operation Types

The `operationType` field can have the following values:

| Operation Type | Description | Enhanced Fields Available | Display Format |
|----------------|-------------|---------------------------|----------------|
| `assign` | Single IP assigned to a group | `targetGroup` | "Assigned to 'Group Name'" |
| `unassign` | Single IP unassigned from a group | `sourceGroups` | "Unassigned from 'Group Name'" |
| `move` | IP moved from one group to another | `sourceGroups`, `targetGroup` | "Moved from 'Source Group' → 'Target Group'" |
| `batch_assign` | Multiple IPs assigned to groups | `allGroups`, `operationCount` | "Batch assigned to N groups (Group1, Group2, +X more)" |
| `batch_unassign` | Multiple IPs unassigned from groups | `allGroups`, `operationCount` | "Batch unassigned from N groups (Group1, Group2, +X more)" |
| `unassign_all` | IP unassigned from all groups | `allGroups`, `operationCount` | "Unassigned from all groups (N total: Group1, Group2, +X more)" |

## Usage Examples

### Example 1: Authenticated User Query

**Request:**
```bash
curl -X GET "${SERVER_URL}/api/opnsense/host-alias-last-assignment?ipAddress=192.168.1.100" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json"
```

**Success Response:**
```json
{
  "timestamp": "2025-01-19T14:30:45.123Z",
  "operationType": "assign",
  "action": "OPNSENSE_GROUP_IP_ASSIGN_SUCCESS",
  "groupName": "VPN Users",
  "userName": "admin@example.com",
  "targetGroup": {
    "id": "group-uuid-3",
    "name": "VPN_Users",
    "friendlyName": "VPN Users",
    "groupType": "SingleSelect"
  }
}
```

### Example 2: Unauthenticated Self-Service Query

**Request:**
```bash
# User queries their own IP (must match client IP)
curl -X GET "${SERVER_URL}/api/opnsense/host-alias-last-assignment?ipAddress=192.168.1.65" \
  -H "Content-Type: application/json"
```

**Success Response:**
```json
{
  "timestamp": "2025-01-19T10:15:30.456Z",
  "operationType": "move",
  "action": "OPNSENSE_GROUP_IP_MOVE_SUCCESS",
  "groupName": "Guest Network",
  "sourceGroups": [
    {
      "id": "group-uuid-4",
      "name": "Office_Network",
      "friendlyName": "Office Network",
      "groupType": "SingleSelect"
    }
  ],
  "targetGroup": {
    "id": "group-uuid-5",
    "name": "Guest_Network",
    "friendlyName": "Guest Network",
    "groupType": "SingleSelect"
  }
}
```
**Note:** The `userName` field is not included in unauthenticated responses.

### Example 3: Batch Assign Operation

**Response for batch assignment:**
```json
{
  "timestamp": "2025-01-19T16:45:12.789Z",
  "operationType": "batch_assign",
  "action": "OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS",
  "groupName": "Office Network (+3 more)",
  "userName": "John Doe",
  "allGroups": [
    {
      "id": "group-uuid-6",
      "name": "Office_Network",
      "friendlyName": "Office Network",
      "groupType": "SingleSelect"
    },
    {
      "id": "group-uuid-7",
      "name": "VPN_Users",
      "friendlyName": "VPN Users",
      "groupType": "SingleSelect"
    },
    {
      "id": "group-uuid-8",
      "name": "Dev_Team",
      "friendlyName": "Dev Team",
      "groupType": "SingleSelect"
    },
    {
      "id": "group-uuid-9",
      "name": "QA_Team",
      "friendlyName": "QA Team",
      "groupType": "MultiSelect"
    }
  ],
  "operationCount": 4
}
```

### Example 4: Unassign All Operation

**Response for unassign all:**
```json
{
  "timestamp": "2025-01-19T12:00:00.000Z",
  "operationType": "unassign_all",
  "action": "OPNSENSE_GROUP_IP_UNASSIGN_ALL_SUCCESS",
  "groupName": "4 groups",
  "userName": "admin@example.com",
  "allGroups": [
    {
      "id": "group-uuid-10",
      "name": "Office_Network",
      "friendlyName": "Office Network",
      "groupType": "SingleSelect"
    },
    {
      "id": "group-uuid-11",
      "name": "VPN_Users",
      "friendlyName": "VPN Users",
      "groupType": "SingleSelect"
    },
    {
      "id": "group-uuid-12",
      "name": "Guest_Network",
      "friendlyName": "Guest Network",
      "groupType": "SingleSelect"
    },
    {
      "id": "group-uuid-13",
      "name": "Dev_Team",
      "friendlyName": "Dev Team",
      "groupType": "MultiSelect"
    }
  ],
  "operationCount": 4
}
```

### Example 5: Query with MultiSelect Filtering

**Request (Self-Service with MultiSelect Filtering):**
```bash
# Query own IP with MultiSelect group operations filtered out
# Used when Group Types are enabled but Self-Service Multi-Select is disabled
curl -X GET "${SERVER_URL}/api/opnsense/host-alias-last-assignment?ipAddress=192.168.1.100&excludeMultiSelectGroups=true"
```

**Response (MultiSelect operation filtered out, showing previous SingleSelect operation):**
```json
{
  "timestamp": "2025-01-18T10:15:30.000Z",
  "operationType": "move",
  "action": "OPNSENSE_GROUP_IP_MOVE_SUCCESS",
  "groupName": "Office Users",
  "sourceGroups": [
    {
      "id": "group-uuid-2",
      "name": "remote_users",
      "friendlyName": "Remote Users",
      "groupType": "SingleSelect"
    }
  ],
  "targetGroup": {
    "id": "group-uuid-3",
    "name": "office_users",
    "friendlyName": "Office Users",
    "groupType": "SingleSelect"
  }
}
```

**Note**: When `excludeMultiSelectGroups=true`, the endpoint fetches up to 50 recent operations and returns the first one that doesn't involve MultiSelect groups. If all recent operations involve MultiSelect groups, it returns `null` values.

## Security Considerations

1. **IP Validation**: Unauthenticated requests are validated against the client's detected IP address
2. **Self-Service Control**: Respects global self-service settings and network access control rules
3. **Rate Limiting**: Authenticated requests are subject to rate limiting
4. **Audit Trail**: All operations are logged in the AuditLog table
5. **Data Privacy**: Users can only see operations for IPs they have access to

## Related Endpoints

- `/api/opnsense/host-alias-management` - Manage host aliases
- `/api/opnsense/ip-group-membership` - Query IP group membership
- `/api/opnsense/host-group-management` - Manage host-group assignments
- `/api/analytics/audit-logs` - View detailed audit logs

## Notes

- The endpoint queries the `AuditLog` table for the most recent operation
- Only successful operations are included (actions ending in `_SUCCESS` or `_PARTIAL`)
- **Privacy Protection**: The `userName` field is excluded from unauthenticated responses to protect user privacy
- For authenticated responses, the `userName` field may be null if the operation was performed by the system
- **Enhanced Operation Details**: The response now includes additional fields (`sourceGroups`, `targetGroup`, `allGroups`, `operationCount`) that provide more detailed information about the operation
- **Backward Compatibility**: The `groupName` field is maintained for backward compatibility with existing clients
- **Move Operations**: For move operations, both `sourceGroups` (where the IP was moved from) and `targetGroup` (where it was moved to) are included
- **Batch Move Operations**: Batch operations with `removedFromGroups` are automatically detected and converted to `move` operations for consistent display. This commonly occurs when using the Self-Service page with SingleSelect groups.
- **Batch Operations**: For batch operations, `allGroups` contains all groups involved, and `operationCount` shows the total number of operations
- **Group Information**: Each group object includes `id`, `name`, `friendlyName`, and `groupType` fields for flexible display options
- **Group Type Field**: The `groupType` field indicates whether a group is `SingleSelect` or `MultiSelect`, enabling client-side filtering and analytics
- **Audit Log Storage**: The `groupType` is stored in all group objects within audit logs (targetGroup, sourceGroups, allGroups, removedFromGroups) for accurate historical filtering
- Timestamps are returned in ISO 8601 format (UTC)

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

