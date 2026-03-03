# Schedule System Endpoints

[⬆️ Back to API Index](API_Index.md) | [📚 Back to Documentation Home](../../DOCUMENTATION_INDEX.md)

## Variables

Replace the following variables in the examples below:

- `{{SERVER_URL}}` - Your server URL (e.g., `https://instrada-ogm.example.com`)
- `{{API_KEY}}` - Your API key for authentication

**Example:**
```bash
SERVER_URL="https://instrada-ogm.example.com"
API_KEY="your-api-key-here"

curl -X GET "${SERVER_URL}/api/admin/schedules" \
  -H "Authorization: Bearer ${API_KEY}"
```

This section covers the administrative endpoints for the Schedule System — creating and managing scheduled network group assignments for OPNsense host aliases.

For a conceptual overview of how scheduling works, see [Scheduled Assignments](../../FEATURES/SCHEDULED_ASSIGNMENTS.md).

## Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access any schedule endpoints (returns `401 Unauthorized`)
- **ADMIN**: ✅ Full access to all schedule endpoints
- **SUPER_ADMIN**: ✅ Full access to all schedule endpoints

---

## Endpoints

### POST /api/admin/schedules

**Description**: Create a new schedule. Triggers an immediate timer re-arm on the background execution engine so the schedule takes effect without waiting for the next reconciliation sweep.

**Role Access**: ADMIN, SUPER_ADMIN

#### Usage Case 1: Create a Complex Weekly Schedule

```bash
curl -X POST "{{SERVER_URL}}/api/admin/schedules" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kids Bedtime",
    "description": "Block internet after 9 PM on school nights",
    "enabled": true,
    "priority": 10,
    "scheduleType": "COMPLEX_WEEKLY",
    "timezone": "Europe/London",
    "targetType": "HOST_ALIAS",
    "targetSelector": { "hostAliasUuids": ["<alias-uuid>"] },
    "days": [{
      "dayOfWeek": 1,
      "windows": [{
        "startTime": "21:00",
        "endTime": "07:00",
        "label": "Bedtime block",
        "actions": [
          { "operation": "UNASSIGN", "boundaryType": "START", "targetGroupUuid": "<group-uuid>", "sortOrder": 0 },
          { "operation": "ASSIGN",   "boundaryType": "END",   "targetGroupUuid": "<group-uuid>", "sortOrder": 0 }
        ]
      }]
    }]
  }'
```

**Success Response** `200 OK`:
```json
{
  "id": "cuid-schedule-1",
  "name": "Kids Bedtime",
  "enabled": true,
  "scheduleType": "COMPLEX_WEEKLY",
  "priority": 10,
  "timezone": "Europe/London",
  "targetType": "HOST_ALIAS",
  "createdAt": "2026-03-03T10:00:00.000Z",
  "updatedAt": "2026-03-03T10:00:00.000Z"
}
```

**Error Cases**:
- `400 Bad Request` — validation failure (invalid timezone, missing required fields for the chosen `scheduleType`, `startTime` not before `endTime`, etc.)
- `401 Unauthorized` / `403 Forbidden` — missing or insufficient permissions

---

#### Usage Case 2: Create a Once (One-Off) Schedule

```bash
curl -X POST "{{SERVER_URL}}/api/admin/schedules" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Exam Day Block",
    "enabled": true,
    "priority": 5,
    "scheduleType": "ONCE",
    "timezone": "Europe/London",
    "targetType": "HOST_ALIAS",
    "targetSelector": { "hostAliasUuids": ["<alias-uuid>"] },
    "executeAt": "2026-06-01T09:00:00Z",
    "onceActions": [
      { "operation": "UNASSIGN", "targetGroupUuid": "<group-uuid>", "sortOrder": 0 }
    ]
  }'
```

> Once schedules automatically set `enabled: false` in the database after their actions execute, preventing re-execution on subsequent reconciliation sweeps.

---

#### Usage Case 3: Create a Recurring Schedule

