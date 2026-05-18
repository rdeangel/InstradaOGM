# Network Alias Management

[📚 Back to Documentation Home](../DOCUMENTATION_INDEX.md)

## Overview

Network Alias Management enables administrators to manage collections of CIDR network ranges in OPNsense and assign them to network groups for VPN routing, firewall rules, and network policies. This feature integrates seamlessly with InstradaOGM's group management system and supports scheduled assignments.

## What Are Network Aliases?

A **network alias** represents a collection of CIDR address ranges (e.g., `192.168.1.0/24`, `10.0.0.0/8`) stored in OPNsense. Unlike host aliases which represent individual IP addresses, network aliases:

- Define subnets and networks
- Support CIDR notation for flexible range specifications
- Can be assigned to network groups for policy application
- Can be scheduled for time-based assignment changes

### Example Network Alias

```
Name: Office_Networks
Type: network
Content:
  192.168.1.0/24      (Main office subnet)
  192.168.2.0/24      (Office server network)
  10.0.0.0/8          (VPN tunnel range)
Description: All office network ranges
Enabled: Yes
```

## Use Cases

### 1. **Subnet-Based VPN Routing**
Route entire office subnets through a VPN connection without installing VPN clients on every device.

```
Office_Networks → VPN_Routing_Group → OpenVPN connection to headquarters
Lab_Networks → Lab_VPN_Group → WireGuard connection to lab infrastructure
```

### 2. **Firewall Rule Management**
Define network access policies based on address ranges rather than individual IPs.

```
Guest_Networks → Limited_Access_Group (restricted firewall rules)
Trusted_Networks → Full_Access_Group (unrestricted)
```

### 3. **Multi-Location Network Management**
Manage policies for distributed office locations from a single interface.

```
Branch_Office_1_Nets → Branch_1_Policy_Group
Branch_Office_2_Nets → Branch_2_Policy_Group
Branch_Office_3_Nets → Branch_3_Policy_Group
```

### 4. **Time-Based Network Policies**
Schedule network policies to change based on time-of-day or day-of-week.

```
Schedule: "Office Hours" (8 AM - 6 PM, Mon-Fri)
  When active: Office_Networks → Full_Bandwidth_Group
  When inactive: Office_Networks → Limited_Bandwidth_Group
```

### 5. **Lab and Development Isolation**
Separate lab networks from production traffic.

```
Lab_Dev_Networks → Isolated_Lab_Group (separate routing policies)
Production_Networks → Production_Group (optimized routing)
```

## Core Concepts

### Network Groups vs. Network Aliases

| Aspect | Network Groups | Network Aliases |
|--------|---|---|
| **Definition** | Containers that hold aliases | Collections of CIDR ranges |
| **Purpose** | Organize and apply policies | Define which networks are affected |
| **Scope** | Can hold multiple aliases | Represents specific address ranges |
| **OPNsense Type** | `networkgroup` | `network` alias |

### Group Types: SingleSelect vs. MultiSelect

Network groups can be configured as one of two types:

#### SingleSelect Groups
- An alias can belong to **only one SingleSelect group** at a time
- Useful for mutually exclusive policies (e.g., "which VPN gets this subnet?")
- Assigning an alias to a different SingleSelect group automatically removes it from its previous SingleSelect group
- Can belong to multiple MultiSelect groups simultaneously

**Example**: A subnet can use either the "Main VPN" or the "Backup VPN", but not both simultaneously.

#### MultiSelect Groups
- An alias can belong to **multiple MultiSelect groups** at the same time
- Useful for applying multiple concurrent policies
- No automatic removal when assigning to other groups

**Example**: A subnet can be in both "Logging_Group" and "Rate_Limiting_Group" simultaneously.

### Assignment Operations

#### Assign
Add a network alias to a network group.
- If the target is a **SingleSelect** group: alias is removed from any other SingleSelect groups
- If the target is a **MultiSelect** group: no conflicts; alias is simply added

#### Unassign
Remove a network alias from a network group.
- Works the same for both SingleSelect and MultiSelect groups
- Other group memberships are unaffected

#### Move
When an alias is assigned to a SingleSelect group and previously belonged to another SingleSelect group, this is recorded as a "move" operation in the audit log.

