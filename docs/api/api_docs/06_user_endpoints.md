# User Endpoints

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
curl -X GET "${SERVER_URL}/api/user/profile" \
  -H "Authorization: Bearer ${API_KEY}"
```

This section covers all user-specific API endpoints for managing user profiles, devices, and user-related operations.

## Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ✅ Can access own user endpoints
- **ADMIN**: ✅ Can access own user endpoints
- **SUPER_ADMIN**: ✅ Can access own user endpoints

**Role Access:**
- **USER**: ✅ Can access own profile, devices, group filters, and permission-related endpoints
- **ADMIN**: ✅ Can access own profile, devices, group filters, and permission-related endpoints
- **SUPER_ADMIN**: ✅ Can access own profile, devices, group filters, and permission-related endpoints

**Example Responses:**

**All Roles Success:**
```json
{
  "id": "user-uuid-1",
  "name": "User Name",
  "email": "user@example.com",
  "role": "USER",
  "devices": [
    {
      "id": "device-uuid-1",
      "name": "My Device",
      "ipAddress": "192.168.1.100",
      "macAddress": "00:11:22:33:44:55"
    }
  ]
}
```

## User Profile Management

### GET /api/user/profile

**Description**: Retrieve the authenticated user's profile information.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can access own profile
- **ADMIN**: ✅ Can access own profile
- **SUPER_ADMIN**: ✅ Can access own profile

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/user/profile" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
{
  "id": "user-uuid-1",
  "name": "John Doe",
  "username": "johndoe",
  "email": "john@example.com",
  "role": "USER",
  "emailVerified": "2024-01-01T12:00:00Z",
  "createdAt": "2024-01-01T12:00:00Z",
  "updatedAt": "2024-01-01T12:00:00Z",
  "lastActive": "2024-01-01T13:00:00Z",
  "is2FAEnabled": false,
  "groups": [
    {
      "id": "group-uuid-1",
      "name": "User Group",
      "description": "Regular users"
    }
  ],
  "devices": [
    {
      "id": "device-uuid-1",
      "name": "John's Laptop",
      "ipAddress": "192.168.1.100",
      "macAddress": "00:11:22:33:44:55",
      "lastSeen": "2024-01-01T13:00:00Z",
      "status": "online"
    }
  ],
  "preferences": {
    "theme": "dark",
    "notifications": true,
    "language": "en"
  }
}
```

### PUT /api/user/profile

**Description**: Update the authenticated user's profile information.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can update own profile
- **ADMIN**: ✅ Can update own profile
- **SUPER_ADMIN**: ✅ Can update own profile

**Example Request**:
```bash
curl -X PUT "{{SERVER_URL}}/api/user/profile" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Smith",
    "email": "john.smith@example.com"
  }'
```

**Example Response**:
```json
{
  "id": "user-uuid-1",
  "name": "John Smith",
  "email": "john.smith@example.com",
  "role": "USER",
  "createdAt": "2024-01-01T12:00:00Z",
  "updatedAt": "2024-01-01T14:00:00Z"
}
```

**Request Fields**:
- `name` (optional): User's display name
- `email` (optional): User's email address

**Response Fields**:
- `id`: Unique user identifier
- `name`: User's display name
- `email`: User's email address
- `role`: User role (`USER`, `ADMIN`, `SUPER_ADMIN`)
- `createdAt`: Account creation timestamp
- `updatedAt`: Last update timestamp

## Device Management

### GET /api/user/devices

**Description**: Retrieve the authenticated user's devices based on group permissions and host alias assignments.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can access own devices based on group permissions
- **ADMIN**: ✅ Can access own devices based on group permissions
- **SUPER_ADMIN**: ✅ Can access own devices based on group permissions

#### Usage Case 1: Successful Device Retrieval (User with Permissions)

