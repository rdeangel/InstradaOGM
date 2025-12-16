# OPNsense Advanced Endpoints

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
curl -X GET "${SERVER_URL}/api/opnsense/host-alias-last-assignment" \
  -H "Authorization: Bearer ${API_KEY}"
```

This section covers advanced OPNsense API endpoints for host alias management, administrative operations, and network group host alias retrieval.

## Role-Based Access Control

**Authentication Required:** Yes (except where noted)

**Role Requirements:**
- **Unauthenticated**: ❌ Authentication required for all endpoints
- **USER**: ❌ Insufficient permissions for all endpoints
- **ADMIN**: ✅ Can access all advanced OPNsense endpoints
- **SUPER_ADMIN**: ✅ Can access all advanced OPNsense endpoints

**Role Access:**
- **Unauthenticated**: ❌ Authentication required - Must provide valid session or API key
- **USER**: ❌ Insufficient permissions - Requires ADMIN or SUPER_ADMIN role
- **ADMIN**: ✅ Can access all advanced OPNsense endpoints with administrative permissions
- **SUPER_ADMIN**: ✅ Can access all advanced OPNsense endpoints with full system permissions

**Example Responses:**

**ADMIN/SUPER_ADMIN Success:**
```json
{
  "success": true,
  "data": {
    "hostAlias": {
      "id": "alias-uuid-1",
      "name": "Office_Desk_Screen",
      "content": "192.168.1.65",
      "description": "Office desktop computer",
      "enabled": true,
      "uuid": "45653f16-70b0-4a44-b311-abda1da4c2b5",
      "lastAssignment": {
        "timestamp": "2025-01-15T10:30:00.000Z",
        "assignedBy": "admin-user-id",
        "previousAssignment": "192.168.1.64"
      }
    }
  }
}
```

**Access Denied (USER Role):**
```json
{
  "error": "Insufficient permissions"
}
```

**Access Denied (Unauthenticated):**
```json
{
  "error": "Authentication required"
}
```

## Rate Limiting

**Rate Limit Strategy:** User-based

**Default Rate Limits:**
- **Public Endpoints**: N/A (authenticated only)
- **Authenticated Endpoints**: 1000 requests per hour
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

**Best Practices for Handling Rate Limits:**
1. **Monitor Headers**: Always check rate limit headers in API responses
2. **Exponential Backoff**: Implement exponential backoff when receiving 429 responses
3. **Respect Retry-After**: Use the `Retry-After` header to determine when to retry
4. **Cache Responses**: Cache non-sensitive responses to reduce API calls
5. **Batch Operations**: Use batch endpoints when available to reduce request count
6. **API Key Limits**: Configure appropriate limits for your use case

## Host Alias Last Assignment

### GET /api/opnsense/host-alias-last-assignment

**Description**: Retrieve the most recent group assignment/unassignment operation for a given IP address from the audit log.

**Authentication**: Mixed (Optional for own IP in self-service, Required for other IPs)

**Role Access:**
- **Unauthenticated**: ✅ Can query own IP address only (self-service context)
- **USER**: ✅ Can query own IP or permitted devices
- **ADMIN**: ✅ Can query any permitted device
- **SUPER_ADMIN**: ✅ Can query any device

**Query Parameters:**
- `ipAddress` (string, required): The IP address to query
  - **Validation**: Must be a valid IPv4 or IPv6 address
  - **Example**: `192.168.1.65`

- `excludeMultiSelectGroups` (boolean, optional): When set to `true`, filters out operations involving MultiSelect groups. Default: `false`
  - **Use Case**: Self-service contexts when Group Types are enabled but Self-Service Multi-Select is disabled
  - **Example**: `true`

**Group Type Filtering**:

When `excludeMultiSelectGroups=true` is specified, the endpoint filters operations based on the following rules:
- **ASSIGN operations**: Excluded if target group is MultiSelect
- **UNASSIGN operations**: Excluded if source group is MultiSelect
- **MOVE operations**: Excluded if target group is MultiSelect
- **BATCH_ASSIGN operations**: Excluded if target group is MultiSelect
- **BATCH_UNASSIGN operations**: Excluded if all groups are MultiSelect
- **UNASSIGN_ALL operations**: Excluded if only MultiSelect groups were involved

The endpoint fetches up to 50 recent operations and returns the first one that doesn't involve MultiSelect groups (when filtering is enabled).

**Authentication & Permission Model**:

**Self-Service Context** (Authenticated or Unauthenticated):
- Allows access only to the client's own IP address
- Client IP extracted from `x-forwarded-for` or `x-real-ip` headers
- IP validation using `isIpAllowedForSelfService` function
- Checks if IP is within configured allowed networks
- Respects global self-service disable setting

**Device Management Context** (Authenticated Users):
- Requires user authentication
- Follows existing device management permissions
- Users can access last assignment for devices they have permission to manage

#### Usage Case 1: Get Last Assignment for Specific IP Address

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/opnsense/host-alias-last-assignment?ipAddress=192.168.1.65" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "operationType": "assign",
  "action": "OPNSENSE_GROUP_IP_ASSIGN_SUCCESS",
  "groupName": "VPN Users",
  "targetGroup": {
    "id": "group-uuid-1",
    "name": "vpn_users",
    "friendlyName": "VPN Users"
  },
  "userName": "admin@example.com"
}
```

