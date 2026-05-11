# Network Alias Analytics Endpoints

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
curl -X GET "{{SERVER_URL}}/api/analytics/network-alias-group-history?aliasUuid=..." \
  -H "Authorization: Bearer {{API_KEY}}"
```

This section covers analytics and audit logging endpoints for network alias assignment history and analytics dashboards.

## Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **Unauthenticated**: ❌ Authentication required for all endpoints
- **USER**: ❌ Insufficient permissions for all endpoints
- **ADMIN**: ✅ Full access to all network alias analytics
- **SUPER_ADMIN**: ✅ Full access to all network alias analytics

**Role Access:**
- **Unauthenticated**: ❌ Authentication required - Must provide valid session or API key
- **USER**: ❌ Insufficient permissions - Requires ADMIN or SUPER_ADMIN role
- **ADMIN**: ✅ Can view network alias assignment history and analytics
- **SUPER_ADMIN**: ✅ Can view network alias assignment history and analytics

**Example Responses:**

**ADMIN/SUPER_ADMIN Success:**
```json
{
  "success": true,
  "data": [
    {
      "id": "log-id-1",
      "timestamp": "2026-03-01T08:00:00.000Z",
      "action": "NETWORK_ALIAS_GROUP_ASSIGN_SUCCESS",
      "change": 1,
      "groupCount": 1
    }
  ]
}
```

**USER Role Error:**
```json
{
  "error": "Forbidden"
}
```

**Unauthenticated Error:**
```json
{
  "error": "Forbidden"
}
```

## Rate Limiting

**Rate Limit Strategy:** User-based

**Default Rate Limits:**
- **Authenticated Endpoints**: 1000 requests per hour
- **API Key Endpoints**: Configurable per key (default: 1000/hour)

---

## Endpoints

### GET /api/analytics/network-alias-group-history

**Description**: Retrieve the complete group assignment history for a network alias, showing all moves, assignments, and unassignments over time.

**Authentication**: Required

**Role Access:**
- **Unauthenticated**: ❌ Authentication required
- **USER**: ❌ Insufficient permissions - Requires ADMIN or SUPER_ADMIN role
- **ADMIN**: ✅ Can view network alias assignment history
- **SUPER_ADMIN**: ✅ Can view network alias assignment history

**Feature Toggle**: Required - `manageNetworkAliasesEnabled` must be true

#### Request

```bash
# By alias UUID
curl -X GET "{{SERVER_URL}}/api/analytics/network-alias-group-history?aliasUuid=a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c" \
  -H "Authorization: Bearer {{API_KEY}}"
```

```bash
# By alias name
curl -X GET "{{SERVER_URL}}/api/analytics/network-alias-group-history?aliasName=Office_Networks" \
  -H "Authorization: Bearer {{API_KEY}}"
```

```bash
# With current group context (for accurate history)
curl -X GET "{{SERVER_URL}}/api/analytics/network-alias-group-history?aliasUuid=a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c&currentGroups=%5B%7B%22uuid%22%3A%22group-1%22%2C%22name%22%3A%22office_access%22%7D%5D" \
  -H "Authorization: Bearer {{API_KEY}}"
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `aliasUuid` | string | One of | UUID of the network alias |
| `aliasName` | string | One of | Name of the network alias |
| `currentGroups` | JSON array | No | JSON-encoded array of current group assignments for context |

> **Note**: Either `aliasUuid` or `aliasName` must be provided. If both are provided, `aliasUuid` takes precedence.

#### currentGroups Parameter Format

