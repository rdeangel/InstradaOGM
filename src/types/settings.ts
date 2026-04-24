// src/types/settings.ts
import type { LucideIcon } from 'lucide-react';

export interface GroupFilter {
  id: string;
  pattern: string;
  description?: string | null;
  type: 'include' | 'exclude';
}

export interface GroupSpecificFilter extends GroupFilter {
  groupId: string;
}
 
export interface OpnsenseGroupDisplay {
  id: string;
  opnsenseUuid: string;
  friendlyName: string;
  iconIdentifier?: string | null; // New field for storing emoji or icon name
  groupType?: 'SingleSelect' | 'MultiSelect'; // New field for group type
  isGloballyDisabled?: boolean; // New field to indicate if the group is globally disabled
  vpnUuid?: string | null; // New field for VPN UUID
}

export interface ValidLocalNetwork {
  id: string;
  network?: string | null; // CIDR format (optional)
  startIp?: string | null; // Start IP of range (optional)
  endIp?: string | null;   // End IP of range (optional)
  type: 'include' | 'exclude'; // "include" or "exclude"
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomLucideIcon {
  name: string;
  icon: LucideIcon; // Changed to LucideIcon component type
}

export interface CustomEmoji {
  value: string; // Changed from 'emoji' to 'value'
  name: string;
}

export interface CustomFlag { // New interface for flags
  value: string; // Changed from 'flag' to 'value'
  name: string;
}

export interface GlobalSettings {
  id: string; // Add id property
  enableRegistration: boolean;
  removeSelfServicePage?: boolean; // Completely disable self-service functionality for enhanced security
  enableRenamingSelfServicePage?: boolean;
  enableRenamingDeviceManagementPage?: boolean;
  allowedNetworks?: ValidLocalNetwork[]; // Use the proper type
  customLucideIcons?: CustomLucideIcon[]; // Use the proper type
  customEmojis?: CustomEmoji[]; // Use the proper type
  customFlags?: CustomFlag[]; // Use the proper type
  // Group Type Settings
  enableGroupTypes?: boolean; // Enable/disable dual group type functionality
  enableSelfServiceMultiSelect?: boolean; // Enable/disable multi-select functionality in self-service page
  singleSelectName?: string; // Custom name for SingleSelect groups
  multiSelectName?: string; // Custom name for MultiSelect groups
  singleSelectIcon?: string; // Lucide icon for SingleSelect groups
  multiSelectIcon?: string; // Lucide icon for MultiSelect groups
  // Advanced Analytics Settings
  enableAdvancedAnalytics?: boolean; // Enable/disable advanced analytics (session tracking, performance monitoring)
  // Logs and Analytics Retention Settings
  logsAnalyticsRetentionDays?: number; // Delete logs and analytics data older than this many days
  // MAC Tracking Settings
  enableMacTracking?: boolean; // Enable/disable MAC address tracking
  macTrackingInterval?: number; // ARP scan interval in minutes
  macInactiveTimeout?: number; // Mark MACs inactive after this many minutes
  macDataRetentionDays?: number; // Delete MAC tracking data older than this many days
  // Application Subtitle Settings
  enableApplicationSubtitle?: boolean; // Enable/disable application subtitle feature
  subtitleText?: string; // Custom subtitle text to display under the main title
  enableLoginPageSubtitle?: boolean; // Enable/disable subtitle display on login page
  // Network Aliases Management
  manageNetworkAliasesEnabled?: boolean; // Enable/disable network alias management feature
}