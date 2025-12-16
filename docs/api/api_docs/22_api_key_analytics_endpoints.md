# API Key Analytics Endpoints

[⬆️ Back to API Index](API_Index.md) | [📚 Back to Documentation Home](../../DOCUMENTATION_INDEX.md)

## Variables

Replace the following variables in examples below:

- `{{SERVER_URL}}` - Your server URL (e.g., `https://instrada-ogm.example.com`)
- `{{API_KEY}}` - Your API key for authentication
- `{{API_KEY_ID}}` - The ID of the specific API key you want to analyze
- `{{USER_ID}}` - The ID of the user you want to analyze (admin only)

**Example:**
```bash
# Set variables
SERVER_URL="https://instrada-ogm.example.com"
API_KEY="your-api-key-here"
API_KEY_ID="key-uuid-12345"
USER_ID="user-uuid-67890"

# Use in curl commands
curl -X GET "${SERVER_URL}/api/account/api-keys/${API_KEY_ID}/analytics" \
  -H "Authorization: Bearer ${API_KEY}"
```

This section covers all API key analytics endpoints for monitoring API key performance, usage patterns, and system-wide analytics.

## Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ✅ Can access own API key analytics
- **ADMIN**: ✅ Can access own API key analytics and admin analytics endpoints
- **SUPER_ADMIN**: ✅ Can access own API key analytics and all admin analytics endpoints

**Role Access:**
- **USER**: ✅ Can access analytics for their own API keys only
- **ADMIN**: ✅ Can access analytics for their own API keys and system-wide performance analytics
- **SUPER_ADMIN**: ✅ Can access analytics for their own API keys and all system-wide analytics including user-specific data

**Example Responses:**

**USER Role Success (Own API Key):**
```json
{
  "success": true,
  "data": {
    "apiKeyId": "key-uuid-1",
    "analytics": {
      "totalRequests": 15420,
      "successRate": 99.1,
      "avgResponseTime": 235.5
    }
  }
}
```

**ADMIN/SUPER_ADMIN Success (System Analytics):**
```json
{
  "success": true,
  "data": {
    "systemAnalytics": {
      "totalApiKeys": 150,
      "activeApiKeys": 120,
      "totalRequests": 1250000,
      "systemHealth": "optimal"
    }
  }
}
```

**USER Role Failure (Accessing Other User's Key):**
```json
{
  "success": false,
  "message": "Access denied: Cannot access analytics for this API key"
}
```

**Unauthenticated Access Failure:**
```json
{
  "success": false,
  "message": "Authentication required"
}
```

## Rate Limiting

**Rate Limit Strategy:** User-based for account endpoints, API Key-based for admin endpoints

**Default Rate Limits:**
- **Public Endpoints**: N/A (all endpoints require authentication)
- **Authenticated Endpoints**: 150 requests per hour per user
- **API Key Endpoints**: Configurable per key (default: 150/hour)

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
    "limit": 150,
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
4. **Cache Responses**: Cache non-sensitive analytics data to reduce API calls
5. **Batch Operations**: Use appropriate time ranges to reduce request count
6. **API Key Limits**: Configure appropriate limits for your use case

---

## API Key Analytics

### GET /api/account/api-keys/[id]/analytics

**Description**: Get comprehensive analytics for a specific API key including performance metrics, usage patterns, and detailed statistics.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can access analytics for own API keys
- **ADMIN**: ✅ Can access analytics for own API keys
- **SUPER_ADMIN**: ✅ Can access analytics for own API keys

**Path Parameters:**
- `id` (string, required): The unique identifier of the API key
  - **Validation**: Must be a valid UUID
  - **Example**: `key-uuid-12345`

**Query Parameters:**
- `period` (string, optional): Time period for analytics ('7', '30', '90', 'all') - default: '30'
  - **Validation**: Must be one of '7', '30', '90', 'all'
  - **Example**: `30`
- `includeDetailedStats` (boolean, optional): Include detailed breakdown of statistics - default: `false`
  - **Validation**: Must be true or false
  - **Example**: `true`
- `groupBy` (string, optional): Group analytics by 'day', 'week', 'month', or 'endpoint' - default: 'day'
  - **Validation**: Must be one of 'day', 'week', 'month', 'endpoint'
  - **Example**: `endpoint`
- `includeErrors` (boolean, optional): Include error analysis and breakdown - default: `false`
  - **Validation**: Must be true or false
  - **Example**: `true`

#### Usage Case 1: Basic API Key Analytics

**Scenario**: User retrieves basic analytics for their API key for the last 30 days

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/api-keys/{{API_KEY_ID}}/analytics?period=30" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "apiKeyId": "key-uuid-12345",
    "apiKeyName": "Production API Key",
    "period": {
      "days": 30,
      "startDate": "2024-01-01T00:00:00Z",
      "endDate": "2024-01-31T00:00:00Z",
      "label": "Last 30 Days"
    },
    "summary": {
      "totalRequests": 15420,
      "successfulRequests": 15280,
      "failedRequests": 140,
      "successRate": 99.1,
      "avgResponseTime": 235.5,
      "minResponseTime": 45.2,
      "maxResponseTime": 1250.8,
      "totalDataTransferred": 2.45,
      "avgDataPerRequest": 0.00016,
      "rateLimitHits": 8,
      "uniqueEndpoints": 12,
      "uniqueIps": 3,
      "lastUsed": "2024-01-15T14:30:00.000Z",
      "enabled": true
    },
    "usageByPeriod": {
      "last24Hours": 450,
      "last7Days": 2100,
      "last30Days": 15420
    },
    "usageByHour": [
      {
        "hour": 14,
        "requests": 1250,
        "percentage": 8.1,
        "avgResponseTime": 220.5
      },
      {
        "hour": 15,
        "requests": 1180,
        "percentage": 7.7,
        "avgResponseTime": 245.2
      }
    ],
    "topEndpoints": [
      {
        "endpoint": "/api/vpn/status",
        "count": 6200,
        "percentage": 40.2,
        "avgResponseTime": 180.5,
        "successRate": 99.8
      },
      {
        "endpoint": "/api/opnsense/aliases",
        "count": 3100,
        "percentage": 20.1,
        "avgResponseTime": 320.8,
        "successRate": 98.9
      }
    ]
  }
}
```

#### Usage Case 2: Detailed Analytics with Error Analysis

**Scenario**: User retrieves comprehensive analytics with detailed statistics and error breakdown

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/api-keys/{{API_KEY_ID}}/analytics?period=30&includeDetailedStats=true&includeErrors=true&groupBy=endpoint" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "apiKeyId": "key-uuid-12345",
    "apiKeyName": "Production API Key",
    "period": {
      "days": 30,
      "startDate": "2024-01-01T00:00:00Z",
      "endDate": "2024-01-31T00:00:00Z",
      "label": "Last 30 Days"
    },
    "summary": {
      "totalRequests": 15420,
      "successfulRequests": 15280,
      "failedRequests": 140,
      "successRate": 99.1,
      "avgResponseTime": 235.5,
      "minResponseTime": 45.2,
      "maxResponseTime": 1250.8,
      "totalDataTransferred": 2.45,
      "avgDataPerRequest": 0.00016,
      "rateLimitHits": 8,
      "uniqueEndpoints": 12,
      "uniqueIps": 3,
      "lastUsed": "2024-01-15T14:30:00.000Z",
      "enabled": true
    },
    "detailedStats": {
      "requestMethods": {
        "GET": 12400,
        "POST": 2100,
        "PUT": 650,
        "DELETE": 270
      },
      "responseCodes": {
        "200": 15280,
        "201": 0,
        "400": 85,
        "401": 25,
        "403": 15,
        "404": 10,
        "429": 5,
        "500": 0
      },
      "dataTransfer": {
        "totalBytes": 2450000000,
        "totalMB": 2450.0,
        "totalGB": 2.45,
        "avgBytesPerRequest": 158898,
        "maxBytesPerRequest": 5242880,
        "minBytesPerRequest": 1024
      },
      "performance": {
        "p50": 180.5,
        "p90": 450.2,
        "p95": 680.8,
        "p99": 950.5,
        "stdDev": 125.3
      }
    },
    "errorAnalysis": {
      "totalErrors": 140,
      "errorRate": 0.9,
      "errorsByType": [
        {
          "type": "client_error",
          "count": 135,
          "percentage": 96.4,
          "description": "4xx client errors"
        },
        {
          "type": "rate_limit",
          "count": 5,
          "percentage": 3.6,
          "description": "Rate limit exceeded"
        }
      ],
      "errorsByCode": [
        {
          "code": 400,
          "count": 85,
          "percentage": 60.7,
          "description": "Bad Request"
        },
        {
          "code": 401,
          "count": 25,
          "percentage": 17.9,
          "description": "Unauthorized"
        }
      ],
      "errorsByEndpoint": [
        {
          "endpoint": "/api/opnsense/aliases",
          "errors": 45,
          "errorRate": 1.4,
          "topErrorCodes": [400, 401]
        }
      ],
      "recentErrors": [
        {
          "timestamp": "2024-01-15T14:25:00.000Z",
          "endpoint": "/api/opnsense/aliases",
          "method": "POST",
          "statusCode": 400,
          "responseTime": 125.5,
          "ipAddress": "192.168.1.100",
          "userAgent": "API Client v1.0",
          "error": "Invalid request parameters"
        }
      ]
    },
    "endpointBreakdown": [
      {
        "endpoint": "/api/vpn/status",
        "count": 6200,
        "percentage": 40.2,
        "avgResponseTime": 180.5,
        "successRate": 99.8,
        "dataTransferred": 0.85,
        "methods": {
          "GET": 6200
        },
        "responseCodes": {
          "200": 6188,
          "401": 8,
          "429": 4
        }
      }
    ]
  }
}
```

