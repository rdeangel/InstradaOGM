# Admin Analytics & Monitoring API Endpoints

[⬆️ Back to API Index](API_Index.md) | [📚 Back to Documentation Home](../../DOCUMENTATION_INDEX.md)

## Overview
This document covers the highest priority admin analytics and monitoring API endpoints in the InstradaOGM. These endpoints provide comprehensive insights into system performance, user activities, and audit analytics for administrative users.

---

## Authentication Requirements

### Admin Analytics Endpoints
- **Authentication**: Valid session or API key
- **Role**: ADMIN or SUPER_ADMIN required
- **Access**: System-wide analytics and monitoring data

---

## GET /api/admin/analytics/combined

Get combined API key and session analytics for comprehensive system monitoring.

### HTTP Methods
- `GET` - Retrieve combined analytics data

### Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access endpoint (returns "Unauthorized")
- **ADMIN**: ✅ Can access endpoint
- **SUPER_ADMIN**: ✅ Can access endpoint

**Role Access:**
- **USER**: ❌ Forbidden - insufficient permissions
- **ADMIN**: ✅ Can access combined analytics with administrative permissions
- **SUPER_ADMIN**: ✅ Can access combined analytics with full system permissions

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
      "totalRequests": 45000,
      "apiKeyRequests": 20000,
      "sessionRequests": 25000,
      "sessionBreakdown": {
        "apiCalls": 12000,
        "pageViews": 8000,
        "uiActions": 5000
      },
      "successfulRequests": 43500,
      "failedRequests": 1500,
      "rateLimitHits": 45,
      "uniqueApiKeys": 25,
      "uniqueSessions": 320,
      "totalUniqueUsers": 45
    },
    "recentActivity": [
      {
        "timestamp": "2024-01-15T10:30:00Z",
        "type": "api_key",
        "source": "API Key: Production API",
        "user": "John Doe",
        "endpoint": "/api/vpn/status",
        "method": "GET",
        "statusCode": 200,
        "responseTime": 234
      },
      {
        "timestamp": "2024-01-15T10:29:45Z",
        "type": "session",
        "source": "Web Session",
        "user": "Jane Smith",
        "endpoint": "/dashboard",
        "actionType": "page_view",
        "statusCode": 200,
        "responseTime": 156
      }
    ]
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
| `includeDetails` | boolean | No | Must be true or false | Include detailed endpoint breakdown (default: false) |
| `startDate` | string | No | ISO 8601 format | Start date for custom date range |
| `endDate` | string | No | ISO 8601 format | End date for custom date range |

### Example Request
```bash
curl -X GET "https://instrada-ogm.example.com/api/admin/analytics/combined?days=30&includeDetails=true" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json"
```

### Security Considerations
- Requires ADMIN or SUPER_ADMIN role
- All access is logged for audit purposes
- Data includes sensitive system-wide metrics
- Rate limiting applies to prevent abuse

### Rate Limiting

**Rate Limit Strategy:** User-based

**Default Rate Limits:**
- **Public Endpoints**: N/A (authenticated only)
- **Authenticated Endpoints**: 50 requests per hour
- **API Key Endpoints**: Configurable per key (default: 50/hour)

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
    "limit": 50,
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

## GET /api/admin/analytics/realtime

Get current real-time system metrics and activity for live monitoring.

### HTTP Methods
- `GET` - Retrieve real-time analytics data

### Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access endpoint (returns "Unauthorized")
- **ADMIN**: ✅ Can access endpoint
- **SUPER_ADMIN**: ✅ Can access endpoint

**Role Access:**
- **USER**: ❌ Forbidden - insufficient permissions
- **ADMIN**: ✅ Can access real-time analytics with administrative permissions
- **SUPER_ADMIN**: ✅ Can access real-time analytics with full system permissions

**Example Responses:**

