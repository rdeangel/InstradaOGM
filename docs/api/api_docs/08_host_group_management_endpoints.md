# Host Group Management Endpoints

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
curl -X POST "${SERVER_URL}/api/opnsense/host-group-management" \
  -H "Authorization: Bearer ${API_KEY}"
```

## Parameter Resolution Priority

The API uses intelligent parameter resolution with the following priority order:

**Host Alias Resolution Priority:**
1. `ipAddress` + `hostAliasName` → Validates they match
2. `ipAddress` only → Uses existing alias or creates new one
3. `hostAliasName` only → Finds alias by name, uses its IP
4. `hostAliasHostName` only → Same as hostAliasName
5. `hostname` + `ipAddress` → Creates alias from hostname with specified IP
6. `hostname` only → Creates alias from hostname with auto-detected IP

**Group Resolution Priority:**
1. `groupId` → Direct UUID lookup (highest priority)
2. `groupName` → OPNsense group name lookup
3. `groupFriendlyName` → Local friendly name lookup

## Role-Based Access Control

**Authentication Required:** Mixed (Optional for self-service, Required for managing other IPs)

**Role Requirements:**
- **Unauthenticated**: ✅ Can access with IP restrictions (own IP only)
- **USER**: ✅ Can access with standard permissions and bypass some restrictions
- **ADMIN**: ✅ Can access with administrative permissions and bypass most restrictions
- **SUPER_ADMIN**: ✅ Can access with full system permissions and bypass all restrictions

**Role Access:**
- **Unauthenticated**: ✅ Can access for own IP only (subject to self-service restrictions). Cannot operate on hosts in unmanaged groups.
- **USER**: ✅ Can access with standard permissions and bypass some IP restrictions. Cannot operate on hosts in unmanaged groups.
- **ADMIN**: ✅ Can access with administrative permissions and bypass most restrictions including unmanaged group restrictions.
- **SUPER_ADMIN**: ✅ Can access with full system permissions and bypass all restrictions including unmanaged group restrictions.

**Example Responses:**

**Unauthenticated Success (Self-Service):**
```json
{
  "success": true,
  "message": "Office_Desk_Screen added to group G_DEVICES_BR_PROTON_OV (Brazil - Proton).",
  "updatedGroup": {
    "id": "061613e6-70e7-476c-ba2a-d7e462b115a6",
    "uuid": "061613e6-70e7-476c-ba2a-d7e462b115a6",
    "name": "G_DEVICES_BR_PROTON_OV",
    "friendlyName": "Brazil - Proton",
    "description": "",
    "enabled": true,
    "members": [],
    "itemCount": 1,
    "lastUpdated": "2025-07-14T10:19:48.270797",
    "rawContent": "Office_Desk_Screen",
    "type": "networkgroup",
    "proto": "",
    "interface": "",
    "counters": "0",
    "updatefreq": "",
    "categories": ""
  }
}
```

**Unauthenticated Error (IP Restriction):**
```json
{
  "success": false,
  "message": "Unauthorized: Unauthenticated users can only operate on their own IP address"
}
```

**Unauthenticated Error (Unmanaged Groups):**
```json
{
  "success": false,
  "message": "Self-service is restricted: Your device is associated with network groups that have been disabled by administrators. Self-service modifications are not allowed."
}
```

**Authenticated User Success:**
```json
{
  "success": true,
  "message": "Successfully added my-laptop to group Employee Devices",
  "updatedGroup": {
    "id": "group-uuid-here",
    "name": "G_DEVICES_EMPLOYEES",
    "friendlyName": "Employee Devices",
    "enabled": true,
    "members": [],
    "itemCount": 1,
    "lastUpdated": "2025-07-14T10:19:48.270797",
    "rawContent": "my-laptop",
    "type": "networkgroup",
    "proto": "",
    "interface": "",
    "counters": "0",
    "updatefreq": "",
    "categories": ""
  }
}
```

**Admin/Super Admin Success (Bypassing Restrictions):**
```json
{
  "success": true,
  "message": "Successfully added device to restricted group",
  "updatedGroup": {
    "id": "restricted-group-uuid",
    "name": "G_RESTRICTED_GROUP",
    "friendlyName": "Restricted Group",
    "enabled": true,
    "members": [],
    "itemCount": 1,
    "lastUpdated": "2025-07-14T10:19:48.270797",
    "rawContent": "device-hostname",
    "type": "networkgroup",
    "proto": "",
    "interface": "",
    "counters": "0",
    "updatefreq": "",
    "categories": ""
  }
}
```

**Authentication Methods:**
1. **Session Authentication**: For browser-based access using cookies
2. **API Key Authentication**: For programmatic access using Bearer tokens
3. **Unauthenticated Access**: For self-service operations (IP restrictions apply)

**Access Control Rules:**
- **Unauthenticated users**: Can only operate on their own IP address (client IP)
- **Authenticated users**: Can operate on their own IP address, plus any IP within allowed networks or devices they have permission to manage
- **IP normalization**: Handles IPv4-mapped IPv6 addresses and whitespace differences for accurate IP matching

**Unmanaged Groups Restrictions:**
- **Self-service operations are blocked** when the host is associated with "unmanaged groups"
- **Unmanaged groups** are defined as groups that are either:
  - **Globally disabled**: Groups marked as disabled in the system configuration
  - **Filtered out**: Groups that don't match the Network Display Filter criteria
- **Restriction applies to**: Unauthenticated users and non-admin authenticated users
- **Admin users**: Can still perform operations on unmanaged groups
- **Error response**: Returns HTTP 403 with clear error message explaining the restriction
- **Security**: All operations validate IP ownership and network restrictions before allowing access

**Self-Service IP Restrictions:**
- **Client IP Detection**: Uses `x-forwarded-for` or `x-real-ip` headers
- **Self-Service Access Control**: Configured in global settings for self-service access
- **Network Validation**: IPs must be within configured allowed networks
- **Authentication Override**: Authenticated users bypass IP restrictions for authorized IPs

## Device Group History Analytics

### GET /api/analytics/device-group-history

**Description**: Provides a chronological history of OPNsense group assignment operations for a device identified by **IP address** or **host alias name**. Used by the Device Group History graph on both Device Management and Self‑Service pages.

#### Authentication & Authorization
- **Self‑service (unauthenticated)**: Allowed for the client’s own IP address, subject to global `removeSelfServicePage` and `allowedNetworks` settings.
- **Authenticated users**: Any logged‑in user may query any device they have permission to manage.

#### Query Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ipAddress` | string | **Yes** (or `hostAliasName`) | IPv4/IPv6 address of the device. |
| `hostAliasName` | string | **Yes** (or `ipAddress`) | Host alias name of the device. |
| `currentGroups` | string (JSON) | No | JSON array of the current groups (id, uuid, name, friendlyName, groupType) as sent from the UI – used for accurate backward reconstruction. |
| `excludeMultiSelectGroups` | boolean | No (default `false`) | When `true`, any operation involving a **MultiSelect** group is omitted from the returned history. |
| `page` | integer | No (default `1`) | 1‑based pagination page. |
| `pageSize` | integer | No (default `25`, max `500`) | Number of records per page. |
| `days` | integer | No | Limit history to the last *N* days (applied to activation timestamps). |