#### Usage Case 3: Invalid API Key ID

**Scenario**: User provides an invalid API key ID

**Error Response**:
```json
{
  "success": false,
  "message": "API key not found or access denied"
}
```

**Response Fields**:
- `apiKeyId`: The unique identifier of the API key
- `apiKeyName`: The display name of the API key
- `period`: Time period information for the analytics
- `summary`: Overall usage summary
  - `totalRequests`: Total number of requests
  - `successfulRequests`: Number of successful requests
  - `failedRequests`: Number of failed requests
  - `successRate`: Success rate as percentage
  - `avgResponseTime`: Average response time in milliseconds
  - `minResponseTime`: Minimum response time in milliseconds
  - `maxResponseTime`: Maximum response time in milliseconds
  - `totalDataTransferred`: Total data transferred in GB
  - `avgDataPerRequest`: Average data per request in GB
  - `rateLimitHits`: Number of rate limit violations
  - `uniqueEndpoints`: Number of unique endpoints accessed
  - `uniqueIps`: Number of unique IP addresses used
  - `lastUsed`: Last usage timestamp
  - `enabled`: Whether the API key is currently enabled
- `usageByPeriod`: Usage breakdown by time periods
- `usageByHour`: Usage breakdown by hour of day
- `topEndpoints`: Most frequently accessed endpoints
- `detailedStats` (optional): Detailed statistics when `includeDetailedStats=true`
- `errorAnalysis` (optional): Error analysis when `includeErrors=true`
- `endpointBreakdown` (optional): Endpoint-specific breakdown when grouped by endpoint

---

## API Key Usage

### GET /api/account/api-keys/[id]/usage

**Description**: Get detailed usage information for a specific API key including request history, rate limiting information, and usage patterns.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can access usage for own API keys
- **ADMIN**: ✅ Can access usage for own API keys
- **SUPER_ADMIN**: ✅ Can access usage for own API keys

**Path Parameters:**
- `id` (string, required): The unique identifier of the API key
  - **Validation**: Must be a valid UUID
  - **Example**: `key-uuid-12345`

**Query Parameters:**
- `startDate` (string, optional): Start date for usage data (ISO 8601) - default: 30 days ago
  - **Validation**: Must be a valid ISO 8601 date
  - **Example**: `2024-01-01T00:00:00Z`
- `endDate` (string, optional): End date for usage data (ISO 8601) - default: now
  - **Validation**: Must be a valid ISO 8601 date
  - **Example**: `2024-01-31T23:59:59Z`
- `limit` (number, optional): Number of usage records to return (default: 100, max: 1000)
  - **Validation**: Must be between 1 and 1000
  - **Example**: `50`
- `offset` (number, optional): Number of records to skip for pagination (default: 0)
  - **Validation**: Must be 0 or greater
  - **Example**: `100`
- `groupBy` (string, optional): Group usage by 'hour', 'day', 'week', or 'endpoint' - default: 'day'
  - **Validation**: Must be one of 'hour', 'day', 'week', 'endpoint'
  - **Example**: `hour`
- `includeRateLimitInfo` (boolean, optional): Include detailed rate limiting information - default: `false`
  - **Validation**: Must be true or false
  - **Example**: `true`

#### Usage Case 1: Basic Usage Information

**Scenario**: User retrieves basic usage information for their API key for the last 30 days

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/api-keys/{{API_KEY_ID}}/usage" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "apiKeyId": "key-uuid-12345",
    "apiKeyName": "Production API Key",
    "period": {
      "startDate": "2024-01-01T00:00:00Z",
      "endDate": "2024-01-31T23:59:59Z",
      "days": 30
    },
    "summary": {
      "totalRequests": 15420,
      "successfulRequests": 15280,
      "failedRequests": 140,
      "successRate": 99.1,
      "avgResponseTime": 235.5,
      "totalDataTransferred": 2.45,
      "uniqueEndpoints": 12,
      "uniqueIps": 3,
      "lastUsed": "2024-01-15T14:30:00.000Z"
    },
    "dailyUsage": [
      {
        "date": "2024-01-15",
        "requests": 890,
        "successfulRequests": 875,
        "failedRequests": 15,
        "successRate": 98.3,
        "avgResponseTime": 248.7,
        "dataTransferred": 0.085,
        "uniqueEndpoints": 8,
        "rateLimitHits": 3
      },
      {
        "date": "2024-01-14",
        "requests": 820,
        "successfulRequests": 810,
        "failedRequests": 10,
        "successRate": 98.8,
        "avgResponseTime": 242.3,
        "dataTransferred": 0.078,
        "uniqueEndpoints": 7,
        "rateLimitHits": 2
      }
    ],
    "topEndpoints": [
      {
        "endpoint": "/api/vpn/status",
        "count": 6200,
        "percentage": 40.2,
        "avgResponseTime": 180.5,
        "successRate": 99.8
      },
      {
        "endpoint": "/api/opnsense/aliases",
        "count": 3100,
        "percentage": 20.1,
        "avgResponseTime": 320.8,
        "successRate": 98.9
      }
    ],
    "pagination": {
      "totalCount": 30,
      "limit": 100,
      "offset": 0,
      "hasMore": false
    }
  }
}
```

#### Usage Case 2: Detailed Usage with Rate Limiting Information

**Scenario**: User retrieves detailed usage information with rate limiting data and hourly grouping

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/api-keys/{{API_KEY_ID}}/usage?groupBy=hour&includeRateLimitInfo=true&limit=24" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "apiKeyId": "key-uuid-12345",
    "apiKeyName": "Production API Key",
    "period": {
      "startDate": "2024-01-15T00:00:00Z",
      "endDate": "2024-01-15T23:59:59Z",
      "days": 1
    },
    "summary": {
      "totalRequests": 890,
      "successfulRequests": 875,
      "failedRequests": 15,
      "successRate": 98.3,
      "avgResponseTime": 248.7,
      "totalDataTransferred": 0.085,
      "uniqueEndpoints": 8,
      "uniqueIps": 2,
      "lastUsed": "2024-01-15T14:30:00.000Z"
    },
    "hourlyUsage": [
      {
        "hour": "2024-01-15T14:00:00Z",
        "requests": 125,
        "successfulRequests": 120,
        "failedRequests": 5,
        "successRate": 96.0,
        "avgResponseTime": 220.5,
        "dataTransferred": 0.012,
        "uniqueEndpoints": 5,
        "rateLimitHits": 2
      },
      {
        "hour": "2024-01-15T15:00:00Z",
        "requests": 118,
        "successfulRequests": 115,
        "failedRequests": 3,
        "successRate": 97.5,
        "avgResponseTime": 245.2,
        "dataTransferred": 0.011,
        "uniqueEndpoints": 4,
        "rateLimitHits": 1
      }
    ],
    "rateLimitInfo": {
      "currentLimits": {
        "hourly": 1000,
        "daily": 10000,
        "monthly": 100000,
        "burst": 100
      },
      "currentUsage": {
        "hourly": 125,
        "daily": 890,
        "monthly": 15420,
        "burst": 15
      },
      "remaining": {
        "hourly": 875,
        "daily": 9110,
        "monthly": 84580,
        "burst": 85
      },
      "resetTimes": {
        "hourly": "2024-01-15T15:00:00Z",
        "daily": "2024-01-16T00:00:00Z",
        "monthly": "2024-02-01T00:00:00Z",
        "burst": "2024-01-15T14:01:00Z"
      },
      "violations": {
        "total": 8,
        "thisPeriod": 3,
        "lastViolation": "2024-01-15T14:25:00.000Z"
      }
    },
    "pagination": {
      "totalCount": 24,
      "limit": 24,
      "offset": 0,
      "hasMore": false
    }
  }
}
```