**Scenario**: User with group permissions retrieves their accessible devices

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/user/devices" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
[
  {
    "id": "device-uuid-1",
    "name": "User Laptop",
    "description": "John's work laptop",
    "content": "192.168.1.100",
    "type": "host",
    "enabled": true,
    "uuid": "device-uuid-1",
    "detectedMac": "00:11:22:33:44:55",
    "detectedVendor": "Dell Inc.",
    "detectedVendorSource": "OPNsense",
    "detectedHostname": "john-laptop",
    "isDhcpReserved": true,
    "dhcpReservedMac": "00:11:22:33:44:55",
    "dhcpReservedVendor": "Dell Inc.",
    "memberOfGroups": [
      {
        "id": "group-uuid-1",
        "name": "G_DEVICES_VPN_OV",
        "description": "OpenVPN Device Group",
        "uuid": "group-uuid-1"
      }
    ]
  },
  {
    "id": "device-uuid-2",
    "name": "User Phone",
    "description": "John's mobile device",
    "content": "192.168.1.101",
    "type": "host",
    "enabled": true,
    "uuid": "device-uuid-2",
    "detectedMac": "aa:bb:cc:dd:ee:ff",
    "detectedVendor": "Apple, Inc.",
    "detectedVendorSource": "Local DB",
    "detectedHostname": "john-iphone",
    "isDhcpReserved": false,
    "dhcpReservedMac": null,
    "dhcpReservedVendor": null,
    "memberOfGroups": [
      {
        "id": "group-uuid-2",
        "name": "G_DEVICES_MOBILE",
        "description": "Mobile Device Group",
        "uuid": "group-uuid-2"
      }
    ]
  }
]
```

#### Usage Case 2: User with Wildcard Permissions

**Scenario**: User with wildcard (*) permissions sees all available devices

**Success Response**:
```json
[
  {
    "id": "device-uuid-3",
    "name": "All Access Device",
    "description": "Device accessible via wildcard permission",
    "content": "192.168.1.200",
    "type": "host",
    "enabled": true,
    "uuid": "device-uuid-3",
    "detectedMac": "11:22:33:44:55:66",
    "detectedVendor": "HP Inc.",
    "detectedHostname": "hp-workstation",
    "isDhcpReserved": true,
    "dhcpReservedMac": "11:22:33:44:55:66",
    "dhcpReservedVendor": "HP Inc.",
    "memberOfGroups": [
      {
        "id": "group-uuid-3",
        "name": "G_ADMIN_WORKSTATIONS",
        "description": "Administrative Workstations",
        "uuid": "group-uuid-3"
      }
    ]
  }
]
```

#### Usage Case 3: User with No Permissions

**Scenario**: User has no group permissions or host alias assignments

**Success Response**:
```json
[]
```

#### Usage Case 4: Unauthenticated Access

**Scenario**: Request without valid authentication

**Error Response**:
```json
{
  "message": "Unauthorized"
}
```

#### Usage Case 5: User ID Not Found

**Scenario**: Authenticated user but user ID missing from session

**Error Response**:
```json
{
  "message": "User ID not found in session"
}
```

**Response Fields**:
- `id`: Unique device identifier (alias UUID)
- `name`: Device name (alias name)
- `description`: Device description (alias description)
- `content`: Device IP address
- `type`: Device type (always "host" for host aliases)
- `enabled`: Whether the alias is enabled
- `uuid`: Device UUID (same as id)
- `detectedMac`: MAC address detected from network
- `detectedVendor`: Vendor information detected from MAC address
- `detectedVendorSource`: Source of vendor information (`"OPNsense"` for OPNsense ARP Table, `"Local DB"` for local vendor database, or `null` if no vendor detected)
- `detectedHostname`: Hostname detected from ARP table
- `isDhcpReserved`: Whether device has DHCP reservation
- `dhcpReservedMac`: MAC address from DHCP reservation
- `dhcpReservedVendor`: Vendor information from DHCP reservation
- `memberOfGroups`: Groups this device belongs to


## Group Filters

### GET /api/user/group-filters

**Description**: Retrieve group filters applicable to the authenticated user based on their group memberships.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can access own group filters
- **ADMIN**: ✅ Can access own group filters
- **SUPER_ADMIN**: ✅ Can access own group filters

**Group Membership Detection:**
- **Direct Assignment**: Users directly assigned to local groups in the database
- **SSO Mapping**: Users connected to local groups through SSO provider group mappings (Authentik, Microsoft, etc.)
- **Combined**: Returns filters from all groups the user belongs to (direct + SSO-mapped)

**Filter Behavior:**
- User-specific filters completely override global filters when present
- Globally disabled groups are always excluded regardless of user-specific filters
- Empty response `[]` means user has no group memberships or no group-specific filters configured

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/user/group-filters" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
[
  {
    "id": "cmem1vrx2006tb7tp45x2ypc9",
    "groupId": "cmbgae5iy000mqk015kdd0rg6",
    "pattern": ".*UK.*",
    "description": "Only UK groups",
    "type": "include",
    "createdAt": "2025-08-21T23:46:20.823Z",
    "updatedAt": "2025-08-21T23:46:20.823Z"
  }
]
```

