# Logs and Analytics Automated Cleanup

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Troubleshooting](./)

---

## Overview

The Logs and Analytics Automated Cleanup system provides automated data retention management for audit logs and advanced analytics data. This system runs independently of the analytics feature toggle, ensuring consistent data management regardless of whether analytics are currently enabled.

## Key Features

### 🔄 **Automated Cleanup Service**
- **Daily Schedule**: Runs automatically at 2:00 AM every day
- **Independent Operation**: Functions regardless of analytics enable/disable state
- **Transaction Safety**: Uses database transactions to ensure data integrity
- **Comprehensive Logging**: All operations are logged with detailed statistics

### 📊 **Data Types Managed**
- **Audit Logs**: User actions, system events, configuration changes
- **API Key Usage Events**: Individual API key usage records
- **API Key Usage Stats**: Aggregated API key usage statistics
- **Session Usage Events**: Individual session activity records
- **Session Usage Stats**: Aggregated session usage statistics

### ⚙️ **Configurable Retention**
- **Setting**: `logsAnalyticsRetentionDays` in Global Settings
- **Range**: 1-365 days (default: 90 days)
- **Validation**: Both UI and API enforce the 1-365 day range
- **Real-time Updates**: Changes take effect immediately for future cleanup operations

## Technical Implementation

### Service Architecture

The cleanup service mirrors the MAC Address Tracking cleanup architecture for consistency:

```typescript
class LogsAnalyticsCleanupService {
  // Automatic startup and scheduling
  start(): void
  stop(): void
  
  // Manual cleanup with custom retention
  cleanupOldData(retentionDays: number): Promise<CleanupResult>
  
  // Private scheduled cleanup using global settings
  private runAutomaticCleanup(): Promise<void>
  private scheduleAutomaticCleanup(): void
}
```

### Database Operations

**Cleanup Query Logic:**
```sql
-- Example cleanup for audit logs
DELETE FROM "AuditLog" 
WHERE "timestamp" < $1  -- cutoff date based on retention period

-- Similar queries for analytics tables:
-- ApiKeyUsageEvent, ApiKeyUsageStats, SessionUsageEvent, SessionUsageStats
```

**Transaction Safety:**
- All cleanup operations use database transactions
- Rollback on any error to maintain data consistency
- Atomic operations ensure partial cleanup doesn't occur

### Service Initialization

The service is automatically initialized during application startup:

```typescript
// src/lib/server/service-initializer.ts
import { logsAnalyticsCleanupService } from '@/lib/logs-analytics-cleanup-service';

// Service starts automatically when application starts
logsAnalyticsCleanupService.start();
```

## Configuration

### Global Settings Integration

The cleanup system integrates with the Global Settings management:

**UI Configuration:**
- Located in Settings → "Logs and Advanced Analytics" card
- Input field with validation (1-365 days)
- Auto-save functionality on field blur
- Real-time validation feedback

**API Configuration:**
- Endpoint: `POST /api/settings/global`
- Field: `logsAnalyticsRetentionDays`
- Validation: Server-side validation enforces 1-365 day range
- Audit Logging: Changes are logged with `updateLogsAnalyticsRetention` action

### Default Values

```json
{
  "logsAnalyticsRetentionDays": 90
}
```

## Cleanup Results

### Return Format

```typescript
interface CleanupResult {
  logsDeleted: number;
  analyticsDeleted: {
    apiKeyUsageEvents: number;
    apiKeyUsageStats: number;
    sessionUsageEvents: number;
    sessionUsageStats: number;
  };
  totalDeleted: number;
}
```

### Example Response

```json
{
  "logsDeleted": 1239,
  "analyticsDeleted": {
    "apiKeyUsageEvents": 0,
    "apiKeyUsageStats": 0,
    "sessionUsageEvents": 6745,
    "sessionUsageStats": 5
  },
  "totalDeleted": 7989
}
```

## Monitoring and Logging

### Log Messages

