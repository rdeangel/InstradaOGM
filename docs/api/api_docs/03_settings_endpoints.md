# Settings Endpoints

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
curl -X GET "${SERVER_URL}/api/settings" \
  -H "Authorization: Bearer ${API_KEY}"
```

This section covers all settings-related API endpoints for managing application configuration, group filters, and system preferences.

## Role-Based Access Control

**Authentication Required:** Mixed (most endpoints require authentication, /api/settings/oidc-providers and /api/settings/global-public are public)

**Role Requirements:**
- **USER**: ❌ Cannot access most settings endpoints (only public endpoints)
- **ADMIN**: ✅ Can access group filters, OPNsense display settings (GET only), and global-full settings
- **SUPER_ADMIN**: ✅ Can access all settings endpoints

**Role Access:**
- **USER**: ❌ Forbidden - insufficient permissions for most settings endpoints (can only access public OIDC providers and global-public endpoints)
- **ADMIN**: ✅ Can access group filters, OPNsense display settings (GET only), global-full settings, and backup management (GET only)
- **SUPER_ADMIN**: ✅ Can access all settings endpoints including global settings, group filters, OPNsense display settings (full access), backup management (full CRUD), and OIDC providers

**Example Responses:**

**USER Role Failure:**
```json
{
  "error": "Forbidden: Super admin privileges required to access global settings"
}
```

**ADMIN Role Success (Group Filters):**
```json
[
  {
    "id": "filter-uuid-1",
    "pattern": "^G_DEVICES_.*(OV|WG)$",
    "description": "VPN Device Groups",
    "type": "include"
  }
]
```

**SUPER_ADMIN Role Success (Global Settings):**
```json
{
  "enableRegistration": false,
  "enableRenamingSelfServicePage": false,
  "enableRenamingDeviceManagementPage": true,
  "allowedNetworks": [
    {
      "id": "network-uuid-1",
      "type": "include",
      "network": "192.168.1.0/24",
      "description": "Home Network"
    }
  ]
}
```

## Global Settings Management

### GET /api/settings

**Description**: Retrieve global application settings.

**Authentication**: Required (session or API key with SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ❌ Unauthorized
- **SUPER_ADMIN**: ✅ Full access

#### Usage Case 1: Successful Settings Retrieval (SUPER_ADMIN)

**Scenario**: SUPER_ADMIN user retrieves global settings

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/settings" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "id": "global",
  "enableRegistration": false,
  "enableRenamingSelfServicePage": false,
  "enableRenamingDeviceManagementPage": true,
  "allowedNetworks": [
    {
      "id": "network-uuid-1",
      "type": "include",
      "network": "192.168.1.0/24",
      "description": "Home Network"
    }
  ],
  "customLucideIcons": [],
  "customEmojis": [],
  "customFlags": []
}
```

#### Usage Case 2: Unauthorized Access (USER/ADMIN)

**Scenario**: Non-SUPER_ADMIN user attempts to access settings

**Error Response** (USER role):
```json
{
  "message": "Unauthorized"
}
```

**Error Response** (ADMIN role):
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

**Scenario**: Database or server error during settings retrieval

**Error Response**:
```json
{
  "message": "Failed to fetch settings"
}
```

**Response Fields**:
- `id`: Settings identifier
- `enableRegistration`: Whether user registration is enabled
- `enableRenamingSelfServicePage`: Whether self-service page renaming is enabled
- `enableRenamingDeviceManagementPage`: Whether device management page renaming is enabled
- `allowedNetworks`: Array of network configurations for self-service access
  - `id`: Network configuration identifier
  - `type`: Network type (`include`, `exclude`)
  - `network`: CIDR network range
  - `description`: Network description
- `customLucideIcons`: Custom icon configurations
- `customEmojis`: Custom emoji configurations
- `customFlags`: Custom flag configurations

### PUT /api/settings

**Description**: Update global application settings.