#### Usage Case 3: Invalid Date Range

**Scenario**: User provides an invalid date range

**Error Response**:
```json
{
  "success": false,
  "message": "Invalid date range. Start date must be before end date and within the last 90 days"
}
```

**Response Fields**:
- `apiKeyId`: The unique identifier of the API key
- `apiKeyName`: The display name of the API key
- `period`: Time period information for the usage data
- `summary`: Overall usage summary
- `dailyUsage`/`hourlyUsage`: Usage breakdown by time period
- `topEndpoints`: Most frequently accessed endpoints
- `rateLimitInfo` (optional): Detailed rate limiting information when `includeRateLimitInfo=true`
- `pagination`: Pagination information for the results

---

## Admin API Key Performance Analytics

### GET /api/admin/api-keys/analytics/performance

**Description**: Get system-wide API key performance analytics including overall performance metrics, top performing keys, and performance trends.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ❌ Cannot access admin analytics
- **ADMIN**: ✅ Can access system-wide performance analytics
- **SUPER_ADMIN**: ✅ Can access system-wide performance analytics

**Query Parameters:**
- `period` (string, optional): Time period for analytics ('7', '30', '90', 'all') - default: '30'
  - **Validation**: Must be one of '7', '30', '90', 'all'
  - **Example**: `30`
- `includeTopKeys` (boolean, optional): Include top performing API keys - default: `true`
  - **Validation**: Must be true or false
  - **Example**: `true`
- `topKeysCount` (number, optional): Number of top keys to include (default: 10, max: 50)
  - **Validation**: Must be between 1 and 50
  - **Example**: `20`
- `includeTrends` (boolean, optional): Include performance trends over time - default: `false`
  - **Validation**: Must be true or false
  - **Example**: `true`
- `groupBy` (string, optional): Group trends by 'day', 'week', or 'month' - default: 'day'
  - **Validation**: Must be one of 'day', 'week', 'month'
  - **Example**: `week`

#### Usage Case 1: Basic Performance Analytics

**Scenario**: Admin retrieves basic system-wide API key performance analytics

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/api-keys/analytics/performance?period=30" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "period": {
      "days": 30,
      "startDate": "2024-01-01T00:00:00Z",
      "endDate": "2024-01-31T00:00:00Z",
      "label": "Last 30 Days"
    },
    "summary": {
      "totalApiKeys": 150,
      "activeApiKeys": 120,
      "inactiveApiKeys": 30,
      "totalRequests": 1250000,
      "successfulRequests": 1235000,
      "failedRequests": 15000,
      "systemSuccessRate": 98.8,
      "systemAvgResponseTime": 285.5,
      "totalDataTransferred": 185.5,
      "rateLimitViolations": 450,
      "uniqueEndpoints": 45,
      "uniqueIps": 1250
    },
    "performanceMetrics": {
      "responseTime": {
        "avg": 285.5,
        "min": 45.2,
        "max": 2500.8,
        "p50": 220.5,
        "p90": 450.2,
        "p95": 680.8,
        "p99": 1250.5
      },
      "throughput": {
        "requestsPerSecond": 0.48,
        "requestsPerMinute": 28.9,
        "requestsPerHour": 1736.1,
        "requestsPerDay": 41666.7
      },
      "dataTransfer": {
        "totalGB": 185.5,
        "avgMBPerRequest": 0.148,
        "peakGBPerDay": 8.5
      }
    },
    "topPerformingKeys": [
      {
        "apiKeyId": "key-uuid-1",
        "apiKeyName": "Production API Key",
        "ownerName": "John Doe",
        "ownerEmail": "john.doe@example.com",
        "requests": 15420,
        "successRate": 99.1,
        "avgResponseTime": 235.5,
        "performance": "excellent",
        "score": 95.2
      },
      {
        "apiKeyId": "key-uuid-2",
        "apiKeyName": "Development API Key",
        "ownerName": "Jane Smith",
        "ownerEmail": "jane.smith@example.com",
        "requests": 8960,
        "successRate": 98.5,
        "avgResponseTime": 265.8,
        "performance": "good",
        "score": 87.8
      }
    ],
    "performanceDistribution": {
      "excellent": 45,
      "good": 60,
      "average": 30,
      "poor": 15
    }
  }
}
```

#### Usage Case 2: Performance Analytics with Trends

**Scenario**: Admin retrieves performance analytics with weekly trends and extended top keys list

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/api-keys/analytics/performance?period=90&includeTrends=true&groupBy=week&topKeysCount=20" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "period": {
      "days": 90,
      "startDate": "2023-12-01T00:00:00Z",
      "endDate": "2024-01-31T00:00:00Z",
      "label": "Last 90 Days"
    },
    "summary": {
      "totalApiKeys": 150,
      "activeApiKeys": 120,
      "inactiveApiKeys": 30,
      "totalRequests": 3750000,
      "successfulRequests": 3705000,
      "failedRequests": 45000,
      "systemSuccessRate": 98.8,
      "systemAvgResponseTime": 285.5,
      "totalDataTransferred": 556.5,
      "rateLimitViolations": 1350,
      "uniqueEndpoints": 45,
      "uniqueIps": 1250
    },
    "performanceMetrics": {
      "responseTime": {
        "avg": 285.5,
        "min": 45.2,
        "max": 2500.8,
        "p50": 220.5,
        "p90": 450.2,
        "p95": 680.8,
        "p99": 1250.5
      },
      "throughput": {
        "requestsPerSecond": 0.48,
        "requestsPerMinute": 28.9,
        "requestsPerHour": 1736.1,
        "requestsPerDay": 41666.7
      },
      "dataTransfer": {
        "totalGB": 556.5,
        "avgMBPerRequest": 0.148,
        "peakGBPerDay": 8.5
      }
    },
    "topPerformingKeys": [
      {
        "apiKeyId": "key-uuid-1",
        "apiKeyName": "Production API Key",
        "ownerName": "John Doe",
        "ownerEmail": "john.doe@example.com",
        "requests": 46260,
        "successRate": 99.1,
        "avgResponseTime": 235.5,
        "performance": "excellent",
        "score": 95.2
      }
    ],
    "performanceTrends": [
      {
        "week": "2024-W02",
        "startDate": "2024-01-08",
        "endDate": "2024-01-14",
        "totalRequests": 416667,
        "successfulRequests": 411667,
        "failedRequests": 5000,
        "successRate": 98.8,
        "avgResponseTime": 275.5,
        "activeApiKeys": 118,
        "rateLimitViolations": 150
      },
      {
        "week": "2024-W03",
        "startDate": "2024-01-15",
        "endDate": "2024-01-21",
        "totalRequests": 425000,
        "successfulRequests": 420000,
        "failedRequests": 5000,
        "successRate": 98.8,
        "avgResponseTime": 285.5,
        "activeApiKeys": 120,
        "rateLimitViolations": 150
      }
    ],
    "performanceDistribution": {
      "excellent": 45,
      "good": 60,
      "average": 30,
      "poor": 15
    }
  }
}
```

#### Usage Case 3: Insufficient Permissions

**Scenario**: User role attempts to access admin analytics

**Error Response**:
```json
{
  "success": false,
  "message": "Access denied: ADMIN or SUPER_ADMIN role required"
}
```

**Response Fields**:
- `period`: Time period information for the analytics
- `summary`: Overall system performance summary
- `performanceMetrics`: Detailed performance metrics
  - `responseTime`: Response time statistics
  - `throughput`: Request throughput metrics
  - `dataTransfer`: Data transfer statistics
- `topPerformingKeys`: List of top performing API keys
- `performanceTrends` (optional): Performance trends over time when `includeTrends=true`
- `performanceDistribution`: Distribution of API keys by performance category

---

## Admin API Key System Analytics

### GET /api/admin/api-keys/analytics/system

**Description**: Get comprehensive system analytics for API keys including system health, resource utilization, and operational metrics.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ❌ Cannot access admin analytics
- **ADMIN**: ✅ Can access system analytics
- **SUPER_ADMIN**: ✅ Can access system analytics

**Query Parameters:**
- `includeHealthMetrics` (boolean, optional): Include detailed system health metrics - default: `true`
  - **Validation**: Must be true or false
  - **Example**: `true`
