# Audit Log Management API Endpoints

[⬆️ Back to API Index](API_Index.md) | [📚 Back to Documentation Home](../../DOCUMENTATION_INDEX.md)

## Overview
This document covers the audit log management API endpoints in the InstradaOGM. These endpoints provide comprehensive functionality for managing audit logs, including statistics retrieval, log trimming operations, and system session analytics for administrative users.

---

## Authentication Requirements

### Audit Log Management Endpoints
- **Authentication**: Valid session or API key
- **Role**: ADMIN or SUPER_ADMIN required
- **Access**: System-wide audit log management and analytics

---

## GET /api/admin/audit-logs/stats

Get comprehensive statistics about audit logs including storage usage, record counts, and retention information.

### HTTP Methods
- `GET` - Retrieve audit log statistics

### Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access endpoint (returns "Unauthorized")
- **ADMIN**: ✅ Can access endpoint
- **SUPER_ADMIN**: ✅ Can access endpoint

**Role Access:**
- **USER**: ❌ Forbidden - insufficient permissions
- **ADMIN**: ✅ Can access audit log statistics with administrative permissions
- **SUPER_ADMIN**: ✅ Can access audit log statistics with full system permissions

**Example Responses:**

**ADMIN/SUPER_ADMIN Success:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalRecords": 1250000,
      "totalSize": "2.4 GB",
      "averageRecordSize": "2.1 KB",
      "oldestRecord": "2023-01-15T08:30:00Z",
      "newestRecord": "2024-01-15T10:45:00Z"
    },
    "byType": {
      "USER_LOGIN": 45000,
      "USER_LOGOUT": 42000,
      "API_REQUEST": 850000,
      "GROUP_ASSIGNMENT": 125000,
      "HOST_ALIAS_OPERATION": 85000,
      "SYSTEM_ACTION": 25000,
      "SECURITY_EVENT": 15000,
      "ERROR_LOG": 73000
    },
    "byStatus": {
      "SUCCESS": 1180000,
      "FAILURE": 45000,
      "WARNING": 25000
    },
    "retention": {
      "defaultRetentionDays": 90,
      "configuredRetentionDays": 90,
      "recordsEligibleForTrimming": 125000,
      "estimatedSpaceAfterTrim": "2.1 GB"
    },
    "growth": {
      "dailyAverage": 13888,
      "weeklyGrowth": 97216,
      "monthlyGrowth": 416640,
      "projectedAnnualGrowth": "5.0 GB"
    }
  }
}
```

**USER Role Failure:**
```json
{
  "success": false,
  "error": "Unauthorized: ADMIN or SUPER_ADMIN role required"
}
```

### Request Parameters

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `includeDetails` | boolean | No | Must be true or false | Include detailed breakdown by type and status (default: false) |
| `includeGrowth` | boolean | No | Must be true or false | Include growth projections (default: false) |
| `typeFilter` | string | No | Valid audit log types | Filter statistics by specific log type |

### Example Request
```bash
curl -X GET "https://instrada-ogm.example.com/api/admin/audit-logs/stats?includeDetails=true&includeGrowth=true" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json"
```

### Security Considerations
- Requires ADMIN or SUPER_ADMIN role
- Contains sensitive system storage and usage information
- All access is logged for audit purposes
- Rate limiting applies to prevent abuse

### Rate Limiting

**Rate Limit Strategy:** User-based

**Default Rate Limits:**
- **Public Endpoints**: N/A (authenticated only)
- **Authenticated Endpoints**: 30 requests per hour
- **API Key Endpoints**: Configurable per key (default: 30/hour)

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
    "limit": 30,
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

---

## POST /api/admin/audit-logs/trim

Perform trimming of audit logs based on retention policies to manage storage usage.

### HTTP Methods
- `POST` - Execute audit log trimming operation

### Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access endpoint (returns "Unauthorized")
- **ADMIN**: ✅ Can access endpoint
- **SUPER_ADMIN**: ✅ Can access endpoint

**Role Access:**
- **USER**: ❌ Forbidden - insufficient permissions
- **ADMIN**: ✅ Can perform audit log trimming with administrative permissions
- **SUPER_ADMIN**: ✅ Can perform audit log trimming with full system permissions

**Example Responses:**

**ADMIN/SUPER_ADMIN Success:**
```json
{
  "success": true,
  "data": {
    "operationId": "trim-op-12345",
    "status": "completed",
    "startTime": "2024-01-15T10:30:00Z",
    "endTime": "2024-01-15T10:32:45Z",
    "duration": 165,
    "recordsProcessed": {
      "total": 125000,
      "deleted": 118500,
      "retained": 6500,
      "errors": 0
    },
    "spaceFreed": {
      "before": "2.4 GB",
      "after": "2.1 GB",
      "freed": "300 MB"
    },
    "criteria": {
      "retentionDays": 90,
      "cutoffDate": "2023-10-17T10:30:00Z",
      "excludedTypes": ["SECURITY_EVENT", "SYSTEM_ACTION"]
    }
  }
}
```

**USER Role Failure:**
```json
{
  "success": false,
  "error": "Unauthorized: ADMIN or SUPER_ADMIN role required"
}
```

### Request Parameters

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `retentionDays` | number | No | Must be between 7 and 365 | Number of days to retain (default: 90) |
| `dryRun` | boolean | No | Must be true or false | Preview operation without executing (default: false) |
| `excludeTypes` | array | No | Valid audit log types | Log types to exclude from trimming |
| `batchSize` | number | No | Must be between 100 and 10000 | Records processed per batch (default: 1000) |
| `force` | boolean | No | Must be true or false | Force operation without confirmation (default: false) |

### Example Request
```bash
curl -X POST "https://instrada-ogm.example.com/api/admin/audit-logs/trim" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "retentionDays": 90,
    "dryRun": false,
    "excludeTypes": ["SECURITY_EVENT", "SYSTEM_ACTION"],
    "batchSize": 1000,
    "force": true
  }'
