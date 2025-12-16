# Unmanaged Groups Feature

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Features](./)

## Overview

The Unmanaged Groups feature provides a comprehensive security layer for self-service operations by preventing modifications when hosts are associated with "unmanaged groups." This feature ensures that certain network groups can be restricted from self-service access while maintaining full administrative control.

## What are Unmanaged Groups?

**Unmanaged groups** are network groups that are not available for self-service modifications. There are two types:

### 1. Globally Disabled Groups
Groups that have been explicitly marked as disabled by administrators in the system configuration. These groups are stored in the `GloballyDisabledGroup` database table.

**Use Cases:**
- Temporary restriction of problematic groups
- Maintenance mode for specific network segments
- Security isolation of sensitive groups
- Compliance requirements for certain network zones

### 2. Filtered Groups
Groups that don't match the Network Display Filter criteria configured in the system. These filters can be global (affecting all users) or user-specific.

**Use Cases:**
- Role-based group visibility
- Department-specific network access
- Geographic or organizational filtering
- Custom group categorization

## How It Works

### Detection Logic

The system leverages the existing `filterNetworkGroups()` logic in reverse:
1. **Normal Operation**: `filterNetworkGroups()` filters groups for display in the UI
2. **Unmanaged Detection**: The same logic checks if a host's groups would be filtered out
3. **Restriction Application**: If any of the host's groups would be filtered out, the host is considered "unmanaged"
4. **Operation Blocking**: Self-service operations are blocked with clear error messages

### Affected Operations

The following self-service operations are protected by the unmanaged groups feature:

#### Group Management
- **Assignment**: Adding hosts to network groups
- **Unassignment**: Removing hosts from network groups  
- **Batch Operations**: Multiple group assignments/unassignments

#### Host Alias Management
- **Renaming**: Changing the names of host aliases
- **Creation**: Creating new host aliases (when associated with unmanaged groups)

#### VPN Operations
- **Restart**: Restarting VPN connections for hosts in unmanaged groups
- **Service Control**: Other VPN service operations for restricted hosts

### User Experience

When a host is detected as being in unmanaged groups:

#### UI Restrictions
- All modification controls are disabled
- Clear tooltips explain why controls are disabled
- Visual indicators show restriction status

#### Clear Messaging
- Alert components prominently display restriction information
- Specific messages explain the type of restriction
- User guidance directs users to appropriate next steps

#### API Protection
- Server-side validation prevents bypass attempts
- Consistent 403 error responses with clear messages
- Audit logging tracks all blocked operations

## Implementation Architecture

### Core Components

#### 1. Detection Utility (`src/lib/unmanaged-group-utils.ts`)
- `isHostInUnmanagedGroups()`: Core detection function
- `fetchUnmanagedGroupFilterData()`: Retrieves filter configurations
- Leverages existing `filterNetworkGroups` logic for consistency

#### 2. API Protection Layer
- **Host Group Management**: `/api/opnsense/host-group-management/route.ts`
- **Host Alias Management**: `/api/opnsense/host-alias-management/route.ts`
- **VPN Safe Restart**: `/api/vpn/safe-restart/route.ts`
- **Detection Endpoint**: `/api/self-service/check-unmanaged-groups/route.ts`

#### 3. UI Integration
- **SelfServicePageClient.tsx**: Orchestrates unmanaged group detection
- **SelfServiceCard.tsx**: Displays restriction alerts and messaging
- **NetworkGroupsCard.tsx**: Disables controls and shows tooltips

### Error Handling Strategy

#### Fail-Open Approach
The system implements a fail-open strategy to ensure reliability:
- If unmanaged group checks fail due to system errors, operations are allowed to continue
- This prevents system outages from blocking legitimate self-service operations
- All failures are logged for monitoring and debugging

#### Error Types
1. **Detection Errors**: Database connectivity, filter processing failures
2. **Validation Errors**: Invalid input data, malformed requests
3. **System Errors**: API communication failures, timeout issues

## Configuration

### Globally Disabled Groups

Groups can be marked as globally disabled by adding their UUIDs to the database:

```sql
-- Add a group to the globally disabled list
INSERT INTO "GloballyDisabledGroup" (uuid, "createdAt", "updatedAt") 
VALUES ('group-uuid-to-disable', NOW(), NOW());

-- Remove a group from the globally disabled list
DELETE FROM "GloballyDisabledGroup" WHERE uuid = 'group-uuid-to-enable';

-- List all globally disabled groups
SELECT * FROM "GloballyDisabledGroup";
```

### Network Display Filters

Groups can be filtered using Network Display Filters:

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

-- User-specific filter for user ID 1
INSERT INTO "NetworkDisplayFilter" (
  "userId", 
  "includeRegex", 
  "excludeRegex", 
  "createdAt", 
  "updatedAt"
) VALUES 
  (1, 'Allowed.*', 'Blocked.*', NOW(), NOW());

