# Account Analytics Endpoints

[⬆️ Back to API Index](API_Index.md) | [📚 Back to Documentation Home](../../DOCUMENTATION_INDEX.md)

## Variables

Replace the following variables in examples below:

- `{{SERVER_URL}}` - Your server URL (e.g., `https://instrada-ogm.example.com`)
- `{{API_KEY}}` - Your API key for authentication

**Example:**
```bash
# Set variables
SERVER_URL="https://instrada-ogm.example.com"
API_KEY="your-api-key-here"

# Use in curl commands
curl -X GET "${SERVER_URL}/api/account/activity-statistics" \
  -H "Authorization: Bearer ${API_KEY}"
```

This section covers all account analytics API endpoints for monitoring user activity, session analytics, and API key usage statistics.

## Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ✅ Can access own account analytics
- **ADMIN**: ✅ Can access own account analytics
- **SUPER_ADMIN**: ✅ Can access own account analytics

**Role Access:**
- **USER**: ✅ Can access and analyze own account activity, sessions, and API key usage
- **ADMIN**: ✅ Can access and analyze own account activity, sessions, and API key usage
- **SUPER_ADMIN**: ✅ Can access and analyze own account activity, sessions, and API key usage

**Example Responses:**

**All Roles Success:**
```json
{
  "success": true,
  "data": {
    "userId": "user-uuid-1",
    "analytics": {
      "totalActivities": 45,
      "activeSessions": 2,
      "apiKeyUsage": 1250
    }
  }
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

**Rate Limit Strategy:** User-based

**Default Rate Limits:**
- **Public Endpoints**: N/A (all endpoints require authentication)
- **Authenticated Endpoints**: 200 requests per hour per user
- **API Key Endpoints**: Configurable per key (default: 200/hour)

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
    "limit": 200,
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

## Account Activity Analytics

### GET /api/account/activity-statistics

**Description**: Get comprehensive activity statistics for the authenticated user including group operations, host management, and profile changes.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can access own activity statistics
- **ADMIN**: ✅ Can access own activity statistics
- **SUPER_ADMIN**: ✅ Can access own activity statistics

**Query Parameters:**
- `period` (string, optional): Time period for statistics - default: 'all'
  - **Validation**: Must be one of '1h', '6h', '12h', '1d', '7d', '7', '30d', '30', 'all'
  - **Example**: `7d` or `30`
  - **Note**: Both '7d' and '7' are accepted for 7 days; both '30d' and '30' are accepted for 30 days

#### Usage Case 1: Basic Activity Statistics for Last 30 Days

**Scenario**: User retrieves their activity statistics for the last 30 days

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/activity-statistics?period=30d" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "statistics": {
    "assignments": {
      "total": 12,
      "last7Days": 5,
      "last30Days": 12
    },
    "moves": {
      "total": 8,
      "last7Days": 3,
      "last30Days": 8
    },
    "unassignments": {
      "total": 6,
      "last7Days": 2,
      "last30Days": 6
    },
    "hostOperations": {
      "total": 4,
      "last7Days": 1,
      "last30Days": 4
    },
    "hostCreations": {
      "total": 2,
      "last7Days": 0,
      "last30Days": 2
    },
    "hostDeletions": {
      "total": 1,
      "last7Days": 0,
      "last30Days": 1
    },
    "hostModifications": {
      "total": 1,
      "last7Days": 1,
      "last30Days": 1
    },
    "totalActivities": 34,
    "mostActiveDay": "Monday, November 10, 2025",
    "topGroups": [
      {
        "groupName": "Italy - Proton - OV",
        "count": 8
      },
      {
        "groupName": "Brazil - Proton - OV",
        "count": 6
      },
      {
        "groupName": "United Kingdom - Proton - OV",
        "count": 5
      }
    ],
    "dailyBreakdown": [
      {
        "date": "2025-10-15",
        "assignments": 2,
        "moves": 1,
        "unassignments": 0,
        "hostOperations": 0,
        "total": 3
      },
      {
        "date": "2025-10-16",
        "assignments": 1,
        "moves": 0,
        "unassignments": 1,
        "hostOperations": 0,
        "total": 2
      },
      {
        "date": "2025-10-17",
        "assignments": 3,
        "moves": 2,
        "unassignments": 0,
        "hostOperations": 1,
        "total": 6
      }
    ]
  }
}
```

#### Usage Case 2: Activity Statistics for Last 7 Days

