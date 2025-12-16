'use client';

/* eslint-disable security/detect-object-injection */
// This component uses bracket notation with typed keys from objects. All uses are safe.
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusDotWithTooltip, getHostAliasStatusColor } from '@/components/ui/status-dot';

import { ClientOnly } from '@/components/util/ClientOnly';
import { useToast } from '@/hooks/use-toast';
import { Search, PlusCircle, Trash2, Server, Table, ClipboardList, ListChecks, Terminal } from 'lucide-react'; // Added Terminal icon

import type { OpnsenseAliasDetailFromExport } from '@/types/opnsense';
import { SearchableSelect } from '@/components/ui/searchable-select'; // Import SearchableSelect
import { useSession } from 'next-auth/react'; // Import useSession for user info
import { useIsMobile } from '@/hooks/use-mobile'; // Import useIsMobile
import { cn } from '@/lib/utils'; // Import cn for conditional classnames
import { logger } from '@/lib/logger';
import { checkMacRandomization } from '@/lib/mac-utils';
import { useGroupType } from '@/context/GroupTypeContext'; // Import useGroupType
import { hasAnyGroupError, getGroupErrorType, getGroupErrorMessage } from '@/utils/groupErrorDetection';

import { DhcpReservationsTableModal } from './DhcpReservationsTableModal'; // Import the new modal component
import { ActiveArpTableModal } from './ActiveArpTableModal'; // Import the ARP table modal component
import { DhcpKeaLeasesTableModal } from './DhcpKeaLeasesTableModal'; // Import the new Kea leases modal component
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'; // Import Alert components
import type { SearchableSelectOption } from '@/components/ui/searchable-select'; // Import SearchableSelectOption



interface SubnetOption {
  label: string; // e.g., "192.168.1.0/24"
  value: string; // OPNsense UUID for the subnet
}

interface ManageDhcpCardProps {
  vpnConnectionStatuses: Map<string, { status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string }>; // Updated to include 'disabled'
  groupVpnMap: Map<string, string>;
  // Form state memoization props
  selectedAlias: OpnsenseAliasDetailFromExport | null;
  onSelectedAliasChange: (alias: OpnsenseAliasDetailFromExport | null) => void;
  ipAddress: string;
  onIpAddressChange: (ipAddress: string) => void;
  macAddress: string;
  onMacAddressChange: (macAddress: string) => void;
  hostname: string;
  onHostnameChange: (hostname: string) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  selectedSubnet: string;
  onSelectedSubnetChange: (subnet: string) => void;
}