#### Usage Case 2: Get Last Assignment with MultiSelect Filtering

**Example Request (Self-Service with MultiSelect Filtering)**:
```bash
# Query own IP with MultiSelect group operations filtered out
# Used when Group Types are enabled but Self-Service Multi-Select is disabled
curl -X GET "{{SERVER_URL}}/api/opnsense/host-alias-last-assignment?ipAddress=192.168.1.65&excludeMultiSelectGroups=true"
```

**Success Response** (MultiSelect operation filtered out, showing previous SingleSelect operation):
```json
{
  "timestamp": "2025-01-14T09:15:00.000Z",
  "operationType": "move",
  "action": "OPNSENSE_GROUP_IP_MOVE_SUCCESS",
  "groupName": "Office Users",
  "sourceGroups": [
    {
      "id": "group-uuid-2",
      "name": "remote_users",
      "friendlyName": "Remote Users"
    }
  ],
  "targetGroup": {
    "id": "group-uuid-3",
    "name": "office_users",
    "friendlyName": "Office Users"
  },
  "userName": "admin@example.com"
}
```

#### Usage Case 3: Get Last Assignment for UNASSIGN_ALL Operation

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/opnsense/host-alias-last-assignment?ipAddress=192.168.1.100" \
  -H "Authorization: Bearer {{API_KEY}}"
