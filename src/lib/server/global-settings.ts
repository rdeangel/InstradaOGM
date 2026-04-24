// src/lib/server/global-settings.ts
import { prisma } from '@/lib/prisma';
import { GlobalSettings, ValidLocalNetwork, CustomLucideIcon, CustomEmoji, CustomFlag } from '@/types/settings';
import { isIpInallowedNetworks } from '@/lib/network-utils';
import { Prisma } from '@prisma/client'; // Import Prisma namespace
import { toJsonArrayOrUndefined } from '@/lib/utils';

export interface GlobalSettingsResponse {
  enableRegistration: boolean;
  removeSelfServicePage: boolean;
  enableRenamingSelfServicePage: boolean;
  enableRenamingDeviceManagementPage?: boolean;
  allowedNetworks?: ValidLocalNetwork[];
  customLucideIcons?: CustomLucideIcon[];
  customEmojis?: CustomEmoji[];
  customFlags?: CustomFlag[];
  // Group Type Settings
  enableGroupTypes: boolean;
  enableSelfServiceMultiSelect: boolean;
  singleSelectName: string;
  multiSelectName: string;
  singleSelectIcon: string;
  multiSelectIcon: string;
  // Advanced Analytics Settings
  enableAdvancedAnalytics: boolean;
  // Logs and Analytics Retention Settings
  logsAnalyticsRetentionDays: number;
  // MAC Tracking Settings
  enableMacTracking: boolean;
  macTrackingInterval: number;
  macInactiveTimeout: number;
  macDataRetentionDays: number;
  // Application Subtitle Settings
  enableApplicationSubtitle: boolean;
  subtitleText?: string;
  enableLoginPageSubtitle: boolean;
  manageNetworkAliasesEnabled: boolean;
  isSelfServiceAllowed: boolean;
}



export async function getGlobalSettings(clientIp?: string | null): Promise<GlobalSettingsResponse> {
  // Fetch the single GlobalSettings record
  let globalSettingsFromDb = await prisma.globalSettings.findFirst({
    orderBy: {
      id: 'asc',
    },
  });

  // If no settings exist, create a default entry
  if (!globalSettingsFromDb) {
    globalSettingsFromDb = await prisma.globalSettings.create({
      data: {
        enableRegistration: false,
        removeSelfServicePage: false,
        enableRenamingSelfServicePage: false,
        enableRenamingDeviceManagementPage: false,
        allowedNetworks: Prisma.JsonNull,
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

  // Transform globalSettingsFromDb to match GlobalSettings interface precisely
  // Ensure all JSON fields are handled as arrays or undefined if null
  const transformedGlobalSettings: GlobalSettings = {
    ...globalSettingsFromDb,
    allowedNetworks: toJsonArrayOrUndefined<ValidLocalNetwork>(globalSettingsFromDb.allowedNetworks),
    customLucideIcons: toJsonArrayOrUndefined<CustomLucideIcon>(globalSettingsFromDb.customLucideIcons),
    customEmojis: toJsonArrayOrUndefined<CustomEmoji>(globalSettingsFromDb.customEmojis),
    customFlags: toJsonArrayOrUndefined<CustomFlag>(globalSettingsFromDb.customFlags),
    subtitleText: (globalSettingsFromDb as typeof globalSettingsFromDb & { subtitleText?: string | null }).subtitleText || undefined,
  };

  // Calculate isSelfServiceAllowed based on global setting and client IP
  // If removeSelfServicePage is true, self-service is globally disabled regardless of IP
  const isSelfServiceAllowed = !transformedGlobalSettings.removeSelfServicePage &&
    isIpInallowedNetworks(clientIp || null, transformedGlobalSettings.allowedNetworks || []);

  return {
    enableRegistration: transformedGlobalSettings.enableRegistration,
    removeSelfServicePage: transformedGlobalSettings.removeSelfServicePage || false,
    enableRenamingSelfServicePage: transformedGlobalSettings.enableRenamingSelfServicePage || false,
    enableRenamingDeviceManagementPage: transformedGlobalSettings.enableRenamingDeviceManagementPage,
    allowedNetworks: transformedGlobalSettings.allowedNetworks,
    customLucideIcons: transformedGlobalSettings.customLucideIcons,
    customEmojis: transformedGlobalSettings.customEmojis,
    customFlags: transformedGlobalSettings.customFlags,
    // Group Type Settings
    enableGroupTypes: transformedGlobalSettings.enableGroupTypes || false,
    enableSelfServiceMultiSelect: transformedGlobalSettings.enableSelfServiceMultiSelect ?? true,
    singleSelectName: transformedGlobalSettings.singleSelectName || 'Single Select',
    multiSelectName: transformedGlobalSettings.multiSelectName || 'Multi Select',
    singleSelectIcon: transformedGlobalSettings.singleSelectIcon || 'DEFAULT',
    multiSelectIcon: transformedGlobalSettings.multiSelectIcon || 'DEFAULT',
    // Advanced Analytics Settings
    enableAdvancedAnalytics: transformedGlobalSettings.enableAdvancedAnalytics || false,
    // Logs and Analytics Retention Settings
    logsAnalyticsRetentionDays: transformedGlobalSettings.logsAnalyticsRetentionDays || 90,
    // MAC Tracking Settings
    enableMacTracking: transformedGlobalSettings.enableMacTracking || false,
    macTrackingInterval: transformedGlobalSettings.macTrackingInterval || 5,
    macInactiveTimeout: transformedGlobalSettings.macInactiveTimeout || 1440,
    macDataRetentionDays: transformedGlobalSettings.macDataRetentionDays || 90,
    // Application Subtitle Settings
    enableApplicationSubtitle: transformedGlobalSettings.enableApplicationSubtitle || false,
    subtitleText: transformedGlobalSettings.subtitleText,
    enableLoginPageSubtitle: transformedGlobalSettings.enableLoginPageSubtitle || false,
    manageNetworkAliasesEnabled: transformedGlobalSettings.manageNetworkAliasesEnabled || false,
    isSelfServiceAllowed,
  };
} 