```bash
curl -X POST "{{SERVER_URL}}/api/admin/schedules" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Weekend VPN",
    "enabled": true,
    "priority": 0,
    "scheduleType": "RECURRING",
    "timezone": "Europe/London",
    "targetType": "HOST_ALIAS",
    "targetSelector": { "hostAliasUuids": ["<alias-uuid>"] },
    "cronExpression": "0 17 * * 5",
    "recurringActions": [
      { "operation": "ASSIGN", "targetGroupUuid": "<group-uuid>", "sortOrder": 0 }
    ]
  }'
```

---

### GET /api/admin/schedules

**Description**: List all schedules ordered by priority descending, then name ascending. Includes an execution count per schedule.

**Role Access**: ADMIN, SUPER_ADMIN

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `enabled` | boolean | Filter by enabled status (`true` or `false`) |
| `scheduleType` | string | Filter by type: `COMPLEX_WEEKLY`, `ONCE`, or `RECURRING` |

#### Usage Case 1: List All Enabled Recurring Schedules

```bash
curl -X GET "{{SERVER_URL}}/api/admin/schedules?enabled=true&scheduleType=RECURRING" \
  -H "Authorization: Bearer {{API_KEY}}"
```

**Success Response** `200 OK`:
```json
[
  {
    "id": "cuid-schedule-1",
    "name": "Weekend VPN",
    "scheduleType": "RECURRING",
    "enabled": true,
    "priority": 0,
    "timezone": "Europe/London",
    "targetType": "HOST_ALIAS",
    "cronExpression": "0 17 * * 5",
    "lastExecutedAt": "2026-02-28T17:00:00.000Z",
    "_count": { "executions": 4 }
  }
]
```

---

### GET /api/admin/schedules/:id

**Description**: Retrieve full details of a single schedule including nested days, time windows, and all actions.

**Role Access**: ADMIN, SUPER_ADMIN

```bash
curl -X GET "{{SERVER_URL}}/api/admin/schedules/cuid-schedule-1" \
  -H "Authorization: Bearer {{API_KEY}}"
```

**Error Cases**:
- `404 Not Found` — schedule does not exist

---

### PUT /api/admin/schedules/:id

**Description**: Fully replace a schedule's configuration in a single database transaction. All existing days, windows, and actions are deleted and recreated from the request body. Triggers an immediate timer re-arm.

**Role Access**: ADMIN, SUPER_ADMIN

```bash
curl -X PUT "{{SERVER_URL}}/api/admin/schedules/cuid-schedule-1" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{ ... full schedule definition ... }'
```

**Error Cases**:
- `400 Bad Request` — validation failure
- `404 Not Found` — schedule does not exist

---

### DELETE /api/admin/schedules/:id

**Description**: Delete a schedule. Cascades to all child days, windows, actions, and execution history records.

**Role Access**: ADMIN, SUPER_ADMIN

```bash
curl -X DELETE "{{SERVER_URL}}/api/admin/schedules/cuid-schedule-1" \
  -H "Authorization: Bearer {{API_KEY}}"
```

**Success Response** `200 OK`:
```json
{ "message": "Schedule deleted" }
```

---

### POST /api/admin/schedules/:id/toggle

**Description**: Enable or disable a schedule. Triggers an immediate timer re-arm so the change takes effect without waiting for the next reconciliation sweep.

**Role Access**: ADMIN, SUPER_ADMIN

```bash
curl -X POST "{{SERVER_URL}}/api/admin/schedules/cuid-schedule-1/toggle" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{ "enabled": false }'
```

**Request Body**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `enabled` | boolean | Yes | New enabled state |

**Success Response** `200 OK`: Full updated schedule object.

---

### GET /api/admin/schedules/:id/executions

**Description**: Paginated execution history for a schedule, ordered by most recent first.

**Role Access**: ADMIN, SUPER_ADMIN

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | `1` | Page number |
| `limit` | integer | `20` | Results per page (max `100`) |
| `status` | string | — | Filter by status: `SUCCESS`, `PARTIAL`, `FAILED`, or `SKIPPED` |

```bash
curl -X GET "{{SERVER_URL}}/api/admin/schedules/cuid-schedule-1/executions?status=PARTIAL&limit=10" \
  -H "Authorization: Bearer {{API_KEY}}"
```

