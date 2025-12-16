# MAC Exclusion Endpoints

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
curl -X GET "${SERVER_URL}/api/admin/mac-tracking/exclusions" \
  -H "Authorization: Bearer ${API_KEY}"
```

This section covers all MAC Exclusion API endpoints for managing MAC address exclusions, enhanced MAC history tracking, and exclusion settings configuration.

## Overview

The MAC Exclusion system provides comprehensive management capabilities for excluding specific MAC addresses from tracking, monitoring exclusion status, and maintaining detailed IP history records. This system integrates seamlessly with the existing MAC Address Tracking functionality while providing granular control over exclusion policies.

## Role-Based Access Control

**Authentication Required:** Yes (except where noted)

**Role Requirements:**
- **USER**: ❌ Cannot access any MAC exclusion endpoints
- **ADMIN**: ✅ Read-only access (view exclusions, view history, toggle exclusions)
- **SUPER_ADMIN**: ✅ Full access (all ADMIN permissions plus deletion, settings management, bulk operations)

**Role Access:**
- **USER:** No access to MAC exclusion functionality
- **ADMIN:** Read-only access to view exclusions, view history, and toggle exclusions
- **SUPER_ADMIN:** Full access to all MAC exclusion functionality including deletion and settings management

**Example Responses:**

**USER Role attempting to access MAC exclusions:**
```json
{
  "success": false,
  "message": "Unauthorized for MAC exclusion access"
}
```

**ADMIN Role successfully accessing MAC exclusions:**
```json
{
  "success": true,
  "data": {
    "exclusions": [
      {
        "id": "clm123abc456def789",
        "macAddressId": "clm456def789ghi012",
        "macAddress": {
          "id": "clm456def789ghi012",
          "macAddress": "aa:bb:cc:dd:ee:ff",
          "deviceName": "Test Device",
          "vendor": "Test Vendor"
        },
        "enabled": true,
        "reason": "Test device for development",
        "excludedBy": "admin-user-id",
        "excludedAt": "2025-01-15T10:30:00.000Z",
        "lastModifiedBy": "admin-user-id",
        "lastModifiedAt": "2025-01-15T10:30:00.000Z"
      }
    ],
    "totalCount": 1,
    "currentPage": 1,
    "totalPages": 1
  }
}
```

**SUPER_ADMIN Role successfully accessing MAC exclusions:**
```json
{
  "success": true,
  "data": {
    "exclusions": [
      {
        "id": "clm123abc456def789",
        "macAddressId": "clm456def789ghi012",
        "macAddress": {
          "id": "clm456def789ghi012",
          "macAddress": "aa:bb:cc:dd:ee:ff",
          "deviceName": "Test Device",
          "vendor": "Test Vendor"
        },
        "enabled": true,
        "reason": "Test device for development",
        "excludedBy": "admin-user-id",
        "excludedAt": "2025-01-15T10:30:00.000Z",
        "lastModifiedBy": "admin-user-id",
        "lastModifiedAt": "2025-01-15T10:30:00.000Z"
      }
    ],
    "totalCount": 1,
    "currentPage": 1,
    "totalPages": 1
  }
}
```

**Feature Toggle:** All endpoints return `403 Forbidden` when MAC Address Tracking is disabled in Global Settings.

## Core MAC Exclusion Endpoints

### GET /api/admin/mac-tracking/exclusions

**Description**: Retrieve paginated list of all MAC exclusions with comprehensive filtering and search capabilities.

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

- `search` (string, optional): Search term (searches MAC address, reason, excluded by user)
  - **Validation**: String length 1-255 characters
  - **Example**: `"aa:bb:cc"` or `"test device"`

- `enabled` (boolean, optional): Filter by enabled status (true/false)
  - **Validation**: Must be true or false
  - **Example**: `true`

- `sortBy` (string, optional): Sort field - `excludedAt`, `macAddress`, `reason` (default: `excludedAt`)
  - **Validation**: Must be one of: `excludedAt`, `macAddress`, `reason`
  - **Example**: `excludedAt`

- `sortDirection` (string, optional): Sort direction - `asc`, `desc` (default: `desc`)
  - **Validation**: Must be `asc` or `desc`
  - **Example**: `desc`

#### Usage Case 1: Get All Exclusions (Paginated)

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/exclusions?page=1&limit=25&sortBy=excludedAt&sortDirection=desc" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "exclusions": [
      {
        "id": "clm123abc456def789",
        "macAddressId": "clm456def789ghi012",
        "macAddress": {
          "id": "clm456def789ghi012",
          "macAddress": "aa:bb:cc:dd:ee:ff",
          "deviceName": "Test Device",
          "vendor": "Test Vendor"
        },
        "enabled": true,
        "reason": "Test device for development",
        "excludedBy": "admin-user-id",
        "excludedAt": "2025-01-15T10:30:00.000Z",
        "lastModifiedBy": "admin-user-id",
        "lastModifiedAt": "2025-01-15T10:30:00.000Z"
      }
    ],
    "totalCount": 1,
    "currentPage": 1,
    "totalPages": 1
  }
}
```