**Example Response**:
```json
[
  {
    "id": "filter-uuid-1",
    "groupId": "group-uuid-1",
    "group": {
      "id": "group-uuid-1",
      "name": "User Group",
      "description": "Regular users"
    },
    "name": "Network Filter",
    "type": "network",
    "value": "192.168.1.0/24",
    "enabled": true
  }
]
```

**Response Fields**:
- `id`: Unique filter identifier
- `groupId`: Associated group ID
- `group`: Group information
- `name`: Filter name
- `type`: Filter type (network, hostname, etc.)
- `value`: Filter value
- `enabled`: Whether filter is active

## Device Access Check

### GET /api/user/has-device-access

**Description**: Check if the authenticated user has device management access based on group permissions and host alias assignments.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can check device access
- **ADMIN**: ✅ Can check device access
- **SUPER_ADMIN**: ✅ Can check device access

#### Usage Case 1: User with Device Access

**Scenario**: User has group permissions with host alias assignments

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/user/has-device-access" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "hasAccess": true
}
```

#### Usage Case 2: User with Wildcard Access

**Scenario**: User has wildcard (*) permissions for all devices

**Success Response**:
```json
{
  "hasAccess": true
}
```

#### Usage Case 3: User without Device Access

**Scenario**: User has no group permissions or host alias assignments

**Success Response**:
```json
{
  "hasAccess": false
}
```

#### Usage Case 4: Unauthenticated Access

**Scenario**: Request without valid authentication

**Error Response**:
```json
{
  "hasAccess": false,
  "message": "Unauthorized"
}
```

#### Usage Case 5: User ID Not Found

**Scenario**: Authenticated user but user ID missing from session

**Error Response**:
```json
{
  "hasAccess": false,
  "message": "User ID not found in session"
}
```

#### Usage Case 6: Server Error

**Scenario**: Database error during permission check

**Error Response**:
```json
{
  "hasAccess": false,
  "message": "Internal server error"
}
```

**Response Fields**:
- `hasAccess`: Boolean indicating whether user has device management access
- `message`: Error message (only present when hasAccess is false due to error)

**Access Logic**:
- User must be a member of at least one local group
- That group must have at least one host alias permission assigned
- Wildcard (*) permissions grant access to all devices
- SSO group mappings and direct group memberships are both considered

---

## Group Timestamps (Caching Optimization)

### GET /api/user/group-timestamps

**Description**: Returns the current `permissionsLastModified` timestamps for the authenticated user's groups. Used by the client-side caching system to validate cached permission results and optimize performance.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can get own group timestamps
- **ADMIN**: ✅ Can get own group timestamps
- **SUPER_ADMIN**: ✅ Can get own group timestamps

#### Usage Case 1: User with Group Memberships

**Scenario**: User belongs to multiple groups with different permission timestamps

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/user/group-timestamps" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "timestamps": {
    "group-uuid-1": "2023-12-01T10:30:00.000Z",
    "group-uuid-2": "2023-12-01T11:45:00.000Z",
    "group-uuid-3": "2023-12-02T09:15:00.000Z"
  }
}
```