**Scenario**: User retrieves activity statistics for the last 7 days to view recent trends

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/activity-statistics?period=7d" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "statistics": {
    "assignments": {
      "total": 5,
      "last7Days": 5,
      "last30Days": 12
    },
    "moves": {
      "total": 3,
      "last7Days": 3,
      "last30Days": 8
    },
    "unassignments": {
      "total": 2,
      "last7Days": 2,
      "last30Days": 6
    },
    "hostOperations": {
      "total": 1,
      "last7Days": 1,
      "last30Days": 4
    },
    "hostCreations": {
      "total": 0,
      "last7Days": 0,
      "last30Days": 2
    },
    "hostDeletions": {
      "total": 0,
      "last7Days": 0,
      "last30Days": 1
    },
    "hostModifications": {
      "total": 1,
      "last7Days": 1,
      "last30Days": 1
    },
    "totalActivities": 12,
    "mostActiveDay": "Wednesday, November 12, 2025",
    "topGroups": [
      {
        "groupName": "Italy - Proton - OV",
        "count": 4
      },
      {
        "groupName": "Brazil - Proton - OV",
        "count": 3
      }
    ],
    "dailyBreakdown": [
      {
        "date": "2025-11-06",
        "assignments": 1,
        "moves": 0,
        "unassignments": 0,
        "hostOperations": 0,
        "total": 1
      },
      {
        "date": "2025-11-07",
        "assignments": 0,
        "moves": 1,
        "unassignments": 1,
        "hostOperations": 0,
        "total": 2
      },
      {
        "date": "2025-11-12",
        "assignments": 2,
        "moves": 1,
        "unassignments": 0,
        "hostOperations": 1,
        "total": 4
      },
      {
        "date": "2025-11-13",
        "assignments": 2,
        "moves": 1,
        "unassignments": 1,
        "hostOperations": 0,
        "total": 5
      }
    ]
  }
}
```

#### Usage Case 3: Activity Statistics for Last Hour (Short Period)

**Scenario**: User retrieves activity statistics for the last hour to monitor recent activity

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/activity-statistics?period=1h" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "statistics": {
    "assignments": {
      "total": 1,
      "last7Days": 5,
      "last30Days": 12
    },
    "moves": {
      "total": 0,
      "last7Days": 3,
      "last30Days": 8
    },
    "unassignments": {
      "total": 0,
      "last7Days": 2,
      "last30Days": 6
    },
    "hostOperations": {
      "total": 0,
      "last7Days": 1,
      "last30Days": 4
    },
    "hostCreations": {
      "total": 0,
      "last7Days": 0,
      "last30Days": 2
    },
    "hostDeletions": {
      "total": 0,
      "last7Days": 0,
      "last30Days": 1
    },
    "hostModifications": {
      "total": 0,
      "last7Days": 1,
      "last30Days": 1
    },
    "totalActivities": 1,
    "mostActiveDay": null,
    "topGroups": [
      {
        "groupName": "Italy - Proton - OV",
        "count": 1
      }
    ],
    "dailyBreakdown": [
      {
        "date": "2025-11-13",
        "assignments": 1,
        "moves": 0,
        "unassignments": 0,
        "hostOperations": 0,
        "total": 1
      }
    ]
  }
}
```

#### Usage Case 4: All-Time Activity Statistics

**Scenario**: User retrieves all-time activity statistics to see complete history

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/activity-statistics?period=all" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "statistics": {
    "assignments": {
      "total": 45,
      "last7Days": 5,
      "last30Days": 12
    },
    "moves": {
      "total": 28,
      "last7Days": 3,
      "last30Days": 8
    },
    "unassignments": {
      "total": 18,
      "last7Days": 2,
      "last30Days": 6
    },
    "hostOperations": {
      "total": 12,
      "last7Days": 1,
      "last30Days": 4
    },
    "hostCreations": {
      "total": 5,
      "last7Days": 0,
      "last30Days": 2
    },
    "hostDeletions": {
      "total": 2,
      "last7Days": 0,
      "last30Days": 1
    },
    "hostModifications": {
      "total": 5,
      "last7Days": 1,
      "last30Days": 1
    },
    "totalActivities": 115,
    "mostActiveDay": "Monday, October 15, 2025",
    "topGroups": [
      {
        "groupName": "Italy - Proton - OV",
        "count": 28
      },
      {
        "groupName": "Brazil - Proton - OV",
        "count": 22
      },
      {
        "groupName": "United Kingdom - Proton - OV",
        "count": 18
      }
    ],
    "dailyBreakdown": [
      {
        "date": "2025-09-01",
        "assignments": 2,
        "moves": 1,
        "unassignments": 0,
        "hostOperations": 0,
        "total": 3
      },
      {
        "date": "2025-09-02",
        "assignments": 1,
        "moves": 0,
        "unassignments": 1,
        "hostOperations": 0,
        "total": 2
      }
    ]
  }
}
```

**Response Field Descriptions**:
- `statistics.assignments`: Group assignment operations
- `statistics.moves`: Group move operations (reassignments)
- `statistics.unassignments`: Group unassignment operations
- `statistics.hostOperations`: Host alias and DHCP operations (admin only)
- `statistics.hostCreations`: Host creation operations (admin only)
- `statistics.hostDeletions`: Host deletion operations (admin only)
- `statistics.hostModifications`: Host modification operations (admin only)
- `statistics.networkAliasOperations`: Network alias management operations (admin only)
- `statistics.networkAliasCreations`: Network alias creation operations (admin only)
- `statistics.networkAliasModifications`: Network alias modification operations (admin only)
- `statistics.networkAliasDeletions`: Network alias deletion operations (admin only)
- `statistics.totalActivities`: Total count of all activities in the period
- `statistics.mostActiveDay`: The day with the most activities (formatted date string or null)
- `statistics.topGroups`: Array of top 10 groups by activity count
- `statistics.dailyBreakdown`: Array of daily activity breakdown by type, sorted by date
  - Each entry contains: `date` (YYYY-MM-DD), `assignments`, `moves`, `unassignments`, `hostOperations`, `networkAliasOperations`, `total`
  - Useful for generating activity trend charts

**Error Response**:
```json
{
  "success": false,
  "message": "Authentication required"
}
```

**Status Codes**:
- `200 OK`: Successfully retrieved activity statistics
- `401 Unauthorized`: Authentication required or invalid credentials
- `500 Internal Server Error`: Server error retrieving statistics

---

## Response Field Descriptions

### Statistics Object

The response contains a `statistics` object with the following structure:

#### Activity Counters
Each activity type has three counters:
- `total`: Total count for the selected period
- `last7Days`: Count for the last 7 days (always calculated)
- `last30Days`: Count for the last 30 days (always calculated)

#### Daily Breakdown
The `dailyBreakdown` array provides time-series data for charting activity trends:
- **date**: ISO date string (YYYY-MM-DD)
- **assignments**: Number of group assignments on that day
- **moves**: Number of group moves on that day
- **unassignments**: Number of group unassignments on that day
- **hostOperations**: Number of host operations on that day (admin only)
- **networkAliasOperations**: Number of network alias operations on that day (admin only)
- **total**: Total activities on that day

This data is useful for:
- Creating activity trend charts
- Identifying peak activity days
- Analyzing activity patterns over time
- Generating reports

#### Top Groups
The `topGroups` array contains up to 10 groups with the most activity:
- **groupName**: Name of the group
- **count**: Number of activities for that group in the selected period

---

## Activity Trends Visualization

The `dailyBreakdown` data can be used to create various visualizations:

### Line Chart: Total Activity Over Time
Plot the `total` field from `dailyBreakdown` to show overall activity trends.

### Stacked Area Chart: Activity by Type
Stack the `assignments`, `moves`, `unassignments`, and `hostOperations` fields to show the composition of activities over time.

### Individual Type Trends
Create separate line charts for each activity type to analyze specific operation patterns.

### Example Usage in Frontend

```typescript
// Using the dailyBreakdown data for charts
const chartData = statistics.dailyBreakdown.map(day => ({
  date: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  total: day.total,
  assignments: day.assignments,
  moves: day.moves,
  unassignments: day.unassignments,
  hostOperations: day.hostOperations,
}));

