import { MacExclusion } from './mac-exclusion';

export interface MacAddress {
  id: string;
  macAddress: string;
  firstSeen: Date;
  lastSeen: Date;
  isActive: boolean;
  isPrivacyMac: boolean;
  isOpnsenseMac?: boolean; // OPNsense router/firewall MAC address
  isVrrpMac?: boolean; // VRRP virtual router MAC address
  isHsrpMac?: boolean; // HSRP virtual router MAC address
  hasMultipleIps?: boolean; // MAC has multiple active IPs (e.g., keepalived, HA cluster)
  deviceName?: string;
  vendor?: string;
  vendorSource?: 'OPNsense' | 'Local DB' | null; // Source of vendor information
  createdAt: Date;
  updatedAt: Date;
  ipAssociations?: MacIpAssociation[];
  // Computed fields
  currentIp?: string;
  currentInterface?: string;
  hostAlias?: string;
  isDhcpReserved?: boolean;
  hasDhcpConflict?: boolean;
  historyCount?: number; // Number of IP association history events
  rawHistoryCount?: number; // Total number of scan events (for reference)
  currentIpsCount?: number; // Number of current active IP associations (for Partial Exclusion)
  currentIps?: Array<{
    ipAddress: string;
    networkInterface?: string;
    hostAlias?: string;
    isDhcpReserved: boolean;
    hasDhcpConflict: boolean;
    isActive: boolean; // Active/inactive status of this IP association
  }>; // All current active IP associations with details
  // Exclusion information
  exclusion?: MacExclusion;
}

export interface MacIpAssociation {
  id: string;
  macAddressId: string;
  ipAddress: string;
  networkInterface?: string;
  isDhcpReserved: boolean;
  hasDhcpConflict: boolean;
  isOpnsenseMac?: boolean; // OPNsense router/firewall MAC address
  firstSeen: Date;
  lastSeen: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MacIpActivationPeriod {
  id: string;
  macAddressId: string;
  ipAddress: string;
  networkInterface?: string;
  hostname?: string;
  hostAlias?: string;
  activatedAt: Date;
  deactivatedAt?: Date;
  createdAt: Date;
}

export interface MacTrackingStats {
  totalMacs: number;
  activeMacs: number;
  recentDiscoveries: number;
  serviceStatus: 'running' | 'stopped' | 'error';
  lastScanTime?: Date;
}

export interface MacTrackingSettings {
  enableMacTracking: boolean;
  macTrackingInterval: number;
  macInactiveTimeout: number;
  macDataRetentionDays: number;
}

export interface MacTrackingServiceStatus {
  isRunning: boolean;
  intervalId: number | null;
  lastScanTime: Date | null;
  settings: {
    enabled: boolean;
    interval: number;
    inactiveTimeout: number;
  };
  stats: {
    totalMacs: number;
    activeMacs: number;
    privacyMacs: number;
    totalPrivacyMacs: number;
    privacyMacPercentage: number;
    dhcpReservedMacs: number;
    dhcpConflictMacs: number;
  };
}

export interface MacTrackingJobResult {
  processedEntries: number;
  newMacs: number;
  updatedMacs: number;
  errors: number;
  duration: number;
}

export interface MacAddressListResponse {
  success: boolean;
  data: {
    macAddresses: MacAddress[];
    totalCount: number;
    currentPage: number;
    totalPages: number;
  };
}

export interface MacHistoryResponse {
  success: boolean;
  data: {
    macAddress: MacAddress;
    history: MacIpAssociation[];
    pagination?: {
      currentPage: number;
      pageSize: number;
      totalCount: number;
      totalPages: number;
    };
  };
}

export interface MacServiceControlRequest {
  action: 'start' | 'stop' | 'run' | 'cleanup';
  intervalMinutes?: number;
  retentionDays?: number;
}

export interface MacServiceControlResponse {
  success: boolean;
  message: string;
  data?: MacTrackingJobResult | { cleanedCount: number };
}

// Search and filter types
export interface MacSearchParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  activeOnly?: boolean;
}

export interface MacExportParams {
  format: 'csv' | 'json';
  search?: string;
  activeOnly?: boolean;
}

// Table column definitions for UI components
export interface MacTableColumn {
  key: keyof MacAddress | 'currentIp' | 'hostAlias' | 'historyCount';
  label: string;
  sortable?: boolean;
  render?: (mac: MacAddress) => React.ReactNode;
}

// Privacy MAC detection statistics
export interface PrivacyMacStats {
  totalPrivacyMacs: number;
  recentPrivacyMacs: number;
  privacyMacPercentage: number;
}