- `includeResourceUtilization` (boolean, optional): Include resource utilization data - default: `true`
  - **Validation**: Must be true or false
  - **Example**: `true`
- `includeOperationalMetrics` (boolean, optional): Include operational metrics - default: `true`
  - **Validation**: Must be true or false
  - **Example**: `true`
- `timeRange` (string, optional): Time range for metrics ('1h', '6h', '24h', '7d') - default: '24h'
  - **Validation**: Must be one of '1h', '6h', '24h', '7d'
  - **Example**: `6h`

#### Usage Case 1: Basic System Analytics

**Scenario**: Admin retrieves basic system analytics for API keys

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/api-keys/analytics/system" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "timestamp": "2024-01-15T15:30:00.000Z",
    "timeRange": "24h",
    "systemOverview": {
      "totalApiKeys": 150,
      "activeApiKeys": 120,
      "inactiveApiKeys": 30,
      "systemHealth": "optimal",
      "healthScore": 95.2,
      "uptime": 99.98,
      "version": "2.1.0"
    },
    "healthMetrics": {
      "apiGateway": {
        "status": "healthy",
        "responseTime": 45.5,
        "errorRate": 0.1,
        "throughput": 1250.5
      },
      "database": {
        "status": "healthy",
        "responseTime": 12.3,
        "connectionPool": {
          "active": 25,
          "idle": 75,
          "total": 100
        },
        "queryPerformance": {
          "avgExecutionTime": 15.2,
          "slowQueries": 2
        }
      },
      "cache": {
        "status": "healthy",
        "hitRate": 94.5,
        "memoryUsage": 65.2,
        "evictions": 1250
      },
      "rateLimiter": {
        "status": "healthy",
        "activeRules": 150,
        "violations": 450,
        "avgProcessingTime": 2.5
      }
    },
    "resourceUtilization": {
      "cpu": {
        "usage": 45.2,
        "cores": 8,
        "loadAverage": [1.2, 1.5, 1.8]
      },
      "memory": {
        "used": 8.5,
        "total": 16.0,
        "usage": 53.1,
        "swap": {
          "used": 0.5,
          "total": 4.0,
          "usage": 12.5
        }
      },
      "disk": {
        "used": 125.5,
        "total": 500.0,
        "usage": 25.1,
        "iops": 1250
      },
      "network": {
        "incoming": 125.5,
        "outgoing": 85.2,
        "connections": 450
      }
    },
    "operationalMetrics": {
      "requests": {
        "total": 1250000,
        "successful": 1235000,
        "failed": 15000,
        "successRate": 98.8,
        "avgResponseTime": 285.5
      },
      "rateLimiting": {
        "totalViolations": 450,
        "uniqueKeysViolated": 25,
        "topViolators": [
          {
            "apiKeyId": "key-uuid-1",
            "violations": 45,
            "percentage": 10.0
          }
        ]
      },
      "errors": {
        "totalErrors": 15000,
        "errorRate": 1.2,
        "topErrorCodes": [
          {
            "code": 400,
            "count": 8500,
            "percentage": 56.7
          },
          {
            "code": 401,
            "count": 3500,
            "percentage": 23.3
          }
        ]
      }
    }
  }
}
```

#### Usage Case 2: Detailed System Analytics with 6-hour Time Range

**Scenario**: Admin retrieves detailed system analytics for the last 6 hours

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/api-keys/analytics/system?timeRange=6h&includeHealthMetrics=true&includeResourceUtilization=true&includeOperationalMetrics=true" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "timestamp": "2024-01-15T15:30:00.000Z",
    "timeRange": "6h",
    "systemOverview": {
      "totalApiKeys": 150,
      "activeApiKeys": 120,
      "inactiveApiKeys": 30,
      "systemHealth": "optimal",
      "healthScore": 95.2,
      "uptime": 99.98,
      "version": "2.1.0"
    },
    "healthMetrics": {
      "apiGateway": {
        "status": "healthy",
        "responseTime": 45.5,
        "errorRate": 0.1,
        "throughput": 1250.5,
        "trends": {
          "responseTime": "stable",
          "errorRate": "decreasing",
          "throughput": "increasing"
        }
      },
      "database": {
        "status": "healthy",
        "responseTime": 12.3,
        "connectionPool": {
          "active": 25,
          "idle": 75,
          "total": 100
        },
        "queryPerformance": {
          "avgExecutionTime": 15.2,
          "slowQueries": 2
        }
      },
      "cache": {
        "status": "healthy",
        "hitRate": 94.5,
        "memoryUsage": 65.2,
        "evictions": 1250
      },
      "rateLimiter": {
        "status": "healthy",
        "activeRules": 150,
        "violations": 450,
        "avgProcessingTime": 2.5
      }
    },
    "resourceUtilization": {
      "cpu": {
        "usage": 45.2,
        "cores": 8,
        "loadAverage": [1.2, 1.5, 1.8],
        "trends": {
          "usage": "stable",
          "loadAverage": "stable"
        }
      },
      "memory": {
        "used": 8.5,
        "total": 16.0,
        "usage": 53.1,
        "swap": {
          "used": 0.5,
          "total": 4.0,
          "usage": 12.5
        }
      },
      "disk": {
        "used": 125.5,
        "total": 500.0,
        "usage": 25.1,
        "iops": 1250
      },
      "network": {
        "incoming": 125.5,
        "outgoing": 85.2,
        "connections": 450
      }
    },
    "operationalMetrics": {
      "requests": {
        "total": 1250000,
        "successful": 1235000,
        "failed": 15000,
        "successRate": 98.8,
        "avgResponseTime": 285.5
      },
      "rateLimiting": {
        "totalViolations": 450,
        "uniqueKeysViolated": 25,
        "topViolators": [
          {
            "apiKeyId": "key-uuid-1",
            "violations": 45,
            "percentage": 10.0
          }
        ]
      },
      "errors": {
        "totalErrors": 15000,
        "errorRate": 1.2,
        "topErrorCodes": [
          {
            "code": 400,
            "count": 8500,
            "percentage": 56.7
          },
          {
            "code": 401,
            "count": 3500,
            "percentage": 23.3
          }
        ]
      }
    }
  }
}
```

#### Usage Case 3: Invalid Time Range

**Scenario**: Admin provides an invalid time range

**Error Response**:
```json
{
  "success": false,
  "message": "Invalid timeRange parameter. Must be one of: 1h, 6h, 24h, 7d"
}
```

**Response Fields**:
- `timestamp`: Current timestamp of the analytics data
- `timeRange`: Time range for the metrics
- `systemOverview`: High-level system overview
- `healthMetrics`: Detailed health metrics for system components
- `resourceUtilization`: System resource utilization data
- `operationalMetrics`: Operational metrics and performance data

---

## Admin API Key Usage Overview

### GET /api/admin/api-keys/usage/overview

**Description**: Get system-wide API key usage overview including total usage statistics, active keys, and usage distribution.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ❌ Cannot access admin analytics
- **ADMIN**: ✅ Can access usage overview
- **SUPER_ADMIN**: ✅ Can access usage overview

**Query Parameters:**
- `period` (string, optional): Time period for overview ('7', '30', '90', 'all') - default: '30'
  - **Validation**: Must be one of '7', '30', '90', 'all'
  - **Example**: `30`
- `includeInactive` (boolean, optional): Include inactive API keys in statistics - default: `false`
  - **Validation**: Must be true or false
  - **Example**: `true`
- `groupBy` (string, optional): Group usage by 'day', 'week', 'month', or 'user' - default: 'day'
  - **Validation**: Must be one of 'day', 'week', 'month', 'user'
  - **Example**: `user`
- `includeTopUsers` (boolean, optional): Include top users by usage - default: `true`
  - **Validation**: Must be true or false
  - **Example**: `true`
- `topUsersCount` (number, optional): Number of top users to include (default: 10, max: 50)
  - **Validation**: Must be between 1 and 50
  - **Example**: `20`

#### Usage Case 1: Basic Usage Overview

