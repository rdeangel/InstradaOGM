import { NextResponse } from 'next/server';
import { logger } from '../../../../lib/logger';
import { prisma } from '../../../../lib/prisma';
import { logAuditEvent } from '../../../../lib/auditLog';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { GlobalSettings, ValidLocalNetwork, CustomLucideIcon, CustomEmoji, CustomFlag } from '@/types/settings'; // Import new types
import { getGlobalSettings } from '@/lib/server/global-settings';

import { Role } from '@/types/opnsense'; // Import Role enum
import { Prisma } from '@prisma/client'; // Import Prisma namespace
import { toJsonArrayOrUndefined } from '@/lib/utils';
import { macTrackingService } from '@/lib/mac-tracking-service';
import { usageAggregationService } from '@/lib/usage-aggregation-service';

// Define a type that aligns with Prisma's expected input for GlobalSettings Json fields
interface GlobalSettingsUpdateData {
  enableRegistration?: boolean;
  removeSelfServicePage?: boolean;
  enableRenamingSelfServicePage?: boolean;
  enableRenamingDeviceManagementPage?: boolean;
  allowedNetworks?: Prisma.InputJsonValue | typeof Prisma.JsonNull; // Use InputJsonValue for arrays, typeof JsonNull for null
  customLucideIcons?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  customEmojis?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  customFlags?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  // Group Type Settings
  enableGroupTypes?: boolean;
  enableSelfServiceMultiSelect?: boolean;
  singleSelectName?: string;
  multiSelectName?: string;
  singleSelectIcon?: string;
  multiSelectIcon?: string;
  // Advanced Analytics Settings
  enableAdvancedAnalytics?: boolean;
  // Logs and Analytics Retention Settings
  logsAnalyticsRetentionDays?: number;
  // MAC Tracking Settings
  enableMacTracking?: boolean;
  macTrackingInterval?: number;
  macInactiveTimeout?: number;
  macDataRetentionDays?: number;
  // Application Subtitle Settings
  enableApplicationSubtitle?: boolean;
  subtitleText?: string;
  enableLoginPageSubtitle?: boolean;
  // Network Aliases Settings
  manageNetworkAliasesEnabled?: boolean;
  // Cache Invalidation Support
  lastModified?: Date; // Explicitly include lastModified for cache invalidation
}

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    // Require authentication and admin privileges for accessing global settings
    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required to access global settings' }, { status: 401 });
    }

    // Check if user has super admin privileges
    if (auth.user.role !== Role.SUPER_ADMIN) {
      return NextResponse.json({ error: 'Forbidden: Super admin privileges required to access global settings' }, { status: 403 });
    }

    try {
      const ipAddress = request.headers.get('x-forwarded-for') || null;
      const globalSettings = await getGlobalSettings(ipAddress);
      return NextResponse.json(globalSettings);
    } catch (error) {
      logger.error("Error fetching global settings:", error);
      return NextResponse.json({ error: 'Failed to fetch global settings' }, { status: 500 });
    }
  });
}