```

### Security Considerations
- Requires ADMIN or SUPER_ADMIN role
- Destructive operation that permanently deletes audit data
- All operations are logged for audit purposes
- Strict rate limiting to prevent accidental data loss
- Recommended to use dryRun first

### Rate Limiting

**Rate Limit Strategy:** User-based

**Default Rate Limits:**
- **Public Endpoints**: N/A (authenticated only)
- **Authenticated Endpoints**: 5 requests per hour
- **API Key Endpoints**: Configurable per key (default: 5/hour)

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
    "limit": 5,
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

---

## GET /api/admin/audit-logs/preview-trim

Preview the effects of an audit log trimming operation without actually executing it.

### HTTP Methods
- `GET` - Preview audit log trimming results

### Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access endpoint (returns "Unauthorized")
- **ADMIN**: ✅ Can access endpoint
- **SUPER_ADMIN**: ✅ Can access endpoint

**Role Access:**
- **USER**: ❌ Forbidden - insufficient permissions
- **ADMIN**: ✅ Can preview audit log trimming with administrative permissions
- **SUPER_ADMIN**: ✅ Can preview audit log trimming with full system permissions

**Example Responses:**

**ADMIN/SUPER_ADMIN Success:**
```json
{
  "success": true,
  "data": {
    "previewId": "preview-12345",
    "generatedAt": "2024-01-15T10:30:00Z",
    "criteria": {
      "retentionDays": 90,
      "cutoffDate": "2023-10-17T10:30:00Z",
      "excludeTypes": ["SECURITY_EVENT", "SYSTEM_ACTION"]
    },
    "impact": {
      "totalRecords": 1250000,
      "eligibleForDeletion": 118500,
      "toBeRetained": 1131500,
      "percentageToBeDeleted": 9.48
    },
    "byType": {
      "USER_LOGIN": {
        "total": 45000,
        "eligible": 4200,
        "retained": 40800
      },
      "API_REQUEST": {
        "total": 850000,
        "eligible": 85000,
        "retained": 765000
      },
      "SECURITY_EVENT": {
        "total": 15000,
        "eligible": 0,
        "retained": 15000
      }
    },
    "spaceImpact": {
      "currentSize": "2.4 GB",
      "estimatedSizeAfterTrim": "2.17 GB",
      "spaceToBeFreed": "230 MB"
    },
    "timeEstimate": {
      "estimatedDuration": 180,
      "batchesRequired": 119,
      "batchSize": 1000
    }
  }
}
```

**USER Role Failure:**
```json
{
  "success": false,
  "error": "Unauthorized: ADMIN or SUPER_ADMIN role required"
}
```

### Request Parameters

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `retentionDays` | number | No | Must be between 7 and 365 | Number of days to retain (default: 90) |
| `excludeTypes` | array | No | Valid audit log types | Log types to exclude from trimming |
| `batchSize` | number | No | Must be between 100 and 10000 | Records processed per batch (default: 1000) |
| `includeTypeBreakdown` | boolean | No | Must be true or false | Include breakdown by log type (default: true) |

### Example Request
```bash
curl -X GET "https://instrada-ogm.example.com/api/admin/audit-logs/preview-trim?retentionDays=90&excludeTypes=SECURITY_EVENT&excludeTypes=SYSTEM_ACTION&batchSize=1000" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json"
```

### Security Considerations
- Requires ADMIN or SUPER_ADMIN role
- Read-only operation but reveals sensitive system information
- All access is logged for audit purposes
- Rate limiting applies to prevent abuse

### Rate Limiting

**Rate Limit Strategy:** User-based

**Default Rate Limits:**
- **Public Endpoints**: N/A (authenticated only)
- **Authenticated Endpoints**: 20 requests per hour
- **API Key Endpoints**: Configurable per key (default: 20/hour)

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
    "limit": 20,
    "remaining": 0,
    "resetTime": 1640995200,
    "windowType": "hourly",
    "retryAfter": 1800
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

---

## GET /api/admin/sessions/analytics/system

Get comprehensive analytics about system-wide session usage, patterns, and metrics.

### HTTP Methods
- `GET` - Retrieve system session analytics

### Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access endpoint (returns "Unauthorized")
- **ADMIN**: ✅ Can access endpoint
- **SUPER_ADMIN**: ✅ Can access endpoint

**Role Access:**
- **USER**: ❌ Forbidden - insufficient permissions
- **ADMIN**: ✅ Can access system session analytics with administrative permissions
- **SUPER_ADMIN**: ✅ Can access system session analytics with full system permissions

**Example Responses:**

**ADMIN/SUPER_ADMIN Success:**
```json
{
  "success": true,
  "data": {
    "period": {
      "days": 30,
      "startDate": "2024-01-01T00:00:00Z",
      "endDate": "2024-01-31T00:00:00Z"
    },
    "summary": {
      "totalSessions": 15420,
      "uniqueUsers": 1250,
      "averageSessionDuration": "45 minutes",
      "totalSessionTime": "516 hours",
      "peakConcurrentSessions": 85,
      "averageConcurrentSessions": 32
    },
    "byUserType": {
      "USER": {
        "sessions": 12000,
        "uniqueUsers": 1000,
        "averageDuration": "35 minutes",
        "totalTime": "416 hours"
      },
      "ADMIN": {
        "sessions": 2800,
        "uniqueUsers": 200,
        "averageDuration": "1 hour 15 minutes",
        "totalTime": "87 hours"
      },
      "SUPER_ADMIN": {
        "sessions": 620,
        "uniqueUsers": 50,
        "averageDuration": "2 hours 5 minutes",
        "totalTime": "13 hours"
      }
    },
    "timeAnalysis": {
      "peakHours": [
        {"hour": 9, "sessions": 850},
        {"hour": 10, "sessions": 920},
        {"hour": 14, "sessions": 780},
        {"hour": 15, "sessions": 810}
      ],
      "peakDays": [
        {"day": "Monday", "sessions": 3200},
        {"day": "Tuesday", "sessions": 3100},
        {"day": "Wednesday", "sessions": 2900}
      ],
      "dailyAverage": 514
    },
    "geographicDistribution": [
      {
        "country": "United States",
        "sessions": 8500,
        "uniqueUsers": 650,
        "percentage": 55.1
      },
      {
        "country": "United Kingdom",
        "sessions": 3200,
        "uniqueUsers": 280,
        "percentage": 20.8
      }
    ],
    "deviceBreakdown": {
      "Desktop": 65.2,
      "Mobile": 28.5,
      "Tablet": 6.3
    },
    "browserBreakdown": {
      "Chrome": 45.8,
      "Firefox": 22.3,
      "Safari": 18.5,
      "Edge": 13.4
    }
  }
}
```

**USER Role Failure:**
```json
{
  "success": false,
  "error": "Unauthorized: ADMIN or SUPER_ADMIN role required"
}
```

### Request Parameters

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `days` | number | No | Must be between 1 and 90 | Number of days to analyze (default: 30, max: 90) |
| `startDate` | string | No | ISO 8601 format | Start date for custom date range |
| `endDate` | string | No | ISO 8601 format | End date for custom date range |
| `includeGeographic` | boolean | No | Must be true or false | Include geographic distribution (default: true) |
| `includeDeviceBreakdown` | boolean | No | Must be true or false | Include device/browser breakdown (default: true) |
| `userType` | string | No | Must be 'USER', 'ADMIN', or 'SUPER_ADMIN' | Filter by specific user type |

### Example Request
```bash
curl -X GET "https://instrada-ogm.example.com/api/admin/sessions/analytics/system?days=30&includeGeographic=true&includeDeviceBreakdown=true" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json"
```

### Security Considerations
- Requires ADMIN or SUPER_ADMIN role
- Contains sensitive user session and usage patterns
- All access is logged for audit purposes
- Rate limiting applies to prevent abuse

### Rate Limiting

**Rate Limit Strategy:** User-based

**Default Rate Limits:**
- **Public Endpoints**: N/A (authenticated only)
- **Authenticated Endpoints**: 25 requests per hour
- **API Key Endpoints**: Configurable per key (default: 25/hour)

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
    "limit": 25,
    "remaining": 0,
    "resetTime": 1640995200,
    "windowType": "hourly",
    "retryAfter": 1440
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

---

## Common Error Responses

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "Insufficient permissions - ADMIN or SUPER_ADMIN role required"
}
```

