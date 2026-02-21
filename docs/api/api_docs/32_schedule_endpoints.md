# Schedule System Endpoints

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
curl -X GET "${SERVER_URL}/api/admin/schedules" \
  -H "Authorization: Bearer ${API_KEY}"
```

This section covers the administrative endpoints for the Schedule System, allowing the creation and management of scheduled network group assignments.

## Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ❌ Cannot access any schedule endpoints (returns "Unauthorized")
- **ADMIN**: ✅ Can access all schedule endpoints
- **SUPER_ADMIN**: ✅ Can access all schedule endpoints

---

### POST /api/admin/schedules

**Description**: Create a new schedule. Triggers timer re-arm on the background engine upon success.

**Role Access**: ADMIN, SUPER_ADMIN

#### Usage Case 1: Create a Weekly Schedule

**Example Request**:
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
    "targetSelector": { "hostAliasUuids": ["uuid-1234"] },
    "days": [{
      "dayOfWeek": 1,
      "windows": [{
        "startTime": "21:00",
        "endTime": "23:59",
        "label": "Bedtime block",
        "actions": [
          { "operation": "REMOVE", "boundaryType": "START", "targetGroupUuid": "opn-uuid-internet", "sortOrder": 0 },
          { "operation": "ASSIGN", "boundaryType": "END", "targetGroupUuid": "opn-uuid-internet", "sortOrder": 0 }
        ]
      }]
    }]
  }'
```

**Success Response**:
```json
{
  "id": "cuid-schedule-1",
  "name": "Kids Bedtime",
  "enabled": true
}
```

**Error Cases**:
- `400 Bad Request` if invalid `scheduleType` combination or timezone.
- `401 Unauthorized` / `403 Forbidden` if missing or incorrect role permissions.

---

### GET /api/admin/schedules

**Description**: Retrieve a list of schedules.

**Role Access**: ADMIN, SUPER_ADMIN

**Query Parameters**:
- `enabled` (optional): Filter by boolean status
- `scheduleType` (optional): Filter by schedule type (COMPLEX_WEEKLY, ONCE, RECURRING)

#### Usage Case 1: List Filtered Schedules

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/schedules?scheduleType=COMPLEX_WEEKLY" \
  -H "Authorization: Bearer {{API_KEY}}"
```

**Success Response**:
```json
[
  {
    "id": "cuid-schedule-1",
    "name": "Kids Bedtime",
    "scheduleType": "COMPLEX_WEEKLY",
    "enabled": true,
    "targetType": "HOST_ALIAS",
    "priority": 10,
    "timezone": "Europe/London"
  }
]
```

---

### GET /api/admin/schedules/[id]

**Description**: Retrieve full details of a single schedule, including nested days, windows, and standalone actions.

**Role Access**: ADMIN, SUPER_ADMIN

#### Usage Case 1: Fetch Schedule Details

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/schedules/cuid-schedule-1" \
  -H "Authorization: Bearer {{API_KEY}}"
```

**Success Response**: *(Full schedule object payload)*

**Error Cases**:
- `404 Not Found` if schedule does not exist.

---

### PUT /api/admin/schedules/[id]

**Description**: Perform a complete replacement update of a schedule in a transaction. Triggers a timer re-arm.

**Role Access**: ADMIN, SUPER_ADMIN

**Example Request**:
```bash
curl -X PUT "{{SERVER_URL}}/api/admin/schedules/cuid-schedule-1" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{ ... full schedule object ... }'
```

---

### DELETE /api/admin/schedules/[id]

**Description**: Delete a schedule and automatically cascade deletion of all child days, windows, actions, and execution histories.

**Role Access**: ADMIN, SUPER_ADMIN

**Example Request**:
```bash
curl -X DELETE "{{SERVER_URL}}/api/admin/schedules/cuid-schedule-1" \
  -H "Authorization: Bearer {{API_KEY}}"
```

---

### POST /api/admin/schedules/[id]/toggle

**Description**: Toggle schedule enabled status quickly.

**Role Access**: ADMIN, SUPER_ADMIN

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/admin/schedules/cuid-schedule-1/toggle" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

---

### GET /api/admin/schedules/[id]/executions

**Description**: Paginated execution history for a schedule.

**Role Access**: ADMIN, SUPER_ADMIN

**Query Parameters**:
- `page` (optional): Default `1`
- `limit` (optional): Default `20`
- `status` (optional): Filter history by status (`SUCCESS`, `PARTIAL`, `FAILED`, `SKIPPED`)

#### Usage Case 1: Fetch Executions

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/schedules/cuid-schedule-1/executions?status=SUCCESS&limit=5" \
  -H "Authorization: Bearer {{API_KEY}}"
```

**Success Response**:
```json
{
  "executions": [
    {
      "id": "cuid-exec-1",
      "boundaryType": "START",
      "status": "SUCCESS",
      "executedAt": "2026-02-14T21:00:00.000Z",
      "targetIps": ["192.168.1.50"],
      "actionsRun": [...]
    }
  ],
  "pagination": { "page": 1, "limit": 5, "total": 12 }
}
```

---

### POST /api/admin/schedules/preview

**Description**: Dry-run simulation. Validates target resolutions and simulated boundaries firing without applying the modifications to the database or OPNsense node.

**Role Access**: ADMIN, SUPER_ADMIN

**Query Parameters**:
- `at` (required): ISO8601 simulated datetime

#### Usage Case 1: Preview boundary state

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/admin/schedules/preview?at=2026-02-14T21:00:00Z" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{ ... full schedule object body ... }'
```

**Success Response**:
```json
{
  "simulatedAt": "2026-02-14T21:00:00Z",
  "resolvedTargets": ["192.168.1.50"],
  "boundariesFiring": [
    {
      "windowLabel": "Bedtime block",
      "boundaryType": "START",
      "actions": [
        { "operation": "REMOVE", "targetGroupUuid": "opn-uuid-internet" }
      ]
    }
  ]
}
```

---

## Constants and Schemas

### targetSelector Shape Table

| Type | `targetSelector` Payload Shape | Resolution |
|------|-------------------------------|------------|
| `IP_LIST` | `{ "ips": ["192.168.1.100", "192.168.1.101"] }` | Direct execution |
| `HOST_ALIAS` | `{ "hostAliasUuids": ["uuid-1", "uuid-2"] }` | Resolves target alias IPs from OPNsense |
| `NETWORK_GROUP` | `{ "networkGroupUuid": "uuid" }` | Uses current active IP members within group |

### Supported Action Operations

| Operation | Constraints | Description |
|-----------|-------------|-------------|
| `ASSIGN` | requires `targetGroupUuid` | Assign resolved IPs to group |
| `REMOVE` | requires `targetGroupUuid` | Remove resolved IPs from group |
| `MOVE` | requires `targetGroupUuid` AND `fromGroupUuid` | Removes IPs from source, appends to target |
| `CLEAR_ALL`| -- | Removes IPs from all documented OPNsense groups |

### Audit Log Tracking
Using the `AuditLog` structure, actions generate these respective tracking actions:
- `SCHEDULE_CREATED`
- `SCHEDULE_UPDATED`
- `SCHEDULE_DELETED`
- `SCHEDULE_ENABLED`
- `SCHEDULE_DISABLED`