#### Response Schema
```json
{
  "success": true,
  "data": {
    "device": {
      "id": "string",
      "ipAddress": "string",
      "hostAliasName": "string",
      "isOpnsenseMac": true,
      "hasMultipleIps": true
    },
    "history": [
      {
        "id": "string",
        "timestamp": "ISO8601",
        "action": "OPNSENSE_GROUP_IP_ASSIGN_SUCCESS" | "OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS" | "OPNSENSE_GROUP_IP_MOVE_SUCCESS" | "...",
        "groupName": "string",
        "groupType": "SingleSelect" | "MultiSelect",
        "user": "string",
        "change": 1 | -1,
        "details": { /* audit‑log specific fields */ }
      }
    ],
    "pagination": {
      "currentPage": 1,
      "pageSize": 25,
      "totalCount": 123,
      "totalPages": 5
    }
  }
}
```
- `history` is ordered **newest → oldest**.
- `groupType` is resolved from `opnsenseGroupDisplay`, UI `currentGroups`, or audit‑log metadata.
- When `excludeMultiSelectGroups=true`, entries for MultiSelect groups are omitted.

#### Error Responses
| Status | Condition | Body |
|--------|-----------|------|
| `400` | Neither `ipAddress` nor `hostAliasName` supplied. | `{ "success": false, "message": "Either ipAddress or hostAliasName is required" }` |
| `403` | Self‑service disabled (`globalSettings.removeSelfServicePage`). | `{ "error": "Forbidden: Self-service functionality is disabled" }` |
| `403` | IP not allowed for self‑service (fails `isIpAllowedForSelfService`). | `{ "error": "Forbidden: <reason>" }` |
| `401` | Unauthenticated request to a protected endpoint (should not occur for this route). |
| `500` | Unexpected server error. | `{ "success": false, "message": "Failed to fetch device group history" }` |

#### Example cURL Requests
```bash
# Basic request (self‑service) for own IP
curl -X GET "${SERVER_URL}/api/analytics/device-group-history?ipAddress=192.168.1.100"

# With MultiSelect filtering and pagination
curl -X GET "${SERVER_URL}/api/analytics/device-group-history?ipAddress=192.168.1.100&excludeMultiSelectGroups=true&page=2&pageSize=50"

# Authenticated request for another device (include current groups JSON)
curl -X GET "${SERVER_URL}/api/analytics/device-group-history?ipAddress=10.0.1.50&currentGroups=%5B%7B%22id%22%3A%22group-uuid%22%2C%22groupType%22%3A%22SingleSelect%22%7D%5D" \
  -H "Authorization: Bearer ${API_KEY}"
```

#### Notes & Gotchas
- The endpoint always returns `isOpnsenseMac` and `hasMultipleIps` flags for UI convenience.
- Pagination is applied **after** filtering and exclusion, so `totalCount` reflects the number of records that survive the filter.
- When `excludeMultiSelectGroups=true`, the UI hides those groups but the internal state reconstruction still tracks them for accurate history.

---

## Host Group Management Operations

### POST /api/opnsense/host-group-management

**Description**: Manage host alias group assignments in OPNsense with support for assign, unassign, and batch operations.

**Authentication**: Optional for self-service operations, required for managing other IPs

**Supported Operations**:
- `assign`: Assign a host alias to a group (supports move semantics; see Group Type Behavior)
- `unassign`: Remove a host alias from a group or from all groups if groupId is not provided
- `batch`: Perform multiple assign/unassign operations in a single request

**Validation Rules**:
- **Assignment operations** are rejected if the target group is disabled in OPNsense
- **Assignment operations** are rejected if the target group has an associated VPN that is disconnected or disabled
- **Unassignment operations** are NOT blocked by VPN status - users can always unassign from groups with down VPNs to restore connectivity
- This ensures users can recover from connectivity issues while preventing new assignments to problematic groups

## Assign Operation

**Description**: Assigns an IP address to a specific network group. If a host alias for the IP doesn't exist, one will be automatically created.

**Authentication**:
- **For own IP**: Optional (supports self-service for unauthenticated users)
- **For other IPs**: Required (session or API key)

### Request Parameters

- `operation` (string, required): Must be one of "assign", "unassign", or "batch"
  - **Validation**: Must be exactly "assign", "unassign", or "batch"
  - **Example**: `"assign"`

- `ipAddress` (string, optional): The IP address to assign. Can be omitted if `hostAliasName`, `hostAliasHostName`, or `hostname` is provided.
  - **Validation**: Must be a valid IPv4 or IPv6 address
  - **Example**: `"192.168.1.100"`

- `hostAliasName` (string, optional): The name of the host alias for logging purposes and for new alias creation
  - **Validation**: Must be a valid OPNsense alias name (alphanumeric, underscores, hyphens)
  - **Example**: `"my-device"`

- `hostAliasHostName` (string, optional): Alternative host alias identifier (currently treated same as hostAliasName)
  - **Validation**: Same as hostAliasName
  - **Example**: `"my-device"`

- `hostname` (string, optional): Creates a host alias from the provided hostname. The hostname will be sanitized (hyphens converted to underscores, invalid characters removed) for OPNsense compatibility. IP address will be automatically found in OPNsense ARP table if not provided.
  - **Validation**: Must be a valid hostname (RFC 1123 compliant)
  - **Sanitization**: Hyphens converted to underscores, special characters removed
  - **Example**: `"my-device"`

- `groupId` (string, optional): UUID of the target group. One of `groupId`, `groupName`, or `groupFriendlyName` is required.
  - **Validation**: Must be a valid UUID (v4 format)
  - **Example**: `"550e8400-e29b-41d4-a716-446655440000"`

- `groupName` (string, optional): OPNsense group name. One of `groupId`, `groupName`, or `groupFriendlyName` is required.
  - **Validation**: Must be a valid OPNsense group name
  - **Example**: `"G_DEVICES_VPN_USERS"`

