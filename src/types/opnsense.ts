// Removed unused import GroupFilter
import { VpnClientType } from '@prisma/client'; // Moved to top

// src/types/opnsense.ts

// Import Role enum from Prisma client if you have generated it.
// For now, we will define it here to match the Prisma schema.
// import type { Role as PrismaRole } from '@prisma/client';

// Role values should match those intended in the Prisma schema's User.role field
export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
  PENDING = 'PENDING',
  SUSPENDED = 'SUSPENDED',
}


export type IconName = 'ShieldCheck' | 'ShieldQuestion' | 'Network';

export interface OpnsenseAliasMember {
  id: string;
  ipAddress: string;
  description?: string;
}

export interface NetworkObject {
  id: string;
  ipAddress: string;
  description?: string;
}

export interface NetworkGroup {
  id: string;
  uuid: string;
  name: string;
  description: string;
  enabled: boolean;
  members: NetworkObject[]; // This will likely remain empty or be re-evaluated for display purposes
  icon?: IconName; // Store icon name as a string
  itemCount?: number;
  lastUpdated?: string | null;
  rawContent?: string; // To store the newline-separated member string from OPNsense
  type?: string; // e.g., "networkgroup"
  proto?: string;
  interface?: string;
  counters?: string;
  updatefreq?: string;
  categories?: string;
  friendlyName?: string; // Added for display purposes
  iconIdentifier?: string | null; // Added for display purposes
  groupType?: 'SingleSelect' | 'MultiSelect'; // Added for group type
}

export interface User {
  id: string; // Make id required as it's always present in session.user
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: Role; // Make role required as it's always present in session.user
  username?: string | null; // Add username
  authMethod?: string; // Add authMethod
  ipAddress?: string; // Add ipAddress
  groups?: { id: string; name: string }[]; // Add groups property to User interface, matching NextAuth session
}

export interface OpnsenseAliasDetailFromExport {
  enabled: string; // "1" or "0"
  name: string;
  uuid?: string; // Added optional uuid, as getHostAliases populates this
  type: string;
  proto: string;
  interface: string;
  counters: string;
  updatefreq: string;
  content: string; // Newline-separated string of member alias names for networkgroup type
  categories: string;
  description: string;
  last_updated?: string; // Timestamp from OPNsense (e.g., "2025-07-18T16:15:52.572794")
  detectedMac?: string | null; // Added
  detectedVendor?: string | null; // Added
  detectedHostname?: string | null; // Added
  isDhcpReserved?: boolean; // Added for DHCP reservation status
  dhcpReservedMac?: string | null; // Added for DHCP reservation MAC
  dhcpReservedVendor?: string | null; // Added for DHCP reservation Vendor
  memberOfGroups?: { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null; groupType?: 'SingleSelect' | 'MultiSelect' }[]; // Added for group membership
  friendlyName?: string; // Added for display purposes
  iconIdentifier?: string | null; // Added for display purposes
  members?: OpnsenseAliasMember[]; // Added for networkgroup type aliases
  // Add other fields if present in the actual API response
}


export interface OpnsenseArpEntry {
  ip: string; // Corrected to match OPNsense API response
  mac: string; // Corrected to match OPNsense API response
  hostname?: string; // Made optional as it might not always be present
  description?: string; // Added description field
  isDhcpReserved?: boolean; // New prop to indicate if the ARP entry's IP/MAC has a DHCP reservation
  dhcpReservedIp?: string | null; // New prop to store the DHCP reserved IP if different
  dhcpReservedMac?: string | null; // New prop to store the DHCP reserved MAC if different
  dhcpReservedHostname?: string | null; // New prop to store the DHCP reserved hostname
  hasDhcpConflict?: boolean; // New prop to indicate if there's a DHCP conflict
  hostAlias?: string | null; // Host alias name for this IP
  hostAliasConflict?: boolean; // True if multiple host aliases exist for this IP
  type: string; // e.g., "static", "dynamic"
  starts: string; // Timestamp or formatted date string
  ends: string; // Timestamp or formatted date string
  // Other fields from original OpnsenseArpEntry, if still relevant and used:
  intf?: string;
  expired?: boolean;
  expires?: number;
  permanent?: boolean;
  manufacturer?: string;
  intf_description?: string;
}

