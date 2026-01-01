# System Services Endpoints

[⬆️ Back to API Index](API_Index.md) | [📚 Back to Documentation Home](../../DOCUMENTATION_INDEX.md)

## Variables

Replace the following variables in the examples below:

- `{{SERVER_URL}}` - Your server URL (e.g., `https://instrada-ogm.example.com`)
- `{{API_KEY}}` - Your API key for authentication
- `{{USER_ID}}` - The ID of the user (UUID format)

**Example:**
```bash
# Set variables
SERVER_URL="https://instrada-ogm.example.com"
API_KEY="your-api-key-here"
USER_ID="user-uuid-123"

# Use in curl commands
curl -X GET "${SERVER_URL}/api/admin/services/usage-aggregation" \
  -H "Authorization: Bearer ${API_KEY}"
```

This section covers all system services-related API endpoints for managing usage aggregation, provider display names, 2FA management, health checks, system initialization, and session tracking.

## Usage Aggregation

### GET /api/admin/services/usage-aggregation

**Description**: Retrieve aggregated usage statistics for system services. This endpoint provides comprehensive usage data across different services and time periods for administrative monitoring and reporting.

**Authentication**: Required (session or API key with ADMIN or SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ✅ Can access usage aggregation data
- **SUPER_ADMIN**: ✅ Can access usage aggregation data

#### Usage Case 1: Successful Usage Aggregation Retrieval

**Scenario**: Admin retrieves system-wide usage statistics

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/services/usage-aggregation" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "period": "last-30-days",
  "generatedAt": "2024-01-01T12:00:00Z",
  "services": {
    "authentication": {
      "totalRequests": 15420,
      "uniqueUsers": 1250,
      "successRate": 99.2,
      "averageResponseTime": 145,
      "dailyBreakdown": [
        {
          "date": "2023-12-01",
          "requests": 512,
          "uniqueUsers": 45,
          "successRate": 99.0
        }
      ]
    },
    "apiAccess": {
      "totalRequests": 45320,
      "uniqueApiKeys": 85,
      "successRate": 98.7,
      "averageResponseTime": 89,
      "topEndpoints": [
        {
          "endpoint": "/api/user/profile",
          "requests": 5420,
          "percentage": 12.0
        }
      ]
    },
    "vpnAccess": {
      "totalConnections": 3250,
      "uniqueUsers": 180,
      "averageSessionDuration": 3600,
      "dataTransferred": {
        "upload": 1258291200,
        "download": 5242880000
      }
    }
  },
  "systemMetrics": {
    "totalActiveUsers": 1250,
    "totalApiKeys": 85,
    "peakConcurrentUsers": 320,
    "systemUptime": 2592000
  }
}
```

#### Usage Case 2: Usage Aggregation with Custom Time Range

**Scenario**: Admin retrieves usage statistics for specific time period

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/services/usage-aggregation?startDate=2023-12-01&endDate=2023-12-31&groupBy=week" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "period": "custom",
  "startDate": "2023-12-01",
  "endDate": "2023-12-31",
  "groupBy": "week",
  "generatedAt": "2024-01-01T12:00:00Z",
  "services": {
    "authentication": {
      "totalRequests": 15420,
      "uniqueUsers": 1250,
      "successRate": 99.2,
      "weeklyBreakdown": [
        {
          "week": "2023-W48",
          "requests": 3580,
          "uniqueUsers": 290,
          "successRate": 99.1
        }
      ]
    }
  }
}
```

#### Usage Case 3: Unauthorized Access (USER)

**Scenario**: USER role attempts to access usage aggregation

**Error Response**:
```json
{
  "error": "Forbidden: Admin privileges required to access usage aggregation"
}
```

**Query Parameters**:
- `startDate` (string, optional): Start date for custom range (ISO 8601 format)
- `endDate` (string, optional): End date for custom range (ISO 8601 format)
- `groupBy` (string, optional): Grouping level (day, week, month)
- `services` (string, optional): Comma-separated list of services to include
- `format` (string, optional): Response format (json, csv)