- `groupFriendlyName` (string, optional): Locally assigned friendly name for the group. One of `groupId`, `groupName`, or `groupFriendlyName` is required.
  - **Validation**: Must be a valid friendly name
  - **Example**: `"VPN Users"`

- `description` (string, optional): Description for the host alias if a new one is created
  - **Validation**: Max 500 characters
  - **Example**: `"Production server"`

- `moveFromExisting` (boolean, optional): For SingleSelect targets, removes from other SingleSelect groups before assigning when used with `restrictRemovalToSingleSelect`. When group types are disabled, removes from all groups (original behavior).
  - **Validation**: Must be true or false
  - **Default**: `true`
  - **Example**: `true`

- `operationType` (string, required for batch operations): Must be "assign" or "unassign" when `operation` is "batch"
  - **Validation**: Must be exactly "assign" or "unassign"
  - **Example**: `"assign"`

- `hostAliases` (array, required for batch operations): Array of host alias objects for batch operations
  - **Validation**: Each object must contain valid host identifier fields
  - **Example**: `[{"ipAddress": "192.168.1.100"}, {"hostAliasName": "my-device"}]`

- `groups` (array, required for batch operations): Array of group objects for batch operations
  - **Validation**: Each object must contain valid group identifier fields
  - **Example**: `[{"groupId": "group-uuid"}, {"groupFriendlyName": "VPN Users"}]`

- `restrictRemovalToSingleSelect` (boolean, optional): When true, only removes from other SingleSelect groups during move operations
  - **Validation**: Must be true or false
  - **Default**: `false`
  - **Example**: `true`

### Group Type Behavior

Network groups now support two types that affect assignment behavior:

- **SingleSelect Groups**: Host alias can be in at most one SingleSelect group at a time
- **MultiSelect Groups**: Additive assignments; a host alias can be in multiple MultiSelect groups simultaneously

**Assignment Logic**:
- When assigning to a **SingleSelect** group: The host alias is moved from any other SingleSelect groups (respects `moveFromExisting` parameter)
- When assigning to a **MultiSelect** group: The host alias is added without removing from other groups (ignores `moveFromExisting` parameter)
- **Mixed assignments**: A host alias can be in multiple MultiSelect groups AND one SingleSelect group simultaneously

**API Behavior**:
- The `moveFromExisting` parameter is automatically determined based on the target group's type
- For SingleSelect groups: `moveFromExisting` defaults to `true` (traditional move behavior)
- For MultiSelect groups: `moveFromExisting` is forced to `false` (additive behavior)
- Manual `moveFromExisting` values are respected for SingleSelect groups but ignored for MultiSelect groups

#### SingleSelect Move Behavior

When assigning to a SingleSelect group, you can perform a server-side “move” that:
- Removes the host from other SingleSelect groups (excluding the target)
- Preserves all MultiSelect memberships

Use a batch request with:
- operation: "batch"
- operationType: "assign"
- moveFromExisting: true
- restrictRemovalToSingleSelect: true

Example (single-host migration):
```bash
curl -X POST "${SERVER_URL}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -d '{
    "operation": "batch",
    "operationType": "assign",
    "hostAliases": [{ "hostAliasName": "{{HOST_ALIAS_NAME}}" }],
    "groups": [{ "groupFriendlyName": "{{TARGET_GROUP_FRIENDLY_NAME}}" }],
    "moveFromExisting": true,
    "restrictRemovalToSingleSelect": true
  }'
```

Notes:
- With group types disabled, `moveFromExisting: true` removes the host from all groups (legacy behavior).
- See also “Usage Case 2: Authenticated SingleSelect Migration with Group ID” below for a full end-to-end example and response shape.

### Host Alias Identification Flexibility

The API supports multiple ways to identify host aliases:

1. **`ipAddress` with `hostAliasName`**: Validates that the host alias name matches the IP address
2. **`ipAddress` only**: Uses existing host alias or creates a new one with format `HOST_X_X_X_X`
3. **`hostAliasName` only**: Finds the host alias by name and uses its associated IP address
4. **`hostAliasHostName` only**: Treated the same as `hostAliasName`
5. **`hostname` only**: Creates a new host alias from the hostname with IP address found in OPNsense ARP table
6. **`hostname` with `ipAddress`**: Creates a new host alias from the hostname with the specified IP address

### Group Identification Flexibility

The API supports multiple ways to identify groups:

1. **`groupId`**: Uses the OPNsense UUID (highest priority)
2. **`groupName`**: Uses the OPNsense group name
3. **`groupFriendlyName`**: Uses the locally assigned friendly name

#### Usage Case 1: Self-Service Assignment (Unauthenticated)

**Scenario**: Unauthenticated user assigns their own IP to a group

**Example Request**:
```bash
# User assigns their own IP (192.168.1.65) from the same IP
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "assign",
    "ipAddress": "192.168.1.65",
    "groupFriendlyName": "Brazil - Proton",
    "description": "Self-service assignment",
    "moveFromExisting": true
  }'
```

**Success Response**:
```json
{

> Note: Response bodies may include `removedFromGroups` when a SingleSelect-restricted move occurs (batch with `moveFromExisting: true` and `restrictRemovalToSingleSelect: true`). This array lists the groups the host alias was removed from, using names and friendly names for clarity.

  "success": true,
  "message": "Office_Desk_Screen added to group G_DEVICES_BR_PROTON_OV (Brazil - Proton).",
  "updatedGroup": {
    "id": "061613e6-70e7-476c-ba2a-d7e462b115a6",
    "uuid": "061613e6-70e7-476c-ba2a-d7e462b115a6",
    "name": "G_DEVICES_BR_PROTON_OV",
    "friendlyName": "Brazil - Proton",
    "description": "",
    "enabled": true,
    "members": [],
    "itemCount": 1,
    "lastUpdated": "2025-07-14T10:19:48.270797",
    "rawContent": "Office_Desk_Screen",
    "type": "networkgroup",
    "proto": "",
    "interface": "",
    "counters": "0",
    "updatefreq": "",
    "categories": ""
  }
}
```

**Error Response** (when trying to assign different IP):
```json
{
  "success": false,
  "message": "Unauthorized: Unauthenticated users can only operate on their own IP address"
}
```

#### Usage Case 2: Authenticated SingleSelect Migration with Group ID

**Scenario**: Authenticated user assigns IP to group using group UUID

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "batch",
    "operationType": "assign",
    "hostAliases": [{ "hostAliasName": "my-laptop" }],
    "groups": [{ "groupId": "acc91c7e-1910-4427-a2e3-a3513650bc53" }],
    "description": "My laptop device",
    "moveFromExisting": true,
    "restrictRemovalToSingleSelect": true
  }'