### 422 Validation Error
```json
{
  "success": false,
  "error": "Validation failed",
  "details": {
    "field": "retentionDays",
    "message": "Retention days must be between 7 and 365"
  }
}
```

### 429 Rate Limited
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "rateLimitInfo": {
    "limit": 30,
    "remaining": 0,
    "resetTime": 1640995200,
    "windowType": "hourly",
    "retryAfter": 3600
  }
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Internal server error",
  "message": "Failed to process audit log operation"
}
```

---

## Usage Notes

### Data Retention
- Audit logs are retained for 90 days by default
- Security events and system actions may have different retention policies
- Trimming operations are irreversible
- All trimming operations are logged for audit purposes

### Performance Considerations
- Large audit log datasets may result in slower response times
- Use appropriate date ranges to limit data volume
- Trimming operations can be resource-intensive
- Consider running trimming during off-peak hours

### Security
- All audit log management endpoints require ADMIN or SUPER_ADMIN role
- All access is logged for audit purposes
- Trimming operations should be carefully planned
- Use dry-run previews before executing actual trimming

### Best Practices
1. **Preview Before Trimming**: Always use preview-trim before executing trim operations
2. **Monitor Storage**: Regularly check audit log statistics to monitor storage usage
3. **Schedule Maintenance**: Plan trimming operations during low-usage periods
4. **Backup Critical Data**: Consider backing up important audit logs before trimming
5. **Monitor Rate Limits**: Check rate limit headers to avoid throttling
6. **Handle Errors Gracefully**: Implement proper error handling for all endpoints

### Integration Examples

#### JavaScript/Node.js Example
```javascript
const axios = require('axios');

