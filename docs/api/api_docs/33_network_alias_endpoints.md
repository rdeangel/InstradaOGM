# Network Alias Endpoints

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
curl -X GET "${SERVER_URL}}/api/opnsense/network-aliases" \
  -H "Authorization: Bearer ${API_KEY}"
```

This section covers all network alias management endpoints for creating, updating, deleting, and assigning network aliases to network groups in OPNsense.

## Feature Prerequisites

**Network Alias Management Feature Toggle**

Network alias management is controlled by a global feature toggle. To enable this feature:

1. Access the **Global Settings** section
2. Enable **"Manage Network Aliases"**
3. All network alias endpoints will return `403 Forbidden` with code `NETWORK_ALIAS_MANAGEMENT_DISABLED` if the feature is disabled

**Why Network Aliases?**

Network aliases define collections of network CIDR ranges (e.g., `192.168.0.0/24`, `10.0.0.0/8`) that can be grouped and assigned to network groups. This enables administrators to:
- Manage IP address collections more efficiently than individual host aliases
- Apply firewall rules to entire subnets
- Assign VPN routing policies to network blocks
- Create dynamic network policies based on address ranges

## Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **Unauthenticated**: ❌ Authentication required for all endpoints
- **USER**: ❌ Insufficient permissions for all endpoints
- **ADMIN**: ✅ Full access to all network alias endpoints
- **SUPER_ADMIN**: ✅ Full access to all network alias endpoints

**Role Access:**
- **Unauthenticated**: ❌ Authentication required - Must provide valid session or API key
- **USER**: ❌ Insufficient permissions - Requires ADMIN or SUPER_ADMIN role
- **ADMIN**: ✅ Can create, read, update, delete network aliases and manage group assignments
- **SUPER_ADMIN**: ✅ Can create, read, update, delete network aliases and manage group assignments

**Authentication Methods:**
All network alias endpoints require either:
- **Session-based authentication** (user logged in to the web interface)
- **API key authentication** (with `Authorization: Bearer` header)

**Feature Toggle Requirement:**
All network alias endpoints require the global `manageNetworkAliasesEnabled` setting to be true. If disabled, all endpoints return `403 Forbidden` with code `NETWORK_ALIAS_MANAGEMENT_DISABLED`.

**Example Responses:**

**ADMIN/SUPER_ADMIN Success:**
```json
{
  "success": true,
  "data": {
    "uuid": "a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c",
    "name": "Office_Networks",
    "type": "network",
    "content": "192.168.1.0/24",
    "enabled": "1"
  }
}
```

**USER Role Error:**
```json
{
  "error": "Unauthorized"
}
```

**Unauthenticated Error:**
```json
{
  "error": "Unauthorized"
}
```

**Feature Disabled Error:**
```json
{
  "error": "Feature disabled",
  "code": "NETWORK_ALIAS_MANAGEMENT_DISABLED"
}
```

## Rate Limiting

**Rate Limit Strategy:** User-based

**Default Rate Limits:**
- **Authenticated Endpoints**: 1000 requests per hour
- **API Key Endpoints**: Configurable per key (default: 1000/hour)

---

## Endpoints

### GET /api/opnsense/network-aliases

**Description**: Retrieve all network aliases from OPNsense that are available for management.

**Authentication**: Required

**Role Access:**
- **Unauthenticated**: ❌ Authentication required
- **USER**: ❌ Insufficient permissions - Requires ADMIN or SUPER_ADMIN role
- **ADMIN**: ✅ Can read all network aliases
- **SUPER_ADMIN**: ✅ Can read all network aliases

**Feature Toggle**: Required - `manageNetworkAliasesEnabled` must be true

#### Request

```bash
curl -X GET "{{SERVER_URL}}/api/opnsense/network-aliases" \
  -H "Authorization: Bearer {{API_KEY}}"