**Scenario**: Admin retrieves basic system-wide API key usage overview

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/api-keys/usage/overview?period=30" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "period": {
      "days": 30,
      "startDate": "2024-01-01T00:00:00Z",
      "endDate": "2024-01-31T00:00:00Z",
      "label": "Last 30 Days"
    },
    "summary": {
      "totalApiKeys": 150,
      "activeApiKeys": 120,
      "inactiveApiKeys": 30,
      "totalRequests": 1250000,
      "successfulRequests": 1235000,
      "failedRequests": 15000,
      "successRate": 98.8,
      "avgResponseTime": 285.5,
      "totalDataTransferred": 185.5,
      "rateLimitViolations": 450,
      "uniqueUsers": 85,
      "uniqueEndpoints": 45
    },
    "usageByPeriod": {
      "last24Hours": 41667,
      "last7Days": 291667,
      "last30Days": 1250000
    },
    "usageByDay": [
      {
        "date": "2024-01-15",
        "requests": 41667,
        "successfulRequests": 41167,
        "failedRequests": 500,
        "successRate": 98.8,
        "avgResponseTime": 285.5,
        "dataTransferred": 6.2,
        "activeApiKeys": 118,
        "rateLimitViolations": 15
      },
      {
        "date": "2024-01-14",
        "requests": 40833,
        "successfulRequests": 40333,
        "failedRequests": 500,
        "successRate": 98.8,
        "avgResponseTime": 282.3,
        "dataTransferred": 6.1,
        "activeApiKeys": 115,
        "rateLimitViolations": 12
      }
    ],
    "topUsers": [
      {
        "userId": "user-uuid-1",
        "userName": "John Doe",
        "userEmail": "john.doe@example.com",
        "apiKeys": 3,
        "requests": 154200,
        "percentage": 12.3,
        "successRate": 99.1,
        "avgResponseTime": 235.5
      },
      {
        "userId": "user-uuid-2",
        "userName": "Jane Smith",
        "userEmail": "jane.smith@example.com",
        "apiKeys": 2,
        "requests": 125000,
        "percentage": 10.0,
        "successRate": 98.5,
        "avgResponseTime": 265.8
      }
    ],
    "usageDistribution": {
      "byUserType": [
        {
          "type": "USER",
          "count": 70,
          "requests": 875000,
          "percentage": 70.0
        },
        {
          "type": "ADMIN",
          "count": 12,
          "requests": 250000,
          "percentage": 20.0
        },
        {
          "type": "SUPER_ADMIN",
          "count": 3,
          "requests": 125000,
          "percentage": 10.0
        }
      ],
      "byKeyStatus": [
        {
          "status": "active",
          "count": 120,
          "requests": 1250000,
          "percentage": 100.0
        },
        {
          "status": "inactive",
          "count": 30,
          "requests": 0,
          "percentage": 0.0
        }
      ]
    }
  }
}
```

#### Usage Case 2: Usage Overview with User Grouping

**Scenario**: Admin retrieves usage overview grouped by users with extended top users list

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/api-keys/usage/overview?period=90&groupBy=user&includeInactive=true&topUsersCount=20" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "period": {
      "days": 90,
      "startDate": "2023-12-01T00:00:00Z",
      "endDate": "2024-01-31T00:00:00Z",
      "label": "Last 90 Days"
    },
    "summary": {
      "totalApiKeys": 150,
      "activeApiKeys": 120,
      "inactiveApiKeys": 30,
      "totalRequests": 3750000,
      "successfulRequests": 3705000,
      "failedRequests": 45000,
      "successRate": 98.8,
      "avgResponseTime": 285.5,
      "totalDataTransferred": 556.5,
      "rateLimitViolations": 1350,
      "uniqueUsers": 85,
      "uniqueEndpoints": 45
    },
    "usageByPeriod": {
      "last24Hours": 41667,
      "last7Days": 291667,
      "last30Days": 1250000,
      "last90Days": 3750000
    },
    "userGroups": [
      {
        "userId": "user-uuid-1",
        "userName": "John Doe",
        "userEmail": "john.doe@example.com",
        "userRole": "USER",
        "apiKeys": [
          {
            "apiKeyId": "key-uuid-1",
            "apiKeyName": "Production API Key",
            "requests": 462600,
            "successRate": 99.1,
            "avgResponseTime": 235.5
          }
        ],
        "totalRequests": 462600,
        "percentage": 12.3,
        "successRate": 99.1,
        "avgResponseTime": 235.5,
        "dataTransferred": 69.4,
        "rateLimitViolations": 135
      }
    ],
    "topUsers": [
      {
        "userId": "user-uuid-1",
        "userName": "John Doe",
        "userEmail": "john.doe@example.com",
        "apiKeys": 3,
        "requests": 462600,
        "percentage": 12.3,
        "successRate": 99.1,
        "avgResponseTime": 235.5
      }
    ],
    "usageDistribution": {
      "byUserType": [
        {
          "type": "USER",
          "count": 70,
          "requests": 2625000,
          "percentage": 70.0
        },
        {
          "type": "ADMIN",
          "count": 12,
          "requests": 750000,
          "percentage": 20.0
        },
        {
          "type": "SUPER_ADMIN",
          "count": 3,
          "requests": 375000,
          "percentage": 10.0
        }
      ],
      "byKeyStatus": [
        {
          "status": "active",
          "count": 120,
          "requests": 3750000,
          "percentage": 100.0
        },
        {
          "status": "inactive",
          "count": 30,
          "requests": 0,
          "percentage": 0.0
        }
      ]
    }
  }
}
```

#### Usage Case 3: Insufficient Permissions

**Scenario**: User role attempts to access admin usage overview

**Error Response**:
```json
{
  "success": false,
  "message": "Access denied: ADMIN or SUPER_ADMIN role required"
}
```

**Response Fields**:
- `period`: Time period information for the overview
- `summary`: Overall usage summary
- `usageByPeriod`: Usage breakdown by time periods
- `usageByDay`/`userGroups`: Usage breakdown by time period or user
- `topUsers`: Top users by API key usage
- `usageDistribution`: Distribution of usage by different categories

---

## Admin API Key Usage Trends

### GET /api/admin/api-keys/usage/trends

**Description**: Get detailed usage trends for API keys including historical data, growth patterns, and predictive analytics.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ❌ Cannot access admin analytics
- **ADMIN**: ✅ Can access usage trends
- **SUPER_ADMIN**: ✅ Can access usage trends

**Query Parameters:**
- `period` (string, optional): Time period for trends ('7', '30', '90', 'all') - default: '30'
  - **Validation**: Must be one of '7', '30', '90', 'all'
  - **Example**: `90`
- `groupBy` (string, optional): Group trends by 'day', 'week', or 'month' - default: 'day'
  - **Validation**: Must be one of 'day', 'week', 'month'
  - **Example**: `week`
- `includePredictions` (boolean, optional): Include predictive analytics - default: `false`
  - **Validation**: Must be true or false
  - **Example**: `true`
- `predictionDays` (number, optional): Number of days to predict (default: 7, max: 30)
  - **Validation**: Must be between 1 and 30
  - **Example**: `14`
- `includeComparisons` (boolean, optional): Include period-over-period comparisons - default: `true`
  - **Validation**: Must be true or false
  - **Example**: `true`

#### Usage Case 1: Basic Usage Trends