```

**Success Response** (UNASSIGN_ALL operation):
```json
{
  "timestamp": "2025-01-15T14:20:00.000Z",
  "operationType": "unassign_all",
  "action": "OPNSENSE_GROUP_IP_UNASSIGN_ALL_SUCCESS",
  "groupName": "3 groups",
  "allGroups": [
    {
      "id": "group-uuid-1",
      "name": "vpn_users",
      "friendlyName": "VPN Users"
    },
    {
      "id": "group-uuid-2",
      "name": "remote_users",
      "friendlyName": "Remote Users"
    },
    {
      "id": "group-uuid-3",
      "name": "office_users",
      "friendlyName": "Office Users"
    }
  ],
  "operationCount": 3,
  "userName": "admin@example.com"
}
```

**Error Response** (No assignment found):
```json
{
  "timestamp": null,
  "operationType": null,
  "action": null,
  "groupName": null
}
```

**Response Fields**:
- `timestamp`: ISO 8601 timestamp of the operation
- `operationType`: Type of operation (`assign`, `unassign`, `move`, `batch_assign`, `batch_unassign`, `unassign_all`)
- `action`: Full audit action name (e.g., `OPNSENSE_GROUP_IP_ASSIGN_SUCCESS`)
- `groupName`: Friendly name of the group (for backward compatibility)
- `sourceGroups` (optional): Array of source groups for MOVE operations
  - `id`: Group UUID
  - `name`: Group name
  - `friendlyName`: Group friendly name
- `targetGroup` (optional): Target group for ASSIGN/MOVE operations
  - `id`: Group UUID
  - `name`: Group name
  - `friendlyName`: Group friendly name
- `allGroups` (optional): Array of all groups for UNASSIGN_ALL operations
  - `id`: Group UUID
  - `name`: Group name
  - `friendlyName`: Group friendly name
- `operationCount` (optional): Number of groups affected in batch/unassign_all operations
- `userName` (optional): User who performed the operation (not included for unauthenticated requests)

## Host Alias Management Admin

### GET /api/opnsense/host-alias-management-admin

**Description**: Retrieve comprehensive host alias information for administrative purposes, including system status, assignment history, and operational metadata.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **Unauthenticated**: ❌ Authentication required
- **USER**: ❌ Insufficient permissions
- **ADMIN**: ✅ Can read administrative host alias data
- **SUPER_ADMIN**: ✅ Can read administrative host alias data

**Query Parameters:**
- `includeStatus` (boolean, optional): Include operational status information (default: true)
  - **Validation**: Must be true or false
  - **Example**: `true`

- `includeAssignments` (boolean, optional): Include assignment history (default: true)
  - **Validation**: Must be true or false
  - **Example**: `true`

- `includeSystemInfo` (boolean, optional): Include system integration information (default: false)
  - **Validation**: Must be true or false
  - **Example**: `false`

- `page` (number, optional): Page number for pagination (default: 1)
  - **Validation**: Must be >= 1
  - **Example**: `1`

- `limit` (number, optional): Items per page (default: 50, max: 100)
  - **Validation**: Must be between 1 and 100
  - **Example**: `25`

- `sortBy` (string, optional): Sort field - `name`, `content`, `lastAssignment`, `enabled` (default: `name`)
  - **Validation**: Must be one of: `name`, `content`, `lastAssignment`, `enabled`
  - **Example**: `lastAssignment`

- `sortDirection` (string, optional): Sort direction - `asc`, `desc` (default: `asc`)
  - **Validation**: Must be `asc` or `desc`
  - **Example**: `desc`

- `filter` (string, optional): Filter by name, content, or description
  - **Validation**: String length 1-255 characters
  - **Example**: `"office"` or `"192.168.1"`

- `enabled` (boolean, optional): Filter by enabled status
  - **Validation**: Must be true or false
  - **Example**: `true`

#### Usage Case 1: Get All Administrative Host Aliases

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/opnsense/host-alias-management-admin?includeStatus=true&includeAssignments=true&page=1&limit=25" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "hostAliases": [
      {
        "id": "alias-uuid-1",
        "name": "Office_Desk_Screen",
        "content": "192.168.1.65",
        "description": "Office desktop computer",
        "enabled": true,
        "uuid": "45653f16-70b0-4a44-b311-abda1da4c2b5",
        "status": {
          "isOnline": true,
          "lastSeen": "2025-01-15T14:30:00.000Z",
          "arpEntry": true,
          "dhcpLease": true,
          "networkInterface": "em0"
        },
        "lastAssignment": {
          "timestamp": "2025-01-15T10:30:00.000Z",
          "assignedBy": "admin-user-id",
          "previousAssignment": "192.168.1.64",
          "assignmentType": "automatic",
          "source": "dhcp_lease"
        },
        "assignmentHistory": [
          {
            "timestamp": "2025-01-15T10:30:00.000Z",
            "ipAddress": "192.168.1.65",
            "assignedBy": "system",
            "assignmentType": "automatic",
            "source": "dhcp_lease"
          }
        ],
        "systemInfo": {
          "createdAt": "2025-01-10T08:00:00.000Z",
          "createdBy": "admin-user-id",
          "lastModifiedAt": "2025-01-15T10:30:00.000Z",
          "lastModifiedBy": "admin-user-id",
          "version": 3
        }
      }
    ],
    "totalCount": 1,
    "currentPage": 1,
    "totalPages": 1,
    "summary": {
      "totalAliases": 1,
      "enabledAliases": 1,
      "disabledAliases": 0,
      "onlineAliases": 1,
      "offlineAliases": 0
    }
  }
}
```