#### Usage Case 2: Search Exclusions

**Example Request** (Search by MAC address):
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/exclusions?search=aa:bb:cc" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Request** (Filter by enabled status):
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/exclusions?enabled=true" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

### POST /api/admin/mac-tracking/exclusions

**Description**: Create a new MAC exclusion for the specified MAC address.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Create exclusions
- **SUPER_ADMIN**: ✅ Create exclusions

**Request Body**:
```json
{
  "macAddress": "aa:bb:cc:dd:ee:ff",
  "reason": "Test device for development"
}
```

**Body Parameters:**
- `macAddress` (string, required): MAC address in any format (aa:bb:cc:dd:ee:ff, aa-bb-cc-dd-ee-ff, aabbccddeeff)
- `reason` (string, optional): Reason for exclusion (max 500 characters)

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/admin/mac-tracking/exclusions" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "macAddress": "aa:bb:cc:dd:ee:ff",
    "reason": "Test device for development"
  }'
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "id": "clm123abc456def789",
    "macAddressId": "clm456def789ghi012",
    "enabled": true,
    "reason": "Test device for development",
    "excludedBy": "admin-user-id",
    "excludedAt": "2025-01-15T10:30:00.000Z",
    "lastModifiedAt": "2025-01-15T10:30:00.000Z"
  },
  "message": "MAC exclusion created successfully"
}
```

### PUT /api/admin/mac-tracking/exclusions/[id]

**Description**: Update an existing MAC exclusion (enable/disable or modify reason).

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Update exclusions
- **SUPER_ADMIN**: ✅ Update exclusions

**Path Parameters:**
- `id` (string, required): Exclusion ID

**Request Body**:
```json
{
  "enabled": true,
  "reason": "Updated reason for exclusion"
}
```

**Body Parameters:**
- `enabled` (boolean, optional): Enable or disable the exclusion
- `reason` (string, optional): Updated reason for exclusion (max 500 characters)

**Example Request**:
```bash
curl -X PUT "{{SERVER_URL}}/api/admin/mac-tracking/exclusions/clm123abc456def789" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": false,
    "reason": "Temporarily disable exclusion"
  }'
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "id": "clm123abc456def789",
    "macAddressId": "clm456def789ghi012",
    "enabled": false,
    "reason": "Temporarily disable exclusion",
    "excludedBy": "admin-user-id",
    "excludedAt": "2025-01-15T10:30:00.000Z",
    "lastModifiedBy": "admin-user-id",
    "lastModifiedAt": "2025-01-16T09:15:00.000Z"
  },
  "message": "MAC exclusion updated successfully"
}
```

### DELETE /api/admin/mac-tracking/exclusions/[id]

**Description**: Delete a MAC exclusion permanently.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Delete exclusions
- **SUPER_ADMIN**: ✅ Delete exclusions

**Path Parameters:**
- `id` (string, required): Exclusion ID

**Example Request**:
```bash
curl -X DELETE "{{SERVER_URL}}/api/admin/mac-tracking/exclusions/clm123abc456def789" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "message": "MAC exclusion deleted successfully"
}
```

## Toggle Exclusion Endpoint

### POST /api/admin/mac-exclusions/[macAddress]/toggle

**Description**: Toggle exclusion status for a specific MAC address (create if doesn't exist, update if exists).

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Toggle exclusions
- **SUPER_ADMIN**: ✅ Toggle exclusions

**Path Parameters:**
- `macAddress` (string, required): MAC address (URL encoded, e.g., `aa%3Abb%3Acc%3Add%3Aee%3Aff`)

**Request Body**:
```json
{
  "enabled": true,
  "reason": "Exclude test device from tracking"
}
```

**Body Parameters:**
- `enabled` (boolean, required): Enable or disable exclusion
- `reason` (string, optional): Reason for the exclusion change

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/admin/mac-exclusions/aa%3Abb%3Acc%3Add%3Aee%3Aff/toggle" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "reason": "Exclude test device from tracking"
  }'
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "id": "clm123abc456def789",
    "macAddressId": "clm456def789ghi012",
    "enabled": true,
    "reason": "Exclude test device from tracking",
    "excludedBy": "admin-user-id",
    "excludedAt": "2025-01-15T10:30:00.000Z",
    "lastModifiedAt": "2025-01-15T10:30:00.000Z"
  },
  "message": "MAC exclusion toggled successfully"
}
```

