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

-- Add group type support to OpnsenseGroupDisplay table
ALTER TABLE "OpnsenseGroupDisplay" ADD COLUMN "groupType" TEXT NOT NULL DEFAULT 'SingleSelect';

-- Add group type settings to GlobalSettings table
ALTER TABLE "GlobalSettings" ADD COLUMN "enableGroupTypes" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GlobalSettings" ADD COLUMN "enableSelfServiceMultiSelect" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GlobalSettings" ADD COLUMN "singleSelectName" TEXT NOT NULL DEFAULT 'Single Select';
ALTER TABLE "GlobalSettings" ADD COLUMN "multiSelectName" TEXT NOT NULL DEFAULT 'Multi Select';
ALTER TABLE "GlobalSettings" ADD COLUMN "singleSelectIcon" TEXT NOT NULL DEFAULT 'DEFAULT';
ALTER TABLE "GlobalSettings" ADD COLUMN "multiSelectIcon" TEXT NOT NULL DEFAULT 'DEFAULT';

-- ========================================
-- USAGE ANALYTICS TABLES (add_usage_analytics_tables)
-- ========================================

-- Create ApiKeyUsageStats table for daily aggregated statistics
CREATE TABLE "ApiKeyUsageStats" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalRequests" INTEGER NOT NULL DEFAULT 0,
    "successfulRequests" INTEGER NOT NULL DEFAULT 0,
    "failedRequests" INTEGER NOT NULL DEFAULT 0,
    "rateLimitHits" INTEGER NOT NULL DEFAULT 0,
    "uniqueEndpoints" INTEGER NOT NULL DEFAULT 0,
    "uniqueIpAddresses" INTEGER NOT NULL DEFAULT 0,
    "uniqueUserAgents" INTEGER NOT NULL DEFAULT 0,
    "avgResponseTime" DOUBLE PRECISION,
    "peakHourlyUsage" INTEGER NOT NULL DEFAULT 0,
    "peakHourlyUsageHour" INTEGER,
    "topEndpoints" JSONB,
    "topIpAddresses" JSONB,
    "topUserAgents" JSONB,
    "errorsByType" JSONB,
    "usageByHour" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKeyUsageStats_pkey" PRIMARY KEY ("id")
);

-- Create ApiKeyUsageEvent table for detailed event tracking
CREATE TABLE "ApiKeyUsageEvent" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseTime" DOUBLE PRECISION,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestSize" INTEGER,
    "responseSize" INTEGER,
    "errorType" TEXT,
    "errorMessage" TEXT,
    "rateLimitHit" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ApiKeyUsageEvent_pkey" PRIMARY KEY ("id")
);

-- Create SessionUsageStats table for daily aggregated statistics
CREATE TABLE "SessionUsageStats" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
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
    "avgResponseTime" DOUBLE PRECISION,
    "peakHourlyUsage" INTEGER NOT NULL DEFAULT 0,
    "peakHourlyUsageHour" INTEGER,
    "topEndpoints" JSONB,
    "topPages" JSONB,
    "topIpAddresses" JSONB,
    "topUserAgents" JSONB,
    "actionsByType" JSONB,
    "errorsByType" JSONB,
    "usageByHour" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionUsageStats_pkey" PRIMARY KEY ("id")
);

-- Create SessionUsageEvent table for individual session events
CREATE TABLE "SessionUsageEvent" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "statusCode" INTEGER,
    "responseTime" DOUBLE PRECISION,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "pageUrl" TEXT,
    "referrer" TEXT,
    "requestSize" INTEGER,
    "responseSize" INTEGER,
    "errorType" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,

    CONSTRAINT "SessionUsageEvent_pkey" PRIMARY KEY ("id")
);

-- Create unique constraints for ApiKeyUsageStats
CREATE UNIQUE INDEX "ApiKeyUsageStats_apiKeyId_date_key" ON "ApiKeyUsageStats"("apiKeyId", "date");

-- Create indexes for ApiKeyUsageStats
CREATE INDEX "ApiKeyUsageStats_apiKeyId_date_idx" ON "ApiKeyUsageStats"("apiKeyId", "date");
CREATE INDEX "ApiKeyUsageStats_date_idx" ON "ApiKeyUsageStats"("date");

-- Create indexes for ApiKeyUsageEvent
CREATE INDEX "ApiKeyUsageEvent_apiKeyId_timestamp_idx" ON "ApiKeyUsageEvent"("apiKeyId", "timestamp");
CREATE INDEX "ApiKeyUsageEvent_timestamp_idx" ON "ApiKeyUsageEvent"("timestamp");
CREATE INDEX "ApiKeyUsageEvent_endpoint_idx" ON "ApiKeyUsageEvent"("endpoint");