**Response Fields**:
- `period`: Time period covered by the data
- `generatedAt`: When the report was generated
- `services`: Object containing usage data for each service
- `systemMetrics`: Overall system performance metrics

### POST /api/admin/services/usage-aggregation

**Description**: Trigger manual aggregation of usage statistics. This endpoint forces the system to process and aggregate recent usage data, which is typically done automatically on a schedule.

**Authentication**: Required (session or API key with ADMIN or SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ✅ Can trigger usage aggregation
- **SUPER_ADMIN**: ✅ Can trigger usage aggregation

#### Usage Case 1: Successful Manual Aggregation

**Scenario**: Admin triggers manual usage aggregation

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/admin/services/usage-aggregation" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "force": true,
    "timeRange": "last-24-hours",
    "services": ["authentication", "apiAccess"]
  }'
```

**Success Response**:
```json
{
  "message": "Usage aggregation started successfully",
  "jobId": "agg-job-uuid-123",
  "estimatedDuration": 300,
  "status": "processing"
}
```

#### Usage Case 2: Check Aggregation Status

**Scenario**: Admin checks status of running aggregation job

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/services/usage-aggregation/status/agg-job-uuid-123" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "jobId": "agg-job-uuid-123",
  "status": "completed",
  "progress": 100,
  "startedAt": "2024-01-01T12:00:00Z",
  "completedAt": "2024-01-01T12:05:00Z",
  "recordsProcessed": 15420,
  "result": {
    "totalRecords": 15420,
    "servicesProcessed": ["authentication", "apiAccess"],
    "timeRange": "last-24-hours"
  }
}
```

**Request Fields**:
- `force` (boolean, optional): Force aggregation even if recently run
- `timeRange` (string, optional): Time range to aggregate (last-24-hours, last-7-days, custom)
- `services` (array, optional): Specific services to aggregate
- `startDate` (string, optional): Custom start date (ISO 8601 format)
- `endDate` (string, optional): Custom end date (ISO 8601 format)

**Response Fields**:
- `message`: Status message
- `jobId`: Unique identifier for the aggregation job
- `estimatedDuration`: Estimated processing time in seconds
- `status`: Current status of the aggregation job

## Provider Display Names

### GET /api/admin/provider-display-names

**Description**: Retrieve configured display names for authentication providers and external services. This endpoint allows administrators to view and manage how providers are displayed to users.

**Authentication**: Required (session or API key with ADMIN or SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ✅ Can access provider display names
- **SUPER_ADMIN**: ✅ Can access provider display names

#### Usage Case 1: Successful Provider Display Names Retrieval

**Scenario**: Admin retrieves current provider display configuration

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/provider-display-names" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "providers": {
    "credentials": {
      "id": "credentials",
      "displayName": "Email and Password",
      "description": "Login with your email address and password",
      "icon": "email",
      "enabled": true,
      "order": 1
    },
    "authentik": {
      "id": "authentik",
      "displayName": "Company SSO",
      "description": "Single sign-on with your company account",
      "icon": "sso",
      "enabled": true,
      "order": 2
    },
    "google": {
      "id": "google",
      "displayName": "Google",
      "description": "Sign in with your Google account",
      "icon": "google",
      "enabled": false,
      "order": 3
    }
  },
  "uiConfiguration": {
    "showProviderDescriptions": true,
    "showProviderIcons": true,
    "layout": "grid",
    "customCSS": ".provider-button { border-radius: 8px; }"
  },
  "lastModified": "2024-01-01T12:00:00Z",
  "modifiedBy": "admin-uuid-123"
}
```

#### Usage Case 2: Unauthorized Access (USER)

**Scenario**: USER role attempts to access provider configuration

**Error Response**:
```json
{
  "error": "Forbidden: Admin privileges required to access provider display names"
}
```

**Response Fields**:
- `providers`: Object containing display configuration for each provider
- `uiConfiguration`: UI settings for provider display
- `lastModified`: When the configuration was last updated
- `modifiedBy`: Who last modified the configuration

## 2FA Management

### GET /api/admin/users/[id]/disable-2fa

**Description**: Disable Two-Factor Authentication for a specific user. This endpoint allows administrators to disable 2FA for users who have lost access to their 2FA devices or need assistance with account recovery.

**Authentication**: Required (session or API key with ADMIN or SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ✅ Can disable 2FA for users
- **SUPER_ADMIN**: ✅ Can disable 2FA for users

#### Usage Case 1: Successful 2FA Disable

**Scenario**: Admin disables 2FA for a user who lost their device

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/users/{{USER_ID}}/disable-2fa" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "message": "2FA has been disabled successfully",
  "userId": "{{USER_ID}}",
  "disabledAt": "2024-01-01T12:00:00Z",
  "disabledBy": "admin-uuid-456",
  "previous2FAStatus": {
    "wasEnabled": true,
    "hadBackupCodes": true,
    "lastUsed": "2024-01-01T10:30:00Z"
  }
}
```