## Feature Toggle

Network Alias Management is disabled by default. To enable:

1. Go to **Settings** → **Global Settings**
2. Scroll to **Network Alias Management**
3. Toggle **Enable Network Alias Management**
4. Save changes

### Why Start Disabled?

- Prevents accidental changes during deployment
- Allows configuration of other system aspects first
- Requires explicit administrator action to activate
- Can be toggled on/off without affecting existing aliases in OPNsense

## Permission Model

### Admin Roles with Access

- **ADMIN**: Full network alias management permissions
- **SUPER_ADMIN**: Full network alias management permissions
- **USER**: No access to network alias endpoints (permission denied)

### What Can Admins Do?

✅ Create new network aliases  
✅ Edit existing network aliases  
✅ Delete network aliases (if not referenced by schedules)  
✅ Assign/unassign aliases to/from groups  
✅ View network alias history and analytics  
✅ Schedule assignments for future times  
✅ View network alias change audit logs  

### What Admins Cannot Do

❌ Edit OPNsense configuration directly (API calls go to OPNsense)  
❌ Modify system-level firewall rules  
❌ Access aliases disabled in global settings  

## Integration with Scheduled Assignments

Network aliases can be used with the scheduled assignment system for time-based policy changes.

### Example: Office Hours Bandwidth

```
Schedule: "Office Hours"
Type: COMPLEX_WEEKLY
Trigger: Monday-Friday 8 AM - 6 PM

Target: Office_Networks (network alias)

Actions:
  At 8 AM: Assign to "Full_Bandwidth_Group"
  At 6 PM: Unassign from "Full_Bandwidth_Group"
            Assign to "Limited_Bandwidth_Group"
```

For detailed scheduling information, see [Scheduled Assignments](./SCHEDULED_ASSIGNMENTS.md).

## Network Alias Naming Conventions

### Naming Rules

- **Allowed**: Alphanumeric characters and underscores only
- **Not allowed**: Spaces, hyphens, dots, special characters
- **Case sensitive**: `Office_Net` ≠ `office_net`
- **Length**: No strict limit, but keep reasonably short

### Recommended Naming Pattern

```
{Location}_{Type}_{Identifier}

Examples:
  Office_Networks
  Office_Server_Nets
  Branch_1_Access
  VPN_Tunnel_Range
  Guest_Subnet
  Lab_Dev_Nets
```

## Hiding Network Aliases

Network aliases can be hidden from all management interfaces to prevent accidental assignment or modification. This is useful for:
- Protecting special-use aliases that should not be managed manually
- Organizing large alias collections by hiding legacy or deprecated entries
- Preventing assignment of sensitive network ranges

### How to Hide an Alias

1. **Go to** Admin Panel → Network Management
2. **Find** the alias you want to hide
3. **Click** "Edit"
4. **Toggle** the "Hide" switch to ON
5. **Click** "Save"

### What Happens When Hidden

