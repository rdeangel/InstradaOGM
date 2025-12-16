-- Consolidated migration: All changes since 20250712_baseline
-- This migration combines:
-- - add_group_types
-- - add_usage_analytics_tables
-- - add_remove_self_service_page
-- - add_mac_tracking
-- - add_privacy_mac_and_dhcp_reservation
-- - add_mac_data_retention
-- - add_permissions_caching_optimization
-- - add_password_policy_fields
-- - add_mac_exclusion_feature

-- ========================================
-- GROUP TYPES SUPPORT (add_group_types)
-- ========================================

-- Update OpnsenseGroupDisplay table with groupType column
CREATE TABLE "new_OpnsenseGroupDisplay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opnsenseUuid" TEXT NOT NULL,
    "friendlyName" TEXT,
    "iconIdentifier" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "groupType" TEXT NOT NULL DEFAULT 'SingleSelect'
);

-- Create unique index
CREATE UNIQUE INDEX "new_OpnsenseGroupDisplay_opnsenseUuid_key" ON "new_OpnsenseGroupDisplay"("opnsenseUuid");

-- Copy data
INSERT INTO "new_OpnsenseGroupDisplay" ("id", "opnsenseUuid", "friendlyName", "iconIdentifier", "createdAt", "updatedAt", "groupType") 
SELECT "id", "opnsenseUuid", "friendlyName", "iconIdentifier", "createdAt", "updatedAt", 'SingleSelect' FROM "OpnsenseGroupDisplay";

-- Drop old table
DROP TABLE "OpnsenseGroupDisplay";

-- Rename new table
ALTER TABLE "new_OpnsenseGroupDisplay" RENAME TO "OpnsenseGroupDisplay";

-- Update GlobalSettings table with all new fields (including MAC exclusion settings)
CREATE TABLE "new_GlobalSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enableRegistration" BOOLEAN NOT NULL DEFAULT false,
    "enableRenamingSelfServicePage" BOOLEAN NOT NULL DEFAULT false,
    "enableRenamingDeviceManagementPage" BOOLEAN NOT NULL DEFAULT false,
    "allowedNetworks" JSONB NOT NULL DEFAULT '[]',
    "customLucideIcons" JSONB NOT NULL DEFAULT '[]',
    "customEmojis" JSONB NOT NULL DEFAULT '[]',
    "customFlags" JSONB NOT NULL DEFAULT '[]',
    "enableGroupTypes" BOOLEAN NOT NULL DEFAULT false,
    "enableSelfServiceMultiSelect" BOOLEAN NOT NULL DEFAULT false,
    "singleSelectName" TEXT NOT NULL DEFAULT 'Single Select',
    "multiSelectName" TEXT NOT NULL DEFAULT 'Multi Select',
    "singleSelectIcon" TEXT NOT NULL DEFAULT 'DEFAULT',
    "multiSelectIcon" TEXT NOT NULL DEFAULT 'DEFAULT',
    "enableAdvancedAnalytics" BOOLEAN NOT NULL DEFAULT false,
    "logsAnalyticsRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "removeSelfServicePage" BOOLEAN NOT NULL DEFAULT false,
    "enableMacTracking" BOOLEAN NOT NULL DEFAULT false,
    "macTrackingInterval" INTEGER NOT NULL DEFAULT 5,
    "macInactiveTimeout" INTEGER NOT NULL DEFAULT 1440,
    "macDataRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "enableApplicationSubtitle" BOOLEAN NOT NULL DEFAULT false,
    "subtitleText" TEXT,
    "enableLoginPageSubtitle" BOOLEAN NOT NULL DEFAULT false,
    "lastModified" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enableMacExclusions" BOOLEAN NOT NULL DEFAULT true,
    "macExclusionRetentionDays" INTEGER NOT NULL DEFAULT 365
);

-- Copy data from old GlobalSettings table
INSERT INTO "new_GlobalSettings" (
    "id", "enableRegistration", "enableRenamingSelfServicePage", "enableRenamingDeviceManagementPage",
    "allowedNetworks", "customLucideIcons", "customEmojis", "customFlags",
    "enableGroupTypes", "enableSelfServiceMultiSelect", "singleSelectName", "multiSelectName",
    "singleSelectIcon", "multiSelectIcon", "enableAdvancedAnalytics", "logsAnalyticsRetentionDays", "removeSelfServicePage",
    "enableMacTracking", "macTrackingInterval", "macInactiveTimeout", "macDataRetentionDays",
    "enableApplicationSubtitle", "subtitleText", "enableLoginPageSubtitle", "lastModified",
    "enableMacExclusions", "macExclusionRetentionDays"
)
SELECT
    "id", "enableRegistration", "enableRenamingSelfServicePage", "enableRenamingDeviceManagementPage",
    "allowedNetworks", "customLucideIcons", "customEmojis", "customFlags",
    false, true, 'Single Select', 'Multi Select', 'DEFAULT', 'DEFAULT', false, 90, false,
    false, 5, 1440, 90, false, NULL, false, CURRENT_TIMESTAMP,
    true, 365