export function ManageDhcpCard({
  vpnConnectionStatuses,
  groupVpnMap,
  selectedAlias,
  onSelectedAliasChange,
  ipAddress,
  onIpAddressChange,
  macAddress,
  onMacAddressChange,
  hostname,
  onHostnameChange,
  description,
  onDescriptionChange,
  selectedSubnet,
  onSelectedSubnetChange,
}: ManageDhcpCardProps) {
  const { toast } = useToast();
  const { data: session } = useSession();
  const userName = session?.user?.name || 'Unknown User';
  const isMobile = useIsMobile(); // Use the hook to detect mobile
  const { enableGroupTypes, singleSelectName, multiSelectName } = useGroupType(); // Use the hook to get custom names

  const [aliases, setAliases] = useState<OpnsenseAliasDetailFromExport[]>([]);
  const [subnets, setSubnets] = useState<SubnetOption[]>([]);
  // Form state is now managed by parent component and passed as props
  const [macPlaceholder, setMacPlaceholder] = useState('e.g., 00:11:22:33:44:55'); // New state for MAC placeholder
  const [hostnamePlaceholder, setHostnamePlaceholder] = useState('e.g., mydevice'); // New state for hostname placeholder
  const [lookedUpReservationUuid, setLookedUpReservationUuid] = useState<string | null>(null);
  const [ipConflict, setIpConflict] = useState(false); // New state for IP conflict
  const [macConflict, setMacConflict] = useState(false); // New state for MAC conflict

  const [isLoadingAliases, setIsLoadingAliases] = useState(false);
  const [isLoadingSubnets, setIsLoadingSubnets] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReservationsModalOpen, setIsReservationsModalOpen] = useState(false); // State for Reservations modal visibility
  const [isArpTableModalOpen, setIsArpTableModalOpen] = useState(false); // State for ARP Table modal visibility
  const [isKeaLeasesModalOpen, setIsKeaLeasesModalOpen] = useState(false); // State for Kea Leases modal visibility
  const [isAliasDropdownOpen, setIsAliasDropdownOpen] = useState(false); // State to control alias dropdown open/close
  const [error, setError] = useState<string | null>(null); // Add error state

  // Helper function to get subnet name from UUID - Defined early to avoid "used before declaration"
  const getSubnetName = useCallback((subnetUuid: string): string => {
    const subnet = subnets.find(s => s.value === subnetUuid);
    return subnet ? subnet.label : subnetUuid; // Fallback to UUID if not found
  }, [subnets]);

  // Lookup DHCP Reservation - Defined early to avoid "used before declaration"
  const handleLookupReservation = useCallback(async (ip: string, mac: string) => {
    if (!ip && !mac) { // Require either IP or MAC for lookup
      setLookedUpReservationUuid(null);
      setIpConflict(false);
      setMacConflict(false);
      return;
    }

    setIsLookingUp(true);
    try {
      const macParam = mac ? `&mac=${mac}` : '';
      const response = await fetch(`/api/opnsense/dhcp?action=search_reservation&ip=${ip}${macParam}`);
      const result = await response.json();

      if (response.ok && result.success) {
        const reservation = result.reservation;
        setLookedUpReservationUuid(reservation.uuid || null);
        onSelectedSubnetChange(reservation.subnet);
        onHostnameChange(reservation.hostname || '');
        onDescriptionChange(reservation.description || '');
        setIpConflict(result.ipConflict || false); // Keep conflict state from backend
        setMacConflict(result.macConflict || false); // Keep conflict state from backend

        const isConflictOnLookup = result.message && result.message.includes("already reserved");
        const isPrivacyMac = reservation.hw_address && checkMacRandomization(reservation.hw_address).isRandomized;

        // Show toast based on privacy MAC detection
        if (isPrivacyMac && !isConflictOnLookup) {
          // Show only the privacy MAC warning toast (suppress the green success toast)
          toast({
            title: "⚠️ Privacy MAC Address Detected",
            description: (
              <div>
                <p><strong>IP:</strong> {reservation.ip_address}</p>
                <p><strong>MAC:</strong> {reservation.hw_address}</p>
                {reservation.hostname && <p><strong>Hostname:</strong> {reservation.hostname}</p>}
                {reservation.description && <p><strong>Description:</strong> {reservation.description}</p>}
                <p><strong>Subnet:</strong> {getSubnetName(reservation.subnet)}</p>
                <p className="text-sm mt-2">This IP has a DHCP reservation however the MAC address seems to be a randomized address. The DHCP reservation may not work as expected and the IP might change.</p>
              </div>
            ),
            variant: "warning",
            duration: 10000, // Show for longer duration for important warning
          });
        } else {
          // Show normal reservation found toast for conflicts or normal reservations
          toast({
            title: isConflictOnLookup ? `DHCP Conflict: ${result.message}` : (result.message || "Reservation Found"),
            description: (
              <div>
                <p><strong>IP:</strong> {reservation.ip_address}</p>
                <p><strong>MAC:</strong> {reservation.hw_address}</p>
                {reservation.hostname && <p><strong>Hostname:</strong> {reservation.hostname}</p>}
                {reservation.description && <p><strong>Description:</strong> {reservation.description}</p>}
                <p><strong>Subnet:</strong> {getSubnetName(reservation.subnet)}</p>
                <p className="text-sm mt-2">This reservation exists on OPNsense.</p>
              </div>
            ),
            variant: isConflictOnLookup ? "warning" : "success", // Use warning for conflicts, success otherwise
            duration: 8000, // Show for a longer duration
          });
        }
      } else {
        setLookedUpReservationUuid(null);
        setIpConflict(result.ipConflict || false);
        setMacConflict(result.macConflict || false);
        const isConflictMessage = result.message && result.message.includes("already reserved");
        toast({
          title: isConflictMessage ? "DHCP Conflict" : (result.message || "No Reservation Found"),
          description: isConflictMessage ? result.message : (result.message || "No DHCP reservation found for the given IP and MAC address."),
          variant: isConflictMessage ? "warning" : "default",
        });
      }
    } catch (error) {
      logger.error("Failed to lookup DHCP reservation:", error);
      setLookedUpReservationUuid(null);
      setIpConflict(false);
      setMacConflict(false);
      toast({
        title: "Error",
        description: `Failed to lookup DHCP reservation: ${(error as Error).message}`,
        variant: "destructive",
      });
    } finally {
      setIsLookingUp(false);
    }
  }, [toast, setLookedUpReservationUuid, onSelectedSubnetChange, onHostnameChange, onDescriptionChange, setIpConflict, setMacConflict, getSubnetName]);

  // Fetch aliases and subnets on component mount
  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingAliases(true);
      try {
        const response = await fetch('/api/user/devices'); // Changed to /api/user/devices
        if (!response.ok) {
          const errorData = await response.json(); // Capture error data
          throw new Error(errorData.message || 'Failed to fetch host aliases');
        }
        const fetchedData = await response.json();
        // The /api/user/devices endpoint returns the array directly
        setAliases(Array.isArray(fetchedData) ? fetchedData : []);
        setError(null); // Clear previous errors on success
      } catch (error) {
        logger.error("Failed to fetch host aliases:", error);
        setError(error instanceof Error ? error.message : 'An unknown error occurred while fetching aliases'); // Set error state
        toast({
          title: "Error",
          description: "Failed to load host aliases.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingAliases(false);
      }

      setIsLoadingSubnets(true);
      try {
        const response = await fetch('/api/opnsense/dhcp?action=subnets');
        if (!response.ok) {
          const errorData = await response.json(); // Capture error data
          throw new Error(errorData.message || 'Failed to fetch DHCP subnets');
        }
        const fetchedSubnets = await response.json();
        setSubnets(fetchedSubnets.map((s: { subnet: string; uuid: string }) => ({ label: s.subnet, value: s.uuid })));
        setError(null); // Clear previous errors on success
      } catch (error) {
        logger.error("Failed to fetch DHCP subnets:", error);
        setError(error instanceof Error ? error.message : 'An unknown error occurred while fetching subnets'); // Set error state
        toast({
          title: "Error",
          description: "Failed to load DHCP subnets.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingSubnets(false);
      }
    };
    fetchData();
  }, [toast]);

  // Helper function to check if an IP is within a CIDR subnet
  const isIpInSubnet = useCallback((ip: string, subnetCidr: string): boolean => {
    try {
      const [subnetIp, cidrStr] = subnetCidr.split('/');
      const cidr = parseInt(cidrStr, 10);

      if (isNaN(cidr) || cidr < 0 || cidr > 32) {
        return false; // Invalid CIDR
      }

      const ipParts = ip.split('.').map(Number);
      const subnetParts = subnetIp.split('.').map(Number);

      if (ipParts.length !== 4 || subnetParts.length !== 4) {
        return false; // Not a valid IPv4 address
      }

      // Calculate the network address for both IP and subnet
      let ipNetwork = 0;
      let subnetNetwork = 0;
      for (let i = 0; i < 4; i++) {
        ipNetwork = (ipNetwork << 8) | ipParts[i];
        subnetNetwork = (subnetNetwork << 8) | subnetParts[i];
      }

      const mask = -1 << (32 - cidr); // Calculate subnet mask

      return (ipNetwork & mask) === (subnetNetwork & mask);
    } catch (e) {
      logger.error("Error checking IP in subnet:", e);
      return false;
    }
  }, []);

  // Function to auto-select subnet based on IP
  const autoSelectSubnet = useCallback((ip: string) => {
    const matchingSubnet = subnets.find(s => isIpInSubnet(ip, s.label));
    if (matchingSubnet) {
      onSelectedSubnetChange(matchingSubnet.value);
    } else {
      onSelectedSubnetChange('');
    }
  }, [subnets, isIpInSubnet, onSelectedSubnetChange]);

  // Handle IP address change (manual input or alias selection)
  const handleIpAddressChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newIp = e.target.value;
    onIpAddressChange(newIp);
    // Clear selected alias if IP is manually changed
    onSelectedAliasChange(null);
    setLookedUpReservationUuid(null); // Clear any previous reservation lookup
    setIpConflict(false); // Clear conflicts on IP change
    setMacConflict(false); // Clear conflicts on IP change
    // Auto-select subnet based on IP
    autoSelectSubnet(newIp);
    // Removed automatic lookup trigger from here
  }, [autoSelectSubnet, onIpAddressChange, onSelectedAliasChange]);

  // Handle alias selection from dropdown
  const handleAliasSelect = useCallback(async (value: string | null) => {
    const alias = aliases.find(a => a.uuid === value) || null;
    onSelectedAliasChange(alias);
    const newIp = alias?.content || '';
    onIpAddressChange(newIp); // Set IP from alias content

    // Clear previous reservation lookup and conflicts
    setLookedUpReservationUuid(null);
    setIpConflict(false);
    setMacConflict(false);

    // Auto-select subnet based on alias IP
    autoSelectSubnet(newIp);

    let detectedMac = '';
    let detectedHostname = '';

    // Attempt to detect MAC and Hostname if an IP is available
    if (alias?.content) {
      setIsDetecting(true);
      try {
        // First, try to get network details from ARP (for online devices)
        const response = await fetch(`/api/ip?ip=${alias.content}`);
        if (!response.ok) {
          throw new Error('Failed to fetch device network details');
        }
        const networkDetails = await response.json();

        if (networkDetails.mac) {
          // Device is online, use ARP data
          detectedMac = networkDetails.mac.toLowerCase(); // Normalize to lowercase
          onMacAddressChange(detectedMac);
          setMacPlaceholder('e.g., 00:11:22:33:44:55');
        } else {
          // Device is not online, check if we have DHCP reservation data
          if (alias.isDhcpReserved && alias.dhcpReservedMac) {
            // Use DHCP reservation data for offline devices
            detectedMac = alias.dhcpReservedMac.toLowerCase(); // Normalize to lowercase
            onMacAddressChange(detectedMac);
            setMacPlaceholder('e.g., 00:11:22:33:44:55');
          } else {
            onMacAddressChange('');
            setMacPlaceholder('MAC address detection failed, host probably not online. Please add manually (e.g., 00:11:22:33:44:55)');
          }
        }

        if (networkDetails.hostname) {
          // Device is online, use ARP hostname
          detectedHostname = networkDetails.hostname;
          onHostnameChange(detectedHostname);
          setHostnamePlaceholder('e.g., mydevice');
        } else {
          // Device is not online, we don't have hostname from DHCP reservation in alias data
          onHostnameChange('');
          setHostnamePlaceholder('Hostname detection failed. Please add manually (e.g., mydevice)');
        }
        // Do not pre-fill description here, it will be handled in handleAddReservation
      } catch (error) {
        logger.error("Failed to detect MAC/Hostname:", error);

        // Fallback to DHCP reservation data if ARP detection fails
        if (alias.isDhcpReserved && alias.dhcpReservedMac) {
          detectedMac = alias.dhcpReservedMac.toLowerCase(); // Normalize to lowercase
          onMacAddressChange(detectedMac);
          setMacPlaceholder('e.g., 00:11:22:33:44:55');
        } else {
          onMacAddressChange('');
          setMacPlaceholder('MAC address detection failed, host probably not online. Please add manually (e.g., 00:11:22:33:44:55)');
        }

        onHostnameChange('');
        setHostnamePlaceholder('Hostname detection failed. Please add manually (e.g., mydevice)');

        toast({
          title: "Detection Error",
          description: "Could not automatically detect MAC address or hostname from ARP, but using DHCP reservation data if available.",
          variant: "default",
        });
      } finally {
        setIsDetecting(false);
      }
    } else {
      onMacAddressChange('');
      onHostnameChange('');
      setMacPlaceholder('Please enter MAC address manually (e.g., 00:11:22:33:44:55)'); // More generic message
      setHostnamePlaceholder('Please enter hostname manually (e.g., mydevice)'); // More generic message
    }

    // Trigger lookup after all relevant fields are potentially updated
    if (newIp || detectedMac) { // Trigger lookup if either IP or detected MAC is available
      await handleLookupReservation(newIp, detectedMac); // Pass detectedMac directly
      // After lookup, re-evaluate and set the subnet based on the IP
      autoSelectSubnet(newIp);
    }
  }, [toast, autoSelectSubnet, handleLookupReservation, setLookedUpReservationUuid, onMacAddressChange, onHostnameChange, setIpConflict, setMacConflict, aliases, onSelectedAliasChange, onIpAddressChange]); // Updated dependencies

  // Render function for alias options in SearchableSelect
  const renderAliasOption = useCallback((option: SearchableSelectOption) => {
    return (
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <StatusDotWithTooltip
            color={getHostAliasStatusColor(
              !option.isDisabled, // isEnabled = !isDisabled
              !!option.detectedMac // hasArpEntry = has detected MAC
            )}
            tooltip={
              <div>
                <p>Status: {!option.isDisabled ? (option.detectedMac ? 'Online' : 'Offline') : 'Disabled'}</p>
                {option.detectedMac && <p>MAC: {option.detectedMac}</p>}
                {option.detectedVendor && <p>Vendor: {option.detectedVendor}</p>}
                {option.aliasDescription && <p>Description: {option.aliasDescription}</p>}
              </div>
            }
            size="sm"
          />
          <span>{option.label}</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap max-w-full justify-end">
          {option.isDhcpReserved && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className={cn(
                    "h-4 w-auto px-1 text-xs",
                    (() => {
                      const isConflict = option.isDhcpReserved && option.dhcpReservedMac && option.detectedMac &&
                        option.dhcpReservedMac.toLowerCase() !== option.detectedMac.toLowerCase();
                      const isPrivacyMac = option.isDhcpReserved && option.dhcpReservedMac &&
                        checkMacRandomization(option.dhcpReservedMac).isRandomized;

                      if (isConflict) {
                        return "bg-orange-500 hover:bg-orange-600 text-white"; // Conflict (highest priority)
                      } else if (isPrivacyMac) {
                        return "bg-yellow-600 hover:bg-yellow-700 text-white"; // Privacy MAC (medium priority)
                      } else {
                        return "bg-blue-500 hover:bg-blue-600 text-white"; // Normal (lowest priority)
                      }
                    })()
                  )}>
                    DHCP
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {(() => {
                    const isConflict = option.isDhcpReserved && option.dhcpReservedMac && option.detectedMac &&
                      option.dhcpReservedMac.toLowerCase() !== option.detectedMac.toLowerCase();
                    const isPrivacyMac = option.isDhcpReserved && option.dhcpReservedMac &&
                      checkMacRandomization(option.dhcpReservedMac).isRandomized;

                    if (isConflict) {
                      return (
                        <>
                          <p>DHCP Conflict: Reserved for a different MAC address.</p>
                          {option.dhcpReservedMac && <p>Reserved MAC: {option.dhcpReservedMac.toLowerCase()}</p>}
                          {option.dhcpReservedVendor && option.dhcpReservedMac && !checkMacRandomization(option.dhcpReservedMac).isRandomized && <p>Reserved Vendor: {option.dhcpReservedVendor}</p>}
                          {option.detectedMac && <p>Active MAC: {option.detectedMac.toLowerCase()}</p>}
                        </>
                      );
                    } else if (isPrivacyMac) {
                      return (
                        <>
                          <p>DHCP (Privacy MAC)</p>
                          {option.dhcpReservedMac && <p>Reserved MAC: {option.dhcpReservedMac.toLowerCase()}</p>}
                          {option.dhcpReservedVendor && option.dhcpReservedMac && !checkMacRandomization(option.dhcpReservedMac).isRandomized && <p>Reserved Vendor: {option.dhcpReservedVendor}</p>}
                        </>
                      );
                    } else {
                      return (
                        <>
                          <p>DHCP Reserved</p>
                          {option.dhcpReservedMac && <p>MAC: {option.dhcpReservedMac.toLowerCase()}</p>}
                          {option.dhcpReservedVendor && <p>Vendor: {option.dhcpReservedVendor}</p>}
                        </>
                      );
                    }
                  })()}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {option.vpnInfo && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className={cn(
                    "h-4 w-auto px-1 text-xs",
                    // Updated status logic to handle multiple VPNs and mixed states
                    option.vpnInfo.status === 'connected' ? "bg-darker-green hover:bg-darker-green/80 text-white" :
                      option.vpnInfo.status === 'disabled' ? (option.vpnInfo.isMultiple ? "bg-orange-500 hover:bg-orange-600 text-white" : "bg-gray-500 hover:bg-gray-600 text-white") :
                        "bg-darker-red hover:bg-darker-red/80 text-white"
                  )}>
                    {option.vpnInfo.isMultiple ? (
                      `${option.vpnInfo.totalCount} VPNs`
                    ) : (
                      option.vpnInfo.type === 'openvpn' ? 'OpenVPN' :
                        option.vpnInfo.type === 'wireguard' ? 'WireGuard' :
                          option.vpnInfo.type === 'ipsec' ? 'IPsec' :
                            option.vpnInfo.type
                    )}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {option.vpnInfo.isMultiple ? (
                    <div className="space-y-1">
                      <p className="font-medium">VPN Status Summary:</p>
                      <p>✓ {option.vpnInfo.connectedCount} Connected</p>
                      <p>✗ {option.vpnInfo.totalCount! - option.vpnInfo.connectedCount!} Disconnected/Disabled</p>
                      <div className="border-t pt-1 mt-2">
                        <p className="font-medium">VPNs:</p>
                        {option.vpnInfo.allVpns?.map((vpn, index) => (
                          <p key={index} className="text-sm">
                            {vpn.type === 'openvpn' ? 'OpenVPN' :
                              vpn.type === 'wireguard' ? 'WireGuard' :
                                vpn.type === 'ipsec' ? 'IPsec' :
                                  vpn.type} - {vpn.status === 'connected' ? 'Connected' : vpn.status === 'disabled' ? 'Disabled' : 'Disconnected'}
                          </p>
                        ))}
                      </div>
                      {option.memberOfGroups && option.memberOfGroups.length > 0 && (
                        <div className="border-t pt-1 mt-2">
                          <p className="font-medium">Groups:</p>
                          {option.memberOfGroups.map((g, index) => (
                            <p key={index} className="text-sm">{g.friendlyName || g.name}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {option.vpnInfo.type === 'openvpn' && (
                        <p>OpenVPN {option.vpnInfo.status === 'connected' ? 'Connected' : 'Disconnected'}</p>
                      )}
                      {option.vpnInfo.type === 'wireguard' && (
                        <p>WireGuard {option.vpnInfo.status === 'connected' ? 'Connected' : 'Disconnected'}</p>
                      )}
                      {option.vpnInfo.type === 'ipsec' && (
                        <p>IPsec {option.vpnInfo.status === 'connected' ? 'Connected' : 'Disconnected'}</p>
                      )}
                      {option.memberOfGroups && option.memberOfGroups.length > 0 && (
                        option.memberOfGroups.length === 1 ? (
                          <p>Group Association: {option.memberOfGroups[0].friendlyName || option.memberOfGroups[0].name} ({option.memberOfGroups[0].groupType === 'MultiSelect' ? multiSelectName : singleSelectName})</p>
                        ) : (
                          <div>
                            <p>Group Association:</p>
                            {option.memberOfGroups.map((g, index) => (
                              <p key={index} className="text-sm">{g.friendlyName || g.name} ({g.groupType === 'MultiSelect' ? multiSelectName : singleSelectName})</p>
                            ))}
                          </div>
                        )
                      )}
                    </>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {option.memberOfGroups && option.memberOfGroups.length > 0 && ( // Check if there are any memberOfGroups
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className={cn(
                    "h-4 w-auto px-1 text-xs",
                    option.memberOfGroups.length === 1
                      ? "bg-amber-700 hover:bg-amber-700/80 text-white"
                      : hasAnyGroupError(option.memberOfGroups, enableGroupTypes)
                        ? "bg-orange-500 hover:bg-orange-600 text-white"
                        : "bg-red-600 hover:bg-red-700 text-white"
                  )}>
                    {option.memberOfGroups.length === 1 ? 'InGroup' : `${option.memberOfGroups.length} Groups`}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {hasAnyGroupError(option.memberOfGroups || [], enableGroupTypes) ? (
                    <div>
                      <p className="text-orange-400 font-semibold">{getGroupErrorMessage(getGroupErrorType(option.memberOfGroups || [], enableGroupTypes))}</p>
                      <p className="text-sm mt-1">Member of:</p>
                      {option.memberOfGroups?.map((g, index) => (
                        <p key={index} className="text-sm">{g.friendlyName || g.name}{enableGroupTypes ? ` (${g.groupType === 'MultiSelect' ? multiSelectName : singleSelectName})` : ''}</p>
                      ))}
                    </div>
                  ) : enableGroupTypes ? (
                    <div>
                      <p className="text-sm">Member of:</p>
                      {option.memberOfGroups?.map((g, index) => (
                        <p key={index} className="text-sm">{g.friendlyName || g.name} ({g.groupType === 'MultiSelect' ? multiSelectName : singleSelectName})</p>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm">Member of:</p>
                      {option.memberOfGroups?.map((g, index) => (
                        <p key={index} className="text-sm">{g.friendlyName || g.name}</p>
                      ))}
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {option.detectedMac && checkMacRandomization(option.detectedMac).isRandomized && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="h-4 w-auto px-1 text-xs bg-yellow-600 hover:bg-yellow-700 text-white">
                    Privacy
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Privacy MAC Address detected.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {option.detectedMac && option.detectedMac.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="default" className="bg-purple-500 hover:bg-purple-600 h-4 w-auto px-1 text-xs">ARP</Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Active Device</p>
                  <p>MAC: {option.detectedMac.toLowerCase()}</p>
                  {option.detectedVendor && <p>Vendor: {option.detectedVendor}</p>}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {option.isDisabled && ( // New Disabled badge
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="bg-gray-500 hover:bg-gray-600 text-white h-4 w-auto px-1 text-xs">Disabled</Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>This host alias is disabled and cannot be managed.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    );
  }, [enableGroupTypes, multiSelectName, singleSelectName]);

  const refreshAliases = useCallback(async () => {
    setIsLoadingAliases(true);
    try {
      const response = await fetch('/api/user/devices');
      if (!response.ok) {
        const errorData = await response.json(); // Capture error data
        throw new Error(errorData.message || 'Failed to fetch host aliases');
      }
      const fetchedData = await response.json();
      setAliases(Array.isArray(fetchedData) ? fetchedData : []);
      setError(null); // Clear previous errors on success

      // After fetching new aliases, if an alias is currently selected,
      // find its updated version and re-select it to trigger UI updates.
      if (selectedAlias?.uuid) {
        const updatedSelectedAlias = fetchedData.find(
          (alias: OpnsenseAliasDetailFromExport) => alias.uuid === selectedAlias.uuid
        );
        // Use handleAliasSelect to ensure all dependent states are updated
        await handleAliasSelect(updatedSelectedAlias?.uuid || null);
      }
    } catch (error) {
      logger.error("Failed to fetch host aliases:", error);
      setError(error instanceof Error ? error.message : 'An unknown error occurred while refreshing aliases'); // Set error state
      toast({
        title: "Error",
        description: "Failed to load host aliases.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingAliases(false);
    }
  }, [toast, selectedAlias, handleAliasSelect]);

  // Handle MAC address change (manual input or detection)
  const handleMacAddressChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newMac = e.target.value;
    // Normalize MAC address to lowercase to prevent Kea DHCP crashes
    const normalizedMac = newMac.toLowerCase();
    onMacAddressChange(normalizedMac);
    setMacPlaceholder('e.g., 00:11:22:33:44:55'); // Reset placeholder when user types
    setLookedUpReservationUuid(null); // Clear any previous reservation lookup
    setIpConflict(false); // Clear conflicts on MAC change
    setMacConflict(false); // Clear conflicts on MAC change
    // Removed automatic lookup trigger from here
  }, [onMacAddressChange]);

  // Handle Hostname change
  const handleHostnameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onHostnameChange(e.target.value);
    setHostnamePlaceholder('e.g., mydevice'); // Reset placeholder when user types
  }, [onHostnameChange]);

  // Handle Description change
  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onDescriptionChange(e.target.value);
  }, [onDescriptionChange]);

  // Handle Subnet selection
  const handleSubnetSelect = useCallback((value: string | null) => {
    onSelectedSubnetChange(value || ''); // Ensure it's always a string, default to empty if null
  }, [onSelectedSubnetChange]);

  // Function to update alias DHCP status in-place
  const updateAliasDhcpStatus = useCallback((ipAddress: string, isDhcpReserved: boolean, dhcpReservedMac?: string | null, dhcpReservedVendor?: string | null) => {
    setAliases(prevAliases =>
      prevAliases.map(alias => {
        if (alias.content === ipAddress) {
          return {
            ...alias,
            isDhcpReserved,
            dhcpReservedMac: dhcpReservedMac || null,
            dhcpReservedVendor: dhcpReservedVendor || null,
          };
        }
        return alias;
      })
    );
  }, []);

  // Add DHCP Reservation
  const handleAddReservation = useCallback(async () => {
    if (!ipAddress || !macAddress || !selectedSubnet) {
      toast({
        title: "Missing Information",
        description: "Please provide IP Address, MAC Address, and Subnet to add a reservation.",
        variant: "destructive",
      });
      return;
    }

    // MAC address validation - normalize to lowercase first
    const normalizedMacAddress = macAddress.toLowerCase();
    // This regex is safe - it has bounded quantifiers and no backtracking issues
    // eslint-disable-next-line security/detect-unsafe-regex
    const macRegex = /^([0-9a-f]{2}:){5}([0-9a-f]{2})$/;
    if (!macRegex.test(normalizedMacAddress)) {
      toast({
        title: "Invalid MAC Address Format",
        description: "MAC Address must be in the format a1:b2:c3:d4:e5:f6. Other formats are not allowed.",
        variant: "destructive",
      });
      return;
    }

    setIsAdding(true);
    try {
      let finalDescription = description.trim();
      const defaultDescriptionSuffix = `assigned via instrada-ogm by ${userName}`;

      if (finalDescription === '') {
        finalDescription = defaultDescriptionSuffix;
      } else if (!finalDescription.includes(defaultDescriptionSuffix)) {
        finalDescription = `${finalDescription} - ${defaultDescriptionSuffix}`;
      }

      const payload = {
        subnet: selectedSubnet,
        ip_address: ipAddress,
        hw_address: macAddress.toLowerCase(), // Ensure MAC address is lowercase before sending to API
        hostname: hostname || undefined,
        description: finalDescription || undefined,
      };
      const response = await fetch('/api/opnsense/dhcp?action=add_reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      });
      const result = await response.json();

      if (response.ok && result.success) {
        // Update the alias list in-place to reflect the new DHCP reservation
        updateAliasDhcpStatus(ipAddress, true, macAddress, null); // We don't have vendor info here

        toast({
          title: "Reservation Added",
          description: "DHCP reservation successfully added.",
          variant: "success",
        });
        // After adding, clear form or refresh lookup
        onIpAddressChange('');
        onMacAddressChange('');
        onHostnameChange('');
        onDescriptionChange(''); // Reset description to empty string
        onSelectedSubnetChange('');
        onSelectedAliasChange(null); // Clear selected alias
        setLookedUpReservationUuid(null); // Clear looked up UUID after adding
        setIpConflict(false); // Clear conflicts after successful add
        setMacConflict(false); // Clear conflicts after successful add
      } else {
        // Check if it's a MAC address conflict specifically
        const isMacConflict = result.message && result.message.includes("MAC address") && result.message.includes("already reserved");
        const isArpMacConflict = result.message && result.message.includes("MAC address") && result.message.includes("currently in use") && result.message.includes("ARP table");
        toast({
          title: isMacConflict ? "MAC Address Conflict" : isArpMacConflict ? "ARP Table Conflict" : "Failed to Add Reservation",
          description: result.message || "Failed to add DHCP reservation.",
          variant: "destructive",
        });
      }
    } catch (error) {
      logger.error("Failed to add DHCP reservation:", error);
      toast({
        title: "Error",
        description: `An unexpected error occurred while adding reservation: ${(error as Error).message}`,
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  }, [ipAddress, macAddress, selectedSubnet, hostname, description, toast, userName, setLookedUpReservationUuid, setIpConflict, setMacConflict, updateAliasDhcpStatus, onIpAddressChange, onMacAddressChange, onHostnameChange, onDescriptionChange, onSelectedSubnetChange, onSelectedAliasChange]);

  // Delete DHCP Reservation
  const handleDeleteReservation = useCallback(async () => {
    if (!lookedUpReservationUuid) {
      toast({
        title: "No Reservation Selected",
        description: "Please lookup and select an existing reservation to delete.",
        variant: "destructive",
      });
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch('/api/opnsense/dhcp?action=del_reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationUuid: lookedUpReservationUuid,
          // Pass current form data for logging purposes
          reservationDetails: {
            ip_address: ipAddress,
            hw_address: macAddress,
            hostname: hostname,
            description: description,
            subnet: selectedSubnet,
          },
        }),
      });
      const result = await response.json();

      if (response.ok && result.success) {
        // Update the alias list in-place to reflect the removed DHCP reservation
        updateAliasDhcpStatus(ipAddress, false, null, null);

        toast({
          title: "Reservation Deleted",
          description: "DHCP reservation successfully deleted.",
          variant: "success",
        });
        // Clear form after deletion
        onIpAddressChange('');
        onMacAddressChange('');
        onHostnameChange('');
        onDescriptionChange(''); // Reset description to empty string
        onSelectedSubnetChange('');
        onSelectedAliasChange(null); // Clear selected alias
        setLookedUpReservationUuid(null); // Clear looked up UUID after deletion
        setIpConflict(false); // Clear conflicts after successful delete
        setMacConflict(false); // Clear conflicts after successful delete
      } else {
        toast({
          title: "Failed to Delete Reservation",
          description: result.message || "Failed to delete DHCP reservation on OPNsense.",
          variant: "destructive",
        });
      }
    } catch (error) {
      logger.error("Failed to delete DHCP reservation:", error);
      toast({
        title: "Error",
        description: `An unexpected error occurred while deleting reservation: ${(error as Error).message}`,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }, [lookedUpReservationUuid, toast, setLookedUpReservationUuid, setIpConflict, setMacConflict, ipAddress, macAddress, hostname, description, selectedSubnet, updateAliasDhcpStatus, onIpAddressChange, onMacAddressChange, onHostnameChange, onDescriptionChange, onSelectedSubnetChange, onSelectedAliasChange]);

  // Callback to clear form fields after reservations are deleted from the modal
  const handleReservationsDeletedFromModal = useCallback(() => {
    onIpAddressChange('');
    onMacAddressChange('');
    onHostnameChange('');
    onDescriptionChange('');
    onSelectedSubnetChange('');
    onSelectedAliasChange(null);
    setLookedUpReservationUuid(null);
    setIpConflict(false);
    setMacConflict(false);
  }, [onIpAddressChange, onMacAddressChange, onHostnameChange, onDescriptionChange, onSelectedSubnetChange, onSelectedAliasChange]);

  // Callback to handle lease selection from the leases modal
  const handleLeaseSelectedFromModal = useCallback(async (ip: string, mac: string, hostname: string) => {
    onIpAddressChange(ip);
    onMacAddressChange(mac.toLowerCase()); // Normalize MAC address to lowercase
    onHostnameChange(hostname);
    onDescriptionChange(`Retrieved from OPNsense - assigned via instrada-ogm by ${userName}`); // Pre-fill description
    // Trigger lookup for existing reservation
    await handleLookupReservation(ip, mac.toLowerCase()); // Use normalized MAC for lookup
    // After lookup, re-evaluate and set the subnet based on the IP
    autoSelectSubnet(ip);
  }, [userName, autoSelectSubnet, handleLookupReservation, onIpAddressChange, onMacAddressChange, onHostnameChange, onDescriptionChange]);

  return (
    <Card className="flex flex-col flex-1 mb-0 min-h-0">
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0 pb-4">
        <div>
          <CardTitle className={`flex items-center ${isMobile ? 'text-xl' : 'text-2xl'}`}>
            <ClientOnly><Server size={28} className="mr-2 text-primary" /></ClientOnly> DHCP Reservations
          </CardTitle>
          {!isMobile && <CardDescription>Manage static DHCP leases and reservations on OPNsense.</CardDescription>}
        </div>
        <div className="flex w-full justify-end md:w-auto flex-wrap gap-2"> {/* Responsive width and alignment for button container */}
          <Button
            onClick={() => setIsKeaLeasesModalOpen(true)} // Open Kea leases modal on click
            disabled={isLookingUp || isAdding || isDeleting}
            size={isMobile ? 'icon' : 'default'}
            className={!isMobile ? 'min-w-[120px]' : ''}
          >
            <ListChecks className={cn("h-4 w-4", !isMobile && "mr-2")} />
            {!isMobile && 'DHCP Leases'}
          </Button>
          <Button
            onClick={() => setIsArpTableModalOpen(true)} // Open ARP table modal on click
            disabled={isLookingUp || isAdding || isDeleting}
            size={isMobile ? 'icon' : 'default'}
            className={!isMobile ? 'min-w-[120px]' : ''}
          >
            <ClipboardList className={cn("h-4 w-4", !isMobile && "mr-2")} />
            {!isMobile && 'ARP Table'}
          </Button>
          <Button
            onClick={() => setIsReservationsModalOpen(true)} // Open reservations modal on click
            disabled={isLookingUp || isAdding || isDeleting}
            size={isMobile ? 'icon' : 'default'}
            className={!isMobile ? 'min-w-[120px]' : ''}
          >
            <Table className={cn("h-4 w-4", !isMobile && "mr-2")} />
            {!isMobile && 'Reservations'}
          </Button>
          <Button
            onClick={() => handleLookupReservation(ipAddress, macAddress)}
            disabled={isLookingUp || isAdding || isDeleting || (!ipAddress && !macAddress)} // Enable if either IP or MAC is present
            size={isMobile ? 'icon' : 'default'}
          >
            <Search className={cn("h-4 w-4", !isMobile && "mr-2")} />
            {!isMobile && (isLookingUp ? 'Looking Up...' : 'Lookup')}
          </Button>
          <Button
            onClick={handleAddReservation}
            disabled={isAdding || isLookingUp || isDeleting || !ipAddress || !macAddress || !selectedSubnet || lookedUpReservationUuid !== null || ipConflict || macConflict}
            size={isMobile ? 'icon' : 'default'}
          >
            <PlusCircle className={cn("h-4 w-4", !isMobile && "mr-2")} />
            {!isMobile && (isAdding ? 'Adding...' : 'Add')}
          </Button>
          <Button
            onClick={handleDeleteReservation}
            variant="destructive"
            disabled={isDeleting || isLookingUp || isAdding || lookedUpReservationUuid === null}
            size={isMobile ? 'icon' : 'default'}
          >
            <Trash2 className={cn("h-4 w-4", !isMobile && "mr-2")} />
            {!isMobile && (isDeleting ? 'Deleting...' : 'Delete')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 md:p-6 relative flex-1 overflow-hidden flex flex-col">
        <ScrollArea className="flex-1 pr-4 -mr-4">
          <div className="space-y-4 pr-4">
            {/* Display error if any */}
            {error && (
              <Alert variant="destructive">
                <Terminal className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  {error}
                </AlertDescription>
              </Alert>
            )}
            {/* Alias/IP Search */}
            <div className="grid gap-1.5"> {/* Reduced spacing */}
              <Label htmlFor="alias-search">Search Alias or IP</Label>
              <SearchableSelect
                id="alias-search"
                options={aliases.map(alias => {
                  // Collect all VPNs from all assigned groups for this alias
                  const allAliasVpns: Array<{ vpnUuid: string; status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string }> = [];

                  if (alias.memberOfGroups && alias.memberOfGroups.length > 0) {
                    for (const group of alias.memberOfGroups) {
                      const vpnUuidRaw = groupVpnMap.get(group.uuid);
                      if (vpnUuidRaw) {
                        const vpnUuid = vpnUuidRaw.trim();
                        // Check if we already have this VPN (avoid duplicates)
                        const existingVpn = allAliasVpns.find(vpn => vpn.vpnUuid === vpnUuid);
                        if (!existingVpn) {
                          const info = vpnConnectionStatuses.get(vpnUuid);
                          if (info) {
                            allAliasVpns.push({ vpnUuid: vpnUuid, status: info.status, type: info.type, enabled: info.enabled });
                          }
                        }
                      }
                    }
                  }

                  // Calculate overall VPN status for badge display
                  const aliasVpnInfo: { status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string; isMultiple?: boolean; connectedCount?: number; totalCount?: number; allVpns?: Array<{ vpnUuid: string; status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string }> } | null = (() => {
                    if (allAliasVpns.length === 0) return null;

                    if (allAliasVpns.length === 1) {
                      // Single VPN - return as-is with allVpns for tooltip
                      return { ...allAliasVpns[0], allVpns: allAliasVpns };
                    }

                    // Multiple VPNs - determine overall status
                    const connectedCount = allAliasVpns.filter(vpn => vpn.status === 'connected').length;
                    const totalCount = allAliasVpns.length;

                    // Determine overall status
                    let overallStatus: 'connected' | 'disconnected' | 'disabled';
                    if (connectedCount === totalCount) {
                      overallStatus = 'connected'; // All connected - green
                    } else if (connectedCount === 0) {
                      overallStatus = 'disconnected'; // None connected - red
                    } else {
                      overallStatus = 'disabled'; // Some connected, some not - orange (using disabled for orange color)
                    }

                    // Return the first VPN as representative, but with overall status and multiple flag
                    return {
                      ...allAliasVpns[0],
                      status: overallStatus,
                      isMultiple: true,
                      connectedCount,
                      totalCount,
                      allVpns: allAliasVpns
                    };
                  })();

                  const isPrivacyMac = (alias.detectedMac && checkMacRandomization(alias.detectedMac).isRandomized) ||
                    (alias.isDhcpReserved && alias.dhcpReservedMac && checkMacRandomization(alias.dhcpReservedMac).isRandomized);

                  const searchableText = [
                    alias.name,
                    alias.content,
                    alias.detectedMac,
                    alias.detectedVendor,
                    alias.detectedHostname,
                    alias.description,
                    alias.isDhcpReserved ? 'dhcp' : '',
                    isPrivacyMac ? 'privacy' : '', // Add 'privacy' keyword
                    isPrivacyMac ? 'dhcp-privacy-mac' : '', // Add 'dhcp-privacy-mac' keyword
                    alias.enabled !== '1' ? 'disabled' : '',
                    alias.detectedMac ? 'arp' : '',
                    alias.detectedMac ? 'online' : 'offline',
                    ...(alias.memberOfGroups || []).map(g => g.name),
                    ...(alias.memberOfGroups || []).map(g => g.friendlyName),
                  ].filter(Boolean).join(' ').toLowerCase();

                  return {
                    value: alias.uuid || '',
                    label: `${alias.name} (${alias.content})`,
                    detectedMac: alias.detectedMac || null,
                    detectedVendor: alias.detectedVendor || null,
                    isDhcpReserved: alias.isDhcpReserved || false,
                    dhcpReservedMac: alias.dhcpReservedMac || null,
                    dhcpReservedVendor: alias.dhcpReservedVendor || null,
                    aliasDescription: alias.description || null, // Pass alias description
                    vpnInfo: aliasVpnInfo, // Pass VPN info
                    memberOfGroups: alias.memberOfGroups, // Pass group memberships
                    isDisabled: alias.enabled !== '1', // Add isDisabled based on alias.enabled
                    searchableText: searchableText, // Add searchableText for searching
                  };
                })}
                onValueChange={handleAliasSelect}
                value={selectedAlias?.uuid || null}
                placeholder="Select an alias or enter IP manually"
                disabled={isLoadingAliases || isDetecting || isLookingUp || isAdding || isDeleting}
                className="w-full md:w-[600px]"
                renderOption={renderAliasOption}
                onRefresh={refreshAliases} // Pass the refresh function
                isRefreshLoading={isLoadingAliases} // Pass the loading state
                open={isAliasDropdownOpen} // Pass open state
                onOpenChange={setIsAliasDropdownOpen} // Pass onOpenChange handler
                // Enable progressive loading for consistent experience
                enableVirtualScrolling={true}
                initialLoadCount={100}
                loadMoreCount={50}
                searchDebounceMs={300}
                onShowSearchHelp={() => (
                  <>
                    <p>Search terms:</p>
                    <ul className="list-disc list-inside">
                      <li><code className="font-mono">&lt;IP&gt;</code>: e.g. 192.168.1.1</li>
                      <li><code className="font-mono">&lt;MAC&gt;</code>: e.g. 00:11:22:33:44:55</li>
                      <li><code className="font-mono">&lt;MAC Vendor&gt;</code>: e.g. samsung</li>
                      <li><code className="font-mono">&lt;Hostname&gt;</code>: e.g. mydevice.local</li>
                      <li><code className="font-mono">&lt;Host Alias&gt;</code>: Search by Alias Name</li>
                      <li><code className="font-mono">&lt;Group&gt;</code>: Search by Group Name</li>
                      <li><code className="font-mono">single-select</code>: Devices in {singleSelectName} groups</li>
                      <li><code className="font-mono">multi-select</code>: Devices in {multiSelectName} groups</li>
                      <li><code className="font-mono">vpn</code>: Devices in any VPN</li>
                      <li><code className="font-mono">openvpn</code>: Devices using OpenVPN</li>
                      <li><code className="font-mono">wireguard</code>: Devices using WireGuard</li>
                      <li><code className="font-mono">ipsec</code>: Devices using IPsec</li>
                      <li><code className="font-mono">ingroup</code>: Devices associated to a group</li>
                      <li><code className="font-mono">ingroup-error</code>: Devices with multiple groups when Group Types disabled</li>
                      <li><code className="font-mono">dhcp</code>: Devices with DHCP reservations</li>
                      <li><code className="font-mono">dhcp-conflict</code>: Devices with DHCP MAC conflicts</li>
                      <li><code className="font-mono">dhcp-privacy-mac</code>: Devices with Privacy MAC DHCP reservations</li>
                      <li><code className="font-mono">privacy</code>: Devices with Privacy MAC addresses (from ARP or DHCP)</li>
                      <li><code className="font-mono">vpn-connected</code>: Devices with connected VPNs</li>
                      <li><code className="font-mono">vpn-disconnected</code>: Devices with disconnected VPNs</li>
                      <li><code className="font-mono">online</code>: Devices detected via ARP</li>
                      <li><code className="font-mono">offline</code>: Devices not detected via ARP</li>
                      <li><code className="font-mono">disabled</code>: Disabled host aliases</li>
                      <li><code className="font-mono">arp</code>: Devices detected via ARP (online)</li>
                    </ul>
                  </>
                )}
              />
              <p className="text-sm text-muted-foreground">Select an existing host alias to auto-populate IP, MAC, and Hostname.</p>
            </div>

            <div className="space-y-4 p-1"> {/* Added padding to prevent outline clipping */}
              {/* IP Address */}
              <div className="grid gap-1.5"> {/* Reduced spacing */}
                <Label htmlFor="ip-address">IP Address</Label>
                <Input
                  id="ip-address"
                  type="text"
                  placeholder="e.g., 192.168.1.100"
                  value={ipAddress}
                  onChange={handleIpAddressChange}
                  disabled={isDetecting || isLookingUp || isAdding || isDeleting}
                />
              </div>

              {/* MAC Address */}
              <div className="grid gap-1.5"> {/* Reduced spacing */}
                <Label htmlFor="mac-address">MAC Address</Label>
                <Input
                  id="mac-address"
                  type="text"
                  placeholder={isDetecting ? 'Detecting MAC address...' : macPlaceholder}
                  value={macAddress}
                  onChange={handleMacAddressChange}
                  disabled={isDetecting || isLookingUp || isAdding || isDeleting}
                />
              </div>

              {/* Hostname */}
              <div className="grid gap-1.5"> {/* Reduced spacing */}
                <Label htmlFor="hostname">Hostname (Optional)</Label>
                <Input
                  id="hostname"
                  type="text"
                  placeholder={isDetecting && !hostname ? 'Detecting hostname...' : hostnamePlaceholder}
                  value={hostname}
                  onChange={handleHostnameChange}
                  disabled={isDetecting || isLookingUp || isAdding || isDeleting}
                />
              </div>

              {/* Description */}
              <div className="grid gap-1.5"> {/* Reduced spacing */}
                <Label htmlFor="description">Description (Optional)</Label>
                <Input
                  id="description"
                  type="text"
                  placeholder="e.g., My device reservation + default (assigned via instrada-ogm by User Name)"
                  value={description}
                  onChange={handleDescriptionChange}
                  disabled={isLookingUp || isAdding || isDeleting}
                />
              </div>

              {/* Subnet */}
              <div className="grid gap-1.5"> {/* Reduced spacing */}
                <Label htmlFor="subnet">Subnet</Label>
                <SearchableSelect
                  id="subnet"
                  options={subnets.map(subnet => ({ value: subnet.value, label: subnet.label, isDisabled: false }))}
                  onValueChange={handleSubnetSelect}
                  value={selectedSubnet}
                  placeholder="Select a subnet"
                  disabled={isLoadingSubnets || isLookingUp || isAdding || isDeleting}
                  className="w-[250px]"
                  // Enable progressive loading for consistency
                  enableVirtualScrolling={true}
                  initialLoadCount={100}
                  loadMoreCount={50}
                  searchDebounceMs={300}
                />
              </div>
            </div>
          </div>
        </ScrollArea>
      </CardContent>

      <DhcpReservationsTableModal
        isOpen={isReservationsModalOpen}
        onClose={() => setIsReservationsModalOpen(false)}
        onReservationsDeleted={handleReservationsDeletedFromModal}
      />
      <ActiveArpTableModal
        isOpen={isArpTableModalOpen}
        onClose={() => setIsArpTableModalOpen(false)}
        onLeaseSelected={handleLeaseSelectedFromModal}
      />
      <DhcpKeaLeasesTableModal
        isOpen={isKeaLeasesModalOpen}
        onClose={() => setIsKeaLeasesModalOpen(false)}
        onLeaseSelected={handleLeaseSelectedFromModal}
      />
    </Card>
  );
}