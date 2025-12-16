# Admin Endpoints

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
curl -X GET "${SERVER_URL}/api/admin/users" \
  -H "Authorization: Bearer ${API_KEY}"
```

This section covers all administrative API endpoints for managing users, groups, system settings, and monitoring. These endpoints require administrative privileges.

## Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access any admin endpoints (returns "Unauthorized")
- **ADMIN**: ✅ Can access most admin endpoints
- **SUPER_ADMIN**: ✅ Can access all admin endpoints

**Role Access:**
- **USER**: ❌ Forbidden - insufficient permissions for all admin endpoints
- **ADMIN**: ✅ Can access user management, group management, audit logs, and most system administration endpoints
- **SUPER_ADMIN**: ✅ Can access all admin endpoints including system summary, database information, and audit log management

**Example Responses:**

**USER Role Failure:**
```json
{
  "message": "Unauthorized"
}
```

**ADMIN/SUPER_ADMIN Success:**
```json
[
  {
    "id": "cmbg9caof0000ll21mornxxkk",
    "name": "Admin User",
    "username": "admin",
    "email": "admin@example.com",
    "role": "SUPER_ADMIN",
    "emailVerified": "2025-06-03T08:29:24.878Z",
    "createdAt": "2025-06-03T08:29:24.879Z",
    "lastActive": "2025-07-02T09:50:55.299Z",
    "is2FAEnabled": false,
    "accounts": [],
    "groups": [
      {
        "id": "cmbjjavr4001qpe017z6d4bkh",
        "name": "Test 2",
        "description": ""
      }
    ]
  }
]
```

## User Management

### GET /api/admin/users

**Description**: Retrieve all users in the system with their details, groups, and authentication information.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ✅ Full access
- **SUPER_ADMIN**: ✅ Full access

#### Usage Case 1: Successful User Retrieval (ADMIN/SUPER_ADMIN)

**Scenario**: Admin user retrieves all system users

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/users" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
[
  {
    "id": "user-uuid-1",
    "name": "Admin User",
    "username": "admin",
    "email": "admin@example.com",
    "role": "SUPER_ADMIN",
    "emailVerified": "2024-01-01T12:00:00Z",
    "createdAt": "2024-01-01T12:00:00Z",
    "lastActive": "2024-01-01T13:00:00Z",
    "is2FAEnabled": false,
    "accounts": [],
    "groups": [
      {
        "id": "group-uuid-1",
        "name": "Admin Group",
        "description": "Administrative users"
      }
    ],
    "authMethod": "Local",
    "directGroups": [
      {
        "id": "group-uuid-1",
        "name": "Admin Group",
        "description": "Administrative users"
      }
    ],
    "mappedGroups": [],
    "externalGroups": []
  },
  {
    "id": "user-uuid-2",
    "name": "Regular User",
    "username": "user",
    "email": "user@example.com",
    "role": "USER",
    "emailVerified": "2024-01-01T12:00:00Z",
    "createdAt": "2024-01-01T12:00:00Z",
    "lastActive": "2024-01-01T13:00:00Z",
    "is2FAEnabled": true,
    "accounts": [],
    "groups": [
      {
        "id": "group-uuid-2",
        "name": "User Group",
        "description": "Regular users"
      }
    ],
    "authMethod": "Local",
    "directGroups": [
      {
        "id": "group-uuid-2",
        "name": "User Group",
        "description": "Regular users"
      }
    ],
    "mappedGroups": [],
    "externalGroups": []
  }
]
```

#### Usage Case 2: Unauthorized Access (USER)

**Scenario**: USER role attempts to access admin users endpoint

**Error Response**:
```json
{
  "message": "Unauthorized"
}
```

#### Usage Case 3: Unauthenticated Access

**Scenario**: Request without valid authentication

**Error Response**:
```json
{
  "message": "Unauthorized"
}
```

#### Usage Case 4: Server Error

**Scenario**: Database error during user retrieval

**Error Response**:
```json
{
  "message": "Internal server error"
}
```

**Response Fields**:
- `id`: Unique user identifier
- `name`: User's display name
- `username`: Username for login
- `email`: User's email address
- `role`: User role (`USER`, `ADMIN`, `SUPER_ADMIN`)
- `emailVerified`: Email verification timestamp
- `createdAt`: Account creation timestamp
- `lastActive`: Last activity timestamp
- `is2FAEnabled`: Whether 2FA is enabled
- `accounts`: External authentication accounts
- `groups`: User's group memberships
- `authMethod`: Authentication method used
- `directGroups`: Direct group memberships
- `mappedGroups`: Mapped group memberships
- `externalGroups`: External group memberships

### GET /api/admin/users/[id]

**Description**: Retrieve a specific user by ID with detailed information.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ✅ Full access
- **SUPER_ADMIN**: ✅ Full access

#### Usage Case 1: Successful User Retrieval (ADMIN/SUPER_ADMIN)