#### Usage Case 2: User with No Group Memberships

**Scenario**: User has no group assignments

**Success Response**:
```json
{
  "timestamps": {}
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

**Response Fields**:
- `timestamps`: Object mapping group IDs to their last modification timestamps
  - Key: Group ID (string)
  - Value: ISO 8601 timestamp string in UTC

**Usage Notes**:
- This endpoint is primarily used by the permissions caching optimization system
- Timestamps are updated when group permissions change (host alias assignments, etc.)
- Used to determine if cached permission results are still valid
- Returns timestamps only for groups the authenticated user belongs to
- All timestamps are in UTC ISO 8601 format

**Caching Integration**:
- Client-side cache compares these timestamps with cached values
- If any timestamp differs, cached permissions are invalidated
- Enables performance optimization while maintaining accuracy
- Reduces unnecessary database queries for unchanged permissions

## Error Responses

### 400 Bad Request
```json
{
  "error": "Invalid device information"
}
```

### 401 Unauthorized

**Authentication Required**:
```json
{
  "message": "Unauthorized"
}
```

**User ID Not Found**:
```json
{
  "message": "User ID not found in session"
}
```

**General Unauthorized**:
```json
{
  "error": "Authentication required"
}
```

### 403 Forbidden

**Access Denied**:
```json
{
  "error": "Access denied"
}
```

### 404 Not Found

**Device Not Found**:
```json
{
  "error": "Device not found"
}
```

### 500 Internal Server Error

**User Data Retrieval Error**:
```json
{
  "error": "Failed to retrieve user data"
}
```

**General Server Error**:
```json
{
  "message": "Internal server error"
}
```

**Device Access Check Error**:
```json
{
  "hasAccess": false,
  "message": "Internal server error"
}
```

## Notes

### Permission-Based Access

1. **Group Membership**: Users must be members of local groups to access devices
2. **Host Alias Assignments**: Groups must have host alias permissions assigned
3. **Wildcard Permissions**: Users with wildcard (*) permissions can access all devices
4. **SSO Integration**: Both direct group memberships and SSO group mappings are considered

### Data Filtering

1. **Permission-Based**: Device data is filtered based on user's group permissions
2. **Global Filters**: System-wide group filters are applied to limit visible groups
3. **User-Specific Filters**: Individual user filters can further restrict access
4. **Real-time Data**: Device information is fetched in real-time from OPNsense

### Device Information

1. **Host Aliases**: Devices are represented as OPNsense host aliases
2. **DHCP Integration**: DHCP reservation information is included when available
3. **Network Detection**: MAC addresses and vendor information from network detection
4. **Group Membership**: Shows which groups each device belongs to

### Access Control

1. **Own Data Only**: Users can only access devices they have permissions for
2. **Role-Independent**: All authenticated users (USER, ADMIN, SUPER_ADMIN) use same logic
3. **Dynamic Permissions**: Permissions are evaluated in real-time based on current group memberships
4. **Audit Logging**: Device access attempts are logged for security monitoring

### Error Handling

1. **Consistent Format**: All errors follow standard JSON error response format
2. **Graceful Degradation**: Empty arrays returned when user has no permissions
3. **Security Considerations**: Generic error messages to prevent information disclosure
4. **Session Validation**: Proper handling of authentication and session issues

---

### GET /api/user/global-settings-timestamp

**Description**: Get the current global settings timestamp for cache invalidation purposes.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can access global settings timestamp
- **ADMIN**: ✅ Can access global settings timestamp
- **SUPER_ADMIN**: ✅ Can access global settings timestamp

**Purpose**: This endpoint is used by the permission caching system to validate whether cached permissions are still valid. When global settings change (such as IP allow/exclude lists), the timestamp updates, causing cached permissions to be invalidated.

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/user/global-settings-timestamp" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
{
  "timestamp": "2025-09-29T08:24:44.170Z"
}
```

