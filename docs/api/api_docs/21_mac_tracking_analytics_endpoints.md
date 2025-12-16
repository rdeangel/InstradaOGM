# MAC Address Tracking Analytics Endpoints

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
curl -X GET "${SERVER_URL}/api/admin/mac-tracking/analytics" \
  -H "Authorization: Bearer ${API_KEY}}"
```

This section covers all MAC Address Tracking Analytics API endpoints for comprehensive network device analytics, reporting, and data management.

## Overview

The MAC Address Tracking Analytics system provides comprehensive analytics and reporting capabilities for network device tracking data. It offers detailed insights into device activity patterns, network utilization, exclusion statistics, and historical trends for network administrators and security analysts.

## Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access any MAC tracking analytics endpoints
- **ADMIN**: ✅ Read-only access to analytics data and reports
- **SUPER_ADMIN**: ✅ Full access to analytics data, reports, and data management operations

**Role Access:**
- **USER**: ❌ Forbidden - insufficient permissions for all MAC tracking analytics endpoints
- **ADMIN**: ✅ Can access all analytics endpoints including device analytics, history, search, export, and service status
- **SUPER_ADMIN**: ✅ Can access all ADMIN endpoints plus data cleanup operations and advanced analytics

**Feature Toggle:** All endpoints return `403 Forbidden` when MAC Address Tracking is disabled in Global Settings.

**Example Responses:**

**ADMIN/SUPER_ADMIN Success (Analytics Access):**
```json
{
  "success": true,
  "data": {
    "totalMacs": 245,
    "activeMacs": 112,
    "inactiveMacs": 133,
    "privacyMacs": 17,
    "fullyExcludedMacs": 9,
    "partiallyExcludedMacs": 14
  }
}
```

**USER Role Failure:**
```json
{
  "success": false,
  "message": "Unauthorized for MAC tracking analytics access"
}
```

## Core Analytics Endpoints

### GET /api/admin/mac-tracking/analytics

**Description**: Retrieve comprehensive analytics for MAC Address Tracking, including device statistics, exclusion metrics, network utilization, and activity trends.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Read-only access to analytics data
- **SUPER_ADMIN**: ✅ Read-only access to analytics data

**Query Parameters:**
- `timeRange` (string, optional): Time range for analytics data (default: `30days`)
  - **Validation**: Must be one of: `7days`, `30days`, `90days`, `1year`
  - **Example**: `30days`

- `includeTrends` (boolean, optional): Include activity trend data (default: `true`)
  - **Validation**: Must be true or false
  - **Example**: `true`

- `includeTopLists` (boolean, optional): Include top interfaces and vendors (default: `true`)
  - **Validation**: Must be true or false
  - **Example**: `true`

- `groupBy` (string, optional): Grouping for analytics (default: `day`)
  - **Validation**: Must be one of: `hour`, `day`, `week`, `month`
  - **Example**: `day`

#### Usage Case 1: Get Basic Analytics

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
    "summary": {
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
      "exclusionPercentage": 9.39
    },
    "topInterfaces": [
      {
        "interface": "lan",
        "count": 180,
        "percentage": 73.47
      },
      {
        "interface": "wan",
        "count": 45,
        "percentage": 18.37
      },
      {
        "interface": "guest",
        "count": 20,
        "percentage": 8.16
      }
    ],
    "topVendors": [
      {
        "vendor": "Apple",
        "count": 74,
        "percentage": 30.20
      },
      {
        "vendor": "Samsung",
        "count": 32,
        "percentage": 13.06
      },
      {
        "vendor": "Google",
        "count": 28,
        "percentage": 11.43
      }
    ],
    "activityTrend": [
      {
        "date": "2025-10-29",
        "active": 105,
        "total": 240,
        "new": 2
      },
      {
        "date": "2025-10-30",
        "active": 108,
        "total": 242,
        "new": 1
      },
      {
        "date": "2025-10-31",
        "active": 112,
        "total": 245,
        "new": 3
      }
    ],
    "exclusionAnalytics": {
      "totalExclusions": 23,
      "activeExclusions": 23,
      "fullExclusions": 9,
      "partialExclusions": 14,
      "exclusionReasons": [
        {
          "reason": "Test device",
          "count": 8
        },
        {
          "reason": "Privacy concern",
          "count": 5
        },
        {
          "reason": "Security policy",
          "count": 10
        }
      ]
    },
    "generatedAt": "2025-11-06T15:12:00.000Z"
  }
}
```