**Authentication**: Required (session or API key with SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ❌ Unauthorized
- **SUPER_ADMIN**: ✅ Full access

#### Usage Case 1: Successful Settings Update (SUPER_ADMIN)

**Scenario**: SUPER_ADMIN user updates global settings

**Example Request**:
```bash
curl -X PUT "{{SERVER_URL}}/api/settings" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "enableRegistration": true,
    "enableRenamingSelfServicePage": true,
    "enableRenamingDeviceManagementPage": false,
    "allowedNetworks": [
      {
        "type": "include",
        "network": "192.168.1.0/24",
        "description": "Home Network"
      }
    ]
  }'
```

**Success Response**:
```json
{
  "id": "global",
  "enableRegistration": true,
  "enableRenamingSelfServicePage": true,
  "enableRenamingDeviceManagementPage": false,
  "allowedNetworks": [
    {
      "type": "include",
      "network": "192.168.1.0/24",
      "description": "Home Network"
    }
  ],
  "customLucideIcons": [],
  "customEmojis": [],
  "customFlags": []
}
```

**Cache Invalidation**: This endpoint automatically updates the `lastModified` timestamp in the GlobalSettings table, which invalidates any cached permissions. This ensures that changes to global settings (including IP allow/exclude lists) are immediately reflected in the user interface after cache expiration.

#### Usage Case 2: Unauthorized Update Attempt

**Scenario**: Non-SUPER_ADMIN user attempts to update settings

**Error Response**:
```json
{
  "message": "Unauthorized"
}
```

#### Usage Case 3: Network Validation Error

**Scenario**: Invalid network configuration in request

**Example Request** (with invalid CIDR):
```bash
curl -X PUT "{{SERVER_URL}}/api/settings" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "allowedNetworks": [
      {
        "type": "include",
        "network": "192.168.1.0/99",
        "description": "Invalid Network"
      }
    ]
  }'
```

**Error Response**:
```json
{
  "error": "Failed to save global settings"
}
```

#### Usage Case 4: Server Error During Update

**Scenario**: Database error during settings update

**Error Response**:
```json
{
  "error": "Failed to save global settings"
}
```

### POST /api/settings/global

**Description**: Update global application settings (alternative endpoint to PUT).

**Authentication**: Required (session or API key with SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ❌ Unauthorized
- **SUPER_ADMIN**: ✅ Full access

#### Usage Case 1: Enable Global Self-Service Disable

**Scenario**: SUPER_ADMIN user disables self-service functionality for enhanced security

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/settings/global" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "removeSelfServicePage": true
  }'
```

**Success Response**:
```json
{
  "message": "Global settings saved successfully"
}
```

**Cache Invalidation**: This endpoint automatically updates the `lastModified` timestamp in the GlobalSettings table, which invalidates any cached permissions. This ensures that changes to global settings (including IP allow/exclude lists) are immediately reflected in the user interface after cache expiration.

**Security Impact**: When `removeSelfServicePage` is set to `true`:
- All self-service functionality is disabled
- Unauthenticated APIs (like `/api/opnsense/ip-group-membership`) return 403 Forbidden
- Authenticated users are redirected to device management instead of self-service
- Authenticated users are redirected to device management instead of self-service
- Header menu updates automatically within 1 hour (or immediately if cache is cleared)

**Side Effects**: Updating certain fields triggers background service actions:
- `enableMacTracking`: Toggling this field automatically starts or stops the MAC tracking background service.
- `macTrackingInterval`: Updating this field restarts the MAC tracking service with the new interval.
- `enableAdvancedAnalytics`: Toggling this field automatically starts or stops the usage aggregation background service.

#### Usage Case 2: Configure Group Types with Refresh Requirement

**Scenario**: SUPER_ADMIN user enables group types functionality

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/settings/global" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "enableGroupTypes": true,
    "enableSelfServiceMultiSelect": false,
    "singleSelectName": "VPN Group",
    "multiSelectName": "Service Groups"
  }'
```

**Success Response**:
```json
{
  "message": "Global settings updated successfully",
  "settings": {
    "enableRegistration": false,
    "removeSelfServicePage": false,
    "enableGroupTypes": true,
    "enableSelfServiceMultiSelect": false,
    "singleSelectName": "VPN Group",
    "multiSelectName": "Service Groups",
    "singleSelectIcon": "DEFAULT",
    "multiSelectIcon": "DEFAULT"
  }
}
```

**UI Impact**: Changes to `enableGroupTypes` or `enableSelfServiceMultiSelect` require a page refresh to update the group selection interface and user experience.

#### Usage Case 3: Configure Application Subtitle

**Scenario**: SUPER_ADMIN user configures a custom subtitle for instance identification

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/settings/global" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "enableApplicationSubtitle": true,
    "subtitleText": "Production Environment"
  }'
```

**Success Response**:
```json
{
  "message": "Global settings updated successfully",
  "data": {
    "enableApplicationSubtitle": true,
    "subtitleText": "Production Environment"
  }
}
```

**Real-time Effect**: The subtitle "Production Environment" appears immediately below "InstradaOGM" in the header without requiring a page refresh.

**Common Subtitle Examples**:
- `"New York Office"` - Geographic location
- `"IT Department"` - Organizational unit
- `"Testing Lab"` - Environment identifier
- `"Customer Portal"` - Project instance

#### Usage Case 4: Update Data Retention Settings

**Scenario**: SUPER_ADMIN user configures automated cleanup retention periods

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/settings/global" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "logsAnalyticsRetentionDays": 30,
    "macDataRetentionDays": 60
  }'
```

**Success Response**:
```json
{
  "message": "Global settings updated successfully",
  "settings": {
    "logsAnalyticsRetentionDays": 30,
    "macDataRetentionDays": 60
  }
}
```