#### Usage Case 2: User Not Found

**Scenario**: Admin attempts to disable 2FA for non-existent user

**Error Response**:
```json
{
  "error": "User not found",
  "userId": "{{USER_ID}}"
}
```

#### Usage Case 3: 2FA Already Disabled

**Scenario**: Admin attempts to disable 2FA for user who doesn't have it enabled

**Success Response**:
```json
{
  "message": "2FA is already disabled for this user",
  "userId": "{{USER_ID}}",
  "status": "already_disabled"
}
```

#### Usage Case 4: Unauthorized Access (USER)

**Scenario**: USER role attempts to disable 2FA for another user

**Error Response**:
```json
{
  "error": "Forbidden: Admin privileges required to disable 2FA for other users"
}
```

**Path Parameters**:
- `id` (string, required): User ID (UUID format)

**Response Fields**:
- `message`: Status message
- `userId`: ID of the user whose 2FA was disabled
- `disabledAt`: When 2FA was disabled
- `disabledBy`: ID of the admin who disabled 2FA
- `previous2FAStatus`: Information about the user's 2FA status before disabling

## Health Check

### GET /api/health

**Description**: Retrieve system health status and performance metrics. This endpoint provides information about the overall health of the system, including database connectivity, service status, and performance indicators.

**Authentication**: Not required (public endpoint)

**Role Access:**
- **Unauthenticated**: ✅ Can access health information

#### Usage Case 1: Successful Health Check