#### Usage Case 2: Get Analytics with Custom Time Range

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/analytics?timeRange=90days&groupBy=week" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalMacs": 487,
      "activeMacs": 156,
      "inactiveMacs": 331,
      "privacyMacs": 34,
      "newMacsThisWeek": 5,
      "newMacsThisMonth": 18,
      "fullyExcludedMacs": 15,
      "partiallyExcludedMacs": 28,
      "privacyMacPercentage": 6.98,
      "exclusionPercentage": 8.84
    },
    "activityTrend": [
      {
        "date": "2025-08-17",
        "active": 142,
        "total": 465,
        "new": 8
      },
      {
        "date": "2025-08-24",
        "active": 148,
        "total": 472,
        "new": 7
      },
      {
        "date": "2025-08-31",
        "active": 156,
        "total": 487,
        "new": 15
      }
    ],
    "generatedAt": "2025-11-06T15:12:00.000Z"
  }
}
```

### GET /api/admin/mac-tracking/[macAddress]/history

**Description**: Retrieve comprehensive history and analytics for a specific MAC address, including IP associations, activity patterns, and exclusion status.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Read-only access to MAC history
- **SUPER_ADMIN**: ✅ Read-only access to MAC history

**Path Parameters:**
- `macAddress` (string, required): MAC address (URL encoded, e.g., `aa%3Abb%3Acc%3Add%3Aee%3Aff`)

**Query Parameters:**
- `days` (number, optional): Limit history to last N days (default: 30)
  - **Validation**: Must be between 1 and 365
  - **Example**: `30`

- `includeAnalytics` (boolean, optional): Include analytics calculations (default: `true`)
  - **Validation**: Must be true or false
  - **Example**: `true`

- `includeIpHistory` (boolean, optional): Include detailed IP history (default: `true`)
  - **Validation**: Must be true or false
  - **Example**: `true`

- `page` (number, optional): Page number for pagination (default: 1)
  - **Validation**: Must be >= 1
  - **Example**: `1`

- `limit` (number, optional): Items per page (default: 50, max: 100)
  - **Validation**: Must be between 1 and 100
  - **Example**: `25`

#### Usage Case 1: Get Complete MAC History with Analytics

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/aa%3Abb%3Acc%3Add%3Aee%3Aff/history?days=30&includeAnalytics=true&includeIpHistory=true" \
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
      "hostname": "iPhone-John",
      "isActive": true,
      "isPrivacyMac": false,
      "isOpnsenseMac": false,
      "firstSeen": "2024-01-15T10:30:00.000Z",
      "lastSeen": "2024-01-20T14:45:00.000Z",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-20T14:45:00.000Z"
    },
    "analytics": {
      "totalIpAssociations": 3,
      "uniqueInterfaces": 2,
      "averageSessionDuration": "2h 15m",
      "mostActiveInterface": "em0",
      "activityPattern": "business-hours",
      "riskScore": "low",
      "detectionCount": 45,
      "firstDetection": "2024-01-15T10:30:00.000Z",
      "lastDetection": "2024-01-20T14:45:00.000Z"
    },
    "currentAssociations": [
      {
        "id": "assoc-uuid-1",
        "ipAddress": "192.168.1.100",
        "interface": "em0",
        "firstSeen": "2024-01-15T10:30:00.000Z",
        "lastSeen": "2024-01-20T14:45:00.000Z",
        "hasDhcpReservation": true,
        "hasDhcpConflict": false,
        "isActive": true,
        "isOpnsenseInterface": false,
        "hostAlias": "device.local"
      }
    ],
    "ipHistory": [
      {
        "id": "history-uuid-1",
        "ipAddress": "192.168.1.100",
        "interface": "em0",
        "firstSeen": "2024-01-15T10:30:00.000Z",
        "lastSeen": "2024-01-20T14:45:00.000Z",
        "detectionCount": 25,
        "hasDhcpReservation": true,
        "hasDhcpConflict": false,
        "hostAlias": "device.local"
      },
      {
        "id": "history-uuid-2",
        "ipAddress": "192.168.1.101",
        "interface": "em1",
        "firstSeen": "2024-01-10T08:15:00.000Z",
        "lastSeen": "2024-01-14T16:20:00.000Z",
        "detectionCount": 15,
        "hasDhcpReservation": false,
        "hasDhcpConflict": false,
        "hostAlias": null
      }
    ],
    "exclusion": {
      "id": "exclusion-uuid-1",
      "enabled": false,
      "exclusionMode": null,
      "reason": null,
      "excludedBy": null,
      "excludedAt": null,
      "lastModifiedBy": null,
      "lastModifiedAt": null
    },
    "pagination": {
      "page": 1,
      "limit": 25,
      "total": 2,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
}
```

