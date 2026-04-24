import { NextResponse } from 'next/server';
import { authenticateRequest, handleAuthResponse, trackUsageByAuthMethod } from '@/lib/auth-middleware';
import { logger } from '@/lib/logger';
import { exportAliases, get_arpTable } from '@/lib/opnsense-api';
import { Role } from '@/types/opnsense';
import { prisma } from '@/lib/prisma';
import { enrichNetworkAliasesWithGroups } from '@/lib/network-alias-filtering';
import type { NetworkAlias } from '@/types/opnsense';

interface HostAlias {
  uuid: string;
  name: string;
  content: string; // IP address
  description: string;
  enabled: string;
  hasArpEntry?: boolean; // Whether the IP has an active ARP entry
}

export async function GET(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const auth = await authenticateRequest(request);

  // Check for rate limiting errors
  if (auth.user) {
    const authError = handleAuthResponse(auth);
    if (authError) return authError;
  }

  try {
    if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const routeParams = await Promise.resolve(params);
    const networkGroupUuid = routeParams.uuid;

    if (!networkGroupUuid) {
      return NextResponse.json({ error: 'Network group UUID is required' }, { status: 400 });
    }

    // Fetch all aliases from OPNsense
    const allAliasesResponse = await exportAliases();
    if (!allAliasesResponse?.aliases?.alias) {
      throw new Error('Could not retrieve aliases from OPNsense');
    }

    // Find the network group by UUID
    // UUID is validated from route params
    // eslint-disable-next-line security/detect-object-injection
    const networkGroup = allAliasesResponse.aliases.alias[networkGroupUuid];
    if (!networkGroup || networkGroup.type !== 'networkgroup') {
      return NextResponse.json({ error: 'Network group not found' }, { status: 404 });
    }

    // Parse the network group's content to find member names
    const groupContent = networkGroup.content || '';
    const memberNames = groupContent.split('\n').map(name => name.trim()).filter(Boolean);

    // Get ARP table for active device detection
    const arpTable = await get_arpTable();
    const arpIps = new Set(arpTable.map(entry => entry.ip));

    // Find all host aliases that are referenced in this network group
    const hostAliasMembers: HostAlias[] = [];
    const rawNetworkAliasMembers: NetworkAlias[] = [];

    // Check if network alias management feature is enabled
    const globalSettings = await prisma.globalSettings.findFirst({ orderBy: { id: 'asc' } });
    const networkAliasFeatureEnabled = globalSettings?.manageNetworkAliasesEnabled ?? false;

    for (const [uuid, aliasDetail] of Object.entries(allAliasesResponse.aliases.alias)) {
      if (!memberNames.includes(aliasDetail.name)) continue;

      if (aliasDetail.type === 'host') {
        const ips = aliasDetail.content.split(/[,\s]+/).filter(ip => ip.trim());
        const hasArpEntry = ips.some(ip => arpIps.has(ip.trim()));
        hostAliasMembers.push({
          uuid,
          name: aliasDetail.name,
          content: aliasDetail.content,
          description: aliasDetail.description || '',
          enabled: aliasDetail.enabled || '1',
          hasArpEntry,
        });
      } else if (aliasDetail.type === 'network' && networkAliasFeatureEnabled) {
        rawNetworkAliasMembers.push({
          uuid,
          name: aliasDetail.name,
          type: 'network',
          content: aliasDetail.content,
          description: aliasDetail.description || '',
          enabled: (aliasDetail.enabled as '0' | '1') || '1',
        });
      }
    }

    // Apply managed-alias filter for ADMIN callers when feature is enabled; SUPER_ADMIN sees all
    const networkAliasMembers = networkAliasFeatureEnabled
      ? rawNetworkAliasMembers
      : [];

    // Track usage for authenticated requests
    await trackUsageByAuthMethod(request, auth, 200);

    return NextResponse.json({ hostAliasMembers, networkAliasMembers });
  } catch (error) {
    logger.error('Error fetching members for network group:', error);

    // Track usage for authenticated requests (even failed ones)
    if (auth && auth.user) {
      await trackUsageByAuthMethod(request, auth, 500);
    }

    return NextResponse.json({ error: 'Failed to fetch host aliases for network group' }, { status: 500 });
  }
}
