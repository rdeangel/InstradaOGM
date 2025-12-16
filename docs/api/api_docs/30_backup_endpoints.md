# Backup API

This guide provides complete API calls for creating and downloading backup files in the InstradaOGM system.

## Overview

The backup system allows SUPER_ADMIN users to:
- Create encrypted database backups with custom or default filenames
- Download existing backup files
- List available backup versions

## Authentication

All backup operations require:
- **Role**: SUPER_ADMIN only
- **Authentication**: API key or session-based authentication

### Security Policy

**⚠️ Important Restore Restriction:**

For security reasons, **database restore operations are only allowed via web session authentication**:
- ✅ **Backup Creation**: Allowed via API key or web session
- ✅ **Backup Download**: Allowed via API key or web session
- ✅ **Backup List/Rename/Delete**: Allowed via API key or web session
- ❌ **Backup Restore**: **Only allowed via web session** (API keys are blocked)

This prevents unauthorized database restoration via compromised API keys. Users must authenticate through the web interface to restore backups.

## 1. Create Backup

### Endpoint
`POST /api/settings/backup`

### Option A: Create backup with default prefix (instrada-ogm)
```bash
curl -X POST "https://your-server.com/api/settings/backup" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "action=backup"
```

**Response:**
```json
{
  "message": "Database backup created and stored successfully.",
  "filename": "instrada-ogm_2025_11_21T10_56_58_839Z.sqlite.aes"
}
```

### Option B: Create backup with prefix + auto-generated timestamp
```bash
curl -X POST "https://your-server.com/api/settings/backup" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "action=backup" \
  -F "filename=daily"
```

**Response:**
```json
{
  "message": "Database backup created and stored successfully.",
  "filename": "daily_2025_11_21T10_56_58_839Z.sqlite.aes"
}
```

### Option C: Create backup with specific filename (no timestamp)
```bash
curl -X POST "https://your-server.com/api/settings/backup" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "action=backup" \
  -F "filename=pre_update_backup.sqlite.aes"
```

**Response:**
```json
{
  "message": "Database backup created and stored successfully.",
  "filename": "pre_update_backup.sqlite.aes"
}
```

### Parameters
- `action` (string, optional): Set to "backup" for backup creation (default behavior)
- `filename` (string, optional): Backup filename. Behavior depends on format:
  - **Without extension** (e.g., `daily`, `weekly`): Treated as prefix, timestamp is auto-added
  - **With `.aes` extension** (e.g., `backup.sqlite.aes`): Used as-is, no timestamp added

### Notes
- The system automatically adds the appropriate file extension (`.sqlite.aes` or `.postgresql.aes`) when no extension is provided
- Backup files are encrypted at rest
- Supports both SQLite and PostgreSQL databases
- Timestamp format: `YYYY_MM_DDTHH_MM_SS_SSSZ` (ISO 8601 with underscores)

## 2. Download Backup

### Endpoint
`GET /api/settings/backup/versions/[filename]`

### Basic Download
```bash
curl -X GET "https://your-server.com/api/settings/backup/versions/my_custom_backup.sqlite.aes" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  --output downloaded_backup.aes
```

### Download with Session Authentication
```bash
curl -X GET "https://your-server.com/api/settings/backup/versions/backup_2024_01_01_12_00_00_000Z.sqlite.aes" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  --output downloaded_backup.aes
```

### Parameters
- `filename` (string): The backup filename to download

### Response
- Binary file download with appropriate headers:
  - `Content-Type: application/octet-stream`
  - `Content-Disposition: attachment; filename="filename.aes"`

### Security Features
- Directory traversal protection
- SUPER_ADMIN role verification
- File existence validation
- Access logging for audit purposes

## 3. List Available Backups

### Endpoint
`GET /api/settings/backup/versions`

