# MAC Address Tracking Endpoints

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
curl -X GET "${SERVER_URL}/api/admin/mac-tracking" \
  -H "Authorization: Bearer ${API_KEY}"
```

This section covers all MAC Address Tracking API endpoints for automated network device discovery, monitoring, and management through ARP table scanning.

## Overview

The MAC Address Tracking system provides comprehensive network device discovery and monitoring capabilities through automated ARP table scanning. It identifies devices, tracks their active/inactive status, detects privacy MAC addresses, and integrates with DHCP reservations for complete network visibility.

## Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access any MAC tracking endpoints
- **ADMIN**: ✅ Read-only access (view lists, export data, view history)
- **SUPER_ADMIN**: ✅ Full access (all ADMIN permissions plus service control, configuration, data management)

**Role Access:**
- **USER**: ❌ Forbidden - insufficient permissions for all MAC tracking endpoints
- **ADMIN**: ✅ Can access read-only endpoints including device lists, search, history, export, and service status
- **SUPER_ADMIN**: ✅ Can access all ADMIN endpoints plus service control operations (start, stop, restart, run, cleanup)

**Feature Toggle:** All endpoints return `403 Forbidden` when MAC Address Tracking is disabled in Global Settings.

**Example Responses:**

**ADMIN/SUPER_ADMIN Success (Read Access):**
```json
{
  "success": true,
  "data": [
    {
      "id": "mac-uuid-1",
      "macAddress": "aa:bb:cc:dd:ee:ff",
      "vendor": "Apple, Inc.",
      "hostname": "iPhone-John",
      "isActive": true,
      "lastSeen": "2024-01-20T14:45:00.000Z"
    }
  ]
}
```

**USER Role Failure:**
```json
{
  "success": false,
  "message": "Unauthorized"
}
```

**SUPER_ADMIN Success (Service Control):**
```json
{
  "success": true,
  "message": "MAC tracking service started with 5 minute interval"
}
```

**ADMIN Role Failure (Service Control):**
```json
{
  "success": false,
  "message": "Unauthorized for service management"
}
```

## Core MAC Tracking Endpoints

### GET /api/admin/mac-tracking

**Description**: Retrieve paginated list of tracked MAC addresses with comprehensive device information, filtering, and search capabilities.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Read-only access
- **SUPER_ADMIN**: ✅ Read-only access

**Query Parameters:**
- `page` (number, optional): Page number for pagination (default: 1)
  - **Validation**: Must be >= 1
  - **Example**: `1`

- `limit` (number, optional): Items per page (default: 50, max: 100)
  - **Validation**: Must be between 1 and 100
  - **Example**: `25`

- `sortBy` (string, optional): Sort field - `macAddress`, `lastSeen`, `firstSeen`, `hostname` (default: `lastSeen`)
  - **Validation**: Must be one of: `macAddress`, `lastSeen`, `firstSeen`, `hostname`
  - **Example**: `lastSeen`

- `sortDirection` (string, optional): Sort direction - `asc`, `desc` (default: `desc`)
  - **Validation**: Must be `asc` or `desc`
  - **Example**: `desc`

- `search` (string, optional): Search term or special keyword filter (searches MAC address, device name, vendor, IP address, and host alias names)
  - **Validation**: String length 1-255 characters
  - **Special Keywords**: `dhcp:`, `dhcp-conflict:`, `privacy:`, `active:`, `inactive:`, `opnsense:`, `<interface>:`
  - **Example**: `privacy:` or `iPhone`

- `activeOnly` (boolean, optional): Filter to show only active devices (default: false)
  - **Validation**: Must be true or false
  - **Example**: `true`

- `inactiveOnly` (boolean, optional): Filter to show only inactive devices (default: false)
  - **Validation**: Must be true or false
  - **Example**: `true`

- `excludedOnly` (boolean, optional): Filter to show only excluded MACs (default: false)
  - **Validation**: Must be true or false
  - **Example**: `true`

- `notExcludedOnly` (boolean, optional): Filter to show only non-excluded MACs (default: false)
  - **Validation**: Must be true or false
  - **Example**: `true`

- `searchHistory` (boolean, optional): Search across historical IP addresses, hostnames, and host aliases (default: false)
  - **Validation**: Must be true or false
  - **Example**: `true`

- `vrrpOnly` (boolean, optional): Filter to show only VRRP virtual router MACs (default: false)
  - **Validation**: Must be true or false
  - **Example**: `true`

- `hsrpOnly` (boolean, optional): Filter to show only HSRP virtual router MACs (default: false)
  - **Validation**: Must be true or false
  - **Example**: `true`

**Special Search Keywords:**
- `dhcp:` - Show only devices with DHCP reservations
- `dhcp-conflict:` - Show only devices with DHCP conflicts
- `privacy:` - Show only devices with privacy MAC addresses
- `active:` - Show only currently active devices
- `inactive:` - Show only currently inactive devices
- `opnsense:` - Show only OPNsense interface devices
- `<interface>:` - Filter by network interface (e.g., `em0:`, `lan:`)

#### Usage Case 1: Get All MAC Addresses (Paginated)

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking?page=1&limit=25&sortBy=lastSeen&sortDirection=desc" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "macAddresses": [
      {
        "id": "mac-uuid-1",
        "macAddress": "aa:bb:cc:dd:ee:ff",
        "vendor": "Apple, Inc.",
        "deviceName": "iPhone-John",
        "isActive": true,
        "isPrivacyMac": false,
        "isOpnsenseMac": false,
        "isVrrpMac": false,
        "isHsrpMac": false,
        "hasMultipleIps": false,
        "firstSeen": "2024-01-15T10:30:00.000Z",
        "lastSeen": "2024-01-20T14:45:00.000Z",
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-20T14:45:00.000Z",
        "currentIp": "192.168.1.100",
        "currentInterface": "em0",
        "isDhcpReserved": false,
        "hasDhcpConflict": false,
        "hostAlias": "device.local",
        "historyCount": 15,
        "currentIpsCount": 2,
        "currentIps": [
          {
            "ipAddress": "192.168.1.100",
            "networkInterface": "em0",
            "hostAlias": "device.local",
            "isDhcpReserved": true,
            "hasDhcpConflict": false,
            "isActive": true
          },
          {
            "ipAddress": "192.168.1.101",
            "networkInterface": "em1",
            "hostAlias": null,
            "isDhcpReserved": false,
            "hasDhcpConflict": false,
            "isActive": true
          }
        ],
        "exclusion": null
      }
    ],
    "totalCount": 150,
    "currentPage": 1,
    "totalPages": 6
  }
}
```