```

**Success Response with SingleSelect-restricted move**:
```json
{
  "success": true,
  "message": "{{HOST_ALIAS_NAME}} added to group {{TARGET_GROUP_NAME}} ({{TARGET_GROUP_FRIENDLY_NAME}}).",
  "operationResults": [
    {
      "hostAlias": {
        "ipAddress": "{{IP_ADDRESS}}",
        "hostAliasName": "{{HOST_ALIAS_NAME}}"
      },
      "group": {
        "groupName": "{{TARGET_GROUP_NAME}}",
        "groupFriendlyName": "{{TARGET_GROUP_FRIENDLY_NAME}}"
      },
      "success": true
    }
  ],
  "removedFromGroups": [
    { "id": "{{PREVIOUS_GROUP_UUID_1}}", "name": "{{PREVIOUS_GROUP_NAME_1}}", "friendlyName": "{{PREVIOUS_GROUP_FRIENDLY_NAME_1}}" },
    { "id": "{{PREVIOUS_GROUP_UUID_2}}", "name": "{{PREVIOUS_GROUP_NAME_2}}", "friendlyName": "{{PREVIOUS_GROUP_FRIENDLY_NAME_2}}" }
  ],
  "moveFromExisting": true,
  "restrictRemovalToSingleSelect": true
}
```

#### Usage Case 3: Assignment Using Group Name

**Scenario**: Authenticated user assigns IP using OPNsense group name

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "assign",
    "ipAddress": "192.168.1.100",
    "groupName": "My Network Group",
    "description": "Added via API with group name",
    "moveFromExisting": true
  }'
```

#### Usage Case 4: Assignment Using Host Alias Name Only

**Scenario**: Authenticated user assigns using host alias name without IP address

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "assign",
    "hostAliasName": "my-laptop",
    "groupName": "My Network Group",
    "description": "Added via host alias name only",
    "moveFromExisting": true
  }'
```

#### Usage Case 5: Assignment with Hostname Detection

**Scenario**: Create host alias from hostname with automatic IP detection

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "assign",
    "hostname": "camb-netbird",
    "groupFriendlyName": "Brazil - VPN",
    "description": "Auto-created from hostname",
    "moveFromExisting": true
  }'
```

#### Usage Case 6: Hostname with Specific IP

**Scenario**: Create host alias from hostname with specific IP address

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "assign",
    "hostname": "new-laptop",
    "ipAddress": "10.0.1.75",
    "groupFriendlyName": "Employee Devices",
    "description": "New employee laptop"
  }'
```

#### Usage Case 7: Multiple Group Membership

**Scenario**: Add device to additional group without removing from existing groups

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "assign",
    "ipAddress": "10.0.1.50",
    "groupFriendlyName": "Backup Access",
    "moveFromExisting": false
  }'
```

#### Usage Case 8: Alternative Host Alias Identifier

**Scenario**: Use alternative host alias identifier

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "assign",
    "hostAliasHostName": "backup_server_alt",
    "groupId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

## Unassign Operation

**Description**: Removes an IP address from a specific network group or from all groups if no group is specified.

### Request Parameters

- `operation`: Must be "unassign"
- `ipAddress`: (Optional) The IP address to unassign. Can be omitted if `hostAliasName` or `hostAliasHostName` is provided.
- `hostAliasName`: (Optional) The name of the host alias for logging purposes
- `hostAliasHostName`: (Optional) Alternative host alias identifier (currently treated same as hostAliasName)
- `groupId`: (Optional) UUID of the target group. If omitted, unassigns from all groups.
- `groupName`: (Optional) OPNsense group name. If omitted, unassigns from all groups.
- `groupFriendlyName`: (Optional) Locally assigned friendly name for the group. If omitted, unassigns from all groups.

#### Usage Case 1: Unassign from Specific Group

**Scenario**: Remove IP from a specific group using group name

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "unassign",
    "ipAddress": "192.168.1.100",
    "groupName": "My Network Group"
  }'
```

**Success Response**:
```json
{
  "success": true,
  "message": "Office_Desk_Screen removed from group Brazil - Proton.",
  "updatedGroup": {
    "id": "061613e6-70e7-476c-ba2a-d7e462b115a6",
    "uuid": "061613e6-70e7-476c-ba2a-d7e462b115a6",
    "name": "G_DEVICES_BR_PROTON_OV",
    "friendlyName": "Brazil - Proton",
    "description": "",
    "enabled": true,
    "members": [],
    "itemCount": 0,
    "lastUpdated": "2025-07-14T10:20:15.123456",
    "rawContent": "",
    "type": "networkgroup",
    "proto": "",
    "interface": "",
    "counters": "0",
    "updatefreq": "",
    "categories": ""
  }
}
```

#### Usage Case 2: Unassign from All Groups

**Scenario**: Remove IP from all groups it belongs to

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "unassign",
    "ipAddress": "192.168.1.100",
    "hostAliasName": "my-laptop"
  }'
```

**Success Response (all groups)**:
```json
{
  "success": true,
  "message": "Successfully unassigned IP from all groups: Group1, Group2, Group3"
}
```

**Partial Success Response**:
```json
{
  "success": true,
  "message": "Partially unassigned IP. Succeeded: Group1, Group2. Failed: Group3",
  "partialSuccess": true,
  "successGroups": ["Group1", "Group2"],
  "failedGroups": ["Group3"]
}
```

#### Usage Case 3: Unassign Using Host Alias Name Only

**Scenario**: Remove host alias from all groups using name only

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "unassign",
    "hostAliasName": "my-laptop"
  }'
```

#### Usage Case 4: Unassign Using Group Friendly Name

**Scenario**: Remove device from specific group using friendly name

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "unassign",
    "ipAddress": "192.168.1.50",
    "groupFriendlyName": "Guest Network"
  }'
```

#### Usage Case 5: Unassign Using Group ID

**Scenario**: Remove device from specific group using UUID

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "unassign",
    "hostAliasName": "production_server",
    "groupId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

## Batch Operations

**Description**: Batch operations allow you to perform multiple assign or unassign operations in a single API call, with a single reconfigure operation at the end for better performance.

### Batch Assign Operation

**Description**: Assigns multiple host aliases to multiple groups in a single operation.

### Request Parameters

- `operation`: Must be "batch"
- `operationType`: Must be "assign" or "unassign"
- `hostAliases`: Array of host alias objects
  - `ipAddress`: (Optional) The IP address to manage
  - `hostAliasName`: (Optional) The name of the host alias
  - `hostAliasHostName`: (Optional) Alternative host alias identifier
  - `hostname`: (Optional) Creates a host alias from the provided hostname (sanitized for OPNsense compatibility). IP address will be automatically found in OPNsense ARP table if not provided.
  - `description`: (Optional) Description for the host alias if a new one is created