```

#### Query Parameters

None

#### Success Response (200 OK)

```json
[
  {
    "uuid": "a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c",
    "name": "Office_Networks",
    "type": "network",
    "content": "192.168.1.0/24\n192.168.2.0/24\n10.0.0.0/8",
    "description": "All office network subnets",
    "enabled": "1",
    "hidden": false,
    "memberOfGroups": [
      {
        "uuid": "group-uuid-1",
        "name": "office_access",
        "friendlyName": "Office Access",
        "iconIdentifier": "business",
        "groupType": "SingleSelect"
      }
    ]
  },
  {
    "uuid": "f6e5d4c3-b2a1-49f6-8e0d-2c3d4e5f6a7b",
    "name": "Guest_Network",
    "type": "network",
    "content": "192.168.100.0/24",
    "description": "Guest network access",
    "enabled": "1",
    "hidden": true,
    "memberOfGroups": []
  }
]
```

#### Error Responses

**403 Forbidden - Feature Disabled**
```json
{
  "error": "Feature disabled",
  "code": "NETWORK_ALIAS_MANAGEMENT_DISABLED"
}
```

**401 Unauthorized - Missing Authentication**
```json
{
  "error": "Unauthorized"
}
```

**502 Bad Gateway - OPNsense Connection Error**
```json
{
  "error": "Failed to retrieve aliases from OPNsense"
}
```

**500 Internal Server Error**
```json
{
  "error": "Failed to fetch network aliases"
}
```

#### Audit Log Events

- `NETWORK_ALIAS_READ_SUCCESS` - Successfully fetched all network aliases

---

### POST /api/opnsense/network-aliases

**Description**: Create a new network alias in OPNsense.

**Authentication**: Required

**Role Access:**
- **Unauthenticated**: ❌ Authentication required
- **USER**: ❌ Insufficient permissions - Requires ADMIN or SUPER_ADMIN role
- **ADMIN**: ✅ Can create network aliases
- **SUPER_ADMIN**: ✅ Can create network aliases

**Feature Toggle**: Required - `manageNetworkAliasesEnabled` must be true

#### Request

```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/network-aliases" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Remote_Office_Networks",
    "content": "203.0.113.0/24\n198.51.100.0/24",
    "description": "Remote office network ranges",
    "enabled": true
  }'