**Response Fields:**
- `macAddresses` (array): Array of MAC address objects
- `totalCount` (number): Total number of matching MAC addresses
- `currentPage` (number): Current page number
- `totalPages` (number): Total number of pages

**MAC Address Object Fields:**
- `id` (string): Unique identifier for the MAC address
- `macAddress` (string): MAC address in format `aa:bb:cc:dd:ee:ff`
- `deviceName` (string): Device name/hostname
- `vendor` (string): Vendor name from MAC address lookup
- `isActive` (boolean): Whether device is currently active
- `isPrivacyMac` (boolean): Whether this is a privacy/randomized MAC address
- `isOpnsenseMac` (boolean): Whether this is an OPNsense interface MAC
- `isVrrpMac` (boolean): Whether this is a VRRP virtual router MAC
- `isHsrpMac` (boolean): Whether this is an HSRP virtual router MAC
- `hasMultipleIps` (boolean): Whether the MAC has multiple simultaneously active IP addresses
- `firstSeen` (string): ISO timestamp of first detection
- `lastSeen` (string): ISO timestamp of last detection
- `currentIp` (string): Current IP address (most recent)
- `currentInterface` (string): Current network interface
- `isDhcpReserved` (boolean): Whether current IP has DHCP reservation
- `hasDhcpConflict` (boolean): Whether current IP has DHCP conflict
- `hostAlias` (string|null): Host alias name if configured
- `historyCount` (number): **Number of IP configuration changes** (consolidated ranges, not total scans)
  - Consecutive scans with the same IP configuration are grouped into a single range
  - Only counts when the IP address(es) actually change
  - Example: If a MAC has IP 192.168.1.100 for 50 consecutive scans, this counts as 1