### Request with API Key
```bash
curl -X GET "https://your-server.com/api/settings/backup/versions" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Request with Session Authentication
```bash
curl -X GET "https://your-server.com/api/settings/backup/versions" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN"
```

### Response Example
```json
[
  {
    "name": "backup_2025_11_21T10_56_58_839Z.sqlite.aes",
    "size": 1024000,
    "lastModified": "2025-11-21T10:56:58.839Z"
  },
  {
    "name": "daily_2025_11_21T10_30_00_000Z.postgresql.aes",
    "size": 2048000,
    "lastModified": "2025-11-21T10:30:00.000Z"
  },
  {
    "name": "my_custom_backup.sqlite.aes",
    "size": 3072000,
    "lastModified": "2025-11-20T15:45:30.000Z"
  }
]
```

### Response Fields
- `name` (string): The backup filename
- `size` (number): File size in bytes
- `lastModified` (string): ISO 8601 timestamp of last modification

### Security Features
- Directory traversal protection
- SUPER_ADMIN role verification
- Rate limiting applied
- Access logging for audit purposes

## 4. Rename Backup

### Endpoint
`PATCH /api/settings/backup/versions/[filename]`

### Request
```bash
curl -X PATCH "https://your-server.com/api/settings/backup/versions/backup_2025_11_21T10_56_58_839Z.sqlite.aes" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"newFilename": "pre_update_backup"}'
```

### Response
```json
{
  "message": "Backup file renamed successfully.",
  "oldFilename": "backup_2025_11_21T10_56_58_839Z.sqlite.aes",
  "newFilename": "pre_update_backup.sqlite.aes"
}
```

### Parameters
- `newFilename` (string): New filename for the backup. Behavior depends on format:
  - **Without extension** (e.g., `daily`, `weekly`): Treated as prefix, timestamp is auto-added
  - **With `.aes` extension** (e.g., `backup.sqlite.aes`): Used as-is, no timestamp added

## 5. Delete Backup

### Endpoint
`DELETE /api/settings/backup/versions/[filename]`

### Request
```bash
curl -X DELETE "https://your-server.com/api/settings/backup/versions/backup_2025_11_21T10_56_58_839Z.sqlite.aes" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Response
```json
{
  "message": "Backup file backup_2025_11_21T10_56_58_839Z.sqlite.aes deleted successfully."
}
```

## 6. Restore from Backup

### Endpoint
`POST /api/settings/backup` (with `action=restore`)

### ⚠️ Important Security Note
**Restore operations are ONLY allowed via web session authentication** (not API keys). This prevents unauthorized database restoration via compromised API keys.

### Restore Methods

The restore endpoint supports two methods:

#### Method A: Upload a Backup File
Upload a backup file from your local machine to restore.

#### Method B: Restore from Server Backup
Restore from an existing backup file already stored on the server.

### File Upload Requirements (Method A)
- **File Type**: Only `.aes` files are accepted
- **Maximum Size**: Up to 1GB (configured via NGINX `client_max_body_size`)
- **Upload Method**: Streaming (files are written directly to disk without loading into memory)
- **Validation**: Files are validated on both frontend and server-side

### Method A: Upload and Restore Backup File
```bash
curl -X POST "https://your-server.com/api/settings/backup" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -F "action=restore" \
  -F "file=@/path/to/backup.aes"
```

### Method B: Restore from Server Backup
```bash
curl -X POST "https://your-server.com/api/settings/backup" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -F "action=restore" \
  -F "filename=backup_2025_11_21T10_56_58_839Z.postgresql.aes"
```

### Response on Success
```json
{
  "message": "Database restored successfully."
}
```

### Error Responses

#### Invalid File Type
```json
{
  "error": "Invalid file type. Only .aes files are allowed."
}
```

#### Backup File Not Found (Method B)
```json
{
  "error": "Backup file not found or inaccessible: backup_2025_11_21T10_56_58_839Z.postgresql.aes"
}
```

#### Upload Interrupted (Network Error)
```json
{
  "error": "Upload interrupted. Please try again."
}
```

#### Malformed Upload Request
```json
{
  "error": "Failed to parse upload request. Please ensure you are uploading a valid .aes file."
}
```

