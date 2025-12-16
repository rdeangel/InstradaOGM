# Analytics & Monitoring API Endpoints

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
curl -X GET "${SERVER_URL}/api/account/sessions/analytics" \
  -H "Authorization: Bearer ${API_KEY}"
```

## Overview
This document covers all analytics and monitoring API endpoints in the InstradaOGM. These endpoints provide comprehensive insights into API usage, system performance, and real-time monitoring capabilities.

---

## Authentication Requirements

### User Analytics Endpoints
- **Authentication**: Valid session or API key
- **Access**: Users can only access their own analytics data

### Admin Analytics Endpoints  
- **Authentication**: Valid session or API key
- **Role**: ADMIN or SUPER_ADMIN required
- **Access**: System-wide analytics and monitoring data

---

## User Analytics Endpoints

### GET /api/account/sessions/analytics
Get detailed session analytics for the current user.

**Authentication**: Required

**Parameters:**
- `days` (number, optional): Number of days to analyze (default: 30, max: 90)
  - **Validation**: Must be between 1 and 90
  - **Example**: `30`

- `includeEvents` (boolean, optional): Include recent session events data
  - **Validation**: Must be true or false
  - **Default**: `false`
  - **Example**: `true`

**Example Request:**
```bash
curl -X GET "https://instrada-ogm.example.com/api/account/sessions/analytics?days=30&includeEvents=true" \
  -H "Authorization: Bearer your-session-token" \
  -H "Content-Type: application/json"
```

**Example Response:**
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
      "totalRequests": 2450,
      "apiCalls": 1200,
      "pageViews": 800,
      "uiActions": 450,
      "avgRequestsPerDay": 81.7,
      "totalSessions": 45,
      "avgRequestsPerSession": 54.4
    },
    "dailyStats": [
      {
        "date": "2024-01-15",
        "totalRequests": 95,
        "apiCalls": 45,
        "pageViews": 30,
        "uiActions": 20,
        "avgResponseTime": 234.5,
        "sessions": 2
      }
    ],
    "recentEvents": [
      {
        "timestamp": "2024-01-15T10:30:00Z",
        "endpoint": "/api/vpn/status",
        "actionType": "api_call",
        "statusCode": 200,
        "responseTime": 234
      }
    ]
  }
}
```

---

### GET /api/account/api-keys/[id]/usage
Get detailed usage statistics for a specific API key.

**Authentication**: Required (User must own the API key)

**Parameters:**
- `id` (path): API key ID
- `includeTrends` (query, optional): Include usage trends data
- `trendDays` (query, optional): Number of days for trends (default: 30, max: 90)

**Example Request:**
```bash
curl -X GET "https://instrada-ogm.example.com/api/account/api-keys/clx123abc/usage?includeTrends=true&trendDays=30" \
  -H "Authorization: Bearer your-session-token" \
  -H "Content-Type: application/json"
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "apiKeyId": "clx123abc",
    "name": "Production API Key",
    "totalRequests": 1250,
    "successfulRequests": 1200,
    "failedRequests": 50,
    "rateLimitViolations": 5,
    "lastUsed": "2024-01-15T10:30:00Z",
    "currentUsage": {
      "hourly": { "current": 45, "limit": 100, "remaining": 55 },
      "daily": { "current": 890, "limit": 1000, "remaining": 110 },
      "monthly": { "current": 15000, "limit": 50000, "remaining": 35000 }
    },
    "topEndpoints": [
      { "endpoint": "/api/vpn/status", "count": 450, "percentage": 36.0 },
      { "endpoint": "/api/devices/list", "count": 300, "percentage": 24.0 }
    ],
    "trends": [
      { "date": "2024-01-14", "requests": 120, "errors": 2 },
      { "date": "2024-01-15", "requests": 135, "errors": 1 }
    ]
  }
}
```

---

### GET /api/account/api-keys/[id]/analytics
Get detailed analytics for a specific API key including daily statistics and recent events.

