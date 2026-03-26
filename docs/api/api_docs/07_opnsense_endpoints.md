# OPNsense Endpoints

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
curl -X GET "${SERVER_URL}/api/opnsense/aliases" \
  -H "Authorization: Bearer ${API_KEY}"
```

This section covers all OPNsense-related API endpoints for managing firewall aliases, network groups, and OPNsense integration.

## Role-Based Access Control

**Authentication Required:** Mixed (Optional for self-service, Required for admin access)

**Role Requirements:**
- **Unauthenticated**: ✅ Can access specific endpoints with IP restrictions
- **USER**: ✅ Can access read-only OPNsense endpoints
- **ADMIN**: ✅ Can access read and write OPNsense endpoints
- **SUPER_ADMIN**: ✅ Can access all OPNsense endpoints

**Role Access:**
- **Unauthenticated**: ✅ Can query specific IP addresses (with restrictions)
- **USER**: ✅ Can access filtered data based on permissions
- **ADMIN**: ✅ Can access all OPNsense data with administrative permissions
- **SUPER_ADMIN**: ✅ Can access all OPNsense data with full system permissions

**Example Responses:**

**Self-Service Success (Unauthenticated):**
```json
{
  "name": "Office_Desk_Screen",
  "uuid": "45653f16-70b0-4a44-b311-abda1da4c2b5"
}
```

**Authenticated User Success:**
```json
{
  "aliases": [
    {
      "id": "alias-uuid-1",
      "name": "VPN Users",
      "type": "host",
      "content": "192.168.1.100\n192.168.1.101"
    }
  ]
}
```

**Access Denied (USER Role):**
```json
{
  "error": "Insufficient permissions"
}
```

## Alias Management

### GET /api/opnsense/aliases

**Description**: Retrieve OPNsense aliases with optional IP address filtering.

**Authentication**:
- **With `ipAddress` parameter**: Optional (supports self-service for unauthenticated users)
- **Without `ipAddress` parameter**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Requirements:**
- **Unauthenticated**: ✅ Can query specific IP addresses (with restrictions)
- **USER**: ❌ Cannot access without IP parameter
- **ADMIN**: ✅ Can read all aliases
- **SUPER_ADMIN**: ✅ Can read all aliases

**Role Access:**
- **Unauthenticated**: ✅ Can query specific IP addresses (with restrictions) - Only allowed for own IP address
- **USER**: ❌ Cannot access without IP parameter - Requires ADMIN or SUPER_ADMIN role
- **ADMIN**: ✅ Can read all aliases with administrative permissions
- **SUPER_ADMIN**: ✅ Can read all aliases with full system permissions

**Example Responses:**

**Self-Service Success (Unauthenticated):**
```json
{
  "name": "Office_Desk_Screen",
  "uuid": "45653f16-70b0-4a44-b311-abda1da4c2b5"
}
```

**Admin Success (ADMIN/SUPER_ADMIN):**
```json
{
  "hostAliases": [
    {
      "id": "alias-uuid-1",
      "name": "VPN Users",
      "type": "host",
      "content": "192.168.1.100",
      "description": "VPN user device",
      "enabled": true,
      "uuid": "alias-uuid-1"
    }
  ],
  "networkGroups": [],
  "totalCount": 1
}
```

**Access Denied (USER Role):**
```json
{
  "error": "Insufficient permissions"
}
```

**Query Parameters**:
- `ipAddress` (string, optional): Filter aliases by IP address. Must be a valid IPv4 or IPv6 address.
  - **Validation**: Validates IP address format and range
  - **Example**: `192.168.1.100` or `2001:db8::1`

#### Usage Case 1: Self-Service IP Lookup (Unauthenticated)

**Scenario**: Unauthenticated user queries their own IP address

**Example Request**:
```bash
# User queries their own IP (192.168.1.65) from the same IP
curl -X GET "{{SERVER_URL}}/api/opnsense/aliases?ipAddress=192.168.1.65" \
  -H "Content-Type: application/json"
```

**Success Response** (when IP matches client IP and alias exists):
```json
{
  "name": "Office_Desk_Screen",
  "uuid": "45653f16-70b0-4a44-b311-abda1da4c2b5"
}
```

**Success Response** (when IP matches client IP but no alias found):
```json
{
  "name": null,
  "uuid": null
}
```

**Error Response** (when querying different IP):
```json
{
  "error": "Forbidden: Unauthenticated users can only operate on their own IP address"
}
```

#### Usage Case 2: Self-Service IP Lookup (Authenticated Users)

**Scenario**: Authenticated user queries any IP they have permission for

**Example Request**:
```bash
# Authenticated user queries any IP
curl -X GET "{{SERVER_URL}}/api/opnsense/aliases?ipAddress=192.168.1.100" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "name": "John_Laptop",
  "uuid": "12345678-1234-1234-1234-123456789abc"
}
```

#### Usage Case 3: Admin Access to All Aliases

**Scenario**: Admin user retrieves all aliases

**Example Request**:
```bash
# Get all aliases (requires ADMIN or SUPER_ADMIN role)
curl -X GET "{{SERVER_URL}}/api/opnsense/aliases" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "aliases": [
    {
      "id": "alias-uuid-1",
      "name": "VPN Users",
      "type": "host",
      "content": "192.168.1.100\n192.168.1.101",
      "description": "VPN user IP addresses",
      "enabled": true,
      "uuid": "alias-uuid-1"
    },
    {
      "id": "alias-uuid-2",
      "name": "Admin Network",
      "type": "network",
      "content": "192.168.1.0/24",
      "description": "Administrative network",
      "enabled": true,
      "uuid": "alias-uuid-2"
    }
  ]
}
```

**Error Response** (insufficient permissions):
```json
{
  "error": "Insufficient permissions"
}
```

**Error Response** (unauthenticated without IP parameter):
```json
{
  "error": "Unauthorized: Authentication required to access aliases"
}
```

**Response Fields**:
- **Self-service responses** (with `ipAddress` parameter):
  - `name`: Alias name (or null if not found)
  - `uuid`: OPNsense UUID (or null if not found)
- **Admin responses** (without `ipAddress` parameter):
  - `aliases`: Array of OPNsense aliases
    - `id`: Unique alias identifier
    - `name`: Alias name
    - `type`: Alias type (host, network, port, etc.)
    - `content`: Alias content (IP addresses, networks, etc.)
    - `description`: Alias description
    - `enabled`: Whether alias is enabled
    - `uuid`: OPNsense UUID

### POST /api/opnsense/aliases

**Description**: Create a new host alias in OPNsense for administrative purposes.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access**:
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Full access
- **SUPER_ADMIN**: ✅ Full access

**Request Body**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique name for the host alias |
| `content` | string | Yes | IP address (or comma/newline-separated list of IPs) |
| `description` | string | No | Optional description for the alias |

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/aliases" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "NEW_SERVER_HOST",
    "content": "192.168.1.50",
    "description": "Production database server"
  }'
```