#### Database Connection Error
```json
{
  "error": "Failed to restore database."
}
```

### Parameters
- `action` (string, required): Must be set to "restore"
- `file` (file, optional): The `.aes` backup file to restore (Method A)
- `filename` (string, optional): Name of existing backup file on server (Method B)

**Note**: Either `file` or `filename` must be provided, but not both.

### Database Restore Process

The restore operation performs the following steps:

1. **Disconnect Prisma**: Closes all application database connections (SQLite only)
2. **Terminate Active Connections** (PostgreSQL only): Terminates all active database sessions to allow database drop
3. **Drop Existing Database**: Removes the current database to ensure a clean restore
4. **Create Fresh Database**: Creates a new empty database
5. **Restore Backup**: Restores the backup data into the new database
6. **Reconnect Prisma**: Re-establishes application database connections
7. **Cleanup**: Removes temporary files created during restore

### Notes
- Partial/incomplete files are automatically cleaned up on error
- The restore process disconnects the database before restoration (SQLite only)
- All active database connections are terminated before dropping the database
- All restore operations are logged for audit purposes
- Temporary files are cleaned up after restore completes or fails
- Network disconnects are handled gracefully with automatic cleanup
- For PostgreSQL: The database is dropped and recreated to ensure a clean restore
- For SQLite: The database file is replaced with the restored backup

## Complete Workflow Examples

### Bash Script for Automated Backup and Download
```bash
#!/bin/bash

# Configuration
SERVER_URL="https://your-server.com"
API_KEY="YOUR_API_KEY"
BACKUP_NAME="daily_backup_$(date +%Y%m%d_%H%M%S)"

echo "Creating backup: $BACKUP_NAME"

# Step 1: Create backup
RESPONSE=$(curl -s -X POST "$SERVER_URL/api/settings/backup" \
  -H "Authorization: Bearer $API_KEY" \
  -F "action=backup" \
  -F "filename=$BACKUP_NAME")

# Extract filename from response
FILENAME=$(echo $RESPONSE | jq -r '.filename')

if [ "$FILENAME" = "null" ]; then
  echo "Error creating backup:"
  echo $RESPONSE
  exit 1
fi

echo "Backup created: $FILENAME"

# Step 2: Download backup
echo "Downloading backup..."
curl -X GET "$SERVER_URL/api/settings/backup/versions/$FILENAME" \
  -H "Authorization: Bearer $API_KEY" \
  --output "$FILENAME"

if [ $? -eq 0 ]; then
  echo "Backup downloaded successfully: $FILENAME"
  echo "File size: $(du -h "$FILENAME" | cut -f1)"
else
  echo "Error downloading backup"
  exit 1
fi
```

### Bash Script for Restore from Backup
```bash
#!/bin/bash

# Configuration
SERVER_URL="https://your-server.com"
SESSION_TOKEN="YOUR_SESSION_TOKEN"
BACKUP_FILE="backup_2025_11_21T10_56_58_839Z.sqlite.aes"

echo "Restoring from backup: $BACKUP_FILE"

# Restore backup (requires session authentication)
RESPONSE=$(curl -s -X POST "$SERVER_URL/api/settings/backup" \
  -H "Cookie: next-auth.session-token=$SESSION_TOKEN" \
  -F "action=restore" \
  -F "file=@$BACKUP_FILE")

# Check response
if echo "$RESPONSE" | jq -e '.message' > /dev/null 2>&1; then
  echo "Restore successful:"
  echo "$RESPONSE" | jq '.message'
else
  echo "Restore failed:"
  echo "$RESPONSE" | jq '.error'
  exit 1
fi
```

