# Scheduled Assignments

[⬆️ Back to Features Index](FEATURES_INDEX.md) | [📚 Back to Documentation Home](../DOCUMENTATION_INDEX.md)

## Overview

The Scheduled Assignments system is a "Screen Time" style scheduling feature for InstradaOGM. It allows administrators to automate OPNsense network group assignments on targeted devices based on pre-defined time windows and schedules.

Use cases include switching devices between VPN groups at specific times, creating "bedtime" internet-blocking windows, or cycling temporary access automatically — all without manual intervention.

---

## 📅 Three Scheduling Modes

### 1. Complex Weekly
A 7-day grid (Sun–Sat) with multiple independently-configured time windows per day. Each window has an explicit **Start** and **End** boundary — actions are assigned to each boundary separately, giving full control over what happens when the window opens and when it closes.

Best for consistent recurring patterns: *"Kids' internet off every school night at 9 PM, back on at 7 AM"*.

The frontend offers **Day Mirroring**: link a day's configuration to automatically copy it to all weekdays or all week, reducing duplicate setup effort.

### 2. Once
A single fire-and-forget execution at a future date and time. The schedule **automatically disables itself** after execution so it does not repeat.

Best for ad-hoc one-off events: *"Block gaming VPN access during tomorrow's exam at 9 AM"*.

### 3. Recurring
A repeating trigger defined by a standard cron expression. Actions execute at each cron tick.

Best for single boundary shifts that do not need a defined end: *"Every Friday at 5 PM, move devices to the weekend VPN group"*.

---

## ⚡ Boundary Actions and Operations

### Boundary Types (Complex Weekly)

Time windows in **Complex Weekly** mode use explicit **Boundary Action Pairs**:

- **Start Boundary** — actions executed when the clock reaches `startTime`.
- **End Boundary** — actions executed when the clock reaches `endTime`.

Boundaries are independent. A Start boundary does not implicitly undo itself at the End — both boundaries require their own explicit actions. This prevents surprise state changes and gives full declarative control.

> **Once** and **Recurring** schedules do not use boundary pairs. They have a single list of actions that all execute at trigger time.

---

### Operations

There are three available operations:

| Operation | Description |
|-----------|-------------|
| **ASSIGN** | Add the target host alias to a specified OPNsense network group. Behaviour depends on the group's type and the `enableGroupTypes` global setting — see [Group-Type-Aware Assignment](#group-type-aware-assignment) below. |
| **UNASSIGN** | Remove the target host alias from a specified OPNsense network group. If the host alias is not currently a member of the group, the operation is silently skipped as a success no-op. |
| **CLEAR_ALL** | Remove the target host alias from every OPNsense network group it currently belongs to. |

---

### Group-Type-Aware Assignment

The **ASSIGN** operation is aware of the **Group Types** global setting and the type (SingleSelect or MultiSelect) of the target group. This mirrors the assignment logic used in the self-service and device management pages.

#### When `enableGroupTypes` is disabled (default)

All groups are treated as SingleSelect regardless of their configured type. ASSIGN always evicts the host alias from every group it currently belongs to before adding it to the target group — effectively a move.

#### When `enableGroupTypes` is enabled

Behaviour depends on the target group's type:

| Target group type | Behaviour |
|-------------------|-----------|
| **SingleSelect** | Evicts the host alias from all other SingleSelect groups, then adds it to the target. MultiSelect group memberships are preserved. |
| **MultiSelect** | Purely additive. The host alias is added to the target group without evicting from anything. If the host alias is already a member of the target MultiSelect group, the operation is silently skipped as a success no-op. |

---

### Skip-as-Success No-Op Logic

Because schedules are pre-determined and may fire independently of the real-time membership state of groups, certain impossible operations are **skipped gracefully** rather than treated as errors:

- **ASSIGN to a MultiSelect group** where the host alias is already a member → logged as a warning, recorded as `success: true`.
- **UNASSIGN from a group** where the host alias is not currently a member → logged as a warning, recorded as `success: true`.

This prevents spurious `PARTIAL` or `FAILED` execution statuses caused by schedule drift or out-of-order execution.

---

## 🎯 Target Resolution

Schedules declare targets via a `targetType` and a `targetSelector`, resolved at execution time:

| Target Type | Selector Shape | Resolution |
|-------------|---------------|------------|
| `HOST_ALIAS` | `{ hostAliasUuids: string[] }` | Resolves the current IP(s) assigned to each OPNsense host alias at execution time. **This is the only mode available in the UI.** |
| `IP_LIST` | `{ ips: string[] }` | Static array of IP addresses. Available via API only. |
| `NETWORK_GROUP` | `{ networkGroupUuid: string }` | Resolves all current members of the specified OPNsense network group at execution time. Available via API only. |