```

#### Request Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Network alias name (alphanumeric and underscores only, no spaces or hyphens) |
| `content` | string | Yes | CIDR ranges, one per line (e.g., `192.168.1.0/24`) |
| `description` | string | No | Human-readable description of the network alias |
| `enabled` | boolean | No | Whether the alias is enabled (default: `true`) |

#### Name Validation Rules

- **Pattern**: Alphanumeric characters and underscores only (`^[a-zA-Z0-9_]+$`)
- **No spaces or hyphens allowed**
- **Examples**: `Office_Networks`, `Guest_Subnet`, `VPN_Range_1`
- **Invalid examples**: `Office Networks`, `Office-Networks`, `Office.Networks`

#### Content Format

Network alias content must be valid CIDR notation, one per line:
```
192.168.1.0/24
192.168.2.0/24
10.0.0.0/8
172.16.0.0/12
```

#### Success Response (201 Created)

```json
{
  "uuid": "a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c",
  "name": "Remote_Office_Networks",
  "type": "network",
  "content": "203.0.113.0/24\n198.51.100.0/24",
  "description": "Remote office network ranges",
  "enabled": "1"
}
```

#### Error Responses

**400 Bad Request - Invalid Input**
```json
{
  "error": "Name must be alphanumeric with underscores only (no spaces or hyphens)"
}
```

**403 Forbidden - Feature Disabled**
```json
{
  "error": "Feature disabled",
  "code": "NETWORK_ALIAS_MANAGEMENT_DISABLED"
}
```

**401 Unauthorized**
```json
{
  "error": "Unauthorized"
}
```

**500 Internal Server Error**
```json
{
  "error": "Failed to create network alias"
}
```

#### Audit Log Events

- `NETWORK_ALIAS_CREATE_ATTEMPT` - Creation attempt started
- `NETWORK_ALIAS_CREATE_SUCCESS` - Network alias created successfully
- `NETWORK_ALIAS_CREATE_FAILURE` - Creation failed with error details

#### Integration Example: JavaScript

```javascript
async function createNetworkAlias(name, content, description = '') {
  const response = await fetch('/api/opnsense/network-aliases', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name,
      content,
      description,
      enabled: true
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to create network alias: ${error.error}`);
  }

  return response.json();
}

// Usage
const alias = await createNetworkAlias(
  'Lab_Networks',
  '192.168.50.0/24\n192.168.51.0/24',
  'Lab environment networks'
);
console.log(`Created alias: ${alias.uuid}`);
```

---

### GET /api/opnsense/network-aliases/[uuid]

**Description**: Retrieve a specific network alias by UUID.

**Authentication**: Required

**Role Access:**
- **Unauthenticated**: ❌ Authentication required
- **USER**: ❌ Insufficient permissions - Requires ADMIN or SUPER_ADMIN role
- **ADMIN**: ✅ Can read specific network aliases
- **SUPER_ADMIN**: ✅ Can read specific network aliases

**Feature Toggle**: Required - `manageNetworkAliasesEnabled` must be true

#### Request

```bash
curl -X GET "{{SERVER_URL}}/api/opnsense/network-aliases/a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c" \
  -H "Authorization: Bearer {{API_KEY}}"
```

#### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uuid` | string | Yes | The UUID of the network alias to retrieve |

#### Success Response (200 OK)

```json
{
  "uuid": "a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c",
  "name": "Office_Networks",
  "type": "network",
  "content": "192.168.1.0/24\n192.168.2.0/24",
  "description": "All office network subnets",
  "enabled": "1",
  "memberOfGroups": [
    {
      "uuid": "group-1",
      "name": "office_access",
      "friendlyName": "Office Access"
    }
  ]
}
```

#### Error Responses

**404 Not Found**
```json
{
  "error": "Network alias not found"
}
```

**403 Forbidden - Feature Disabled**
```json
{
  "error": "Feature disabled",
  "code": "NETWORK_ALIAS_MANAGEMENT_DISABLED"
}
```

---

### PUT /api/opnsense/network-aliases/[uuid]

**Description**: Update an existing network alias.

**Authentication**: Required

**Role Access:**
- **Unauthenticated**: ❌ Authentication required
- **USER**: ❌ Insufficient permissions - Requires ADMIN or SUPER_ADMIN role
- **ADMIN**: ✅ Can update network aliases
- **SUPER_ADMIN**: ✅ Can update network aliases

**Feature Toggle**: Required - `manageNetworkAliasesEnabled` must be true

#### Request

```bash
curl -X PUT "{{SERVER_URL}}/api/opnsense/network-aliases/a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Office_Networks_Updated",
    "content": "192.168.1.0/24\n192.168.2.0/24\n192.168.3.0/24",
    "description": "Updated office network subnets",
    "enabled": "1",
    "hidden": false
  }'
```

#### Request Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Updated alias name (alphanumeric and underscores only) |
| `content` | string | Yes | Updated CIDR ranges |
| `description` | string | No | Updated description |
| `enabled` | string | No | `"0"` for disabled, `"1"` for enabled |
| `hidden` | boolean | No | `true` to hide from all management interfaces, `false` to show |

#### Success Response (200 OK)

```json
{
  "success": true
}
```

#### Error Responses

**400 Bad Request - Invalid Name Format**
```json
{
  "error": "Name must be alphanumeric with underscores only (no spaces or hyphens)"
}
```

**409 Conflict - Duplicate Name**
```json
{
  "error": "Duplicate alias name",
  "duplicateUuid": "existing-uuid"
}
```

**404 Not Found**
```json
{
  "error": "Network alias not found"
}
```

#### Audit Log Events

- `NETWORK_ALIAS_UPDATE_ATTEMPT` - Update attempt started
- `NETWORK_ALIAS_UPDATE_SUCCESS` - Update completed successfully
- `NETWORK_ALIAS_UPDATE_FAILURE` - Update failed

---

### DELETE /api/opnsense/network-aliases/[uuid]

**Description**: Delete a network alias. Cannot delete if referenced by active schedules.

**Authentication**: Required

**Role Access:**
- **Unauthenticated**: ❌ Authentication required
- **USER**: ❌ Insufficient permissions - Requires ADMIN or SUPER_ADMIN role
- **ADMIN**: ✅ Can delete network aliases
- **SUPER_ADMIN**: ✅ Can delete network aliases

**Feature Toggle**: Required - `manageNetworkAliasesEnabled` must be true

#### Request

```bash
curl -X DELETE "{{SERVER_URL}}/api/opnsense/network-aliases/a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c" \
  -H "Authorization: Bearer {{API_KEY}}"
```

#### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uuid` | string | Yes | The UUID of the network alias to delete |

#### Success Response (200 OK)

```json
{
  "success": true
}
```

#### Error Responses

**409 Conflict - Referenced by Active Schedules**
```json
{
  "error": "Cannot delete: alias is referenced by active schedules",
  "schedules": [
    {
      "id": "schedule-id-1",
      "name": "Office Hours Access"
    }
  ]
}
```

**404 Not Found**
```json
{
  "error": "Network alias not found"
}
```

#### Important Notes

- Network aliases referenced by active scheduled assignments cannot be deleted
- You must first disable or delete the schedule, or remove the alias from the schedule
- OPNsense must be accessible to verify the alias exists
- After deletion, firewall rules using this alias may become invalid

#### Audit Log Events

- `NETWORK_ALIAS_DELETE_ATTEMPT` - Deletion attempt started
- `NETWORK_ALIAS_DELETE_SUCCESS` - Alias deleted successfully
- `NETWORK_ALIAS_DELETE_FAILURE` - Deletion failed

---

### POST /api/opnsense/network-alias-group-management

**Description**: Assign or unassign a network alias to/from a network group. Handles SingleSelect group constraints (removes from conflicting groups).

**Authentication**: Required

**Role Access:**
- **Unauthenticated**: ❌ Authentication required
- **USER**: ❌ Insufficient permissions - Requires ADMIN or SUPER_ADMIN role
- **ADMIN**: ✅ Can assign and unassign network aliases to/from groups
- **SUPER_ADMIN**: ✅ Can assign and unassign network aliases to/from groups

**Feature Toggle**: Required - `manageNetworkAliasesEnabled` must be true

#### Request

```bash
# Assign alias to group
curl -X POST "{{SERVER_URL}}/api/opnsense/network-alias-group-management" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "assign",
    "aliasUuid": "a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c",
    "groupId": "group-uuid-1"
  }'
```

```bash
# Unassign alias from group
curl -X POST "{{SERVER_URL}}/api/opnsense/network-alias-group-management" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "unassign",
    "aliasUuid": "a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c",
    "groupId": "group-uuid-1"
  }'
```

#### Request Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | Either `"assign"` or `"unassign"` |
| `aliasUuid` | string | Yes | UUID of the network alias |
| `groupId` | string | Yes | UUID of the target network group |

#### Group Type Behavior

**SingleSelect Groups**:
When assigning an alias to a SingleSelect group, it's automatically removed from any other SingleSelect groups (because a device can only be in one SingleSelect group at a time). The response will include `removedFromGroups` showing where it was removed from.

**MultiSelect Groups**:
Aliases can belong to multiple MultiSelect groups simultaneously.

#### Success Response (200 OK)

**Assign Operation (successful, no conflicts):**
```json
{
  "success": true,
  "memberOfGroups": [
    {
      "uuid": "group-uuid-1",
      "name": "office_access",
      "friendlyName": "Office Access",
      "iconIdentifier": "business",
      "groupType": "SingleSelect"
    }
  ]
}
```

**Assign Operation (with SingleSelect move - alias was in another group):**
```json
{
  "success": true,
  "memberOfGroups": [
    {
      "uuid": "group-uuid-1",
      "name": "office_access",
      "friendlyName": "Office Access",
      "groupType": "SingleSelect"
    }
  ],
  "removedFromGroups": [
    {
      "uuid": "group-uuid-2",
      "name": "guest_access",
      "friendlyName": "Guest Access"
    }
  ]
}
```

**Unassign Operation:**
```json
{
  "success": true,
  "memberOfGroups": [
    {
      "uuid": "group-uuid-2",
      "name": "multiselect_group",
      "friendlyName": "MultiSelect Group",
      "groupType": "MultiSelect"
    }
  ]
}
```

#### Error Responses

**400 Bad Request - Missing Fields**
```json
{
  "error": "Missing required fields: operation, aliasUuid, groupId"
}
```

**400 Bad Request - Invalid Operation**
```json
{
  "error": "Invalid operation. Must be \"assign\" or \"unassign\""
}
```

**400 Bad Request - Alias Not Network Type**
```json
{
  "error": "Alias is not a network type"
}
```

**400 Bad Request - Disabled Resources**
```json
{
  "error": "Network alias is disabled in OPNsense"
}
```

**400 Bad Request - VPN Disconnected**
```json
{
  "error": "Target group's VPN is disconnected"
}
```

**404 Not Found - Alias Not Found**
```json
{
  "error": "Network alias not found"
}
```

**404 Not Found - Group Not Found**
```json
{
  "error": "Network group not found"
}
```

**403 Forbidden - Group Globally Disabled**
```json
{
  "error": "Target group is globally disabled"
}
```

**403 Forbidden - Alias is Hidden**
```json
{
  "error": "Network alias is hidden and cannot be assigned to groups"
}
```

#### Validation Checks

Before performing assignment, the API validates:

1. ✅ Network alias exists and is of type `network`
2. ✅ Network alias is enabled in OPNsense
3. ✅ Network alias is NOT hidden (cannot assign hidden aliases)
4. ✅ Target network group exists and is of type `networkgroup`
5. ✅ Target group is enabled in OPNsense
6. ✅ Target group is not globally disabled
7. ✅ If group has associated VPN, VPN must be connected or enabled

#### Audit Log Events

- `NETWORK_ALIAS_GROUP_ASSIGN_ATTEMPT` - Assignment attempt started
- `NETWORK_ALIAS_GROUP_ASSIGN_SUCCESS` - Assignment completed
- `NETWORK_ALIAS_GROUP_ASSIGN_MOVE` - Assignment with removal from other groups
- `NETWORK_ALIAS_GROUP_UNASSIGN_ATTEMPT` - Unassignment attempt started
- `NETWORK_ALIAS_GROUP_UNASSIGN_SUCCESS` - Unassignment completed
- `NETWORK_ALIAS_GROUP_MANAGEMENT_FAILURE` - Operation failed

#### Integration Example: TypeScript

```typescript
interface GroupManagementResult {
  success: boolean;
  memberOfGroups: Array<{
    uuid: string;
    name: string;
    friendlyName?: string;
    groupType?: 'SingleSelect' | 'MultiSelect';
  }>;
  removedFromGroups?: Array<{
    uuid: string;
    name: string;
    friendlyName?: string;
  }>;
}

async function assignNetworkAlias(
  aliasUuid: string,
  groupId: string
): Promise<GroupManagementResult> {
  const response = await fetch('/api/opnsense/network-alias-group-management', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      operation: 'assign',
      aliasUuid,
      groupId
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Assignment failed: ${error.error}`);
  }

  return response.json();
}