### Python Script for Backup Operations
```python
import requests
import json
from datetime import datetime

# Configuration
SERVER_URL = "https://your-server.com"
API_KEY = "YOUR_API_KEY"
HEADERS = {
    "Authorization": f"Bearer {API_KEY}"
}

def create_backup(custom_filename=None):
    """Create a new backup"""
    url = f"{SERVER_URL}/api/settings/backup"
    
    files = {"action": (None, "backup")}
    if custom_filename:
        files["filename"] = (None, custom_filename)
    
    response = requests.post(url, headers=HEADERS, files=files)
    response.raise_for_status()
    
    data = response.json()
    print(f"Backup created: {data['filename']}")
    return data['filename']

def download_backup(filename, output_path=None):
    """Download a backup file"""
    url = f"{SERVER_URL}/api/settings/backup/versions/{filename}"
    
    if not output_path:
        output_path = filename
    
    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()
    
    with open(output_path, 'wb') as f:
        f.write(response.content)
    
    print(f"Backup downloaded: {output_path}")
    return output_path

def list_backups():
    """List all available backups"""
    url = f"{SERVER_URL}/api/settings/backup/versions"
    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()

    backups = response.json()
    print("Available backups:")
    for backup in backups:
        print(f"  - {backup['name']} ({backup['size']} bytes, {backup['lastModified']})")

    return backups

def restore_backup_from_file(backup_file_path, session_token):
    """Restore database from uploaded backup file (requires session authentication)"""
    url = f"{SERVER_URL}/api/settings/backup"

    # Note: Restore requires session authentication, not API key
    headers = {
        "Cookie": f"next-auth.session-token={session_token}"
    }

    with open(backup_file_path, 'rb') as f:
        files = {
            "action": (None, "restore"),
            "file": (backup_file_path, f, "application/octet-stream")
        }
        response = requests.post(url, headers=headers, files=files)

    response.raise_for_status()

    data = response.json()
    print(f"Restore completed: {data.get('message', 'Success')}")
    return data

def restore_backup_from_server(backup_filename, session_token):
    """Restore database from existing server backup (requires session authentication)"""
    url = f"{SERVER_URL}/api/settings/backup"

    # Note: Restore requires session authentication, not API key
    headers = {
        "Cookie": f"next-auth.session-token={session_token}"
    }

    files = {
        "action": (None, "restore"),
        "filename": (None, backup_filename)
    }
    response = requests.post(url, headers=headers, files=files)

    response.raise_for_status()

    data = response.json()
    print(f"Restore completed: {data.get('message', 'Success')}")
    return data

# Example usage
if __name__ == "__main__":
    # List existing backups
    list_backups()

    # Create new backup with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"automated_backup_{timestamp}"

    # Create and download backup
    created_filename = create_backup(backup_filename)
    download_backup(created_filename)

    # Restore from uploaded backup file (requires session token)
    # restore_backup_from_file("path/to/backup.aes", "YOUR_SESSION_TOKEN")

    # Restore from existing server backup (requires session token)
    # restore_backup_from_server("backup_2025_11_21T10_56_58_839Z.postgresql.aes", "YOUR_SESSION_TOKEN")
```

## Error Handling

### Common Error Responses

#### 401 Unauthorized
```json
{
  "error": "Unauthorized"
}
```
**Cause**: Missing or invalid authentication, or user doesn't have SUPER_ADMIN role.

#### 404 File Not Found
```json
{
  "error": "File not found."
}
```
**Cause**: Requested backup file doesn't exist.

#### 400 Bad Request - Invalid Filename
```json
{
  "error": "Invalid filename"
}
```
**Cause**: Filename contains invalid characters or path traversal attempts.

#### 400 Bad Request - Invalid File Type
```json
{
  "error": "Invalid file type. Only .aes files are allowed."
}
```
**Cause**: Uploaded file does not have `.aes` extension. Only encrypted backup files are accepted.

#### 500 Internal Server Error - Upload Failed
```json
{
  "error": "Failed to upload backup file. Please try again."
}
```
**Cause**: Server-side error during file upload. Partial files are automatically cleaned up.

#### 500 Internal Server Error - Network Disconnect
```json
{
  "error": "Upload interrupted. Please try again."
}
```
**Cause**: Network connection was lost during upload. Partial files are automatically cleaned up.

## Security Considerations