#### Usage Case 2: Filter and Sort Host Aliases

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/opnsense/host-alias-management-admin?filter=office&enabled=true&sortBy=lastAssignment&sortDirection=desc" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "hostAliases": [
      {
        "id": "alias-uuid-1",
        "name": "Office_Desk_Screen",
        "content": "192.168.1.65",
        "description": "Office desktop computer",
        "enabled": true,
        "uuid": "45653f16-70b0-4a44-b311-abda1da4c2b5",
        "status": {
          "isOnline": true,
          "lastSeen": "2025-01-15T14:30:00.000Z",
          "arpEntry": true,
          "dhcpLease": true,
          "networkInterface": "em0"
        },
        "lastAssignment": {
          "timestamp": "2025-01-15T10:30:00.000Z",
          "assignedBy": "admin-user-id",
          "previousAssignment": "192.168.1.64",
          "assignmentType": "automatic",
          "source": "dhcp_lease"
        }
      }
    ],
    "totalCount": 1,
    "currentPage": 1,
    "totalPages": 1
  }
}
```

#### Usage Case 3: Include System Information

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/opnsense/host-alias-management-admin?includeSystemInfo=true&limit=10" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "hostAliases": [
      {
        "id": "alias-uuid-1",
        "name": "Office_Desk_Screen",
        "content": "192.168.1.65",
        "description": "Office desktop computer",
        "enabled": true,
        "uuid": "45653f16-70b0-4a44-b311-abda1da4c2b5",
        "systemInfo": {
          "createdAt": "2025-01-10T08:00:00.000Z",
          "createdBy": "admin-user-id",
          "lastModifiedAt": "2025-01-15T10:30:00.000Z",
          "lastModifiedBy": "admin-user-id",
          "version": 3,
          "syncStatus": "synced",
          "lastSyncAt": "2025-01-15T10:35:00.000Z"
        }
      }
    ],
    "totalCount": 1,
    "currentPage": 1,
    "totalPages": 1
  }
}
```

**Error Response** (Invalid sort field):
```json
{
  "error": "Invalid sort field. Must be one of: name, content, lastAssignment, enabled"
}
```

**Response Fields**:
- `hostAliases`: Array of host alias objects
  - `id`: Unique host alias identifier
  - `name`: Host alias name
  - `content`: Host IP address
  - `description`: Host description
  - `enabled`: Whether host alias is enabled
  - `uuid`: OPNsense UUID
  - `status`: Operational status information (when `includeStatus=true`)
    - `isOnline`: Whether the host is currently online
    - `lastSeen`: Last time the host was seen
    - `arpEntry`: Whether there's an ARP entry for the host
    - `dhcpLease`: Whether there's an active DHCP lease
    - `networkInterface`: Network interface where host was detected
  - `lastAssignment`: Most recent assignment information (when `includeAssignments=true`)
    - `timestamp`: Assignment timestamp
    - `assignedBy`: User or system that made the assignment
    - `previousAssignment`: Previous IP assignment (if any)
    - `assignmentType`: Type of assignment (automatic, manual)
    - `source`: Source of assignment (dhcp_lease, admin_interface, api)
  - `assignmentHistory`: Array of historical assignments (when `includeAssignments=true`)
  - `systemInfo`: System integration information (when `includeSystemInfo=true`)
    - `createdAt`: When the alias was created
    - `createdBy`: User who created the alias
    - `lastModifiedAt`: When the alias was last modified
    - `lastModifiedBy`: User who last modified the alias
    - `version`: Version number of the alias
    - `syncStatus`: Synchronization status with OPNsense
    - `lastSyncAt`: Last synchronization timestamp
- `totalCount`: Total number of host aliases
- `currentPage`: Current page number
- `totalPages`: Total number of pages
- `summary`: Summary statistics (when available)
  - `totalAliases`: Total number of aliases
  - `enabledAliases`: Number of enabled aliases
  - `disabledAliases`: Number of disabled aliases
  - `onlineAliases`: Number of currently online aliases
  - `offlineAliases`: Number of currently offline aliases

## Network Group Host Aliases

### GET /api/opnsense/network-groups/[uuid]/host-aliases