**Scenario**: Admin user retrieves specific user details

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/users/user-uuid-1" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "id": "user-uuid-1",
  "name": "Admin User",
  "username": "admin",
  "email": "admin@example.com",
  "role": "SUPER_ADMIN",
  "emailVerified": "2024-01-01T12:00:00Z",
  "createdAt": "2024-01-01T12:00:00Z",
  "lastActive": "2024-01-01T13:00:00Z",
  "is2FAEnabled": false,
  "accounts": [],
  "groups": [
    {
      "id": "group-uuid-1",
      "name": "Admin Group",
      "description": "Administrative users"
    }
  ],
  "authMethod": "Local",
  "directGroups": [
    {
      "id": "group-uuid-1",
      "name": "Admin Group",
      "description": "Administrative users"
    }
  ],
  "mappedGroups": [],
  "externalGroups": []
}
```

#### Usage Case 2: User Not Found

**Scenario**: Requested user ID does not exist

**Error Response**:
```json
{
  "message": "User not found"
}
```

#### Usage Case 3: Unauthorized Access (USER)

**Scenario**: USER role attempts to access specific user details

**Error Response**:
```json
{
  "message": "Unauthorized"
}
```

#### Usage Case 4: Invalid User ID Format

**Scenario**: Malformed user ID in request

**Error Response**:
```json
{
  "message": "Invalid user ID format"
}
```

## Monitoring & Analytics

### GET /api/admin/audit-logs

**Description**: Retrieve system audit logs for monitoring and compliance with filtering and pagination support.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ✅ Full access
- **SUPER_ADMIN**: ✅ Full access

**Query Parameters**:
- `search` (optional): Search term to filter logs by content
- `user` (optional): Filter by user ID or username
- `action` (optional): Filter by action type (e.g., USER_LOGIN, SETTINGS_UPDATED)
- `details` (optional): Filter by details content
- `startDate` (optional): Filter by start date (ISO format: YYYY-MM-DDTHH:mm:ss.sssZ)
- `endDate` (optional): Filter by end date (ISO format: YYYY-MM-DDTHH:mm:ss.sssZ)
- `page` (optional): Page number for pagination (default: 1)
- `pageSize` (optional): Number of records per page (default: 50, max: 100)

#### Usage Case 1: Basic Audit Log Retrieval

**Scenario**: Admin retrieves recent audit logs

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/audit-logs" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "logs": [
    {
      "id": "audit-uuid-1",
      "userId": "user-uuid-1",
      "user": {
        "name": "Admin User",
        "email": "admin@example.com"
      },
      "action": "USER_LOGIN",
      "details": {
        "method": "API_KEY",
        "ipAddress": "192.168.1.100"
      },
      "timestamp": "2024-01-01T12:00:00Z",
      "ipAddress": "192.168.1.100",
      "userAgent": "curl/7.68.0"
    },
    {
      "id": "audit-uuid-2",
      "userId": "user-uuid-2",
      "user": {
        "name": "Regular User",
        "email": "user@example.com"
      },
      "action": "SETTINGS_UPDATED",
      "details": {
        "settings": {
          "enableRegistration": true
        }
      },
      "timestamp": "2024-01-01T11:00:00Z",
      "ipAddress": "192.168.1.101",
      "userAgent": "Mozilla/5.0..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 2,
    "totalPages": 1
  }
}
```

#### Usage Case 2: Filtered Audit Log Retrieval