// Create line chart for total activities
const lineChartData = chartData.map(d => ({
  date: d.date,
  total: d.total,
}));

// Create stacked area chart for breakdown
const areaChartData = chartData;
```

---

## Notes

- **Period Parameter**: Accepts both short format (e.g., '7d') and numeric format (e.g., '7') for 7 days and 30 days
- **Admin-Only Fields**: `hostOperations`, `hostCreations`, `hostDeletions`, and `hostModifications` are only populated for admin users
- **Daily Breakdown**: Always includes all days in the selected period, even if there were no activities on that day (values will be 0)
- **Most Active Day**: Returns null if there are no activities in the selected period
- **Top Groups**: Only includes groups that had activities in the selected period
- **Time Zone**: All timestamps are in UTC
- **Caching**: Results are calculated in real-time from the audit log; no caching is applied

---

## Related Endpoints

- [GET /api/account/recent-activities](#) - Get recent activity entries
- [GET /api/admin/analytics/audit-logs](#) - Admin audit log analytics (admin only)
- [GET /api/analytics/session-analytics](#) - Session analytics

---

## SDK Examples

### JavaScript/TypeScript

```typescript
interface ActivityStatistics {
  assignments: { total: number; last7Days: number; last30Days: number };
  moves: { total: number; last7Days: number; last30Days: number };
  unassignments: { total: number; last7Days: number; last30Days: number };
  hostOperations: { total: number; last7Days: number; last30Days: number };
  hostCreations: { total: number; last7Days: number; last30Days: number };
  hostDeletions: { total: number; last7Days: number; last30Days: number };
  hostModifications: { total: number; last7Days: number; last30Days: number };
  totalActivities: number;
  mostActiveDay: string | null;
  topGroups: Array<{ groupName: string; count: number }>;
  dailyBreakdown: Array<{
    date: string;
    assignments: number;
    moves: number;
    unassignments: number;
    hostOperations: number;
    total: number;
  }>;
}