- `rawHistoryCount` (number): Total number of scan events (for reference/debugging)
- `currentIpsCount` (number): Number of currently active IP associations
- `currentIps` (array): Array of all current active IP associations with details
- `exclusion` (object|null): MAC exclusion configuration if enabled

#### Usage Case 2: Search with Special Keywords

**Example Request** (Show only privacy MAC addresses):
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking?search=privacy:" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Request** (Show only devices with DHCP reservations):
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking?search=dhcp:" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Request** (Filter by interface):
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking?search=em0:" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

### GET /api/admin/mac-tracking/search

**Description**: Advanced search endpoint with enhanced filtering capabilities for MAC addresses.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Read-only access
- **SUPER_ADMIN**: ✅ Read-only access

**Query Parameters:**
- `q` (string, optional): General search query (searches across MAC address, device name, vendor, IP address, and host alias names)
- `mac` (string, optional): Search by MAC address
- `ip` (string, optional): Search by IP address
- `hostname` (string, optional): Search by device hostname
- `vendor` (string, optional): Search by vendor
- `hostAlias` (string, optional): Search by host alias name
- `limit` (number, optional): Maximum results (default: 50, max: 100)
- `includeInactive` (boolean, optional): Include offline devices (default: true)

**Example Request** (General search):
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/search?q=apple&limit=10" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Request** (Search by host alias):
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/search?hostAlias=cristina_ipad&limit=10" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Request** (Search by MAC address):
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/search?mac=f4:02:28&limit=10" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "macAddresses": [
      {
        "id": "mac-uuid-1",
        "macAddress": "aa:bb:cc:dd:ee:ff",
        "vendor": "Apple, Inc.",
        "deviceName": "iPhone-John",
        "isActive": true,
        "currentIp": "192.168.1.100",
        "currentInterface": "em0",
        "hostAlias": "device.local",
        "lastSeen": "2024-01-20T14:45:00.000Z"
      }
    ],
    "totalCount": 1
  }
}
```

### GET /api/admin/mac-tracking/[macAddress]/history

**Description**: Retrieve complete history of IP associations for a specific MAC address with automatic consolidation of consecutive scans.

**History Consolidation**: The API automatically consolidates consecutive scans with the same IP configuration into ranges:
- Consecutive scans with identical IP address(es) are merged into a single entry
- Each consolidated entry shows `firstSeen` (earliest scan) and `lastSeen` (most recent scan) for the range
- Only creates new entries when the IP configuration actually changes
- Example: If a MAC has IP 192.168.1.100 for 50 consecutive scans, this appears as 1 entry with a date range

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Read-only access
- **SUPER_ADMIN**: ✅ Read-only access

**Path Parameters:**
- `macAddress` (string, required): MAC address (URL encoded, e.g., `aa%3Abb%3Acc%3Add%3Aee%3Aff`)

**Query Parameters:**
- `pageSize` (number, optional): Items per page for pagination (default: 25, max: 500)
  - **Validation**: Must be between 1 and 500
  - **Example**: `25`
  - **Note**: Pagination is applied AFTER consolidation
- `page` (number, optional): Page number for pagination (default: 1)
  - **Validation**: Must be >= 1
  - **Example**: `1`
- `includeIpHistory` (boolean, optional): Include full IP association history instead of deduplicated entries (default: false)
  - **Validation**: Must be true or false
  - **Example**: `true` (returns MacIpAssociation records) or `false` (returns MacIpHistoryEntry records)
  - **Note**: Both options are consolidated before being returned
- `days` (number, optional): Limit to last N days (default: all history)
  - **Validation**: Must be >= 1
  - **Example**: `30`

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/aa%3Abb%3Acc%3Add%3Aee%3Aff/history?page=1&pageSize=25&days=30" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Request** (with full IP history):
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/aa%3Abb%3Acc%3Add%3Aee%3Aff/history?includeIpHistory=true&pageSize=50&days=30" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "macAddress": {
      "id": "mac-uuid-1",
      "macAddress": "aa:bb:cc:dd:ee:ff",
      "vendor": "Apple, Inc.",
      "deviceName": "iPhone-John",
      "isPrivacyMac": false,
      "isOpnsenseMac": false,
      "firstSeen": "2024-01-15T10:30:00.000Z",
      "lastSeen": "2024-01-20T14:45:00.000Z",
      "isActive": true,
      "exclusion": null
    },
    "history": [
      {
        "id": "history-uuid-1",
        "macAddressId": "mac-uuid-1",
        "ipAddress": "192.168.1.100",
        "networkInterface": "em0",
        "firstSeen": "2024-01-15T10:30:00.000Z",
        "lastSeen": "2024-01-20T14:45:00.000Z",
        "detectionCount": 15,
        "isOpnsenseMac": false,
        "hostname": "iPhone-John",
        "hostAlias": "device.local"
      },
      {
        "id": "history-uuid-2",
        "macAddressId": "mac-uuid-1",
        "ipAddress": "192.168.1.101",
        "networkInterface": "em0",
        "firstSeen": "2024-01-10T08:15:00.000Z",
        "lastSeen": "2024-01-14T16:20:00.000Z",
        "detectionCount": 8,
        "isOpnsenseMac": false,
        "hostAlias": null
      }
    ],
    "currentIps": [
      {
        "ipAddress": "192.168.1.100",
        "networkInterface": "em0",
        "hostAlias": "device.local",
        "isDhcpReserved": true,
        "hasDhcpConflict": false,
        "isActive": true
      }
    ],
    "exclusion": null,
    "isExcludedAndEnabled": false,
    "pagination": {
      "currentPage": 1,
      "pageSize": 25,
      "totalCount": 2,
      "totalPages": 1
    }
  }
}
```