**Scenario**: Admin retrieves audit logs for specific action type

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/audit-logs?action=USER_LOGIN&limit=10" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "logs": [
    {
      "id": "audit-uuid-1",
      "userId": "user-uuid-1",
      "user": {
        "name": "Admin User",
        "email": "admin@example.com"
      },
      "action": "USER_LOGIN",
      "details": {
        "method": "API_KEY",
        "ipAddress": "192.168.1.100"
      },
      "timestamp": "2024-01-01T12:00:00Z",
      "ipAddress": "192.168.1.100",
      "userAgent": "curl/7.68.0"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

#### Usage Case 3: Unauthorized Access (USER)

**Scenario**: USER role attempts to access audit logs

**Error Response**:
```json
{
  "message": "Unauthorized"
}
```

**Response Fields**:
- `id`: Unique audit log identifier
- `userId`: User who performed the action
- `user`: User information
- `action`: Action performed
- `details`: Additional action details
- `timestamp`: When the action occurred
- `ipAddress`: IP address of the user
- `userAgent`: User agent string

### GET /api/admin/audit-logs/stats

**Description**: Retrieve audit log statistics including total counts and time period breakdowns. Used for audit log management and monitoring.

**Authentication**: Required (session or API key with SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized - insufficient permissions
- **ADMIN**: ❌ Unauthorized - SUPER_ADMIN privileges required
- **SUPER_ADMIN**: ✅ Full access to audit log statistics and management

#### Usage Case 1: Successful Statistics Retrieval

**Scenario**: Super admin retrieves audit log statistics for management dashboard

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/audit-logs/stats" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "totalCount": 15420,
  "oldestLogTimestamp": "2024-01-01T00:00:00.000Z",
  "newestLogTimestamp": "2024-01-15T14:30:00.000Z",
  "timePeriodCounts": {
    "lastDay": 145,
    "lastWeek": 892,
    "lastMonth": 3456,
    "lastYear": 15420
  }
}
```

#### Usage Case 2: Unauthorized Access (ADMIN/USER)

**Scenario**: Non-super admin attempts to access audit log statistics

**Error Response**:
```json
{
  "error": "Unauthorized"
}
```

**Response Fields**:
- `totalCount`: Total number of audit logs in the system
- `oldestLogTimestamp`: Timestamp of the oldest audit log entry
- `newestLogTimestamp`: Timestamp of the newest audit log entry
- `timePeriodCounts`: Breakdown of log counts by time periods
  - `lastDay`: Number of logs from the last 24 hours
  - `lastWeek`: Number of logs from the last 7 days
  - `lastMonth`: Number of logs from the last 30 days
  - `lastYear`: Number of logs from the last 365 days

### POST /api/admin/audit-logs/preview-trim

**Description**: Preview what audit logs would be deleted based on retention settings without actually performing the deletion. Used for safe audit log management.

**Authentication**: Required (session or API key with SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized - insufficient permissions
- **ADMIN**: ❌ Unauthorized - SUPER_ADMIN privileges required
- **SUPER_ADMIN**: ✅ Full access to audit log management operations

**Request Body**:
```json
{
  "retentionPeriod": 30,
  "retentionUnit": "days"
}
```

**Request Parameters**:
- `retentionPeriod` (required): Number of time units to retain (minimum: 1)
- `retentionUnit` (required): Time unit for retention ("days", "weeks", "months", "years")

#### Usage Case 1: Successful Preview

**Scenario**: Super admin previews trimming logs older than 30 days

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/admin/audit-logs/preview-trim" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "retentionPeriod": 30,
    "retentionUnit": "days"
  }'
```

**Success Response**:
```json
{
  "cutoffDate": "2023-12-16T14:30:00.000Z",
  "logsToDeleteCount": 8945,
  "logsToKeepCount": 6475,
  "totalCount": 15420,
  "oldestLogToDelete": "2024-01-01T00:00:00.000Z",
  "newestLogToDelete": "2023-12-16T14:29:59.999Z",
  "retentionPeriod": 30,
  "retentionUnit": "days"
}
```

#### Usage Case 2: Invalid Parameters

**Scenario**: Invalid retention period or unit provided

**Error Response**:
```json
{
  "error": "Retention period must be at least 1"
}
```

**Response Fields**:
- `cutoffDate`: ISO timestamp representing the cutoff date for deletion
- `logsToDeleteCount`: Number of logs that would be deleted
- `logsToKeepCount`: Number of logs that would be retained
- `totalCount`: Total number of logs currently in the system
- `oldestLogToDelete`: Timestamp of the oldest log that would be deleted
- `newestLogToDelete`: Timestamp of the newest log that would be deleted
- `retentionPeriod`: Echoed retention period from request
- `retentionUnit`: Echoed retention unit from request

### POST /api/admin/audit-logs/trim

**Description**: Permanently delete audit logs older than the specified retention period. This action cannot be undone and requires explicit confirmation.

**Authentication**: Required (session or API key with SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized - insufficient permissions
- **ADMIN**: ❌ Unauthorized - SUPER_ADMIN privileges required
- **SUPER_ADMIN**: ✅ Full access to audit log management operations

**Request Body**:
```json
{
  "retentionPeriod": 30,
  "retentionUnit": "days",
  "confirmation": "CONFIRM"
}
```

**Request Parameters**:
- `retentionPeriod` (required): Number of time units to retain (minimum: 1)
- `retentionUnit` (required): Time unit for retention ("days", "weeks", "months", "years")
- `confirmation` (required): Must be exactly "CONFIRM" to proceed with deletion

#### Usage Case 1: Successful Trim Operation

**Scenario**: Super admin trims audit logs older than 90 days with proper confirmation

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/admin/audit-logs/trim" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "retentionPeriod": 90,
    "retentionUnit": "days",
    "confirmation": "CONFIRM"
  }'
```

**Success Response**:
```json
{
  "success": true,
  "deletedCount": 12450,
  "remainingCount": 2970,
  "cutoffDate": "2023-10-17T14:30:00.000Z",
  "oldestRemainingLog": "2023-10-17T14:30:01.000Z"
}
```

#### Usage Case 2: Missing or Invalid Confirmation

**Scenario**: Trim request without proper confirmation text

**Error Response**:
```json
{
  "error": "Confirmation required. Type \"CONFIRM\" to proceed."
}
```

#### Usage Case 3: Invalid Retention Parameters

**Scenario**: Retention period below minimum threshold

**Error Response**:
```json
{
  "error": "Minimum retention period is 1 day"
}
```

**Response Fields**:
- `success`: Boolean indicating successful completion
- `deletedCount`: Number of audit logs that were deleted
- `remainingCount`: Number of audit logs remaining after deletion
- `cutoffDate`: ISO timestamp that was used as the cutoff for deletion
- `oldestRemainingLog`: Timestamp of the oldest remaining audit log

**Important Notes**:
- This operation is **irreversible** - deleted audit logs cannot be recovered
- The operation is performed within a database transaction for atomicity
- The trim operation itself is logged as an audit event
- Minimum retention period is enforced (at least 1 day equivalent)
- All parameters are validated before any deletion occurs

## Group Type Validation

### GET /api/admin/validate-group-types

**Description**: Validates whether group types can be safely disabled by checking for host aliases assigned to multiple groups. Returns different levels of detail based on user authentication.

**Authentication**: Mixed (Optional for self-service, Required for admin access)

**Role Access:**
- **Unauthenticated**: ✅ Basic validation status only (returns hasMultipleGroupAssignments)
- **USER**: ✅ Basic validation with violation count (returns canDisableGroupTypes and violationCount)
- **ADMIN**: ✅ Basic validation with violation count (returns canDisableGroupTypes and violationCount)
- **SUPER_ADMIN**: ✅ Full validation details with violation list (returns detailed violations, counts, and statistics)

#### Usage Case 1: Unauthenticated Access (Self-Service)

**Scenario**: Self-service page checking if multiple group assignments exist

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/validate-group-types" \
  -H "Content-Type: application/json"
```

**Success Response** (Unauthenticated):
```json
{
  "hasMultipleGroupAssignments": true
}
```

#### Usage Case 2: Authenticated User Access

**Scenario**: Regular user checking group type validation status

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/validate-group-types" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response** (USER/ADMIN):
```json
{
  "canDisableGroupTypes": false,
  "violationCount": 3
}
```

#### Usage Case 3: Super Admin Access (Full Details)

**Scenario**: Super admin reviewing detailed violation information for group type management

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/validate-group-types" \
  -H "Authorization: Bearer {{SUPER_ADMIN_API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response** (SUPER_ADMIN):
```json
{
  "canDisableGroupTypes": false,
  "violations": [
    {
      "hostAlias": "HOST_192_168_1_61",
      "groups": ["Brazil - Proton - OV", "Italy - Proton - OV"],
      "groupCount": 2
    },
    {
      "hostAlias": "server01",
      "groups": ["DMZ", "Servers", "Production"],
      "groupCount": 3
    }
  ],
  "violationCount": 2,
  "totalHostAliases": 150,
  "totalGroups": 25
}
```

#### Error Responses

**OPNsense API Failure** (SUPER_ADMIN):
```json
{
  "error": "Failed to fetch network groups from OPNsense: Connection timeout",
  "canDisableGroupTypes": false,
  "violations": [],
  "violationCount": 0
}
```

**OPNsense API Failure** (USER/ADMIN):
```json
{
  "canDisableGroupTypes": false,
  "violationCount": 0
}
```

**OPNsense API Failure** (Unauthenticated):
```json
{
  "hasMultipleGroupAssignments": false
}
```

#### Response Fields

**Unauthenticated Response:**
- `hasMultipleGroupAssignments`: Boolean indicating if any host aliases are in multiple groups

**Authenticated Response (USER/ADMIN):**
- `canDisableGroupTypes`: Boolean indicating if group types can be safely disabled
- `violationCount`: Number of host aliases assigned to multiple groups

**Super Admin Response:**
- `canDisableGroupTypes`: Boolean indicating if group types can be safely disabled
- `violations`: Array of violation objects with detailed information
- `violationCount`: Number of host aliases assigned to multiple groups
- `totalHostAliases`: Total number of host aliases processed
- `totalGroups`: Total number of network groups processed

**Violation Object:**
- `hostAlias`: Name of the host alias with multiple group assignments
- `groups`: Array of group names the host alias belongs to
- `groupCount`: Number of groups the host alias is assigned to

#### Use Cases

**Administrative Use:**
- Validating group type configuration before disabling multi-group support
- Identifying host aliases that need group assignment cleanup
- System configuration management

**Self-Service Use:**
- Determining if multiple group assignments exist for UI behavior
- Public validation without exposing sensitive group information

**Integration Use:**
- Automated configuration validation
- Pre-deployment checks for group type changes

## System Summary

### GET /api/admin/system-summary

**Description**: Get system overview and statistics.

**Authentication**: Required (session or API key with SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized - insufficient permissions
- **ADMIN**: ❌ Unauthorized - SUPER_ADMIN privileges required
- **SUPER_ADMIN**: ✅ Full access to system summary and statistics

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/system-summary" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
{
  "globalSettings": {
    "enableRegistration": false,
    "removeSelfServicePage": false,
    "enableRenamingSelfServicePage": true,
    "enableRenamingDeviceManagementPage": true,
    "enableGroupTypes": true,
    "enableSelfServiceMultiSelect": true,
    "singleSelectName": "Single Select Custom",
    "multiSelectName": "Multi Select Custom",
    "singleSelectIcon": "DEFAULT",
    "multiSelectIcon": "DEFAULT",
    "enableAdvancedAnalytics": true,
    "enableMacTracking": true,
    "macTrackingInterval": 5,
    "macInactiveTimeout": 6,
    "macDataRetentionDays": 90,
    "customLucideIcons": [
      {
        "icon": "AlignVerticalSpaceAround",
        "name": "AlignVerticalSpaceAround"
      }
    ],
    "customEmojis": [],
    "customFlags": []
  },
  "allowedNetworks": ["192.168.1.0/24", "10.0.0.0/8"],
  "groupFilters": [
    {
      "pattern": "^GUEST_",
      "description": "Guest device filter",
      "type": "exclude"
    }
  ],
  "backupStats": {
    "lastWeekCount": 7,
    "lastMonthCount": 30,
    "last3MonthsCount": 90,
    "lastBackupDate": "2024-01-15T10:30:00.000Z",
    "lastBackupFileName": "backup_2024-01-15_10-30.zip"
  },
  "networkGroupStats": {
    "totalGroups": 15,
    "totalMembers": 142,
    "groupsWithMembers": 12,
    "emptyGroups": 3,
    "averageMembersPerGroup": 9.5
  },
  "hostAliasStats": {
    "managed": {
      "hostAliases": 40,
      "assignedToNetworkGroups": 3,
      "notAssignedToNetworkGroups": 37,
      "activeDevicesInArpTable": 15,
      "lists": {
        "all": [],
        "assignedToNetworkGroups": [],
        "notAssignedToNetworkGroups": [],
        "activeDevicesInArpTable": []
      }
    },
    "unmanaged": {
      "hostAliases": 5,
      "assignedToNetworkGroups": 0,
      "notAssignedToNetworkGroups": 5,
      "activeDevicesInArpTable": 3,
      "lists": {
        "all": [],
        "assignedToNetworkGroups": [],
        "notAssignedToNetworkGroups": [],
        "activeDevicesInArpTable": []
      }
    },
    "total": {
      "hostAliases": 45,
      "assignedToNetworkGroups": 3,
      "notAssignedToNetworkGroups": 42,
      "activeDevicesInArpTable": 18,
      "totalActiveDevicesInArp": 25,
      "lists": {
        "all": [],
        "assignedToNetworkGroups": [],
        "notAssignedToNetworkGroups": [],
        "activeDevicesInArpTable": []
      }
    }
  },
  "vpnStats": {
    "totalVpns": 12,
    "connectedVpns": 8,
    "disconnectedVpns": 4,
    "vpnMappings": [
      {
        "id": "960766b2-3376-4eda-81a8-91dc24d9a857",
        "vpnServer": "Proton VPN Brazil",
        "vpnName": "ProtonVPN Brazil",
        "mappedNetworkGroup": "BR_DEVICE_GROUP",
        "vpnType": "OpenVPN",
        "vpnStatus": "connected",
        "dataTransferredRx": "508.8 KB",
        "dataTransferredTx": "361.4 KB"
      },
      {
        "id": "333b6e2f-35ba-4d14-94c4-d971ef0aa5a3",
        "vpnServer": "WGP-ProtonVPN-UK-186",
        "vpnName": "WGP-ProtonVPN-UK-186",
        "mappedNetworkGroup": "N/A",
        "vpnType": "WireGuard",
        "vpnStatus": "connected",
        "dataTransferredRx": "0.0 B",
        "dataTransferredTx": "0.0 B"
      }
    ]
  },
  "groupStats": {
    "totalManagedGroups": 2,
    "groups": [
      {
        "name": "Test 2",
        "uuid": "group-uuid-1",
        "assignedHostAliases": ["host1", "host2", "host3", "host4"],
        "assignedHostAliasesCount": 4,
        "assignedHostAliasesCountLabel": "4",
        "directUsersCount": 2,
        "ssoUsersCount": 0,
        "filtersCount": 0
      },
      {
        "name": "Admin",
        "uuid": "group-uuid-2",
        "assignedHostAliases": ["ALL HOST ALIASES"],
        "assignedHostAliasesCount": 345,
        "assignedHostAliasesCountLabel": "ALL (345)",
        "directUsersCount": 1,
        "ssoUsersCount": 1,
        "filtersCount": 0
      }
    ]
  },
  "ssoGroupMappingStats": {
    "totalSsoGroupMappings": 1,
    "ssoGroupMappings": [
      {
        "ssoProvider": "authentik",
        "ssoProviderDisplayName": "Authentik",
        "ssoGroupName": "Dashy",
        "localGroup": {
          "name": "Admin"
        }
      }
    ]
  },
  "dhcpStats": {
    "reservationsCount": 12,
    "activeLeasesCount": 0,
    "activeDevicesCount": 75,
    "activeDevicesWithDhcpReservedCount": 11
  },
  "backupStats": {
    "lastWeekCount": 0,
    "lastMonthCount": 0,
    "last3MonthsCount": 0,
    "lastBackupDate": null,
    "lastBackupFileName": null
  }
}
```

**Response Fields**:
- `globalSettings`: System-wide configuration settings
  - `enableRegistration`: Whether user registration is enabled
  - `removeSelfServicePage`: Whether self-service page is completely disabled
  - `enableRenamingSelfServicePage`: Whether self-service page renaming is enabled
  - `enableRenamingDeviceManagementPage`: Whether device management page renaming is enabled
  - `enableGroupTypes`: Whether group types (SingleSelect/MultiSelect) are enabled
  - `enableSelfServiceMultiSelect`: Whether multi-select is enabled for self-service
  - `singleSelectName`: Custom name for SingleSelect groups
  - `multiSelectName`: Custom name for MultiSelect groups
  - `singleSelectIcon`: Icon identifier for SingleSelect groups
  - `multiSelectIcon`: Icon identifier for MultiSelect groups
  - `enableAdvancedAnalytics`: Whether advanced analytics features are enabled
  - `enableMacTracking`: Whether MAC address tracking is enabled
  - `macTrackingInterval`: ARP scan interval in minutes
  - `macInactiveTimeout`: Minutes before marking MAC addresses inactive
  - `macDataRetentionDays`: Days to retain MAC tracking data
  - `customLucideIcons`: Array of custom Lucide icons configured
  - `customEmojis`: Array of custom emojis configured
  - `customFlags`: Array of custom flags configured
- `allowedNetworks`: Array of network CIDR blocks allowed to access the system
- `groupFilters`: Array of device filtering rules
  - `pattern`: Regular expression pattern for filtering
  - `description`: Human-readable description of the filter
  - `type`: Filter type (include/exclude)
- `backupStats`: Backup system statistics
  - `lastWeekCount`: Number of backups created in the last week
  - `lastMonthCount`: Number of backups created in the last month
  - `last3MonthsCount`: Number of backups created in the last 3 months
  - `lastBackupDate`: ISO timestamp of the most recent backup
  - `lastBackupFileName`: Filename of the most recent backup
- `networkGroupStats`: Network group statistics
  - `totalGroups`: Total number of network groups
  - `totalMembers`: Total number of members across all groups
  - `groupsWithMembers`: Number of groups that have at least one member
  - `emptyGroups`: Number of groups with no members
  - `averageMembersPerGroup`: Average number of members per group
- `hostAliasStats`: Host alias analytics and statistics
  - `managed`: Statistics for host aliases manageable by the system
    - `hostAliases`: Total count of managed host aliases
    - `assignedToNetworkGroups`: Count assigned to one or more network groups
    - `notAssignedToNetworkGroups`: Count not assigned to any network groups
    - `activeDevicesInArpTable`: Count with devices currently active in ARP table
    - `lists`: Detailed arrays of host alias objects for each category (populated for UI modals)
  - `unmanaged`: Statistics for host aliases filtered out by system rules
    - `hostAliases`: Total count of unmanaged host aliases
    - `assignedToNetworkGroups`: Count of unmanaged aliases that ARE members of network groups
    - `notAssignedToNetworkGroups`: Count of unmanaged aliases that are NOT members of any network groups
    - `activeDevicesInArpTable`: Count with devices currently active in ARP table
    - `lists`: Detailed arrays of host alias objects for each category (includes actual group membership)
  - `total`: Combined statistics for all host aliases
    - `hostAliases`: Total count of all host aliases (managed + unmanaged)
    - `assignedToNetworkGroups`: Total count assigned to network groups
    - `notAssignedToNetworkGroups`: Total count not assigned to network groups
    - `activeDevicesInArpTable`: Total count with active devices in ARP table
    - `totalActiveDevicesInArp`: Total number of devices currently in ARP table
    - `lists`: Combined detailed arrays with category labels
- `groupStats`: User group statistics and details
  - `totalManagedGroups`: Total number of user groups managed by the system
  - `groups`: Array of group details
    - `name`: Group name
    - `uuid`: Unique group identifier
    - `assignedHostAliases`: Array of host alias names assigned to this group
    - `assignedHostAliasesCount`: Number of host aliases assigned to this group
    - `assignedHostAliasesCountLabel`: Display label (e.g., "4" or "ALL (345)" for wildcard permissions)
    - `directUsersCount`: Number of users directly assigned to this group
    - `ssoUsersCount`: Number of users assigned via SSO mappings
    - `filtersCount`: Number of group-specific filters configured
- `ssoGroupMappingStats`: SSO group mapping statistics
  - `totalSsoGroupMappings`: Total number of SSO group mappings configured
  - `ssoGroupMappings`: Array of SSO mapping details
    - `ssoProvider`: SSO provider identifier (e.g., "authentik", "keycloak", "microsoft")
    - `ssoProviderDisplayName`: SSO provider display name resolved from environment variables (e.g., "Authentik", "Keycloak", "Microsoft")
    - `ssoGroupName`: Name of the external SSO group
    - `localGroup`: Local group information
      - `name`: Name of the local group being mapped to
- `vpnStats`: VPN connection statistics and real-time data
  - `totalVpns`: Total number of VPN connections configured
  - `connectedVpns`: Number of currently connected VPNs
  - `disconnectedVpns`: Number of currently disconnected VPNs
  - `vpnMappings`: Array of VPN connection details
    - `id`: Unique VPN connection identifier
    - `vpnServer`: VPN server name or friendly name
    - `vpnName`: Internal VPN name
    - `mappedNetworkGroup`: Network group mapped to this VPN (or "N/A" if unmapped)
    - `vpnType`: VPN type (OpenVPN, WireGuard, IPsec)
    - `vpnStatus`: Real-time connection status (connected, disconnected, disabled)
    - `dataTransferredRx`: Data received (formatted with units)
    - `dataTransferredTx`: Data transmitted (formatted with units)
  - `connectedSince`: ISO timestamp when connection was established
  - `dataTransferredRx`: Human-readable received data amount
  - `dataTransferredTx`: Human-readable transmitted data amount
- `dhcpStats`: DHCP and network device statistics
  - `reservationsCount`: Number of DHCP reservations configured
  - `activeLeasesCount`: Number of active DHCP leases
  - `activeDevicesCount`: Number of devices currently in ARP table
  - `activeDevicesWithDhcpReservedCount`: Number of active devices with DHCP reservations

**Response Fields**:
- `users`: User statistics
  - `total`: Total number of users
  - `active`: Number of active users
  - `pending`: Number of pending users
  - `disabled`: Number of disabled users
- `groups`: Group statistics
  - `total`: Total number of groups
  - `active`: Number of active groups
  - `empty`: Number of empty groups
- `vpnConnections`: VPN connection statistics
  - `total`: Total number of connections
  - `connected`: Number of connected VPNs
  - `disconnected`: Number of disconnected VPNs
- `system`: System information
  - `uptime`: System uptime
  - `version`: Application version
  - `lastBackup`: Last backup timestamp

## Database Information

### GET /api/admin/db-info

**Description**: Get database information and statistics.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized - insufficient permissions
- **ADMIN**: ✅ Full access to database information
- **SUPER_ADMIN**: ✅ Full access to database information

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/db-info" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
{
  "tables": {
    "User": 25,
    "Group": 10,
    "AuditLog": 15420,
    "GlobalSettings": 1,
    "ApiKey": 15
  },
  "size": {
    "total": "45.2 MB",
    "data": "32.1 MB",
    "index": "13.1 MB"
  },
  "performance": {
    "connections": 5,
    "activeConnections": 2,
    "queryTime": "2.5ms"
  }
}
```

**Response Fields**:
- `tables`: Record counts by table
- `size`: Database size information
  - `total`: Total database size
  - `data`: Data size
  - `index`: Index size
- `performance`: Performance metrics
  - `connections`: Total connections
  - `activeConnections`: Active connections
  - `queryTime`: Average query time

## Group Management

### GET /api/admin/groups

**Description**: Retrieve all groups in the system.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ✅ Full access
- **SUPER_ADMIN**: ✅ Full access

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/groups" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
[
  {
    "id": "group-uuid-1",
    "name": "Admin Group",
    "description": "Administrative users",
    "createdAt": "2024-01-01T12:00:00Z",
    "updatedAt": "2024-01-01T12:00:00Z",
    "memberCount": 5,
    "users": [
      {
        "id": "user-uuid-1",
        "name": "Admin User",
        "email": "admin@example.com",
        "role": "SUPER_ADMIN"
      }
    ]
  },
  {
    "id": "group-uuid-2",
    "name": "User Group",
    "description": "Regular users",
    "createdAt": "2024-01-01T12:00:00Z",
    "updatedAt": "2024-01-01T12:00:00Z",
    "memberCount": 20,
    "users": [
      {
        "id": "user-uuid-2",
        "name": "Regular User",
        "email": "user@example.com",
        "role": "USER"
      }
    ]
  }
]
```

**Response Fields**:
- `id`: Unique group identifier
- `name`: Group name
- `description`: Group description
- `createdAt`: Group creation timestamp
- `updatedAt`: Last update timestamp
- `memberCount`: Number of group members
- `users`: Group members

## Group Mappings

### GET /api/admin/group-mappings

**Description**: Retrieve group mappings for external authentication.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ✅ Full access
- **SUPER_ADMIN**: ✅ Full access

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/group-mappings" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
[
  {
    "id": "mapping-uuid-1",
    "groupId": "group-uuid-1",
    "group": {
      "id": "group-uuid-1",
      "name": "Admin Group",
      "description": "Administrative users"
    },
    "externalGroupId": "external-admin-group",
    "externalGroupName": "Admin Group",
    "provider": "authentik",
    "enabled": true,
    "createdAt": "2024-01-01T12:00:00Z"
  }
]
```

**Response Fields**:
- `id`: Unique mapping identifier
- `groupId`: Internal group ID
- `group`: Internal group information
- `externalGroupId`: External group identifier
- `externalGroupName`: External group name
- `provider`: Authentication provider
- `enabled`: Whether mapping is enabled
- `createdAt`: Mapping creation timestamp

## Error Responses

### 401 Unauthorized
```json
{
  "message": "Unauthorized"
}
```

### 400 Bad Request

**Invalid User ID Format**:
```json
{
  "message": "Invalid user ID format"
}
```

**Invalid Pagination Parameters**:
```json
{
  "error": "Invalid pagination parameters"
}
```

**Invalid Date Format**:
```json
{
  "error": "Invalid date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)"
}
```

### 401 Unauthorized

**Authentication Required**:
```json
{
  "message": "Unauthorized"
}
```

**Invalid API Key**:
```json
{
  "message": "Invalid API key"
}
```

### 403 Forbidden

**Insufficient Permissions**:
```json
{
  "error": "Insufficient permissions"
}
```

**Admin Privileges Required**:
```json
{
  "message": "Admin privileges required"
}
```

### 404 Not Found

**User Not Found**:
```json
{
  "message": "User not found"
}
```

**Group Not Found**:
```json
{
  "error": "Group not found"
}
```

**Audit Log Not Found**:
```json
{
  "error": "Audit log entry not found"
}
```

### 500 Internal Server Error

**General Server Error**:
```json
{
  "message": "Internal server error"
}
```

**Database Connection Error**:
```json
{
  "error": "Database connection failed"
}
```

**User Creation Error**:
```json
{
  "error": "Failed to create user"
}
```

**Audit Log Retrieval Error**:
```json
{
  "error": "Failed to retrieve audit logs"
}
```

## Notes

### Authentication and Authorization

1. **Admin Access Only**: All endpoints require ADMIN or SUPER_ADMIN role
2. **Role Validation**: User roles are validated on each request
3. **Session Support**: Both session and API key authentication supported
4. **Audit Logging**: All admin actions are logged for security monitoring

### User Management Features

1. **Full User Lifecycle**: Create, read, update, and delete user accounts
2. **Role Management**: Assign and modify user roles (USER, ADMIN, SUPER_ADMIN)
3. **Group Membership**: Manage user group assignments and mappings
4. **Authentication Methods**: Support for local and external authentication

### Audit and Monitoring

1. **Comprehensive Logging**: All system actions are logged with detailed information
2. **Filtering and Pagination**: Advanced filtering options for audit log retrieval
3. **System Statistics**: Real-time system performance and usage metrics
4. **Database Monitoring**: Database size, performance, and health information

### Error Handling

1. **Consistent Format**: All errors follow standard JSON error response format
2. **Specific Messages**: Different error messages for different failure scenarios
3. **Status Codes**: Appropriate HTTP status codes for different error types
4. **Security Considerations**: Generic error messages to prevent information disclosure

## API Key Usage Statistics (Admin)

### GET /api/admin/api-keys/usage/overview

**Description**: Get system-wide API key usage statistics and analytics.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized - insufficient permissions
- **ADMIN**: ✅ Full access to system-wide API key usage statistics
- **SUPER_ADMIN**: ✅ Full access to system-wide API key usage statistics

#### Usage Case 1: System-Wide Usage Overview

**Scenario**: Admin retrieves comprehensive system-wide API key usage statistics

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/api-keys/usage/overview" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "totalApiKeys": 45,
    "activeApiKeys": 38,
    "totalUsers": 30,
    "usersWithApiKeys": 25,
    "totalRequests": 1250000,
    "rateLimitViolations": 342,
    "topUsers": [
      {
        "userId": "user-uuid-1",
        "userName": "John Doe",
        "userEmail": "john@example.com",
        "apiKeyCount": 3,
        "totalRequests": 450000
      },
      {
        "userId": "user-uuid-2",
        "userName": "Jane Smith",
        "userEmail": "jane@example.com",
        "apiKeyCount": 2,
        "totalRequests": 320000
      }
    ],
    "topApiKeys": [
      {
        "id": "key-uuid-1",
        "name": "Production Monitor",
        "userId": "user-uuid-1",
        "userName": "John Doe",
        "requests": 450000,
        "lastUsed": "2024-01-15T14:30:00.000Z"
      },
      {
        "id": "key-uuid-2",
        "name": "Automation Script",
        "userId": "user-uuid-2",
        "userName": "Jane Smith",
        "requests": 320000,
        "lastUsed": "2024-01-15T13:45:00.000Z"
      }
    ],
    "usageByPeriod": {
      "last24Hours": 12500,
      "last7Days": 85000,
      "last30Days": 350000
    },
    "requestsByEndpoint": [
      {
        "endpoint": "/api/vpn/status",
        "count": 650000,
        "percentage": 52.0
      },
      {
        "endpoint": "/api/opnsense/aliases",
        "count": 280000,
        "percentage": 22.4
      },
      {
        "endpoint": "/api/admin/users",
        "count": 150000,
        "percentage": 12.0
      }
    ]
  }
}
```

**Response Fields**:
- `totalApiKeys`: Total number of API keys in the system
- `activeApiKeys`: Number of enabled API keys
- `totalUsers`: Total number of users in the system
- `usersWithApiKeys`: Number of users who have at least one API key
- `totalRequests`: Total requests across all API keys
- `rateLimitViolations`: Total rate limit violations system-wide
- `topUsers`: Users with highest API usage (top 5)
- `topApiKeys`: API keys with highest usage (top 10)
- `usageByPeriod`: System usage breakdown by time periods
- `requestsByEndpoint`: Most popular endpoints system-wide (top 15)

### GET /api/admin/api-keys/usage/users/[userId]

**Description**: Get API key usage statistics for a specific user.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized - insufficient permissions
- **ADMIN**: ✅ Full access to user-specific API key usage statistics
- **SUPER_ADMIN**: ✅ Full access to user-specific API key usage statistics

**Query Parameters:**
- `includeDetailedStats` (optional): Set to `true` to include detailed statistics for each API key

#### Usage Case 1: User API Key Usage Overview

**Scenario**: Admin retrieves API key usage for a specific user

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/api-keys/usage/users/user-uuid-1" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-uuid-1",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "USER",
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "usage": {
      "summary": {
        "totalApiKeys": 3,
        "activeApiKeys": 2,
        "totalRequests": 450000,
        "rateLimitViolations": 25,
        "topApiKeys": [
          {
            "id": "key-uuid-1",
            "name": "Production Monitor",
            "requests": 300000,
            "lastUsed": "2024-01-15T14:30:00.000Z"
          },
          {
            "id": "key-uuid-2",
            "name": "Development Key",
            "requests": 120000,
            "lastUsed": "2024-01-15T12:15:00.000Z"
          }
        ],
        "usageByPeriod": {
          "last24Hours": 4500,
          "last7Days": 28000,
          "last30Days": 95000
        }
      }
    }
  }
}
```

#### Usage Case 2: User Not Found

**Scenario**: Admin attempts to access usage for non-existent user

**Error Response**:
```json
{
  "success": false,
  "message": "User not found"
}
```

### GET /api/admin/api-keys/usage/trends

**Description**: Get system-wide API key usage trends over time.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized - insufficient permissions
- **ADMIN**: ✅ Full access to system-wide API key usage trends
- **SUPER_ADMIN**: ✅ Full access to system-wide API key usage trends

**Query Parameters:**
- `days` (optional): Number of days for trends (default: 30, max: 90)
- `windowType` (optional): Time window type - `daily` or `hourly` (default: `daily`)

#### Usage Case 1: Daily Usage Trends

**Scenario**: Admin retrieves 30-day daily usage trends

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/api-keys/usage/trends?days=30&windowType=daily" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "trends": [
      {
        "date": "2024-01-01",
        "totalRequests": 8500,
        "uniqueApiKeys": 25,
        "uniqueUsers": 12,
        "topApiKeys": [
          {
            "id": "key-uuid-1",
            "name": "Production Monitor",
            "requests": 2100,
            "userName": "John Doe"
          }
        ]
      },
      {
        "date": "2024-01-02",
        "totalRequests": 9200,
        "uniqueApiKeys": 28,
        "uniqueUsers": 14,
        "topApiKeys": [
          {
            "id": "key-uuid-1",
            "name": "Production Monitor",
            "requests": 2300,
            "userName": "John Doe"
          }
        ]
      }
    ],
    "summary": {
      "totalRequests": 285000,
      "avgRequestsPerPeriod": 9500.0,
      "peakUsage": 15200,
      "peakDate": "2024-01-15",
      "periodType": "daily",
      "daysAnalyzed": 30
    }
  }
}
```

**Response Fields**:
- `trends`: Array of daily/hourly trend data
  - `date`: Date/time of the data point
  - `totalRequests`: Total requests for that period
  - `uniqueApiKeys`: Number of unique API keys used
  - `uniqueUsers`: Number of unique users active
  - `topApiKeys`: Top 5 API keys for that period
- `summary`: Overall trend summary
  - `totalRequests`: Total requests across all periods
  - `avgRequestsPerPeriod`: Average requests per period
  - `peakUsage`: Highest usage in a single period
  - `peakDate`: Date of peak usage
  - `periodType`: Type of time window analyzed
  - `daysAnalyzed`: Number of days included in analysis

### Data Management

1. **Group Management**: Complete group creation, modification, and deletion
2. **Mapping Management**: External group mapping for SSO integration
3. **Backup Operations**: Database backup and restore capabilities
4. **Configuration Management**: System-wide configuration and settings management
5. **API Key Analytics**: Comprehensive usage tracking and system-wide statistics

## SSO Provider Display Names

### GET /api/admin/provider-display-names

**Description**: Retrieve SSO provider display names configured in the system. This endpoint resolves provider IDs to their human-readable display names from environment variables.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized - insufficient permissions
- **ADMIN**: ✅ Full access to SSO provider display names
- **SUPER_ADMIN**: ✅ Full access to SSO provider display names

#### Usage Case 1: Successful Provider Display Names Retrieval

**Scenario**: Admin user retrieves SSO provider display names for system summary

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/provider-display-names" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "authentik": "Authentik",
  "keycloak": "Keycloak",
  "microsoft": "Microsoft"
}
```