**Audit Logging**: This action generates audit log entries:
- `updateLogsAnalyticsRetention`: Records change to logs/analytics retention period
- `updateMacDataRetention`: Records change to MAC tracking retention period

**Cleanup Impact**:
- Changes take effect immediately for future cleanup operations
- Next scheduled cleanup (daily at 2:00 AM) will use the new retention periods
- Existing data older than the new retention period will be removed in the next cleanup cycle

## Group Filter Management

### GET /api/settings/group-filters

**Description**: Retrieve all group-specific filters and their configurations.

**Authentication**: Required (session or API key with ADMIN or SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ✅ Full access
- **SUPER_ADMIN**: ✅ Full access

#### Usage Case 1: Successful Filter Retrieval (ADMIN/SUPER_ADMIN)

**Scenario**: Admin user retrieves group filters

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/settings/group-filters" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
[
  {
    "id": "filter-uuid-1",
    "pattern": "^G_DEVICES_.*(OV|WG)$",
    "description": "VPN Device Groups",
    "type": "include",
    "createdAt": "2024-01-01T12:00:00Z",
    "updatedAt": "2024-01-01T12:00:00Z"
  },
  {
    "id": "filter-uuid-2",
    "pattern": "^G_ADMIN_.*$",
    "description": "Admin Groups",
    "type": "exclude",
    "createdAt": "2024-01-01T12:00:00Z",
    "updatedAt": "2024-01-01T12:00:00Z"
  }
]
```

#### Usage Case 2: Unauthorized Access (USER)

**Scenario**: USER role attempts to access group filters

**Error Response**:
```json
{
  "error": "Forbidden: Admin privileges required to access group filters"
}
```

#### Usage Case 3: Unauthenticated Access

**Scenario**: Request without valid authentication

**Error Response**:
```json
{
  "error": "Unauthorized: Authentication required to access group filters"
}
```

### POST /api/settings/group-filters

**Description**: Update group filter configurations (replaces all existing filters).

**Authentication**: Required (session or API key with ADMIN or SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ✅ Full access
- **SUPER_ADMIN**: ✅ Full access

#### Usage Case 1: Successful Filter Update (ADMIN/SUPER_ADMIN)

**Scenario**: Admin user updates group filter configurations

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/settings/group-filters" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "pattern": "^G_DEVICES_.*(OV|WG)$",
      "description": "VPN Device Groups",
      "type": "include"
    },
    {
      "pattern": "^G_ADMIN_.*$",
      "description": "Admin Groups",
      "type": "exclude"
    }
  ]'
```

**Success Response**:
```json
{
  "message": "Settings applied successfully"
}
```

#### Usage Case 2: Invalid Filter Format

**Scenario**: Request with invalid filter structure

**Example Request** (missing required fields):
```bash
curl -X POST "{{SERVER_URL}}/api/settings/group-filters" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "pattern": "^G_DEVICES_.*$"
    }
  ]'
```

**Error Response**:
```json
{
  "error": "Invalid filter object: {\"pattern\":\"^G_DEVICES_.*$\"}"
}
```

#### Usage Case 3: Invalid Input Type

**Scenario**: Request with non-array input

**Error Response**:
```json
{
  "error": "Invalid input: Expected an array of filters."
}
```

#### Usage Case 4: Unauthorized Access

**Scenario**: USER role attempts to modify filters

**Error Response**:
```json
{
  "error": "Forbidden: Admin privileges required to modify group filters"
}
```

#### Usage Case 5: Server Error

**Scenario**: Database error during filter update

**Error Response**:
```json
{
  "error": "Failed to Save Settings"
}
```

## OPNsense Group Display Settings

### GET /api/settings/opnsense-group-display

**Description**: Retrieve OPNsense group display mappings (friendly names, icons, and group types).

**Authentication**: Required (session or API key with ADMIN or SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ✅ Full access
- **SUPER_ADMIN**: ✅ Full access

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/settings/opnsense-group-display" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
[
  {
    "id": "clm123abc456",
    "opnsenseUuid": "group-uuid-1",
    "friendlyName": "VPN Users",
    "iconIdentifier": "Shield",
    "groupType": "SingleSelect",
    "createdAt": "2024-01-01T12:00:00Z",
    "updatedAt": "2024-01-01T12:00:00Z"
  },
  {
    "id": "clm789def012",
    "opnsenseUuid": "group-uuid-2",
    "friendlyName": "Multi-Access Group",
    "iconIdentifier": "🌐",
    "groupType": "MultiSelect",
    "createdAt": "2024-01-01T12:00:00Z",
    "updatedAt": "2024-01-01T12:00:00Z"
  }
]
```

### POST /api/settings/opnsense-group-display

**Description**: Update OPNsense group display mappings (friendly names, icons, and group types).

**Authentication**: Required (session or API key with SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ❌ Unauthorized
- **SUPER_ADMIN**: ✅ Full access

**Request Body**: Array of OpnsenseGroupDisplay objects

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/settings/opnsense-group-display" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "opnsenseUuid": "group-uuid-1",
      "friendlyName": "VPN Users",
      "iconIdentifier": "Shield",
      "groupType": "SingleSelect"
    },
    {
      "opnsenseUuid": "group-uuid-2",
      "friendlyName": "Multi-Access Group",
      "iconIdentifier": "🌐",
      "groupType": "MultiSelect"
    }
  ]'
```

**Example Response**:
```json
{
  "success": true,
  "message": "OPNsense group display settings updated successfully",
  "updatedCount": 2
}
```

**Group Type Behavior**:
- **SingleSelect**: When assigning a host alias to this group, it will be moved from any other SingleSelect groups (traditional behavior)
- **MultiSelect**: When assigning a host alias to this group, it will be added without removing from other groups (additive behavior)

## Backup Management

### GET /api/settings/backup

**Description**: Retrieve backup configuration and status.

**Authentication**: Required (session or API key with SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ❌ Unauthorized
- **SUPER_ADMIN**: ✅ Full access

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/settings/backup" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
{
  "enabled": true,
  "schedule": "daily",
  "retention": 30,
  "lastBackup": "2024-01-01T12:00:00Z",
  "nextBackup": "2024-01-02T12:00:00Z",
  "backupLocation": "/backups"
}
```

### POST /api/settings/backup

**Description**: Create a new database backup with optional custom filename.

**Authentication**: Required (session or API key with SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ❌ Unauthorized
- **SUPER_ADMIN**: ✅ Full access

**Request Parameters**:
- `action` (string, optional): Set to "backup" for backup creation (default behavior)
- `filename` (string, optional): Custom filename for the backup (without extension)

**Example Request (Default filename)**:
```bash
curl -X POST "{{SERVER_URL}}/api/settings/backup" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -F "action=backup"
```

**Example Request (Custom filename)**:
```bash
curl -X POST "{{SERVER_URL}}/api/settings/backup" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -F "action=backup" \
  -F "filename=my_custom_backup"
```

**Example Response**:
```json
{
  "message": "Database backup created and stored successfully.",
  "filename": "my_custom_backup.sqlite.aes"
}
```

**Notes**:
- The system automatically adds the appropriate file extension (`.sqlite.aes` or `.mysql.aes`)
- If no filename is provided, a timestamp-based filename is generated
- Backups are encrypted and stored in the server's backup directory

### GET /api/settings/backup/versions

**Description**: Retrieve list of available backup versions.

**Authentication**: Required (session or API key with SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ❌ Unauthorized
- **SUPER_ADMIN**: ✅ Full access

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/settings/backup/versions" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
[
  {
    "name": "backup_2024_01_01_12_00_00_000Z.sqlite.aes",
    "size": 1024000,
    "lastModified": "2024-01-01T12:00:00.000Z"
  },
  {
    "name": "my_custom_backup.sqlite.aes",
    "size": 2048000,
    "lastModified": "2024-01-01T10:00:00.000Z"
  }
]
```

### GET /api/settings/backup/versions/[filename]

**Description**: Download a specific backup file.

**Authentication**: Required (session or API key with SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ❌ Unauthorized
- **SUPER_ADMIN**: ✅ Full access

**Path Parameters**:
- `filename` (string): The backup filename to download

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/settings/backup/versions/backup_2024_01_01_12_00_00_000Z.sqlite.aes" \
  -H "Authorization: Bearer {{API_KEY}}" \
  --output backup.aes
```

**Response**: Binary file download with appropriate headers for file download.

#### Usage Case 1: Successful Backup Download

**Scenario**: SUPER_ADMIN user downloads a specific backup file

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/settings/backup/versions/backup_2024_01_01_12_00_00_000Z.sqlite.aes" \
  -H "Authorization: Bearer {{API_KEY}}" \
  --output downloaded_backup.aes
```

**Response**: Binary file data with appropriate headers:
```
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="backup_2024_01_01_12_00_00_000Z.sqlite.aes"
Content-Length: 1024000
```

#### Usage Case 2: Unauthorized Access (USER/ADMIN)

**Scenario**: Non-SUPER_ADMIN user attempts to download backup

**Error Response**:
```json
{
  "error": "Forbidden: Super admin privileges required to access backup files"
}
```

#### Usage Case 3: File Not Found

**Scenario**: Requested backup file does not exist

**Error Response**:
```json
{
  "error": "Backup file not found"
}
```

#### Usage Case 4: Invalid Filename

**Scenario**: Filename contains invalid characters or path traversal

**Error Response**:
```json
{
  "error": "Invalid filename"
}
```

**Security Considerations**:
- Filename validation prevents directory traversal attacks
- Only SUPER_ADMIN role can access backup files
- All backup files are encrypted at rest
- Download operations are logged for audit purposes

### PATCH /api/settings/backup/versions/[filename]

**Description**: Rename an existing backup file.

**Authentication**: Required (session or API key with SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ❌ Unauthorized
- **SUPER_ADMIN**: ✅ Full access

**Path Parameters**:
- `filename` (string): The current backup filename to rename

**Request Body**:
```json
{
  "newFilename": "my_renamed_backup"
}
```

#### Usage Case 1: Successful Backup Rename

**Scenario**: SUPER_ADMIN user renames a backup file

**Example Request**:
```bash
curl -X PATCH "{{SERVER_URL}}/api/settings/backup/versions/backup_2024_01_01_12_00_00_000Z.sqlite.aes" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "newFilename": "my_renamed_backup"
  }'
```

**Success Response**:
```json
{
  "message": "Backup file renamed successfully.",
  "newFilename": "my_renamed_backup.sqlite.aes"
}
```

#### Usage Case 2: Unauthorized Access

**Scenario**: Non-SUPER_ADMIN user attempts to rename backup

**Error Response**:
```json
{
  "error": "Forbidden: Super admin privileges required to modify backup files"
}
```

#### Usage Case 3: File Already Exists

**Scenario**: Target filename already exists

**Error Response**:
```json
{
  "error": "A backup with this name already exists."
}
```

#### Usage Case 4: Original File Not Found

**Scenario**: Source backup file does not exist

**Error Response**:
```json
{
  "error": "Original backup file not found."
}
```

#### Usage Case 5: Invalid Filename

**Scenario**: New filename contains invalid characters

**Error Response**:
```json
{
  "error": "Invalid filename."
}
```

**Security Considerations**:
- Filename validation prevents directory traversal and invalid characters
- The system automatically maintains the correct file extension (`.sqlite.aes` or `.mysql.aes`)
- The operation is atomic - if renaming fails, the original file remains unchanged
- All rename operations are logged for audit purposes

### DELETE /api/settings/backup/versions/[filename]

**Description**: Delete a specific backup file.

**Authentication**: Required (session or API key with SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ❌ Unauthorized
- **SUPER_ADMIN**: ✅ Full access

**Path Parameters**:
- `filename` (string): The backup filename to delete

#### Usage Case 1: Successful Backup Deletion

**Scenario**: SUPER_ADMIN user deletes a backup file

**Example Request**:
```bash
curl -X DELETE "{{SERVER_URL}}/api/settings/backup/versions/backup_2024_01_01_12_00_00_000Z.sqlite.aes" \
  -H "Authorization: Bearer {{API_KEY}}"
```

**Success Response**:
```json
{
  "message": "Backup file backup_2024_01_01_12_00_00_000Z.sqlite.aes deleted successfully."
}
```

#### Usage Case 2: Unauthorized Access

**Scenario**: Non-SUPER_ADMIN user attempts to delete backup

**Error Response**:
```json
{
  "error": "Forbidden: Super admin privileges required to delete backup files"
}
```

#### Usage Case 3: File Not Found

**Scenario**: Requested backup file does not exist

**Error Response**:
```json
{
  "error": "File not found."
}
```

#### Usage Case 4: Invalid Filename

**Scenario**: Filename contains invalid characters or path traversal

**Error Response**:
```json
{
  "error": "Invalid filename"
}
```

**Security Considerations**:
- Filename validation prevents directory traversal attacks
- Only SUPER_ADMIN role can delete backup files
- Deletion operations are irreversible and logged for audit purposes
- System validates file existence before attempting deletion

### POST /api/settings/backup/versions

**Description**: Upload a backup file to the server.

**Authentication**: Required (session or API key with SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ❌ Unauthorized
- **SUPER_ADMIN**: ✅ Full access

**Request**: Multipart form data with file upload

#### Usage Case 1: Successful Backup Upload

**Scenario**: SUPER_ADMIN user uploads a backup file

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/settings/backup/versions" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -F "file=@backup.aes"
```

**Success Response**:
```json
{
  "message": "Backup file uploaded successfully.",
  "filename": "backup_2024_01_01_12_00_00_000Z.sqlite.aes"
}
```

#### Usage Case 2: Unauthorized Access

**Scenario**: Non-SUPER_ADMIN user attempts to upload backup

**Error Response**:
```json
{
  "error": "Forbidden: Super admin privileges required to upload backup files"
}
```

#### Usage Case 3: Invalid File Format

**Scenario**: Uploaded file is not a valid backup format

**Error Response**:
```json
{
  "error": "Invalid backup file format"
}
```

#### Usage Case 4: File Too Large

**Scenario**: Uploaded file exceeds size limits

**Error Response**:
```json
{
  "error": "File size exceeds maximum allowed limit"
}
```

#### Usage Case 5: Missing File

**Scenario**: Request without file attachment

**Error Response**:
```json
{
  "error": "No file provided"
}
```

**Security Considerations**:
- File type validation ensures only valid backup formats are accepted
- File size limits prevent storage exhaustion
- All uploaded files are scanned for malware
- Upload operations are logged for audit purposes
- Files are stored with appropriate permissions in secure backup directory

## OIDC Provider Management

### GET /api/settings/oidc-providers

**Description**: Retrieve OIDC provider configurations (public endpoint).

**Authentication**: Not required

**Role Access:**
- **Unauthenticated**: ✅ Can access public provider information
- **USER**: ✅ Can access public provider information
- **ADMIN**: ✅ Can access public provider information
- **SUPER_ADMIN**: ✅ Can access public provider information

#### Usage Case 1: Successful Provider Retrieval

**Scenario**: Retrieve public OIDC provider information

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/settings/oidc-providers" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
[
  {
    "id": "AUTHENTIK",
    "name": "Authentik",
    "issuer": "https://authentik.example.com/application/o/InstradaOGM/"
  },
  {
    "id": "MICROSOFT",
    "name": "Microsoft Entra ID",
    "issuer": "https://login.microsoftonline.com/tenant-id/v2.0"
  }
]
```

#### Usage Case 2: No Providers Configured

**Scenario**: No OIDC providers are configured

**Success Response**:
```json
[]
```

#### Usage Case 3: Server Error

**Scenario**: Error loading provider configurations

**Error Response**:
```json
{
  "message": "Internal server error"
}
```

**Response Fields**:
- `id`: Provider identifier (alias)
- `name`: Display name for the provider
- `issuer`: OIDC issuer URL

**Note**: This endpoint only returns public information. Sensitive details like client secrets are not exposed.

## Global Full Settings

### GET /api/settings/global-full

**Description**: Retrieve complete global settings with full administrative data.

**Authentication**: Required (session or API key with ADMIN or SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ✅ Full access
- **SUPER_ADMIN**: ✅ Full access

#### Usage Case 1: Successful Admin Access

**Scenario**: Admin user retrieves complete global settings

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/settings/global-full" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "enableRegistration": false,
  "enableRenamingSelfServicePage": false,
  "enableRenamingDeviceManagementPage": true,
  "allowedNetworks": [
    {
      "id": "1748939424923",
      "type": "include",
      "network": "192.168.1.0/24",
      "createdAt": "2025-06-03T08:30:24.923Z",
      "updatedAt": "2025-06-03T08:30:24.923Z",
      "description": "Home"
    }
  ],
  "isSelfServiceAllowed": true,
  "customLucideIcons": [],
  "customEmojis": [],
  "customFlags": [],
  "enableAdvancedAnalytics": false,
  "logsAnalyticsRetentionDays": 90,
  "enableMacTracking": false,
  "macTrackingInterval": 5,
  "macInactiveTimeout": 1440,
  "macDataRetentionDays": 90
}
```

#### Usage Case 2: Unauthorized Access (USER)

**Scenario**: USER role attempts to access full settings

**Error Response**:
```json
{
  "error": "Insufficient permissions"
}
```

#### Usage Case 3: Unauthenticated Access

**Scenario**: Request without valid authentication

**Error Response**:
```json
{
  "error": "Authentication required"
}
```

## Global Public Settings

### GET /api/settings/global-public

**Description**: Retrieve public global settings accessible without authentication.

**Authentication**: Not required

**Role Access:**
- **Unauthenticated**: ✅ Can access public settings
- **USER**: ✅ Can access public settings
- **ADMIN**: ✅ Can access public settings
- **SUPER_ADMIN**: ✅ Can access public settings

#### Usage Case 1: Successful Public Access

**Scenario**: Unauthenticated user retrieves public global settings

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/settings/global-public" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "enableRegistration": false,
  "enableRenamingSelfServicePage": false,
  "enableRenamingDeviceManagementPage": true,
  "enableGroupTypes": false,
  "enableSelfServiceMultiSelect": true,
  "singleSelectName": "Primary Group",
  "multiSelectName": "Additional Groups",
  "enableApplicationSubtitle": false,
  "subtitleText": null,
  "enableAdvancedAnalytics": false,
  "enableMacTracking": false
}
```

#### Usage Case 2: Server Error

**Scenario**: Error retrieving public settings

**Error Response**:
```json
{
  "message": "Failed to fetch public settings"
}
```

**Security Note**: This endpoint only returns non-sensitive configuration settings that are safe to expose to unauthenticated users. Administrative settings, network configurations, and security parameters are excluded.

## UI Configuration

### GET /api/ui/config

**Description**: Retrieve UI configuration settings with authentication-aware responses.

**Authentication**: Not required (but behavior changes based on authentication status)

**Role Access:**
- **USER**: ✅ Full access (custom organizational labels)
- **ADMIN**: ✅ Full access (custom organizational labels)
- **SUPER_ADMIN**: ✅ Full access (custom organizational labels)
- **Unauthenticated**: ✅ Full access (generic security labels)

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/ui/config" \
  -H "Content-Type: application/json"
```

**Example Response (Unauthenticated)**:
```json
{
  "groupTypesEnabled": true,
  "selfServiceMultiSelectEnabled": true,
  "assignmentMode": "smart",
  "selfServiceEnabled": true,
  "registrationEnabled": false,
  "selfServiceRenamingEnabled": true,
  "deviceManagementRenamingEnabled": true,
  "groupTypeConfig": {
    "showTypeIndicators": true,
    "singleSelectLabel": "Primary Group",
    "multiSelectLabel": "Additional Groups",
    "singleSelectIcon": "dot",
    "multiSelectIcon": "dots"
  }
}
```

**Example Response (Authenticated)**:
```json
{
  "groupTypesEnabled": true,
  "selfServiceMultiSelectEnabled": true,
  "assignmentMode": "smart",
  "selfServiceEnabled": true,
  "registrationEnabled": false,
  "selfServiceRenamingEnabled": true,
  "deviceManagementRenamingEnabled": true,
  "groupTypeConfig": {
    "showTypeIndicators": true,
    "singleSelectLabel": "Single Select Custom",
    "multiSelectLabel": "Multi Select Custom",
    "singleSelectIcon": "DEFAULT",
    "multiSelectIcon": "DEFAULT"
  }
}
```

## Response Fields

### Global Settings Fields
- `enableRegistration`: Whether user registration is enabled
- `enableRenamingSelfServicePage`: Whether self-service page renaming is enabled
- `enableRenamingDeviceManagementPage`: Whether device management page renaming is enabled
- `removeSelfServicePage`: Whether self-service functionality is globally disabled (security feature)
  - **Default**: `false` (self-service enabled)
  - **Security Impact**: When `true`, completely disables self-service functionality
  - **API Impact**: Disables unauthenticated APIs like `/api/opnsense/ip-group-membership`
  - **Routing Impact**: Redirects authenticated users to device management instead of self-service
  - **Refresh Required**: Page refresh needed after changes to update menu and routing
- `enableGroupTypes`: Whether dual group type functionality (SingleSelect/MultiSelect) is enabled
  - **Default**: `false` (move-only single-select behavior)
  - **Refresh Required**: Page refresh needed after changes to update UI components
- `enableSelfServiceMultiSelect`: Whether multi-select functionality is available in self-service
  - **Default**: `true` (multi-select enabled when group types are enabled)
  - **Refresh Required**: Page refresh needed after changes to update group selection interface
- `allowedNetworks`: Array of allowed network configurations for self-service operations
- `customLucideIcons`: Array of custom Lucide icons
- `customEmojis`: Array of custom emojis
- `customFlags`: Array of custom flags
- `enableApplicationSubtitle`: Whether application subtitle is enabled
  - **Default**: `false` (subtitle disabled)
  - **Real-time Updates**: Changes appear immediately without page refresh
- `subtitleText`: Custom subtitle text displayed below the main application title
  - **Type**: `string` or `null`
  - **Usage**: Instance identification, environment labeling, organizational units
  - **Display**: Appears centered below "InstradaOGM" when enabled
- `enableAdvancedAnalytics`: Whether advanced analytics (session tracking, performance monitoring) is enabled
  - **Default**: `false` (analytics disabled)
  - **Real-time Updates**: Changes appear immediately without page refresh
- `logsAnalyticsRetentionDays`: Number of days to retain logs and analytics data before automatic cleanup
  - **Type**: `number`
  - **Range**: 1-365 days
  - **Default**: 90 days
  - **Cleanup Schedule**: Automatic cleanup runs daily at 2:00 AM
  - **Data Types**: Affects audit logs, API key usage events/stats, session usage events/stats
  - **Validation**: API validates range (1-365), UI input field enforces same limits
- `enableMacTracking`: Whether MAC address tracking is enabled
  - **Default**: `false` (MAC tracking disabled)
- `macTrackingInterval`: ARP scan interval in minutes for MAC address tracking
  - **Type**: `number`
  - **Range**: 1-1440 minutes
  - **Default**: 5 minutes
- `macInactiveTimeout`: Minutes after which MAC addresses are marked as inactive
  - **Type**: `number`
  - **Range**: 60-10080 minutes (1 minute to 7 days)
  - **Default**: 1440 minutes (24 hours)
- `macDataRetentionDays`: Number of days to retain MAC tracking data before automatic cleanup
  - **Type**: `number`
  - **Range**: 1-365 days
  - **Default**: 90 days
  - **Cleanup Schedule**: Automatic cleanup runs daily at 2:00 AM (same as logs/analytics)

**Security Note**: When `removeSelfServicePage` is set to `true`, all self-service functionality is completely disabled, including unauthenticated API access and the self-service page itself. This provides an additional security layer for environments that don't require end-user self-service capabilities.

**Refresh Requirements**: Changes to `removeSelfServicePage`, `enableGroupTypes`, or `enableSelfServiceMultiSelect` require a full page refresh to properly update the application's menu structure, routing behavior, and UI components.

**Automated Cleanup System**: The application includes automated cleanup services for both logs/analytics and MAC tracking data:
- **Schedule**: Both cleanup services run daily at 2:00 AM
- **Logs/Analytics Cleanup**: Removes audit logs, API key usage events/stats, and session usage events/stats older than `logsAnalyticsRetentionDays`
- **MAC Tracking Cleanup**: Removes MAC address tracking data older than `macDataRetentionDays`
- **Service Independence**: Cleanup services run independently of their respective feature toggles (analytics/MAC tracking can be disabled but cleanup still runs)
- **Transaction Safety**: All cleanup operations use database transactions to ensure data integrity
- **Logging**: Cleanup operations are logged with details about records removed

### Group Filter Fields
- `id`: Unique filter identifier
- `groupId`: Associated group ID
- `name`: Filter name
- `type`: Filter type (network, hostname, etc.)
- `value`: Filter value
- `enabled`: Whether filter is active (default: true)

### Backup Fields
- `name`: Backup filename (includes extension, e.g., "backup_2024_01_01.sqlite.aes")
- `size`: Backup file size in bytes
- `lastModified`: ISO timestamp of when the backup was last modified

## Error Responses

### 400 Bad Request

**Invalid Filter Format**:
```json
{
  "error": "Invalid filter object: {\"pattern\":\"^G_DEVICES_.*$\"}"
}
```

**Invalid Input Type**:
```json
{
  "error": "Invalid input: Expected an array of filters."
}
```

**Invalid Retention Days Range**:
```json
{
  "error": "Logs and analytics retention days must be between 1 and 365"
}
```

### 401 Unauthorized

**Authentication Required**:
```json
{
  "error": "Unauthorized: Authentication required to access global settings"
}
```

**Group Filters Authentication**:
```json
{
  "error": "Unauthorized: Authentication required to access group filters"
}
```

**General Unauthorized**:
```json
{
  "message": "Unauthorized"
}
```

### 403 Forbidden

**Super Admin Required**:
```json
{
  "error": "Forbidden: Super admin privileges required to access global settings"
}
```

**Admin Required (Group Filters)**:
```json
{
  "error": "Forbidden: Admin privileges required to access group filters"
}
```

**Admin Required (Modify Filters)**:
```json
{
  "error": "Forbidden: Admin privileges required to modify group filters"
}
```

**Insufficient Permissions**:
```json
{
  "error": "Insufficient permissions"
}
```

### 500 Internal Server Error

**Settings Fetch Error**:
```json
{
  "message": "Failed to fetch settings"
}
```

**Settings Save Error**:
```json
{
  "error": "Failed to save global settings"
}
```

**Filter Save Error**:
```json
{
  "error": "Failed to Save Settings"
}
```

**Global Settings Fetch Error**:
```json
{
  "error": "Failed to fetch global settings"
}
```

**OIDC Provider Error**:
```json
{
  "message": "Internal server error"
}
```

## Notes

### Authentication Patterns

1. **SUPER_ADMIN Only**: Global settings endpoints require SUPER_ADMIN role
2. **ADMIN/SUPER_ADMIN**: Group filters and OPNsense display settings allow both roles
3. **Public Access**: OIDC providers and global-public endpoints are publicly accessible
4. **IP-Based Validation**: Some settings consider client IP for self-service determination

### Settings Validation

1. **Network Validation**: CIDR ranges are validated for proper format
2. **Filter Validation**: Group filter patterns must include required fields (pattern, type)
3. **Type Validation**: Filter types must be 'include' or 'exclude'
4. **Array Validation**: Group filter updates expect array input

### Security Considerations

1. **Sensitive Data**: Client secrets and internal configurations are not exposed in public endpoints
2. **Audit Logging**: Settings changes are logged for security monitoring
3. **Role Enforcement**: Strict role-based access control prevents unauthorized modifications
4. **Input Sanitization**: All input is validated before processing

### Error Handling

1. **Consistent Format**: All errors follow standard JSON error response format
2. **Specific Messages**: Different error messages for different failure scenarios
3. **Status Codes**: Appropriate HTTP status codes for different error types
4. **Graceful Degradation**: Public endpoints continue to work even if some features fail

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