**ADMIN/SUPER_ADMIN Success:**
```json
{
  "success": true,
  "data": {
    "metrics": {
      "timestamp": "2024-01-15T10:30:00Z",
      "activeUsers": 8,
      "requestsPerSecond": 2.5,
      "averageResponseTime": 234.5,
      "errorRate": 0.015,
      "totalRequests": 150,
      "successfulRequests": 148,
      "failedRequests": 2
    },
    "recentActivity": [
      {
        "id": "activity1",
        "timestamp": "2024-01-15T10:29:45Z",
        "type": "request",
        "description": "API request to /api/vpn/status",
        "user": "John Doe",
        "endpoint": "/api/vpn/status",
        "statusCode": 200
      },
      {
        "id": "activity2",
        "timestamp": "2024-01-15T10:29:30Z",
        "type": "user_login",
        "description": "User login successful",
        "user": "Jane Smith"
      }
    ]
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
| `includeActivity` | boolean | No | Must be true or false | Include recent activity stream (default: true) |
| `activityLimit` | number | No | Must be between 1 and 100 | Number of recent activities to return (default: 20) |

### Example Request
```bash
curl -X GET "https://instrada-ogm.example.com/api/admin/analytics/realtime?includeActivity=true&activityLimit=50" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json"
```

### Security Considerations
- Requires ADMIN or SUPER_ADMIN role
- Real-time data includes current user activity
- All access is logged for audit purposes
- Higher rate limiting due to real-time nature

### Rate Limiting

**Rate Limit Strategy:** User-based

**Default Rate Limits:**
- **Public Endpoints**: N/A (authenticated only)
- **Authenticated Endpoints**: 120 requests per hour
- **API Key Endpoints**: Configurable per key (default: 120/hour)

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
    "limit": 120,
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

## GET /api/admin/all-activities

Get comprehensive system-wide activity logs for monitoring and auditing.

### HTTP Methods
- `GET` - Retrieve all system activities

### Role-Based Access Control

**Authentication Required:** Yes (session or API key)

**Rate Limiting**: ✅ Enforced for API key requests (30 requests per hour default)

**Role Requirements:**
- **USER**: ❌ Cannot access endpoint (returns "Unauthorized")
- **ADMIN**: ✅ Can access endpoint
- **SUPER_ADMIN**: ✅ Can access endpoint

**Role Access:**
- **USER**: ❌ Forbidden - insufficient permissions
- **ADMIN**: ✅ Can access system activities with administrative permissions
- **SUPER_ADMIN**: ✅ Can access system activities with full system permissions

**Authentication Methods:**
- **Web Session**: ✅ Supported - No rate limiting applied
- **API Key**: ✅ Supported - Rate limiting enforced per API key configuration

**Example Responses:**

**ADMIN/SUPER_ADMIN Success:**
```json
{
  "success": true,
  "data": {
    "activities": [
      {
        "id": "activity1",
        "timestamp": "2024-01-15T10:30:00Z",
        "type": "api_request",
        "user": {
          "id": "user1",
          "name": "John Doe",
          "email": "john@example.com"
        },
        "action": "GET /api/vpn/status",
        "details": {
          "endpoint": "/api/vpn/status",
          "method": "GET",
          "statusCode": 200,
          "responseTime": 234,
          "userAgent": "Mozilla/5.0...",
          "ipAddress": "192.168.1.100"
        }
      },
      {
        "id": "activity2",
        "timestamp": "2024-01-15T10:29:30Z",
        "type": "user_action",
        "user": {
          "id": "user2",
          "name": "Jane Smith",
          "email": "jane@example.com"
        },
        "action": "Group Assignment",
        "details": {
          "action": "ASSIGN_TO_GROUP",
          "target": "Host Alias: server01",
          "group": "VPN Users",
          "batch": false
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 1250,
      "totalPages": 25
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
| `page` | number | No | Must be >= 1 | Page number for pagination (default: 1) |
| `limit` | number | No | Must be between 1 and 100 | Items per page (default: 50) |
| `type` | string | No | Valid activity types | Filter by activity type |
| `userId` | string | No | Valid user ID | Filter by specific user |
| `startDate` | string | No | ISO 8601 format | Start date for filtering |
| `endDate` | string | No | ISO 8601 format | End date for filtering |

### Example Request
```bash
curl -X GET "https://instrada-ogm.example.com/api/admin/all-activities?page=1&limit=50&type=api_request&startDate=2024-01-01T00:00:00Z" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json"
```

### Security Considerations
- Requires ADMIN or SUPER_ADMIN role
- Contains sensitive user activity data
- All access is logged for audit purposes
- Strict rate limiting due to potential data volume

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

## GET /api/admin/audit-logs/analytics/group-changes

Get analytics for group assignment/unassignment operations and related audit data.

### HTTP Methods
- `GET` - Retrieve group change analytics

### Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access endpoint (returns "Unauthorized")
- **ADMIN**: ✅ Can access endpoint
- **SUPER_ADMIN**: ✅ Can access endpoint

**Role Access:**
- **USER**: ❌ Forbidden - insufficient permissions
- **ADMIN**: ✅ Can access group change analytics with administrative permissions
- **SUPER_ADMIN**: ✅ Can access group change analytics with full system permissions

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
      "totalOperations": 1250,
      "assignments": 650,
      "unassignments": 400,
      "moves": 150,
      "batchOperations": 50,
      "successRate": 96.8,
      "uniqueUsers": 12,
      "uniqueGroups": 25,
      "uniqueHostAliases": 180
    },
    "dailyStats": [
      {
        "date": "2024-01-15",
        "assignments": 25,
        "unassignments": 15,
        "moves": 5,
        "batchOperations": 2,
        "successfulOperations": 45,
        "failedOperations": 2,
        "uniqueUsers": 4,
        "uniqueGroups": 8
      }
    ],
    "topUsers": [
      {
        "userId": "user1",
        "userName": "John Doe",
        "userEmail": "john@example.com",
        "operations": 350,
        "successRate": 98.5
      }
    ],
    "topGroups": [
      {
        "groupId": "group1",
        "groupName": "VPN Users",
        "operations": 450,
        "assignments": 250,
        "unassignments": 150,
        "moves": 50
      }
    ]
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
| `startDate` | string | No | ISO 8601 format | Start date for analysis |
| `endDate` | string | No | ISO 8601 format | End date for analysis |
| `includeDetails` | boolean | No | Must be true or false | Include detailed operation breakdown |
| `groupBy` | string | No | Must be 'day', 'week', or 'month' | Group statistics by time period |

### Example Request
```bash
curl -X GET "https://instrada-ogm.example.com/api/admin/audit-logs/analytics/group-changes?days=30&includeDetails=true&groupBy=day" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json"
```

### Security Considerations
- Requires ADMIN or SUPER_ADMIN role
- Contains sensitive group management analytics
- All access is logged for audit purposes
- Rate limiting applies to prevent abuse

### Rate Limiting

**Rate Limit Strategy:** User-based

**Default Rate Limits:**
- **Public Endpoints**: N/A (authenticated only)
- **Authenticated Endpoints**: 40 requests per hour
- **API Key Endpoints**: Configurable per key (default: 40/hour)

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
    "limit": 40,
    "remaining": 0,
    "resetTime": 1640995200,
    "windowType": "hourly",
    "retryAfter": 2700
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

## GET /api/admin/audit-logs/analytics/host-aliases

Get analytics for host alias creation/modification/deletion operations and related audit data.

### HTTP Methods
- `GET` - Retrieve host alias analytics

### Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access endpoint (returns "Unauthorized")
- **ADMIN**: ✅ Can access endpoint
- **SUPER_ADMIN**: ✅ Can access endpoint

**Role Access:**
- **USER**: ❌ Forbidden - insufficient permissions
- **ADMIN**: ✅ Can access host alias analytics with administrative permissions
- **SUPER_ADMIN**: ✅ Can access host alias analytics with full system permissions

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
      "totalOperations": 850,
      "creations": 450,
      "modifications": 300,
      "deletions": 100,
      "successRate": 94.2,
      "uniqueUsers": 8,
      "uniqueHostAliases": 320
    },
    "dailyStats": [
      {
        "date": "2024-01-15",
        "creations": 15,
        "modifications": 10,
        "deletions": 3,
        "successfulOperations": 26,
        "failedOperations": 2,
        "uniqueUsers": 3
      }
    ],
    "topUsers": [
      {
        "userId": "user1",
        "userName": "John Doe",
        "userEmail": "john@example.com",
        "operations": 250,
        "successRate": 96.0
      }
    ],
    "operationTypes": {
      "HOST_ALIAS_CREATED": 450,
      "HOST_ALIAS_MODIFIED": 300,
      "HOST_ALIAS_DELETED": 100
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
| `startDate` | string | No | ISO 8601 format | Start date for analysis |
| `endDate` | string | No | ISO 8601 format | End date for analysis |
| `includeDetails` | boolean | No | Must be true or false | Include detailed operation breakdown |
| `groupBy` | string | No | Must be 'day', 'week', or 'month' | Group statistics by time period |
| `operationType` | string | No | Valid operation types | Filter by specific operation type |

### Example Request
```bash
curl -X GET "https://instrada-ogm.example.com/api/admin/audit-logs/analytics/host-aliases?days=30&includeDetails=true&groupBy=day&operationType=HOST_ALIAS_CREATED" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json"
```

### Security Considerations
- Requires ADMIN or SUPER_ADMIN role
- Contains sensitive host management analytics
- All access is logged for audit purposes
- Rate limiting applies to prevent abuse

### Rate Limiting

**Rate Limit Strategy:** User-based

**Default Rate Limits:**
- **Public Endpoints**: N/A (authenticated only)
- **Authenticated Endpoints**: 40 requests per hour
- **API Key Endpoints**: Configurable per key (default: 40/hour)

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
    "limit": 40,
    "remaining": 0,
    "resetTime": 1640995200,
    "windowType": "hourly",
    "retryAfter": 2700
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
    "field": "days",
    "message": "Days must be between 1 and 90"
  }
}
```

### 429 Rate Limited
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "rateLimitInfo": {
    "limit": 50,
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
  "message": "Failed to retrieve analytics data"
}
```

---

## Usage Notes

### Data Retention
- Analytics data is retained for 90 days by default
- Daily aggregated statistics are retained longer
- Real-time data is ephemeral (last 5 minutes)
- Audit logs may have different retention policies

### Performance Considerations
- Use date ranges to limit data volume
- Enable details only when needed
- Real-time monitoring updates every 5 seconds
- Large date ranges may result in slower responses

### Security
- All admin analytics endpoints require ADMIN or SUPER_ADMIN role
- All access is logged for audit purposes
- Data includes sensitive system-wide metrics
- Rate limiting applies to prevent abuse

### Best Practices
1. **Use Appropriate Time Ranges**: Limit date ranges to reduce response times
2. **Cache When Possible**: Cache non-time-sensitive data to reduce load
3. **Monitor Rate Limits**: Check rate limit headers to avoid throttling
4. **Handle Errors Gracefully**: Implement proper error handling for all endpoints
5. **Use Pagination**: For endpoints returning large datasets, use pagination
6. **Filter Data**: Use available filters to reduce unnecessary data transfer

### Integration Examples

#### JavaScript/Node.js Example
```javascript
const axios = require('axios');

async function getCombinedAnalytics(days = 30) {
  try {
    const response = await axios.get(
      `https://instrada-ogm.example.com/api/admin/analytics/combined?days=${days}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.ADMIN_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Combined Analytics:', response.data);
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 429) {
      const retryAfter = error.response.data.rateLimitInfo.retryAfter;
      console.log(`Rate limited. Retry after ${retryAfter} seconds`);
    } else {
      console.error('Error fetching analytics:', error.message);
    }
  }
}
```

#### Python Example
```python
import requests
import time