- `groups`: Array of group objects
  - `groupId`: (Optional) UUID of the target group
  - `groupName`: (Optional) OPNsense group name
  - `groupFriendlyName`: (Optional) Locally assigned friendly name
- `description`: (Optional) Description for new host aliases if created
- `moveFromExisting`: (Optional) If true, removes IPs from all other groups before assignment (default: true)

#### Usage Case 1: Batch Assign Multiple IPs to Multiple Groups

**Scenario**: Assign multiple devices to multiple groups in one operation

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "batch",
    "operationType": "assign",
    "hostAliases": [
      {"ipAddress": "192.168.1.60"},
      {"ipAddress": "192.168.1.61"},
      {"ipAddress": "192.168.1.62", "hostAliasName": "my-device"},
      {"hostname": "another-device", "ipAddress": "192.168.1.168"},
      {"hostname": "my-device-only"}
    ],
    "groups": [
      {"groupFriendlyName": "Italy - Proton"},
      {"groupName": "G_DEVICES_BR_VPN_OV"},
      {"groupId": "group-uuid-here"}
    ],
    "description": "Batch assignment for multiple devices",
    "moveFromExisting": true
  }'
```

**Success Response**:
```json
{
  "success": true,
  "message": "Batch operation completed successfully",
  "operationResults": [
    {
      "hostAlias": { "ipAddress": "{{IP_ADDRESS_1}}", "hostAliasName": "{{HOST_ALIAS_NAME_1}}" },
      "group": { "groupFriendlyName": "{{GROUP_FRIENDLY_NAME_1}}" },
      "success": true
    },
    {
      "hostAlias": { "ipAddress": "{{IP_ADDRESS_2}}", "hostAliasName": "{{HOST_ALIAS_NAME_2}}" },
      "group": { "groupName": "{{GROUP_NAME_2}}" },
      "success": true
    }
  ]
}
```

**Partial Success Response**:
```json
{
  "success": true,
  "message": "Batch operation completed with some failures",
  "operationResults": [
    {
      "hostAlias": { "ipAddress": "{{IP_ADDRESS_1}}", "hostAliasName": "{{HOST_ALIAS_NAME_1}}" },
      "group": { "groupFriendlyName": "{{GROUP_FRIENDLY_NAME_1}}" },
      "success": true
    },
    {
      "hostAlias": { "ipAddress": "{{IP_ADDRESS_2}}", "hostAliasName": "{{HOST_ALIAS_NAME_2}}" },
      "group": { "groupFriendlyName": "{{NON_EXISTENT_GROUP}}" },
      "success": false,
      "error": "Could not resolve group"
    }
  ]
}
```

### Batch Unassign Operation

**Description**: Unassigns multiple host aliases from multiple groups in a single operation.

#### Usage Case 2: Batch Assign with Mixed Parameters

**Scenario**: Assign devices using different parameter combinations

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "batch",
    "operationType": "assign",
    "hostAliases": [
      {"ipAddress": "10.0.1.100"},
      {"hostAliasName": "existing_device"},
      {"hostname": "new-device"},
      {"hostname": "specific-device", "ipAddress": "10.0.1.101"},
      {"hostAliasHostName": "alternative_name"}
    ],
    "groups": [
      {"groupId": "550e8400-e29b-41d4-a716-446655440000"},
      {"groupName": "G_DEVICES_MIXED"},
      {"groupFriendlyName": "Mixed Environment"}
    ]
  }'
```

#### Usage Case 3: Batch Unassign Multiple IPs from Groups

**Scenario**: Remove multiple devices from groups in one operation

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "batch",
    "operationType": "unassign",
    "hostAliases": [
      {"ipAddress": "192.168.1.60"},
      {"ipAddress": "192.168.1.61"}
    ],
    "groups": [
      {"groupFriendlyName": "Italy - Proton"}
    ]
  }'
```

#### Usage Case 4: Batch Unassign from All Groups

**Scenario**: Remove multiple devices from all groups they belong to

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "batch",
    "operationType": "unassign",
    "hostAliases": [
      {"ipAddress": "10.0.1.50"},
      {"hostAliasName": "old_server"},
      {"ipAddress": "10.0.1.51", "hostAliasName": "backup_server"}
    ]
  }'
```

#### Usage Case 5: Complex Migration Batch

**Scenario**: Migrate devices between environments with detailed tracking

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "batch",
    "operationType": "assign",
    "hostAliases": [
      {"ipAddress": "10.0.1.10", "hostAliasName": "web_server_01"},
      {"ipAddress": "10.0.1.11", "hostAliasName": "web_server_02"},
      {"ipAddress": "10.0.1.12", "hostAliasName": "db_server_01"}
    ],
    "groups": [
      {"groupFriendlyName": "Production Environment"}
    ],
    "description": "Production migration batch",
    "moveFromExisting": true
  }'