export interface OpnsenseKeaLease {
  if: string;
  address: string;
  hwaddr: string;
  client_id: string;
  valid_lifetime: string;
  expire: string; // Epoch timestamp
  subnet_id: string;
  fqdn_fwd: string;
  fqdn_rev: string;
  hostname: string;
  state: string; // "0" for active, "2" for expired
  user_context: string;
  pool_id: string;
  if_descr: string;
  if_name: string;
  mac_info: string;
  isDhcpReserved?: boolean; // New prop to indicate if the KEA lease's IP/MAC has a DHCP reservation
  dhcpReservedIp?: string | null; // New prop to store the DHCP reserved IP if different
  dhcpReservedMac?: string | null; // New prop to store the DHCP reserved MAC if different
  dhcpReservedHostname?: string | null; // New prop to store the DHCP reserved hostname
  hasDhcpConflict?: boolean; // New prop to indicate if there's a DHCP conflict
  isActiveInArp?: boolean; // New prop to indicate if the KEA lease's IP/MAC is active in ARP
  activeArpIp?: string | null; // New prop to store the active ARP IP if different
  activeArpMac?: string | null; // New prop to store the active ARP MAC if different
  hasArpConflict?: boolean; // New prop to indicate if there's an ARP conflict
  hostAlias?: string | null; // Host alias name for this IP
  hostAliasConflict?: boolean; // True if multiple host aliases exist for this IP
}

export interface OpnsenseDhcpReservation {
  uuid: string;
  subnet: string;
  ip_address: string;
  hw_address: string;
  hostname?: string; // This is the DHCP hostname entered when creating the reservation
  description?: string;
  isActiveInArp?: boolean; // New prop to indicate if the reservation's IP/MAC is active in ARP
  activeArpIp?: string | null; // New prop to store the active ARP IP if different
  activeArpMac?: string | null; // New prop to store the active ARP MAC if different
  hasArpConflict?: boolean; // New prop to indicate if there's an ARP conflict
  actualHostname?: string | null; // The actual hostname from ARP table or other sources
  hostAlias?: string | null; // Host alias name for this IP from OPNsense
  hostAliasConflict?: boolean; // True if multiple host aliases exist for this IP
  // Add other fields if present in the actual API response
}

// Base interface for all VPN entry types to ensure common properties
export interface OpnsenseBaseVpnEntry {
  id?: string; // Make optional, as it might be derived from uuid or session ID
  name?: string; // Make optional, as it might be derived or not directly present
  type: string; // Will be 'OpenVPN', 'WireGuard', 'IPsec'
  enabled?: string; // '1' or '0'
  description?: string;
  vpnDisplayName?: string; // Added for user-friendly display name
  isStopping?: boolean; // Added to indicate if a VPN is currently being stopped
  isRestarting?: boolean; // Added to indicate if a VPN is currently being restarted
}

export interface OpnsenseVpnSession extends OpnsenseBaseVpnEntry {
  status: string;
  timestamp: number;
  virtual_address: string;
  real_address: string;
  bytes_received: string;
  bytes_sent: string;
  connected_since: string;
  // Inherits id, name, type, enabled, description, isProcessing from OpnsenseBaseVpnEntry
}

export interface VpnMapping {
  id: string;
  vpnUuid: string;
  vpnName: string; // Keep vpnName for backend mapping, but use vpnDisplayName for frontend
  vpnClient: VpnClientType;
  friendlyName?: string | null; // New field for user-friendly name
  opnsenseNetworkGroupId: string | null;
  opnsenseNetworkGroup?: { name: string } | null; // For frontend display, reflecting the new relation
  createdAt?: Date; // Made optional
  updatedAt?: Date; // Made optional
}

export interface OpnsenseApiResponse {
  result?: "ok" | "failed" | "saved" | "deleted" | "success" | string; // Added specific result types based on OPNsense API responses
  message?: string;
  // Add other common fields if they exist across OPNsense API responses
  // For example, if some APIs return a 'uuid' or 'status' field consistently
}


// Interface for the response from /api/wireguard/client/search_client
export interface OpnsenseWireguardClient extends OpnsenseBaseVpnEntry {
  uuid: string; // Keep uuid as it's from the raw API
  pubkey: string;
  psk: string;
  tunneladdress: string;
  serveraddress: string;
  serverport: string;
  endpoint: string;
  keepalive: string;
  servers: string;
  transfer_rx: number; // Add for WireGuard data
  transfer_tx: number; // Add for WireGuard data
  status?: string; // Add for WireGuard live status
  // Inherits id, name, type, enabled, description, isProcessing from OpnsenseBaseVpnEntry
}