def get_realtime_analytics(api_key):
    url = "https://instrada-ogm.example.com/api/admin/analytics/realtime"
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 429:
            retry_after = e.response.json().get('rateLimitInfo', {}).get('retryAfter', 60)
            print(f"Rate limited. Retrying after {retry_after} seconds...")
            time.sleep(retry_after)
            return get_realtime_analytics(api_key)
        else:
            print(f"Error: {e}")
            return None
```

---

## Data Structures Reference

### Analytics Summary Structure
```json
{
  "period": {
    "days": 30,
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-01-31T00:00:00Z"
  },
  "summary": {
    "totalRequests": 45000,
    "successfulRequests": 43500,
    "failedRequests": 1500,
    "successRate": 96.7,
    "uniqueUsers": 45,
    "uniqueSessions": 320
  }
}
```

### Daily Statistics Structure
```json
{
  "date": "2024-01-15",
  "totalRequests": 850,
  "successfulRequests": 820,
  "failedRequests": 30,
  "uniqueUsers": 12,
  "averageResponseTime": 245.5
}
```

### Activity Structure
```json
{
  "id": "activity1",
  "timestamp": "2024-01-15T10:30:00Z",
  "type": "api_request",
  "user": {
    "id": "user1",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "action": "GET /api/vpn/status",
  "details": {
    "endpoint": "/api/vpn/status",
    "method": "GET",
    "statusCode": 200,
    "responseTime": 234
  }
}
```

---

## API Navigation

### API Documentation
- [🔍 API Index](API_Index.md) - Complete API endpoint index
- [🔑 Authentication](02_authentication_endpoints.md) - Authentication methods

### Related API Categories
- [📊 Analytics Endpoints](11_analytics_endpoints.md) - Analytics and reporting
- [👤 User Management](05_account_endpoints.md) - User account APIs
- [🔐 Security Features](02_authentication_endpoints.md) - Authentication and security

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

### Rate Limit Info Structure
```json
{
  "limit": 50,
  "remaining": 25,
  "resetTime": 1640995200,
  "windowType": "hourly",
  "retryAfter": 1800
}