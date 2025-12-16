'use client';

import { useEffect, useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

export function useIpDetection(mounted: boolean, disabled: boolean = false) {
  const [detectedIp, setDetectedIp] = useState<string | null>(null);
  const [detectedMac, setDetectedMac] = useState<string | null>(null);
  const [detectedVendor, setDetectedVendor] = useState<string | null>(null);
  const [detectedVendorSource, setDetectedVendorSource] = useState<'OPNsense' | 'Local DB' | null>(null);
  const [detectedHostname, setDetectedHostname] = useState<string | null>(null);
  const [hostAlias, setHostAlias] = useState<string | null>(null);
  const [hostAliasUuid, setHostAliasUuid] = useState<string | null>(null);
  const [hostAliasEnabled, setHostAliasEnabled] = useState<string | null>(null);
  const [isIpDetecting, setIsIpDetecting] = useState(true);
  const [ipDetectionError, setIpDetectionError] = useState<string | null>(null);
  const [hasDhcpReservation, setHasDhcpReservation] = useState<boolean>(false);
  const [hasIpConflict, setHasIpConflict] = useState<boolean>(false); // New state for IP conflict
  const [hasMacConflict, setHasMacConflict] = useState<boolean>(false); // New state for MAC conflict
  const [dhcpReservedMac, setDhcpReservedMac] = useState<string | null>(null); // New state for DHCP reserved MAC
  const [dhcpReservedVendor, setDhcpReservedVendor] = useState<string | null>(null); // New state for DHCP reserved Vendor

  const { toast } = useToast();

  const fetchIpData = useCallback(async (silent: boolean = false) => { // Add silent parameter
    if (!mounted) return;

    // Fetch User IP (Local)
    setIsIpDetecting(true); // Always show loading state
    setIpDetectionError(null); // Always clear error at the start of a fetch
    try {
      const response = await fetch('/api/ip');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to fetch IP: ${response.statusText}`);
      }
      const data = await response.json();
      setDetectedIp(data.ip);
      setDetectedMac(data.mac || null);
      setDetectedVendor(data.vendor || null);
      setDetectedVendorSource(data.vendorSource || null);
      setDetectedHostname(data.hostname || null);

      // Fetch host alias for the detected IP
      if (data.ip) {
        const aliasResponse = await fetch(`/api/opnsense/host-alias-management?ipAddress=${data.ip}`);
        if (aliasResponse.ok) {
          const aliasData = await aliasResponse.json();
          setHostAlias(aliasData.name && aliasData.name !== 'null' ? aliasData.name : null);
          setHostAliasUuid(aliasData.uuid || null);
          setHostAliasEnabled(aliasData.enabled || null);
        } else {
          logger.warn(`Failed to fetch host alias for IP ${data.ip}: ${aliasResponse.statusText}`);
          setHostAlias(null);
          setHostAliasUuid(null);
          setHostAliasEnabled(null);
        }
      } else {
        setHostAlias(null);
        setHostAliasUuid(null);
        setHostAliasEnabled(null);
      }

      // Fetch DHCP reservation status if both IP and MAC are detected
      if (data.ip && data.mac) {
        try {
          const dhcpResponse = await fetch(`/api/opnsense/dhcp?action=search_reservation&ip=${data.ip}&mac=${data.mac}`);
          if (dhcpResponse.ok) {
            const dhcpData = await dhcpResponse.json();
            logger.debug('DHCP Lookup Response:', dhcpData);
            // For unauthenticated users, the API now only returns 'success' to indicate a reservation exists.
            // For authenticated ADMIN/SUPER_ADMIN users, 'reservation' object is still returned.
            // We check for 'success' first, then optionally for 'reservation' details if available.
            const isReserved = dhcpData.success;
            const ipConflict = dhcpData.ipConflict || false;
            const macConflict = dhcpData.macConflict || false;

            logger.debug(`Setting DHCP reservation status: ${isReserved} for IP ${data.ip}`);
            setHasDhcpReservation(isReserved);
            setHasIpConflict(ipConflict);
            setHasMacConflict(macConflict);
            setDhcpReservedMac(dhcpData.dhcpReservedMac || null); // Set reserved MAC
            setDhcpReservedVendor(dhcpData.dhcpReservedVendor || null); // Set reserved Vendor
          } else {
            logger.warn(`Failed to fetch DHCP reservation for IP ${data.ip} and MAC ${data.mac}: ${dhcpResponse.statusText}`);
            logger.debug(`Setting DHCP reservation to false due to failed response for IP ${data.ip}`);
            setHasDhcpReservation(false);
          }
        } catch (dhcpError) {
          logger.error("Error fetching DHCP reservation:", dhcpError);
          logger.debug(`Setting DHCP reservation to false due to error for IP ${data.ip}`);
          setHasDhcpReservation(false);
          setHasIpConflict(false);
          setHasMacConflict(false);
        }
      } else {
        logger.debug('No IP or MAC detected, setting DHCP reservation to false');
        setHasDhcpReservation(false);
        setHasIpConflict(false);
        setHasMacConflict(false); // No MAC or IP, no reliable reservation check
        setDhcpReservedMac(null);
        setDhcpReservedVendor(null);
      }
      // Removed public IP state setting
    } catch (e) {
      logger.error("Error fetching IP:", e);
      const errorMessage = e instanceof Error ? e.message : "Could not detect IP address.";
      setIpDetectionError(errorMessage);
      setDetectedIp(null);
      setDetectedMac(null);
      setDetectedVendor(null);
      setDetectedVendorSource(null);
      setDetectedHostname(null);
      setHostAlias(null);
      setHostAliasUuid(null);
      setHostAliasEnabled(null);
      // Removed public IP state reset on error
      if (!silent) { // Only show toast if not silent
        toast({
          variant: "destructive",
          title: "IP Detection Error",
          description: errorMessage,
        });
      }
    } finally {
      setIsIpDetecting(false); // Always hide loading state
    }
  }, [mounted, toast]);

  const refreshHostAlias = useCallback(async (ip: string) => {
    if (!mounted || !ip) return;
    try {
      const aliasResponse = await fetch(`/api/opnsense/host-alias-management?ipAddress=${ip}`);
      if (aliasResponse.ok) {
        const aliasData = await aliasResponse.json();
        setHostAlias(aliasData.name && aliasData.name !== 'null' ? aliasData.name : null);
        setHostAliasUuid(aliasData.uuid || null);
        setHostAliasEnabled(aliasData.enabled || null);
      } else {
        logger.warn(`Failed to fetch host alias for IP ${ip}: ${aliasResponse.statusText}`);
        setHostAlias(null);
        setHostAliasUuid(null);
        setHostAliasEnabled(null);
      }
    } catch (e) {
      logger.error("Error fetching host alias:", e);
      setHostAlias(null);
      setHostAliasEnabled(null);
    }
  }, [mounted]);

  useEffect(() => {
    if (!disabled) {
      fetchIpData();
    } else {
      // When disabled, set appropriate initial states
      setIsIpDetecting(false);
      setDetectedIp(null);
      setDetectedMac(null);
      setDetectedVendor(null);
      setDetectedVendorSource(null);
      setDetectedHostname(null);
      setHostAlias(null);
      setHostAliasUuid(null);
      setHostAliasEnabled(null);
      setIpDetectionError(null);
      setHasDhcpReservation(false);
      setHasIpConflict(false);
      setHasMacConflict(false);
      setDhcpReservedMac(null);
      setDhcpReservedVendor(null);
    }
  }, [fetchIpData, disabled]);

  // Fetch public IP on the client side

  return {
    detectedIp,
    detectedMac,
    detectedVendor,
    detectedVendorSource,
    detectedHostname,
    hostAlias,
    hostAliasUuid,
    hostAliasEnabled,
    isIpDetecting,
    ipDetectionError,
    refreshIpData: fetchIpData,
    refreshHostAlias,
    hasDhcpReservation,
    hasIpConflict, // Expose new state
    hasMacConflict, // Expose new state
    dhcpReservedMac, // Expose new state
    dhcpReservedVendor, // Expose new state
  };
}