**Authentication**: Required (User must own the API key)

**Parameters:**
- `id` (path): API key ID
- `days` (query, optional): Number of days to analyze (default: 30, max: 90)
- `includeEvents` (query, optional): Include recent events data

**Example Request:**
```bash
curl -X GET "https://instrada-ogm.example.com/api/account/api-keys/clx123abc/analytics?days=7&includeEvents=true" \
  -H "Authorization: Bearer your-session-token" \
  -H "Content-Type: application/json"
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "apiKeyId": "clx123abc",
    "dailyStats": [
      {
        "date": "2024-01-15",
        "totalRequests": 135,
        "successfulRequests": 133,
        "failedRequests": 2,
        "rateLimitHits": 0,
        "avgResponseTime": 245.5,
        "topEndpoints": {
          "/api/vpn/status": 45,
          "/api/devices/list": 30
        }
      }
    ],
    "recentEvents": [
      {
        "timestamp": "2024-01-15T10:30:00Z",
        "endpoint": "/api/vpn/status",
        "method": "GET",
        "statusCode": 200,
        "responseTime": 234,
        "rateLimitHit": false
      }
    ]
  }
}
```

---

### GET /api/account/api-keys/usage/summary
Get aggregated usage summary for all user's API keys.

**Authentication**: Required

**Parameters:**
- `includeDetailedStats` (query, optional): Include detailed stats for each API key

**Example Request:**
```bash
curl -X GET "https://instrada-ogm.example.com/api/account/api-keys/usage/summary?includeDetailedStats=true" \
  -H "Authorization: Bearer your-session-token" \
  -H "Content-Type: application/json"
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalApiKeys": 3,
      "activeApiKeys": 2,
      "totalRequests": 5420,
      "rateLimitViolations": 12,
      "topApiKeys": [
        { "id": "clx123abc", "name": "Production API", "requests": 3200 },
        { "id": "clx456def", "name": "Development API", "requests": 1800 }
      ],
      "usageByPeriod": {
        "last24Hours": 245,
        "last7Days": 1680,
        "last30Days": 5420
      }
    }
  }
}
```

---

## Admin Analytics Endpoints

### GET /api/admin/sessions/analytics/system
Get system-wide session analytics.

**Authentication**: Required (ADMIN or SUPER_ADMIN)

**Parameters:**
- `days` (query, optional): Number of days to analyze (default: 30, max: 90)

**Example Request:**
```bash
curl -X GET "https://instrada-ogm.example.com/api/admin/sessions/analytics/system?days=30" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json"
```