```javascript
// URL-encoded JSON array of current groups
const currentGroups = [
  {
    "uuid": "group-uuid-1",
    "name": "office_access",
    "friendlyName": "Office Access"  // optional
  },
  {
    "uuid": "group-uuid-2",
    "name": "vpn_routing_group",
    "friendlyName": "VPN Routing"
  }
];

const encoded = encodeURIComponent(JSON.stringify(currentGroups));
const url = `?aliasUuid=xxx&currentGroups=${encoded}`;
```

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": "log-id-1",
      "timestamp": "2026-03-01T08:00:00.000Z",
      "action": "NETWORK_ALIAS_GROUP_ASSIGN_SUCCESS",
      "change": 1,
      "groupCount": 1,
      "currentGroupNames": ["Office Access"],
      "details": {
        "groupName": "Office Access",
        "targetGroup": "Office Access",
        "user": "admin_user",
        "removedGroups": 0,
        "originalAction": "NETWORK_ALIAS_GROUP_ASSIGN_SUCCESS"
      }
    },
    {
      "id": "log-id-2",
      "timestamp": "2026-03-05T10:30:00.000Z",
      "action": "NETWORK_ALIAS_GROUP_ASSIGN_MOVE",
      "change": 1,
      "groupCount": 1,
      "currentGroupNames": ["Lab Access"],
      "details": {
        "groupName": "Lab Access",
        "targetGroup": "Lab Access",
        "user": "admin_user",
        "removedGroups": 1,
        "originalAction": "NETWORK_ALIAS_GROUP_ASSIGN_MOVE",
        "moveOperation": {
          "isMove": true,
          "sourceGroups": ["Office Access"],
          "targetGroup": "Lab Access"
        }
      }
    },
    {
      "id": "log-id-3",
      "timestamp": "2026-03-10T14:15:00.000Z",
      "action": "NETWORK_ALIAS_GROUP_UNASSIGN_SUCCESS",
      "change": -1,
      "groupCount": 0,
      "currentGroupNames": [],
      "details": {
        "groupName": "Lab Access",
        "targetGroup": null,
        "user": "admin_user",
        "removedGroups": 0,
        "originalAction": "NETWORK_ALIAS_GROUP_UNASSIGN_SUCCESS"
      }
    }
  ],
  "historyIncomplete": false,
  "incompleteReason": ""
}
```

#### Response Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether the request succeeded |
| `data` | array | Array of history events |
| `data[].id` | string | Unique audit log ID |
| `data[].timestamp` | string | ISO 8601 timestamp of the event |
| `data[].action` | string | Audit action type (e.g., `NETWORK_ALIAS_GROUP_ASSIGN_SUCCESS`) |
| `data[].change` | number | Change indicator: `1` for assignment, `-1` for unassignment |
| `data[].groupCount` | number | Number of groups alias is member of after this event |
| `data[].currentGroupNames` | array | Array of current group names at this point |
| `data[].details.groupName` | string | Name of the affected group |
| `data[].details.targetGroup` | string\|null | Group assigned to, or `null` for unassignment |
| `data[].details.user` | string | User who performed the operation |
| `data[].details.removedGroups` | number | Number of groups removed during move |
| `data[].details.moveOperation` | object | Details if this was a move operation |

#### Event Types

**Assignment Event**:
```json
{
  "action": "NETWORK_ALIAS_GROUP_ASSIGN_SUCCESS",
  "change": 1,
  "details": {
    "targetGroup": "Office Access",
    "moveOperation": null
  }
}
```

**Move Event** (assignment that removed from other groups):
```json
{
  "action": "NETWORK_ALIAS_GROUP_ASSIGN_MOVE",
  "change": 1,
  "details": {
    "targetGroup": "Lab Access",
    "moveOperation": {
      "isMove": true,
      "sourceGroups": ["Office Access", "Guest Access"],
      "targetGroup": "Lab Access"
    }
  }
}
```

**Unassignment Event**:
```json
{
  "action": "NETWORK_ALIAS_GROUP_UNASSIGN_SUCCESS",
  "change": -1,
  "details": {
    "targetGroup": null,
    "moveOperation": null
  }
}
```

#### Error Responses

**400 Bad Request - Missing Parameters**
```json
{
  "success": false,
  "message": "aliasUuid or aliasName is required"
}
```

**403 Forbidden - Feature Disabled**
```json
{
  "error": "Feature disabled"
}
```

**500 Internal Server Error**
```json
{
  "success": false,
  "message": "Failed to fetch network alias group history"
}
```

#### Special Cases

**No History Available**:
```json
{
  "success": true,
  "data": [],
  "historyIncomplete": false,
  "incompleteReason": ""
}
```

#### Integration Example: Visualizing History Timeline

```javascript
async function loadNetworkAliasTimeline(aliasUuid, currentGroups = []) {
  const params = new URLSearchParams({
    aliasUuid,
    ...(currentGroups.length > 0 && {
      currentGroups: JSON.stringify(currentGroups)
    })
  });

  const response = await fetch(`/api/analytics/network-alias-group-history?${params}`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });

  if (!response.ok) {
    throw new Error('Failed to load history');
  }

  const result = await response.json();

  // Build timeline HTML
  const timeline = result.data.map(event => ({
    date: new Date(event.timestamp),
    type: event.change > 0 ? 'assigned' : 'unassigned',
    groupName: event.details.targetGroup || event.details.groupName,
    user: event.details.user,
    isMoveOperation: event.details.moveOperation?.isMove || false,
    sourceGroups: event.details.moveOperation?.sourceGroups || []
  }));

  return timeline;
}
```

---

### GET /api/admin/audit-logs/analytics/network-aliases

**Description**: Retrieve analytics on network alias change activity within a specified time period. Useful for dashboards and change tracking reports.

**Authentication**: Required

**Role Access:**
- **Unauthenticated**: ❌ Authentication required
- **USER**: ❌ Insufficient permissions - Requires ADMIN or SUPER_ADMIN role
- **ADMIN**: ✅ Can view network alias analytics and audit data
- **SUPER_ADMIN**: ✅ Can view network alias analytics and audit data

**Feature Toggle**: Required - `manageNetworkAliasesEnabled` must be true

#### Request

```bash
# Last 30 days (default)
curl -X GET "{{SERVER_URL}}/api/admin/audit-logs/analytics/network-aliases" \
  -H "Authorization: Bearer {{API_KEY}}"