FROM "GlobalSettings";

-- Drop old table
DROP TABLE "GlobalSettings";

-- Rename new table
ALTER TABLE "new_GlobalSettings" RENAME TO "GlobalSettings";

-- ========================================
-- USAGE ANALYTICS TABLES (add_usage_analytics_tables)
-- ========================================

-- Create ApiKeyUsageStats table for daily aggregated statistics
CREATE TABLE "ApiKeyUsageStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apiKeyId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "totalRequests" INTEGER NOT NULL DEFAULT 0,
    "successfulRequests" INTEGER NOT NULL DEFAULT 0,
    "failedRequests" INTEGER NOT NULL DEFAULT 0,
    "rateLimitHits" INTEGER NOT NULL DEFAULT 0,
    "uniqueEndpoints" INTEGER NOT NULL DEFAULT 0,
    "uniqueIpAddresses" INTEGER NOT NULL DEFAULT 0,
    "uniqueUserAgents" INTEGER NOT NULL DEFAULT 0,
    "avgResponseTime" REAL,
    "peakHourlyUsage" INTEGER NOT NULL DEFAULT 0,
    "peakHourlyUsageHour" INTEGER,
    "topEndpoints" TEXT,
    "topIpAddresses" TEXT,
    "topUserAgents" TEXT,
    "errorsByType" TEXT,
    "usageByHour" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApiKeyUsageStats_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create ApiKeyUsageEvent table for detailed event tracking
CREATE TABLE "ApiKeyUsageEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apiKeyId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseTime" REAL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestSize" INTEGER,
    "responseSize" INTEGER,
    "errorType" TEXT,
    "errorMessage" TEXT,
    "rateLimitHit" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ApiKeyUsageEvent_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create SessionUsageStats table for daily aggregated statistics
CREATE TABLE "SessionUsageStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT,
    "date" DATETIME NOT NULL,
    "totalRequests" INTEGER NOT NULL DEFAULT 0,
    "apiCalls" INTEGER NOT NULL DEFAULT 0,
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "uiActions" INTEGER NOT NULL DEFAULT 0,
    "successfulRequests" INTEGER NOT NULL DEFAULT 0,
    "failedRequests" INTEGER NOT NULL DEFAULT 0,
    "uniqueEndpoints" INTEGER NOT NULL DEFAULT 0,
    "uniquePages" INTEGER NOT NULL DEFAULT 0,
    "uniqueIpAddresses" INTEGER NOT NULL DEFAULT 0,
    "uniqueUserAgents" INTEGER NOT NULL DEFAULT 0,
    "avgResponseTime" REAL,
    "peakHourlyUsage" INTEGER NOT NULL DEFAULT 0,
    "peakHourlyUsageHour" INTEGER,
    "topEndpoints" JSONB,
    "topPages" JSONB,
    "topIpAddresses" JSONB,
    "topUserAgents" JSONB,
    "actionsByType" JSONB,
    "errorsByType" JSONB,
    "usageByHour" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SessionUsageStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Create SessionUsageEvent table for individual session events
CREATE TABLE "SessionUsageEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "statusCode" INTEGER,
    "responseTime" REAL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "pageUrl" TEXT,
    "referrer" TEXT,
    "requestSize" INTEGER,
    "responseSize" INTEGER,
    "errorType" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    CONSTRAINT "SessionUsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Create unique indexes for ApiKeyUsageStats
CREATE UNIQUE INDEX "ApiKeyUsageStats_apiKeyId_date_key" ON "ApiKeyUsageStats"("apiKeyId", "date");

-- Create indexes for ApiKeyUsageStats
CREATE INDEX "ApiKeyUsageStats_apiKeyId_date_idx" ON "ApiKeyUsageStats"("apiKeyId", "date");
CREATE INDEX "ApiKeyUsageStats_date_idx" ON "ApiKeyUsageStats"("date");