**Example Response:**
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
      "totalRequests": 25000,
      "totalApiCalls": 12000,
      "totalPageViews": 8000,
      "totalUiActions": 5000,
      "totalUsers": 45,
      "totalSessions": 320,
      "avgRequestsPerUser": 556,
      "avgRequestsPerSession": 78
    },
    "dailyStats": [
      {
        "date": "2024-01-15",
        "totalRequests": 850,
        "apiCalls": 400,
        "pageViews": 300,
        "uiActions": 150,
        "uniqueUsers": 12,
        "uniqueSessions": 18,
        "avgResponseTime": 245.5
      }
    ],
    "topUsers": [
      {
        "userId": "user1",
        "userName": "John Doe",
        "requests": 2500,
        "sessions": 25
      }
    ]
  }
}
```

---

### GET /api/admin/analytics/combined
Get combined API key and session analytics.

**Authentication**: Required (ADMIN or SUPER_ADMIN)

**Parameters:**
- `days` (query, optional): Number of days to analyze (default: 30, max: 90)

**Example Request:**
```bash
curl -X GET "https://instrada-ogm.example.com/api/admin/analytics/combined?days=30" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json"
```

**Example Response:**
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

---

### GET /api/admin/api-keys/usage/overview
Get system-wide API key usage overview.

**Authentication**: Required (ADMIN or SUPER_ADMIN)

**Example Request:**
```bash
curl -X GET "https://instrada-ogm.example.com/api/admin/api-keys/usage/overview" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json"
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "totalApiKeys": 45,
    "activeApiKeys": 38,
    "totalUsers": 12,
    "totalRequests": 125000,
    "rateLimitViolations": 234,
    "topUsers": [
      { "id": "user1", "name": "John Doe", "email": "john@example.com", "requests": 25000 },
      { "id": "user2", "name": "Jane Smith", "email": "jane@example.com", "requests": 18000 }
    ],
    "topApiKeys": [
      { "id": "key1", "name": "Production API", "user": "John Doe", "requests": 15000 },
      { "id": "key2", "name": "Monitoring API", "user": "Jane Smith", "requests": 12000 }
    ],
    "usageByPeriod": {
      "last24Hours": 2450,
      "last7Days": 16800,
      "last30Days": 125000
    },
    "requestsByEndpoint": [
      { "endpoint": "/api/vpn/status", "count": 35000, "percentage": 28.0 },
      { "endpoint": "/api/devices/list", "count": 22000, "percentage": 17.6 }
    ]
  }
}
```

---

### GET /api/admin/api-keys/usage/trends
Get system-wide API key usage trends over time.

**Authentication**: Required (ADMIN or SUPER_ADMIN)

**Parameters:**
- `days` (query, optional): Number of days to analyze (default: 30, max: 90)

**Example Request:**
```bash
curl -X GET "https://instrada-ogm.example.com/api/admin/api-keys/usage/trends?days=30" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json"
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "trends": [
      {
        "date": "2024-01-15",
        "totalRequests": 2450,
        "successfulRequests": 2380,
        "failedRequests": 70,
        "rateLimitHits": 12,
        "activeApiKeys": 38,
        "activeUsers": 12
      }
    ],
    "growth": {
      "requestsGrowth": 15.2,
      "usersGrowth": 8.3,
      "apiKeysGrowth": 5.1
    }
  }
}
```

---

### GET /api/admin/api-keys/usage/users/[userId]
Get API key usage statistics for a specific user.

**Authentication**: Required (ADMIN or SUPER_ADMIN)

**Parameters:**
- `userId` (path): User ID to get statistics for

**Example Request:**
```bash
curl -X GET "https://instrada-ogm.example.com/api/admin/api-keys/usage/users/user123" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json"
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user123",
      "name": "John Doe",
      "email": "john@example.com"
    },
    "summary": {
      "totalApiKeys": 3,
      "activeApiKeys": 2,
      "totalRequests": 5420,
      "rateLimitViolations": 12,
      "lastActivity": "2024-01-15T10:30:00Z"
    },
    "apiKeys": [
      {
        "id": "key1",
        "name": "Production API",
        "requests": 3200,
        "lastUsed": "2024-01-15T10:30:00Z",
        "enabled": true
      }
    ]
  }
}
```

---

### GET /api/admin/api-keys/analytics/performance
Get comprehensive performance analytics.

**Authentication**: Required (ADMIN or SUPER_ADMIN)

**Parameters:**
- `startDate` (query): Start date for analysis (ISO 8601 format)
- `endDate` (query): End date for analysis (ISO 8601 format)
- `includeDetails` (query, optional): Include detailed endpoint performance

**Example Request:**
```bash
curl -X GET "https://instrada-ogm.example.com/api/admin/api-keys/analytics/performance?startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z&includeDetails=true" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json"
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "metrics": {
      "averageResponseTime": 245.7,
      "p95ResponseTime": 450.2,
      "p99ResponseTime": 890.5,
      "errorRate": 0.023,
      "throughput": 12.5,
      "totalRequests": 45000,
      "successfulRequests": 43965,
      "failedRequests": 1035
    },
    "endpointPerformance": [
      {
        "endpoint": "/api/vpn/status",
        "method": "GET",
        "averageResponseTime": 180.5,
        "requestCount": 15000,
        "errorRate": 0.012,
        "p95ResponseTime": 320.0
      }
    ],
    "timeSeries": [
      {
        "timestamp": "2024-01-14T00:00:00Z",
        "responseTime": 235.2,
        "throughput": 11.8,
        "errorRate": 0.018,
        "requests": 1020
      }
    ],
    "period": {
      "startDate": "2024-01-01T00:00:00Z",
      "endDate": "2024-01-31T23:59:59Z",
      "days": 31
    }
  }
}
```

---

### GET /api/admin/analytics/realtime
Get current real-time system metrics and activity.

**Authentication**: Required (ADMIN or SUPER_ADMIN)

**Example Request:**
```bash
curl -X GET "https://instrada-ogm.example.com/api/admin/analytics/realtime" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json"
```

**Example Response:**
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

---

## Audit Log Analytics Endpoints

### GET /api/admin/audit-logs/analytics/group-changes
Get analytics for group assignment/unassignment operations.

**Authentication**: Required (ADMIN or SUPER_ADMIN)

**Parameters:**
- `days` (query, optional): Number of days to analyze (default: 30, max: 90)
- `startDate` (query, optional): Start date for analysis (ISO 8601 format)
- `endDate` (query, optional): End date for analysis (ISO 8601 format)

**Example Request:**
```bash
curl -X GET "https://instrada-ogm.example.com/api/admin/audit-logs/analytics/group-changes?days=30" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json"
```

**Example Response:**
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

---

### GET /api/admin/audit-logs/analytics/host-aliases
Get analytics for host alias creation/modification/deletion operations.

**Authentication**: Required (ADMIN or SUPER_ADMIN)

**Parameters:**
- `days` (query, optional): Number of days to analyze (default: 30, max: 90)
- `startDate` (query, optional): Start date for analysis (ISO 8601 format)
- `endDate` (query, optional): End date for analysis (ISO 8601 format)

**Example Request:**
```bash
curl -X GET "https://instrada-ogm.example.com/api/admin/audit-logs/analytics/host-aliases?days=30" \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json"
```

**Example Response:**
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

---

## Settings Endpoints

### GET /api/settings/analytics-enabled
Check if advanced analytics is enabled.

**Authentication**: Not required (public endpoint)

**Example Request:**
```bash
curl -X GET "https://instrada-ogm.example.com/api/settings/analytics-enabled" \
  -H "Content-Type: application/json"