**Scenario**: System monitoring service checks application health

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/health" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "uptime": 2592000,
  "version": "1.2.3",
  "environment": "production",
  "services": {
    "database": {
      "status": "healthy",
      "responseTime": 5,
      "connectionPool": {
        "active": 8,
        "idle": 12,
        "total": 20
      }
    },
    "redis": {
      "status": "healthy",
      "responseTime": 2,
      "memory": {
        "used": "125MB",
        "available": "1.8GB"
      }
    },
    "externalAPIs": {
      "opnsense": {
        "status": "healthy",
        "responseTime": 150,
        "lastCheck": "2024-01-01T11:59:00Z"
      }
    }
  },
  "metrics": {
    "requestsPerMinute": 45,
    "averageResponseTime": 120,
    "errorRate": 0.2,
    "activeUsers": 125,
    "memoryUsage": {
      "used": "512MB",
      "total": "2GB",
      "percentage": 25
    },
    "cpuUsage": {
      "current": 15.5,
      "average1min": 12.3,
      "average5min": 10.8
    }
  },
  "lastRestart": "2023-12-01T00:00:00Z"
}
```

#### Usage Case 2: Degraded Health Status

**Scenario**: System experiencing performance issues

**Success Response**:
```json
{
  "status": "degraded",
  "timestamp": "2024-01-01T12:00:00Z",
  "uptime": 2592000,
  "version": "1.2.3",
  "environment": "production",
  "issues": [
    {
      "service": "database",
      "severity": "warning",
      "message": "High connection pool usage",
      "details": "18/20 connections in use"
    }
  ],
  "services": {
    "database": {
      "status": "degraded",
      "responseTime": 25,
      "connectionPool": {
        "active": 18,
        "idle": 2,
        "total": 20
      }
    }
  }
}
```

#### Usage Case 3: Unhealthy System Status

**Scenario**: Critical system failure

**Success Response**:
```json
{
  "status": "unhealthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "uptime": 2592000,
  "version": "1.2.3",
  "environment": "production",
  "criticalIssues": [
    {
      "service": "database",
      "severity": "critical",
      "message": "Database connection failed",
      "details": "Connection timeout after 30 seconds"
    }
  ],
  "services": {
    "database": {
      "status": "unhealthy",
      "error": "Connection timeout"
    }
  }
}
```

**Query Parameters**:
- `detailed` (boolean, optional): Include detailed diagnostic information
- `check` (string, optional): Specific service to check (database, redis, external)
- `timeout` (number, optional): Custom timeout for health checks in seconds

**Response Fields**:
- `status`: Overall system health status (healthy, degraded, unhealthy)
- `timestamp`: When the health check was performed
- `uptime`: System uptime in seconds
- `version`: Application version
- `environment`: Deployment environment
- `services`: Status of individual services
- `metrics`: System performance metrics

## System Initialization

### GET /api/system/initialize

**Description**: Initialize system components and perform startup tasks. This internal endpoint is used during system startup to initialize databases, create default configurations, and perform other initialization tasks.

**Authentication**: Required (internal service authentication)

**Role Access:**
- **Internal Service**: ✅ Can initialize system

#### Usage Case 1: Successful System Initialization

**Scenario**: System service performs startup initialization

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/system/initialize" \
  -H "Authorization: Bearer INTERNAL_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "components": ["database", "cache", "services"],
    "force": false,
    "environment": "production"
  }'
```

**Success Response**:
```json
{
  "message": "System initialization completed successfully",
  "initId": "init-uuid-123",
  "timestamp": "2024-01-01T12:00:00Z",
  "components": {
    "database": {
      "status": "initialized",
      "duration": 2.5,
      "migrations": {
        "executed": 3,
        "pending": 0
      }
    },
    "cache": {
      "status": "initialized",
      "duration": 0.8,
      "memory": "256MB"
    },
    "services": {
      "status": "initialized",
      "duration": 1.2,
      "servicesStarted": 12
    }
  },
  "totalDuration": 4.5,
  "environment": "production"
}
```

#### Usage Case 2: Partial Initialization Failure

**Scenario**: Some components fail to initialize

**Success Response**:
```json
{
  "message": "System initialization completed with errors",
  "initId": "init-uuid-123",
  "timestamp": "2024-01-01T12:00:00Z",
  "components": {
    "database": {
      "status": "initialized",
      "duration": 2.5
    },
    "cache": {
      "status": "failed",
      "error": "Redis connection timeout",
      "duration": 30.0
    }
  },
  "errors": [
    {
      "component": "cache",
      "error": "Redis connection timeout",
      "severity": "error"
    }
  ],
  "totalDuration": 32.5
}
```

**Request Fields**:
- `components` (array, optional): Specific components to initialize
- `force` (boolean, optional): Force reinitialization even if already initialized
- `environment` (string, optional): Target environment
- `config` (object, optional): Additional configuration parameters

**Response Fields**:
- `message`: Status message
- `initId`: Unique identifier for the initialization process
- `components`: Status of each initialized component
- `totalDuration`: Total time taken for initialization
- `errors`: Array of any errors that occurred

## Client-Side Session Analytics