**Success Response** `200 OK`:
```json
{
  "result": "saved",
  "uuid": "45653f16-70b0-4a44-b311-abda1da4c2b5"
}
```

**Error Responses**:
- `400 Bad Request`: Missing required fields in request body
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions (requires ADMIN role)
- `500 Internal Server Error`: OPNsense API failure or connection issues

## Host Aliases

### GET /api/opnsense/host-alias-management

**Description**: Retrieve OPNsense host aliases with support for self-service IP lookup.

**Authentication**:
- **With `ipAddress` parameter**: Optional (supports self-service for unauthenticated users)
- **Without `ipAddress` parameter**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Requirements:**
- **Unauthenticated**: ✅ Can query specific IP addresses (with restrictions)
- **USER**: ❌ Cannot access without IP parameter
- **ADMIN**: ✅ Can read all host aliases
- **SUPER_ADMIN**: ✅ Can read all host aliases

**Role Access:**
- **Unauthenticated**: ✅ Can query specific IP addresses (with restrictions) - Only allowed for own IP address
- **USER**: ❌ Cannot access without IP parameter - Requires ADMIN or SUPER_ADMIN role
- **ADMIN**: ✅ Can read all host aliases with administrative permissions
- **SUPER_ADMIN**: ✅ Can read all host aliases with full system permissions

**Query Parameters**:
- `ipAddress` (optional): Filter by specific IP address

#### Usage Case 1: Self-Service IP Lookup (Unauthenticated)

**Scenario**: Unauthenticated user queries their own IP address

**Example Request**:
```bash
# User queries their own IP (192.168.1.65) from the same IP
curl -X GET "{{SERVER_URL}}/api/opnsense/host-alias-management?ipAddress=192.168.1.65" \
  -H "Content-Type: application/json"
```

**Success Response** (when IP matches client IP and alias exists):
```json
{
  "name": "Office_Desk_Screen",
  "uuid": "45653f16-70b0-4a44-b311-abda1da4c2b5",
  "enabled": "1"
}
```

**Success Response** (when IP matches client IP but no alias found):
```json
{
  "name": null,
  "uuid": null,
  "enabled": null
}
```

**Error Response** (when querying different IP):
```json
{
  "error": "Forbidden: You can only query for your own device."
}
```

#### Usage Case 2: Admin Access to All Host Aliases

**Scenario**: Admin user retrieves all host aliases with enriched data

**Example Request**:
```bash
# Get all host aliases (requires ADMIN or SUPER_ADMIN role)
curl -X GET "{{SERVER_URL}}/api/opnsense/host-alias-management" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "displayableHostAliases": [
    {
      "id": "alias-uuid-1",
      "name": "VPN Users",
      "type": "host",
      "content": "192.168.1.100",
      "description": "VPN user device",
      "enabled": true,
      "uuid": "alias-uuid-1",
      "detectedMac": "00:11:22:33:44:55",
      "detectedVendor": "Dell Inc.",
      "detectedHostname": "user-laptop",
      "isDhcpReserved": true,
      "dhcpReservedMac": "00:11:22:33:44:55",
      "dhcpReservedVendor": "Dell Inc.",
      "dhcpMacConflict": false
    }
  ],
  "filteredCount": 1
}
```

#### Usage Case 3: Unauthorized Access (USER)

**Scenario**: USER role attempts to access all host aliases

**Error Response**:
```json
{
  "error": "Unauthorized: Listing all host aliases requires ADMIN or SUPER_ADMIN role."
}
```

#### Usage Case 4: Unauthenticated Access Without IP

**Scenario**: Unauthenticated request without IP parameter

**Error Response**:
```json
{
  "error": "Unauthorized: Listing all host aliases requires ADMIN or SUPER_ADMIN role."
}
```

**Example Response**:
```json
{
  "hostAliases": [
    {
      "id": "host-uuid-1",
      "name": "John's Laptop",
      "content": "192.168.1.100",
      "description": "John's personal laptop",
      "enabled": true,
      "uuid": "host-uuid-1",
      "detectedMac": "00:11:22:33:44:55",
      "detectedVendor": "Apple Inc."
    },
    {
      "id": "host-uuid-2",
      "name": "Admin Server",
      "content": "192.168.1.10",
      "description": "Administrative server",
      "enabled": true,
      "uuid": "host-uuid-2",
      "detectedMac": "aa:bb:cc:dd:ee:ff",
      "detectedVendor": "Dell Inc."
    }
  ]
}
```

**Response Fields**:
- `hostAliases`: Array of host aliases
  - `id`: Unique host alias identifier
  - `name`: Host alias name
  - `content`: Host IP address
  - `description`: Host description
  - `enabled`: Whether host alias is enabled
  - `uuid`: OPNsense UUID
  - `detectedMac`: Detected MAC address
  - `detectedVendor`: Detected vendor information

### POST /api/opnsense/host-alias-management

**Description**: Create a new host alias in OPNsense. This endpoint includes automatic **duplicate IP detection** to prevent creating multiple host aliases for the same device.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access**:
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Full access
- **SUPER_ADMIN**: ✅ Full access

**Request Body**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `alias.name` | string | Yes | Unique name for the host alias |
| `alias.type` | string | Yes | Must be `host` for this endpoint |
| `alias.content` | string | Yes | IP address for the host |
| `alias.description` | string | No | Optional description |
| `alias.enabled` | string | No | "1" (default) or "0" |

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/host-alias-management" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "alias": {
      "name": "KITCHEN_TV",
      "type": "host",
      "content": "192.168.1.75",
      "description": "Smart TV in kitchen"
    }
  }'