#### Usage Case 2: Get MAC History with Pagination

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/aa%3Abb%3Acc%3Add%3Aee%3Aff/history?page=1&limit=10&days=7" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

### GET /api/admin/mac-tracking/search

**Description**: Advanced search endpoint with enhanced analytics capabilities for MAC addresses, including search analytics and result aggregation.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Read-only access to search functionality
- **SUPER_ADMIN**: ✅ Read-only access to search functionality

**Query Parameters:**
- `q` (string, optional): General search query (searches across MAC address, device name, vendor, IP address, and host alias names)
  - **Validation**: String length 1-255 characters
  - **Example**: `apple`

- `mac` (string, optional): Search by MAC address
  - **Validation**: Valid MAC address format
  - **Example**: `aa:bb:cc:dd:ee:ff`

- `ip` (string, optional): Search by IP address
  - **Validation**: Valid IP address format
  - **Example**: `192.168.1.100`

- `hostname` (string, optional): Search by device hostname
  - **Validation**: String length 1-255 characters
  - **Example**: `iPhone`

- `vendor` (string, optional): Search by vendor
  - **Validation**: String length 1-255 characters
  - **Example**: `Apple`

- `hostAlias` (string, optional): Search by host alias name
  - **Validation**: String length 1-255 characters
  - **Example**: `device.local`

- `isActive` (boolean, optional): Filter by active status
  - **Validation**: Must be true or false
  - **Example**: `true`

- `isPrivacyMac` (boolean, optional): Filter by privacy MAC status
  - **Validation**: Must be true or false
  - **Example**: `false`

- `hasDhcpReservation` (boolean, optional): Filter by DHCP reservation status
  - **Validation**: Must be true or false
  - **Example**: `true`

- `excluded` (boolean, optional): Filter by exclusion status
  - **Validation**: Must be true or false
  - **Example**: `false`

- `limit` (number, optional): Maximum results (default: 50, max: 100)
  - **Validation**: Must be between 1 and 100
  - **Example**: `25`

- `includeAnalytics` (boolean, optional): Include search analytics (default: `false`)
  - **Validation**: Must be true or false
  - **Example**: `true`

- `sortBy` (string, optional): Sort field (default: `lastSeen`)
  - **Validation**: Must be one of: `lastSeen`, `firstSeen`, `macAddress`, `hostname`, `vendor`
  - **Example**: `lastSeen`

- `sortDirection` (string, optional): Sort direction (default: `desc`)
  - **Validation**: Must be `asc` or `desc`
  - **Example**: `desc`