**Successful Cleanup:**
```
[INFO] Starting logs and analytics cleanup with cutoff date: 2025-09-26T13:39:03.107Z
[INFO] Cleaned up 1239 audit logs and 6750 analytics records (7989 total) older than 90 days
```

**No Data to Clean:**
```
[DEBUG] Automatic logs and analytics cleanup completed: no old records found
```

**Error Handling:**
```
[ERROR] Logs and analytics cleanup failed: [error details]
```

### Health Monitoring

Monitor cleanup effectiveness through:
- **Service Status**: Verify service is running and scheduled properly
- **Cleanup Statistics**: Track records removed in each cleanup cycle
- **Database Growth**: Monitor database size trends over time
- **Error Rates**: Track cleanup failures and investigate issues

## Relationship to MAC Tracking Cleanup

Both cleanup systems share the same architectural patterns:

**Similarities:**
- Daily 2:00 AM schedule
- Independent service operation
- Transaction-based cleanup
- 1-365 day retention range validation
- Comprehensive logging

**Differences:**
- **Data Types**: Logs/analytics vs MAC tracking data
- **Service Toggle**: Logs cleanup runs regardless of analytics state; MAC cleanup respects MAC tracking enable/disable
- **Cleanup Criteria**: Different data age and relationship criteria

## Best Practices

### Configuration Recommendations

- **Start with 90-day retention** for balanced storage and compliance needs
- **Monitor database growth** during initial deployment
- **Adjust retention based on compliance requirements** (some regulations require longer retention)
- **Consider storage capacity** when setting longer retention periods

### Operational Guidelines

- **Regular Monitoring**: Check cleanup logs for successful operations
- **Storage Planning**: Factor retention settings into storage capacity planning
- **Compliance Alignment**: Ensure retention periods meet regulatory requirements
- **Performance Impact**: Cleanup runs during low-usage hours (2:00 AM) to minimize impact

### Security Considerations

- **Audit Trail**: Cleanup operations are themselves logged for audit purposes
- **Data Retention Compliance**: Ensure retention periods align with data protection regulations
- **Access Control**: Only SUPER_ADMIN users can modify retention settings
- **Backup Strategy**: Consider backup retention in relation to cleanup policies

## Troubleshooting

### Common Issues

**Service Not Running:**
- Check application startup logs for service initialization errors
- Verify database connectivity
- Restart application to reinitialize services

**Cleanup Not Occurring:**
- Check logs around 2:00 AM for cleanup execution
- Verify global settings contain valid retention days value
- Check for database transaction errors

**Unexpected Data Retention:**
- Verify retention days setting in Global Settings
- Check for timezone issues affecting cleanup schedule
- Ensure cleanup service is using correct cutoff date calculation

### Diagnostic Commands

**Check Service Status:**
```bash
# Check application logs for service initialization
grep "logs and analytics cleanup service" /var/log/application.log

# Check for scheduled cleanup execution
grep "Starting logs and analytics cleanup" /var/log/application.log
```

**Manual Cleanup Test:**
```typescript
// Test cleanup functionality (development/testing only)
const result = await logsAnalyticsCleanupService.cleanupOldData(1);
console.log('Cleanup result:', result);
```

## API Reference

For complete API documentation including the global settings endpoints that control retention configuration, see [Settings Endpoints](../api/api_docs/03_settings_endpoints.md).

The cleanup system does not expose direct API endpoints for manual cleanup operations, maintaining simplicity and security by operating purely as an automated background service.

---

## 📋 Section Navigation

### Troubleshooting Guides
- [📊 Analytics Overview](./ANALYTICS_OVERVIEW.md)
- [🧹 Logs Analytics Cleanup](./LOGS_ANALYTICS_CLEANUP.md) *(Current)*
- [⚡ Permissions Caching Optimization](./PERMISSIONS_CACHING_OPTIMIZATION.md)
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

**Last Updated**: 2025-11-06 | **Section**: Troubleshooting | **Category**: Data Management