```

**Success Response** `201 Created`:
```json
{
  "message": "Host alias created and OPNsense reconfigured successfully.",
  "uuid": "new-alias-uuid-here"
}
```

**Error Responses**:
- `400 Bad Request`: Missing required fields (name, type, content)
- `409 Conflict`: A host alias already exists with the same IP address
- `500 Internal Server Error`: Failed to create alias or reconfigure OPNsense

### PUT /api/opnsense/host-alias-management

**Description**: Rename an existing host alias. This endpoint validates unmanaged group membership to ensure self-service users do not accidentally rename devices that are under strict administrative control.

**Authentication**: Required

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uuid` | string | Yes | The OPNsense UUID of the alias to update |

**Request Body**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `alias.name` | string | Yes | The new name for the host alias |

**Example Request**:
```bash
curl -X PUT "{{SERVER_URL}}/api/opnsense/host-alias-management?uuid=45653f16-70b0-4a44-b311-abda1da4c2b5" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "alias": {
      "name": "OFFICE_DESK_PRIMARY"
    }
  }'
```

**Success Response** `200 OK`:
```json
{
  "message": "Host alias 45653f16-70b0-4a44-b311-abda1da4c2b5 updated and OPNsense reconfigured successfully."
}
```

**Error Responses**:
- `403 Forbidden`: Renaming rejected because the host is a member of one or more **unmanaged groups**.
- `404 Not Found`: Host alias with provided UUID does not exist.

### DELETE /api/opnsense/host-alias-management

**Description**: Delete a host alias from OPNsense. If deletion is successful, the system automatically performs a **cascading cleanup** of all associated database permissions for that UUID.

**Authentication**: Required

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uuid` | string | Yes | The OPNsense UUID of the alias to delete |

**Example Request**:
```bash
curl -X DELETE "{{SERVER_URL}}/api/opnsense/host-alias-management?uuid=45653f16-70b0-4a44-b311-abda1da4c2b5" \
  -H "Authorization: Bearer {{API_KEY}}"
```

**Success Response** `200 OK`:
```json
{
  "success": true,
  "message": "Host alias 45653f16-70b0-4a44-b311-abda1da4c2b5 deleted and OPNsense reconfigured successfully."
}
```

**Partial Success** `207 Multi-Status`:
```json
{
  "success": true,
  "message": "Host alias deleted, but an error occurred during reconfiguration.",
  "reconfigureError": "..."
}
```

### GET /api/opnsense/host-alias-management-admin

**Description**: Retrieve host aliases for administrative use with proper naming that reflects authentication requirements.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **Unauthenticated**: ❌ Authentication required
- **USER**: ❌ Insufficient permissions
- **ADMIN**: ✅ Full access
- **SUPER_ADMIN**: ✅ Full access

#### Usage Case 1: Successful Admin Access

**Scenario**: Admin user retrieves host aliases for administrative purposes

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/opnsense/host-alias-management-admin" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
[
  {
    "id": "alias-uuid-1",
    "name": "VPN_Users",
    "type": "host",
    "content": "192.168.1.100\n192.168.1.101",
    "description": "VPN user devices",
    "enabled": true,
    "uuid": "alias-uuid-1"
  }
]
```

#### Usage Case 2: Unauthenticated Access

**Scenario**: Request without valid authentication

**Error Response**:
```json
{
  "error": "Authentication required"
}
```

#### Usage Case 3: Insufficient Permissions (USER)

**Scenario**: USER role attempts to access endpoint

**Error Response**:
```json
{
  "error": "Insufficient permissions"
}
```

**Example Response**:
```json
{
  "hostAliases": [
    {
      "id": "host-uuid-1",
      "name": "John's Laptop",
      "content": "192.168.1.100",
      "description": "John's personal laptop",
      "enabled": true,
      "uuid": "host-uuid-1"
    }
  ]
}
```

## Network Groups

### GET /api/opnsense/network-groups

**Description**: Retrieve OPNsense network groups.

**Authentication**: Required (session or API key)

**Role Requirements:**
- **Unauthenticated**: ✅ Can access minimal network groups (for self-service page)
- **USER**: ✅ Can read network groups
- **ADMIN**: ✅ Can read network groups
- **SUPER_ADMIN**: ✅ Can read network groups

**Role Access:**
- **Unauthenticated**: ✅ Can access minimal network groups (for self-service page) - Only allowed from allowed networks
- **USER**: ✅ Can access minimal network groups - Only sees groups they have permission for
- **ADMIN**: ✅ Can access full network groups - Can see all groups with full details
- **SUPER_ADMIN**: ✅ Can access full network groups + debug mode - Can see all groups with full details and raw OPNsense data

**Example Responses:**

**Self-Service Success (Unauthenticated):**
```json
{
  "networkGroups": [
    {
      "id": "group-uuid-1",
      "name": "VPN_Users",
      "description": "VPN user network group",
      "enabled": true,
      "friendlyName": "VPN Users",
      "iconIdentifier": "users"
    }
  ],
  "allEmojiValues": ["🔒", "🌐"],
  "allFlagValues": ["🇺🇸", "🇬🇧"],
  "debugRole": "unauthenticated"
}
```

**Authenticated User Success (USER):**
```json
{
  "networkGroups": [
    {
      "id": "group-uuid-1",
      "name": "VPN_Users",
      "description": "VPN user network group",
      "enabled": true,
      "friendlyName": "VPN Users",
      "iconIdentifier": "users"
    }
  ],
  "allEmojiValues": ["🔒", "🌐"],
  "allFlagValues": ["🇺🇸", "🇬🇧"],
  "debugRole": "USER"
}
```

**Admin Success (ADMIN/SUPER_ADMIN):**
```json
{
  "networkGroups": [
    {
      "id": "group-uuid-1",
      "uuid": "group-uuid-1",
      "name": "VPN_Users",
      "description": "VPN user network group",
      "enabled": true,
      "members": [
        {
          "id": "192.168.1.100",
          "ipAddress": "192.168.1.100",
          "description": ""
        }
      ],
      "itemCount": 5,
      "lastUpdated": "2024-01-15T10:30:00Z",
      "friendlyName": "VPN Users",
      "iconIdentifier": "users",
      "groupType": "SingleSelect"
    }
  ],
  "allEmojiValues": ["🔒", "🌐"],
  "allFlagValues": ["🇺🇸", "🇬🇧"],
  "debugRole": "ADMIN"
}
```