> Cleanup behavior notes
>
> - Enabling exclusion in PARTIAL mode deletes all historical MacIpHistoryEntry records for the MAC (current IP associations preserved).
> - Enabling exclusion in FULL mode deletes both MacIpHistoryEntry and MacIpAssociation records for the MAC.
>   - PARTIAL → FULL: delete MacIpHistoryEntry and MacIpAssociation

> Cache Invalidation
>
> When exclusion status is toggled, the system immediately invalidates the MAC exclusion cache. This ensures that the next ARP scan will respect the updated exclusion rules without delay.

> Enhanced Response with Multi-IP Detection
>
> When enabling PARTIAL exclusion, the response now includes `multiIpWarning` if multiple IPs are detected:
> ```json
> {
>   "success": true,
>   "data": { ... },
>   "multiIpWarning": {
>     "hasMultipleIps": true,
>     "ipCount": 2,
>     "riskLevel": "MEDIUM",
>     "ips": [
>       {
>         "ipAddress": "192.168.3.100",
>         "firstSeen": "2025-11-03T10:00:00Z",
>         "lastSeen": "2025-11-03T14:30:00Z",
>         "networkInterface": "em0",
>         "isActive": true
>       },
>       {
>         "ipAddress": "192.168.3.101",
>         "firstSeen": "2025-11-03T11:00:00Z",
>         "lastSeen": "2025-11-03T14:25:00Z",
>         "networkInterface": "em1",
>         "isActive": true
>       }
>     ]
>   }
> }
> ```

## Multiple IP Detection Endpoint

### GET /api/admin/mac-exclusions/[macAddress]/multi-ip-detection

**Description**: Detect if a MAC address has been associated with multiple IP addresses (potential MAC spoofing, device roaming, or firewall MACs with multiple subinterfaces).

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Read-only access
- **SUPER_ADMIN**: ✅ Read-only access

