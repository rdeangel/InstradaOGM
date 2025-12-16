# Permissions Caching Optimization

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Troubleshooting](./)

---

## Overview

The Permissions Caching Optimization reduces unnecessary database queries for device management scope validation. This system uses timestamp-based cache invalidation to avoid expensive permission checks on every page load while maintaining accuracy and security.

## Problem Solved

Previously, the self-service access control system performed device management scope validation on every page load via the header component. This resulted in:

- **Expensive database queries** running on every page navigation
- **Performance bottlenecks** for users with complex group permissions
- **Unnecessary API calls** when permissions hadn't changed
- **Poor user experience** due to loading delays

## Performance Limitations

**IMPORTANT**: The current optimization has limitations:

### ✅ **Performance Gains Apply To:**
- **Client-side navigation**: Between pages after initial load
- **Hook re-execution**: Subsequent calls to `useSelfServiceValidation`
- **Menu visibility**: Header navigation updates

### ❌ **Performance Gains DO NOT Apply To:**
- **Initial self-service page load**: Server-side `SelfServiceGuard` always validates
- **Direct page access**: Server-side validation cannot be cached
- **Page refreshes**: Server components re-execute validation

### **Why This Limitation Exists:**
- **Server-side guards**: Run before client-side code loads, cannot access browser cache
- **Security requirements**: Server-side validation ensures security regardless of client-side cache
- **Architecture**: Next.js server components execute independently of client-side state

## Solution Architecture

### 1. Database Schema Enhancement

#### Group Permissions Tracking
Added `permissionsLastModified` timestamp field to the `Group` table:

```sql
ALTER TABLE "Group" ADD COLUMN "permissionsLastModified" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
```

This timestamp is automatically updated whenever group permissions change (host alias assignments, etc.).

#### Global Settings Cache Invalidation
Added `lastModified` timestamp field to the `GlobalSettings` table:

```sql
ALTER TABLE "GlobalSettings" ADD COLUMN "lastModified" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
```

This timestamp is automatically updated whenever global settings change, including:
- IP allow/exclude list modifications (`allowedNetworks`)
- Self-service page disable/enable (`removeSelfServicePage`)
- Any other global configuration changes that affect access control

### 2. Client-Side Caching System

**Cache Storage**: Browser localStorage with structured cache entries
**Cache Key**: `instrada-ogm_permission_cache`
**Cache Duration**: Maximum 1 hour with timestamp-based invalidation

**Cache Entry Structure**:
```typescript
interface PermissionCacheEntry {
  userId: string;
  selfServiceEnabled: boolean;
  groupTimestamps: Record<string, string>; // ISO string timestamps
  globalSettingsTimestamp: string; // ISO string timestamp for global settings
  cachedAt: string; // ISO string timestamp
  expiresAt: string; // ISO string timestamp (1 hour max)
}
```

### 3. Optimized Validation Flow

The `useSelfServiceValidation` hook now follows this optimized flow:

1. **Check Cache**: Look for existing cache entry for the current user
2. **Validate Timestamps**: Compare cached group timestamps AND global settings timestamp with current database timestamps
3. **Cache Hit**: If both group and global settings timestamps match and cache hasn't expired, use cached result
4. **Cache Miss**: If cache is invalid/expired (due to group OR global settings changes), perform full validation and cache the result
5. **Error Handling**: Clear corrupted cache and fall back to full validation

## Implementation Details

### Core Components

#### 1. Cache Management (`src/lib/group-permissions-cache.ts`)

- **`touchGroupPermissions(groupId)`**: Updates timestamp when group permissions change
- **`getUserGroupTimestamps(userId)`**: Gets current timestamps for user's groups
- **`isPermissionCacheValid()`**: Validates cache against current timestamps
- **`getPermissionCache()` / `setPermissionCache()`**: localStorage operations with error handling

#### 2. Optimized Hook (`src/hooks/use-self-service-validation.ts`)

- **Cache-first validation**: Checks cache before expensive API calls
- **Automatic cache invalidation**: Clears invalid/corrupted cache entries
- **Fallback safety**: Always falls back to full validation on cache errors