-- Create unique constraints for SessionUsageStats
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

-- Add foreign key constraints for ApiKey tables
ALTER TABLE "ApiKeyUsageStats" ADD CONSTRAINT "ApiKeyUsageStats_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiKeyUsageEvent" ADD CONSTRAINT "ApiKeyUsageEvent_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add foreign key constraints for Session tables (only userId, not sessionToken)
-- sessionToken is kept as a regular string field to avoid dependency on NextAuth Session table
-- This allows session tracking to work independently of NextAuth's Session lifecycle
-- userId uses SET NULL to preserve analytics data when users are deleted
ALTER TABLE "SessionUsageStats" ADD CONSTRAINT "SessionUsageStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SessionUsageEvent" ADD CONSTRAINT "SessionUsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add enableAdvancedAnalytics field to GlobalSettings table
ALTER TABLE "GlobalSettings" ADD COLUMN "enableAdvancedAnalytics" BOOLEAN NOT NULL DEFAULT false;

-- Add logs and analytics retention field to GlobalSettings table
ALTER TABLE "GlobalSettings" ADD COLUMN "logsAnalyticsRetentionDays" INTEGER NOT NULL DEFAULT 90;

-- ========================================
-- REMOVE SELF SERVICE PAGE (add_remove_self_service_page)
-- ========================================

-- Add removeSelfServicePage field to GlobalSettings table
ALTER TABLE "GlobalSettings" ADD COLUMN "removeSelfServicePage" BOOLEAN NOT NULL DEFAULT false;

-- ========================================
-- MAC TRACKING SUPPORT (20250915120425_add_mac_tracking)
-- ========================================

-- Add MAC tracking settings to GlobalSettings table
ALTER TABLE "GlobalSettings" ADD COLUMN "enableMacTracking" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GlobalSettings" ADD COLUMN "macTrackingInterval" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "GlobalSettings" ADD COLUMN "macInactiveTimeout" INTEGER NOT NULL DEFAULT 1440;

-- Create MacAddress table
CREATE TABLE "MacAddress" (
    "id" TEXT NOT NULL,
    "macAddress" TEXT NOT NULL,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deviceName" TEXT,
    "vendor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MacAddress_pkey" PRIMARY KEY ("id")
);

-- Create MacIpAssociation table
CREATE TABLE "MacIpAssociation" (
    "id" TEXT NOT NULL,
    "macAddressId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "networkInterface" TEXT,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MacIpAssociation_pkey" PRIMARY KEY ("id")
);

-- Create unique index for MacAddress
CREATE UNIQUE INDEX "MacAddress_macAddress_key" ON "MacAddress"("macAddress");

-- Create indexes for MacAddress
CREATE INDEX "MacAddress_macAddress_idx" ON "MacAddress"("macAddress");
CREATE INDEX "MacAddress_lastSeen_idx" ON "MacAddress"("lastSeen");
CREATE INDEX "MacAddress_isActive_idx" ON "MacAddress"("isActive");

-- Create indexes for MacIpAssociation
CREATE INDEX "MacIpAssociation_macAddressId_ipAddress_idx" ON "MacIpAssociation"("macAddressId", "ipAddress");
CREATE INDEX "MacIpAssociation_ipAddress_idx" ON "MacIpAssociation"("ipAddress");
CREATE INDEX "MacIpAssociation_lastSeen_idx" ON "MacIpAssociation"("lastSeen");
CREATE INDEX "MacIpAssociation_isActive_idx" ON "MacIpAssociation"("isActive");

-- Add foreign key constraint for MacIpAssociation
ALTER TABLE "MacIpAssociation" ADD CONSTRAINT "MacIpAssociation_macAddressId_fkey" FOREIGN KEY ("macAddressId") REFERENCES "MacAddress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ========================================
-- PRIVACY MAC AND DHCP RESERVATION (add_privacy_mac_and_dhcp_reservation)
-- ========================================

-- Add isPrivacyMac field to MacAddress table
ALTER TABLE "MacAddress" ADD COLUMN "isPrivacyMac" BOOLEAN NOT NULL DEFAULT false;

-- Add isDhcpReserved field to MacIpAssociation table
ALTER TABLE "MacIpAssociation" ADD COLUMN "isDhcpReserved" BOOLEAN NOT NULL DEFAULT false;