```

```bash
# Specific time range
curl -X GET "{{SERVER_URL}}/api/admin/audit-logs/analytics/network-aliases?startDate=2026-03-01T00:00:00Z&endDate=2026-03-31T23:59:59Z" \
  -H "Authorization: Bearer {{API_KEY}}"
```

```bash
# Last 7 days
curl -X GET "{{SERVER_URL}}/api/admin/audit-logs/analytics/network-aliases?days=7" \
  -H "Authorization: Bearer {{API_KEY}}"
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startDate` | ISO 8601 string | No | Start date for analytics (e.g., `2026-03-01T00:00:00Z`) |
| `endDate` | ISO 8601 string | No | End date for analytics (e.g., `2026-03-31T23:59:59Z`) |
| `days` | integer | No | Alternative to date range; analyze last N days (default: `30`) |

#### Date Handling

- If `startDate` and `endDate` are provided together, they take precedence over `days`
- If neither date range nor `days` is provided, defaults to last 30 days
- `endDate` with time 00:00:00 is automatically adjusted to 23:59:59 of that day
- Times are in UTC

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "totalOperations": 45,
    "assignmentOperations": 18,
    "unassignmentOperations": 12,
    "moveOperations": 8,
    "createOperations": 5,
    "updateOperations": 2,
    "deleteOperations": 0,
    "byUser": [
      {
        "userId": "user-id-1",
        "userName": "admin_user",
        "email": "admin@example.com",
        "operationCount": 28,
        "operations": {
          "assignments": 12,
          "unassignments": 8,
          "moves": 5,
          "creates": 2,
          "updates": 1,
          "deletes": 0
        }
      },
      {
        "userId": "user-id-2",
        "userName": "network_admin",
        "email": "network@example.com",
        "operationCount": 17,
        "operations": {
          "assignments": 6,
          "unassignments": 4,
          "moves": 3,
          "creates": 3,
          "updates": 1,
          "deletes": 0
        }
      }
    ],
    "byAlias": [
      {
        "aliasUuid": "alias-uuid-1",
        "aliasName": "Office_Networks",
        "operationCount": 15,
        "lastOperation": "2026-03-15T14:30:00.000Z",
        "lastOperationType": "assign"
      },
      {
        "aliasUuid": "alias-uuid-2",
        "aliasName": "Lab_Networks",
        "operationCount": 12,
        "lastOperation": "2026-03-14T10:15:00.000Z",
        "lastOperationType": "unassign"
      }
    ],
    "byGroup": [
      {
        "groupUuid": "group-uuid-1",
        "groupName": "office_access",
        "operationCount": 10,
        "aliasesInGroup": 2
      }
    ]
  },
  "meta": {
    "startDate": "2026-02-14T00:00:00.000Z",
    "endDate": "2026-03-15T23:59:59.999Z",
    "days": 30
  }
}
```

#### Response Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether the request succeeded |
| `data.totalOperations` | number | Total network alias operations in period |
| `data.assignmentOperations` | number | Total direct assignments |
| `data.unassignmentOperations` | number | Total unassignments |
| `data.moveOperations` | number | Total assignments that involved moves |
| `data.createOperations` | number | Total alias creations |
| `data.updateOperations` | number | Total alias updates |
| `data.deleteOperations` | number | Total alias deletions |
| `data.byUser[]` | array | Breakdown by user |
| `data.byAlias[]` | array | Breakdown by alias |
| `data.byGroup[]` | array | Breakdown by group |
| `meta.startDate` | string | Actual start date used |
| `meta.endDate` | string | Actual end date used |
| `meta.days` | number | Number of days analyzed |