#### Usage Case 1: General Search with Analytics

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/search?q=apple&limit=10&includeAnalytics=true" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "mac-uuid-1",
        "macAddress": "aa:bb:cc:dd:ee:ff",
        "vendor": "Apple, Inc.",
        "hostname": "iPhone-John",
        "isActive": true,
        "currentIp": "192.168.1.100",
        "lastSeen": "2024-01-20T14:45:00.000Z",
        "isPrivacyMac": false,
        "hasDhcpReservation": true,
        "excluded": false
      }
    ],
    "searchAnalytics": {
      "totalResults": 1,
      "searchTime": "0.045s",
      "searchFields": ["macAddress", "vendor", "hostname", "ipAddress", "hostAlias"],
      "queryType": "general",
      "filtersApplied": []
    },
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
}
```

#### Usage Case 2: Advanced Filtered Search

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/search?vendor=Apple&isActive=true&hasDhcpReservation=true&limit=25&sortBy=lastSeen&sortDirection=desc" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "mac-uuid-1",
        "macAddress": "aa:bb:cc:dd:ee:ff",
        "vendor": "Apple, Inc.",
        "hostname": "iPhone-John",
        "isActive": true,
        "currentIp": "192.168.1.100",
        "lastSeen": "2024-01-20T14:45:00.000Z",
        "isPrivacyMac": false,
        "hasDhcpReservation": true,
        "excluded": false
      }
    ],
    "searchAnalytics": {
      "totalResults": 1,
      "searchTime": "0.032s",
      "searchFields": ["vendor"],
      "queryType": "filtered",
      "filtersApplied": ["vendor", "isActive", "hasDhcpReservation"]
    },
    "pagination": {
      "page": 1,
      "limit": 25,
      "total": 1,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
}
```

### GET /api/admin/mac-tracking/cleanup

**Description**: Get analytics about MAC tracking data cleanup operations and recommendations for data management.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Read-only access to cleanup analytics
- **SUPER_ADMIN**: ✅ Read-only access to cleanup analytics and can execute cleanup operations

**Query Parameters:**
- `analyzeOnly` (boolean, optional): Analyze without performing cleanup (default: `true`)
  - **Validation**: Must be true or false
  - **Example**: `true`

- `retentionDays` (number, optional): Custom retention period for analysis (default: from global settings)
  - **Validation**: Must be between 1 and 365
  - **Example**: `90`

- `dryRun` (boolean, optional): Simulate cleanup without actual deletion (default: `true`)
  - **Validation**: Must be true or false
  - **Example**: `true`

#### Usage Case 1: Analyze Cleanup Requirements

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/cleanup?analyzeOnly=true&retentionDays=90" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "cleanupAnalysis": {
      "totalMacs": 245,
      "totalIpHistory": 1847,
      "retentionDays": 90,
      "cutoffDate": "2025-08-08T15:12:00.000Z",
      "recommendations": {
        "oldMacsToCleanup": 12,
        "oldIpHistoryToCleanup": 156,
        "privacyMacsToCleanup": 3,
        "estimatedSpaceReclaimed": "2.3 MB",
        "estimatedTimeToCleanup": "45 seconds"
      },
      "breakdown": {
        "inactiveMacs": {
          "total": 133,
          "olderThanRetention": 12,
          "percentage": 9.02
        },
        "ipHistoryEntries": {
          "total": 1847,
          "olderThanRetention": 156,
          "percentage": 8.45
        },
        "privacyMacs": {
          "total": 17,
          "olderThanRetention": 3,
          "percentage": 17.65
        }
      },
      "riskAssessment": {
        "lowRisk": 8,
        "mediumRisk": 3,
        "highRisk": 1,
        "recommendation": "Safe to proceed with cleanup"
      }
    },
    "lastCleanup": {
      "timestamp": "2025-10-15T10:30:00.000Z",
      "itemsCleaned": 145,
      "duration": "38 seconds",
      "spaceReclaimed": "1.8 MB"
    },
    "generatedAt": "2025-11-06T15:12:00.000Z"
  }
}
```

#### Usage Case 2: Execute Cleanup (SUPER_ADMIN only)

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/cleanup?analyzeOnly=false&dryRun=false&retentionDays=90" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "cleanupResults": {
      "executedAt": "2025-11-06T15:12:00.000Z",
      "retentionDays": 90,
      "duration": "42 seconds",
      "itemsCleaned": {
        "macAddresses": 12,
        "ipHistoryEntries": 156,
        "total": 168
      },
      "spaceReclaimed": "2.3 MB",
      "errors": []
    },
    "affectedMacs": [
      {
        "macAddress": "aa:bb:cc:dd:ee:ff",
        "reason": "Inactive for 120 days",
        "lastSeen": "2025-07-09T10:30:00.000Z"
      }
    ]
  },
  "message": "Cleanup completed successfully"
}
```