**Success Response** `200 OK`:
```json
{
  "executions": [
    {
      "id": "cuid-exec-1",
      "scheduleId": "cuid-schedule-1",
      "boundaryType": "START",
      "executedAt": "2026-03-03T21:00:00.000Z",
      "status": "PARTIAL",
      "durationMs": 342,
      "targetIps": ["192.168.1.50", "192.168.1.51"],
      "actionsRun": [
        { "operation": "UNASSIGN", "targetGroupUuid": "<group-uuid>", "ip": "192.168.1.50", "success": true },
        { "operation": "UNASSIGN", "targetGroupUuid": "<group-uuid>", "ip": "192.168.1.51", "success": false, "error": "OPNsense API timeout" }
      ],
      "errorMessage": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalCount": 1,
    "totalPages": 1
  }
}
```

**Error Cases**:
- `404 Not Found` — schedule does not exist

---

### POST /api/admin/schedules/preview

**Description**: Dry-run simulation. Validates which boundaries and actions would fire at a given date/time without writing to the database or calling OPNsense.

Uses `POST` (not `GET`) because the request body contains the full schedule definition, which can be large.

**Role Access**: ADMIN, SUPER_ADMIN

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `at` | string | Yes | ISO 8601 datetime to simulate against (e.g. `2026-03-03T21:00:00Z`) |

```bash
curl -X POST "{{SERVER_URL}}/api/admin/schedules/preview?at=2026-03-03T21:00:00Z" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kids Bedtime",
    "scheduleType": "COMPLEX_WEEKLY",
    "timezone": "Europe/London",
    "targetType": "HOST_ALIAS",
    "targetSelector": { "hostAliasUuids": ["<alias-uuid>"] },
    "days": [{
      "dayOfWeek": 1,
      "windows": [{
        "startTime": "21:00",
        "endTime": "07:00",
        "label": "Bedtime block",
        "actions": [
          { "operation": "UNASSIGN", "boundaryType": "START", "targetGroupUuid": "<group-uuid>", "sortOrder": 0 }
        ]
      }]
    }],
    "enabled": true,
    "priority": 10,
    "timezone": "Europe/London"
  }'
```

**Success Response** `200 OK`:
```json
{
  "simulatedAt": "2026-03-03T21:00:00.000Z",
  "resolvedTargets": [],
  "boundariesFiring": [
    {
      "windowLabel": "Bedtime block",
      "boundaryType": "START",
      "actions": [
        {
          "operation": "UNASSIGN",
          "targetGroupUuid": "<group-uuid>",
          "targetGroupName": "Internet - Full Access"
        }
      ]
    }
  ]
}
```

> `resolvedTargets` is populated for `IP_LIST` targets only. `HOST_ALIAS` and `NETWORK_GROUP` targets require live OPNsense queries; full resolution happens at execution time, not during preview.

**Error Cases**:
- `400 Bad Request` — missing or invalid `at` parameter, or invalid schedule body
- `404 Not Found` — referenced group UUIDs cannot be resolved (group name lookup only; non-fatal)

---

## Schema Reference

### Full Request Body