#### Usage Case 2: Unauthorized Access (USER)

**Scenario**: USER role attempts to access provider display names

**Error Response**:
```json
{
  "message": "Unauthorized"
}
```

#### Usage Case 3: No SSO Providers Configured

**Scenario**: System has no SSO providers configured

**Success Response**:
```json
{}
```

**Response Fields**:
- **Key**: SSO provider identifier (e.g., "authentik", "keycloak", "microsoft")
- **Value**: Human-readable display name for the provider (e.g., "Authentik", "Keycloak", "Microsoft")

**Environment Variable Resolution**:
This endpoint resolves display names from the following environment variables:
- `AUTH_OIDC_PROVIDER_AUTHENTIK_DISPLAY_NAME` → "authentik" key
- `AUTH_OIDC_PROVIDER_KEYCLOAK_DISPLAY_NAME` → "keycloak" key
- `AUTH_OIDC_PROVIDER_MICROSOFT_DISPLAY_NAME` → "microsoft" key
If a display name environment variable is not set for a provider, the endpoint falls back to:
- Capitalized provider ID (e.g., "AUTHENTIK" for "authentik")
- Provider ID with common replacements (e.g., "Microsoft" for "microsoft")

**Use Cases**:
- **System Summary**: Display human-readable SSO provider names instead of technical IDs
- **User Interface**: Show friendly provider names in admin dashboards
- **SSO Integration**: Resolve provider display names for external authentication systems
- **Reporting**: Generate reports with user-friendly provider names