**Path Parameters:**
- `macAddress` (string, required): MAC address (URL encoded, e.g., `aa%3Abb%3Acc%3Add%3Aee%3Aff`)

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-exclusions/aa%3Abb%3Acc%3Add%3Aee%3Aff/multi-ip-detection" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "hasMultipleIps": true,
    "ipCount": 2,
    "riskLevel": "MEDIUM",
    "ips": [
      {
        "ipAddress": "192.168.3.100",
        "firstSeen": "2025-11-03T10:00:00Z",
        "lastSeen": "2025-11-03T14:30:00Z",
        "networkInterface": "em0",
        "isActive": true
      },
      {
        "ipAddress": "192.168.3.101",
        "firstSeen": "2025-11-03T11:00:00Z",
        "lastSeen": "2025-11-03T14:25:00Z",
        "networkInterface": "em1",
        "isActive": true
      }
    ]
  }
}
```

**Risk Level Calculation:**
- `LOW`: Single IP or all inactive IPs
- `MEDIUM`: Multiple active IPs from the same network interface
- `HIGH`: Multiple active IPs from different network interfaces (potential MAC spoofing)

**Error Response** (MAC not found):
```json
{
  "success": false,
  "message": "MAC address not found"
}
```

**Use Cases:**
- Detect device roaming before enabling PARTIAL exclusion
- Identify potential MAC spoofing attempts
- Monitor firewall MACs with multiple subinterfaces
- Risk assessment for network security

---

## Enhanced MAC History Endpoint

### GET /api/admin/mac-tracking/[macAddress]/history

**Description**: Enhanced MAC history endpoint that includes IP history, exclusion status, and comprehensive device information.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Read-only access
- **SUPER_ADMIN**: ✅ Read-only access

**Path Parameters:**
- `macAddress` (string, required): MAC address (URL encoded, e.g., `aa%3Abb%3Acc%3Add%3Aee%3Aff`)

**Query Parameters:**
- `page` (number, optional): Page number for pagination (default: 1)
- `pageSize` (number, optional): Items per page (default: 25, max: 500)
- `days` (number, optional): Filter history to last N days
- `includeIpHistory` (boolean, optional): Include IP history list (default: true)

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/aa%3Abb%3Acc%3Add%3Aee%3Aff/history?page=1&pageSize=25&days=30&includeIpHistory=true" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "macAddress": {
      "id": "clm456def789ghi012",
      "macAddress": "aa:bb:cc:dd:ee:ff",
      "firstSeen": "2025-01-10T08:00:00.000Z",
      "lastSeen": "2025-01-15T14:30:00.000Z",
      "isActive": true,
      "isPrivacyMac": false,
      "deviceName": "Test Device",
      "vendor": "Test Vendor"
    },
    "history": [
      {
        "id": "clm789ghi012jkl345",
        "ipAddress": "192.168.1.100",
        "networkInterface": "em0",
        "firstSeen": "2025-01-10T08:00:00.000Z",
        "lastSeen": "2025-01-15T14:30:00.000Z",
        "isActive": true
      }
    ],
    "ipHistory": [
      {
        "id": "clm012jkl345mno678",
        "ipAddress": "192.168.1.100",
        "networkInterface": "em0",
        "firstSeen": "2025-01-10T08:00:00.000Z",
        "lastSeen": "2025-01-15T14:30:00.000Z",
        "detectionCount": 15
      },
      {
        "id": "clm345mno678pqr901",
        "ipAddress": "192.168.1.101",
        "networkInterface": "em0",
        "firstSeen": "2025-01-08T09:15:00.000Z",
        "lastSeen": "2025-01-09T17:45:00.000Z",
        "detectionCount": 8
      }
    ],
    "exclusion": {
      "id": "clm123abc456def789",
      "enabled": true,
      "reason": "Test device for development",
      "excludedBy": "admin-user-id",
      "excludedAt": "2025-01-15T10:30:00.000Z"
    },
    "pagination": {
      "currentPage": 1,
      "pageSize": 25,
      "totalCount": 1,
      "totalPages": 1
    }
  }
}
```

## IP History Management Endpoints

### GET /api/admin/mac-tracking/[macAddress]/ip-history

**Description**: Get detailed IP history for a specific MAC address with pagination and filtering.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Read-only access
- **SUPER_ADMIN**: ✅ Read-only access

**Path Parameters:**
- `macAddress` (string, required): MAC address (URL encoded, e.g., `aa%3Abb%3Acc%3Add%3Aee%3Aff`)

