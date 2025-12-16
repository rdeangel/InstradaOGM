# Update Management Endpoints

[⬆️ Back to API Index](API_Index.md) | [📚 Back to Documentation Home](../../DOCUMENTATION_INDEX.md)

## Update Detection System Overview

The InstradaOGM Update Detection System ensures that administrators are always aware of the latest features, security patches, and improvements.

**Key Features:**
- **Background Service**: A server-side service automatically checks for updates on startup and every 6 hours (can be disabled via AUTO_UPDATE_CHECK environment variable)
- **Smart Caching**: Update information is cached in memory for fast access without repeated GitHub API calls
- **Comprehensive History**: If your installation is multiple versions behind, the system retrieves the full history of updates. You will see a consolidated view of all release notes from your current version up to the latest available version
- **Performance Optimized**: Page navigation and component rendering use cached data - no GitHub API calls on every page load
- **Privacy & Security**: Update checks are performed securely by your server. No sensitive data is sent to external servers during this process
- **User Control**: Administrators can manually trigger fresh checks at any time
- **Configurable**: Automatic update checks can be disabled via the `AUTO_UPDATE_CHECK` environment variable while still allowing manual checks

## Configuration

### AUTO_UPDATE_CHECK Environment Variable

Control automatic update checking behavior:

- **Default**: `true` (enabled)
- **When enabled** (`AUTO_UPDATE_CHECK=true`):
  - Update check runs automatically at startup
  - Periodic checks every 6 hours
  - Manual checks via Settings > Updates tab
  - Update notifications shown to SUPER_ADMIN users

- **When disabled** (`AUTO_UPDATE_CHECK=false`):
  - ❌ No update check at startup
  - ❌ No periodic 6-hour checks
  - ✅ Manual checks still available via Settings > Updates tab
  - 🔕 Grey informational badge shown in Updates tab indicating auto-check is disabled
  - 🌐 No GitHub API calls unless manually triggered

**Use Case**: Disable automatic checks in air-gapped environments or when GitHub access is restricted.

This API provides two endpoints:
- **Status endpoint**: Returns cached update information (fast, no GitHub API call)
- **Check endpoint**: Triggers a fresh update check (calls GitHub API)

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
curl -X GET "${SERVER_URL}/api/updates/status" \
  -H "Authorization: Bearer ${API_KEY}"
```

## Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access update endpoints (returns "Unauthorized")
- **ADMIN**: ❌ Cannot access update endpoints (returns "Unauthorized")
- **SUPER_ADMIN**: ✅ Can access update endpoints

**Example Responses:**

**USER/ADMIN Role Failure:**
```json
{
  "success": false,
  "message": "Unauthorized"
}
```

**SUPER_ADMIN Success:**
```json
{
  "success": true,
  "data": {
    "updateAvailable": true,
    "currentVersion": "1.0.0",
    "latestVersion": "1.1.0",
    "releaseUrl": "https://github.com/rdeangel/InstradaOGM/releases/tag/v1.1.0",
    "releaseNotes": "## What's New...",
    "publishedAt": "2025-12-01T10:00:00Z",
    "lastChecked": "2025-12-05T09:00:00Z",
    "versionsSkipped": 0,
    "autoUpdateEnabled": true
  }
}
```

## Endpoints

### GET /api/updates/status

**Description**: Get cached update status without triggering a GitHub API call. This endpoint returns the result from the last automatic or manual update check. Use this endpoint for passive status checks, page loads, and UI components.

**Authentication**: Required (session or API key with SUPER_ADMIN role)

**GitHub API Call**: ❌ No - Returns cached data

**Use Cases**:
- Page loads and navigation
- Component mounting (header, notifications)
- Dashboard widgets
- Monitoring tools checking status
- Any scenario where you want fast response without triggering external API calls

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ❌ Unauthorized
- **SUPER_ADMIN**: ✅ Full access

#### Usage Case 1: Get Cached Status (Update Available)

**Scenario**: Check if an update is available using cached data.

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/updates/status" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "updateAvailable": true,
    "currentVersion": "1.0.0",
    "latestVersion": "1.1.0",
    "releaseUrl": "https://github.com/rdeangel/InstradaOGM/releases/tag/v1.1.0",
    "releaseNotes": "## v1.1.0 (12/1/2025)\n\n### Features\n- New update detection system\n- Enhanced performance",
    "publishedAt": "2025-12-01T10:00:00Z",
    "lastChecked": "2025-12-05T09:00:00Z",
    "versionsSkipped": 0,
    "autoUpdateEnabled": true
  }
}
```