**Description**: Retrieve all host aliases assigned to a specific network group, including detailed status information and connectivity validation.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **Unauthenticated**: ❌ Authentication required
- **USER**: ❌ Insufficient permissions
- **ADMIN**: ✅ Can read network group host aliases
- **SUPER_ADMIN**: ✅ Can read network group host aliases

**Path Parameters:**
- `uuid` (string, required): The UUID of the network group
  - **Validation**: Must be a valid UUID format
  - **Example**: `550e8400-e29b-41d4-a716-446655440000`

**Query Parameters:**
- `includeStatus` (boolean, optional): Include ARP status and connectivity information (default: true)
  - **Validation**: Must be true or false
  - **Example**: `true`

- `includeHistory` (boolean, optional): Include assignment history for each host alias (default: false)
  - **Validation**: Must be true or false
  - **Example**: `false`

- `sortBy` (string, optional): Sort field - `name`, `content`, `lastSeen`, `enabled` (default: `name`)
  - **Validation**: Must be one of: `name`, `content`, `lastSeen`, `enabled`
  - **Example**: `lastSeen`

- `sortDirection` (string, optional): Sort direction - `asc`, `desc` (default: `asc`)
  - **Validation**: Must be `asc` or `desc`
  - **Example**: `desc`

- `filter` (string, optional): Filter by name, content, or description
  - **Validation**: String length 1-255 characters
  - **Example**: `"office"` or `"192.168.1"`

#### Usage Case 1: Get All Host Aliases for Network Group

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/opnsense/network-groups/550e8400-e29b-41d4-a716-446655440000/host-aliases?includeStatus=true" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "networkGroup": {
      "id": "group-uuid-1",
      "uuid": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Office_Devices",
      "description": "Office network devices",
      "enabled": true,
      "memberCount": 2
    },
    "hostAliases": [
      {
        "id": "alias-uuid-1",
        "name": "Office_Desk_Screen",
        "content": "192.168.1.65",
        "description": "Office desktop computer",
        "enabled": true,
        "uuid": "45653f16-70b0-4a44-b311-abda1da4c2b5",
        "status": {
          "hasArpEntry": true,
          "isOnline": true,
          "lastSeen": "2025-01-15T14:30:00.000Z",
          "networkInterface": "em0",
          "dhcpLease": true,
          "responseTime": 5
        },
        "assignmentInfo": {
          "assignedToGroup": "2025-01-10T08:00:00.000Z",
          "assignedBy": "admin-user-id",
          "assignmentSource": "admin_interface"
        }
      },
      {
        "id": "alias-uuid-2",
        "name": "Office_Laptop",
        "content": "192.168.1.66",
        "description": "Office laptop computer",
        "enabled": true,
        "uuid": "789abcde-1234-5678-9012-fedcba345678",
        "status": {
          "hasArpEntry": false,
          "isOnline": false,
          "lastSeen": "2025-01-14T17:45:00.000Z",
          "networkInterface": null,
          "dhcpLease": false,
          "responseTime": null
        },
        "assignmentInfo": {
          "assignedToGroup": "2025-01-10T08:15:00.000Z",
          "assignedBy": "admin-user-id",
          "assignmentSource": "bulk_import"
        }
      }
    ],
    "summary": {
      "totalHosts": 2,
      "onlineHosts": 1,
      "offlineHosts": 1,
      "hostsWithArpEntries": 1,
      "hostsWithDhcpLeases": 1
    }
  }
}
```

#### Usage Case 2: Sort and Filter Host Aliases

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/opnsense/network-groups/550e8400-e29b-41d4-a716-446655440000/host-aliases?sortBy=lastSeen&sortDirection=desc&filter=office" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "networkGroup": {
      "id": "group-uuid-1",
      "uuid": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Office_Devices",
      "description": "Office network devices",
      "enabled": true,
      "memberCount": 2
    },
    "hostAliases": [
      {
        "id": "alias-uuid-1",
        "name": "Office_Desk_Screen",
        "content": "192.168.1.65",
        "description": "Office desktop computer",
        "enabled": true,
        "uuid": "45653f16-70b0-4a44-b311-abda1da4c2b5",
        "status": {
          "hasArpEntry": true,
          "isOnline": true,
          "lastSeen": "2025-01-15T14:30:00.000Z",
          "networkInterface": "em0",
          "dhcpLease": true,
          "responseTime": 5
        }
      },
      {
        "id": "alias-uuid-2",
        "name": "Office_Laptop",
        "content": "192.168.1.66",
        "description": "Office laptop computer",
        "enabled": true,
        "uuid": "789abcde-1234-5678-9012-fedcba345678",
        "status": {
          "hasArpEntry": false,
          "isOnline": false,
          "lastSeen": "2025-01-14T17:45:00.000Z",
          "networkInterface": null,
          "dhcpLease": false,
          "responseTime": null
        }
      }
    ]
  }
}
```