// Usage with move handling
const result = await assignNetworkAlias(aliasUuid, targetGroupId);
if (result.removedFromGroups && result.removedFromGroups.length > 0) {
  console.log('Alias was moved from:', result.removedFromGroups.map(g => g.friendlyName || g.name));
}
console.log('Now member of:', result.memberOfGroups.map(g => g.friendlyName || g.name));
```

---

### GET /api/opnsense/network-alias-last-assignment

**Description**: Retrieve the last assignment or unassignment operation for a specific network alias.

**Authentication**: Required

**Role Access:**
- **Unauthenticated**: ❌ Authentication required
- **USER**: ❌ Insufficient permissions - Requires ADMIN or SUPER_ADMIN role
- **ADMIN**: ✅ Can view last assignment for network aliases
- **SUPER_ADMIN**: ✅ Can view last assignment for network aliases

**Feature Toggle**: Required - `manageNetworkAliasesEnabled` must be true

#### Request

```bash
# By alias UUID
curl -X GET "{{SERVER_URL}}/api/opnsense/network-alias-last-assignment?aliasUuid=a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c" \
  -H "Authorization: Bearer {{API_KEY}}"
```

```bash
# By alias name
curl -X GET "{{SERVER_URL}}/api/opnsense/network-alias-last-assignment?aliasName=Office_Networks" \
  -H "Authorization: Bearer {{API_KEY}}"
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `aliasUuid` | string | One of | UUID of the network alias |
| `aliasName` | string | One of | Name of the network alias |