-- Create indexes for ApiKeyUsageEvent
CREATE INDEX "ApiKeyUsageEvent_apiKeyId_timestamp_idx" ON "ApiKeyUsageEvent"("apiKeyId", "timestamp");
CREATE INDEX "ApiKeyUsageEvent_timestamp_idx" ON "ApiKeyUsageEvent"("timestamp");
CREATE INDEX "ApiKeyUsageEvent_endpoint_idx" ON "ApiKeyUsageEvent"("endpoint");

-- Create unique indexes for SessionUsageStats
CREATE UNIQUE INDEX "SessionUsageStats_sessionToken_date_key" ON "SessionUsageStats"("sessionToken", "date");

-- Create indexes for SessionUsageStats
CREATE INDEX "SessionUsageStats_sessionToken_date_idx" ON "SessionUsageStats"("sessionToken", "date");
CREATE INDEX "SessionUsageStats_userId_date_idx" ON "SessionUsageStats"("userId", "date");
CREATE INDEX "SessionUsageStats_date_idx" ON "SessionUsageStats"("date");

-- Create indexes for SessionUsageEvent
CREATE INDEX "SessionUsageEvent_sessionToken_timestamp_idx" ON "SessionUsageEvent"("sessionToken", "timestamp");
CREATE INDEX "SessionUsageEvent_userId_timestamp_idx" ON "SessionUsageEvent"("userId", "timestamp");
CREATE INDEX "SessionUsageEvent_timestamp_idx" ON "SessionUsageEvent"("timestamp");
CREATE INDEX "SessionUsageEvent_endpoint_idx" ON "SessionUsageEvent"("endpoint");
CREATE INDEX "SessionUsageEvent_actionType_idx" ON "SessionUsageEvent"("actionType");

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- ========================================
-- MAC TRACKING SUPPORT (add_mac_tracking)
-- ========================================

-- Create MacAddress table
CREATE TABLE "MacAddress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "macAddress" TEXT NOT NULL,
    "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deviceName" TEXT,
    "vendor" TEXT,
    "isPrivacyMac" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Create MacIpAssociation table
CREATE TABLE "MacIpAssociation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "macAddressId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "networkInterface" TEXT,
    "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDhcpReserved" BOOLEAN NOT NULL DEFAULT false,
    "hasDhcpConflict" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MacIpAssociation_macAddressId_fkey" FOREIGN KEY ("macAddressId") REFERENCES "MacAddress" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create unique index for MacAddress
CREATE UNIQUE INDEX "MacAddress_macAddress_key" ON "MacAddress"("macAddress");

-- Create indexes for MacAddress
CREATE INDEX "MacAddress_macAddress_idx" ON "MacAddress"("macAddress");
CREATE INDEX "MacAddress_lastSeen_idx" ON "MacAddress"("lastSeen");
CREATE INDEX "MacAddress_isActive_idx" ON "MacAddress"("isActive");
CREATE INDEX "MacAddress_isPrivacyMac_idx" ON "MacAddress"("isPrivacyMac");

-- Create indexes for MacIpAssociation
CREATE INDEX "MacIpAssociation_macAddressId_ipAddress_idx" ON "MacIpAssociation"("macAddressId", "ipAddress");
CREATE INDEX "MacIpAssociation_ipAddress_idx" ON "MacIpAssociation"("ipAddress");
CREATE INDEX "MacIpAssociation_lastSeen_idx" ON "MacIpAssociation"("lastSeen");
CREATE INDEX "MacIpAssociation_isActive_idx" ON "MacIpAssociation"("isActive");
CREATE INDEX "MacIpAssociation_isDhcpReserved_idx" ON "MacIpAssociation"("isDhcpReserved");

-- ========================================
-- PERMISSIONS CACHING OPTIMIZATION (add_permissions_caching_optimization)
-- ========================================

-- Update Group table with permissionsLastModified column
CREATE TABLE "new_Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "permissionsLastModified" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create unique index for new Group table
CREATE UNIQUE INDEX "new_Group_name_key" ON "new_Group"("name");

-- Copy data from old Group table
INSERT INTO "new_Group" ("id", "name", "description", "createdAt", "updatedAt", "permissionsLastModified")
SELECT "id", "name", "description", "createdAt", "updatedAt", CURRENT_TIMESTAMP FROM "Group";

-- Drop old table
DROP TABLE "Group";

-- Rename new table
ALTER TABLE "new_Group" RENAME TO "Group";