**Response Fields:**
- `history` (array): **Consolidated** IP association history entries
  - Each entry represents a range of consecutive scans with the same IP configuration
  - `firstSeen`: Timestamp of the earliest scan in this range
  - `lastSeen`: Timestamp of the most recent scan in this range
  - `detectionCount`: Number of times this IP was detected (for reference)
  - `hostname` (string|null): Hostname associated with this IP during the period
  - `hostAlias` (string|null): Host alias associated with this IP during the period
  - `ipAddresses` (array): List of all IP addresses active during this period (for Multi-IP MACs)
- `pagination.totalCount`: Number of **consolidated ranges**, not total scans
  - This matches the `historyCount` shown in the MAC tracking table
  - Represents the number of IP configuration changes

### GET /api/admin/mac-tracking/export

**Description**: Export MAC tracking data in various formats for analysis and reporting.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Export access
- **SUPER_ADMIN**: ✅ Export access

**Query Parameters:**
- `format` (string, optional): Export format - `json`, `csv` (default: `csv`)
- `search` (string, optional): Search term to filter devices
- `activeOnly` (boolean, optional): Export only active devices (default: false)
- `dhcpOnly` (boolean, optional): Export only devices with DHCP reservations (default: false)
- `dhcpConflictOnly` (boolean, optional): Export only devices with DHCP conflicts (default: false)
- `privacyOnly` (boolean, optional): Export only privacy MAC addresses (default: false)
- `inactiveOnly` (boolean, optional): Export only inactive devices (default: false)
- `interface` (string, optional): Filter by network interface (default: all)