#### Error Responses

**400 Bad Request - Invalid Date Format**
```json
{
  "success": false,
  "message": "Invalid date format. Use ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)"
}
```

**403 Forbidden - Feature Disabled**
```json
{
  "error": "Feature disabled",
  "code": "NETWORK_ALIAS_MANAGEMENT_DISABLED"
}
```

**403 Forbidden - Insufficient Permissions**
```json
{
  "success": false,
  "message": "Admin access required"
}
```

**500 Internal Server Error**
```json
{
  "success": false,
  "message": "Failed to fetch network alias change analytics"
}
```

#### Use Cases

**Dashboard Analytics**:
```javascript
// Get last 7 days of activity for dashboard display
const analytics = await fetch('/api/admin/audit-logs/analytics/network-aliases?days=7', {
  headers: { 'Authorization': `Bearer ${API_KEY}` }
}).then(r => r.json());

// Display operation breakdown
console.log(`This week: ${analytics.data.totalOperations} operations`);
console.log(`Assignments: ${analytics.data.assignmentOperations}`);
console.log(`Moves: ${analytics.data.moveOperations}`);
```

**Custom Time Range Report**:
```javascript
async function generateMonthlyReport(year, month) {
  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

  const response = await fetch(
    `/api/admin/audit-logs/analytics/network-aliases?startDate=${startDate}&endDate=${endDate}`,
    { headers: { 'Authorization': `Bearer ${API_KEY}` } }
  );

  return response.json();
}

const report = await generateMonthlyReport(2026, 3);
console.log('March 2026 Network Alias Operations:');
report.data.byUser.forEach(user => {
  console.log(`${user.userName}: ${user.operationCount} operations`);
});
```

**Audit Trail Export**:
```javascript
async function exportNetworkAliasAudit(days = 90) {
  const analytics = await fetch(`/api/admin/audit-logs/analytics/network-aliases?days=${days}`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  }).then(r => r.json());

  // Convert to CSV format
  const csv = [
    ['User', 'Email', 'Operation Count', 'Assignments', 'Unassignments', 'Moves'],
    ...analytics.data.byUser.map(u => [
      u.userName,
      u.email,
      u.operationCount,
      u.operations.assignments,
      u.operations.unassignments,
      u.operations.moves
    ])
  ].map(row => row.join(',')).join('\n');

  return csv;
}
```

---

## Complete Example: Network Alias Activity Dashboard

```javascript
class NetworkAliasAnalytics {
  constructor(apiKey, serverUrl) {
    this.apiKey = apiKey;
    this.serverUrl = serverUrl;
  }

  private async fetch(path, params = {}) {
    const query = new URLSearchParams(params);
    const response = await fetch(`${this.serverUrl}${path}?${query}`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    return response.json();
  }

  // Get overall activity metrics
  async getActivityMetrics(days = 30) {
    return this.fetch('/api/admin/audit-logs/analytics/network-aliases', { days });
  }

  // Get alias-specific history
  async getAliasHistory(aliasUuid) {
    return this.fetch('/api/analytics/network-alias-group-history', { aliasUuid });
  }

  // Get user activity
  async getUserActivity(userId, days = 30) {
    const analytics = await this.getActivityMetrics(days);
    return analytics.data.byUser.find(u => u.userId === userId);
  }

  // Generate dashboard data
  async getDashboardData() {
    const metrics = await this.getActivityMetrics(7);  // Last 7 days
    
    return {
      summary: {
        totalOps: metrics.data.totalOperations,
        assignments: metrics.data.assignmentOperations,
        moves: metrics.data.moveOperations,
        topUsers: metrics.data.byUser.slice(0, 5),
        activeAliases: metrics.data.byAlias.slice(0, 10)
      },
      period: {
        start: metrics.meta.startDate,
        end: metrics.meta.endDate
      }
    };
  }
}

// Usage
const analytics = new NetworkAliasAnalytics(API_KEY, 'https://instrada-ogm.example.com');
const dashboard = await analytics.getDashboardData();
console.log(dashboard);
```

---

## Related Documentation

- [Network Alias Endpoints](33_network_alias_endpoints.md)
- [Network Alias Management Feature Guide](../../FEATURES/NETWORK_ALIAS_MANAGEMENT.md)
- [Audit Log Management Endpoints](25_audit_log_management_endpoints.md)
- [Account Analytics Endpoints](20_account_analytics_endpoints.md)