async function getActivityStatistics(period: string = 'all'): Promise<ActivityStatistics> {
  const response = await fetch(
    `/api/account/activity-statistics?period=${period}`,
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch activity statistics: ${response.statusText}`);
  }

  const data = await response.json();
  return data.statistics;
}

// Usage
const stats = await getActivityStatistics('7d');
console.log(`Total activities in last 7 days: ${stats.totalActivities}`);
console.log(`Most active day: ${stats.mostActiveDay}`);
console.log(`Daily breakdown:`, stats.dailyBreakdown);
```

### Python

```python
import requests
from typing import Dict, List, Any
from datetime import datetime

class ActivityStatisticsClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url
        self.api_key = api_key
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }

    def get_activity_statistics(self, period: str = 'all') -> Dict[str, Any]:
        """
        Get activity statistics for the authenticated user.

        Args:
            period: Time period ('1h', '6h', '12h', '1d', '7d', '30d', 'all')

        Returns:
            Dictionary containing activity statistics
        """
        params = {
            'period': period
        }

        response = requests.get(
            f'{self.base_url}/api/account/activity-statistics',
            headers=self.headers,
            params=params
        )

        response.raise_for_status()
        data = response.json()

        if not data.get('success'):
            raise Exception(f"API error: {data.get('message')}")

        return data['statistics']

    def get_daily_breakdown(self, period: str = 'all') -> List[Dict[str, Any]]:
        """Get daily activity breakdown for charting."""
        stats = self.get_activity_statistics(period)
        return stats.get('dailyBreakdown', [])

    def get_top_groups(self, period: str = 'all', limit: int = 10) -> List[Dict[str, Any]]:
        """Get top groups by activity count."""
        stats = self.get_activity_statistics(period)
        return stats.get('topGroups', [])[:limit]

# Usage
client = ActivityStatisticsClient('https://instrada-ogm.example.com', 'your-api-key')
stats = client.get_activity_statistics('7d')
print(f"Total activities: {stats['totalActivities']}")
print(f"Most active day: {stats['mostActiveDay']}")

# Get daily breakdown for charting
daily_data = client.get_daily_breakdown('7d')
for day in daily_data:
    print(f"{day['date']}: {day['total']} activities")
```

---

## Changelog

### Version 2.0 (Current)
- Added `dailyBreakdown` array to response for time-series activity data
- Updated `period` parameter to support short time periods (1h, 6h, 12h, 1d)
- Improved response structure for better API consistency
- Added support for activity trend visualization

### Version 1.0
- Initial implementation with basic activity statistics
        "startDate": "2024-01-08",
        "endDate": "2024-01-14",
        "totalActivities": 18,
        "groupOperations": 8,
        "hostOperations": 6,
        "accountOperations": 4
      }
    ],
    "mostActiveGroups": [
      {
        "groupId": "group-uuid-1",
        "groupName": "Italy - Proton - OV",
        "count": 28,
        "percentage": 19.3
      }
    ]
  }
}
```

#### Usage Case 3: Invalid Period Parameter

**Scenario**: User provides an invalid period value

**Error Response**:
```json
{
  "success": false,
  "message": "Invalid period parameter. Must be one of: 7, 30, 90, all"
}
```

**Response Fields**:
- `period`: Time period information for the statistics
  - `days`: Number of days included in the statistics
  - `startDate`: Start date of the period (ISO 8601)
  - `endDate`: End date of the period (ISO 8601)
  - `label`: Human-readable period label
- `summary`: Overall activity summary
  - `totalActivities`: Total number of activities
  - `groupAssignments`: Number of group assignment operations
  - `groupUnassignments`: Number of group unassignment operations
  - `hostCreations`: Number of host creation operations
  - `hostRenames`: Number of host rename operations
  - `hostDeletions`: Number of host deletion operations
  - `profileUpdates`: Number of profile update operations
  - `loginActivities`: Number of login activities
  - `apiCalls`: Number of API calls made by user
  - `uiActions`: Number of UI actions performed
- `detailedBreakdown` (optional): Detailed breakdown when `includeDetails=true`
- `activityTrends`/`weeklyTrends`: Activity trends over time
- `mostActiveGroups`: Most frequently used groups with activity counts

---

## Recent Activities

### GET /api/account/recent-activities

**Description**: Get recent activity history for the authenticated user with enhanced descriptions and pagination support.

**Authentication**: Required (session or API key)

**Rate Limiting**: ✅ Enforced for API key requests (standard rate limits apply)

**Role Access:**
- **USER**: ✅ Can access own recent activities
- **ADMIN**: ✅ Can access own recent activities
- **SUPER_ADMIN**: ✅ Can access own recent activities

**Authentication Methods:**
- **Web Session**: ✅ Supported - No rate limiting applied
- **API Key**: ✅ Supported - Rate limiting enforced per API key configuration

**Query Parameters:**
- `limit` (number, optional): Number of activities to return (default: 20, max: 100)
  - **Validation**: Must be between 1 and 100
  - **Example**: `10`
- `offset` (number, optional): Number of activities to skip for pagination (default: 0)
  - **Validation**: Must be 0 or greater
  - **Example**: `20`
- `period` (string, optional): Time period filter ('7', '30', '90', 'all') - default: '30'
  - **Validation**: Must be one of '7', '30', '90', 'all'
  - **Example**: `7`
- `activityType` (string, optional): Filter by activity type ('group', 'host', 'profile', 'auth')
  - **Validation**: Must be one of 'group', 'host', 'profile', 'auth'
  - **Example**: `group`
- `includeDetails` (boolean, optional): Include detailed activity information - default: `true`
  - **Validation**: Must be true or false
  - **Example**: `true`

#### Usage Case 1: Basic Recent Activities

**Scenario**: User retrieves their 10 most recent activities from the last 30 days

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/recent-activities?limit=10&period=30" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "activities": [
      {
        "id": "activity-uuid-1",
        "action": "OPNSENSE_GROUP_IP_ASSIGN_SUCCESS",
        "details": {
          "hostAliasName": "HOST_192_168_1_61",
          "ipAddress": "192.168.1.61",
          "groupFriendlyName": "Italy - Proton - OV",
          "groupId": "group-uuid-1"
        },
        "timestamp": "2024-01-15T14:30:00.000Z",
        "ipAddress": "192.168.1.100",
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "description": "Assigned 192.168.1.61 to 'Italy - Proton - OV'",
        "activityType": "group",
        "severity": "info"
      },
      {
        "id": "activity-uuid-2",
        "action": "OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS",
        "details": {
          "hostAliases": [
            {
              "hostAliasName": "HOST_192_168_1_61",
              "ipAddress": "192.168.1.61"
            },
            {
              "hostAliasName": "HOST_192_168_1_62",
              "ipAddress": "192.168.1.62"
            }
          ],
          "groups": [
            {
              "groupFriendlyName": "Brazil Proton - OV",
              "groupId": "group-uuid-2"
            }
          ],
          "removedFromGroups": [
            {
              "groupFriendlyName": "Italy - Proton - OV",
              "groupId": "group-uuid-1"
            }
          ]
        },
        "timestamp": "2024-01-15T14:25:00.000Z",
        "ipAddress": "192.168.1.100",
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "description": "Moved 2 hosts from 'Italy - Proton - OV' to 'Brazil Proton - OV'",
        "activityType": "group",
        "severity": "info"
      }
    ],
    "pagination": {
      "totalCount": 45,
      "limit": 10,
      "offset": 0,
      "hasMore": true,
      "nextOffset": 10
    },
    "period": "30",
    "filters": {
      "activityType": null,
      "includeDetails": true
    }
  }
}
```

#### Usage Case 2: Paginated Activities with Type Filter