**Scenario**: Admin retrieves basic usage trends for API keys

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/api-keys/usage/trends?period=30" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "period": {
      "days": 30,
      "startDate": "2024-01-01T00:00:00Z",
      "endDate": "2024-01-31T00:00:00Z",
      "label": "Last 30 Days"
    },
    "summary": {
      "totalRequests": 1250000,
      "avgDailyRequests": 41667,
      "peakDailyRequests": 55000,
      "minDailyRequests": 25000,
      "growthRate": 15.2,
      "trendDirection": "increasing",
      "volatility": 12.5
    },
    "dailyTrends": [
      {
        "date": "2024-01-15",
        "requests": 41667,
        "successfulRequests": 41167,
        "failedRequests": 500,
        "successRate": 98.8,
        "avgResponseTime": 285.5,
        "dataTransferred": 6.2,
        "activeApiKeys": 118,
        "rateLimitViolations": 15,
        "movingAvg7Days": 40833,
        "movingAvg30Days": 41667
      },
      {
        "date": "2024-01-14",
        "requests": 40833,
        "successfulRequests": 40333,
        "failedRequests": 500,
        "successRate": 98.8,
        "avgResponseTime": 282.3,
        "dataTransferred": 6.1,
        "activeApiKeys": 115,
        "rateLimitViolations": 12,
        "movingAvg7Days": 40500,
        "movingAvg30Days": 41500
      }
    ],
    "trendAnalysis": {
      "requests": {
        "direction": "increasing",
        "strength": "moderate",
        "slope": 125.5,
        "correlation": 0.75
      },
      "successRate": {
        "direction": "stable",
        "strength": "weak",
        "slope": -0.02,
        "correlation": -0.15
      },
      "responseTime": {
        "direction": "increasing",
        "strength": "weak",
        "slope": 2.5,
        "correlation": 0.35
      }
    },
    "comparisons": {
      "vsPreviousPeriod": {
        "requestsChange": 15.2,
        "successRateChange": -0.1,
        "responseTimeChange": 5.5,
        "dataTransferChange": 18.3
      },
      "vsSamePeriodLastYear": {
        "requestsChange": 45.8,
        "successRateChange": 1.2,
        "responseTimeChange": -8.5,
        "dataTransferChange": 52.3
      }
    }
  }
}
```

#### Usage Case 2: Usage Trends with Predictions and Weekly Grouping

**Scenario**: Admin retrieves usage trends with predictive analytics and weekly grouping

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/api-keys/usage/trends?period=90&groupBy=week&includePredictions=true&predictionDays=14" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "period": {
      "days": 90,
      "startDate": "2023-12-01T00:00:00Z",
      "endDate": "2024-01-31T00:00:00Z",
      "label": "Last 90 Days"
    },
    "summary": {
      "totalRequests": 3750000,
      "avgWeeklyRequests": 291667,
      "peakWeeklyRequests": 385000,
      "minWeeklyRequests": 225000,
      "growthRate": 15.2,
      "trendDirection": "increasing",
      "volatility": 12.5
    },
    "weeklyTrends": [
      {
        "week": "2024-W03",
        "startDate": "2024-01-15",
        "endDate": "2024-01-21",
        "requests": 291667,
        "successfulRequests": 288333,
        "failedRequests": 3334,
        "successRate": 98.8,
        "avgResponseTime": 285.5,
        "dataTransferred": 43.8,
        "activeApiKeys": 118,
        "rateLimitViolations": 105,
        "movingAvg4Weeks": 285000,
        "movingAvg12Weeks": 291667
      }
    ],
    "trendAnalysis": {
      "requests": {
        "direction": "increasing",
        "strength": "moderate",
        "slope": 877.5,
        "correlation": 0.75
      },
      "successRate": {
        "direction": "stable",
        "strength": "weak",
        "slope": -0.02,
        "correlation": -0.15
      },
      "responseTime": {
        "direction": "increasing",
        "strength": "weak",
        "slope": 17.5,
        "correlation": 0.35
      }
    },
    "predictions": {
      "model": "linear_regression",
      "confidence": 0.85,
      "predictionPeriod": 14,
      "predictedTrends": [
        {
          "date": "2024-02-01",
          "predictedRequests": 42500,
          "confidenceInterval": {
            "lower": 38000,
            "upper": 47000
          },
          "predictedSuccessRate": 98.7,
          "predictedResponseTime": 290.5
        },
        {
          "date": "2024-02-02",
          "predictedRequests": 42625,
          "confidenceInterval": {
            "lower": 38125,
            "upper": 47125
          },
          "predictedSuccessRate": 98.7,
          "predictedResponseTime": 291.0
        }
      ],
      "summary": {
        "predictedTotalRequests": 595000,
        "predictedAvgSuccessRate": 98.7,
        "predictedAvgResponseTime": 295.5,
        "predictedGrowthRate": 2.1
      }
    },
    "comparisons": {
      "vsPreviousPeriod": {
        "requestsChange": 15.2,
        "successRateChange": -0.1,
        "responseTimeChange": 5.5,
        "dataTransferChange": 18.3
      },
      "vsSamePeriodLastYear": {
        "requestsChange": 45.8,
        "successRateChange": 1.2,
        "responseTimeChange": -8.5,
        "dataTransferChange": 52.3
      }
    }
  }
}
```

#### Usage Case 3: Invalid Prediction Days

**Scenario**: Admin provides an invalid prediction days value

**Error Response**:
```json
{
  "success": false,
  "message": "Invalid predictionDays parameter. Must be between 1 and 30"
}
```

**Response Fields**:
- `period`: Time period information for the trends
- `summary`: Overall trend summary
- `dailyTrends`/`weeklyTrends`: Trend data grouped by time period
- `trendAnalysis`: Analysis of trend directions and strengths
- `predictions` (optional): Predictive analytics when `includePredictions=true`
- `comparisons`: Period-over-period comparisons

---

## Admin API Key User Usage

### GET /api/admin/api-keys/usage/users/[userId]

**Description**: Get detailed API key usage information for a specific user including all their API keys, usage patterns, and performance metrics.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ❌ Cannot access admin analytics
- **ADMIN**: ✅ Can access usage for users in their organization
- **SUPER_ADMIN**: ✅ Can access usage for any user

**Path Parameters:**
- `userId` (string, required): The unique identifier of the user
  - **Validation**: Must be a valid UUID
  - **Example**: `user-uuid-67890`

**Query Parameters:**
- `period` (string, optional): Time period for usage data ('7', '30', '90', 'all') - default: '30'
  - **Validation**: Must be one of '7', '30', '90', 'all'
  - **Example**: `30`
- `includeInactiveKeys` (boolean, optional): Include inactive API keys - default: `false`
  - **Validation**: Must be true or false
  - **Example**: `true`
- `includeDetailedStats` (boolean, optional): Include detailed statistics for each API key - default: `false`
  - **Validation**: Must be true or false
  - **Example**: `true`
- `groupBy` (string, optional): Group usage by 'day', 'week', 'month', or 'apiKey' - default: 'day'
  - **Validation**: Must be one of 'day', 'week', 'month', 'apiKey'
  - **Example**: `apiKey`

#### Usage Case 1: Basic User Usage Information

**Scenario**: Admin retrieves basic API key usage information for a specific user

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/api-keys/usage/users/{{USER_ID}}?period=30" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "userId": "user-uuid-67890",
    "userName": "John Doe",
    "userEmail": "john.doe@example.com",
    "userRole": "USER",
    "period": {
      "days": 30,
      "startDate": "2024-01-01T00:00:00Z",
      "endDate": "2024-01-31T00:00:00Z",
      "label": "Last 30 Days"
    },
    "summary": {
      "totalApiKeys": 3,
      "activeApiKeys": 2,
      "inactiveApiKeys": 1,
      "totalRequests": 154200,
      "successfulRequests": 152800,
      "failedRequests": 1400,
      "successRate": 99.1,
      "avgResponseTime": 235.5,
      "totalDataTransferred": 23.1,
      "rateLimitViolations": 45,
      "uniqueEndpoints": 12,
      "lastUsed": "2024-01-15T14:30:00.000Z"
    },
    "apiKeys": [
      {
        "apiKeyId": "key-uuid-1",
        "apiKeyName": "Production API Key",
        "enabled": true,
        "createdAt": "2024-01-01T12:00:00.000Z",
        "lastUsed": "2024-01-15T14:30:00.000Z",
        "requests": 15420,
        "successfulRequests": 15280,
        "failedRequests": 140,
        "successRate": 99.1,
        "avgResponseTime": 235.5,
        "dataTransferred": 2.3,
        "rateLimitHits": 8,
        "uniqueEndpoints": 8
      },
      {
        "apiKeyId": "key-uuid-2",
        "apiKeyName": "Development API Key",
        "enabled": true,
        "createdAt": "2024-01-05T09:00:00.000Z",
        "lastUsed": "2024-01-15T12:15:00.000Z",
        "requests": 8960,
        "successfulRequests": 8850,
        "failedRequests": 110,
        "successRate": 98.8,
        "avgResponseTime": 265.8,
        "dataTransferred": 1.3,
        "rateLimitHits": 12,
        "uniqueEndpoints": 6
      }
    ],
    "usageByDay": [
      {
        "date": "2024-01-15",
        "requests": 5140,
        "successfulRequests": 5090,
        "failedRequests": 50,
        "successRate": 99.0,
        "avgResponseTime": 238.7,
        "dataTransferred": 0.77,
        "activeApiKeys": 2,
        "rateLimitViolations": 3
      }
    ],
    "topEndpoints": [
      {
        "endpoint": "/api/vpn/status",
        "count": 62000,
        "percentage": 40.2,
        "avgResponseTime": 180.5,
        "successRate": 99.8
      },
      {
        "endpoint": "/api/opnsense/aliases",
        "count": 31000,
        "percentage": 20.1,
        "avgResponseTime": 320.8,
        "successRate": 98.9
      }
    ]
  }
}
```

#### Usage Case 2: Detailed User Usage with API Key Grouping

**Scenario**: Admin retrieves detailed user usage information grouped by API key

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/api-keys/usage/users/{{USER_ID}}?period=90&includeInactiveKeys=true&includeDetailedStats=true&groupBy=apiKey" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "userId": "user-uuid-67890",
    "userName": "John Doe",
    "userEmail": "john.doe@example.com",
    "userRole": "USER",
    "period": {
      "days": 90,
      "startDate": "2023-12-01T00:00:00Z",
      "endDate": "2024-01-31T00:00:00Z",
      "label": "Last 90 Days"
    },
    "summary": {
      "totalApiKeys": 3,
      "activeApiKeys": 2,
      "inactiveApiKeys": 1,
      "totalRequests": 462600,
      "successfulRequests": 458400,
      "failedRequests": 4200,
      "successRate": 99.1,
      "avgResponseTime": 235.5,
      "totalDataTransferred": 69.4,
      "rateLimitViolations": 135,
      "uniqueEndpoints": 12,
      "lastUsed": "2024-01-15T14:30:00.000Z"
    },
    "apiKeyGroups": [
      {
        "apiKeyId": "key-uuid-1",
        "apiKeyName": "Production API Key",
        "enabled": true,
        "createdAt": "2024-01-01T12:00:00.000Z",
        "lastUsed": "2024-01-15T14:30:00.000Z",
        "summary": {
          "requests": 46260,
          "successfulRequests": 45840,
          "failedRequests": 420,
          "successRate": 99.1,
          "avgResponseTime": 235.5,
          "dataTransferred": 6.9,
          "rateLimitHits": 24,
          "uniqueEndpoints": 8
        },
        "detailedStats": {
          "requestMethods": {
            "GET": 37208,
            "POST": 6300,
            "PUT": 1950,
            "DELETE": 810
          },
          "responseCodes": {
            "200": 45840,
            "400": 255,
            "401": 75,
            "403": 45,
            "404": 30,
            "429": 15
          },
          "performance": {
            "p50": 180.5,
            "p90": 450.2,
            "p95": 680.8,
            "p99": 950.5
          }
        },
        "topEndpoints": [
          {
            "endpoint": "/api/vpn/status",
            "count": 18600,
            "percentage": 40.2,
            "avgResponseTime": 180.5,
            "successRate": 99.8
          }
        ],
        "dailyUsage": [
          {
            "date": "2024-01-15",
            "requests": 1542,
            "successfulRequests": 1527,
            "failedRequests": 15,
            "successRate": 99.0,
            "avgResponseTime": 238.7,
            "dataTransferred": 0.23,
            "rateLimitHits": 3
          }
        ]
      }
    ],
    "usageByDay": [
      {
        "date": "2024-01-15",
        "requests": 5140,
        "successfulRequests": 5090,
        "failedRequests": 50,
        "successRate": 99.0,
        "avgResponseTime": 238.7,
        "dataTransferred": 0.77,
        "activeApiKeys": 2,
        "rateLimitViolations": 3
      }
    ],
    "topEndpoints": [
      {
        "endpoint": "/api/vpn/status",
        "count": 186000,
        "percentage": 40.2,
        "avgResponseTime": 180.5,
        "successRate": 99.8
      }
    ]
  }
}
```