> **Note**: Either `aliasUuid` or `aliasName` must be provided. If both are provided, `aliasUuid` takes precedence.

#### Success Response (200 OK) - With History

```json
{
  "timestamp": "2026-03-15T14:30:00.000Z",
  "operationType": "assign",
  "action": "NETWORK_ALIAS_GROUP_ASSIGN_SUCCESS",
  "groupName": "Office Access",
  "userName": "admin_user",
  "targetGroup": {
    "id": "group-uuid-1",
    "name": "office_access",
    "friendlyName": "Office Access"
  }
}
```

#### Success Response (200 OK) - No History

```json
{
  "timestamp": null,
  "operationType": null,
  "action": null,
  "groupName": null,
  "userName": null
}
```

#### Success Response (200 OK) - Move Operation

```json
{
  "timestamp": "2026-03-15T14:30:00.000Z",
  "operationType": "assign",
  "action": "NETWORK_ALIAS_GROUP_ASSIGN_MOVE",
  "groupName": "Office Access",
  "userName": "admin_user",
  "targetGroup": {
    "id": "group-uuid-1",
    "name": "office_access",
    "friendlyName": "Office Access"
  },
  "sourceGroups": [
    {
      "id": "group-uuid-2",
      "name": "guest_access",
      "friendlyName": "Guest Access"
    }
  ]
}
```

