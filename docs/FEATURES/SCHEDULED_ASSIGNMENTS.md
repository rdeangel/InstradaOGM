# Scheduled Assignments

[⬆️ Back to Features Index](FEATURES_INDEX.md) | [📚 Back to Documentation Home](../DOCUMENTATION_INDEX.md)

## Overview

The Scheduled Assignments system is a "Screen Time" style scheduling feature for InstradaOGM. It allows administrators to automate the process of modifying OPNsense network group assignments on targeted devices (IPs) based on pre-defined time windows and schedules.

With Scheduled Assignments, you can switch devices between different VPN groups at specific times, create "bedtime" internet-blocking windows, or cycle temporary access automatically.

---

## 📅 Three Scheduling Modes

The system supports three different modes to accommodate any automation pattern:

### 1. Complex Weekly
A 7-day grid (Sun–Sat) allowing multiple time windows per day. Great for consistent patterns like "Kids' internet off at 9 PM every school night". The frontend offers template mirroring (e.g., copying Monday to all weekdays) to minimize manual entry.

### 2. Once
A single, fire-and-forget execution at a future date and time. Ideal for ad-hoc events like "Block gaming VPN during tomorrow's exam". Once schedules automatically disable themselves after execution.

### 3. Recurring
A repeating trigger defined by a standard cron expression. Best for single boundary shifts that don't need a definitive "end", such as "Every Friday at 5 PM, move to the weekend VPN".

---

## ⚡ Boundary Actions and Operations

Time windows in `COMPLEX_WEEKLY` mode implement explicit **Boundary Action Pairs**. Each window has a Start and End boundary, preventing implicit "undo" behaviors and ensuring explicit state management.

- **Start Boundary:** Executed when the clock reaches the `startTime`.
- **End Boundary:** Executed when the clock reaches the `endTime`.

There are four available operations for any boundary action:

| Operation | Description |
|-----------|-------------|
| **ASSIGN** | Add the target device to a specified OPNsense network group. |
| **REMOVE** | Remove the target device from a specified group. |
| **MOVE** | Atomically remove the device from Group A and add it to Group B. |
| **CLEAR_ALL**| Remove the device from *all* mapped OPNsense network groups. |

---

## 🖥️ Admin UI Walkthrough

The **Scheduling Tab** in the Admin panel provides a comprehensive set of tools to manage schedules.

1. **Schedule List:** View, toggle (enable/disable), and manage all configured schedules.
2. **Timeline Grid (Complex Weekly):** A visual week-view grid where you can drag to create windows, resize time blocks, and click to open the **Boundary Action Editor**.
3. **Day Mirroring:** When creating Complex Weekly schedules, link a specific day (like Monday) to automatically mirror to Mon-Fri or Mon-Sun, reducing duplicate configuration effort.
4. **Dry Run Preview:** Validate what actions would trigger at a hypothetical date and time before saving the schedule.
5. **Execution History:** Check past executions, status flags, targeted IPs, and detailed error logs.

---

## 🎯 Target Resolution

Schedules use declarative target selectors resolved at execution time, guaranteeing the system affects current data:
- `IP_LIST` - Hardcoded static IP arrays.
- `HOST_ALIAS` - Dynamically resolved from the targeted OPNsense Host Alias (Note: UI currently locks target selection to this mode).
- `NETWORK_GROUP` - Dynamically resolves all current members in the specified OPNsense Network Group.

---

## 📊 Execution Statuses

When the Schedule Execution Engine processes a boundary, it generates an execution log with one of the following statuses:

* **SUCCESS:** All actions on all resolved IPs completed without error against the OPNsense API.
* **PARTIAL:** Some actions or some IPs succeeded, while others failed (fails are logged individually without halting successful tasks).
* **FAILED:** General failure for all actions, or failure to communicate with the OPNsense API after maximum retry attempts.
* **SKIPPED:** Execution was temporarily bypassed (e.g., if OPNsense is completely unreachable), queued for retry in the reconciliation sweep.

---

## ⏰ Timezone Handling

All scheduled events are anchored to specific IANA timezone identifiers (e.g., `Europe/London`, `America/New_York`, `UTC`). The engine robustly handles Daylight Saving Time (DST) shifts:
- **Spring-forward:** A skipped boundary fires immediately at the next valid clock minute.
- **Fall-back:** A boundary within a repeated hour guarantees it executes only on the *first* occurrence.

---

**Last Updated:** 2026-02-21 | **Category:** Automation
