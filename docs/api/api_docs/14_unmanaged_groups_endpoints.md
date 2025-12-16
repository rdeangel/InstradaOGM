# Unmanaged Groups Endpoints

[⬆️ Back to API Index](API_Index.md) | [📚 Back to Documentation Home](../../DOCUMENTATION_INDEX.md)

## Overview

The Unmanaged Groups feature provides protection for self-service operations by preventing modifications when hosts are associated with "unmanaged groups." This ensures that certain network groups can be restricted from self-service access while maintaining full administrative control.

## Variables

Replace the following variables in the examples below:

- `{{SERVER_URL}}` - Your server URL (e.g., `https://instrada-ogm.example.com`)
- `{{API_KEY}}` - Your API key for authentication

## What are Unmanaged Groups?

**Unmanaged groups** are network groups that are not available for self-service modifications. There are two types:

1. **Globally Disabled Groups**: Groups that have been explicitly marked as disabled by administrators
2. **Filtered Groups**: Groups that don't match the Network Display Filter criteria

## How It Works

### Detection Logic

The system uses the existing `filterNetworkGroups()` logic in reverse:
- Instead of filtering groups for display, it checks if a host's groups would be filtered out
- If any of the host's groups would be filtered out, the host is considered "unmanaged"
- Self-service operations are then blocked with clear error messages

### Affected Operations

The following self-service operations are protected:
- **Group Assignment/Unassignment**: Adding or removing hosts from network groups
- **Host Alias Renaming**: Changing the names of host aliases
- **VPN Restart**: Restarting VPN connections for the host

### User Experience

When a host is in unmanaged groups:
- **UI Restrictions**: All modification controls are disabled with explanatory tooltips
- **Clear Messaging**: Alert components explain why restrictions are in place
- **API Protection**: Server-side validation prevents bypass attempts
- **User Guidance**: Messages direct users to contact administrators when appropriate

## Role-Based Access Control

**Authentication Required:** Mixed (Optional for basic access, Required for user-specific filtering)

**Role Requirements:**
- **USER**: ✅ Can check unmanaged groups with user-specific filters applied
- **ADMIN**: ✅ Can check unmanaged groups with user-specific filters applied
- **SUPER_ADMIN**: ✅ Can check unmanaged groups with user-specific filters applied

**Role Access:**
- **USER**: ✅ Can check unmanaged groups for any host groups, with user-specific filters applied to results
- **ADMIN**: ✅ Can check unmanaged groups for any host groups, with user-specific filters applied to results
- **SUPER_ADMIN**: ✅ Can check unmanaged groups for any host groups, with user-specific filters applied to results

**Example Responses:**

**Unauthenticated Access:**
```json
{
  "isUnmanaged": false,
  "unmanagedGroups": [],
  "reason": "none",
  "message": "All host groups are available for self-service."
}
```

**Authenticated User Success:**
```json
{
  "isUnmanaged": false,
  "unmanagedGroups": [],
  "reason": "none",
  "message": "All host groups are available for self-service."
}
```

**Unmanaged Groups Detected:**
```json
{
  "isUnmanaged": true,
  "unmanagedGroups": [
    {
      "id": "disabled-group-uuid",
      "uuid": "disabled-group-uuid",
      "name": "DisabledGroup",
      "friendlyName": "Disabled Group"
    }
  ],
  "reason": "globally_disabled",
  "message": "Your device is associated with network groups that have been disabled by administrators. Self-service modifications are not allowed."
}
```

## API Endpoints

### POST /api/self-service/check-unmanaged-groups

**Description**: Check if a host is in unmanaged groups based on its group memberships.

**Authentication**: Optional (supports both authenticated and unauthenticated requests)

**Role Access:**
- **USER**: ✅ Can check unmanaged groups with user-specific filters applied
- **ADMIN**: ✅ Can check unmanaged groups with user-specific filters applied
- **SUPER_ADMIN**: ✅ Can check unmanaged groups with user-specific filters applied

**Request Body**:
```json
{
  "hostGroups": [
    {
      "id": "group-uuid",
      "uuid": "group-uuid",
      "name": "GroupName",
      "friendlyName": "Group Friendly Name",
      "enabled": true,
      "members": [],
      "lastUpdated": null,
      "rawContent": "192.168.1.100",
      "type": "networkgroup",
      "iconIdentifier": null,
      "description": "Group description"
    }
  ],
  "userId": "user-id-or-null"
}
```

**Request Body Parameters:**
- `hostGroups` (array, required): Array of group objects to check for unmanaged status
  - **Validation**: Must be an array of group objects
  - **Example**: `[{"id": "group-uuid", "name": "GroupName"}]`

- `userId` (string, optional): User ID for context (can be null for unauthenticated requests)
  - **Validation**: String up to 255 characters
  - **Example**: `"user-123"` or `null`