-- ========================================
-- PASSWORD POLICY FIELDS (add_password_policy_fields)
-- ========================================

-- Update User table with password policy fields
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "username" TEXT,
    "email" TEXT,
    "emailVerified" DATETIME,
    "image" TEXT,
    "password" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastActive" DATETIME,
    "is2FAEnabled" BOOLEAN NOT NULL DEFAULT false,
    "passwordResetToken" TEXT,
    "passwordResetExpires" DATETIME,
    "totpSecret" TEXT,
    "backupCodes" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "passwordChangedAt" DATETIME
);

-- Create unique indexes for new User table
CREATE UNIQUE INDEX "new_User_username_key" ON "new_User"("username");
CREATE UNIQUE INDEX "new_User_email_key" ON "new_User"("email");

-- Copy data from old User table
INSERT INTO "new_User" (
    "id", "name", "username", "email", "emailVerified", "image", "password", "role",
    "createdAt", "updatedAt", "lastActive", "is2FAEnabled", "passwordResetToken",
    "passwordResetExpires", "totpSecret", "backupCodes", "mustChangePassword", "passwordChangedAt"
)
SELECT
    "id", "name", "username", "email", "emailVerified", "image", "password", "role",
    "createdAt", "updatedAt", "lastActive", "is2FAEnabled", "passwordResetToken",
    "passwordResetExpires", "totpSecret", "backupCodes", false, NULL
FROM "User";

-- Drop old table
DROP TABLE "User";

-- Rename new table
ALTER TABLE "new_User" RENAME TO "User";

-- ========================================
-- MAC EXCLUSION FEATURE (add_mac_exclusion_feature)
-- ========================================

-- Create MacExclusion table for managing MAC address exclusions
CREATE TABLE "MacExclusion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "macAddressId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "excludedBy" TEXT,
    "excludedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastModifiedBy" TEXT,
    "lastModifiedAt" DATETIME NOT NULL,
    "exclusionMode" TEXT NOT NULL DEFAULT 'FULL',
    CONSTRAINT "MacExclusion_macAddressId_fkey" FOREIGN KEY ("macAddressId") REFERENCES "MacAddress"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create MacIpHistoryEntry table for tracking IP address history
CREATE TABLE "MacIpHistoryEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "macAddressId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "networkInterface" TEXT,
    "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detectionCount" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "MacIpHistoryEntry_macAddressId_fkey" FOREIGN KEY ("macAddressId") REFERENCES "MacAddress"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create unique index for MacExclusion (one-to-one relationship with MacAddress)
CREATE UNIQUE INDEX "MacExclusion_macAddressId_key" ON "MacExclusion"("macAddressId");

-- Create performance indexes for MacExclusion
CREATE INDEX "MacExclusion_enabled_idx" ON "MacExclusion"("enabled");
CREATE INDEX "MacExclusion_excludedAt_idx" ON "MacExclusion"("excludedAt");
CREATE INDEX "MacExclusion_exclusionMode_idx" ON "MacExclusion"("exclusionMode");

-- Create unique index for MacIpHistoryEntry (unique MAC-IP combination)
CREATE UNIQUE INDEX "MacIpHistoryEntry_macAddressId_ipAddress_key" ON "MacIpHistoryEntry"("macAddressId", "ipAddress");

-- Create performance indexes for MacIpHistoryEntry
CREATE INDEX "MacIpHistoryEntry_macAddressId_idx" ON "MacIpHistoryEntry"("macAddressId");
CREATE INDEX "MacIpHistoryEntry_ipAddress_idx" ON "MacIpHistoryEntry"("ipAddress");
CREATE INDEX "MacIpHistoryEntry_lastSeen_idx" ON "MacIpHistoryEntry"("lastSeen");

-- ========================================
-- MAC IP ACTIVATION PERIOD (add_mac_ip_activation_period)
-- ========================================

CREATE TABLE "MacIpActivationPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "macAddressId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "networkInterface" TEXT,
    "hostname" TEXT,
    "hostAlias" TEXT,
    "activatedAt" DATETIME NOT NULL,
    "deactivatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("macAddressId") REFERENCES "MacAddress"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MacIpActivationPeriod_macAddressId_idx" ON "MacIpActivationPeriod"("macAddressId");
CREATE INDEX "MacIpActivationPeriod_ipAddress_idx" ON "MacIpActivationPeriod"("ipAddress");
CREATE INDEX "MacIpActivationPeriod_activatedAt_idx" ON "MacIpActivationPeriod"("activatedAt");