**Query Parameters:**
- `page` (number, optional): Page number for pagination (default: 1)
- `limit` (number, optional): Items per page (default: 50, max: 100)
- `days` (number, optional): Filter to last N days
- `sortBy` (string, optional): Sort field - `lastSeen`, `firstSeen`, `detectionCount` (default: `lastSeen`)
- `sortDirection` (string, optional): Sort direction - `asc`, `desc` (default: `desc`)

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/aa%3Abb%3Acc%3Add%3Aee%3Aff/ip-history?page=1&limit=25&days=30&sortBy=lastSeen&sortDirection=desc" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "ipHistory": [
      {
        "id": "clm012jkl345mno678",
        "ipAddress": "192.168.1.100",
        "networkInterface": "em0",
        "firstSeen": "2025-01-10T08:00:00.000Z",
        "lastSeen": "2025-01-15T14:30:00.000Z",
        "detectionCount": 15,
        "isActive": true
      },
      {
        "id": "clm345mno678pqr901",
        "ipAddress": "192.168.1.101",
        "networkInterface": "em0",
        "firstSeen": "2025-01-08T09:15:00.000Z",
        "lastSeen": "2025-01-09T17:45:00.000Z",
        "detectionCount": 8,
        "isActive": false
      }
    ],
    "totalCount": 2,
    "currentPage": 1,
    "totalPages": 1
  }
}
```

### DELETE /api/admin/mac-tracking/[macAddress]/ip-history

**Description**: Clear all IP history for a specific MAC address.

**Authentication**: Required (session or API key with SUPER_ADMIN role only)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ❌ Forbidden
- **SUPER_ADMIN**: ✅ Clear IP history

**Path Parameters:**
- `macAddress` (string, required): MAC address (URL encoded, e.g., `aa%3Abb%3Acc%3Add%3Aee%3Aff`)

**Example Request**:
```bash
curl -X DELETE "{{SERVER_URL}}/api/admin/mac-tracking/aa%3Abb%3Acc%3Add%3Aee%3Aff/ip-history" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "message": "IP history cleared successfully",
  "deletedCount": 2
}
```

## Exclusion Settings Endpoints

### GET /api/admin/mac-tracking/exclusion-settings

**Description**: Get MAC exclusion-related settings and configuration.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Read-only access
- **SUPER_ADMIN**: ✅ Read-only access

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/exclusion-settings" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "enableMacExclusions": true,
    "macExclusionRetentionDays": 90
  }
}
```

### PUT /api/admin/mac-tracking/exclusion-settings

**Description**: Update MAC exclusion-related settings.

**Authentication**: Required (session or API key with SUPER_ADMIN role only)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ❌ Forbidden
- **SUPER_ADMIN**: ✅ Update settings

**Request Body**:
```json
{
  "enableMacExclusions": true,
  "macExclusionRetentionDays": 90
}
```

**Body Parameters:**
- `enableMacExclusions` (boolean, optional): Enable or disable MAC exclusions feature
- `macExclusionRetentionDays` (number, optional): Retention period for exclusion data (1-365 days)

**Example Request**:
```bash
curl -X PUT "{{SERVER_URL}}/api/admin/mac-tracking/exclusion-settings" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "enableMacExclusions": true,
    "macExclusionRetentionDays": 90
  }'
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "enableMacExclusions": true,
    "macExclusionRetentionDays": 90
  },
  "message": "Exclusion settings updated successfully"
}
```

## Error Handling

### 400 Bad Request
```json
{
  "success": false,
  "message": "Invalid MAC address format",
  "error": "MAC address must be in valid format (aa:bb:cc:dd:ee:ff)"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Unauthorized for MAC exclusion access"
}
```

### 403 Feature Disabled
```json
{
  "success": false,
  "message": "MAC Address Tracking feature is disabled"
}
```

### 403 Insufficient Permissions
```json
{
  "success": false,
  "message": "Unauthorized for this operation"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "MAC address not found"
}
```

### 404 Exclusion Not Found
```json
{
  "success": false,
  "message": "Exclusion not found"
}
```

### 409 Conflict
```json
{
  "success": false,
  "message": "Exclusion already exists for this MAC address"
}
```

### 422 Unprocessable Entity
```json
{
  "success": false,
  "message": "Validation failed",
  "details": {
    "reason": "Reason must be less than 500 characters"
  }
}
```

### 429 Too Many Requests
```json
{
  "success": false,
  "message": "Rate limit exceeded. Please try again later."
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Internal server error",
  "error": "Detailed error message"
}
```

## Rate Limiting

**Rate Limit Strategy:** User-based

**Default Rate Limits:**
- **Public Endpoints**: N/A (authenticated only)
- **Authenticated Endpoints**: 1000 requests per hour
- **API Key Endpoints**: Configurable per key (default: 1000/hour)

**Rate Limit Identification:**
- **Authenticated Endpoints**: Identified by user ID
- **API Key Endpoints**: Identified by API key ID