#### Usage Case 2: Get Cached Status (Up to Date)

**Scenario**: Check cached status when system is up to date.

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/updates/status" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "updateAvailable": false,
    "currentVersion": "1.1.0",
    "latestVersion": "1.1.0",
    "releaseUrl": "https://github.com/rdeangel/InstradaOGM/releases/tag/v1.1.0",
    "releaseNotes": "...",
    "publishedAt": "2025-12-01T10:00:00Z",
    "lastChecked": "2025-12-05T09:00:00Z",
    "versionsSkipped": 0,
    "autoUpdateEnabled": true
  }
}
```

#### Usage Case 3: No Cached Data Yet

**Scenario**: Service is still starting up and hasn't performed first check yet.

**Success Response**:
```json
{
  "success": true,
  "data": {
    "updateAvailable": false,
    "currentVersion": "1.0.0",
    "latestVersion": "1.0.0",
    "lastChecked": "2025-12-05T09:00:00Z",
    "message": "Update check in progress..."
  }
}
```

---

### GET /api/updates/check

**Description**: Manually trigger an update check from GitHub releases. This endpoint performs a fresh check against the GitHub API and updates the cached result. Use this endpoint only when the user explicitly requests an update check (e.g., clicking "Check for Updates" button).

**Authentication**: Required (session or API key with SUPER_ADMIN role)

**GitHub API Call**: ✅ Yes - Performs fresh check

**Use Cases**:
- User clicks "Check for Updates" button
- User clicks "Refresh" in update notification
- Scheduled external monitoring (use sparingly)
- Manual verification of update status

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ❌ Unauthorized
- **SUPER_ADMIN**: ✅ Full access

#### Usage Case 1: Manual Check (Update Available)

**Scenario**: Super admin manually checks for updates and a new version is found.

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/updates/check" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "updateAvailable": true,
    "currentVersion": "1.0.0",
    "latestVersion": "1.1.0",
    "releaseUrl": "https://github.com/rdeangel/InstradaOGM/releases/tag/v1.1.0",
    "releaseNotes": "## v1.1.0 (12/1/2025)\n\n### Features\n- New update detection system\n- Enhanced performance",
    "publishedAt": "2025-12-01T10:00:00Z",
    "lastChecked": "2025-12-05T09:30:00Z",
    "versionsSkipped": 0
  }
}
```

#### Usage Case 2: Manual Check (Up to Date)