```

**Success Response**:
```json
{
  "success": true,
  "message": "Batch unassign operation completed successfully",
  "operationResults": [
    {
      "hostAlias": {
        "ipAddress": "192.168.1.60"
      },
      "group": {
        "groupFriendlyName": "Italy - Proton"
      },
      "success": true,
      "message": "Successfully unassigned IP 192.168.1.60 from group Italy - Proton"
    },
    {
      "hostAlias": {
        "ipAddress": "192.168.1.61"
      },
      "group": {
        "groupFriendlyName": "Italy - Proton"
      },
      "success": true,
      "message": "Successfully unassigned IP 192.168.1.61 from group Italy - Proton"
    }
  ]
}
```

### Batch Operation Benefits

1. **Performance**: Single reconfigure call instead of multiple calls
2. **Efficiency**: Reduces API overhead and OPNsense load
3. **Atomicity**: All operations succeed or fail together
4. **Flexibility**: Supports both assign and unassign operations
5. **Error Handling**: Detailed results for each operation
6. **Automatic Host Alias Creation**: Creates missing host aliases during batch assignment with hostname detection
7. **Optimized Move Operations**: Efficient handling of `moveFromExisting` with consolidated group updates

## Hostname Detection and Sanitization

### Overview

When creating new host aliases during assignment operations, the system automatically detects and uses hostnames from the network instead of defaulting to generic `HOST_X.X.X.X` names.

### How It Works

1. **Automatic Detection**:
   - Uses OPNsense ARP table to find hostname information
   - Falls back to local network utilities if OPNsense data is unavailable
   - Gracefully handles detection failures

2. **Naming Strategy**:
   - **Primary**: Uses detected hostname as the alias name (sanitized for OPNsense compatibility)
   - **Fallback**: Uses default `HOST_X.X.X.X` format if no hostname detected
   - **Error Handling**: Continues with default naming if detection fails
   - **Sanitization**: Converts hyphens to underscores and removes invalid characters

3. **Enhanced Descriptions**:
   - Includes detected hostname in the description field
   - Provides context about the source of the hostname
   - Format: `Auto-created host alias for IP X.X.X.X (detected hostname: hostname)`

### Hostname Sanitization Rules

When using the `hostname` parameter, the system automatically sanitizes the hostname for OPNsense compatibility:

- **Hyphens (`-`) are converted to underscores (`_`)**: `my-device` becomes `my_device`
- **Invalid characters are replaced with underscores**: Any character that's not alphanumeric or underscore
- **Leading/trailing underscores are removed**: `_my_device_` becomes `my_device`
- **Empty hostnames are replaced with `HOST`**: If sanitization results in an empty string

### Examples

**Hostname Sanitization:**
```
Original Hostname    → Sanitized Hostname
"another-device"       → "another_device"
"my.device@home"     → "my_device_home"
"_device-name_"      → "device_name"
"user-laptop"        → "user_laptop"
```

**With Hostname Detection:**
```json
{
  "name": "office_laptop",
  "content": "192.168.1.100",
  "description": "Auto-created host alias for IP 192.168.1.100 (detected hostname: office-laptop)"
}
```

**Without Hostname Detection (Fallback):**
```json
{
  "name": "HOST_192_168_1_100",
  "content": "192.168.1.100",
  "description": "Auto-created host alias for IP 192.168.1.100"
}
```

## Error Codes and Responses

- `400 Bad Request`: Invalid parameters or operation
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: IP access denied (for self-service operations)
- `500 Internal Server Error`: Server-side error
- `207 Multi-Status`: Partial success (for unassign from all groups)

### Access Control Error Responses

**Self-Service IP Restriction:**
```json
{
  "success": false,
  "message": "Unauthorized: Unauthenticated users can only operate on their own IP address"
}
```

**Network Access Restriction:**
```json
{
  "success": false,
  "message": "Unauthorized: IP address is not in allowed networks for self-service access"
}
```

**Unmanaged Groups Restriction:**
```json
{
  "success": false,
  "message": "Self-service is restricted: Your device is associated with network groups that have been disabled by administrators. Self-service modifications are not allowed."
}
```

**Filtered Groups Restriction:**
```json
{
  "success": false,
  "message": "Self-service is restricted: Your device is associated with network groups that are not available for self-service access. Please contact your network administrator for assistance."
}
```

### Validation Error Responses

**Group Disabled:**
```json
{
  "success": false,
  "message": "Cannot assign to group \"Brazil - VPN\" because it is disabled in OPNsense. Please enable the group first or contact an administrator."
}
```

**VPN Disconnected (Assignment Only):**
```json
{
  "success": false,
  "message": "Cannot assign to group \"Brazil - VPN\" because its associated WireGuard VPN is disconnected. Please ensure the VPN is connected or contact an administrator."
}
```

> **Note**: VPN status validation only applies to assignment operations. Unassignment operations are always allowed, even when the VPN is disconnected, to enable users to recover from connectivity issues.

**Parameter Resolution Errors:**
```json
{
  "success": false,
  "message": "Could not resolve group. Please provide valid groupId, groupName, or groupFriendlyName parameters."
}
```

```json
{
  "success": false,
  "message": "Could not resolve host alias. Please provide valid ipAddress, hostAliasName, hostAliasHostName, or hostname parameters."
}
```

**Invalid Operation:**
```json
{
  "success": false,
  "message": "Invalid operation. Must be one of: assign, unassign, batch"
}
```

**Batch Operation Errors:**
```json
{
  "success": false,
  "message": "operationType must be either \"assign\" or \"unassign\""
}
```

```json
{
  "success": false,
  "message": "Must provide either hostAliases, groups, or batchOperations"
}
```

## Audit Logging

All operations are logged with comprehensive information for security and compliance:

### Logged Information
- **User ID**: User ID or null for unauthenticated access
- **Operation Type** (`operationType`): Consistent field across all events indicating the operation type:
  - `'assign'`: Regular assignment operation
  - `'move'`: Move operation (assignment with `moveFromExisting` that removed from other groups)
  - `'unassign'`: Single group unassignment
  - `'unassign_all'`: Unassignment from all groups
- **IP Address**: Target IP address being managed
- **Host Alias Details**: Name and hostname if provided
- **Group Information**: IDs, names, friendly names, and **group types** of affected groups
- **Group Type**: `SingleSelect` or `MultiSelect` - stored in all group objects (targetGroup, unassignedGroup, groups array, removedFromGroups array) for filtering and analytics
- **Success/Failure Status**: Operation outcome
- **Authentication Method**: Session, API Key, or Unauthenticated (Client IP)
- **Client IP Address**: Source IP for security tracking
- **Move Operations**: Details about groups removed during moveFromExisting operations, including their group types
- **Legacy Fields**: `wasMoved` and `moveOperation` fields are still present for backward compatibility but `operationType` is now the recommended field to check

### Audit Actions
- `OPNSENSE_GROUP_IP_ASSIGN_ATTEMPT`: Assignment operation initiated
- `OPNSENSE_GROUP_IP_ASSIGN_SUCCESS`: Assignment completed successfully
- `OPNSENSE_GROUP_IP_ASSIGN_FAILURE`: Assignment failed
- `OPNSENSE_GROUP_IP_UNASSIGN_ATTEMPT`: Unassignment operation initiated
- `OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS`: Unassignment completed successfully
- `OPNSENSE_GROUP_IP_UNASSIGN_FAILURE`: Unassignment failed
- `OPNSENSE_GROUP_IP_UNASSIGN_ALL_ATTEMPT`: Unassign from all groups initiated
- `OPNSENSE_GROUP_IP_UNASSIGN_ALL_SUCCESS`: Unassign from all groups completed successfully
- `OPNSENSE_GROUP_IP_UNASSIGN_ALL_PARTIAL`: Partial success when unassigning from all groups
- `OPNSENSE_GROUP_IP_UNASSIGN_ALL_FAILURE`: Unassign from all groups failed
- `OPNSENSE_GROUP_IP_MOVE_SUCCESS`: Move operation completed successfully (when moveFromExisting is true)
- `OPNSENSE_GROUP_IP_MOVE_REMOVE`: Individual group removal during move operation

### Batch Operation Audit Actions
- `OPNSENSE_GROUP_IP_BATCH_ASSIGN_ATTEMPT`: Batch assign operation initiated
- `OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS`: Batch assign completed successfully
- `OPNSENSE_GROUP_IP_BATCH_ASSIGN_FAILURE`: Batch assign failed
- `OPNSENSE_GROUP_IP_BATCH_ASSIGN_PARTIAL`: Partial success in batch assign
- `OPNSENSE_GROUP_IP_BATCH_UNASSIGN_ATTEMPT`: Batch unassign operation initiated
- `OPNSENSE_GROUP_IP_BATCH_UNASSIGN_SUCCESS`: Batch unassign completed successfully
- `OPNSENSE_GROUP_IP_BATCH_UNASSIGN_FAILURE`: Batch unassign failed
- `OPNSENSE_GROUP_IP_BATCH_UNASSIGN_PARTIAL`: Partial success in batch unassign

### operationType Field

All SUCCESS, FAILURE, and ATTEMPT audit events now include a consistent `operationType` field in the `details` object. This field provides a standardized way to identify the operation type across all events.

#### Possible Values

| Value | Description | Used In |
|-------|-------------|---------|
| `'assign'` | Regular assignment to a group | Assignment operations without move |
| `'move'` | Move operation (assign with removal from other groups) | Assignment with `moveFromExisting=true` that removed from groups |
| `'unassign'` | Removal from a specific group | Single group unassignment |
| `'unassign_all'` | Removal from all groups | Unassign all operations |

#### Benefits

- **Consistent Querying**: Use the same field across ATTEMPT, SUCCESS, and FAILURE events
- **Simplified Logic**: No need to check multiple fields (`wasMoved`, `moveOperation`, `removedFromGroups.length`)
- **Better Analytics**: Easier to filter and aggregate operations by type
- **Future-Proof**: Recommended field for new integrations

#### Example Query

**Find all move operations:**
```sql
SELECT * FROM audit_logs 
WHERE details->>'operationType' = 'move';
```

**Find all assignment-related operations (assign or move):**
```sql
SELECT * FROM audit_logs 
WHERE details->>'operationType' IN ('assign', 'move');
```

#### Backward Compatibility

Legacy fields are still present for backward compatibility:
- `wasMoved` (boolean) - Still included in SUCCESS events
- `moveOperation` (boolean) - Still included in SUCCESS events
- Different `action` names (`MOVE_SUCCESS` vs `ASSIGN_SUCCESS`) - Still used

New integrations should use `operationType` for consistency.

### Example Audit Log Entry
```json
{
  "action": "OPNSENSE_GROUP_IP_MOVE_SUCCESS",
  "details": {
    "operationType": "move",
    "groupId": "target-group-uuid",
    "ipAddress": "192.168.1.100",
    "hostAliasName": "HOST_192_168_1_100",
    "moveOperation": true,
    "wasMoved": true,
    "sourceGroups": [
      {
        "id": "previous-group-uuid-123",
        "name": "G_DEVICES_IT_VPN_OV",
        "friendlyName": "Italy - VPN",
        "groupType": "SingleSelect"
      },
      {
        "id": "previous-group-uuid-456",
        "name": "G_DEVICES_UK_VPN_OV",
        "friendlyName": "United Kingdom - VPN",
        "groupType": "SingleSelect"
      }
    ],
    "targetGroup": {
      "id": "target-group-uuid",
      "name": "G_DEVICES_BR_PROTON_OV",
      "friendlyName": "Brazil - Proton",
      "groupType": "SingleSelect"
    }
  }
}
```

> **Note**: The `operationType` field is now the recommended way to determine the operation type. Legacy fields `moveOperation` and `wasMoved` are still present for backward compatibility.

#### Additional operationType Examples

**Regular Assignment** (`operationType: 'assign'`):
```json
{
  "action": "OPNSENSE_GROUP_IP_ASSIGN_SUCCESS",
  "details": {
    "operationType": "assign",
    "ipAddress": "192.168.1.50",
    "hostAliasName": "laptop_user",
    "targetGroup": {
      "id": "group-uuid",
      "name": "G_DEVICES_GUEST",
      "friendlyName": "Guest Network"
    }
  }
}
```

**Unassignment** (`operationType: 'unassign'`):
```json
{
  "action": "OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS",
  "details": {
    "operationType": "unassign",
    "ipAddress": "192.168.1.50",
    "hostAliasName": "laptop_user",
    "unassignedGroup": {
      "id": "group-uuid",
      "name": "G_DEVICES_GUEST",
      "friendlyName": "Guest Network"
    }
  }
}
```

**Unassign All** (`operationType: 'unassign_all'`):
```json
{
  "action": "OPNSENSE_GROUP_IP_UNASSIGN_ALL_SUCCESS",
  "details": {
    "operationType": "unassign_all",
    "ipAddress": "192.168.1.50",
    "hostAliasName": "laptop_user",
    "totalGroupsUnassigned": 3,
    "successfulUnassignments": 3
  }
}
```

#### Batch Audit Log Payload Enhancements

When a SingleSelect-restricted move occurs in batch (single host alias, single target, `moveFromExisting: true`, `restrictRemovalToSingleSelect: true`), success audit entries include:

```json
{
  "action": "OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS",
  "details": {
    "operationType": "assign",
    "hostAliases": [{ "hostAliasName": "{{HOST_ALIAS_NAME}}" }],
    "groups": [{ "groupFriendlyName": "{{TARGET_GROUP_FRIENDLY_NAME}}", "groupType": "SingleSelect" }],
    "removedFromGroups": [
      { "id": "{{PREVIOUS_GROUP_UUID}}", "name": "{{PREVIOUS_GROUP_NAME}}", "friendlyName": "{{PREVIOUS_GROUP_FRIENDLY_NAME}}", "groupType": "SingleSelect" }
    ]
  }
}
```

For multi-host cases, entries include a per-host breakdown:

```json
{
  "action": "OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS",
  "details": {
    "removedFromGroupsByHost": [
      { "hostAliasName": "{{HOST_ALIAS_NAME_1}}", "removedFromGroups": [{ "id": "...", "name": "...", "friendlyName": "..." }] },
      { "hostAliasName": "{{HOST_ALIAS_NAME_2}}", "removedFromGroups": [{ "id": "...", "name": "...", "friendlyName": "..." }] }
    ]
  }
}
```

    ],
    "targetGroup": {
      "id": "target-group-uuid",
      "name": "G_DEVICES_BR_VPN_OV",
      "friendlyName": "Brazil - VPN"
    },
    "hostAliasDetails": {
      "name": "HOST_192_168_1_100",
      "hostname": "device-hostname",
      "ipAddress": "192.168.1.100"
    },
    "authMethod": "API_KEY",
    "removedFromGroups": [
      {
        "id": "previous-group-uuid-123",
        "name": "G_DEVICES_IT_VPN_OV",
        "friendlyName": "Italy - VPN"
      },
      {
        "id": "previous-group-uuid-456",
        "name": "G_DEVICES_UK_VPN_OV",
        "friendlyName": "United Kingdom - VPN"
      }
    ]
  }
}
```