**Group Object Properties:**
- `id` (string, required): Group identifier
  - **Validation**: Must be a valid UUID
  - **Example**: `"group-uuid-123"`

- `uuid` (string, required): Group UUID (duplicate of id field)
  - **Validation**: Must be a valid UUID
  - **Example**: `"group-uuid-123"`

- `name` (string, required): Group name
  - **Validation**: Must be a valid OPNsense group name
  - **Example**: `"G_DEVICES_VPN_USERS"`

- `friendlyName` (string, optional): Display-friendly name for the group
  - **Validation**: String up to 255 characters
  - **Example**: `"VPN Users"`

- `enabled` (boolean, required): Whether the group is enabled
  - **Validation**: Must be true or false
  - **Example**: `true`

- `members` (array, optional): Group members (can be empty)
  - **Validation**: Array of member objects
  - **Example**: `[]`

- `lastUpdated` (string, optional): Last update timestamp
  - **Validation**: ISO 8601 date string or null
  - **Example**: `"2024-01-15T10:30:00Z"` or `null`

- `rawContent` (string, optional): Raw content of the group
  - **Validation**: String up to 1000 characters
  - **Example**: `"192.168.1.100"`

- `type` (string, required): Group type
  - **Validation**: Must be a valid group type
  - **Example**: `"networkgroup"`

- `iconIdentifier` (string, optional): Icon identifier for the group
  - **Validation**: String up to 100 characters
  - **Example**: `"users"` or `null`

- `description` (string, optional): Group description
  - **Validation**: String up to 500 characters
  - **Example**: `"VPN user group"`

**Success Response (200)**:
```json
{
  "isUnmanaged": false,
  "unmanagedGroups": [],
  "reason": "none",
  "message": "Host is in managed groups only."
}
```

**Unmanaged Response (200)**:
```json
{
  "isUnmanaged": true,
  "unmanagedGroups": [
    {
      "id": "disabled-group-uuid",
      "uuid": "disabled-group-uuid", 
      "name": "DisabledGroup",
      "friendlyName": "Disabled Group"
    }
  ],
  "reason": "globally_disabled",
  "message": "Your device is associated with network groups that have been disabled by administrators. Self-service modifications are not allowed."
}
```

**Error Response (400)**:
```json
{
  "error": "Invalid input: hostGroups must be an array"
}
```

**Fail-Open Response (200)**:
```json
{
  "isUnmanaged": false,
  "unmanagedGroups": [],
  "reason": "none", 
  "message": "Unable to determine group management status. Self-service is available."
}
```

## Integration with Existing APIs

### Host Group Management API

The `/api/opnsense/host-group-management` endpoint now includes unmanaged group checks for self-service operations.

**Additional Error Response (403)**:
```json
{
  "success": false,
  "message": "Self-service is restricted: Your device is associated with network groups that have been disabled by administrators. Self-service modifications are not allowed."
}
```

### Host Alias Management API

The `/api/opnsense/host-alias-management` endpoint now includes unmanaged group checks for rename operations.

**Additional Error Response (403)**:
```json
{
  "success": false,
  "message": "Self-service is restricted: Your device is associated with network groups that are not available for self-service access. Please contact your network administrator for assistance."
}
```

### VPN Safe Restart API

The `/api/vpn/safe-restart` endpoint now includes unmanaged group checks for unauthenticated requests.

**Additional Error Response (403)**:
```json
{
  "error": "Self-service is restricted: Your device is associated with network groups that have been disabled by administrators. Self-service modifications are not allowed."
}
```

## Configuration

### Globally Disabled Groups

Groups can be marked as globally disabled by adding their UUIDs to the `GloballyDisabledGroup` table:

```sql
INSERT INTO "GloballyDisabledGroup" (uuid, "createdAt", "updatedAt") 
VALUES ('group-uuid-to-disable', NOW(), NOW());
```

### Network Display Filters

Groups can be filtered out using Network Display Filters in the `NetworkDisplayFilter` table:

```sql
-- Global filter that excludes groups with "Restricted" in the name
INSERT INTO "NetworkDisplayFilter" (
  "userId", 
  "includeRegex", 
  "excludeRegex", 
  "createdAt", 
  "updatedAt"
) VALUES 
  (NULL, '.*', 'Restricted.*', NOW(), NOW());

-- User-specific filter
INSERT INTO "NetworkDisplayFilter" (
  "userId", 
  "includeRegex", 
  "excludeRegex", 
  "createdAt", 
  "updatedAt"
) VALUES 
  (1, 'Allowed.*', 'Blocked.*', NOW(), NOW());
```

## Error Handling

### Fail-Open Strategy

The system implements a fail-open strategy:
- If unmanaged group checks fail due to errors, operations are allowed to continue
- This ensures system reliability while maintaining security when checks succeed
- Errors are logged for debugging and monitoring