**Access Denied (USER Role):**
```json
{
  "error": "Unauthorized: Listing all network groups requires ADMIN or SUPER_ADMIN role."
}
```

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/opnsense/network-groups" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
{
  "networkGroups": [
    {
      "id": "group-uuid-1",
      "name": "VPN Users",
      "description": "VPN user network group",
      "enabled": true,
      "uuid": "group-uuid-1",
      "members": [
        {
          "id": "member-uuid-1",
          "name": "John's Laptop",
          "ipAddress": "192.168.1.100"
        }
      ]
    },
    {
      "id": "group-uuid-2",
      "name": "Admin Network",
      "description": "Administrative network group",
      "enabled": true,
      "uuid": "group-uuid-2",
      "members": [
        {
          "id": "member-uuid-2",
          "name": "Admin Server",
          "ipAddress": "192.168.1.10"
        }
      ]
    }
  ]
}
```

**Response Fields**:
- `networkGroups`: Array of network groups
  - `id`: Unique network group identifier
  - `name`: Network group name
  - `description`: Network group description
  - `enabled`: Whether network group is enabled
  - `uuid`: OPNsense UUID
  - `members`: Group members
    - `id`: Member identifier
    - `name`: Member name
    - `ipAddress`: Member IP address

## DHCP Management

### GET /api/opnsense/dhcp

**Description**: Search for DHCP reservations in OPNsense.

**Authentication**: Required (session or API key)

**Role Requirements:**
- **Unauthenticated**: ❌ Authentication required
- **USER**: ✅ Can search DHCP reservations for permitted IPs
- **ADMIN**: ✅ Can search all DHCP reservations
- **SUPER_ADMIN**: ✅ Can search all DHCP reservations

**Role Access:**
- **Unauthenticated**: ❌ Authentication required - Must provide valid session or API key
- **USER**: ✅ Can search DHCP reservations for permitted IPs - Only can search for IPs they have permission for
- **ADMIN**: ✅ Can search all DHCP reservations - Can search for any IP address
- **SUPER_ADMIN**: ✅ Can search all DHCP reservations - Can search for any IP address with full system permissions

**Example Responses:**

**User Success (Limited Access):**
```json
{
  "reservations": [
    {
      "uuid": "reservation-uuid-1",
      "ip_address": "192.168.1.100",
      "hw_address": "00:11:22:33:44:55",
      "hostname": "user-laptop",
      "description": "User's laptop reservation"
    }
  ]
}
```

**Admin Success (Full Access):**
```json
{
  "reservations": [
    {
      "uuid": "reservation-uuid-1",
      "ip_address": "192.168.1.100",
      "hw_address": "00:11:22:33:44:55",
      "hostname": "john-laptop",
      "description": "John's laptop reservation"
    },
    {
      "uuid": "reservation-uuid-2",
      "ip_address": "192.168.1.200",
      "hw_address": "aa:bb:cc:dd:ee:ff",
      "hostname": "server-01",
      "description": "Server reservation"
    }
  ]
}
```

**Access Denied (Unauthenticated):**
```json
{
  "error": "Authentication required"
}
```

**Query Parameters**:
- `action`: Must be `search_reservation`
- `ip` (optional): IP address to search for
- `mac` (optional): MAC address to search for

**Example Request**:
```bash
# Search by IP and MAC
curl -X GET "{{SERVER_URL}}/api/opnsense/dhcp?action=search_reservation&ip=192.168.1.100&mac=00:11:22:33:44:55" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"

# Search by IP only
curl -X GET "{{SERVER_URL}}/api/opnsense/dhcp?action=search_reservation&ip=192.168.1.100" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
{
  "reservations": [
    {
      "uuid": "reservation-uuid-1",
      "ip_address": "192.168.1.100",
      "hw_address": "00:11:22:33:44:55",
      "hostname": "john-laptop",
      "description": "John's laptop reservation"
    }
  ]
}
```

### POST /api/opnsense/dhcp

**Description**: Create a new DHCP reservation in OPNsense with automatic MAC randomization detection.

**Authentication**: Required (session or API key)

**Role Requirements:**
- **Unauthenticated**: ❌ Authentication required
- **USER**: ✅ Can create DHCP reservations for permitted IPs only
- **ADMIN**: ✅ Can create DHCP reservations for any IP
- **SUPER_ADMIN**: ✅ Can create DHCP reservations for any IP

**Role Access:**
- **Unauthenticated**: ❌ Authentication required - Must provide valid session or API key
- **USER**: ✅ Can create DHCP reservations for permitted IPs only - Only for their current IP or matching host aliases
- **ADMIN**: ✅ Can create DHCP reservations for any IP - Can create reservations for any IP address
- **SUPER_ADMIN**: ✅ Can create DHCP reservations for any IP - Can create reservations for any IP address with full system permissions

**Example Responses:**

**User Success (Limited Access):**
```json
{
  "success": true,
  "message": "DHCP reservation added successfully",
  "uuid": "reservation-uuid-here"
}
```

**Admin Success (Full Access):**
```json
{
  "success": true,
  "message": "DHCP reservation added successfully",
  "uuid": "reservation-uuid-here"
}
```

**Success Response (Randomized MAC Detected):**
```json
{
  "success": true,
  "message": "DHCP reservation added successfully",
  "uuid": "reservation-uuid-here",
  "macRandomizationWarning": {
    "isRandomized": true,
    "explanation": "MAC address appears to be randomized/locally administered (second character 'A' indicates locally administered bit is set). This is commonly used by iOS, Android, and other devices for privacy protection.",
    "confidence": "high",
    "warningMessage": "⚠️ Privacy MAC Detected: The MAC address 0a:11:22:33:44:55 appears to be randomized for privacy protection. \n\n🔄 This means device may change its MAC address periodically, which could cause:\n• DHCP reservation to stop working when MAC changes\n• Device to receive different IP addresses over time\n• Need to recreate DHCP reservation with new MAC address\n\n💡 Consider:\n• Disabling MAC randomization for this network on device\n• Using static IP configuration instead of DHCP reservation\n• Being prepared to update reservation if MAC changes"
  }
}
```

**Access Denied (USER Role - Wrong IP):**
```json
{
  "success": false,
  "error": "Permission denied for IP address 192.168.1.200",
  "details": {
    "code": "PERMISSION_DENIED",
    "ip": "192.168.1.200",
    "userId": "user-id-here"
  }
}
```

**Access Denied (Unauthenticated):**
```json
{
  "error": "Authentication required"
}
```

**Permission Model for USER Role:**
1. **Same IP Access**: Can create reservations for their current IP address
2. **Exact Host Alias Match**: Can create reservations for IPs matching host aliases they have permission for
3. **No Network Range Access**: Cannot create reservations for entire network ranges

**Request Methods:**

#### Method 1: Query Parameters (Recommended)
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/dhcp?action=add_reservation&ip_address=192.168.1.100&hw_address=00:11:22:33:44:55&hostname=john-laptop" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

#### Method 2: JSON Body (Legacy Support)
```bash
curl -X POST "{{SERVER_URL}}/api/opnsense/dhcp" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "add_reservation",
    "ip_address": "192.168.1.100",
    "hw_address": "00:11:22:33:44:55",
    "hostname": "john-laptop"
  }'