export async function POST(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    try {
      if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

      const userId = auth.user.id || null;
      const ipAddress = request.headers.get('x-forwarded-for') || null;
      const userAgent = request.headers.get('user-agent') || null;

      const body = await request.json();
      const {
        enableRegistration,
        removeSelfServicePage,
        enableRenamingSelfServicePage,
        enableRenamingDeviceManagementPage,
        allowedNetworks: newAllowedNetworks, // Renamed to avoid shadowing
        customLucideIcons: rawCustomLucideIcons,
        customEmojis: rawCustomEmojis,
        customFlags: rawCustomFlags,
        // Group Type Settings
        enableGroupTypes,
        enableSelfServiceMultiSelect,
        singleSelectName,
        multiSelectName,
        singleSelectIcon,
        multiSelectIcon,
        // Advanced Analytics Settings
        enableAdvancedAnalytics,
        // Logs and Analytics Retention Settings
        logsAnalyticsRetentionDays,
        // MAC Tracking Settings
        enableMacTracking,
        macTrackingInterval,
        macInactiveTimeout,
        macDataRetentionDays,
        // Application Subtitle Settings
        enableApplicationSubtitle,
        subtitleText,
        enableLoginPageSubtitle,
        // Network Aliases Settings
        manageNetworkAliasesEnabled,
      }: Partial<GlobalSettings> = body;

      // Convert CustomLucideIcon objects to serializable format for database storage
      const serializeCustomLucideIcons = (icons: unknown[] | undefined): { name: string; icon: string }[] | undefined => {
        if (!icons || !Array.isArray(icons)) return undefined;
        return icons.map((iconItem: unknown) => {
          const icon = iconItem as { name: string; icon?: { displayName?: string; name?: string } | string };
          const iconValue = icon.icon;
          let iconName = 'Network';

          if (typeof iconValue === 'string') {
            iconName = iconValue;
          } else if (iconValue && typeof iconValue === 'object') {
            iconName = iconValue.displayName || iconValue.name || 'Network';
          }

          return {
            name: icon.name,
            icon: iconName
          };
        });
      };

      // Normalize array fields - data comes from request body so it's already JSON
      const newCustomLucideIcons = rawCustomLucideIcons !== undefined ? serializeCustomLucideIcons(rawCustomLucideIcons) : undefined;
      const newCustomEmojis = rawCustomEmojis !== undefined && Array.isArray(rawCustomEmojis) ? rawCustomEmojis : undefined;
      const newCustomFlags = rawCustomFlags !== undefined && Array.isArray(rawCustomFlags) ? rawCustomFlags : undefined;

      // Fetch current settings to compare for audit logging
      let currentSettingsFromDb = await prisma.globalSettings.findFirst({
        orderBy: {
          id: 'asc',
        },
      });

      if (!currentSettingsFromDb) {
        // Create default if it doesn't exist
        currentSettingsFromDb = await prisma.globalSettings.create({
          data: {
            enableRegistration: false,
            removeSelfServicePage: false,
            enableRenamingSelfServicePage: false,
            enableRenamingDeviceManagementPage: false,
            allowedNetworks: Prisma.JsonNull, // Store as JSON null for consistency
            customLucideIcons: Prisma.JsonNull,
            customEmojis: Prisma.JsonNull,
            customFlags: Prisma.JsonNull,
            // Group Type Settings
            enableGroupTypes: false,
            enableSelfServiceMultiSelect: true,
            singleSelectName: 'Single Select',
            multiSelectName: 'Multi Select',
            singleSelectIcon: 'DEFAULT',
            multiSelectIcon: 'DEFAULT',
            // Advanced Analytics Settings
            enableAdvancedAnalytics: false,
            // Logs and Analytics Retention Settings
            logsAnalyticsRetentionDays: 90,
            // MAC Tracking Settings
            enableMacTracking: false,
            macTrackingInterval: 5,
            macInactiveTimeout: 1440,
            macDataRetentionDays: 90,
            // Application Subtitle Settings
            enableApplicationSubtitle: false,
            subtitleText: null,
          },
        });
      }



      // Transform currentSettingsFromDb to match GlobalSettings interface precisely
      // Ensure all JSON fields are handled as arrays or undefined if null
      const transformedCurrentSettings: GlobalSettings = {
        ...currentSettingsFromDb,
        allowedNetworks: toJsonArrayOrUndefined<ValidLocalNetwork>(currentSettingsFromDb.allowedNetworks),
        customLucideIcons: toJsonArrayOrUndefined<CustomLucideIcon>(currentSettingsFromDb.customLucideIcons),
        customEmojis: toJsonArrayOrUndefined<CustomEmoji>(currentSettingsFromDb.customEmojis),
        customFlags: toJsonArrayOrUndefined<CustomFlag>(currentSettingsFromDb.customFlags),
        subtitleText: (currentSettingsFromDb as typeof currentSettingsFromDb & { subtitleText?: string | null }).subtitleText || undefined,
      };

      const updateData: GlobalSettingsUpdateData = {}; // Use the new specific type
      const auditDetails: Record<string, { old_value: unknown; new_value: unknown }> = {};

      // Handle enableRegistration
      if (enableRegistration !== undefined && enableRegistration !== transformedCurrentSettings.enableRegistration) {
        updateData.enableRegistration = enableRegistration;
        auditDetails.enableRegistration = { old_value: transformedCurrentSettings.enableRegistration, new_value: enableRegistration };
        await logAuditEvent({
          userId,
          action: enableRegistration ? 'enableRegistration' : 'disableRegistration',
          details: { old_value: transformedCurrentSettings.enableRegistration, new_value: enableRegistration },
          ipAddress,
          userAgent,
        });
      }

      // Handle removeSelfServicePage
      if (removeSelfServicePage !== undefined && removeSelfServicePage !== transformedCurrentSettings.removeSelfServicePage) {
        updateData.removeSelfServicePage = removeSelfServicePage;
        auditDetails.removeSelfServicePage = { old_value: transformedCurrentSettings.removeSelfServicePage, new_value: removeSelfServicePage };
        await logAuditEvent({
          userId,
          action: removeSelfServicePage ? 'removeSelfServicePage' : 'enableSelfServicePage',
          details: { old_value: transformedCurrentSettings.removeSelfServicePage, new_value: removeSelfServicePage },
          ipAddress,
          userAgent,
        });
      }

      // Handle enableRenamingSelfServicePage
      if (enableRenamingSelfServicePage !== undefined && enableRenamingSelfServicePage !== transformedCurrentSettings.enableRenamingSelfServicePage) {
        updateData.enableRenamingSelfServicePage = enableRenamingSelfServicePage;
        auditDetails.enableRenamingSelfServicePage = { old_value: transformedCurrentSettings.enableRenamingSelfServicePage, new_value: enableRenamingSelfServicePage };
        await logAuditEvent({
          userId,
          action: enableRenamingSelfServicePage ? 'enableRenamingSelfServicePage' : 'disableRenamingSelfServicePage',
          details: { old_value: transformedCurrentSettings.enableRenamingSelfServicePage, new_value: enableRenamingSelfServicePage },
          ipAddress,
          userAgent,
        });
      }

      // Handle enableRenamingDeviceManagementPage
      if (enableRenamingDeviceManagementPage !== undefined && enableRenamingDeviceManagementPage !== transformedCurrentSettings.enableRenamingDeviceManagementPage) {
        updateData.enableRenamingDeviceManagementPage = enableRenamingDeviceManagementPage;
        auditDetails.enableRenamingDeviceManagementPage = { old_value: transformedCurrentSettings.enableRenamingDeviceManagementPage, new_value: enableRenamingDeviceManagementPage };
        await logAuditEvent({
          userId,
          action: enableRenamingDeviceManagementPage ? 'enableRenamingDeviceManagementPage' : 'disableRenamingDeviceManagementPage',
          details: { old_value: transformedCurrentSettings.enableRenamingDeviceManagementPage, new_value: enableRenamingDeviceManagementPage },
          ipAddress,
          userAgent,
        });
      }

      // Handle allowedNetworks
      if (newAllowedNetworks !== undefined) {
        const oldNetworks = transformedCurrentSettings.allowedNetworks;
        const networksToSave = (Array.isArray(newAllowedNetworks) && newAllowedNetworks.length > 0) ? newAllowedNetworks : Prisma.JsonNull;

        if (JSON.stringify(networksToSave) !== JSON.stringify(oldNetworks)) { // Compare stringified JSON
          updateData.allowedNetworks = JSON.parse(JSON.stringify(networksToSave)); // Ensure it's a plain JSON object/array
          auditDetails.allowedNetworks = { old_value: oldNetworks, new_value: networksToSave };
          await logAuditEvent({
            userId,
            action: 'updateAllowedNetworks',
            details: { oldNetworks, newNetworks: networksToSave },
            ipAddress,
            userAgent,
          });
        }
      }

      // Handle customLucideIcons
      if (newCustomLucideIcons !== undefined) {
        const oldIcons = transformedCurrentSettings.customLucideIcons;
        const iconsToSave = (Array.isArray(newCustomLucideIcons) && newCustomLucideIcons.length > 0) ? newCustomLucideIcons : Prisma.JsonNull; // Store as JSON null if empty

        if (JSON.stringify(iconsToSave) !== JSON.stringify(oldIcons)) {
          updateData.customLucideIcons = JSON.parse(JSON.stringify(iconsToSave)); // Ensure it's a plain JSON object/array
          auditDetails.customLucideIcons = { old_value: oldIcons, new_value: iconsToSave };
          await logAuditEvent({
            userId,
            action: 'updateCustomLucideIcons',
            details: { old_value: oldIcons, new_value: iconsToSave },
            ipAddress,
            userAgent,
          });
        }
      }

      // Handle customEmojis
      if (newCustomEmojis !== undefined) {
        const oldEmojis = transformedCurrentSettings.customEmojis;
        const emojisToSave = (Array.isArray(newCustomEmojis) && newCustomEmojis.length > 0) ? newCustomEmojis : Prisma.JsonNull; // Store as JSON null if empty

        if (JSON.stringify(emojisToSave) !== JSON.stringify(oldEmojis)) {
          updateData.customEmojis = JSON.parse(JSON.stringify(emojisToSave)); // Ensure it's a plain JSON object/array
          auditDetails.customEmojis = { old_value: oldEmojis, new_value: emojisToSave };
          await logAuditEvent({
            userId,
            action: 'updateCustomEmojis',
            details: { old_value: oldEmojis, new_value: emojisToSave },
            ipAddress,
            userAgent,
          });
        }
      }

      // Handle customFlags
      if (newCustomFlags !== undefined) {
        const oldFlags = transformedCurrentSettings.customFlags;
        const flagsToSave = (Array.isArray(newCustomFlags) && newCustomFlags.length > 0) ? newCustomFlags : Prisma.JsonNull; // Store as JSON null if empty

        if (JSON.stringify(flagsToSave) !== JSON.stringify(oldFlags)) {
          updateData.customFlags = JSON.parse(JSON.stringify(flagsToSave)); // Ensure it's a plain JSON object/array
          auditDetails.customFlags = { old_value: oldFlags, new_value: flagsToSave };
          await logAuditEvent({
            userId,
            action: 'updateCustomFlags',
            details: { old_value: oldFlags, new_value: flagsToSave },
            ipAddress,
            userAgent,
          });
        }
      }

      // Handle enableGroupTypes
      if (enableGroupTypes !== undefined && enableGroupTypes !== transformedCurrentSettings.enableGroupTypes) {
        updateData.enableGroupTypes = enableGroupTypes;
        auditDetails.enableGroupTypes = { old_value: transformedCurrentSettings.enableGroupTypes, new_value: enableGroupTypes };
        await logAuditEvent({
          userId,
          action: enableGroupTypes ? 'enableGroupTypes' : 'disableGroupTypes',
          details: { old_value: transformedCurrentSettings.enableGroupTypes, new_value: enableGroupTypes },
          ipAddress,
          userAgent,
        });
      }

      // Handle singleSelectName
      if (singleSelectName !== undefined && singleSelectName !== transformedCurrentSettings.singleSelectName) {
        updateData.singleSelectName = singleSelectName;
        auditDetails.singleSelectName = { old_value: transformedCurrentSettings.singleSelectName, new_value: singleSelectName };
        await logAuditEvent({
          userId,
          action: 'updateSingleSelectName',
          details: { old_value: transformedCurrentSettings.singleSelectName, new_value: singleSelectName },
          ipAddress,
          userAgent,
        });
      }

      // Handle multiSelectName
      if (multiSelectName !== undefined && multiSelectName !== transformedCurrentSettings.multiSelectName) {
        updateData.multiSelectName = multiSelectName;
        auditDetails.multiSelectName = { old_value: transformedCurrentSettings.multiSelectName, new_value: multiSelectName };
        await logAuditEvent({
          userId,
          action: 'updateMultiSelectName',
          details: { old_value: transformedCurrentSettings.multiSelectName, new_value: multiSelectName },
          ipAddress,
          userAgent,
        });
      }

      // Handle enableSelfServiceMultiSelect
      if (enableSelfServiceMultiSelect !== undefined && enableSelfServiceMultiSelect !== transformedCurrentSettings.enableSelfServiceMultiSelect) {
        updateData.enableSelfServiceMultiSelect = enableSelfServiceMultiSelect;
        auditDetails.enableSelfServiceMultiSelect = { old_value: transformedCurrentSettings.enableSelfServiceMultiSelect, new_value: enableSelfServiceMultiSelect };
        await logAuditEvent({
          userId,
          action: enableSelfServiceMultiSelect ? 'enableSelfServiceMultiSelect' : 'disableSelfServiceMultiSelect',
          details: { old_value: transformedCurrentSettings.enableSelfServiceMultiSelect, new_value: enableSelfServiceMultiSelect },
          ipAddress,
          userAgent,
        });
      }

      // Handle singleSelectIcon
      if (singleSelectIcon !== undefined && singleSelectIcon !== transformedCurrentSettings.singleSelectIcon) {
        updateData.singleSelectIcon = singleSelectIcon;
        auditDetails.singleSelectIcon = { old_value: transformedCurrentSettings.singleSelectIcon, new_value: singleSelectIcon };
        await logAuditEvent({
          userId,
          action: 'updateSingleSelectIcon',
          details: { old_value: transformedCurrentSettings.singleSelectIcon, new_value: singleSelectIcon },
          ipAddress,
          userAgent,
        });
      }

      // Handle multiSelectIcon
      if (multiSelectIcon !== undefined && multiSelectIcon !== transformedCurrentSettings.multiSelectIcon) {
        updateData.multiSelectIcon = multiSelectIcon;
        auditDetails.multiSelectIcon = { old_value: transformedCurrentSettings.multiSelectIcon, new_value: multiSelectIcon };
        await logAuditEvent({
          userId,
          action: 'updateMultiSelectIcon',
          details: { old_value: transformedCurrentSettings.multiSelectIcon, new_value: multiSelectIcon },
          ipAddress,
          userAgent,
        });
      }

      // Handle enableAdvancedAnalytics
      if (enableAdvancedAnalytics !== undefined && enableAdvancedAnalytics !== transformedCurrentSettings.enableAdvancedAnalytics) {
        updateData.enableAdvancedAnalytics = enableAdvancedAnalytics;
        auditDetails.enableAdvancedAnalytics = { old_value: transformedCurrentSettings.enableAdvancedAnalytics, new_value: enableAdvancedAnalytics };
        await logAuditEvent({
          userId,
          action: enableAdvancedAnalytics ? 'enableAdvancedAnalytics' : 'disableAdvancedAnalytics',
          details: { old_value: transformedCurrentSettings.enableAdvancedAnalytics, new_value: enableAdvancedAnalytics },
          ipAddress,
          userAgent,
        });
      }

      // Handle logsAnalyticsRetentionDays
      if (logsAnalyticsRetentionDays !== undefined && logsAnalyticsRetentionDays !== transformedCurrentSettings.logsAnalyticsRetentionDays) {
        // Validate retention days
        if (logsAnalyticsRetentionDays < 1 || logsAnalyticsRetentionDays > 365) {
          return NextResponse.json({ error: 'Logs and analytics retention days must be between 1 and 365' }, { status: 400 });
        }
        updateData.logsAnalyticsRetentionDays = logsAnalyticsRetentionDays;
        auditDetails.logsAnalyticsRetentionDays = { old_value: transformedCurrentSettings.logsAnalyticsRetentionDays, new_value: logsAnalyticsRetentionDays };
        await logAuditEvent({
          userId,
          action: 'updateLogsAnalyticsRetention',
          details: { old_value: transformedCurrentSettings.logsAnalyticsRetentionDays, new_value: logsAnalyticsRetentionDays },
          ipAddress,
          userAgent,
        });
      }

      // Handle enableMacTracking
      if (enableMacTracking !== undefined && enableMacTracking !== transformedCurrentSettings.enableMacTracking) {
        updateData.enableMacTracking = enableMacTracking;
        auditDetails.enableMacTracking = { old_value: transformedCurrentSettings.enableMacTracking, new_value: enableMacTracking };
        await logAuditEvent({
          userId,
          action: enableMacTracking ? 'enableMacTracking' : 'disableMacTracking',
          details: { old_value: transformedCurrentSettings.enableMacTracking, new_value: enableMacTracking },
          ipAddress,
          userAgent,
        });
      }

      // Handle macTrackingInterval
      if (macTrackingInterval !== undefined && macTrackingInterval !== transformedCurrentSettings.macTrackingInterval) {
        updateData.macTrackingInterval = macTrackingInterval;
        auditDetails.macTrackingInterval = { old_value: transformedCurrentSettings.macTrackingInterval, new_value: macTrackingInterval };
        await logAuditEvent({
          userId,
          action: 'updateMacTrackingInterval',
          details: { old_value: transformedCurrentSettings.macTrackingInterval, new_value: macTrackingInterval },
          ipAddress,
          userAgent,
        });
      }

      // Handle macInactiveTimeout
      if (macInactiveTimeout !== undefined && macInactiveTimeout !== transformedCurrentSettings.macInactiveTimeout) {
        updateData.macInactiveTimeout = macInactiveTimeout;
        auditDetails.macInactiveTimeout = { old_value: transformedCurrentSettings.macInactiveTimeout, new_value: macInactiveTimeout };
        await logAuditEvent({
          userId,
          action: 'updateMacInactiveTimeout',
          details: { old_value: transformedCurrentSettings.macInactiveTimeout, new_value: macInactiveTimeout },
          ipAddress,
          userAgent,
        });
      }

      // Handle macDataRetentionDays
      if (macDataRetentionDays !== undefined && macDataRetentionDays !== transformedCurrentSettings.macDataRetentionDays) {
        // Validate retention days
        if (macDataRetentionDays < 1 || macDataRetentionDays > 365) {
          return NextResponse.json({ error: 'MAC data retention days must be between 1 and 365' }, { status: 400 });
        }
        updateData.macDataRetentionDays = macDataRetentionDays;
        auditDetails.macDataRetentionDays = { old_value: transformedCurrentSettings.macDataRetentionDays, new_value: macDataRetentionDays };
        await logAuditEvent({
          userId,
          action: 'updateMacDataRetention',
          details: { old_value: transformedCurrentSettings.macDataRetentionDays, new_value: macDataRetentionDays },
          ipAddress,
          userAgent,
        });
      }

      // Handle enableApplicationSubtitle
      if (enableApplicationSubtitle !== undefined && enableApplicationSubtitle !== transformedCurrentSettings.enableApplicationSubtitle) {
        updateData.enableApplicationSubtitle = enableApplicationSubtitle;
        auditDetails.enableApplicationSubtitle = { old_value: transformedCurrentSettings.enableApplicationSubtitle, new_value: enableApplicationSubtitle };
        await logAuditEvent({
          userId,
          action: enableApplicationSubtitle ? 'enableApplicationSubtitle' : 'disableApplicationSubtitle',
          details: { old_value: transformedCurrentSettings.enableApplicationSubtitle, new_value: enableApplicationSubtitle },
          ipAddress,
          userAgent,
        });
      }

      // Handle subtitleText
      if (subtitleText !== undefined && subtitleText !== transformedCurrentSettings.subtitleText) {
        updateData.subtitleText = subtitleText;
        auditDetails.subtitleText = { old_value: transformedCurrentSettings.subtitleText, new_value: subtitleText };
        await logAuditEvent({
          userId,
          action: 'updateSubtitleText',
          details: { old_value: transformedCurrentSettings.subtitleText, new_value: subtitleText },
          ipAddress,
          userAgent,
        });
      }

      // Handle enableLoginPageSubtitle
      if (enableLoginPageSubtitle !== undefined && enableLoginPageSubtitle !== transformedCurrentSettings.enableLoginPageSubtitle) {
        updateData.enableLoginPageSubtitle = enableLoginPageSubtitle;
        auditDetails.enableLoginPageSubtitle = { old_value: transformedCurrentSettings.enableLoginPageSubtitle, new_value: enableLoginPageSubtitle };
        await logAuditEvent({
          userId,
          action: enableLoginPageSubtitle ? 'enableLoginPageSubtitle' : 'disableLoginPageSubtitle',
          details: { old_value: transformedCurrentSettings.enableLoginPageSubtitle, new_value: enableLoginPageSubtitle },
          ipAddress,
          userAgent,
        });
      }

      // Handle manageNetworkAliasesEnabled
      if (manageNetworkAliasesEnabled !== undefined && manageNetworkAliasesEnabled !== transformedCurrentSettings.manageNetworkAliasesEnabled) {
        updateData.manageNetworkAliasesEnabled = manageNetworkAliasesEnabled;
        auditDetails.manageNetworkAliasesEnabled = { old_value: transformedCurrentSettings.manageNetworkAliasesEnabled, new_value: manageNetworkAliasesEnabled };
        await logAuditEvent({
          userId,
          action: manageNetworkAliasesEnabled ? 'enableNetworkAliasesManagement' : 'disableNetworkAliasesManagement',
          details: { old_value: transformedCurrentSettings.manageNetworkAliasesEnabled, new_value: manageNetworkAliasesEnabled },
          ipAddress,
          userAgent,
        });
      }

      if (Object.keys(updateData).length > 0) {
        // Always update lastModified timestamp when any setting changes for cache invalidation
        updateData.lastModified = new Date();

        await prisma.globalSettings.update({
          where: { id: transformedCurrentSettings.id },
          data: updateData,
        });

        // Handle MAC Tracking Service Side Effects
        // If enablement or interval changed, update the service state
        if (updateData.enableMacTracking !== undefined || updateData.macTrackingInterval !== undefined) {
          // Determine the effective new state
          const shouldBeEnabled = updateData.enableMacTracking ?? transformedCurrentSettings.enableMacTracking;
          const interval = updateData.macTrackingInterval ?? transformedCurrentSettings.macTrackingInterval ?? 5;

          logger.info(`Settings update triggering MAC service refresh. Enabled: ${shouldBeEnabled}, Interval: ${interval}`);

          if (shouldBeEnabled) {
            // If enabled (or staying enabled with new interval), restart the service
            // stop() ensures we clear previous state/interval
            macTrackingService.stop();
            macTrackingService.start(interval);
          } else {
            // If explicitly disabled, stop the service
            macTrackingService.stop();
          }
        }

        // Handle Advanced Analytics Service Side Effects
        if (updateData.enableAdvancedAnalytics !== undefined) {
          const shouldBeEnabled = updateData.enableAdvancedAnalytics;
          logger.info(`Settings update triggering Analytics service refresh. Enabled: ${shouldBeEnabled}`);

          if (shouldBeEnabled) {
            usageAggregationService.stop(); // Clear any existing state
            usageAggregationService.start(30); // Default 30 min interval
          } else {
            usageAggregationService.stop();
          }
        }
      }

      return NextResponse.json({ message: 'Global settings saved successfully' });
    } catch (error) {
      logger.error("Error saving global settings:", error);
      if (error instanceof Error) {
        logger.error("Error message:", error.message);
        logger.error("Error stack:", error.stack);
      }
      return NextResponse.json({ error: 'Failed to save global settings' }, { status: 500 });
    }
  });
}