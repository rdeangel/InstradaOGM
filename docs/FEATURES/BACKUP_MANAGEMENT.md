# Backup Management Guide

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Features](../FEATURES/)

## Overview

The backup system allows SUPER_ADMIN users to create encrypted database backups, download existing backup files, and manage backup versions. This guide covers both the API and the automated backup manager script.

---

## Quick Start

### Using the Web UI
1. Navigate to **Settings** → **Backup Management**
2. Click **Create Backup** to initiate a new backup
3. Optionally provide a custom filename
4. Download or delete backups as needed

### Using the Backup Manager Script
```bash
# Basic backup with local mail relay
./scripts/backup_manager.sh --delete-remote --email \
  --email-to admin@example.com \
  --email-from backup@example.com

# Backup with Gmail notifications
./scripts/backup_manager.sh --delete-remote --email \
  --email-to admin@example.com \
  --email-from you@gmail.com \
  --smtp-server smtp.gmail.com \
  --smtp-port 587 \
  --smtp-user you@gmail.com \
  --smtp-pass your-app-password
```

---

## Features

- **Encrypted Backups**: All backups are encrypted with AES encryption
- **Custom Filenames**: Name your backups meaningfully instead of using timestamps
- **Automated Scheduling**: Use cron jobs with the backup manager script
- **Email Notifications**: Get notified when backups complete
- **Remote Deletion**: Automatically delete backups from server after download
- **Multiple SMTP Options**: Plain SMTP, STARTTLS (port 587), or SSL/TLS (port 465)
- **Security**: Restore operations require web session authentication (API keys blocked)
- **Large File Support**: Supports backup uploads up to 1GB using streaming technology
- **Memory Efficient**: Streaming uploads use ~15MB RAM for 1GB files (99.5% reduction vs buffering)
- **File Validation**: Only `.aes` files accepted for restore operations (validated on frontend and server-side)
- **Automatic Cleanup**: Partial/incomplete files are automatically deleted on errors or network disconnects
- **Network Resilience**: Handles temporary connectivity loss with automatic cleanup

---

## Upload Size Limits

InstradaOGM supports uploading backup files up to **1GB** in size to accommodate large database backups.

### Technical Implementation
- **Upload Method**: Streaming (files written directly to disk without loading into memory)
- **Memory Usage**: ~10-20MB for 1GB file uploads (vs ~3GB with traditional buffering)
- **Size Limit**: Controlled by NGINX `client_max_body_size` configuration (set to 1GB)
- **File Type**: Only `.aes` encrypted backup files are accepted
- **Validation**: Multi-layer validation (frontend file input, JavaScript pre-upload, server-side during upload)
- **Error Handling**: Automatic cleanup of partial files on any error or network disconnect

### Application Configuration

The application uses **streaming uploads** (via busboy) which write files directly to disk without loading them into memory. This approach:
- **No Next.js body size limits needed** - Streaming bypasses Next.js request body parsing
- **Memory efficient** - ~10-20MB RAM usage for 1GB uploads (vs ~3GB with traditional buffering)
- **Only reverse proxy limits apply** - Configure your reverse proxy (NGINX, Caddy, Traefik) to allow large uploads

### Reverse Proxy Configuration Required

**⚠️ Important:** If using a reverse proxy (NGINX, Caddy, Traefik), you **must** configure it to allow large uploads:

**NGINX:**
```nginx
server {
    client_max_body_size 1G;
    # ... rest of configuration
}
```

**Caddy:**
```caddy
your-domain.com {
    request_body {
        max_size 1GB
    }
    reverse_proxy localhost:3000
}
```

**Traefik:**
Add to your middleware:
```yaml
http:
  middlewares:
    large-uploads:
      buffering:
        maxRequestBodyBytes: 1073741824  # 1GB in bytes
```

### Troubleshooting Upload Failures

If backup uploads fail with "413 Request Entity Too Large" or timeout errors:

1. **Check reverse proxy configuration**: Ensure your reverse proxy allows large uploads:
   - **NGINX**: `client_max_body_size 1G;`
   - **Caddy**: `request_body { max_size 1GB }`
   - **Traefik**: No configuration needed (no default limit)
2. **Check browser console**: Look for HTTP 413 errors or timeout messages
3. **Verify file size**: Ensure backup file is under 1GB