```

**Required Parameters:**
- `action`: Must be `add_reservation`
- `ip_address`: Target IP address for reservation
- `hw_address`: MAC address of the device
- `hostname`: Hostname for the reservation

**Success Response (Normal MAC)**:
```json
{
  "success": true,
  "message": "DHCP reservation added successfully",
  "uuid": "reservation-uuid-here"
}
```

**Success Response (Randomized MAC Detected)**:
```json
{
  "success": true,
  "message": "DHCP reservation added successfully",
  "uuid": "reservation-uuid-here",
  "macRandomizationWarning": {
    "isRandomized": true,
    "explanation": "MAC address appears to be randomized/locally administered (second character 'A' indicates locally administered bit is set). This is commonly used by iOS, Android, and other devices for privacy protection.",
    "confidence": "high",
    "warningMessage": "⚠️ Privacy MAC Detected: The MAC address 0a:11:22:33:44:55 appears to be randomized for privacy protection. \n\n🔄 This means the device may change its MAC address periodically, which could cause:\n• DHCP reservation to stop working when MAC changes\n• Device to receive different IP addresses over time\n• Need to recreate DHCP reservation with new MAC address\n\n💡 Consider:\n• Disabling MAC randomization for this network on the device\n• Using static IP configuration instead of DHCP reservation\n• Being prepared to update the reservation if the MAC changes"
  }
}
```

**Error Response (Permission Denied)**:
```json
{
  "success": false,
  "error": "Permission denied for IP address 192.168.1.100",
  "details": {
    "code": "PERMISSION_DENIED",
    "ip": "192.168.1.100",
    "userId": "user-id-here"
  }
}
```

**Error Response (Reservation Exists)**:
```json
{
  "success": false,
  "error": "DHCP reservation already exists for this IP/MAC combination"
}
```

### DELETE /api/opnsense/dhcp

**Description**: Delete an existing DHCP reservation.

**Authentication**: Required (session or API key)

**Role Requirements:**
- **Unauthenticated**: ❌ Authentication required
- **USER**: ✅ Can delete DHCP reservations for permitted IPs only
- **ADMIN**: ✅ Can delete any DHCP reservation
- **SUPER_ADMIN**: ✅ Can delete any DHCP reservation

**Role Access:**
- **Unauthenticated**: ❌ Authentication required - Must provide valid session or API key
- **USER**: ✅ Can delete DHCP reservations for permitted IPs only - Only for IPs they have permission for
- **ADMIN**: ✅ Can delete any DHCP reservation - Can delete any reservation regardless of IP
- **SUPER_ADMIN**: ✅ Can delete any DHCP reservation - Can delete any reservation with full system permissions

**Example Responses:**

**User Success (Limited Access):**
```json
{
  "success": true,
  "message": "DHCP reservation deleted successfully"
}
```

**Admin Success (Full Access):**
```json
{
  "success": true,
  "message": "DHCP reservation deleted successfully"
}
```

**Access Denied (USER Role - Wrong IP):**
```json
{
  "success": false,
  "error": "Permission denied for DHCP reservation",
  "details": {
    "code": "PERMISSION_DENIED",
    "reservationId": "reservation-uuid-here",
    "userId": "user-id-here"
  }
}
```

**Access Denied (Unauthenticated):**
```json
{
  "error": "Authentication required"
}
```

**Request Methods:**

#### Method 1: Query Parameters
```bash
curl -X DELETE "{{SERVER_URL}}/api/opnsense/dhcp?action=delete_reservation&uuid=reservation-uuid-here" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

#### Method 2: JSON Body
```bash
curl -X DELETE "{{SERVER_URL}}/api/opnsense/dhcp" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "delete_reservation",
    "uuid": "reservation-uuid-here"
  }'
```

**Success Response**:
```json
{
  "success": true,
  "message": "DHCP reservation deleted successfully"
}
```

## MAC Randomization Detection

### Overview

The DHCP reservation system automatically detects MAC address randomization (privacy MACs) used by modern devices for privacy protection. This feature helps users understand when DHCP reservations might fail due to changing MAC addresses.

### Detection Logic

MAC addresses are analyzed using the **locally administered bit** in the first byte:
- **Second character of 2, 6, A, or E**: Indicates locally administered (randomized) address
- **Other characters**: Indicates globally unique (manufacturer-assigned) address

### Examples

**Randomized MACs (will trigger warnings):**
- `02:11:22:33:44:55` - iOS/Android privacy MAC
- `06:aa:bb:cc:dd:ee` - Generic randomized MAC
- `0a:12:34:56:78:90` - Locally administered MAC
- `0e:ff:ff:ff:ff:ff` - Privacy protection MAC

**Normal MACs (will not trigger warnings):**
- `00:11:22:33:44:55` - Manufacturer assigned
- `08:00:27:12:34:56` - VirtualBox MAC
- `bc:24:11:aa:91:97` - Real device MAC

### Frontend Integration

When creating DHCP reservations through the UI:

1. **Rename Dialog Warning**: Shows prominent warning when randomized MAC detected
2. **Toast Notifications**: Enhanced success messages with MAC randomization warnings
3. **Educational Content**: Provides device-specific instructions for disabling MAC randomization

### Audit Logging

All DHCP operations include MAC randomization analysis in audit logs:
```json
{
  "action": "DHCP_RESERVATION_ADD_SUCCESS",
  "details": {
    "ip_address": "192.168.1.100",
    "hw_address": "0a:11:22:33:44:55",
    "hostname": "device-name",
    "mac_randomization_check": {
      "isRandomized": true,
      "explanation": "MAC address appears to be randomized...",
      "confidence": "high"
    }
  }
}
```