async function getAuditLogStats(includeDetails = true) {
  try {
    const response = await axios.get(
      `https://instrada-ogm.example.com/api/admin/audit-logs/stats?includeDetails=${includeDetails}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.ADMIN_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Audit Log Statistics:', response.data);
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 429) {
      const retryAfter = error.response.data.rateLimitInfo.retryAfter;
      console.log(`Rate limited. Retry after ${retryAfter} seconds`);
    } else {
      console.error('Error fetching audit log stats:', error.message);
    }
  }
}

async function previewAuditLogTrim(retentionDays = 90) {
  try {
    const response = await axios.get(
      `https://instrada-ogm.example.com/api/admin/audit-logs/preview-trim?retentionDays=${retentionDays}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.ADMIN_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Trim Preview:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error previewing trim:', error.message);
  }
}
```

#### Python Example
```python
import requests
import time

def trim_audit_logs(api_key, retention_days=90, dry_run=False):
    url = "https://instrada-ogm.example.com/api/admin/audit-logs/trim"
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }
    data = {
        'retentionDays': retention_days,
        'dryRun': dry_run,
        'force': not dry_run
    }
    
    try:
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 429:
            retry_after = e.response.json().get('rateLimitInfo', {}).get('retryAfter', 60)
            print(f"Rate limited. Retrying after {retry_after} seconds...")
            time.sleep(retry_after)
            return trim_audit_logs(api_key, retention_days, dry_run)
        else:
            print(f"Error: {e}")
            return None