**Response Fields**:
- `timestamp` (string): ISO 8601 timestamp of when global settings were last modified

**Error Responses**:

**401 Unauthorized**:
```json
{
  "error": "Authentication required"
}
```

**404 Not Found**:
```json
{
  "error": "Global settings not found"
}
```

**500 Internal Server Error**:
```json
{
  "error": "Failed to fetch global settings timestamp"
}
```

**Usage Notes**:
1. **Cache Validation**: This endpoint is primarily used by the `useSelfServiceValidation` hook for cache invalidation
2. **Performance**: Lightweight endpoint that only returns the timestamp, not full settings
3. **Security**: Requires authentication but timestamp information is not sensitive
4. **Frequency**: Called when validating cached permissions (typically once per hour or when cache is invalidated)

## Rate Limiting

**Rate Limit Strategy:** User-based

**Default Rate Limits:**
- **Public Endpoints**: N/A (all endpoints require authentication)
- **Authenticated Endpoints**: 1000 requests per hour per user
- **API Key Endpoints**: Configurable per key (default: 1000/hour)

**Rate Limit Identification:**
- **Authenticated Endpoints**: Identified by user ID
- **API Key Endpoints**: Identified by API key ID

**Rate Limit Headers:**
All rate limited responses include the following headers:
- `X-RateLimit-Limit`: Maximum requests allowed in current window
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Unix timestamp when rate limit window resets
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

**Endpoint-Specific Rate Limits:**

### User Profile Management Endpoints
- **GET /api/user/profile**: 1000 requests per hour per user
  - Standard rate limit for profile retrieval
  - Window: 1 hour sliding window
  
- **PUT /api/user/profile**: 100 requests per hour per user
  - Limited to prevent profile update abuse
  - Window: 1 hour sliding window

### Device Management Endpoints
- **GET /api/user/devices**: 500 requests per hour per user
  - Moderate limit for device listing to prevent excessive polling
  - Window: 1 hour sliding window

### Group Filter Endpoints
- **GET /api/user/group-filters**: 200 requests per hour per user
  - Limited to prevent excessive filter polling
  - Window: 1 hour sliding window

### Device Access Check Endpoints
- **GET /api/user/has-device-access**: 1000 requests per hour per user
  - Standard rate limit for access checking
  - Window: 1 hour sliding window

### Group Timestamp Endpoints (Caching Optimization)
- **GET /api/user/group-timestamps**: 100 requests per hour per user
  - Limited to prevent excessive cache validation requests
  - Window: 1 hour sliding window
  
- **GET /api/user/global-settings-timestamp**: 100 requests per hour per user
  - Limited to prevent excessive cache validation requests
  - Window: 1 hour sliding window

**Best Practices for Handling Rate Limits:**