### POST /api/system/track-session-usage

**Description**: Track client-side user interactions and session events for analytics purposes. This endpoint receives UI interaction events from the browser, including page views, clicks, form submissions, and API calls made by the client. Used to provide detailed analytics on user behavior and application usage patterns.

**Authentication**: Required (session-based authentication)

**Role Access:**
- **USER**: ✅ Can track their own session events
- **ADMIN**: ✅ Can track their own session events
- **SUPER_ADMIN**: ✅ Can track their own session events

**Note**: This endpoint is automatically called by the client-side `useSessionTracking` hook and does not require manual integration. Server-side API tracking is handled separately by the authentication middleware.

#### Usage Case 1: Track UI Click Event

**Scenario**: User clicks a button in the application

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/system/track-session-usage" \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json" \
  -d '{
    "actionType": "click",
    "endpoint": "/admin/settings",
    "method": "CLICK",
    "pageUrl": "https://example.com/admin/settings",
    "metadata": {
      "elementType": "button",
      "elementId": "save-settings-btn",
      "elementClass": "btn-primary",
      "elementText": "Save Settings",
      "clickX": 450,
      "clickY": 320
    },
    "timestamp": "2024-01-01T12:00:00Z"
  }'
```

**Success Response**:
```json
{
  "success": true
}
```

#### Usage Case 2: Track Page View

**Scenario**: User navigates to a new page

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/system/track-session-usage" \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json" \
  -d '{
    "actionType": "page_view",
    "endpoint": "/admin/monitoring-analytics",
    "method": "GET",
    "pageUrl": "https://example.com/admin/monitoring-analytics",
    "referrer": "https://example.com/admin/dashboard",
    "timestamp": "2024-01-01T12:00:00Z"
  }'
```

**Success Response**:
```json
{
  "success": true
}
```

#### Usage Case 3: Track API Call from Client

**Scenario**: Client-side code makes an API request

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/system/track-session-usage" \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json" \
  -d '{
    "actionType": "api_call",
    "endpoint": "/api/opnsense/host-aliases",
    "method": "GET",
    "statusCode": 200,
    "responseTime": 245,
    "pageUrl": "https://example.com/admin/host-aliases",
    "timestamp": "2024-01-01T12:00:00Z"
  }'
```

**Success Response**:
```json
{
  "success": true
}
```

#### Usage Case 4: Track Form Submission

**Scenario**: User submits a form

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/system/track-session-usage" \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json" \
  -d '{
    "actionType": "form_submit",
    "endpoint": "/admin/settings",
    "method": "POST",
    "pageUrl": "https://example.com/admin/settings",
    "metadata": {
      "formId": "global-settings-form",
      "formClass": "settings-form",
      "formAction": "/api/settings/global",
      "formMethod": "POST"
    },
    "timestamp": "2024-01-01T12:00:00Z"
  }'
```

**Success Response**:
```json
{
  "success": true
}
```

**Request Fields**:
- `actionType` (string, required): Type of action - one of: `api_call`, `page_view`, `form_submit`, `click`, `navigation`
- `endpoint` (string, required): The endpoint or page path being tracked
- `method` (string, required): HTTP method or action type (GET, POST, CLICK, etc.)
- `statusCode` (number, optional): HTTP status code for API calls
- `responseTime` (number, optional): Response time in milliseconds for API calls
- `pageUrl` (string, optional): Full URL of the current page
- `referrer` (string, optional): Referrer URL for page views
- `metadata` (object, optional): Additional event-specific metadata (element details for clicks, form details for submissions, etc.)
- `errorType` (string, optional): Error type if the action failed
- `errorMessage` (string, optional): Error message if the action failed
- `timestamp` (string, optional): Event timestamp (ISO 8601)

**Response Fields**:
- `success`: Boolean indicating whether the event was successfully tracked