#### 3. API Endpoints

- **`/api/user/group-timestamps`**: Returns current group timestamps for cache validation
- **`/api/user/global-settings-timestamp`**: Returns current global settings timestamp for cache validation
- **Group permission endpoints**: Automatically update timestamps when permissions change
- **Global settings endpoints**: Automatically update `lastModified` timestamp when settings change

### Timestamp Update Triggers

#### Group Permission Timestamps (`permissionsLastModified`)

The `permissionsLastModified` timestamp is updated when:

- **Host alias permissions are modified** via the "Manage Host Alias Permissions" modal
  - **API Endpoint**: `PUT /api/admin/groups/[groupId]/host-alias-permissions`
  - **Function**: `touchGroupPermissions(groupId)` called after database update
  - **Trigger**: Admin assigns/removes host aliases from groups

- **Group permission operations** through admin interfaces
  - **Batch Operations**: `touchMultipleGroupPermissions(groupIds)` for multiple groups
  - **Individual Updates**: `touchGroupPermissions(groupId)` for single group changes
  - **Automatic**: Called by permission management endpoints

- **Device permissions are updated** via API endpoints
  - **Self-Service Operations**: When users modify their own device group assignments
  - **Admin Operations**: When administrators modify group permissions
  - **Bulk Updates**: When multiple permission changes occur simultaneously

#### Global Settings Timestamps (`lastModified`)

The `lastModified` timestamp in GlobalSettings is updated when:

- **IP allow/exclude lists are modified** (`allowedNetworks` field changes)
- **Self-service page is disabled/enabled** (`removeSelfServicePage` field changes)
- **Any global setting is changed** through the settings UI or API endpoints
- **Custom icons, emojis, or flags are updated**
- **Group type settings are modified**
- **Analytics or retention settings are changed**

### Cache Invalidation Logic

Cache is invalidated when:

1. **Group timestamp mismatch**: Any group's `permissionsLastModified` has changed
2. **Global settings timestamp mismatch**: GlobalSettings `lastModified` has changed
3. **Cache expiration**: More than 1 hour has passed since cache creation
4. **Group membership changes**: User gains/loses group membership
5. **localStorage corruption**: Cache data is malformed or unreadable

**Critical Fix**: The cache invalidation now properly detects global settings changes, resolving the issue where IP allow/exclude list modifications didn't immediately reflect in the header menu visibility.

## Performance Benefits

### Before Optimization
- ❌ **Database queries on every page load**
- ❌ **API calls for every navigation**
- ❌ **Complex device scope validation repeatedly**
- ❌ **Poor performance for users with many groups**

### After Optimization
- ✅ **Cache hits avoid database queries**
- ✅ **Instant validation for unchanged permissions**
- ✅ **Reduced server load and response times**
- ✅ **Better user experience with faster page loads**

## Security Considerations

### Maintained Security
- **Global settings still respected**: "Remove Self-Service Page" setting always checked
- **Network-based access preserved**: IP-based restrictions still enforced
- **Three-tier access control intact**: Full validation flow maintained for cache misses
- **Timestamp accuracy**: Permissions changes immediately invalidate cache

### Security Hardening (v2.0)

**CRITICAL SECURITY FIX**: Removed localStorage-based security decisions to prevent manipulation:

- **Removed**: `instrada-ogm_self_service_validation` localStorage dependency in `SelfServicePageGuard`
- **Enhanced**: Page guard now always validates server-side for security
- **Eliminated**: Client-side localStorage manipulation attack vector
- **Maintained**: Performance optimization through `instrada-ogm_permission_cache` (performance-only, not security)

### Cache Safety

#### **🔒 Security Model: UI Optimization ONLY**

**CRITICAL**: The permission cache is **exclusively used for UI rendering optimization** and has **NO IMPACT on actual access control enforcement**:

- **UI Elements Affected**: Header menu visibility, loading states, user experience optimization
- **Security Controls**: Always validated server-side with fresh database queries
- **Cache Tampering Impact**: Only affects user's own UI display, cannot bypass security