### GET /api/admin/mac-tracking/export

**Description**: Export MAC tracking analytics data in various formats for analysis, reporting, and integration with external systems.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Export access
- **SUPER_ADMIN**: ✅ Export access

**Query Parameters:**
- `format` (string, optional): Export format (default: `json`)
  - **Validation**: Must be one of: `json`, `csv`, `xlsx`, `pdf`
  - **Example**: `json`

- `includeAnalytics` (boolean, optional): Include analytics summary (default: `true`)
  - **Validation**: Must be true or false
  - **Example**: `true`

- `includeHistory` (boolean, optional): Include IP association history (default: `false`)
  - **Validation**: Must be true or false
  - **Example**: `false`

- `includeExclusions` (boolean, optional): Include exclusion data (default: `true`)
  - **Validation**: Must be true or false
  - **Example**: `true`

- `activeOnly` (boolean, optional): Export only active devices (default: `false`)
  - **Validation**: Must be true or false
  - **Example**: `false`

- `days` (number, optional): Limit to devices seen in last N days (default: all)
  - **Validation**: Must be between 1 and 365
  - **Example**: `30`

- `groupBy` (string, optional): Group data by field (default: none)
  - **Validation**: Must be one of: `vendor`, `interface`, `exclusion`
  - **Example**: `vendor`

- `fields` (string, optional): Comma-separated list of fields to include (default: all)
  - **Validation**: Valid field names only
  - **Example**: `macAddress,hostname,vendor,isActive,lastSeen`

#### Usage Case 1: Export JSON with Analytics

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/export?format=json&includeAnalytics=true&includeHistory=true&days=30" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "exportInfo": {
      "exportedAt": "2025-11-06T15:12:00.000Z",
      "format": "json",
      "totalDevices": 112,
      "activeDevices": 75,
      "timeRange": "30 days",
      "includes": ["analytics", "history", "exclusions"]
    },
    "analytics": {
      "summary": {
        "totalMacs": 112,
        "activeMacs": 75,
        "inactiveMacs": 37,
        "privacyMacs": 8,
        "fullyExcludedMacs": 4,
        "partiallyExcludedMacs": 7,
        "privacyMacPercentage": 7.14,
        "exclusionPercentage": 9.82
      },
      "topVendors": [
        {
          "vendor": "Apple",
          "count": 34,
          "percentage": 30.36
        },
        {
          "vendor": "Samsung",
          "count": 18,
          "percentage": 16.07
        }
      ],
      "topInterfaces": [
        {
          "interface": "lan",
          "count": 85,
          "percentage": 75.89
        },
        {
          "interface": "wan",
          "count": 27,
          "percentage": 24.11
        }
      ]
    },
    "devices": [
      {
        "macAddress": "aa:bb:cc:dd:ee:ff",
        "vendor": "Apple, Inc.",
        "hostname": "iPhone-John",
        "isActive": true,
        "isPrivacyMac": false,
        "isOpnsenseMac": false,
        "firstSeen": "2024-01-15T10:30:00.000Z",
        "lastSeen": "2024-01-20T14:45:00.000Z",
        "currentIp": "192.168.1.100",
        "currentInterface": "em0",
        "hasDhcpReservation": true,
        "exclusion": {
          "enabled": false,
          "exclusionMode": null,
          "reason": null
        },
        "ipHistory": [
          {
            "ipAddress": "192.168.1.100",
            "interface": "em0",
            "firstSeen": "2024-01-15T10:30:00.000Z",
            "lastSeen": "2024-01-20T14:45:00.000Z",
            "detectionCount": 25
          }
        ]
      }
    ]
  }
}
```

#### Usage Case 2: Export CSV Format

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/export?format=csv&activeOnly=true&fields=macAddress,hostname,vendor,isActive,lastSeen" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Accept: text/csv"
```