**Integration Notes**:
- This endpoint is used by the system summary API to resolve SSO provider display names
- Display names are cached for performance optimization
- Environment variable changes require application restart to take effect
- Provider IDs are derived from the `AUTH_OIDC_PROVIDERS` environment variable

## Authentication Configuration

### GET /api/admin/auth-config

**Description**: Retrieve authentication configuration including available providers and authentication settings.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized - insufficient permissions
- **ADMIN**: ✅ Full access to authentication configuration
- **SUPER_ADMIN**: ✅ Full access to authentication configuration

#### Usage Case 1: Successful Authentication Configuration Retrieval

**Scenario**: Admin user retrieves authentication configuration for system management

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/auth-config" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "providers": [
    {
      "id": "credentials",
      "name": "Credentials",
      "type": "credentials"
    },
    {
      "id": "AUTHENTIK",
      "name": "Authentik",
      "type": "oauth"
    },
    {
      "id": "KEYCLOAK",
      "name": "Keycloak",
      "type": "oauth"
    },
    {
      "id": "MICROSOFT",
      "name": "Microsoft",
      "type": "oauth"
    }
  ],
  "isLocalLoginAllowed": true,
  "showRegistrationLink": false,
  "oidcProviders": [
    {
      "id": "AUTHENTIK",
      "displayName": "Authentik",
      "clientId": "authentik-client-id",
      "issuer": "https://authentik.example.com/application/o/instrada-ogm/",
      "scopes": ["openid", "profile", "email"]
    },
    {
      "id": "KEYCLOAK",
      "displayName": "Keycloak",
      "clientId": "keycloak-client-id",
      "issuer": "https://keycloak.example.com/realms/your-realm",
      "scopes": ["openid", "profile", "email", "groups"]
    },
    {
      "id": "MICROSOFT",
      "displayName": "Microsoft",
      "clientId": "microsoft-client-id",
      "issuer": "https://login.microsoftonline.com/tenant-id/v2.0",
      "scopes": ["openid", "profile", "email"]
    }
  ],
  "samlProviders": [
  ]
}
```

#### Usage Case 2: Unauthorized Access (USER)

**Scenario**: USER role attempts to access authentication configuration

**Error Response**:
```json
{
  "message": "Unauthorized"
}
```

#### Usage Case 3: Unauthenticated Access

**Scenario**: Request without valid authentication

**Error Response**:
```json
{
  "message": "Unauthorized"
}
```

#### Usage Case 4: No Authentication Providers Configured

**Scenario**: System has no authentication providers configured

**Success Response**:
```json
{
  "providers": [
    {
      "id": "credentials",
      "name": "Credentials",
      "type": "credentials"
    }
  ],
  "isLocalLoginAllowed": true,
  "showRegistrationLink": false,
  "oidcProviders": [],
  "samlProviders": []
}
```

**Response Fields**:
- `providers`: Array of available authentication providers
  - `id`: Unique provider identifier
  - `name`: Human-readable provider name
  - `type`: Provider type ("credentials" for local auth, "oauth" for OIDC, "saml" for SAML)
- `isLocalLoginAllowed`: Boolean indicating if local credential authentication is enabled
- `showRegistrationLink`: Boolean indicating if user registration link should be displayed
- `oidcProviders`: Array of OIDC provider configurations
  - `id`: Provider identifier
  - `displayName`: Human-readable display name
  - `clientId`: OAuth client ID
  - `issuer`: OIDC issuer URL
  - `scopes`: Array of OAuth scopes
- `samlProviders`: Array of SAML provider configurations
  - `id`: Provider identifier
  - `displayName`: Human-readable display name
  - `entityId`: SAML entity ID
  - `ssoUrl`: SAML SSO URL

**Security Considerations**:
- This endpoint exposes sensitive authentication configuration
- Client secrets and private keys are never included in responses
- Provider configurations should be reviewed regularly for security
- All access to this endpoint is logged for security monitoring

**Use Cases**:
- **System Administration**: Review and manage authentication providers
- **Security Auditing**: Verify authentication configuration compliance
- **Integration Setup**: Configure external authentication providers
- **User Interface**: Display available authentication options to users
- **Troubleshooting**: Diagnose authentication issues

**Integration Notes**:
- This endpoint is used by the system summary API to resolve authentication provider information
- Provider configurations are cached for performance optimization
- Environment variable changes require application restart to take effect
- Provider IDs are derived from the `AUTH_OIDC_PROVIDERS` environment variable

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