## Quick Reference

### Parameter Combinations Summary

| Use Case | ipAddress | hostAliasName | hostname | groupId | groupName | groupFriendlyName |
|----------|-----------|---------------|----------|---------|-----------|-------------------|
| Direct assignment | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Validated assignment | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Name-based assignment | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Friendly assignment | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| New device (hostname) | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Auto-detect device | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |

### Operation Types

| Operation | Purpose | Required Parameters |
|-----------|---------|-------------------|
| `assign` | Add device to group | Target + Group identifier |
| `unassign` | Remove from specific group | Target + Group identifier |
| `unassign` | Remove from all groups | Target identifier only |
| `batch` | Multiple operations | `operationType` + arrays |

### Authentication Methods

| Method | Use Case | Access Level |
|--------|----------|-------------|
| Unauthenticated | Self-service | Own IP only |
| Session Cookie | Web interface | Authorized IPs |
| API Key | Automation | Authorized IPs |

## Complete Usage Examples

### Test Error Cases

**Missing Group Identifier:**
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "assign",
    "ipAddress": "192.168.1.100"
  }'
```

**Invalid Operation:**
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "invalid_operation",
    "ipAddress": "192.168.1.100",
    "groupId": "acc91c7e-1910-4427-a2e3-a3513650bc53"
  }'
```