**Tracked Event Types**:
- **page_view**: User navigates to a page (includes referrer and page URL)
- **click**: User clicks an element (includes element details and click coordinates)
- **form_submit**: User submits a form (includes form details)
- **api_call**: Client makes an API request (includes status code and response time)
- **navigation**: User navigates within the application

**Analytics Integration**:
This endpoint feeds data into:
- Real-time Analytics Dashboard (active users, recent activity)
- Session Analytics (user behavior patterns, page views, UI interactions)
- Combined Analytics (comprehensive usage statistics)
- Performance Analytics (response times, error rates)
- Account Activity (user's personal activity timeline)

## Role-Based Access Control

**Authentication Required:** Mixed (varies by endpoint)

**Role Requirements:**
- **Unauthenticated**: ✅ Can access health endpoint
- **USER**: ❌ Cannot access admin endpoints
- **ADMIN**: ✅ Can access admin endpoints
- **SUPER_ADMIN**: ✅ Can access all endpoints
- **Internal Service**: ✅ Can access internal endpoints

**Role Access:**
- **Unauthenticated**: ✅ Can access health check endpoint
- **USER**: ❌ Cannot access system services endpoints
- **ADMIN**: ✅ Can access usage aggregation, provider display names, and 2FA management
- **SUPER_ADMIN**: ✅ Can access all admin endpoints with full permissions
- **Internal Service**: ✅ Can access initialization and session tracking endpoints

**Example Responses:**

**ADMIN/SUPER_ADMIN Success:**
```json
{
  "services": {
    "authentication": {
      "totalRequests": 15420,
      "successRate": 99.2
    }
  }
}
```

**USER Role Failure:**
```json
{
  "error": "Forbidden: Admin privileges required to access usage aggregation"
}
```

## Rate Limiting

**Rate Limit Strategy:** Mixed (IP-based for public, User-based for authenticated, Service-based for internal)

**Default Rate Limits:**
- **Public Endpoints**: 60 requests per minute per IP
- **Authenticated Endpoints**: 1000 requests per hour per user
- **API Key Endpoints**: Configurable per key (default: 1000/hour)
- **Internal Endpoints**: 10000 requests per hour per service

**Rate Limit Identification:**
- **Public Endpoints**: Identified by IP address
- **Authenticated Endpoints**: Identified by user ID
- **API Key Endpoints**: Identified by API key ID
- **Internal Endpoints**: Identified by service authentication token

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

**Endpoint-Specific Rate Limits:**

### Public Endpoints
- **GET /api/health**: 60 requests per minute per IP
  - Health check endpoint for monitoring systems
  - Window: 1 minute sliding window

### Admin Endpoints
- **GET /api/admin/services/usage-aggregation**: 100 requests per hour per user
  - Resource-intensive aggregation queries
  - Window: 1 hour sliding window
  - Requires ADMIN or SUPER_ADMIN role

- **POST /api/admin/services/usage-aggregation**: 10 requests per hour per user
  - Manual aggregation triggers
  - Window: 1 hour sliding window
  - Requires ADMIN or SUPER_ADMIN role

- **GET /api/admin/provider-display-names**: 500 requests per hour per user
  - Configuration retrieval
  - Window: 1 hour sliding window
  - Requires ADMIN or SUPER_ADMIN role

- **GET /api/admin/users/[id]/disable-2fa**: 20 requests per hour per user
  - Sensitive 2FA management operation
  - Window: 1 hour sliding window
  - Requires ADMIN or SUPER_ADMIN role

### Session Analytics Endpoints
- **POST /api/system/track-session-usage**: 10000 requests per hour per user
  - High-volume client-side event tracking
  - Window: 1 hour sliding window
  - Requires session authentication
  - Automatically called by client-side tracking hook

**Best Practices for Handling Rate Limits:**

1. **Monitor Headers**: Always check rate limit headers in API responses
2. **Exponential Backoff**: Implement exponential backoff when receiving 429 responses
3. **Respect Retry-After**: Use the `Retry-After` header to determine when to retry
4. **Cache Responses**: Cache non-sensitive responses to reduce API calls
5. **Batch Operations**: Use batch endpoints when available to reduce request count
6. **API Key Limits**: Configure appropriate limits for your use case

## Security Considerations

### Authentication and Authorization
1. **Role-Based Access**: Strict role-based access control for all endpoints
2. **Admin Privileges**: Sensitive operations require ADMIN or SUPER_ADMIN roles
3. **Internal Authentication**: Internal endpoints use service-to-service authentication
4. **Audit Logging**: All administrative actions are logged for security monitoring

### Data Protection
1. **Usage Data**: Aggregated usage data anonymizes individual user information
2. **2FA Management**: 2FA disable operations require admin privileges and audit logging
3. **Health Information**: Public health endpoint exposes limited, non-sensitive information
4. **Session Tracking**: Session data is processed securely and aggregated for analytics

### System Security
1. **Initialization**: System initialization requires internal authentication
2. **Rate Limiting**: Comprehensive rate limiting prevents abuse and DoS attacks
3. **Input Validation**: All inputs are validated and sanitized
4. **Error Handling**: Error messages don't expose sensitive system information

### Monitoring and Alerting
1. **Health Monitoring**: Continuous health monitoring of all system components
2. **Usage Analytics**: Comprehensive usage tracking for security and performance monitoring
3. **Audit Trails**: Complete audit trails for all administrative operations
4. **Anomaly Detection**: Automated detection of unusual usage patterns

## Error Responses

### 400 Bad Request

**Missing Required Fields**:
```json
{
  "error": "User ID is required"
}
```

**Invalid Date Format**:
```json
{
  "error": "Invalid date format. Use ISO 8601 format"
}
```

### 401 Unauthorized

**Invalid API Key**:
```json
{
  "error": "Invalid API key"
}
```

**Internal Service Authentication Failed**:
```json
{
  "error": "Internal service authentication required"
}
```

### 403 Forbidden

**Insufficient Privileges**:
```json
{
  "error": "Forbidden: Admin privileges required to access this endpoint"
}
```

**USER Role Access Denied**:
```json
{
  "error": "Forbidden: USER role cannot access admin endpoints"
}
```

### 404 Not Found

**User Not Found**:
```json
{
  "error": "User not found",
  "userId": "{{USER_ID}}"
}
```

### 429 Too Many Requests

**Rate Limit Exceeded**:
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

### 500 Internal Server Error

**Database Error**:
```json
{
  "error": "Failed to retrieve usage data",
  "details": "Database connection timeout"
}
```

**Initialization Failure**:
```json
{
  "error": "System initialization failed",
  "details": "Component initialization error"
}
```

## Notes

### System Services Architecture

1. **Microservices**: System services are designed as independent microservices
2. **Event-Driven**: Services communicate through event-driven architecture
3. **Scalability**: Services can be scaled independently based on load
4. **Resilience**: Services include circuit breakers and retry mechanisms

### Usage Aggregation

1. **Scheduled Processing**: Usage data is aggregated automatically on a schedule
2. **Real-time Tracking**: Session usage is tracked in real-time
3. **Historical Data**: Historical usage data is retained for reporting and analysis
4. **Performance Optimization**: Aggregation queries are optimized for large datasets

### Health Monitoring

1. **Component Health**: Individual service components are monitored independently
2. **Dependency Tracking**: Health checks include dependency verification
3. **Performance Metrics**: Comprehensive performance metrics are collected
4. **Alerting Integration**: Health status integrates with monitoring and alerting systems

### Security Best Practices

1. **Principle of Least Privilege**: Users and services have minimum required permissions
2. **Defense in Depth**: Multiple layers of security controls are implemented
3. **Secure Communication**: All internal communication uses encrypted channels
4. **Regular Audits**: Regular security audits and penetration testing are performed

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