**Success Response** (CSV format):
```csv
MAC Address,Hostname,Vendor,Status,Last Seen
aa:bb:cc:dd:ee:ff,iPhone-John,Apple Inc.,Active,2024-01-20T14:45:00.000Z
bb:cc:dd:ee:ff:aa,Galaxy-S20,Samsung Electronics,Active,2024-01-20T13:30:00.000Z
```

### GET /api/admin/mac-tracking/service

**Description**: Get comprehensive MAC tracking service analytics, including performance metrics, operational statistics, and health indicators.

**Authentication**: Required (session or API key with ADMIN/SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Forbidden
- **ADMIN**: ✅ Read-only service status and analytics
- **SUPER_ADMIN**: ✅ Full service status, analytics, and performance metrics

**Query Parameters:**
- `includePerformance` (boolean, optional): Include performance metrics (default: `true`)
  - **Validation**: Must be true or false
  - **Example**: `true`

- `includeHistory` (boolean, optional): Include service operation history (default: `false`)
  - **Validation**: Must be true or false
  - **Example**: `false`

- `includeHealth` (boolean, optional): Include health check data (default: `true`)
  - **Validation**: Must be true or false
  - **Example**: `true`

#### Usage Case 1: Get Basic Service Status

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
    "serviceStatus": {
      "isRunning": true,
      "intervalMinutes": 5,
      "lastScanTime": "2025-11-06T15:10:00.000Z",
      "nextScanTime": "2025-11-06T15:15:00.000Z",
      "uptime": "15 days 8 hours",
      "version": "2.1.0"
    },
    "settings": {
      "enabled": true,
      "interval": 5,
      "inactiveTimeout": 1440,
      "enablePrivacyDetection": true,
      "enableDhcpIntegration": true,
      "enableExclusions": true
    },
    "stats": {
      "totalMacs": 245,
      "activeMacs": 112,
      "inactiveMacs": 133,
      "privacyMacs": 17,
      "totalPrivacyMacs": 17,
      "privacyMacPercentage": 6.94,
      "opnsenseMacs": 8,
      "totalOpnsenseMacs": 8,
      "opnsenseMacPercentage": 3.27,
      "fullyExcludedMacs": 9,
      "partiallyExcludedMacs": 14,
      "totalExclusions": 23,
      "exclusionPercentage": 9.39
    },
    "performance": {
      "lastScanDuration": "2.5s",
      "averageScanDuration": "2.8s",
      "scansPerHour": 12,
      "successfulScans": 4320,
      "failedScans": 3,
      "successRate": 99.93,
      "memoryUsage": "45.2 MB",
      "cpuUsage": "2.1%"
    },
    "health": {
      "status": "healthy",
      "lastHealthCheck": "2025-11-06T15:12:00.000Z",
      "databaseConnection": "ok",
      "dhcpApiConnection": "ok",
      "diskSpace": "sufficient",
      "memoryUsage": "normal",
      "issues": []
    },
    "generatedAt": "2025-11-06T15:12:00.000Z"
  }
}
```

#### Usage Case 2: Get Service Status with Full History

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/mac-tracking/service?includePerformance=true&includeHistory=true&includeHealth=true" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "serviceStatus": {
      "isRunning": true,
      "intervalMinutes": 5,
      "lastScanTime": "2025-11-06T15:10:00.000Z",
      "nextScanTime": "2025-11-06T15:15:00.000Z",
      "uptime": "15 days 8 hours",
      "version": "2.1.0",
      "startTime": "2025-10-22T07:12:00.000Z"
    },
    "performance": {
      "lastScanDuration": "2.5s",
      "averageScanDuration": "2.8s",
      "scansPerHour": 12,
      "successfulScans": 4320,
      "failedScans": 3,
      "successRate": 99.93,
      "memoryUsage": "45.2 MB",
      "cpuUsage": "2.1%",
      "peakMemoryUsage": "52.8 MB",
      "peakCpuUsage": "5.3%"
    },
    "operationHistory": [
      {
        "timestamp": "2025-11-06T15:10:00.000Z",
        "operation": "scan",
        "duration": "2.5s",
        "status": "success",
        "devicesFound": 112,
        "newDevices": 2,
        "updatedDevices": 8
      },
      {
        "timestamp": "2025-11-06T15:05:00.000Z",
        "operation": "scan",
        "duration": "2.7s",
        "status": "success",
        "devicesFound": 110,
        "newDevices": 0,
        "updatedDevices": 5
      },
      {
        "timestamp": "2025-11-06T14:30:00.000Z",
        "operation": "cleanup",
        "duration": "38s",
        "status": "success",
        "itemsCleaned": 145
      }
    ],
    "health": {
      "status": "healthy",
      "lastHealthCheck": "2025-11-06T15:12:00.000Z",
      "checks": {
        "databaseConnection": {
          "status": "ok",
          "responseTime": "12ms",
          "lastChecked": "2025-11-06T15:12:00.000Z"
        },
        "dhcpApiConnection": {
          "status": "ok",
          "responseTime": "45ms",
          "lastChecked": "2025-11-06T15:12:00.000Z"
        },
        "diskSpace": {
          "status": "sufficient",
          "usedPercentage": 23.5,
          "availableSpace": "156.7 GB",
          "lastChecked": "2025-11-06T15:12:00.000Z"
        },
        "memoryUsage": {
          "status": "normal",
          "usedPercentage": 45.2,
          "availableMemory": "54.8 MB",
          "lastChecked": "2025-11-06T15:12:00.000Z"
        }
      },
      "issues": []
    },
    "generatedAt": "2025-11-06T15:12:00.000Z"
  }
}
```