**Mismatched IP and Host Alias Name:**
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "assign",
    "ipAddress": "192.168.1.100",
    "hostAliasName": "different-device",
    "groupId": "acc91c7e-1910-4427-a2e3-a3513650bc53"
  }'
```

**Batch Operation with Invalid Group:**
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "batch",
    "operationType": "assign",
    "hostAliases": [
      {"ipAddress": "192.168.1.60"}
    ],
    "groups": [
      {"groupFriendlyName": "Non-existent Group"}
    ]
  }'
```

## Important Notes and Restrictions

1. **Operations on IPs with multiple host aliases are not allowed**
2. **Unauthenticated users can only perform operations on their own IP address**
3. **When using `hostAliasName` without `ipAddress`, host creation is skipped**
4. **IP addresses must be within allowed networks for self-service access operations**
5. **Authenticated users must have permission to manage the target IP addresses**
6. **When adding an IP to a group, if no host alias exists for that IP, one will be automatically created**
7. **OPNsense requires host aliases for network groups - raw IP addresses cannot be added directly**
8. **The API prioritizes parameter resolution: `groupId` > `groupName` > `groupFriendlyName`**
9. **For host aliases: `ipAddress + hostAliasName` > `ipAddress only` > `hostAliasName only` > `hostAliasHostName only`**
10. **The `moveFromExisting` parameter ensures IPs are only in one group at a time when enabled**
11. **All operations are subject to IP-based access control for self-service functionality**
12. **Enhanced Move Response**: When `moveFromExisting` is true and groups are removed, the response includes a `removedFromGroups` array with detailed information about each group the host alias was removed from, including their UUIDs, names, and friendly names
13. **Comprehensive Audit Logging**: Move operations generate detailed audit logs including individual removal events for each group the host alias was removed from

## Use Cases

### Self-Service Device Onboarding
1. User visits self-service page
2. System detects their IP address automatically
3. User can assign their device to appropriate network groups
4. System validates DHCP reservation status
5. User receives confirmation of group membership

### Network Access Management
1. User checks current group membership
2. User can unassign from current groups
3. User can assign to new groups
4. System enforces IP restrictions automatically

### Administrative Operations
1. Bulk device management
2. Group reorganization
3. Network access provisioning
4. Audit trail maintenance

## Comprehensive Testing Examples

### Basic Testing Workflow

**1. Test Traditional Assignment:**
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "assign",
    "ipAddress": "10.0.1.100",
    "groupId": "550e8400-e29b-41d4-a716-446655440000",
    "description": "Production server"
  }'
```

**2. Test Hostname-Based Assignment:**
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "assign",
    "hostname": "new-laptop",
    "groupFriendlyName": "Employee Devices"
  }'
```

**3. Test Batch Operation:**
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "batch",
    "operationType": "assign",
    "hostAliases": [
      {"ipAddress": "10.0.1.10"},
      {"hostname": "printer-office"}
    ],
    "groups": [
      {"groupFriendlyName": "Office Equipment"}
    ]
  }'
```

**4. Test Unassign Operation:**
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "unassign",
    "hostAliasName": "old_server"
  }'
```

**5. Test Self-Service (Unauthenticated):**
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "assign",
    "groupFriendlyName": "Home Devices"
  }'
```

### Advanced Testing Scenarios

**Test Parameter Resolution Priority:**
```bash
# Test with multiple group identifiers (groupId takes priority)
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "assign",
    "ipAddress": "10.0.1.100",
    "groupId": "550e8400-e29b-41d4-a716-446655440000",
    "groupName": "G_DEVICES_TEST",
    "groupFriendlyName": "Test Group"
  }'
```

**Test Hostname Sanitization:**
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "assign",
    "hostname": "my-device@home.local",
    "ipAddress": "10.0.1.100",
    "groupFriendlyName": "Test Group"
  }'
```

**Test moveFromExisting Behavior:**
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-group-management" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "operation": "assign",
    "ipAddress": "10.0.1.100",
    "groupFriendlyName": "New Group",
    "moveFromExisting": false
  }'
```

## Tips for Testing

1. **Start with Simple Cases**: Begin with traditional `ipAddress` + `groupId` combinations
2. **Test Parameter Resolution**: Try different combinations of group identifiers
3. **Verify Hostname Sanitization**: Test with special characters in hostnames
4. **Check Error Handling**: Test invalid parameters and edge cases
5. **Monitor Audit Logs**: Check that all operations are properly logged
6. **Test Authentication**: Try different authentication methods
7. **Validate Responses**: Ensure response format matches expectations
8. **Test Self-Service**: Verify IP restrictions work correctly for unauthenticated access
9. **Test Batch Operations**: Verify efficiency and error handling in batch mode
10. **Test moveFromExisting**: Verify group removal behavior with different settings

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