```

---

## Data Structures Reference

### Audit Log Statistics Structure
```json
{
  "summary": {
    "totalRecords": 1250000,
    "totalSize": "2.4 GB",
    "averageRecordSize": "2.1 KB",
    "oldestRecord": "2023-01-15T08:30:00Z",
    "newestRecord": "2024-01-15T10:45:00Z"
  },
  "byType": {
    "USER_LOGIN": 45000,
    "API_REQUEST": 850000
  },
  "retention": {
    "defaultRetentionDays": 90,
    "recordsEligibleForTrimming": 125000,
    "estimatedSpaceAfterTrim": "2.1 GB"
  }
}
```

### Trim Operation Structure
```json
{
  "operationId": "trim-op-12345",
  "status": "completed",
  "startTime": "2024-01-15T10:30:00Z",
  "endTime": "2024-01-15T10:32:45Z",
  "duration": 165,
  "recordsProcessed": {
    "total": 125000,
    "deleted": 118500,
    "retained": 6500,
    "errors": 0
  },
  "spaceFreed": {
    "before": "2.4 GB",
    "after": "2.1 GB",
    "freed": "300 MB"
  }
}
```

### Session Analytics Structure
```json
{
  "period": {
    "days": 30,
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-01-31T00:00:00Z"
  },
  "summary": {
    "totalSessions": 15420,
    "uniqueUsers": 1250,
    "averageSessionDuration": "45 minutes",
    "totalSessionTime": "516 hours"
  },
  "byUserType": {
    "USER": {
      "sessions": 12000,
      "uniqueUsers": 1000,
      "averageDuration": "35 minutes"
    }
  }
}
```

### Rate Limit Info Structure
```json
{
  "limit": 30,
  "remaining": 25,
  "resetTime": 1640995200,
  "windowType": "hourly",
  "retryAfter": 1800
}

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