1. **Role-Based Access**: Only SUPER_ADMIN users can access backup operations
2. **Encryption**: All backup files are encrypted at rest using AES encryption
3. **Path Validation**: Directory traversal attacks are prevented
4. **Audit Logging**: All backup operations are logged for compliance
5. **Rate Limiting**: Backup operations are subject to rate limiting
6. **File Type Validation**: Only `.aes` files are accepted for restore operations (validated on both frontend and server-side)
7. **Streaming Uploads**: Large files (up to 1GB) are streamed directly to disk without loading into memory, preventing memory exhaustion attacks
8. **Automatic Cleanup**: Partial/incomplete files are automatically deleted on upload errors or network disconnects
9. **Session-Only Restore**: Database restore operations require web session authentication (API keys are blocked) to prevent unauthorized restoration

## File Storage

- **Docker**: `/app/data/backups/` (mounted volume)
- **Local Development**: `./data/backups/`
- **File Extensions**: `.sqlite.aes` for SQLite, `.postgresql.aes` for PostgreSQL
- **Upload Size Limit**: Up to 1GB (configured via NGINX `client_max_body_size`)
- **Upload Method**: Streaming (files written directly to disk, ~10-20MB memory usage)
- **Temporary Files**: Uploaded files are temporarily stored in `./data/temp/` during restore operations
- **Temporary Upload Directory**: `.temp/` directory in backups folder is used during chunked uploads and is automatically cleaned up when empty
- **Backup Listing**: The `.temp/` directory is automatically filtered out from backup listings and only actual backup files are displayed

## API Endpoints Summary

| Method | Endpoint | Purpose | Auth Methods |
|--------|----------|---------|--------------|
| POST | `/api/settings/backup` | Create new backup | API Key, Session |
| GET | `/api/settings/backup/versions` | List all backups | API Key, Session |
| GET | `/api/settings/backup/versions/[filename]` | Download specific backup | API Key, Session |
| PATCH | `/api/settings/backup/versions/[filename]` | Rename backup file | API Key, Session |
| DELETE | `/api/settings/backup/versions/[filename]` | Delete backup file | API Key, Session |
| POST | `/api/settings/backup` (action=restore) | Restore from backup | **Session Only** ⚠️ |

## GUI Backup Creation

The web interface provides a user-friendly backup creation dialog:

1. Navigate to **Settings** → **Backup & Restore** tab
2. Click **Create Backup** button
3. Enter a backup name or leave as default
4. The system automatically adds:
   - A timestamp in ISO 8601 format (e.g., `2025_11_21T10_56_58_839Z`)
   - The appropriate file extension (`.sqlite.aes` or `.postgresql.aes`)

### Default Filename Behavior

The default filename is `instrada-ogm`, with optional Application Subtitle appended:

**Without Application Subtitle (or disabled/empty)**:
- Leave default → `instrada-ogm_2025_11_21T10_56_58_839Z.sqlite.aes`

**With Application Subtitle enabled** (e.g., "Home Lab"):
- Leave default → `instrada-ogm_home_lab_2025_11_21T10_56_58_839Z.sqlite.aes`
- The subtitle is automatically sanitized (lowercase, spaces → underscores, special characters removed)

### Custom Filenames

**Examples**:
- Enter "daily" → `daily_2025_11_21T10_56_58_839Z.sqlite.aes`
- Enter "pre_update" → `pre_update_2025_11_21T10_56_58_839Z.sqlite.aes`

To create a backup without automatic timestamp, include the full filename with `.aes` extension (e.g., `backup.sqlite.aes`).

## Troubleshooting

### Backup Creation Fails
1. Verify SUPER_ADMIN role
2. Check database connection
3. Ensure sufficient disk space
4. Verify write permissions to backup directory

### Download Fails
1. Confirm filename exists (use list endpoint)
2. Verify file permissions
3. Check network connectivity
4. Validate authentication token

### File Corruption
1. Verify encryption/decryption process
2. Check file integrity after download
3. Ensure complete download (check file sizes)