**Rate Limit Headers:**
All rate limited responses include the following headers:
- `X-RateLimit-Limit`: Maximum requests allowed in the current window
- `X-RateLimit-Remaining`: Remaining requests in the current window
- `X-RateLimit-Reset`: Unix timestamp when the rate limit window resets
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

**Best Practices for Handling Rate Limits:**
1. **Monitor Headers**: Always check rate limit headers in API responses
2. **Exponential Backoff**: Implement exponential backoff when receiving 429 responses
3. **Respect Retry-After**: Use the `Retry-After` header to determine when to retry
4. **Cache Responses**: Cache non-sensitive responses to reduce API calls
5. **Batch Operations**: Use batch endpoints when available to reduce request count
6. **API Key Limits**: Configure appropriate limits for your use case

## MAC Address Validation

The API accepts MAC addresses in multiple formats and automatically normalizes them:

**Accepted Formats:**
- `aa:bb:cc:dd:ee:ff` (colon-separated)
- `aa-bb-cc-dd-ee-ff` (hyphen-separated)
- `aabbccddeeff` (no separators)
- `AA:BB:CC:DD:EE:FF` (uppercase)

**Validation Rules:**
- Must contain exactly 12 hexadecimal characters
- Case-insensitive
- Separators are optional but must be consistent if used
- Leading/trailing whitespace is ignored

**Privacy MAC Detection:**
The system automatically detects privacy MAC addresses based on:
- Locally administered bit (bit 1 of the first octet)
- Common privacy MAC patterns used by modern devices

## Performance Considerations

**Database Optimization:**
- Indexed MAC addresses and exclusion IDs for fast lookups
- Efficient pagination with cursor-based navigation
- Optimized queries for large exclusion datasets

**Caching Strategy:**
- Exclusion list cached for 5 minutes
- MAC history cached for 2 minutes
- IP history cached for 2 minutes
- Settings cached for 10 minutes

**Cache Invalidation:**
- Exclusion changes clear related caches
- MAC tracking updates clear MAC-specific caches
- Settings changes clear all caches

## Security Considerations

**Access Control:**
- All endpoints require ADMIN or SUPER_ADMIN role
- Role-based permissions strictly enforced
- All operations logged in audit system
- IP tracking for API usage monitoring

**Input Validation:**
- Strict MAC address format validation with multiple accepted formats
- SQL injection prevention with parameterized queries
- XSS prevention with input sanitization
- Length limits enforced on all string fields
- Parameter validation for all query parameters

**Data Privacy:**
- No personal information collected beyond network identifiers
- Access logs maintained for security auditing
- Encryption of sensitive data at rest
- Secure transmission of all API data

**Network Security:**
- Multi-IP detection helps identify potential MAC spoofing
- Risk assessment based on network interface analysis
- Historical data cleanup options for privacy compliance
- Audit trail of all exclusion changes

**MAC Address Security:**
- Automatic detection of privacy MAC addresses
- Analysis of roaming vs. spoofing behavior
- Interface-specific analysis for multi-homed devices
- Time-based analysis to detect patterns

## Integration Examples

### JavaScript/TypeScript Example
```typescript
// Create a new exclusion
async function createExclusion(macAddress: string, reason?: string) {
  const response = await fetch(`${SERVER_URL}/api/admin/mac-tracking/exclusions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ macAddress, reason })
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.message);
  }

  return result.data;
}

// Toggle exclusion for a MAC
async function toggleExclusion(macAddress: string, enabled: boolean, reason?: string) {
  const encodedMac = encodeURIComponent(macAddress);
  const response = await fetch(`${SERVER_URL}/api/admin/mac-exclusions/${encodedMac}/toggle`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ enabled, reason })
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.message);
  }

  return result.data;
}

// Get MAC history with exclusion status
async function getMacHistory(macAddress: string, options?: {
  page?: number;
  pageSize?: number;
  days?: number;
  includeIpHistory?: boolean;
}) {
  const params = new URLSearchParams();
  if (options?.page) params.append('page', options.page.toString());
  if (options?.pageSize) params.append('pageSize', options.pageSize.toString());
  if (options?.days) params.append('days', options.days.toString());
  if (options?.includeIpHistory !== undefined) params.append('includeIpHistory', options.includeIpHistory.toString());

  const encodedMac = encodeURIComponent(macAddress);
  const response = await fetch(`${SERVER_URL}/api/admin/mac-tracking/${encodedMac}/history?${params}`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.message);
  }

  return result.data;
}
```

### Python Example
```python
import requests
import json