-- Add hasDhcpConflict field to MacIpAssociation table
ALTER TABLE "MacIpAssociation" ADD COLUMN "hasDhcpConflict" BOOLEAN NOT NULL DEFAULT false;

-- Create indexes for new fields
CREATE INDEX "MacAddress_isPrivacyMac_idx" ON "MacAddress"("isPrivacyMac");
CREATE INDEX "MacIpAssociation_isDhcpReserved_idx" ON "MacIpAssociation"("isDhcpReserved");

-- ========================================
-- MAC DATA RETENTION (add_mac_data_retention)
-- ========================================

-- Add macDataRetentionDays field to GlobalSettings table
ALTER TABLE "GlobalSettings" ADD COLUMN "macDataRetentionDays" INTEGER NOT NULL DEFAULT 90;

-- ========================================
-- APPLICATION SUBTITLE SUPPORT (add_application_subtitle)
-- ========================================

-- Add application subtitle settings to GlobalSettings table
ALTER TABLE "GlobalSettings" ADD COLUMN "enableApplicationSubtitle" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GlobalSettings" ADD COLUMN "subtitleText" TEXT;
ALTER TABLE "GlobalSettings" ADD COLUMN "enableLoginPageSubtitle" BOOLEAN NOT NULL DEFAULT false;

-- ========================================
-- PERMISSIONS CACHING OPTIMIZATION (add_permissions_caching_optimization)
-- ========================================

-- Add permissionsLastModified timestamp to Group table for caching optimization
ALTER TABLE "Group" ADD COLUMN "permissionsLastModified" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add lastModified timestamp to GlobalSettings table for cache invalidation
ALTER TABLE "GlobalSettings" ADD COLUMN "lastModified" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ========================================
-- PASSWORD POLICY FIELDS (add_password_policy_fields)
-- ========================================

-- Add password policy fields to User table
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- ========================================
-- MAC EXCLUSION FEATURE (add_mac_exclusion_feature)
-- ========================================

-- Create MacExclusion table for managing MAC address exclusions
CREATE TABLE "MacExclusion" (
    "id" TEXT NOT NULL,
    "macAddressId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "excludedBy" TEXT,
    "excludedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastModifiedBy" TEXT,
    "lastModifiedAt" TIMESTAMP(3) NOT NULL,
    "exclusionMode" TEXT NOT NULL DEFAULT 'FULL',

    CONSTRAINT "MacExclusion_pkey" PRIMARY KEY ("id")
);

-- Create MacIpHistoryEntry table for tracking IP address history
CREATE TABLE "MacIpHistoryEntry" (
    "id" TEXT NOT NULL,
    "macAddressId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "networkInterface" TEXT,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detectionCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MacIpHistoryEntry_pkey" PRIMARY KEY ("id")
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

-- Add foreign key constraint for MacExclusion
ALTER TABLE "MacExclusion" ADD CONSTRAINT "MacExclusion_macAddressId_fkey"
    FOREIGN KEY ("macAddressId") REFERENCES "MacAddress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add foreign key constraint for MacIpHistoryEntry
ALTER TABLE "MacIpHistoryEntry" ADD CONSTRAINT "MacIpHistoryEntry_macAddressId_fkey"
    FOREIGN KEY ("macAddressId") REFERENCES "MacAddress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add MAC exclusion settings to GlobalSettings table
ALTER TABLE "GlobalSettings" ADD COLUMN "enableMacExclusions" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GlobalSettings" ADD COLUMN "macExclusionRetentionDays" INTEGER NOT NULL DEFAULT 365;

-- ========================================
-- MAC IP ACTIVATION PERIOD (add_mac_ip_activation_period)
-- ========================================

CREATE TABLE "MacIpActivationPeriod" (
    "id" TEXT NOT NULL,
    "macAddressId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "networkInterface" TEXT,
    "hostname" TEXT,
    "hostAlias" TEXT,
    "activatedAt" TIMESTAMP(3) NOT NULL,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MacIpActivationPeriod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MacIpActivationPeriod_macAddressId_idx" ON "MacIpActivationPeriod"("macAddressId");
CREATE INDEX "MacIpActivationPeriod_ipAddress_idx" ON "MacIpActivationPeriod"("ipAddress");
CREATE INDEX "MacIpActivationPeriod_activatedAt_idx" ON "MacIpActivationPeriod"("activatedAt");

ALTER TABLE "MacIpActivationPeriod" ADD CONSTRAINT "MacIpActivationPeriod_macAddressId_fkey" FOREIGN KEY ("macAddressId") REFERENCES "MacAddress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