## System Information

### GET /api/opnsense/system-info

**Description**: Retrieve OPNsense system information.

**Authentication**: Required (session or API key with ADMIN or SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ✅ Can read system info
- **SUPER_ADMIN**: ✅ Can read system info

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/opnsense/system-info" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
{
  "systemInfo": {
    "version": "23.7.11",
    "hostname": "opnsense.example.com",
    "uptime": "15 days, 3 hours, 27 minutes",
    "loadAverage": [0.5, 0.3, 0.2],
    "cpuUsage": 5.2,
    "memoryUsage": 45.8,
    "diskUsage": 12.3,
    "interfaces": [
      {
        "name": "lan",
        "status": "up",
        "ipAddress": "192.168.1.1",
        "macAddress": "00:11:22:33:44:55"
      },
      {
        "name": "wan",
        "status": "up",
        "ipAddress": "203.0.113.1",
        "macAddress": "aa:bb:cc:dd:ee:ff"
      }
    ]
  }
}
```

**Response Fields**:
- `systemInfo`: System information object
  - `version`: OPNsense version
  - `hostname`: System hostname
  - `uptime`: System uptime
  - `loadAverage`: System load average
  - `cpuUsage`: CPU usage percentage
  - `memoryUsage`: Memory usage percentage
  - `diskUsage`: Disk usage percentage
  - `interfaces`: Network interfaces
    - `name`: Interface name
    - `status`: Interface status
    - `ipAddress`: Interface IP address
    - `macAddress`: Interface MAC address

## Network Groups

### GET /api/opnsense/network-groups

**Description**: Retrieve network groups (filtered aliases) based on user permissions with proper naming that reflects the actual data structure.

**Authentication**: Required (session or API key)

**Role Access:**
- **Unauthenticated**: ✅ Can access minimal network groups (for self-service page)
- **USER**: ✅ Can access minimal network groups
- **ADMIN**: ✅ Can access full network groups
- **SUPER_ADMIN**: ✅ Can access full network groups + debug mode

#### Usage Case 1: Successful Network Groups Access

**Scenario**: Authenticated user retrieves network groups

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/opnsense/network-groups" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "networkGroups": [
    {
      "id": "group-uuid-1",
      "uuid": "group-uuid-1",
      "name": "VPN_Users",
      "description": "VPN user network group",
      "enabled": true,
      "members": [
        {
          "id": "192.168.1.100",
          "ipAddress": "192.168.1.100",
          "description": ""
        }
      ],
      "itemCount": 5,
      "lastUpdated": "2024-01-15T10:30:00Z",
      "friendlyName": "VPN Users",
      "iconIdentifier": "users",
      "groupType": "SingleSelect"
    }
  ],
  "allEmojiValues": ["🔒", "🌐"],
  "allFlagValues": ["🇺🇸", "🇬🇧"],
  "debugRole": "ADMIN"
}
```

#### Usage Case 2: Debug Mode (SUPER_ADMIN only)

**Scenario**: SUPER_ADMIN requests raw OPNsense data for debugging

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/opnsense/network-groups?debug=true" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

#### Usage Case 3: Include Disabled Groups

**Scenario**: Request includes globally disabled groups

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/opnsense/network-groups?includeDisabled=true" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

#### Usage Case 4: Unauthenticated Access (Self-Service)

**Scenario**: Request without authentication (for self-service page)

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/opnsense/network-groups" \
  -H "Content-Type: application/json"
```

**Success Response** (minimal data):
```json
{
  "networkGroups": [
    {
      "id": "group-uuid-1",
      "uuid": "group-uuid-1",
      "name": "VPN_Users",
      "description": "VPN user network group",
      "enabled": true,
      "friendlyName": "VPN Users",
      "iconIdentifier": "users",
      "groupType": "SingleSelect"
    }
  ],
  "allEmojiValues": ["🔒", "🌐"],
  "allFlagValues": ["🇺🇸", "🇬🇧"],
  "debugRole": "unauthenticated"
}
```

**Example Response**:
```json
{
  "aliases": [
    {
      "id": "alias-uuid-1",
      "name": "VPN Users",
      "type": "host",
      "content": "192.168.1.100\n192.168.1.101",
      "description": "VPN user IP addresses",
      "enabled": true,
      "uuid": "alias-uuid-1"
    }
  ],
  "totalCount": 1,
  "filteredCount": 1
}
```

**Response Fields**:
- `aliases`: Array of filtered aliases
- `totalCount`: Total number of aliases
- `filteredCount`: Number of aliases after filtering

## Filtered Host Aliases

### GET /api/opnsense/filtered-host-aliases

**Description**: Retrieve filtered host aliases based on user permissions with optional IP filtering.

**Authentication**:
- **With `ipAddress` parameter**: Optional (supports self-service for unauthenticated users)
- **Without `ipAddress` parameter**: Required (session or API key)

**Role Requirements:**
- **Unauthenticated**: ✅ Can query specific IP addresses (with restrictions)
- **USER**: ✅ Can access filtered host aliases
- **ADMIN**: ✅ Can access filtered host aliases
- **SUPER_ADMIN**: ✅ Can access filtered host aliases

**Role Access:**
- **Unauthenticated**: ✅ Can query specific IP addresses (with restrictions) - Only allowed for own IP address
- **USER**: ✅ Can access filtered host aliases - Only sees aliases they have permission for
- **ADMIN**: ✅ Can access filtered host aliases - Can see all aliases with administrative permissions
- **SUPER_ADMIN**: ✅ Can access filtered host aliases - Can see all aliases with full system permissions

**Example Responses:**

**Self-Service Success (Unauthenticated):**
```json
{
  "displayableHostAliases": [
    {
      "id": "host-uuid-1",
      "name": "Office_Desk_Screen",
      "content": "192.168.1.65",
      "description": "Office desktop computer",
      "enabled": true,
      "uuid": "45653f16-70b0-4a44-b311-abda1da4c2b5"
    }
  ],
  "totalCount": 1
}
```

**Authenticated User Success:**
```json
{
  "displayableHostAliases": [
    {
      "id": "host-uuid-1",
      "name": "John's Laptop",
      "content": "192.168.1.100",
      "description": "John's personal laptop",
      "enabled": true,
      "uuid": "host-uuid-1"
    }
  ],
  "totalCount": 1
}
```

**Access Denied (Unauthenticated without IP):**
```json
{
  "error": "Unauthorized: Authentication required to access host aliases"
}
```

**Query Parameters**:
- `ipAddress` (optional): Filter by specific IP address

#### Usage Case 1: Self-Service IP Lookup (Unauthenticated)

**Scenario**: Unauthenticated user queries their own IP address

**Example Request**:
```bash
# User queries their own IP (192.168.1.65) from the same IP
curl -X GET "{{SERVER_URL}}/api/opnsense/filtered-host-aliases?ipAddress=192.168.1.65" \
  -H "Content-Type: application/json"
```

**Success Response** (when IP matches client IP):
```json
{
  "displayableHostAliases": [
    {
      "id": "host-uuid-1",
      "name": "Office_Desk_Screen",
      "content": "192.168.1.65",
      "description": "Office desktop computer",
      "enabled": true,
      "uuid": "45653f16-70b0-4a44-b311-abda1da4c2b5"
    }
  ],
  "totalCount": 1
}
```

**Error Response** (when querying different IP):
```json
{
  "error": "Forbidden: Unauthenticated users can only operate on their own IP address"
}
```

#### Usage Case 2: Authenticated User Access

**Scenario**: Authenticated user queries host aliases with optional IP filtering

**Example Request**:
```bash
# Get all filtered host aliases
curl -X GET "{{SERVER_URL}}/api/opnsense/filtered-host-aliases" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"

# Get host alias for specific IP
curl -X GET "{{SERVER_URL}}/api/opnsense/filtered-host-aliases?ipAddress=192.168.1.100" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "displayableHostAliases": [
    {
      "id": "host-uuid-1",
      "name": "John's Laptop",
      "content": "192.168.1.100",
      "description": "John's personal laptop",
      "enabled": true,
      "uuid": "host-uuid-1"
    }
  ],
  "totalCount": 1
}
```

**Response Fields**:
- `displayableHostAliases`: Array of displayable host aliases
  - `id`: Unique host alias identifier
  - `name`: Host alias name
  - `content`: Host IP address
  - `description`: Host description
  - `enabled`: Whether host alias is enabled
  - `uuid`: OPNsense UUID
- `totalCount`: Total number of host aliases

## IP Group Membership

### GET /api/opnsense/ip-group-membership

**Description**: Check IP group membership in OPNsense with self-service support.

**🔒 Security Note**: This endpoint is automatically disabled when global self-service is disabled (`removeSelfServicePage: true`). When disabled, all requests return 403 Forbidden regardless of authentication status.

**Authentication**:
- **For own IP**: Optional (supports self-service for unauthenticated users) - **Only when self-service is enabled**
- **For other IPs**: Required (session or API key)

**Role Requirements:**
- **Unauthenticated**: ✅ Can check own IP membership only (when self-service enabled)
- **USER**: ✅ Can check own IP membership (when self-service enabled)
- **ADMIN**: ✅ Can check any IP membership (when self-service enabled)
- **SUPER_ADMIN**: ✅ Can check any IP membership (when self-service enabled)

**Role Access:**
- **Unauthenticated**: ✅ Can check own IP membership only (when self-service enabled) - Only allowed for own IP address / ❌ 403 Forbidden (when self-service disabled)
- **USER**: ✅ Can check own IP membership (when self-service enabled) - Only allowed for own IP address / ❌ 403 Forbidden (when self-service disabled)
- **ADMIN**: ✅ Can check any IP membership (when self-service enabled) - Can check any IP address / ❌ 403 Forbidden (when self-service disabled)
- **SUPER_ADMIN**: ✅ Can check any IP membership (when self-service enabled) - Can check any IP address / ❌ 403 Forbidden (when self-service disabled)

**Example Responses:**

**Self-Service Success (Unauthenticated):**
```json
{
  "ip": "192.168.1.65",
  "memberships": [
    {
      "groupId": "group-uuid-1",
      "groupName": "Office_Users",
      "type": "direct",
      "source": "host_alias"
    }
  ],
  "totalGroups": 1
}
```

**Authenticated User Success:**
```json
{
  "ip": "192.168.1.100",
  "memberships": [
    {
      "groupId": "group-uuid-1",
      "groupName": "VPN Users",
      "type": "direct",
      "source": "host_alias"
    },
    {
      "groupId": "group-uuid-2",
      "groupName": "Development Team",
      "type": "indirect",
      "source": "network_group"
    }
  ],
  "totalGroups": 2
}
```

**Self-Service Disabled (Global Security Setting):**
```json
{
  "error": "Forbidden: Self-service functionality is disabled"
}
```

**Access Denied (Wrong IP):**
```json
{
  "error": "Unauthorized: Unauthenticated users can only query their own IP address"
}
```

**Query Parameters**:
- `ip`: IP address to check (required)

#### Usage Case 1: Self-Service IP Lookup (Unauthenticated)

**Scenario**: Unauthenticated user checks their own IP group membership

**Example Request**:
```bash
# User checks their own IP (192.168.1.65) from the same IP
curl -X GET "{{SERVER_URL}}/api/opnsense/ip-group-membership?ip=192.168.1.65" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "ip": "192.168.1.65",
  "memberships": [
    {
      "groupId": "group-uuid-1",
      "groupName": "Office_Users",
      "type": "direct",
      "source": "host_alias"
    }
  ],
  "totalGroups": 1
}
```

**Error Response** (when querying different IP):
```json
{
  "error": "Unauthorized: Unauthenticated users can only query their own IP address"
}
```

#### Usage Case 2: Authenticated User Access

**Scenario**: Authenticated user checks IP group membership

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/opnsense/ip-group-membership?ip=192.168.1.100" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "ip": "192.168.1.100",
  "memberships": [
    {
      "groupId": "group-uuid-1",
      "groupName": "VPN Users",
      "type": "direct",
      "source": "host_alias"
    },
    {
      "groupId": "group-uuid-2",
      "groupName": "Development Team",
      "type": "indirect",
      "source": "network_group"
    }
  ],
  "totalGroups": 2
}
```