Using `HOST_ALIAS` ensures the schedule always operates on the current IP of the alias, even if DHCP reassigns it between schedule creation and execution.

---

## 🖥️ Admin UI Walkthrough

The **Scheduling** tab in the Admin panel provides a full management interface.

### Schedule List
View all configured schedules in a sortable table. Columns show type, status (enabled/disabled), target aliases, priority, and last execution time. Schedules can be toggled on/off inline without opening the editor.

### Creating / Editing a Schedule

1. **Name, Description, Priority** — Identifiers and a priority value (0–100) used to order execution when multiple schedules fire simultaneously.
2. **Schedule Type** — Choose Complex Weekly, Once, or Recurring. The form adapts to show the relevant fields.
3. **Timezone** — Any IANA timezone identifier (e.g. `Europe/London`, `America/New_York`, `UTC`). All times are interpreted in this timezone.
4. **Target Host Aliases** — A searchable multi-select of OPNsense host aliases. The schedule will resolve and operate on all selected aliases at execution time.
5. **Actions / Timeline Grid** (type-dependent):
   - **Complex Weekly** — A visual week grid. Click a day cell to add a time window, then open the Boundary Action Editor to configure Start and End boundary actions.
   - **Once** — A date/time picker for `executeAt` and a list of actions.
   - **Recurring** — A cron expression input and a list of actions.

### Boundary Action Editor (Complex Weekly)
Each time window exposes an editor for Start and End boundaries. For each boundary you can add one or more actions in priority order. Each action specifies:
- **Operation** — Assign, Unassign, or Clear All.
- **Group** (Assign / Unassign only) — The target OPNsense network group, selected from a searchable list.

### Day Mirroring
When configuring a Complex Weekly schedule, any day can be linked to a mirror group. Changes to the source day automatically propagate to all linked days, saving time on repetitive configurations like Mon–Fri patterns.

### Dry Run Preview
Before saving, click **Dry Run** to simulate what boundaries would fire at any given date and time. The preview panel shows:
- Which time windows would be active.
- Which boundaries (Start / End) would trigger.
- Each action that would execute and the target group.

The preview validates the schedule against the saved data without touching OPNsense.

### Execution History
Each schedule shows a paginated log of past executions filterable by status. Each record includes:
- Execution timestamp and duration.
- Status (SUCCESS, PARTIAL, FAILED, SKIPPED).
- The set of resolved IPs that were targeted.
- Per-action, per-IP results including error messages for any failures.

---

## 📊 Execution Statuses

| Status | Meaning |
|--------|---------|
| **SUCCESS** | All actions on all resolved IPs completed successfully. |
| **PARTIAL** | At least one action or IP succeeded; at least one failed. Failures are logged individually without halting successful actions. |
| **FAILED** | All actions failed, or OPNsense was unreachable after maximum retry attempts. |
| **SKIPPED** | Execution was bypassed (e.g. schedule was disabled between the trigger check and execution). |

---

## ⚙️ Execution Engine

### Mutex and Serialisation
All OPNsense API calls within the execution engine are serialised through an in-process mutex. Only one boundary event executes at a time, preventing race conditions when multiple schedules fire simultaneously.

### Runtime Group Membership Tracking
At the start of each boundary execution, the engine fetches the current live group membership from OPNsense and builds an in-memory `ipRuntimeGroups` map (`IP → Set<groupUuid>`). This map is updated after each action within the same execution run, so sequential ASSIGN actions within a single boundary correctly account for evictions made by earlier actions — without requiring additional OPNsense round-trips.

### Retry and Reconciliation
- Failed boundary events are queued in an in-memory retry map with exponential backoff.
- A **5-minute reconciliation sweep** re-attempts any queued retries and also catches boundaries that were missed (e.g. due to a server restart) by comparing the current time against all enabled schedules.
- Once schedules are automatically disabled in the database after their actions execute, preventing re-execution on reconciliation sweeps.

---

## ⏰ Timezone Handling

All scheduled events are anchored to IANA timezone identifiers. The engine handles Daylight Saving Time (DST) correctly:

- **Spring-forward (clocks skip an hour):** A boundary whose scheduled time falls inside the skipped hour fires immediately at the next valid clock minute.
- **Fall-back (clocks repeat an hour):** A boundary within the repeated hour fires only on the *first* occurrence, preventing double execution.

---

## 🔌 API Reference

For full endpoint documentation including request/response schemas, query parameters, and curl examples, see:

**[Schedule System API Endpoints →](../api/api_docs/32_schedule_endpoints.md)**

---

**Last Updated:** 2026-03-03 | **Category:** Automation