-- List all filters
SELECT * FROM "NetworkDisplayFilter" ORDER BY "userId" NULLS FIRST;
```

## Security Considerations

### Server-Side Validation
- All unmanaged group checks are performed server-side
- UI restrictions can be circumvented, but API protection cannot be bypassed
- Authentication context is properly validated for all operations

### Admin Override
- Administrators (ADMIN and SUPER_ADMIN roles) can still perform operations on unmanaged groups
- Unmanaged group restrictions only apply to self-service operations
- Administrative control is never compromised

### IP Address Validation
- Self-service users can only operate on their own IP addresses
- IP normalization handles IPv4-mapped IPv6 addresses correctly
- Client IP detection works natively (direct access) and with proxy configurations

## Monitoring and Logging

### Audit Logging
All blocked operations are logged with comprehensive details:
- Host IP address and group memberships
- Reason for restriction (globally disabled vs filtered)
- Attempted operation details
- User context (authenticated vs unauthenticated)
- Timestamp and request metadata

### Error Logging
System errors during unmanaged group checks are logged:
- Database connection issues and query failures
- Filter processing errors and regex compilation issues
- API communication failures and timeout errors
- Performance metrics for monitoring system health

### Metrics and Monitoring
Key metrics to monitor:
- **Restriction Rate**: Percentage of operations blocked by unmanaged groups
- **Error Rate**: Frequency of unmanaged group check failures
- **Performance**: Response time impact of unmanaged group checks
- **User Impact**: Number of users affected by restrictions

## Testing

### Test Scenarios

The feature includes comprehensive testing scenarios:

1. **Managed Groups Only**: Hosts should have full self-service access
2. **Globally Disabled Groups**: Hosts should be restricted with admin contact message
3. **Filtered Groups**: Hosts should be restricted with admin contact message
4. **Mixed Groups**: Hosts should be restricted if ANY group is unmanaged
5. **Empty Groups**: Hosts should have full self-service access
6. **Check Failures**: Hosts should have full self-service access (fail-open)

### Test Tools

- **Test Script**: `test-unmanaged-groups.js` - Comprehensive automated testing
- **Setup Script**: `setup-test-data.sql` - Database setup for testing
- **Testing Guide**: `UNMANAGED_GROUPS_TESTING_GUIDE.md` - Manual testing procedures

## Best Practices

### Group Management
1. **Clear Naming**: Use descriptive names for groups that will be disabled or filtered
2. **Documentation**: Document which groups are restricted and why
3. **Testing**: Test restrictions in a development environment before production
4. **Communication**: Inform users about restrictions and how to get help

### Filter Configuration
1. **Regex Patterns**: Use precise regex patterns to avoid unintended matches
2. **Testing**: Test filter patterns against actual group names before deployment
3. **User-Specific**: Consider user-specific filters for granular access control
4. **Monitoring**: Monitor filter effectiveness and adjust patterns as needed

### Error Handling
1. **Fail-Open**: Maintain the fail-open strategy for system reliability
2. **Monitoring**: Monitor error rates and investigate failures promptly
3. **Logging**: Ensure adequate logging for troubleshooting and auditing
4. **Alerting**: Set up alerts for high error rates or system issues

### User Communication
1. **Clear Messages**: Provide specific, actionable error messages
2. **Contact Information**: Include clear guidance on who to contact for help
3. **Documentation**: Maintain user-facing documentation about restrictions
4. **Training**: Train support staff on the unmanaged groups feature

## Troubleshooting

### Common Issues

#### Groups Not Being Restricted
1. Check if group UUID is correctly added to `GloballyDisabledGroup` table
2. Verify Network Display Filter regex patterns match group names
3. Ensure filters are not being overridden by user-specific filters
4. Check if user has admin privileges (admins bypass restrictions)

#### False Positives (Groups Incorrectly Restricted)
1. Review regex patterns in Network Display Filters for unintended matches
2. Check for conflicting user-specific and global filters
3. Verify group names and UUIDs are correct in the database
4. Test filter patterns in isolation

#### System Performance Issues
1. Monitor database query performance for filter operations
2. Check for inefficient regex patterns in filters
3. Review error rates and fail-open frequency
4. Consider caching strategies for frequently accessed filter data

#### User Experience Issues
1. Verify UI components are properly displaying restriction messages
2. Check that tooltips and alerts are showing correct information
3. Ensure error messages are user-friendly and actionable
4. Test across different browsers and devices

### Debugging Tools

1. **Database Queries**: Direct SQL queries to inspect filter and group data
2. **API Testing**: Use curl or Postman to test API endpoints directly
3. **Log Analysis**: Review application logs for error patterns and performance issues
4. **Test Script**: Run the automated test script to validate functionality

## Future Enhancements

### Planned Features
1. **UI Management**: Admin interface for managing globally disabled groups
2. **Advanced Filters**: More sophisticated filtering options and conditions
3. **Temporary Restrictions**: Time-based group restrictions with automatic expiration
4. **Notification System**: Automated notifications when groups are restricted/unrestricted

### Integration Opportunities
1. **LDAP/AD Integration**: Sync group restrictions with directory services
2. **Workflow Integration**: Integration with approval workflows for group changes
3. **Monitoring Integration**: Enhanced integration with monitoring and alerting systems
4. **API Extensions**: Additional API endpoints for programmatic group management