**Scenario**: User retrieves group activities from the last 7 days with pagination

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/recent-activities?limit=5&offset=10&period=7&activityType=group" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "activities": [
      {
        "id": "activity-uuid-3",
        "action": "OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS",
        "details": {
          "hostAliasName": "HOST_192_168_1_61",
          "ipAddress": "192.168.1.61",
          "unassignedGroup": {
            "friendlyName": "Italy - VPS-Aruba - WG",
            "groupId": "group-uuid-3"
          }
        },
        "timestamp": "2024-01-15T14:20:00.000Z",
        "ipAddress": "192.168.1.100",
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "description": "Unassigned 192.168.1.61 from 'Italy - VPS-Aruba - WG'",
        "activityType": "group",
        "severity": "info"
      }
    ],
    "pagination": {
      "totalCount": 12,
      "limit": 5,
      "offset": 10,
      "hasMore": false,
      "nextOffset": null
    },
    "period": "7",
    "filters": {
      "activityType": "group",
      "includeDetails": true
    }
  }
}
```

#### Usage Case 3: Invalid Limit Parameter

**Scenario**: User provides a limit value exceeding the maximum

**Error Response**:
```json
{
  "success": false,
  "message": "Invalid limit parameter. Must be between 1 and 100"
}
```

**Response Fields**:
- `activities`: Array of activity objects with enhanced descriptions
  - `id`: Unique activity identifier
  - `action`: Activity action type
  - `details`: Detailed activity information
  - `timestamp`: Activity timestamp (ISO 8601)
  - `ipAddress`: IP address from which activity was performed
  - `userAgent`: User agent string (if available)
  - `description`: Human-readable description
  - `activityType`: Categorized activity type
  - `severity`: Activity severity level
- `pagination`: Pagination information
  - `totalCount`: Total number of activities matching filters
  - `limit`: Current page limit
  - `offset`: Current page offset
  - `hasMore`: Whether more activities are available
  - `nextOffset`: Offset for next page (if available)
- `period`: The time period filter applied
- `filters`: Applied filters for the request

---

## Session Analytics

### GET /api/account/sessions/analytics

**Description**: Get detailed session analytics for the authenticated user including session duration, activity patterns, and device information.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can access own session analytics
- **ADMIN**: ✅ Can access own session analytics
- **SUPER_ADMIN**: ✅ Can access own session analytics

**Query Parameters:**
- `days` (number, optional): Number of days to analyze (default: 30, max: 90)
  - **Validation**: Must be between 1 and 90
  - **Example**: `30`
- `includeEvents` (boolean, optional): Include recent session events data - default: `false`
  - **Validation**: Must be true or false
  - **Example**: `true`
- `groupBy` (string, optional): Group sessions by 'day', 'week', or 'device' - default: 'day'
  - **Validation**: Must be one of 'day', 'week', 'device'
  - **Example**: `device`
- `includeInactive` (boolean, optional): Include inactive/expired sessions - default: `false`
  - **Validation**: Must be true or false
  - **Example**: `false`

#### Usage Case 1: Basic Session Analytics

**Scenario**: User retrieves their session analytics for the last 30 days

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/sessions/analytics?days=30" \
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
      "endDate": "2024-01-31T00:00:00Z"
    },
    "summary": {
      "totalSessions": 45,
      "activeSessions": 2,
      "totalRequests": 2450,
      "apiCalls": 1200,
      "pageViews": 800,
      "uiActions": 450,
      "avgRequestsPerDay": 81.7,
      "avgRequestsPerSession": 54.4,
      "avgSessionDuration": 125.5,
      "totalSessionTime": 5647.5
    },
    "dailyStats": [
      {
        "date": "2024-01-15",
        "totalRequests": 95,
        "apiCalls": 45,
        "pageViews": 30,
        "uiActions": 20,
        "avgResponseTime": 234.5,
        "sessions": 2,
        "uniqueDevices": 1,
        "totalSessionTime": 245.0,
        "avgSessionDuration": 122.5
      }
    ],
    "deviceBreakdown": [
      {
        "deviceType": "desktop",
        "deviceName": "Chrome on Windows",
        "sessions": 35,
        "requests": 2100,
        "avgSessionDuration": 130.2,
        "percentage": 77.8
      },
      {
        "deviceType": "mobile",
        "deviceName": "Safari on iPhone",
        "sessions": 10,
        "requests": 350,
        "avgSessionDuration": 95.5,
        "percentage": 22.2
      }
    ]
  }
}
```

#### Usage Case 2: Session Analytics with Events and Device Grouping