See [NGINX Proxy Settings](../CONFIGURATION/NGINX-PROXY-SETTINGS.md#upload-size-configuration) for detailed reverse proxy configuration.

---

## Security Policy

### Restore Operation Restrictions

**⚠️ Important:** For security reasons, database restore operations are **only allowed via web session authentication**.

**What this means:**
- ✅ **Backup Creation**: Allowed via API key or web session
- ✅ **Backup Download**: Allowed via API key or web session
- ✅ **Backup Management** (list/rename/delete): Allowed via API key or web session
- ❌ **Backup Restore**: **Only allowed via web session** (API keys are blocked)

**Why this restriction exists:**
- Prevents unauthorized database restoration via compromised API keys
- Requires interactive web authentication for destructive operations
- Adds an additional layer of security for critical database operations

**How to restore a backup:**
1. Log in to the web interface as a SUPER_ADMIN user
2. Navigate to **Settings** → **Backup & Restore**
3. Select the backup file you want to restore
4. Click the restore button and confirm

---

## Restore Process

### Web UI Restore

1. Navigate to **Settings** → **Backup & Restore**
2. Select a backup from the list or upload a new backup file
3. Click the **Restore** button
4. Confirm the restore operation

### Restore Process Steps

The restore operation automatically performs the following steps:

1. **Disconnect Application**: Closes all application database connections (SQLite only)
2. **Terminate Active Sessions**: Terminates all active database sessions (PostgreSQL only)
3. **Drop Existing Database**: Removes the current database to ensure a clean restore
4. **Create Fresh Database**: Creates a new empty database
5. **Restore Backup Data**: Restores the backup data into the new database
6. **Reconnect Application**: Re-establishes application database connections
7. **Cleanup**: Removes temporary files created during restore

### Restore Methods

#### Method 1: Restore from Server Backup
Restore from an existing backup file already stored on the server:

1. Navigate to **Settings** → **Backup & Restore**
2. Select a backup from the **Available Backups** list
3. Click **Restore**
4. Confirm the operation

#### Method 2: Upload and Restore
Upload a backup file from your local machine and restore it:

1. Navigate to **Settings** → **Backup & Restore**
2. Click **Upload Backup**
3. Select a `.aes` backup file from your computer
4. Wait for upload to complete
5. Click **Restore**
6. Confirm the operation

### Important Notes

- **Session Required**: Restore operations require web session authentication (not API keys)
- **Database Downtime**: The application will be temporarily unavailable during restore
- **Data Loss**: Restoring will replace all current database data with the backup data
- **Backup Verification**: Ensure you have a valid backup before restoring
- **Connection Termination**: All active database connections are automatically terminated before restore
- **Automatic Cleanup**: Temporary files are automatically cleaned up after restore completes or fails

---

## Email Configuration

### Local Mail Relay (Port 25)
```bash
./scripts/backup_manager.sh --email \
  --email-to admin@example.com \
  --email-from backup@example.com \
  --smtp-server localhost \
  --smtp-port 25
```

### Gmail with App Password
1. Go to https://myaccount.google.com/apppasswords
2. Create an app password
3. Use it in the script:

```bash
./scripts/backup_manager.sh --email \
  --email-to admin@example.com \
  --email-from you@gmail.com \
  --smtp-server smtp.gmail.com \
  --smtp-port 587 \
  --smtp-user you@gmail.com \
  --smtp-pass your-app-password
```

### Outlook/Office365
```bash
./scripts/backup_manager.sh --email \
  --email-to admin@example.com \
  --email-from you@outlook.com \
  --smtp-server smtp.office365.com \
  --smtp-port 587 \
  --smtp-user you@outlook.com \
  --smtp-pass your-password
```

---

## API Reference

For complete API documentation including all endpoints, error handling, and code examples, see:

- [💾 Backup API](../api/api_docs/30_backup_endpoints.md) - Complete API reference

---

## Backup Manager Script

The `scripts/backup_manager.sh` script automates the entire backup workflow:

```bash
./scripts/backup_manager.sh [OPTIONS]

OPTIONS:
  -s, --server URL              Server URL
  -k, --key API_KEY             API key with SUPER_ADMIN privileges
  -d, --dest DIR                Destination directory
  -f, --filename NAME           Custom backup filename (no timestamp)
  -p, --prefix PREFIX           Add prefix to auto-generated timestamp filename
  -v, --verbose                 Enable verbose output
  --delete-remote               Delete backup from server after download
  --email                       Enable email notifications
  --email-to EMAIL              Recipient email
  --email-from EMAIL            Sender email
  --smtp-server SERVER          SMTP server (default: localhost)
  --smtp-port PORT              SMTP port (default: 25)
  --smtp-user USER              SMTP username (enables auth)
  --smtp-pass PASS              SMTP password
```

### Filename Options

**Option 1: Default backup (uses "instrada-ogm" prefix, with optional subtitle)**

CLI:
```bash
./scripts/backup_manager.sh
# Result: instrada-ogm_2025_11_21T10_56_58_839Z.postgresql.aes
```

GUI (with Application Subtitle enabled):
- If subtitle is **disabled or empty**: `instrada-ogm_2025_11_21T10_56_58_839Z.postgresql.aes`
- If subtitle is **"Home Lab"**: `instrada-ogm_home_lab_2025_11_21T10_56_58_839Z.postgresql.aes`
- If subtitle is **"Production Environment"**: `instrada-ogm_production_environment_2025_11_21T10_56_58_839Z.postgresql.aes`

> The GUI automatically sanitizes the subtitle (lowercase, spaces → underscores, removes special characters)

**Option 2: Custom prefix with auto-generated timestamp**
```bash
./scripts/backup_manager.sh -p "daily"
# Result: daily_2025_11_21T10_56_58_839Z.postgresql.aes

./scripts/backup_manager.sh -p "weekly"
# Result: weekly_2025_11_21T10_56_58_839Z.postgresql.aes

./scripts/backup_manager.sh -p "pre_update"
# Result: pre_update_2025_11_21T10_56_58_839Z.postgresql.aes
```

**Option 3: Disable prefix (use "backup" naming)**
```bash
./scripts/backup_manager.sh -p ""
# Result: backup_2025_11_21T10_56_58_839Z.postgresql.aes
```

**Option 4: Custom filename (no timestamp)**
```bash
./scripts/backup_manager.sh -f "pre_update_backup.postgresql.aes"
# Result: pre_update_backup.postgresql.aes
```

> **How it works:**
> - **Without `.aes` extension** (e.g., `instrada-ogm`, `daily`, `backup`): API automatically adds timestamp
> - **With `.aes` extension** (e.g., `backup.postgresql.aes`): Used as-is, no timestamp added
>
> **Default prefix is `instrada-ogm`** for both CLI and GUI. Use `-p` to override with a custom prefix. Use `-f` only when you want a specific filename without timestamp.
>
> **GUI Enhancement**: When Application Subtitle is enabled in Settings, the GUI automatically appends the sanitized subtitle to the default backup filename for better instance identification.

---

## Configuration File

Create `.backup_instrada_vars` in the scripts directory:

```bash
INSTRADA_SERVER_URL=https://ogm.example.com
INSTRADA_API_KEY=your-super-admin-api-key
BACKUP_DEST_DIR=~/backups
BACKUP_PREFIX=daily
EMAIL_TO=admin@example.com
EMAIL_FROM=backup@example.com
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASSWORD=your-app-password
DELETE_REMOTE=true
```

**Configuration Options:**
- `INSTRADA_SERVER_URL` - Your InstradaOGM server URL
- `INSTRADA_API_KEY` - SUPER_ADMIN API key
- `BACKUP_DEST_DIR` - Where to save backups locally
- `BACKUP_PREFIX` - Optional prefix for auto-generated filenames (e.g., "daily", "weekly")
- `EMAIL_TO` - Email recipient for notifications
- `EMAIL_FROM` - Email sender address
- `SMTP_SERVER` - SMTP server hostname
- `SMTP_PORT` - SMTP port (25, 587, or 465)
- `SMTP_USER` - SMTP username (optional, enables authentication)
- `SMTP_PASSWORD` - SMTP password (optional)
- `DELETE_REMOTE` - Auto-delete backup from server after download (true/false)

---

## Related Documentation

### Features
- [📋 Features Index](FEATURES_INDEX.md) - All features overview

### API Documentation
- [🔍 API Index](../api/api_docs/API_Index.md) - All API endpoints
- [🔑 Authentication](../api/api_docs/02_authentication_endpoints.md) - Auth methods

### Setup & Configuration
- [📋 Setup Index](../SETUP/SETUP_INDEX.md) - Installation guide
- [⚙️ Configuration Index](../CONFIGURATION/CONFIGURATION_INDEX.md) - Configuration guide

---

**Last Updated**: 2025-11-21 | **Category**: Features | **Status**: Complete