#### Usage Case 3: Include Assignment History

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/opnsense/network-groups/550e8400-e29b-41d4-a716-446655440000/host-aliases?includeHistory=true&limit=5" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "networkGroup": {
      "id": "group-uuid-1",
      "uuid": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Office_Devices",
      "description": "Office network devices",
      "enabled": true,
      "memberCount": 2
    },
    "hostAliases": [
      {
        "id": "alias-uuid-1",
        "name": "Office_Desk_Screen",
        "content": "192.168.1.65",
        "description": "Office desktop computer",
        "enabled": true,
        "uuid": "45653f16-70b0-4a44-b311-abda1da4c2b5",
        "status": {
          "hasArpEntry": true,
          "isOnline": true,
          "lastSeen": "2025-01-15T14:30:00.000Z",
          "networkInterface": "em0",
          "dhcpLease": true,
          "responseTime": 5
        },
        "assignmentHistory": [
          {
            "timestamp": "2025-01-10T08:00:00.000Z",
            "action": "added_to_group",
            "assignedBy": "admin-user-id",
            "source": "admin_interface",
            "details": {
              "groupId": "group-uuid-1",
              "groupName": "Office_Devices"
            }
          },
          {
            "timestamp": "2025-01-08T14:20:00.000Z",
            "action": "ip_assignment_changed",
            "assignedBy": "system",
            "source": "dhcp_lease",
            "details": {
              "oldIp": "192.168.1.64",
              "newIp": "192.168.1.65"
            }
          }
        ]
      }
    ]
  }
}
```

**Error Response** (Invalid UUID):
```json
{
  "error": "Invalid network group UUID format"
}
```

**Error Response** (Network Group Not Found):
```json
{
  "error": "Network group not found"
}
```

**Error Response** (Invalid Sort Field):
```json
{
  "error": "Invalid sort field. Must be one of: name, content, lastSeen, enabled"
}
```

**Response Fields**:
- `networkGroup`: Network group information
  - `id`: Unique network group identifier
  - `uuid`: Network group UUID
  - `name`: Network group name
  - `description`: Network group description
  - `enabled`: Whether network group is enabled
  - `memberCount`: Number of members in the group
- `hostAliases`: Array of host alias objects
  - `id`: Unique host alias identifier
  - `name`: Host alias name
  - `content`: Host IP address
  - `description`: Host description
  - `enabled`: Whether host alias is enabled
  - `uuid`: OPNsense UUID
  - `status`: Host status information (when `includeStatus=true`)
    - `hasArpEntry`: Whether there's an ARP entry for the host
    - `isOnline`: Whether the host is currently online
    - `lastSeen`: Last time the host was seen
    - `networkInterface`: Network interface where host was detected
    - `dhcpLease`: Whether there's an active DHCP lease
    - `responseTime`: Ping response time in milliseconds (null if offline)
  - `assignmentInfo`: Assignment information
    - `assignedToGroup`: When the host was assigned to the group
    - `assignedBy`: User who assigned the host to the group
    - `assignmentSource`: How the assignment was made (admin_interface, bulk_import, api)
  - `assignmentHistory`: Array of assignment history records (when `includeHistory=true`)
    - `timestamp`: When the assignment action occurred
    - `action`: Type of action (added_to_group, removed_from_group, ip_assignment_changed)
    - `assignedBy`: User who performed the action
    - `source`: Source of the action
    - `details`: Additional details about the action
- `summary`: Summary statistics (when available)
  - `totalHosts`: Total number of hosts in the group
  - `onlineHosts`: Number of currently online hosts
  - `offlineHosts`: Number of currently offline hosts
  - `hostsWithArpEntries`: Number of hosts with ARP entries
  - `hostsWithDhcpLeases`: Number of hosts with DHCP leases

## Security Considerations

**Access Control:**
- All endpoints require ADMIN or SUPER_ADMIN role
- Role-based permissions strictly enforced
- All operations logged in audit system
- IP tracking for API usage monitoring

**Input Validation:**
- Strict UUID format validation for network group identifiers
- IP address format validation for IP-based queries
- SQL injection prevention with parameterized queries
- XSS prevention with input sanitization
- Length limits enforced on all string fields

**Data Privacy:**
- No personal information collected beyond network identifiers
- Access logs maintained for security auditing
- Encryption of sensitive data at rest
- Secure transmission of all API data

**Network Security:**
- ARP table access restricted to authorized users
- DHCP lease information protected by role permissions
- Network interface details filtered by user permissions
- Real-time status information limited to authorized devices

## Error Handling

### 400 Bad Request

**Invalid UUID Format**:
```json
{
  "error": "Invalid network group UUID format"
}
```

**Invalid IP Address**:
```json
{
  "error": "Invalid IP address format"
}
```

**Invalid Parameters**:
```json
{
  "error": "Invalid sort field. Must be one of: name, content, lastSeen, enabled"
}
```

### 401 Unauthorized

**Authentication Required**:
```json
{
  "error": "Authentication required"
}
```

**Invalid Credentials**:
```json
{
  "error": "Invalid authentication credentials"
}
```

### 403 Forbidden

**Insufficient Permissions**:
```json
{
  "error": "Insufficient permissions"
}
```

**Feature Disabled**:
```json
{
  "error": "OPNsense integration is disabled"
}
```

### 404 Not Found

**Network Group Not Found**:
```json
{
  "error": "Network group not found"
}
```

**Host Alias Not Found**:
```json
{
  "error": "Host alias not found"
}
```

### 429 Too Many Requests

**Rate Limit Exceeded**:
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

### 500 Internal Server Error

**OPNsense Connection Error**:
```json
{
  "error": "Failed to connect to OPNsense"
}
```

**Database Error**:
```json
{
  "error": "Database query failed"
}
```

**General Server Error**:
```json
{
  "error": "Internal server error"
}
```

## Integration Examples

### JavaScript/TypeScript Example

```typescript
// Get host alias last assignment
async function getHostAliasLastAssignment(options?: {
  hostAliasId?: string;
  ipAddress?: string;
  limit?: number;
  includeHistory?: boolean;
}) {
  const params = new URLSearchParams();
  if (options?.hostAliasId) params.append('hostAliasId', options.hostAliasId);
  if (options?.ipAddress) params.append('ipAddress', options.ipAddress);
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.includeHistory !== undefined) params.append('includeHistory', options.includeHistory.toString());

  const response = await fetch(`${SERVER_URL}/api/opnsense/host-alias-last-assignment?${params}`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error);
  }

  return result.data;
}