**Scenario**: User retrieves detailed session analytics with events grouped by device

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/sessions/analytics?days=7&includeEvents=true&groupBy=device" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "period": {
      "days": 7,
      "startDate": "2024-01-09T00:00:00Z",
      "endDate": "2024-01-16T00:00:00Z"
    },
    "summary": {
      "totalSessions": 12,
      "activeSessions": 1,
      "totalRequests": 580,
      "apiCalls": 280,
      "pageViews": 180,
      "uiActions": 120,
      "avgRequestsPerDay": 82.9,
      "avgRequestsPerSession": 48.3,
      "avgSessionDuration": 115.8,
      "totalSessionTime": 1389.6
    },
    "deviceGroups": [
      {
        "deviceType": "desktop",
        "deviceName": "Chrome on Windows",
        "sessions": 8,
        "requests": 420,
        "avgSessionDuration": 125.5,
        "percentage": 66.7,
        "topEndpoints": [
          {
            "endpoint": "/api/vpn/status",
            "count": 85,
            "percentage": 20.2
          },
          {
            "endpoint": "/dashboard",
            "count": 65,
            "percentage": 15.5
          }
        ]
      },
      {
        "deviceType": "mobile",
        "deviceName": "Safari on iPhone",
        "sessions": 4,
        "requests": 160,
        "avgSessionDuration": 95.5,
        "percentage": 33.3,
        "topEndpoints": [
          {
            "endpoint": "/api/vpn/status",
            "count": 35,
            "percentage": 21.9
          }
        ]
      }
    ],
    "recentEvents": [
      {
        "id": "event-uuid-1",
        "timestamp": "2024-01-15T10:30:00Z",
        "sessionId": "session-uuid-1",
        "eventType": "api_call",
        "endpoint": "/api/vpn/status",
        "method": "GET",
        "statusCode": 200,
        "responseTime": 234,
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "ipAddress": "192.168.1.100"
      },
      {
        "id": "event-uuid-2",
        "timestamp": "2024-01-15T10:29:45Z",
        "sessionId": "session-uuid-1",
        "eventType": "page_view",
        "endpoint": "/dashboard",
        "method": "GET",
        "statusCode": 200,
        "responseTime": 156,
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "ipAddress": "192.168.1.100"
      }
    ]
  }
}
```

#### Usage Case 3: Invalid Days Parameter

**Scenario**: User provides a days value exceeding the maximum

**Error Response**:
```json
{
  "success": false,
  "message": "Invalid days parameter. Must be between 1 and 90"
}
```

**Response Fields**:
- `period`: Time period information for the analytics
- `summary`: Overall session summary
  - `totalSessions`: Total number of sessions
  - `activeSessions`: Currently active sessions
  - `totalRequests`: Total requests across all sessions
  - `apiCalls`: Number of API calls
  - `pageViews`: Number of page views
  - `uiActions`: Number of UI actions
  - `avgRequestsPerDay`: Average requests per day
  - `avgRequestsPerSession`: Average requests per session
  - `avgSessionDuration`: Average session duration in minutes
  - `totalSessionTime`: Total session time in minutes
- `dailyStats`: Daily statistics when grouped by day
- `deviceBreakdown`/`deviceGroups`: Device-specific statistics
- `recentEvents`: Recent session events when `includeEvents=true`

---

## API Key Usage Summary

### GET /api/account/api-keys/usage/summary

**Description**: Get aggregated usage summary for all API keys belonging to the authenticated user with comprehensive analytics and trends.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can access own API key usage summary
- **ADMIN**: ✅ Can access own API key usage summary
- **SUPER_ADMIN**: ✅ Can access own API key usage summary

**Query Parameters:**
- `includeDetailedStats` (boolean, optional): Include detailed statistics for each API key - default: `false`
  - **Validation**: Must be true or false
  - **Example**: `true`
- `period` (string, optional): Time period for summary ('7', '30', '90', 'all') - default: '30'
  - **Validation**: Must be one of '7', '30', '90', 'all'
  - **Example**: `30`
- `includeTrends` (boolean, optional): Include usage trends over time - default: `false`
  - **Validation**: Must be true or false
  - **Example**: `true`
- `groupBy` (string, optional): Group usage by 'day', 'week', 'month', or 'endpoint' - default: 'day'
  - **Validation**: Must be one of 'day', 'week', 'month', 'endpoint'
  - **Example**: `endpoint`

#### Usage Case 1: Basic Usage Summary

**Scenario**: User retrieves basic usage summary for all their API keys

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/api-keys/usage/summary" \
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
      "totalApiKeys": 3,
      "activeApiKeys": 2,
      "inactiveApiKeys": 1,
      "totalRequests": 25680,
      "successfulRequests": 25420,
      "failedRequests": 260,
      "rateLimitViolations": 15,
      "avgRequestsPerDay": 856.0,
      "avgResponseTime": 245.5,
      "topApiKeys": [
        {
          "id": "key-uuid-1",
          "name": "Production API Key",
          "requests": 15420,
          "percentage": 60.1,
          "lastUsed": "2024-01-15T14:30:00.000Z",
          "enabled": true
        },
        {
          "id": "key-uuid-2",
          "name": "Development API Key",
          "requests": 8960,
          "percentage": 34.9,
          "lastUsed": "2024-01-15T12:15:00.000Z",
          "enabled": true
        },
        {
          "id": "key-uuid-3",
          "name": "Testing API Key",
          "requests": 1300,
          "percentage": 5.1,
          "lastUsed": "2024-01-14T16:45:00.000Z",
          "enabled": false
        }
      ],
      "usageByPeriod": {
        "last24Hours": 450,
        "last7Days": 2100,
        "last30Days": 25680
      },
      "usageByHour": [
        {
          "hour": 14,
          "requests": 1250,
          "percentage": 4.9
        },
        {
          "hour": 15,
          "requests": 1180,
          "percentage": 4.6
        }
      ]
    }
  }
}
```

#### Usage Case 2: Detailed Usage Summary with Trends and Endpoint Grouping