When an alias is hidden:
- ❌ **Excluded** from all dropdown pickers and selection interfaces
- ❌ **Cannot be assigned** to network groups via API or UI
- ❌ **Cannot be selected** in scheduled assignments
- ❌ **Automatically removed** from management interfaces (but not from groups it's already in)

**Admin View**: The alias still appears in the Network Management admin table with a "Hidden" badge so admins can manage the hidden state.

### Visibility States

| State | Display in Picker | Can Assign | In Admin Table | Badge |
|-------|---|---|---|---|
| **Visible** | ✅ Yes | ✅ Yes | ✅ Yes | Green "Visible" |
| **Hidden** | ❌ No | ❌ No | ✅ Yes | Gray "Hidden" |

### Hiding Aliases Already in Groups

Hidden aliases that are already members of network groups:
- 🔒 **Protected from assignment** - cannot be reassigned to other groups
- 🔒 **Protected from eviction** - will only be removed from SingleSelect groups if a non-hidden alias is assigned to that group
- ✅ **Still functional** - firewall rules and VPN routing continue to work

## Validation and Safety

### Pre-Assignment Validation

Before assigning an alias to a group, the system validates:

✅ **Alias exists** in OPNsense  
✅ **Alias is enabled** in OPNsense  
✅ **Alias is network type** (not host or other types)  
✅ **Alias is NOT hidden** in the management system  
✅ **Target group exists** in OPNsense  
✅ **Target group is enabled** in OPNsense  
✅ **Target group is not globally disabled** in InstradaOGM  
✅ **Target group's VPN is connected** (if assigned a VPN)  

If any validation fails, the assignment is rejected with a specific error message.

### Hidden Alias Assignment Error

**Symptom**: Assignment fails with "Network alias is hidden"

**Cause**: The alias is marked as hidden in the management system

**Solutions**:
- Option 1: Admin unhides the alias in Network Management
- Option 2: Use a different, non-hidden alias
- Option 3: For direct API calls, contact your administrator to toggle hidden state

### Delete Protection

Network aliases **cannot be deleted** if they are referenced by any active scheduled assignment. This prevents breaking scheduled policies.

To delete an alias referenced by schedules:

1. Disable or delete the schedules that reference it, OR
2. Remove the alias from those schedules, then delete it

## Audit Logging

All network alias operations are logged with complete audit trails:

### Logged Events

| Event | When | Details |
|-------|------|---------|
| `NETWORK_ALIAS_CREATE_ATTEMPT` | Creation starts | Alias name, content |
| `NETWORK_ALIAS_CREATE_SUCCESS` | Creation succeeds | UUID, name, content |
| `NETWORK_ALIAS_CREATE_FAILURE` | Creation fails | Error message |
| `NETWORK_ALIAS_UPDATE_ATTEMPT` | Update starts | Old/new values |
| `NETWORK_ALIAS_UPDATE_SUCCESS` | Update succeeds | UUID, name, changes |
| `NETWORK_ALIAS_UPDATE_FAILURE` | Update fails | Error message |
| `NETWORK_ALIAS_DELETE_ATTEMPT` | Deletion starts | UUID, name |
| `NETWORK_ALIAS_DELETE_SUCCESS` | Deletion succeeds | UUID, name |
| `NETWORK_ALIAS_DELETE_FAILURE` | Deletion fails | Error message |
| `NETWORK_ALIAS_GROUP_ASSIGN_ATTEMPT` | Assignment starts | Alias, target group |
| `NETWORK_ALIAS_GROUP_ASSIGN_SUCCESS` | Assignment succeeds | Alias, group, user |
| `NETWORK_ALIAS_GROUP_ASSIGN_MOVE` | Assignment + removal | Alias, new group, removed groups |
| `NETWORK_ALIAS_GROUP_UNASSIGN_ATTEMPT` | Unassignment starts | Alias, group |
| `NETWORK_ALIAS_GROUP_UNASSIGN_SUCCESS` | Unassignment succeeds | Alias, group, user |
| `NETWORK_ALIAS_GROUP_MANAGEMENT_FAILURE` | Operation fails | Error details |

### Audit Trail Access

- View complete history: **Admin Panel** → **Audit Logs**
- API access: `/api/analytics/network-alias-group-history`
- Analytics: `/api/admin/audit-logs/analytics/network-aliases`

## Common Workflows

### Create and Assign a New Network Alias

1. **Go to** Admin Panel → Network Management
2. **Click** "Add Network Alias"
3. **Enter**:
   - Name: `Lab_Networks`
   - Content: Paste CIDR ranges, one per line
   - Description: "Lab environment subnets"
4. **Click** "Create"
5. **Assign** to a network group by clicking "Assign to Group"
6. **Select** the target group from the dropdown
7. **Click** "Assign"

### Move an Alias Between SingleSelect Groups

1. **Find** the alias in the Network Management page
2. **See** its current SingleSelect group assignment
3. **Click** "Assign to Group"
4. **Select** a different SingleSelect group
5. **Click** "Assign"
6. The alias is automatically removed from its previous SingleSelect group
7. **Audit log** records this as a "move" operation

### Schedule Time-Based Assignment

1. **Go to** Admin Panel → Schedules
2. **Click** "Create Schedule"
3. **Set**:
   - Name: "Office Hours Routing"
   - Target Type: "Network Alias"
   - Target: Select your network alias
4. **Configure** time windows:
   - Monday-Friday 8 AM - 6 PM: Assign to "Office_VPN_Group"
   - Outside office hours: Assign to "Local_Network_Group"
5. **Save** the schedule
6. **Enable** the schedule to activate

For detailed scheduling see [Scheduled Assignments](./SCHEDULED_ASSIGNMENTS.md).

### Delete a Network Alias

1. **Find** the alias you want to delete
2. **Check** if it's referenced by any schedules
   - If referenced: You must disable/delete those schedules first
   - System shows warning with affected schedules
3. **Click** "Delete"
4. **Confirm** the deletion
5. **Audit log** records the deletion

## Performance Considerations

### Large Alias Content

Network aliases can contain many CIDR ranges without performance issues:
- Tested with 1,000+ ranges per alias
- OPNsense handles the parsing
- InstradaOGM caches alias data

### Group Membership Queries

When listing all network aliases:
- System queries OPNsense for current state
- Enriches with group membership information from database
- Typical query: < 500ms for 50+ aliases

### Scheduled Assignment Processing

- Scheduled assignments are evaluated every minute
- Network alias assignments are processed in batches
- All changes are applied atomically to OPNsense

## Troubleshooting

### "Feature disabled" Error

**Symptom**: All network alias endpoints return 403 with `NETWORK_ALIAS_MANAGEMENT_DISABLED`

**Solution**:
1. Go to **Global Settings**
2. Look for **"Manage Network Aliases"** toggle
3. Ensure it's **enabled**
4. Save changes
5. Retry the operation

### "Cannot delete: alias is referenced by active schedules"

**Symptom**: Delete fails with list of blocking schedules

**Solutions**:
- Option 1: Disable or delete the listed schedules first
- Option 2: Edit the schedule to remove the alias from its target selector
- Option 3: Wait for the schedule to expire/become inactive

### Assignment Fails: "Target group's VPN is disconnected"

**Symptom**: Assign operation fails when target group has a VPN

**Cause**: The VPN connection associated with the group is not available

**Solutions**:
- Check VPN status in Admin Panel → VPN Status
- Restart the VPN service if needed
- Verify VPN configuration in OPNsense
- Assign to a different group without VPN association

### Name Already Exists Error

**Symptom**: Cannot create/update alias due to duplicate name

**Causes**:
- Another alias with same name already exists
- Case sensitivity issue (different case treated as different)

**Solutions**:
- Use a different name
- Delete the existing duplicate (if confirmed by admin)
- Check case sensitivity carefully

## Best Practices

### 1. **Use Descriptive Names**
✅ Good: `Office_Main_Subnet`, `Lab_Development_Nets`  
❌ Poor: `alias1`, `temp_net`

### 2. **Document Your Content**
Include comments in alias descriptions explaining what each range covers:
```
Content: 192.168.1.0/24  (Main office floor 1)
         192.168.2.0/24  (Main office floor 2)
         10.0.0.0/8      (Lab VPN tunnel)
```

### 3. **Test Before Scheduling**
1. Create the alias
2. Manually assign it to see behavior
3. Verify firewall rules apply correctly
4. THEN schedule it for automatic changes

### 4. **Review Before Deleting**
- Check all associated groups
- Review usage history in audit logs
- Confirm no schedules reference it
- Alert affected users if applicable

### 5. **Keep Content Current**
- Document who manages each alias
- Update ranges when networks change
- Review quarterly for obsolete entries
- Remove disabled aliases to reduce clutter

### 6. **Leverage Scheduling Smartly**
- Use for predictable changes (office hours, business days)
- Combine with group types (SingleSelect for routing, MultiSelect for policies)
- Monitor scheduled operations in dashboards

## Related Documentation

- [Network Alias API Endpoints](../api/api_docs/33_network_alias_endpoints.md)
- [Network Alias Analytics API](../api/api_docs/34_network_alias_analytics_endpoints.md)
- [Scheduled Assignments](./SCHEDULED_ASSIGNMENTS.md)
- [Network Group Validation](./NETWORK_GROUP_VALIDATION.md)
- [Global Settings](./GLOBAL_SETTINGS.md)