#### Usage Case 3: User Not Found

**Scenario**: Admin provides a non-existent user ID

**Error Response**:
```json
{
  "success": false,
  "message": "User not found"
}
```

#### Usage Case 4: Insufficient Permissions

**Scenario**: Admin role attempts to access user outside their organization

**Error Response**:
```json
{
  "success": false,
  "message": "Access denied: Cannot access usage data for this user"
}
```

**Response Fields**:
- `userId`: The unique identifier of the user
- `userName`: The display name of the user
- `userEmail`: The email address of the user
- `userRole`: The role of the user
- `period`: Time period information for the usage data
- `summary`: Overall usage summary for the user
- `apiKeys`: List of API keys belonging to the user
- `apiKeyGroups` (optional): API key grouped data when `groupBy=apiKey`
- `usageByDay`: Daily usage breakdown
- `topEndpoints`: Most frequently accessed endpoints

---

## Security Considerations

### Data Privacy
- All account-level analytics endpoints only return data for the authenticated user
- Admin endpoints require appropriate role-based access control
- API key values are never exposed in analytics responses
- Sensitive information like IP addresses is only shown to authorized users

### Access Control
- All endpoints require valid authentication (session or API key)
- Role-based access control ensures users can only access appropriate data
- Admin endpoints have additional authorization checks
- Cross-user data access is strictly prohibited for user roles

### Audit Logging
- All analytics endpoint access is logged
- Data access patterns are monitored for unusual activity
- Rate limit violations are tracked and may trigger security alerts
- Failed authentication attempts are logged and monitored

### Data Retention
- Raw API key usage events are retained for 90 days by default
- Aggregated analytics data is retained for longer periods
- Historical trend data follows configurable retention policies
- Admin analytics data may have different retention requirements

---

## Error Responses

### 400 Bad Request

**Invalid API Key ID**:
```json
{
  "success": false,
  "message": "Invalid API key ID format"
}
```

**Invalid Period Parameter**:
```json
{
  "success": false,
  "message": "Invalid period parameter. Must be one of: 7, 30, 90, all"
}
```

**Invalid Date Range**:
```json
{
  "success": false,
  "message": "Invalid date range. Start date must be before end date and within the last 90 days"
}
```

**Invalid Limit Parameter**:
```json
{
  "success": false,
  "message": "Invalid limit parameter. Must be between 1 and 1000"
}
```

### 401 Unauthorized

**Authentication Required**:
```json
{
  "success": false,
  "message": "Authentication required"
}
```

**Invalid API Key**:
```json
{
  "success": false,
  "message": "Invalid or expired API key"
}
```

### 403 Forbidden

**Access Denied (User Role)**:
```json
{
  "success": false,
  "message": "Access denied: Cannot access analytics for this API key"
}
```

**Insufficient Permissions (Admin Endpoints)**:
```json
{
  "success": false,
  "message": "Access denied: ADMIN or SUPER_ADMIN role required"
}
```

**Cross-User Access Denied**:
```json
{
  "success": false,
  "message": "Access denied: Cannot access usage data for this user"
}
```

### 404 Not Found

**API Key Not Found**:
```json
{
  "success": false,
  "message": "API key not found or access denied"
}
```

**User Not Found**:
```json
{
  "success": false,
  "message": "User not found"
}
```

### 429 Rate Limited

**Rate Limit Exceeded**:
```json
{
  "error": "Rate limit exceeded",
  "rateLimitInfo": {
    "limit": 150,
    "remaining": 0,
    "resetTime": 1640995200,
    "windowType": "hourly",
    "retryAfter": 3600
  }
}
```

### 500 Internal Server Error

**Database Error**:
```json
{
  "success": false,
  "message": "Failed to retrieve analytics data"
}
```

**Analytics Service Unavailable**:
```json
{
  "success": false,
  "message": "Analytics service temporarily unavailable"
}
```

---

## Usage Notes

### Performance Considerations
- Use appropriate time ranges to limit data volume
- Enable detailed statistics only when needed
- Consider using pagination for large datasets
- Cache non-sensitive analytics data where appropriate

### Data Freshness
- API key analytics are updated in near real-time
- Usage statistics may have a 1-2 minute delay
- Admin analytics may have additional processing delays
- Predictive analytics are updated periodically

### Best Practices
1. **Time Range Selection**: Use shorter time ranges for real-time monitoring
2. **Pagination**: Implement proper pagination for large datasets
3. **Caching**: Cache summary data for dashboard displays
4. **Error Handling**: Implement proper error handling for rate limits
5. **Security**: Protect analytics endpoints with appropriate authentication

### Integration Examples