// Get administrative host alias information
async function getHostAliasManagementAdmin(options?: {
  includeStatus?: boolean;
  includeAssignments?: boolean;
  includeSystemInfo?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: string;
  filter?: string;
  enabled?: boolean;
}) {
  const params = new URLSearchParams();
  if (options?.includeStatus !== undefined) params.append('includeStatus', options.includeStatus.toString());
  if (options?.includeAssignments !== undefined) params.append('includeAssignments', options.includeAssignments.toString());
  if (options?.includeSystemInfo !== undefined) params.append('includeSystemInfo', options.includeSystemInfo.toString());
  if (options?.page) params.append('page', options.page.toString());
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.sortBy) params.append('sortBy', options.sortBy);
  if (options?.sortDirection) params.append('sortDirection', options.sortDirection);
  if (options?.filter) params.append('filter', options.filter);
  if (options?.enabled !== undefined) params.append('enabled', options.enabled.toString());

  const response = await fetch(`${SERVER_URL}/api/opnsense/host-alias-management-admin?${params}`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error);
  }

  return result.data;
}

// Get network group host aliases
async function getNetworkGroupHostAliases(groupUuid: string, options?: {
  includeStatus?: boolean;
  includeHistory?: boolean;
  sortBy?: string;
  sortDirection?: string;
  filter?: string;
}) {
  const params = new URLSearchParams();
  if (options?.includeStatus !== undefined) params.append('includeStatus', options.includeStatus.toString());
  if (options?.includeHistory !== undefined) params.append('includeHistory', options.includeHistory.toString());
  if (options?.sortBy) params.append('sortBy', options.sortBy);
  if (options?.sortDirection) params.append('sortDirection', options.sortDirection);
  if (options?.filter) params.append('filter', options.filter);

  const response = await fetch(`${SERVER_URL}/api/opnsense/network-groups/${groupUuid}/host-aliases?${params}`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error);
  }

  return result.data;
}
```

### Python Example

```python
import requests
import json
from urllib.parse import urlencode