#### Usage Case 3: Self-Service Disabled (Global Security Setting)

**Scenario**: Self-service functionality is globally disabled (`removeSelfServicePage: true`)

**Example Request** (any authentication level):
```bash
curl -X GET "{{SERVER_URL}}/api/opnsense/ip-group-membership?ip=192.168.1.65" \
  -H "Content-Type: application/json"
```

**Error Response** (403 Forbidden):
```json
{
  "error": "Forbidden: Self-service functionality is disabled"
}
```

**Security Note**: When `removeSelfServicePage` is enabled in global settings, this endpoint is completely disabled for all users regardless of authentication status. This provides an additional security layer for environments that don't require self-service IP group membership checking.

**Error Response** (missing IP parameter):
```json
{
  "error": "IP address query parameter is required"
}
```

**Response Fields**:
- `ip`: Checked IP address
- `memberships`: Array of group memberships
  - `groupId`: Group identifier
  - `groupName`: Group name
  - `type`: Membership type (direct, indirect)
  - `source`: Membership source (host_alias, network_group, etc.)
- `totalGroups`: Total number of groups

## Network Group Host Aliases

### GET /api/opnsense/network-groups/[uuid]/host-aliases

**Description**: Retrieve host aliases assigned to a specific network group with ARP status information for connectivity validation.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Requirements:**
- **Unauthenticated**: ❌ Authentication required
- **USER**: ❌ Insufficient permissions
- **ADMIN**: ✅ Can read network group host aliases
- **SUPER_ADMIN**: ✅ Can read network group host aliases