1. **Monitor Headers**: Always check rate limit headers in API responses
   ```javascript
   const response = await fetch('/api/user/devices', {
     headers: { 'Authorization': `Bearer ${apiKey}` }
   });
   
   const limit = response.headers.get('X-RateLimit-Limit');
   const remaining = response.headers.get('X-RateLimit-Remaining');
   const reset = response.headers.get('X-RateLimit-Reset');
   
   console.log(`Rate limit: ${remaining}/${limit} (resets at ${new Date(reset * 1000)}`);
   ```

2. **Implement Exponential Backoff**: Use exponential backoff when receiving 429 responses
   ```javascript
   async function fetchUserDevicesWithRetry(maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       const response = await fetch('/api/user/devices');
       
       if (response.status === 429) {
         const retryAfter = parseInt(response.headers.get('X-RateLimit-Retry-After'));
         const delay = Math.min(Math.pow(2, i) * 1000, retryAfter * 1000);
         
         await new Promise(resolve => setTimeout(resolve, delay));
         continue;
       }
       
       return response.json();
     }
     throw new Error('Max retries exceeded due to rate limiting');
   }
   ```

3. **Cache Device Data**: Cache device information to reduce repeated calls
   ```javascript
   class DeviceCache {
     constructor(ttl = 5 * 60 * 1000) { // 5 minutes TTL
       this.cache = new Map();
       this.ttl = ttl;
     }
     
     get(key) {
       const item = this.cache.get(key);
       if (!item || Date.now() - item.timestamp > this.ttl) {
         this.cache.delete(key);
         return null;
       }
       return item.data;
     }
     
     set(key, data) {
       this.cache.set(key, {
         data,
         timestamp: Date.now()
       });
     }
   }
   
   const deviceCache = new DeviceCache();
   
   async function getUserDevices() {
     const cached = deviceCache.get('user-devices');
     if (cached) {
       return cached;
     }
     
     const devices = await fetch('/api/user/devices').then(r => r.json());
     deviceCache.set('user-devices', devices);
     return devices;
   }
   ```

4. **Optimize Permission Checking**: Use timestamps for cache validation
   ```javascript
   class PermissionCache {
     constructor() {
       this.groupTimestamps = new Map();
       this.globalTimestamp = null;
       this.permissions = new Map();
     }
     
     async checkPermissions() {
       const currentGroupTimestamps = await this.fetchGroupTimestamps();
       const currentGlobalTimestamp = await this.fetchGlobalTimestamp();
       
       // Check if cache is still valid
       if (this.isCacheValid(currentGroupTimestamps, currentGlobalTimestamp)) {
         return this.permissions;
       }
       
       // Cache invalid, fetch fresh permissions
       const permissions = await this.fetchFreshPermissions();
       this.updateCache(permissions, currentGroupTimestamps, currentGlobalTimestamp);
       
       return permissions;
     }
     
     isCacheValid(groupTimestamps, globalTimestamp) {
       if (this.globalTimestamp !== globalTimestamp) {
         return false;
       }
       
       for (const [groupId, timestamp] of Object.entries(groupTimestamps)) {
         if (this.groupTimestamps.get(groupId) !== timestamp) {
           return false;
         }
       }
       
       return true;
     }
   }
   ```

5. **Batch Device Operations**: Combine multiple device operations when possible
   ```javascript
   // Instead of multiple individual device checks
   async function checkMultipleDevices(deviceIds) {
     const devices = await getUserDevices();
     const deviceMap = new Map(devices.map(d => [d.id, d]));
     
     return deviceIds.map(id => deviceMap.get(id));
   }
   
   // Use cached device data for multiple operations
   const devices = await getUserDevices();
   const deviceAccess = devices.map(device => ({
     id: device.id,
     hasAccess: true // Already filtered by permissions
   }));
   ```

6. **Implement Smart Polling**: Use appropriate polling intervals
   ```javascript
   class SmartPoller {
     constructor(endpoint, options = {}) {
       this.endpoint = endpoint;
       this.interval = options.interval || 60000; // 1 minute default
       this.maxInterval = options.maxInterval || 300000; // 5 minutes max
       this.backoffMultiplier = options.backoffMultiplier || 1.5;
       this.currentInterval = this.interval;
     }
     
     async start(callback) {
       const poll = async () => {
         try {
           const response = await fetch(this.endpoint);
           
           if (response.status === 429) {
             // Back off on rate limit
             this.currentInterval = Math.min(
               this.currentInterval * this.backoffMultiplier,
               this.maxInterval
             );
           } else {
             // Reset interval on success
             this.currentInterval = this.interval;
             await callback(await response.json());
           }
         } catch (error) {
           console.error('Polling error:', error);
         }
         
         setTimeout(poll, this.currentInterval);
       };
       
       poll();
     }
   }
   
   // Poll for device updates with smart backoff
   const devicePoller = new SmartPoller('/api/user/devices', {
     interval: 30000, // 30 seconds
     maxInterval: 300000 // 5 minutes
   });
   
   devicePoller.start((devices) => {
     updateDeviceList(devices);
   });
   ```

7. **Rate Limit Monitoring**: Implement proactive rate limit monitoring
   ```javascript
   class UserRateLimitMonitor {
     constructor() {
       this.limits = new Map();
       this.warnings = new Map();
     }
     
     updateLimit(endpoint, headers) {
       const limit = parseInt(headers.get('X-RateLimit-Limit'));
       const remaining = parseInt(headers.get('X-RateLimit-Remaining'));
       const reset = parseInt(headers.get('X-RateLimit-Reset'));
       
       this.limits.set(endpoint, {
         limit,
         remaining,
         reset,
         lastUpdate: Date.now()
       });
       
       // Warn when approaching limit
       const threshold = limit * 0.2; // Warn at 20% remaining
       if (remaining <= threshold && !this.warnings.has(endpoint)) {
         this.warnings.set(endpoint, true);
         this.showRateLimitWarning(endpoint, remaining, limit);
       }
       
       // Clear warning when limit resets
       if (remaining > threshold) {
         this.warnings.delete(endpoint);
       }
     }
     
     showRateLimitWarning(endpoint, remaining, limit) {
       const percentage = ((remaining / limit) * 100).toFixed(1);
       console.warn(`Rate limit warning for ${endpoint}: ${remaining}/${limit} (${percentage}%) remaining`);
       
       // Show user-friendly notification
       showNotification({
         type: 'warning',
         message: `Approaching rate limit for ${endpoint}. ${percentage}% remaining.`,
         duration: 5000
       });
     }
   }
   
   const rateMonitor = new UserRateLimitMonitor();
   
   // Monitor all user endpoint requests
   const originalFetch = window.fetch;
   window.fetch = async function(url, options) {
     const response = await originalFetch.apply(this, arguments);
     
     if (url.startsWith('/api/user/')) {
       rateMonitor.updateLimit(url, response.headers);
     }
     
     return response;
   };
   ```

8. **Graceful Degradation**: Handle rate limits gracefully in UI
   ```javascript
   async function loadUserDevices() {
     try {
       const devices = await fetchUserDevicesWithRetry();
       displayDevices(devices);
     } catch (error) {
       if (error.status === 429) {
         showRateLimitWarning(error.rateLimitInfo);
         
         // Show cached data if available
         const cachedDevices = deviceCache.get('user-devices');
         if (cachedDevices) {
           displayDevices(cachedDevices, true); // true indicates cached data
           showNotification('Showing cached data due to rate limit', 'info');
         } else {
           showErrorMessage('Unable to load devices. Please try again later.');
         }
       } else {
         showErrorMessage('Failed to load devices: ' + error.message);
       }
     }
   }
   ```

**Rate Limit Reset Behavior:**

1. **Sliding Windows**: Most endpoints use sliding windows for better user experience
2. **Independent Counters**: Each endpoint type has independent rate limit counters
3. **User-Based Limits**: Rate limits are applied per user, not per IP
4. **Immediate Reset**: Counters reset immediately when window expires
5. **Cumulative Limits**: Multiple endpoint types share the same overall user rate limit

**Caching Strategy:**

1. **Device Caching**: Cache device data for 5-15 minutes depending on use case
2. **Permission Caching**: Use timestamp-based cache invalidation for permissions
3. **Group Filter Caching**: Cache group filters as they change infrequently
4. **Smart Refresh**: Only refresh data when timestamps indicate changes
5. **Background Updates**: Use background polling with smart backoff

**Security Considerations:**

1. **Permission-Based Access**: All data is filtered by user permissions
2. **Audit Logging**: All rate limit violations are logged for security monitoring
3. **Data Isolation**: Users can only access their own data
4. **Session Validation**: Proper handling of authentication and session issues
5. **Rate Limit Bypass Prevention**: Multiple rate limit strategies prevent abuse

**Testing Rate Limits:**

Use the `/api/test-rate-limit` endpoint to test current rate limit status:
```bash
curl -X GET "https://example.com/api/test-rate-limit" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

This will return current rate limit information without consuming significant quota from your actual limits.

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