**Example Request** (JSON export):
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/export?format=json&activeOnly=true" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Request** (CSV export - default):
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/export?activeOnly=true" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Accept: text/csv"
```

**Success Response** (JSON format - raw array with full MAC object):
```json
[
  {
    "id": "mac-uuid-1",
    "macAddress": "aa:bb:cc:dd:ee:ff",
    "deviceName": "iPhone-John",
    "vendor": "Apple, Inc.",
    "isActive": true,
    "isPrivacyMac": false,
    "isOpnsenseMac": false,
    "isVrrpMac": false,
    "isHsrpMac": false,
    "firstSeen": "2024-01-15T10:30:00.000Z",
    "lastSeen": "2024-01-20T14:45:00.000Z",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-20T14:45:00.000Z",
    "currentIp": "192.168.1.100",
    "currentInterface": "em0",
    "isDhcpReserved": true,
    "hasDhcpConflict": false,
    "hostAlias": "device.local",
    "historyCount": 15,
    "currentIpsCount": 2,
    "currentIps": [
      {
        "ipAddress": "192.168.1.100",
        "networkInterface": "em0",
        "hostAlias": "device.local",
        "isDhcpReserved": true,
        "hasDhcpConflict": false,
        "isActive": true
      }
    ],
    "exclusion": null
  }
]
```

**Success Response** (CSV format - comprehensive fields):
```csv
MAC Address,Device Name,Vendor,Status,Privacy MAC,OPNsense MAC,VRRP MAC,HSRP MAC,Current IP,Interface,Host Alias,DHCP Reserved,DHCP Conflict,First Seen,Last Seen,History Count,Current IPs Count,Excluded
aa:bb:cc:dd:ee:ff,iPhone-John,Apple Inc.,Online,No,No,No,No,192.168.1.100,em0,device.local,Yes,No,2024-01-15T10:30:00.000Z,2024-01-20T14:45:00.000Z,15,2,No
```

## Client-Side Features

### Activity Graph
The MAC Activity Graph is a client-side visualization that displays the activity timeline of a MAC address. It uses the data returned by the `GET /api/admin/mac-tracking/[macAddress]/history` endpoint to render a graph of active and inactive periods.

- **Data Source**: `history` array from the history endpoint.
- **Visualization**: Displays active periods (green) and inactive periods (gaps).
- **Interactivity**: Allows zooming and filtering by time range (e.g., 24h, 7d, 30d).

### Enhanced Exclusion Management
The system implements optimized exclusion management to improve performance and data integrity.

- **Cache Invalidation**: When a MAC exclusion is toggled, the system immediately invalidates the exclusion cache. This ensures that subsequent ARP scans respect the new exclusion status without delay.
- **Activation Period Optimization**: For fully excluded MACs, the system skips creating or updating `MacIpActivationPeriod` records, reducing database write load and preventing history pollution.

## Service Management Endpoints

### GET /api/admin/mac-tracking/service

**Description**: Get MAC tracking service status, configuration, and statistics.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Read-only service status
- **SUPER_ADMIN**: ✅ Full service status and statistics

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/service" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "isRunning": true,
    "intervalMinutes": 5,
    "lastScanTime": "2024-01-20T14:45:00.000Z",
    "nextScanTime": "2024-01-20T14:50:00.000Z",
    "settings": {
      "enabled": true,
      "interval": 5,
      "inactiveTimeout": 1440
    },
    "stats": {
      "totalMacs": 150,
      "activeMacs": 75,
      "privacyMacs": 12,
      "privacyMacPercentage": 8,
      "dhcpReservedMacs": 45,
      "dhcpConflictMacs": 2
    }
  }
}
```

### POST /api/admin/mac-tracking/service

**Description**: Control MAC tracking service operations (start, stop, restart, run manual scan, cleanup).

**Authentication**: Required (session or API key with SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ❌ Forbidden (read-only access)
- **SUPER_ADMIN**: ✅ Full service control

**Request Body:**
```json
{
  "action": "start|stop|restart|run|cleanup",
  "intervalMinutes": 5,
  "retentionDays": 90
}
```

**Body Parameters:**
- `action` (string, required): Service action to perform
  - `start`: Start the service with specified or default interval
  - `stop`: Stop the service
  - `restart`: Stop and restart the service with current settings
  - `run`: Execute a manual ARP scan immediately
  - `cleanup`: Clean up old MAC association data
- `intervalMinutes` (number, optional): Scan interval in minutes (1-60, default: from global settings)
- `retentionDays` (number, optional): Data retention period for cleanup (default: 90)

#### Usage Case 1: Start Service

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/admin/mac-tracking/service" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start",
    "intervalMinutes": 5
  }'
```

**Success Response**:
```json
{
  "success": true,
  "message": "MAC tracking service started with 5 minute interval"
}
```

#### Usage Case 2: Stop Service

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/admin/mac-tracking/service" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "stop"
  }'
```

**Success Response**:
```json
{
  "success": true,
  "message": "MAC tracking service stopped"
}
```

#### Usage Case 3: Manual Scan

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/admin/mac-tracking/service" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "run"
  }'
```

**Success Response**:
```json
{
  "success": true,
  "message": "Manual ARP scan completed",
  "data": {
    "scannedDevices": 45,
    "newDevices": 3,
    "updatedDevices": 12,
    "scanDuration": "2.5s"
  }
}
```

#### Usage Case 4: Data Cleanup

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/admin/mac-tracking/service" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "cleanup",
    "retentionDays": 30
  }'
```