**JavaScript Client Example**:
```javascript
class ApiKeyAnalytics {
  constructor(apiKey, baseUrl) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async getApiKeyAnalytics(apiKeyId, options = {}) {
    const {
      period = '30',
      includeDetailedStats = false,
      groupBy = 'day',
      includeErrors = false
    } = options;

    const params = new URLSearchParams({
      period,
      includeDetailedStats: includeDetailedStats.toString(),
      groupBy,
      includeErrors: includeErrors.toString()
    });

    const response = await fetch(
      `${this.baseUrl}/api/account/api-keys/${apiKeyId}/analytics?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Analytics request failed: ${response.statusText}`);
    }

    return await response.json();
  }

  async getApiKeyUsage(apiKeyId, options = {}) {
    const {
      startDate,
      endDate,
      limit = 100,
      offset = 0,
      groupBy = 'day',
      includeRateLimitInfo = false
    } = options;

    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
      groupBy,
      includeRateLimitInfo: includeRateLimitInfo.toString()
    });

    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const response = await fetch(
      `${this.baseUrl}/api/account/api-keys/${apiKeyId}/usage?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return await response.json();
  }

  async getAdminPerformanceAnalytics(options = {}) {
    const {
      period = '30',
      includeTopKeys = true,
      topKeysCount = 10,
      includeTrends = false,
      groupBy = 'day'
    } = options;

    const params = new URLSearchParams({
      period,
      includeTopKeys: includeTopKeys.toString(),
      topKeysCount: topKeysCount.toString(),
      includeTrends: includeTrends.toString(),
      groupBy
    });

    const response = await fetch(
      `${this.baseUrl}/api/admin/api-keys/analytics/performance?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return await response.json();
  }

  async getAdminSystemAnalytics(options = {}) {
    const {
      includeHealthMetrics = true,
      includeResourceUtilization = true,
      includeOperationalMetrics = true,
      timeRange = '24h'
    } = options;

    const params = new URLSearchParams({
      includeHealthMetrics: includeHealthMetrics.toString(),
      includeResourceUtilization: includeResourceUtilization.toString(),
      includeOperationalMetrics: includeOperationalMetrics.toString(),
      timeRange
    });

    const response = await fetch(
      `${this.baseUrl}/api/admin/api-keys/analytics/system?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return await response.json();
  }

  async getAdminUsageOverview(options = {}) {
    const {
      period = '30',
      includeInactive = false,
      groupBy = 'day',
      includeTopUsers = true,
      topUsersCount = 10
    } = options;

    const params = new URLSearchParams({
      period,
      includeInactive: includeInactive.toString(),
      groupBy,
      includeTopUsers: includeTopUsers.toString(),
      topUsersCount: topUsersCount.toString()
    });

    const response = await fetch(
      `${this.baseUrl}/api/admin/api-keys/usage/overview?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return await response.json();
  }

  async getAdminUsageTrends(options = {}) {
    const {
      period = '30',
      groupBy = 'day',
      includePredictions = false,
      predictionDays = 7,
      includeComparisons = true
    } = options;

    const params = new URLSearchParams({
      period,
      groupBy,
      includePredictions: includePredictions.toString(),
      predictionDays: predictionDays.toString(),
      includeComparisons: includeComparisons.toString()
    });

    const response = await fetch(
      `${this.baseUrl}/api/admin/api-keys/usage/trends?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return await response.json();
  }

  async getAdminUserUsage(userId, options = {}) {
    const {
      period = '30',
      includeInactiveKeys = false,
      includeDetailedStats = false,
      groupBy = 'day'
    } = options;

    const params = new URLSearchParams({
      period,
      includeInactiveKeys: includeInactiveKeys.toString(),
      includeDetailedStats: includeDetailedStats.toString(),
      groupBy
    });

    const response = await fetch(
      `${this.baseUrl}/api/admin/api-keys/usage/users/${userId}?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return await response.json();
  }
}

// Usage example
const analytics = new ApiKeyAnalytics('your-api-key', 'https://instrada-ogm.example.com');

// Get API key analytics
const apiKeyAnalytics = await analytics.getApiKeyAnalytics('key-uuid-12345', {
  period: '30',
  includeDetailedStats: true,
  includeErrors: true
});
console.log('API Key Analytics:', apiKeyAnalytics);

// Get admin performance analytics
const performanceAnalytics = await analytics.getAdminPerformanceAnalytics({
  period: '90',
  includeTrends: true,
  groupBy: 'week'
});
console.log('Performance Analytics:', performanceAnalytics);
```

**Python Client Example**:
```python
import requests
from typing import Optional, Dict, Any
from urllib.parse import urlencode

class ApiKeyAnalytics:
    def __init__(self, api_key: str, base_url: str):
        self.api_key = api_key
        self.base_url = base_url
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }

    def get_api_key_analytics(self, api_key_id: str, period: str = '30',
                           include_detailed_stats: bool = False,
                           group_by: str = 'day',
                           include_errors: bool = False) -> Dict[str, Any]:
        params = {
            'period': period,
            'includeDetailedStats': str(include_detailed_stats).lower(),
            'groupBy': group_by,
            'includeErrors': str(include_errors).lower()
        }
        
        response = requests.get(
            f'{self.base_url}/api/account/api-keys/{api_key_id}/analytics',
            headers=self.headers,
            params=params
        )
        
        response.raise_for_status()
        return response.json()

    def get_api_key_usage(self, api_key_id: str, start_date: Optional[str] = None,
                         end_date: Optional[str] = None, limit: int = 100,
                         offset: int = 0, group_by: str = 'day',
                         include_rate_limit_info: bool = False) -> Dict[str, Any]:
        params = {
            'limit': limit,
            'offset': offset,
            'groupBy': group_by,
            'includeRateLimitInfo': str(include_rate_limit_info).lower()
        }
        
        if start_date:
            params['startDate'] = start_date
        if end_date:
            params['endDate'] = end_date
        
        response = requests.get(
            f'{self.base_url}/api/account/api-keys/{api_key_id}/usage',
            headers=self.headers,
            params=params
        )
        
        response.raise_for_status()
        return response.json()

    def get_admin_performance_analytics(self, period: str = '30',
                                     include_top_keys: bool = True,
                                     top_keys_count: int = 10,
                                     include_trends: bool = False,
                                     group_by: str = 'day') -> Dict[str, Any]:
        params = {
            'period': period,
            'includeTopKeys': str(include_top_keys).lower(),
            'topKeysCount': str(top_keys_count),
            'includeTrends': str(include_trends).lower(),
            'groupBy': group_by
        }
        
        response = requests.get(
            f'{self.base_url}/api/admin/api-keys/analytics/performance',
            headers=self.headers,
            params=params
        )
        
        response.raise_for_status()
        return response.json()

    def get_admin_system_analytics(self, include_health_metrics: bool = True,
                                 include_resource_utilization: bool = True,
                                 include_operational_metrics: bool = True,
                                 time_range: str = '24h') -> Dict[str, Any]:
        params = {
            'includeHealthMetrics': str(include_health_metrics).lower(),
            'includeResourceUtilization': str(include_resource_utilization).lower(),
            'includeOperationalMetrics': str(include_operational_metrics).lower(),
            'timeRange': time_range
        }
        
        response = requests.get(
            f'{self.base_url}/api/admin/api-keys/analytics/system',
            headers=self.headers,
            params=params
        )
        
        response.raise_for_status()
        return response.json()

    def get_admin_usage_overview(self, period: str = '30',
                               include_inactive: bool = False,
                               group_by: str = 'day',
                               include_top_users: bool = True,
                               top_users_count: int = 10) -> Dict[str, Any]:
        params = {
            'period': period,
            'includeInactive': str(include_inactive).lower(),
            'groupBy': group_by,
            'includeTopUsers': str(include_top_users).lower(),
            'topUsersCount': str(top_users_count)
        }
        
        response = requests.get(
            f'{self.base_url}/api/admin/api-keys/usage/overview',
            headers=self.headers,
            params=params
        )
        
        response.raise_for_status()
        return response.json()

    def get_admin_usage_trends(self, period: str = '30',
                             group_by: str = 'day',
                             include_predictions: bool = False,
                             prediction_days: int = 7,
                             include_comparisons: bool = True) -> Dict[str, Any]:
        params = {
            'period': period,
            'groupBy': group_by,
            'includePredictions': str(include_predictions).lower(),
            'predictionDays': str(prediction_days),
            'includeComparisons': str(include_comparisons).lower()
        }
        
        response = requests.get(
            f'{self.base_url}/api/admin/api-keys/usage/trends',
            headers=self.headers,
            params=params
        )
        
        response.raise_for_status()
        return response.json()

    def get_admin_user_usage(self, user_id: str, period: str = '30',
                            include_inactive_keys: bool = False,
                            include_detailed_stats: bool = False,
                            group_by: str = 'day') -> Dict[str, Any]:
        params = {
            'period': period,
            'includeInactiveKeys': str(include_inactive_keys).lower(),
            'includeDetailedStats': str(include_detailed_stats).lower(),
            'groupBy': group_by
        }
        
        response = requests.get(
            f'{self.base_url}/api/admin/api-keys/usage/users/{user_id}',
            headers=self.headers,
            params=params
        )
        
        response.raise_for_status()
        return response.json()

# Usage example
analytics = ApiKeyAnalytics('your-api-key', 'https://instrada-ogm.example.com')

# Get API key analytics
api_key_analytics = analytics.get_api_key_analytics(
    'key-uuid-12345',
    period='30',
    include_detailed_stats=True,
    include_errors=True
)
print('API Key Analytics:', api_key_analytics)

# Get admin performance analytics
performance_analytics = analytics.get_admin_performance_analytics(
    period='90',
    include_trends=True,
    group_by='week'
)
print('Performance Analytics:', performance_analytics)

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