## Rate Limiting

**Rate Limit Strategy:** User-based

**Default Rate Limits:**
- **Public Endpoints**: N/A (authenticated only)
- **Authenticated Endpoints**: 100 requests per hour
- **API Key Endpoints**: Configurable per key (default: 100/hour)

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
    "limit": 100,
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

## Security Considerations

**Access Control:**
- Role-based permissions strictly enforced for all analytics endpoints
- Feature can be completely disabled for security
- All operations logged in audit system
- IP tracking for API usage monitoring

**Data Privacy:**
- Privacy MAC addresses clearly identified in all analytics
- No personal data collection beyond network identifiers
- Configurable data retention policies
- Export functionality respects privacy settings

**Input Validation:**
- Strict MAC address format validation
- SQL injection prevention with parameterized queries
- XSS prevention with input sanitization
- Length limits enforced on all string fields

**Performance Security:**
- Query timeouts to prevent resource exhaustion
- Memory usage monitoring for large analytics queries
- Rate limiting to prevent abuse
- Efficient pagination for large datasets

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
  "message": "Unauthorized for MAC tracking analytics access"
}
```

### 403 Insufficient Permissions
```json
{
  "success": false,
  "message": "Unauthorized for this operation"
}
```

### 400 Invalid Parameters
```json
{
  "success": false,
  "message": "Invalid parameters",
  "details": {
    "timeRange": "Must be one of: 7days, 30days, 90days, 1year"
  }
}
```

### 404 MAC Address Not Found
```json
{
  "success": false,
  "message": "MAC address not found"
}
```

### 422 Unprocessable Entity
```json
{
  "success": false,
  "message": "Validation failed",
  "details": {
    "retentionDays": "Must be between 1 and 365 days"
  }
}
```

### 429 Rate Limit Exceeded
```json
{
  "success": false,
  "message": "Rate limit exceeded. Please try again later.",
  "rateLimitInfo": {
    "limit": 100,
    "remaining": 0,
    "resetTime": 1640995200,
    "retryAfter": 1800
  }
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

## Performance Considerations

**Query Optimization:**
- Indexed MAC addresses and IP addresses for fast lookups
- Efficient pagination with cursor-based navigation
- Optimized queries for large analytics datasets
- Database query timeouts for long-running operations

**Caching Strategy:**
- Analytics data cached for 5 minutes
- MAC history cached for 2 minutes
- Service status cached for 1 minute
- Export data cached for 10 minutes

**Memory Management:**
- Efficient memory usage for large datasets
- Streaming responses for large exports
- Garbage collection optimization for analytics processing
- Connection pooling for database operations

## Data Structures

### MAC Address Analytics Object
```json
{
  "id": "mac-uuid-1",
  "macAddress": "aa:bb:cc:dd:ee:ff",
  "vendor": "Apple, Inc.",
  "hostname": "iPhone-John",
  "isActive": true,
  "isPrivacyMac": false,
  "isOpnsenseMac": false,
  "firstSeen": "2024-01-15T10:30:00.000Z",
  "lastSeen": "2024-01-20T14:45:00.000Z",
  "currentIp": "192.168.1.100",
  "currentInterface": "em0",
  "hasDhcpReservation": true,
  "exclusion": {
    "enabled": false,
    "exclusionMode": null,
    "reason": null
  },
  "analytics": {
    "totalIpAssociations": 3,
    "uniqueInterfaces": 2,
    "averageSessionDuration": "2h 15m",
    "mostActiveInterface": "em0",
    "activityPattern": "business-hours",
    "riskScore": "low",
    "detectionCount": 45
  }
}
```

### IP History Entry Object
```json
{
  "id": "history-uuid-1",
  "ipAddress": "192.168.1.100",
  "interface": "em0",
  "firstSeen": "2024-01-15T10:30:00.000Z",
  "lastSeen": "2024-01-20T14:45:00.000Z",
  "detectionCount": 25,
  "hasDhcpReservation": true,
  "hasDhcpConflict": false,
  "hostAlias": "device.local",
  "isActive": true,
  "isOpnsenseInterface": false
}
```

### Exclusion Object
```json
{
  "id": "exclusion-uuid-1",
  "enabled": true,
  "exclusionMode": "PARTIAL",
  "reason": "Test device for development",
  "excludedBy": "admin-user-id",
  "excludedAt": "2025-01-15T10:30:00.000Z",
  "lastModifiedBy": "admin-user-id",
  "lastModifiedAt": "2025-01-15T10:30:00.000Z"
}
```

### Analytics Summary Object
```json
{
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
  "exclusionPercentage": 9.39
}
```

This comprehensive documentation provides all necessary information for integrating with the MAC Address Tracking Analytics system, including detailed endpoint descriptions, request/response formats, error handling, and practical examples for common use cases.

---

## API Navigation

### API Documentation
- [🔍 API Index](API_Index.md) - Complete API endpoint index
- [🔑 Authentication](02_authentication_endpoints.md) - Authentication methods

### Related API Categories
- [📊 Analytics Endpoints](11_analytics_endpoints.md) - Analytics and reporting
- [🔗 OPNsense Endpoints](07_opnsense_endpoints.md) - OPNsense firewall integration
- [👥 MAC Exclusion](17_mac_exclusion_endpoints.md) - MAC address exclusion management

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