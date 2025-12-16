'use client';

import { useState } from 'react';
import { ManageDhcpCard } from '@/components/admin/ManageDhcpCard';
import type { OpnsenseAliasDetailFromExport } from '@/types/opnsense';

export default function ManageDhcpPage() {
  // DHCP form state for memoization (consistent with admin page)
  const [dhcpSelectedAlias, setDhcpSelectedAlias] = useState<OpnsenseAliasDetailFromExport | null>(null);
  const [dhcpIpAddress, setDhcpIpAddress] = useState('');
  const [dhcpMacAddress, setDhcpMacAddress] = useState('');
  const [dhcpHostname, setDhcpHostname] = useState('');
  const [dhcpDescription, setDhcpDescription] = useState('');
  const [dhcpSelectedSubnet, setDhcpSelectedSubnet] = useState('');

  return (
    <div className="flex flex-col space-y-4">
      <ManageDhcpCard
        vpnConnectionStatuses={new Map()}
        groupVpnMap={new Map()}
        selectedAlias={dhcpSelectedAlias}
        onSelectedAliasChange={setDhcpSelectedAlias}
        ipAddress={dhcpIpAddress}
        onIpAddressChange={setDhcpIpAddress}
        macAddress={dhcpMacAddress}
        onMacAddressChange={setDhcpMacAddress}
        hostname={dhcpHostname}
        onHostnameChange={setDhcpHostname}
        description={dhcpDescription}
        onDescriptionChange={setDhcpDescription}
        selectedSubnet={dhcpSelectedSubnet}
        onSelectedSubnetChange={setDhcpSelectedSubnet}
      />
    </div>
  );
}