class OpnsenseAdvancedAPI:
    def __init__(self, server_url, api_key):
        self.server_url = server_url
        self.api_key = api_key
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }

    def get_host_alias_last_assignment(self, **kwargs):
        """Get host alias last assignment information"""
        params = {}
        if 'host_alias_id' in kwargs:
            params['hostAliasId'] = kwargs['host_alias_id']
        if 'ip_address' in kwargs:
            params['ipAddress'] = kwargs['ip_address']
        if 'limit' in kwargs:
            params['limit'] = kwargs['limit']
        if 'include_history' in kwargs:
            params['includeHistory'] = kwargs['include_history']

        response = requests.get(
            f'{self.server_url}/api/opnsense/host-alias-last-assignment',
            headers=self.headers,
            params=params
        )

        result = response.json()
        if not result.get('success'):
            raise Exception(result.get('error', 'Unknown error'))

        return result.get('data')

    def get_host_alias_management_admin(self, **kwargs):
        """Get administrative host alias information"""
        params = {}
        if 'include_status' in kwargs:
            params['includeStatus'] = kwargs['include_status']
        if 'include_assignments' in kwargs:
            params['includeAssignments'] = kwargs['include_assignments']
        if 'include_system_info' in kwargs:
            params['includeSystemInfo'] = kwargs['include_system_info']
        if 'page' in kwargs:
            params['page'] = kwargs['page']
        if 'limit' in kwargs:
            params['limit'] = kwargs['limit']
        if 'sort_by' in kwargs:
            params['sortBy'] = kwargs['sort_by']
        if 'sort_direction' in kwargs:
            params['sortDirection'] = kwargs['sort_direction']
        if 'filter' in kwargs:
            params['filter'] = kwargs['filter']
        if 'enabled' in kwargs:
            params['enabled'] = kwargs['enabled']

        response = requests.get(
            f'{self.server_url}/api/opnsense/host-alias-management-admin',
            headers=self.headers,
            params=params
        )

        result = response.json()
        if not result.get('success'):
            raise Exception(result.get('error', 'Unknown error'))

        return result.get('data')

    def get_network_group_host_aliases(self, group_uuid, **kwargs):
        """Get host aliases for a specific network group"""
        params = {}
        if 'include_status' in kwargs:
            params['includeStatus'] = kwargs['include_status']
        if 'include_history' in kwargs:
            params['includeHistory'] = kwargs['include_history']
        if 'sort_by' in kwargs:
            params['sortBy'] = kwargs['sort_by']
        if 'sort_direction' in kwargs:
            params['sortDirection'] = kwargs['sort_direction']
        if 'filter' in kwargs:
            params['filter'] = kwargs['filter']

        response = requests.get(
            f'{self.server_url}/api/opnsense/network-groups/{group_uuid}/host-aliases',
            headers=self.headers,
            params=params
        )

        result = response.json()
        if not result.get('success'):
            raise Exception(result.get('error', 'Unknown error'))

        return result.get('data')
```

This comprehensive API documentation provides all necessary information for integrating with OPNsense advanced endpoints, including detailed endpoint descriptions, request/response formats, error handling, and practical examples for common use cases.

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