**Scenario**: Super admin manually checks for updates and the system is already on the latest version.

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/updates/check" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "updateAvailable": false,
    "currentVersion": "1.1.0",
    "latestVersion": "1.1.0",
    "releaseUrl": "https://github.com/rdeangel/InstradaOGM/releases/tag/v1.1.0",
    "releaseNotes": "...",
    "publishedAt": "2025-12-01T10:00:00Z",
    "lastChecked": "2025-12-05T09:30:00Z",
    "versionsSkipped": 0
  }
}
```

#### Usage Case 3: Unauthorized Access (ADMIN/USER)

**Scenario**: Non-super admin attempts to check for updates.

**Error Response**:
```json
{
  "success": false,
  "message": "Unauthorized"
}
```

#### Usage Case 4: GitHub API Error

**Scenario**: The server fails to connect to GitHub API (e.g., network issue or rate limit).

**Success Response (with error details)**:
```json
{
  "success": true,
  "data": {
    "updateAvailable": false,
    "currentVersion": "1.0.0",
    "latestVersion": "1.0.0",
    "error": "Unable to connect to GitHub API. Please check your internet connection.",
    "errorType": "network",
    "lastChecked": "2025-12-05T09:30:00Z"
  }
}
```

## Response Fields

Both endpoints return the same data structure:

- `success`: Boolean indicating if the request was processed successfully
- `data`: Object containing update information
  - `updateAvailable`: Boolean indicating if a newer version is available
  - `currentVersion`: The current running version of the application
  - `latestVersion`: The latest available version from GitHub
  - `releaseUrl`: URL to the GitHub release page
  - `releaseNotes`: Markdown-formatted release notes (aggregated if multiple versions behind)
  - `publishedAt`: ISO timestamp of the release publication
  - `lastChecked`: ISO timestamp of when the check was performed
  - `versionsSkipped`: Number of versions between current and latest
  - `autoUpdateEnabled`: Boolean indicating if automatic update checks are enabled (controlled by AUTO_UPDATE_CHECK environment variable)
  - `error`: (Optional) Error message if the check failed
  - `errorType`: (Optional) Type of error (`not_found`, `network`, `unknown`)
  - `message`: (Optional) Informational message

## Background Service

The update check system uses a background service that:

1. **Starts automatically** when the application starts
2. **Performs initial check** immediately on startup
3. **Schedules periodic checks** every 6 hours
4. **Caches results** in memory for fast access
5. **Updates cache** when manual checks are performed

### Service Behavior

- **Startup**: Service starts with application initialization
- **Initial Check**: Runs immediately after startup
- **Periodic Checks**: Every 6 hours automatically
- **Manual Checks**: Triggered by `/api/updates/check` endpoint
- **Cache Duration**: Indefinite (updated by periodic and manual checks)

### Recommended Usage Pattern

**For UI Components** (frequent access):
```javascript
// Use status endpoint - fast, no GitHub API call
const response = await fetch('/api/updates/status');
```

**For User Actions** (explicit checks):
```javascript
// Use check endpoint - triggers fresh GitHub check
const response = await fetch('/api/updates/check');
```

## Performance Considerations

### Status Endpoint (`/api/updates/status`)
- ⚡ **Fast**: Returns immediately from cache
- 🌐 **No Network**: No external API calls
- 📊 **Scalable**: Can handle high request volume
- 💾 **Efficient**: Minimal server resources

### Check Endpoint (`/api/updates/check`)
- 🔄 **Fresh Data**: Always gets latest from GitHub
- 🌐 **Network Call**: Requires GitHub API access
- ⏱️ **Slower**: Depends on GitHub API response time
- 🎯 **Use Sparingly**: Only for explicit user requests

## Integration Examples

### React Component (Passive Check)
```typescript
useEffect(() => {
  const fetchStatus = async () => {
    const response = await fetch('/api/updates/status');
    const data = await response.json();
    if (data.success) {
      setUpdateAvailable(data.data.updateAvailable);
    }
  };
  fetchStatus();
}, []);
```

### React Component (Manual Check)
```typescript
const handleCheckUpdates = async () => {
  setLoading(true);
  const response = await fetch('/api/updates/check');
  const data = await response.json();
  if (data.success) {
    setUpdateInfo(data.data);
  }
  setLoading(false);
};
```

## Rate Limiting

With the current implementation:
- **GitHub API Calls**: ~4-5 per day (startup + 3-4 periodic checks)
- **Status Checks**: Unlimited (uses cached data)
- **Manual Checks**: Limited only by user actions
- **Rate Limit Risk**: Minimal with default configuration

## Troubleshooting

### Cached data is stale
- Wait for next automatic check (every 6 hours)
- Trigger manual check via `/api/updates/check`
- Restart application to force immediate check

### Service not running
- Check server logs for "Update check service started"
- Verify service initialization in startup logs
- Check for errors during application startup

### GitHub API errors
- Verify network connectivity
- Check GitHub API status
- Review server logs for detailed error messages
- Ensure repository exists and has releases