### Error Types

1. **Globally Disabled**: Groups explicitly marked as disabled
2. **Filtered Out**: Groups that don't match display filter criteria
3. **Check Failed**: When the unmanaged group check encounters an error (fail-open)

## Testing

### Test Scenarios

1. **Managed Groups Only**: Host should have full self-service access
2. **Globally Disabled Groups**: Host should be restricted with admin contact message
3. **Filtered Groups**: Host should be restricted with admin contact message
4. **Mixed Groups**: Host should be restricted if ANY group is unmanaged
5. **Empty Groups**: Host should have full self-service access
6. **Check Failures**: Host should have full self-service access (fail-open)

### Example Test Requests

**Test Managed Host**:
```bash
curl -X POST "{{SERVER_URL}}/api/self-service/check-unmanaged-groups" \
  -H "Content-Type: application/json" \
  -d '{
    "hostGroups": [
      {
        "id": "managed-group-uuid",
        "uuid": "managed-group-uuid",
        "name": "ManagedGroup",
        "friendlyName": "Managed Group",
        "enabled": true,
        "members": [],
        "lastUpdated": null,
        "rawContent": "192.168.1.100",
        "type": "networkgroup",
        "iconIdentifier": null,
        "description": "A managed group"
      }
    ],
    "userId": null
  }'
```

**Test Globally Disabled Host**:
```bash
curl -X POST "{{SERVER_URL}}/api/self-service/check-unmanaged-groups" \
  -H "Content-Type: application/json" \
  -d '{
    "hostGroups": [
      {
        "id": "disabled-group-uuid",
        "uuid": "disabled-group-uuid", 
        "name": "DisabledGroup",
        "friendlyName": "Disabled Group",
        "enabled": true,
        "members": [],
        "lastUpdated": null,
        "rawContent": "192.168.1.200",
        "type": "networkgroup",
        "iconIdentifier": null,
        "description": "A globally disabled group"
      }
    ],
    "userId": null
  }'
```

## Security Considerations

### Server-Side Validation

All unmanaged group checks are performed server-side to prevent bypass attempts:
- UI restrictions can be circumvented, but API protection cannot
- Authentication context is properly validated
- IP address validation ensures self-service users can only operate on their own devices

### Admin Override

**Important Note on Role-Based Access:**

The `/api/self-service/check-unmanaged-groups` endpoint itself does not implement role-based override functionality. All authenticated users (USER, ADMIN, SUPER_ADMIN) receive the same level of access when checking unmanaged group status:

- **USER**: ✅ Can check unmanaged groups with user-specific filters applied
- **ADMIN**: ✅ Can check unmanaged groups with user-specific filters applied
- **SUPER_ADMIN**: ✅ Can check unmanaged groups with user-specific filters applied

**Where Admin Override Applies:**

Admin override functionality is implemented in other API endpoints that consume unmanaged group results:
- **Host Group Management API**: ADMIN/SUPER_ADMIN users can bypass unmanaged group restrictions
- **Host Alias Management API**: ADMIN/SUPER_ADMIN users can bypass unmanaged group restrictions
- **VPN Safe Restart API**: ADMIN/SUPER_ADMIN users can bypass unmanaged group restrictions

This design ensures that:
1. The check-unmanaged-groups endpoint provides consistent results regardless of user role
2. Admin override is applied at the point of action (when attempting modifications)
3. Unmanaged group detection remains objective and role-agnostic
4. Administrative control is maintained through action-level permissions rather than detection-level permissions

## Monitoring and Logging

### Audit Logging

All blocked operations are logged with detailed information:
- Host IP address and group memberships
- Reason for restriction (globally disabled vs filtered)
- Attempted operation details
- User context (authenticated vs unauthenticated)

### Error Logging

System errors during unmanaged group checks are logged:
- Database connection issues
- Filter processing errors
- API communication failures
- Performance metrics for monitoring

## Best Practices

### Group Management

1. **Clear Naming**: Use descriptive names for groups that will be disabled or filtered
2. **Documentation**: Document which groups are restricted and why
3. **Testing**: Test restrictions before applying to production groups
4. **Communication**: Inform users about restrictions and how to get help

### Filter Configuration

1. **Regex Patterns**: Use precise regex patterns to avoid unintended matches
2. **Testing**: Test filter patterns against actual group names
3. **User-Specific**: Consider user-specific filters for granular control
4. **Monitoring**: Monitor filter effectiveness and adjust as needed

### Error Handling

1. **Fail-Open**: Maintain the fail-open strategy for system reliability
2. **Monitoring**: Monitor error rates and investigate failures
3. **Logging**: Ensure adequate logging for troubleshooting
4. **Alerting**: Set up alerts for high error rates or system issues


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