```jsonc
{
  // ── Common fields ────────────────────────────────────────────────────────────
  "name": "Kids Bedtime",            // required; max 100 chars
  "description": "...",              // optional; max 500 chars
  "enabled": true,
  "priority": 10,                    // integer 0–100; higher priority fires first when concurrent
  "scheduleType": "COMPLEX_WEEKLY",  // "COMPLEX_WEEKLY" | "ONCE" | "RECURRING"
  "timezone": "Europe/London",       // any IANA timezone identifier

  // ── Targeting ────────────────────────────────────────────────────────────────
  "targetType": "HOST_ALIAS",        // "HOST_ALIAS" | "IP_LIST" | "NETWORK_GROUP"
  "targetSelector": {
    // HOST_ALIAS  → { "hostAliasUuids": ["<uuid>", ...] }
    // IP_LIST     → { "ips": ["192.168.1.100", ...] }
    // NETWORK_GROUP → { "networkGroupUuid": "<uuid>" }
    "hostAliasUuids": ["<alias-uuid>"]
  },

  // ── COMPLEX_WEEKLY fields ─────────────────────────────────────────────────────
  "days": [
    {
      "dayOfWeek": 1,                // 0 = Sunday … 6 = Saturday
      "windows": [
        {
          "startTime": "21:00",      // HH:MM 24-hour; startTime must be before endTime
          "endTime": "07:00",
          "label": "Bedtime block",  // optional display label
          "actions": [
            {
              "operation": "UNASSIGN",  // "ASSIGN" | "UNASSIGN" | "CLEAR_ALL"
              "boundaryType": "START",  // "START" | "END"
              "targetGroupUuid": "<group-uuid>",  // required for ASSIGN and UNASSIGN
              "sortOrder": 0            // execution order within this boundary
            }
          ]
        }
      ]
    }
  ],

  // ── ONCE fields ───────────────────────────────────────────────────────────────
  "executeAt": "2026-06-01T09:00:00Z",  // ISO 8601 datetime
  "onceActions": [
    {
      "operation": "ASSIGN",
      "targetGroupUuid": "<group-uuid>",
      "sortOrder": 0
      // no "boundaryType" — once/recurring actions always fire as a single event
    }
  ],

  // ── RECURRING fields ──────────────────────────────────────────────────────────
  "cronExpression": "0 17 * * 5",    // standard 5-field cron expression
  "recurringActions": [
    { "operation": "ASSIGN", "targetGroupUuid": "<group-uuid>", "sortOrder": 0 }
  ]
}
```

---

### Supported Operations

| Operation | `targetGroupUuid` | Description |
|-----------|:-----------------:|-------------|
| `ASSIGN` | Required | Add the host alias to the specified group. Behaviour is group-type-aware — see below. |
| `UNASSIGN` | Required | Remove the host alias from the specified group. Silently skipped if the alias is not currently a member. |
| `CLEAR_ALL` | — | Remove the host alias from every OPNsense network group it currently belongs to. |

#### ASSIGN — Group-Type-Aware Behaviour

The ASSIGN operation mirrors the logic used in the self-service and device management pages:

| `enableGroupTypes` setting | Target group type | Behaviour |
|---------------------------|-------------------|-----------|
| Disabled (default) | Any | Evicts from **all** current groups, then assigns to target (move semantics). |
| Enabled | SingleSelect | Evicts from other SingleSelect groups (preserves MultiSelect memberships), then assigns. |
| Enabled | MultiSelect | Purely additive. If the alias is already a member of the target group, the action is silently skipped as a success no-op. |

---

### Target Selector Shapes

| `targetType` | `targetSelector` shape | Resolution at execution time | UI support |
|-------------|------------------------|------------------------------|------------|
| `HOST_ALIAS` | `{ "hostAliasUuids": ["<uuid>", ...] }` | Resolves current IPs from OPNsense | ✅ Only available option in UI |
| `IP_LIST` | `{ "ips": ["192.168.1.x", ...] }` | Used directly (static) | API only |
| `NETWORK_GROUP` | `{ "networkGroupUuid": "<uuid>" }` | Resolves current members of the group | API only |

---

### Execution Statuses

| Status | Meaning |
|--------|---------|
| `SUCCESS` | All actions on all resolved IPs completed without error. |
| `PARTIAL` | At least one action or IP succeeded; at least one failed. |
| `FAILED` | All actions failed, or OPNsense was unreachable after maximum retries. |
| `SKIPPED` | Execution was bypassed (e.g. schedule was disabled between the trigger check and execution). |

---

### Audit Log Events

Schedule operations generate the following audit log entries:

| Event | Trigger |
|-------|---------|
| `SCHEDULE_CREATED` | Successful `POST /api/admin/schedules` |
| `SCHEDULE_UPDATED` | Successful `PUT /api/admin/schedules/:id` |
| `SCHEDULE_DELETED` | Successful `DELETE /api/admin/schedules/:id` |
| `SCHEDULE_ENABLED` | Toggle sets `enabled: true` |
| `SCHEDULE_DISABLED` | Toggle sets `enabled: false` |

---

**Last Updated:** 2026-03-03 | **Category:** API Documentation