```

**Example Response:**
```json
{
  "success": true,
  "enableAdvancedAnalytics": true
}
```

---

## Error Responses

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Insufficient permissions - ADMIN role required"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "API key not found or access denied"
}
```

### 429 Rate Limited
```json
{
  "success": false,
  "message": "Rate limit exceeded"
}
```

---

## Usage Notes

### Rate Limiting
- Analytics endpoints have their own rate limits
- Real-time monitoring is limited to prevent abuse
- Admin endpoints have stricter rate limits

### Data Retention
- Usage events are retained for 90 days by default
- Daily aggregated statistics are retained longer
- Real-time data is ephemeral (last 5 minutes)

### Performance Considerations
- Use date ranges to limit data volume
- Enable trends/details only when needed
- Real-time monitoring updates every 5 seconds

### Security
- Users can only access their own API key analytics
- Admin users can access system-wide statistics
- All analytics operations are audit logged

---

## API Navigation

### API Documentation
- [🔍 API Index](API_Index.md) - Complete API endpoint index
- [🔑 Authentication](02_authentication_endpoints.md) - Authentication methods

### Related API Categories
- [🌐 Public Endpoints](01_public_endpoints.md) - Unauthenticated access points
- [🔐 Authentication Endpoints](02_authentication_endpoints.md) - Authentication and session management
- [👤 User Management](05_account_endpoints.md) - User account APIs
- [👨‍💼 Admin Functions](04_admin_endpoints.md) - Administrative APIs
- [🔒 VPN Management](10_vpn_endpoints.md) - VPN service control

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

**Last Updated**: 2025-11-06 | **API Version**: 1.0 | **Category**: API Documentation