**Success Response**:
```json
{
  "success": true,
  "message": "Cleaned up 150 old MAC associations",
  "data": {
    "cleanedCount": 150
  }
}
```

### POST /api/admin/mac-tracking/reset

**Description**: Clear the entire MAC address database, removing all MAC addresses, IP associations, and exclusions. This operation permanently deletes all tracking data and cannot be undone.

**Authentication**: Required (session or API key with SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ❌ Forbidden (insufficient permissions)
- **SUPER_ADMIN**: ✅ Full access to reset database

**Request Body:**
```json
{}
```

**Example Request - Session Authentication**:
```bash
curl -X POST "{{SERVER_URL}}/api/admin/mac-tracking/reset" \
  -H "Cookie: next-auth.session-token={{SESSION_TOKEN}}" \
  -H "Content-Type: application/json"
```

**Example Request - API Key Authentication (Bearer Token)**:
```bash
curl -X POST "{{SERVER_URL}}/api/admin/mac-tracking/reset" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Request - API Key Authentication (X-API-Key Header)**:
```bash
curl -X POST "{{SERVER_URL}}/api/admin/mac-tracking/reset" \
  -H "X-API-Key: {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "message": "Successfully cleared MAC address database. Deleted 150 MAC addresses, 450 IP associations, and 25 exclusions.",
  "data": {
    "deletedMacs": 150,
    "deletedAssociations": 450,
    "deletedExclusions": 25,
    "totalDeleted": 625
  }
}
```

**Error Response - Unauthorized (401)**:
```json
{
  "success": false,
  "message": "Unauthorized"
}
```

**Error Response - Feature Disabled (403)**:
```json
{
  "success": false,
  "message": "MAC Address Tracking feature is disabled"
}
```

**Error Response - Server Error (500)**:
```json
{
  "success": false,
  "message": "Failed to reset MAC address database"
}
```

**Important Notes:**
- ⚠️ **DESTRUCTIVE OPERATION**: This endpoint permanently deletes all MAC tracking data
- 🔐 **SUPER_ADMIN ONLY**: Only users with SUPER_ADMIN role can execute this operation
- 📋 **Feature Requirement**: MAC Address Tracking must be enabled in Global Settings
- 🔄 **No Rollback**: Deleted data cannot be recovered; consider exporting data before reset
- 📊 **Audit Logging**: The operation is logged in the audit trail with user information
- 🗑️ **Cascading Deletes**: Automatically handles foreign key constraints by deleting in correct order:
  1. MAC exclusions (first, due to foreign key references)
  2. IP associations
  3. MAC addresses

**Use Cases:**
- Starting fresh with a clean database
- Removing all historical tracking data for privacy/compliance
- Resetting the system after major network changes
- Clearing test/development data

## Privacy MAC Detection

The MAC tracking system automatically detects privacy MAC addresses (randomized MAC addresses) used by modern devices for enhanced privacy. This detection is based on the locally administered bit (bit 1 of the first octet) and other privacy MAC patterns.

**Privacy MAC Indicators:**
- **Locally Administered Bit**: MAC addresses with bit 1 set in the first octet
- **Randomization Patterns**: Common patterns used by iOS, Android, and Windows devices
- **Vendor Analysis**: Cross-reference with known privacy MAC vendor prefixes

**Privacy MAC Examples:**
- `02:xx:xx:xx:xx:xx` - Locally administered (bit 1 set)
- `06:xx:xx:xx:xx:xx` - Common iOS privacy MAC pattern
- `12:xx:xx:xx:xx:xx` - Common Android privacy MAC pattern

## DHCP Integration

The MAC tracking system integrates with OPNsense Kea DHCP to provide comprehensive device information:

**DHCP Features:**
- **Reservation Detection**: Automatically checks if MAC/IP combinations have DHCP reservations
- **Conflict Detection**: Identifies potential IP/MAC conflicts
- **Status Tracking**: Tracks DHCP reservation status changes over time
- **Integration Logging**: Logs all DHCP API interactions for troubleshooting

**DHCP API Integration:**
- Uses OPNsense Kea DHCP API (`/api/kea/dhcpv4/search_reservation`)
- Performs real-time reservation lookups during ARP scans
- Caches reservation status to improve performance
- Handles API errors gracefully with fallback behavior

## Error Responses

### 403 Feature Disabled
```json
{
  "success": false,
  "message": "MAC Address Tracking feature is disabled"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Unauthorized for MAC tracking access"
}
```

### 403 Insufficient Permissions (Service Control)
```json
{
  "success": false,
  "message": "Unauthorized for service management"
}
```

### 400 Invalid Action
```json
{
  "success": false,
  "message": "Invalid action. Supported actions: start, stop, restart, run, cleanup"
}
```

### 404 MAC Address Not Found
```json
{
  "success": false,
  "message": "MAC address not found"
}
```

### 500 Service Error
```json
{
  "success": false,
  "message": "Failed to control service",
  "error": "Detailed error message"
}
```

## Configuration

MAC Address Tracking is configured through Global Settings:

**Global Settings Fields:**
- `enableMacTracking` (boolean): Enable/disable the entire feature
- `macTrackingInterval` (number): Scan interval in minutes (1-60)
- `macInactiveTimeout` (number): Minutes before marking device as inactive (default: 1440 = 24 hours)
- `macDataRetentionDays` (number): Data retention period for MAC history cleanup (default: 90 days)
- `enableMacExclusions` (boolean): Enable MAC exclusion functionality (default: true)
- `macExclusionRetentionDays` (number): Retention period for excluded MAC IP history (1-365 days, default: 365)

**Feature Toggle Behavior:**
- When disabled, all MAC tracking endpoints return `403 Forbidden`
- Service automatically stops when feature is disabled
- Service automatically starts when feature is enabled
- Navigation menu items are hidden when feature is disabled

## MAC Address History System

### Dual Table Architecture

The MAC tracking system uses a sophisticated dual-table approach for history management:

**MacIpHistoryEntry Table** (Deduplicated History):
- Stores one record per unique MAC-IP combination
- Uses upsert logic to prevent duplicates
- Tracks `detectionCount` (how many times IP was seen)
- Updates `firstSeen` and `lastSeen` timestamps
- Default response format for history queries

**MacIpAssociation Table** (Full Event History):
- Stores individual association events over time
- Multiple records per MAC-IP combination allowed
- Tracks when devices move between IPs/interfaces
- Used when `includeIpHistory=true` parameter is specified
- Preserves complete historical timeline

### History Query Behavior

**Default Query** (`includeIpHistory=false` or not specified):
- Returns `MacIpHistoryEntry` records (deduplicated by IP)
- Shows unique IP addresses associated with each MAC
- Includes `detectionCount` for frequency analysis
- More efficient for overview analysis

**Full History Query** (`includeIpHistory=true`):
- Returns `MacIpAssociation` records (complete event timeline)
- Shows all IP changes over time
- Includes interface changes and DHCP status
- Better for detailed forensic analysis

### Exclusion Impact on History

**PARTIAL Exclusion Mode:**
- Current IP associations preserved and tracked
- Historical `MacIpHistoryEntry` records deleted
- No new history entries created
- Focus on real-time tracking only

**FULL Exclusion Mode:**
- All IP associations deleted
- All historical records deleted
- No tracking of any kind
- Complete exclusion from system

### Automatic Cleanup System

**Daily Cleanup Schedule:**
- Runs automatically every day at 2:00 AM
- Configurable via `macDataRetentionDays` setting
- Removes inactive records older than retention period
- Preserves active associations regardless of age

**Cleanup Methods:**
- `cleanupOldData()`: General cleanup by retention period
- `cleanupMacHistory()`: Complete history removal for specific MAC
- `cleanupMacHistoryOnly()`: History-only cleanup (preserves current IPs)

**Retention Logic:**
```sql
-- Only inactive records older than retention period are deleted
WHERE lastSeen < cutoff_date AND isActive = false
```

## Performance Considerations

**Database Optimization:**
- Indexed MAC addresses and IP addresses for fast lookups
- Efficient pagination with cursor-based navigation
- Optimized queries for large datasets (tested with 10,000+ devices)

**Scanning Performance:**
- Configurable scan intervals to balance accuracy vs. performance
- Transaction timeouts handled gracefully during large scans
- Background processing to avoid blocking web interface

**Memory Management:**
- Efficient MAC vendor database loading (37,000+ entries)
- Garbage collection optimized for long-running service
- Connection pooling for database operations

## Security Considerations

**Access Control:**
- Role-based permissions strictly enforced
- Feature can be completely disabled for security
- All operations logged in audit system

**Privacy Protection:**
- Privacy MAC addresses clearly identified
- No personal data collection beyond network identifiers
- Configurable data retention policies

**Network Security:**
- Read-only ARP table access
- No modification of network configuration
- Secure API integration with OPNsense


## Multiple IPs Support (Partial Exclusion)

### Overview

The MAC tracking system now supports multiple active IP associations for devices in **Partial Exclusion** mode. This enables tracking of:
- **Device Roaming**: Devices moving between networks
- **MAC Spoofing Detection**: Multiple IPs from same MAC address
- **Firewall Interfaces**: OPNsense MACs with multiple subinterfaces

### Response Fields for Multiple IPs

**New Fields in MAC Address Response:**

- `currentIpsCount` (number): Count of active IP associations
- `currentIps` (array): All current active IPs with details:
  - `ipAddress` (string): The IP address
  - `networkInterface` (string): Network interface name
  - `hostAlias` (string|null): Host alias if configured
  - `isDhcpReserved` (boolean): Whether IP has DHCP reservation
  - `hasDhcpConflict` (boolean): Whether IP has DHCP conflict

### Example: MAC with Multiple IPs

```json
{
  "macAddress": "aa:bb:cc:dd:ee:ff",
  "currentIpsCount": 2,
  "currentIps": [
    {
      "ipAddress": "192.168.3.100",
      "networkInterface": "em0",
      "hostAlias": "device.local",
      "isDhcpReserved": true,
      "hasDhcpConflict": false
    },
    {
      "ipAddress": "192.168.3.101",
      "networkInterface": "em1",
      "hostAlias": null,
      "isDhcpReserved": false,
      "hasDhcpConflict": false
    }
  ],
  "exclusion": {
    "enabled": true,
    "exclusionMode": "PARTIAL",
    "reason": "Device roaming detected"
  }
}
```

### Behavior by Exclusion Mode

| Mode | Multiple IPs | History | Use Case |
|------|--------------|---------|----------|
| **FULL** | Not tracked | Deleted | Complete exclusion |
| **PARTIAL** | Supported | Deleted | Track roaming devices |
| **None** | Single IP | Tracked | Normal tracking |

---

## Analytics

### GET /api/admin/mac-tracking/analytics

**Description**: Retrieve aggregated analytics for MAC Address Tracking, including new exclusion metrics.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Read-only access to analytics data
- **SUPER_ADMIN**: ✅ Read-only access to analytics data

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/analytics" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "totalMacs": 245,
    "activeMacs": 112,
    "inactiveMacs": 133,
    "privacyMacs": 17,
    "dhcpReservedMacs": 58,
    "dhcpConflictMacs": 2,
    "newMacsToday": 3,
    "newMacsThisWeek": 12,
    "newMacsThisMonth": 27,
    "fullyExcludedMacs": 9,
    "partiallyExcludedMacs": 14,
    "privacyMacPercentage": 6.94,
    "dhcpCoveragePercentage": 23.67,
    "topInterfaces": [
      { "interface": "lan", "count": 180, "percentage": 73.47 }
    ],
    "topVendors": [
      { "vendor": "Apple", "count": 74, "percentage": 30.20 }
    ],
    "activityTrend": [
      { "date": "2025-10-29", "active": 105, "total": 240 }
    ]
  }
}
```

**Notes:**
- `fullyExcludedMacs` counts MACs where exclusion.enabled = true and exclusion.exclusionMode = "FULL" (tracking disabled)
- `partiallyExcludedMacs` counts MACs where exclusion.enabled = true and exclusion.exclusionMode = "PARTIAL" (current IPs only; history disabled)
- These counts update immediately after exclusion changes; the admin UI listens for exclusion update events and refreshes analytics in real time


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

**Last Updated**: 2025-11-18 | **API Version**: v1.0.0 | **Category**: API Documentation