**Scenario**: User retrieves comprehensive usage summary with trends and endpoint breakdown

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/api-keys/usage/summary?includeDetailedStats=true&includeTrends=true&groupBy=endpoint&period=30" \
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
      "totalApiKeys": 3,
      "activeApiKeys": 2,
      "inactiveApiKeys": 1,
      "totalRequests": 25680,
      "successfulRequests": 25420,
      "failedRequests": 260,
      "rateLimitViolations": 15,
      "avgRequestsPerDay": 856.0,
      "avgResponseTime": 245.5,
      "topApiKeys": [
        {
          "id": "key-uuid-1",
          "name": "Production API Key",
          "requests": 15420,
          "percentage": 60.1,
          "lastUsed": "2024-01-15T14:30:00.000Z",
          "enabled": true
        }
      ],
      "usageByPeriod": {
        "last24Hours": 450,
        "last7Days": 2100,
        "last30Days": 25680
      }
    },
    "detailedStats": [
      {
        "apiKeyId": "key-uuid-1",
        "apiKeyName": "Production API Key",
        "enabled": true,
        "totalRequests": 15420,
        "successfulRequests": 15280,
        "failedRequests": 140,
        "rateLimitHits": 8,
        "usageByPeriod": {
          "hourly": 45,
          "daily": 514,
          "monthly": 15420,
          "burst": 2
        },
        "currentLimits": {
          "hourly": 1000,
          "daily": 10000,
          "monthly": 100000,
          "burst": 100
        },
        "topEndpoints": [
          {
            "endpoint": "/api/vpn/status",
            "count": 6200,
            "percentage": 40.2
          },
          {
            "endpoint": "/api/opnsense/aliases",
            "count": 3100,
            "percentage": 20.1
          }
        ],
        "lastUsed": "2024-01-15T14:30:00.000Z",
        "createdAt": "2024-01-01T12:00:00.000Z",
        "avgResponseTime": 235.5
      }
    ],
    "trends": [
      {
        "date": "2024-01-14",
        "totalRequests": 820,
        "successfulRequests": 810,
        "failedRequests": 10,
        "rateLimitHits": 2,
        "activeApiKeys": 2,
        "avgResponseTime": 242.3
      },
      {
        "date": "2024-01-15",
        "totalRequests": 890,
        "successfulRequests": 875,
        "failedRequests": 15,
        "rateLimitHits": 3,
        "activeApiKeys": 2,
        "avgResponseTime": 248.7
      }
    ],
    "endpointBreakdown": [
      {
        "endpoint": "/api/vpn/status",
        "totalRequests": 8500,
        "successfulRequests": 8420,
        "failedRequests": 80,
        "avgResponseTime": 180.5,
        "percentage": 33.1,
        "topApiKeys": [
          {
            "apiKeyId": "key-uuid-1",
            "apiKeyName": "Production API Key",
            "requests": 6200,
            "percentage": 72.9
          }
        ]
      }
    ]
  }
}
```

#### Usage Case 3: Invalid Period Parameter

**Scenario**: User provides an invalid period value

**Error Response**:
```json
{
  "success": false,
  "message": "Invalid period parameter. Must be one of: 7, 30, 90, all"
}
```

**Response Fields**:
- `period`: Time period information for the summary
- `summary`: Overall usage summary
  - `totalApiKeys`: Total number of API keys
  - `activeApiKeys`: Number of enabled API keys
  - `inactiveApiKeys`: Number of disabled API keys
  - `totalRequests`: Combined requests across all API keys
  - `successfulRequests`: Number of successful requests
  - `failedRequests`: Number of failed requests
  - `rateLimitViolations`: Total rate limit violations
  - `avgRequestsPerDay`: Average requests per day
  - `avgResponseTime`: Average response time across all requests
  - `topApiKeys`: Top API keys by usage
  - `usageByPeriod`: Usage breakdown by time periods
  - `usageByHour`: Usage breakdown by hour of day
- `detailedStats` (optional): Detailed statistics for each API key when `includeDetailedStats=true`
- `trends` (optional): Usage trends over time when `includeTrends=true`
- `endpointBreakdown` (optional): Endpoint-specific usage when grouped by endpoint

---

## Security Considerations

### Data Privacy
- All analytics endpoints only return data for the authenticated user
- No cross-user data access is permitted
- Sensitive information like IP addresses is only shown to the account owner
- API key values are never exposed in analytics responses

### Access Control
- All endpoints require valid authentication (session or API key)
- Role-based access control ensures users can only access their own data
- API keys can only access analytics for their owning user
- Admin and super admin roles follow the same restrictions for personal analytics

### Audit Logging
- All analytics endpoint access is logged
- Data access patterns are monitored for unusual activity
- Rate limit violations are tracked and may trigger security alerts
- Failed authentication attempts are logged and monitored

### Data Retention
- Raw activity events are retained for 90 days by default
- Aggregated statistics are retained for longer periods
- Session data is automatically purged after inactivity periods
- API key usage data follows configurable retention policies

---

## Error Responses

### 400 Bad Request

**Invalid Period Parameter**:
```json
{
  "success": false,
  "message": "Invalid period parameter. Must be one of: 7, 30, 90, all"
}
```

**Invalid Limit Parameter**:
```json
{
  "success": false,
  "message": "Invalid limit parameter. Must be between 1 and 100"
}
```

**Invalid Days Parameter**:
```json
{
  "success": false,
  "message": "Invalid days parameter. Must be between 1 and 90"
}
```

**Invalid Group By Parameter**:
```json
{
  "success": false,
  "message": "Invalid groupBy parameter. Must be one of: day, week, month, endpoint"
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

**Insufficient Permissions**:
```json
{
  "success": false,
  "message": "Insufficient permissions to access this resource"
}
```

### 429 Rate Limited

**Rate Limit Exceeded**:
```json
{
  "error": "Rate limit exceeded",
  "rateLimitInfo": {
    "limit": 200,
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
- Consider using pagination for large activity datasets
- Cache non-sensitive analytics data where appropriate

### Data Freshness
- Activity statistics are updated in near real-time
- Session analytics may have a 5-minute delay
- API key usage statistics are updated every minute
- Aggregated data may have additional processing delays

### Best Practices
1. **Time Range Selection**: Use shorter time ranges for real-time monitoring
2. **Pagination**: Implement proper pagination for activity feeds
3. **Caching**: Cache summary data for dashboard displays
4. **Error Handling**: Implement proper error handling for rate limits
5. **Security**: Protect analytics endpoints with appropriate authentication

### Integration Examples

**JavaScript Client Example**:
```javascript
class AccountAnalytics {
  constructor(apiKey, baseUrl) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async getActivityStatistics(period = 30, includeDetails = false) {
    const params = new URLSearchParams({
      period,
      includeDetails
    });

    const response = await fetch(
      `${this.baseUrl}/api/account/activity-statistics?${params}`,
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

  async getRecentActivities(options = {}) {
    const {
      limit = 20,
      offset = 0,
      period = 30,
      activityType = null,
      includeDetails = true
    } = options;

    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
      period,
      includeDetails: includeDetails.toString()
    });

    if (activityType) {
      params.append('activityType', activityType);
    }

    const response = await fetch(
      `${this.baseUrl}/api/account/recent-activities?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return await response.json();
  }

  async getSessionAnalytics(days = 30, includeEvents = false) {
    const params = new URLSearchParams({
      days: days.toString(),
      includeEvents: includeEvents.toString()
    });

    const response = await fetch(
      `${this.baseUrl}/api/account/sessions/analytics?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return await response.json();
  }

  async getApiKeyUsageSummary(options = {}) {
    const {
      includeDetailedStats = false,
      period = 30,
      includeTrends = false,
      groupBy = 'day'
    } = options;

    const params = new URLSearchParams({
      includeDetailedStats: includeDetailedStats.toString(),
      period,
      includeTrends: includeTrends.toString(),
      groupBy
    });

    const response = await fetch(
      `${this.baseUrl}/api/account/api-keys/usage/summary?${params}`,
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
const analytics = new AccountAnalytics('your-api-key', 'https://instrada-ogm.example.com');

// Get activity statistics
const activityStats = await analytics.getActivityStatistics(30, true);
console.log('Activity Statistics:', activityStats);

// Get recent activities with pagination
const recentActivities = await analytics.getRecentActivities({
  limit: 10,
  period: 7,
  activityType: 'group'
});
console.log('Recent Activities:', recentActivities);

// Get session analytics with events
const sessionAnalytics = await analytics.getSessionAnalytics(7, true);
console.log('Session Analytics:', sessionAnalytics);

// Get detailed API key usage summary
const apiKeySummary = await analytics.getApiKeyUsageSummary({
  includeDetailedStats: true,
  includeTrends: true,
  groupBy: 'endpoint'
});
console.log('API Key Summary:', apiKeySummary);
```

**Python Client Example**:
```python
import requests
from typing import Optional, Dict, Any
from urllib.parse import urlencode

class AccountAnalytics:
    def __init__(self, api_key: str, base_url: str):
        self.api_key = api_key
        self.base_url = base_url
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }

    def get_activity_statistics(self, period: str = '30', include_details: bool = False) -> Dict[str, Any]:
        params = {
            'period': period,
            'includeDetails': str(include_details).lower()
        }
        
        response = requests.get(
            f'{self.base_url}/api/account/activity-statistics',
            headers=self.headers,
            params=params
        )
        
        response.raise_for_status()
        return response.json()

    def get_recent_activities(self, limit: int = 20, offset: int = 0, 
                           period: str = '30', activity_type: Optional[str] = None,
                           include_details: bool = True) -> Dict[str, Any]:
        params = {
            'limit': limit,
            'offset': offset,
            'period': period,
            'includeDetails': str(include_details).lower()
        }
        
        if activity_type:
            params['activityType'] = activity_type
        
        response = requests.get(
            f'{self.base_url}/api/account/recent-activities',
            headers=self.headers,
            params=params
        )
        
        response.raise_for_status()
        return response.json()

    def get_session_analytics(self, days: int = 30, include_events: bool = False,
                           group_by: str = 'day') -> Dict[str, Any]:
        params = {
            'days': days,
            'includeEvents': str(include_events).lower(),
            'groupBy': group_by
        }
        
        response = requests.get(
            f'{self.base_url}/api/account/sessions/analytics',
            headers=self.headers,
            params=params
        )
        
        response.raise_for_status()
        return response.json()

    def get_api_key_usage_summary(self, include_detailed_stats: bool = False,
                                period: str = '30', include_trends: bool = False,
                                group_by: str = 'day') -> Dict[str, Any]:
        params = {
            'includeDetailedStats': str(include_detailed_stats).lower(),
            'period': period,
            'includeTrends': str(include_trends).lower(),
            'groupBy': group_by
        }
        
        response = requests.get(
            f'{self.base_url}/api/account/api-keys/usage/summary',
            headers=self.headers,
            params=params
        )
        
        response.raise_for_status()
        return response.json()

# Usage example
analytics = AccountAnalytics('your-api-key', 'https://instrada-ogm.example.com')

# Get activity statistics
activity_stats = analytics.get_activity_statistics('30', True)
print('Activity Statistics:', activity_stats)

# Get recent activities
recent_activities = analytics.get_recent_activities(
    limit=10, 
    period='7', 
    activity_type='group'
)
print('Recent Activities:', recent_activities)

# Get session analytics
session_analytics = analytics.get_session_analytics(7, True)
print('Session Analytics:', session_analytics)

# Get API key usage summary
api_key_summary = analytics.get_api_key_usage_summary(
    include_detailed_stats=True,
    include_trends=True,
    group_by='endpoint'
)
print('API Key Summary:', api_key_summary)
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