export interface OpnsenseWireguardClientResponse {
  rows: OpnsenseWireguardClient[];
  rowCount: number;
  total: number;
  current: number;
}

// Interface for a peer entry from /api/wireguard/service/show
export interface OpnsenseWireguardServicePeer {
  if: string;
  type: "peer";
  "public-key": string;
  endpoint: string;
  "allowed-ips": string;
  "latest-handshake": number;
  "transfer-rx": number;
  "transfer-tx": number;
  "persistent-keepalive": string;
  name: string; // This is the client name, e.g., "WGP-Angdea-S22"
  "latest-handshake-age": string | null;
  "latest-handshake-epoch": number | null;
  "peer-status": string;
  ifname: string; // Interface name, e.g., "WG-MyWireGuard"
}

// Interface for an interface entry from /api/wireguard/service/show
export interface OpnsenseWireguardServiceInterface {
  if: string;
  type: "interface";
  "public-key": string;
  "listen-port": string;
  fwmark: string;
  endpoint: string;
  status: string;
  name: string; // This is the interface name, e.g., "WG-MyWireGuard"
  "latest-handshake-age": string | null;
  "latest-handshake-epoch": number | null;
  "peer-status": string;
  ifname: string; // Interface name, e.g., "WG-MyWireGuard"
}

// Union type for rows in /api/wireguard/service/show
export type OpnsenseWireguardServiceEntry = OpnsenseWireguardServicePeer | OpnsenseWireguardServiceInterface;

// Interface for the full response from /api/wireguard/service/show
export interface OpnsenseWireguardServiceResponse {
  rows: OpnsenseWireguardServiceEntry[];
  rowCount: number;
  total: number;
  current: number;
}

// Interface for the response from /api/ipsec/connections/search_connection (now sessions/search_phase1)
export interface OpnsenseIpsecConnection extends OpnsenseBaseVpnEntry {
  uuid: string; // Keep uuid as it's from the raw API
  ikeid: string; // Add ikeid for IPsec
  'local-addrs': string; // Changed to hyphenated
  'remote-addrs': string; // Changed to hyphenated
  local_ts: string;
  remote_ts: string;
  'bytes-in': number; // Changed to hyphenated and type to number
  'bytes-out': number; // Changed to hyphenated and type to number
  connected: boolean; // Add for IPsec connection status
  'install-time': string; // Add for IPsec connected since
  phase1desc?: string; // Add for IPsec phase1 description
  status?: string; // Add status for consistency with other VPN types
  // Inherits id, name, type, enabled, description, isProcessing from OpnsenseBaseVpnEntry
}

export interface OpnsenseIpsecConnectionResponse {
  rows: OpnsenseIpsecConnection[];
  rowCount: number;
  total: number;
  current: number;
}

// Common interface for VPN entries from OPNsense
export type OpnsenseVpnEntry = OpnsenseVpnSession | OpnsenseWireguardClient | OpnsenseIpsecConnection;

// Type guards for VPN types
export const isOpnsenseVpnSession = (vpn: OpnsenseVpnEntry): vpn is OpnsenseVpnSession => vpn.type === VpnClientType.OpenVPN;
export const isOpnsenseWireguardClient = (vpn: OpnsenseVpnEntry): vpn is OpnsenseWireguardClient => vpn.type === VpnClientType.WireGuard;
export const isOpnsenseIpsecConnection = (vpn: OpnsenseVpnEntry): vpn is OpnsenseIpsecConnection => vpn.type === VpnClientType.IPsec;

export interface FilteredAliasesResponse {
  networkGroups: NetworkGroup[];
  allEmojiValues: string[];
  allFlagValues: string[];
}

// Add the new VPN status type
export type VpnStatus = 'connected' | 'disconnected' | 'disabled';

export interface SearchableSelectOption {
  value: string;
  label: string;
  detectedMac?: string | null;
  detectedVendor?: string | null;
  isDhcpReserved?: boolean;
  dhcpReservedMac?: string | null;
  dhcpReservedVendor?: string | null;
  aliasDescription?: string | null;
  memberOfGroups?: { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null; groupType?: 'SingleSelect' | 'MultiSelect' }[];
  vpnInfo?: { status: VpnStatus; type: string; enabled?: string } | null;
  isDisabled: boolean;
  hasIpConflict?: boolean;
  hasMacConflict?: boolean;
}