**Role Access:**
- **Unauthenticated**: ❌ Authentication required - Must provide valid session or API key
- **USER**: ❌ Insufficient permissions - Requires ADMIN or SUPER_ADMIN role
- **ADMIN**: ✅ Can read network group host aliases - Can access host aliases for any network group
- **SUPER_ADMIN**: ✅ Can read network group host aliases - Can access host aliases for any network group with full system permissions

**Example Responses:**

**Admin Success (ADMIN/SUPER_ADMIN):**
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

**Path Parameters:**
- `uuid` (required): The UUID of the network group

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/opnsense/network-groups/550e8400-e29b-41d4-a716-446655440000/host-aliases" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
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

**Response Fields:**
- `uuid`: Unique identifier for the host alias
- `name`: Name of the host alias
- `content`: IP address(es) associated with the alias
- `description`: Description of the host alias
- `enabled`: Whether the alias is enabled ("1") or disabled ("0")
- `hasArpEntry`: Boolean indicating if the IP has an active ARP entry (device is online)

**ARP Status Integration:**
The `hasArpEntry` field provides real-time connectivity information by checking the OPNsense ARP table. This enables:
- Validation warnings when disabling groups with online devices
- Connectivity impact assessment for bulk operations
- Real-time network status visibility

## Error Responses

### 400 Bad Request

**Missing Required Parameter**:
```json
{
  "error": "IP address parameter is required"
}
```

**Invalid IP Parameter**:
```json
{
  "error": "IP address query parameter is required"
}
```

### 401 Unauthorized

**Authentication Required**:
```json
{
  "error": "Unauthorized: Authentication required to access aliases"
}
```

**General Unauthorized**:
```json
{
  "error": "Unauthorized"
}
```

### 403 Forbidden

**Self-Service Globally Disabled (Unauthenticated)**:
```json
{
  "error": "Forbidden: Self-service functionality is disabled"
}
```

**Self-Service IP Restriction (Unauthenticated)**:
```json
{
  "error": "Forbidden: Unauthenticated users can only operate on their own IP address"
}
```

**Self-Service IP Restriction (Authenticated)**:
```json
{
  "error": "Unauthorized: Unauthenticated users can only query their own IP address"
}
```

**Network Access Restriction**:
```json
{
  "error": "Forbidden: IP address is not in allowed networks for self-service access"
}
```

**Insufficient Permissions**:
```json
{
  "error": "Insufficient permissions"
}
```

**Admin Privileges Required**:
```json
{
  "error": "Forbidden: Admin privileges required"
}
```

**Permission-Based Access Denied**:
```json
{
  "error": "Unauthorized: You do not have permission to access this IP address"
}
```

**No Permissions**:
```json
{
  "error": "Unauthorized: You do not have permission to access any IP addresses"
}
```

### 404 Not Found
```json
{
  "error": "Alias not found"
}
```

### 500 Internal Server Error

**General Server Error**:
```json
{
  "error": "Failed to fetch OPNsense data"
}
```

**Alias Fetch Error**:
```json
{
  "error": "Failed to fetch alias"
}
```

## Notes

### Authentication Patterns

1. **Self-Service Access**: Endpoints with `ipAddress` parameter support unauthenticated access for users querying their own IP
2. **Global Self-Service Control**: When `removeSelfServicePage` is enabled, all unauthenticated access to self-service endpoints returns 403 Forbidden
3. **IP Validation**: Client IP is automatically detected from `x-forwarded-for` or `x-real-ip` headers
4. **IPv6 Normalization**: IPv4-mapped IPv6 addresses (`::ffff:192.168.1.100`) are normalized to IPv4 format
5. **Network Restrictions**: Self-service access is limited to allowed networks configured in global settings

### Role-Based Access

1. **Unauthenticated Users**:
   - Can only query their own IP address
   - Must be within allowed networks for self-service access
   - Receive limited response data (name and uuid only)

2. **Regular Users (USER role)**:
   - Can access filtered data based on their permissions
   - Cannot access admin-only endpoints like DHCP leases or system info

3. **Admin Users (ADMIN/SUPER_ADMIN roles)**:
   - Can access all OPNsense data
   - Can query any IP address
   - Receive full response data

### Data Filtering

1. **Permission-Based**: Data is filtered based on user group permissions and allowed aliases
2. **Real-time Data**: All data is fetched in real-time from OPNsense
3. **IP-Specific Queries**: When querying specific IPs, only relevant aliases are returned
4. **Self-Service Endpoints**: Some endpoints support unauthenticated access with IP parameter for self-service operations

### Error Handling

1. **Consistent Error Format**: All errors follow the `{"error": "message"}` format
2. **Specific Error Messages**: Different error messages for different failure scenarios
3. **HTTP Status Codes**: Appropriate status codes (400, 401, 403, 404, 500) for different error types
4. **Audit Logging**: Failed access attempts are logged for security monitoring

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

**Last Updated**: 2026-03-26 | **API Version**: v1.0.0 | **Category**: API Documentation