class MacExclusionAPI:
    def __init__(self, server_url, api_key):
        self.server_url = server_url
        self.api_key = api_key
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }

    def create_exclusion(self, mac_address, reason=None):
        """Create a new MAC exclusion"""
        data = {'macAddress': mac_address}
        if reason:
            data['reason'] = reason

        response = requests.post(
            f'{self.server_url}/api/admin/mac-tracking/exclusions',
            headers=self.headers,
            data=json.dumps(data)
        )

        result = response.json()
        if not result.get('success'):
            raise Exception(result.get('message', 'Unknown error'))

        return result.get('data')

    def toggle_exclusion(self, mac_address, enabled, reason=None):
        """Toggle exclusion for a MAC address"""
        data = {'enabled': enabled}
        if reason:
            data['reason'] = reason

        encoded_mac = requests.utils.quote(mac_address)
        response = requests.post(
            f'{self.server_url}/api/admin/mac-exclusions/{encoded_mac}/toggle',
            headers=self.headers,
            data=json.dumps(data)
        )

        result = response.json()
        if not result.get('success'):
            raise Exception(result.get('message', 'Unknown error'))

        return result.get('data')

    def get_exclusions(self, page=1, limit=50, search=None, enabled=None):
        """Get list of exclusions with filtering"""
        params = {'page': page, 'limit': limit}
        if search:
            params['search'] = search
        if enabled is not None:
            params['enabled'] = enabled

        response = requests.get(
            f'{self.server_url}/api/admin/mac-tracking/exclusions',
            headers=self.headers,
            params=params
        )

        result = response.json()
        if not result.get('success'):
            raise Exception(result.get('message', 'Unknown error'))

        return result.get('data')
```

## Configuration

MAC Exclusion functionality is configured through Global Settings and exclusion-specific settings:

**Global Settings Fields:**
- `enableMacTracking` (boolean): Enable/disable the entire MAC tracking feature
- `macTrackingInterval` (number): Scan interval in minutes (1-60)
- `macInactiveTimeout` (number): Minutes before marking device as inactive

**Exclusion Settings Fields:**
- `enableMacExclusions` (boolean): Enable/disable MAC exclusions specifically
- `macExclusionRetentionDays` (number): Retention period for exclusion data (1-365 days)

**Feature Toggle Behavior:**
- When MAC tracking is disabled, all exclusion endpoints return `403 Forbidden`
- When exclusions are disabled, exclusion management endpoints return `403 Forbidden`
- Navigation menu items are hidden when features are disabled
- Existing exclusions are preserved but not enforced when disabled

## Audit Logging

All MAC exclusion operations are logged in the audit system:

**Logged Operations:**
- Exclusion creation, modification, and deletion
- Toggle operations with before/after states
- Settings changes with old/new values
- IP history clearing operations
- Failed authentication attempts

**Audit Log Format:**
```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "userId": "admin-user-id",
  "action": "MAC_EXCLUSION_CREATED",
  "resource": "mac-exclusion",
  "resourceId": "clm123abc456def789",
  "details": {
    "macAddress": "aa:bb:cc:dd:ee:ff",
    "reason": "Test device for development",
    "enabled": true
  },
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0..."
}
```

This comprehensive API documentation provides all the necessary information for integrating with the MAC Exclusion system, including detailed endpoint descriptions, request/response formats, error handling, and practical examples for common use cases.

---

## API Navigation

### API Documentation
- [🔍 API Index](API_Index.md) - Complete API endpoint index
- [🔑 Authentication](02_authentication_endpoints.md) - Authentication methods

### Related API Categories
- [🔗 OPNsense Endpoints](07_opnsense_endpoints.md) - OPNsense firewall integration
- [👥 Host Group Management](08_host_group_management_endpoints.md) - Host group management
- [📊 Analytics Endpoints](11_analytics_endpoints.md) - Analytics and reporting

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

**Last Updated**: 2025-11-06 | **API Version**: v1.0 | **Category**: API Documentation