#### **Server-Side vs Client-Side Validation**

- **Server-Side Security (Always Authoritative)**:
  - `SelfServiceGuard.tsx` performs fresh database queries on every page load
  - API endpoints use authentication middleware with role-based access control
  - Cannot be bypassed by client-side cache manipulation

- **Client-Side Optimization (UI Performance Only)**:
  - `useSelfServiceValidation` hook caches results for menu visibility
  - Reduces API calls for better user experience
  - No security impact - cache tampering only affects visual elements

#### **Cache Protection Mechanisms**
- **User-specific caching**: Cache entries are tied to specific user IDs
- **Automatic cleanup**: Corrupted or invalid cache entries are automatically cleared
- **Fail-safe behavior**: Cache errors always fall back to full validation
- **Maximum cache duration**: 1-hour limit prevents stale permissions
- **Timestamp validation**: Both group and global settings timestamps checked

## Error Handling

### localStorage Issues
- **Unavailable localStorage**: Gracefully falls back to full validation
- **Corrupted cache data**: Automatically clears and recreates cache
- **JSON parsing errors**: Logs error and proceeds with full validation

### API Failures
- **Timestamp fetch errors**: Returns empty timestamps (forces cache invalidation)
- **Network issues**: Falls back to full validation without caching
- **Server errors**: Maintains existing behavior with proper error logging

## Monitoring and Debugging

### Logging
- **Cache hits/misses**: Detailed logging for performance monitoring
- **Timestamp validation**: Logs when cache is invalidated due to timestamp changes
- **Error tracking**: Comprehensive error logging for troubleshooting

### Debug Information
```javascript
// Check current cache in browser console
localStorage.getItem('instrada-ogm_permission_cache')

// Clear cache manually for testing
localStorage.removeItem('instrada-ogm_permission_cache')
```

## Migration and Compatibility

### Database Migration
- **Automatic migration**: New field added via existing migration file
- **Default values**: All existing groups get current timestamp as default
- **Backward compatibility**: System works with or without cached data

### Client Compatibility
- **Progressive optimization**: Caching is optional
- **Fallback behavior**: Full validation always available
- **Browser support**: Works in all browsers that support localStorage

## Conclusion

The Permissions Caching Optimization significantly improves application performance by reducing unnecessary database queries while maintaining full security and accuracy. The timestamp-based invalidation ensures users always have current permissions, while the localStorage caching provides instant validation for unchanged permissions.

This optimization is particularly beneficial for:
- **Users with complex group structures**
- **High-traffic environments**
- **Mobile users with slower connections**
- **Applications with frequent navigation patterns**

---

## 📋 Section Navigation

### Troubleshooting Guides
- [📊 Analytics Overview](./ANALYTICS_OVERVIEW.md)
- [🧹 Logs Analytics Cleanup](./LOGS_ANALYTICS_CLEANUP.md)
- [⚡ Permissions Caching Optimization](./PERMISSIONS_CACHING_OPTIMIZATION.md) *(Current)*
- [🔐 Self Service Access Control Caching](./SELF_SERVICE_ACCESS_CONTROL_CACHING.md)
- [📋 Troubleshooting Index](./TROUBLESHOOTING_INDEX.md)

### Related Documentation
- [📚 Documentation Home](../DOCUMENTATION_INDEX.md)
- [🚀 Setup Guides](../SETUP/)
- [🔧 Configuration](../CONFIGURATION/)
- [🚀 Features Overview](../FEATURES/)
- [🔍 API Reference](../api/api_docs/)

---

## 🆘 Getting Help

- [📋 Documentation Index](../DOCUMENTATION_INDEX.md) - Complete documentation overview
- [📋 Troubleshooting Index](./TROUBLESHOOTING_INDEX.md) - All troubleshooting guides
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - Report problems not covered in guides
- [💬 Discussions](https://github.com/rdeangel/InstradaOGM/discussions) - Community troubleshooting help

---

**Last Updated**: 2025-11-06 | **Section**: Troubleshooting | **Category**: Performance Optimization