#### Error Responses

**400 Bad Request - Missing Parameters**
```json
{
  "error": "aliasUuid or aliasName parameter is required"
}
```

**403 Forbidden - Feature Disabled**
```json
{
  "error": "Feature disabled"
}
```

---

## Common Patterns

### Complete Workflow: Create and Assign Alias

```javascript
// Step 1: Create a new network alias
const alias = await fetch('/api/opnsense/network-aliases', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Lab_Networks',
    content: '192.168.50.0/24\n192.168.51.0/24',
    description: 'Lab environment networks'
  })
}).then(r => r.json());

console.log(`Created: ${alias.uuid}`);

// Step 2: Assign to a network group
const assignment = await fetch('/api/opnsense/network-alias-group-management', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    operation: 'assign',
    aliasUuid: alias.uuid,
    groupId: 'target-group-uuid'
  })
}).then(r => r.json());

console.log(`Assigned to groups:`, assignment.memberOfGroups);
```

### Error Handling Example

```javascript
async function safeNetworkAliasOperation(operation, aliasUuid, groupId) {
  try {
    const response = await fetch('/api/opnsense/network-alias-group-management', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation, aliasUuid, groupId })
    });

    if (!response.ok) {
      const error = await response.json();
      
      // Handle specific errors
      if (response.status === 409) {
        console.error(`Cannot delete: referenced by schedules`, error.schedules);
      } else if (response.status === 400) {
        console.error(`Validation error: ${error.error}`);
      } else if (response.status === 403) {
        if (error.code === 'NETWORK_ALIAS_MANAGEMENT_DISABLED') {
          console.error('Feature is disabled in global settings');
        }
      }
      throw error;
    }

    return response.json();
  } catch (error) {
    console.error('Operation failed:', error);
    throw error;
  }
}
```

---

## Related Documentation

- [Network Alias Management Feature Guide](../../FEATURES/NETWORK_ALIAS_MANAGEMENT.md)
- [Network Alias Analytics Endpoints](34_network_alias_analytics_endpoints.md)
- [Schedule Endpoints (for scheduled alias assignment)](32_schedule_endpoints.md)
- [Network Group Host Aliases Endpoint](16_network_group_host_aliases_endpoint.md)
