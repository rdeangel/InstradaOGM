import { NextResponse } from 'next/server';
import { authenticateRequest, trackUsageByAuthMethod } from '@/lib/auth-middleware';
import { logger } from '@/lib/logger';
import { exportAliases, getAliasTableSize } from '@/lib/opnsense-api';
import { prisma } from '@/lib/prisma';
import { filterNetworkGroups } from '@/lib/group-filter-utils';
import { GET as getUserGroupFilters } from '@/app/api/user/group-filters/route';
import type { NetworkGroup, NetworkObject, OpnsenseAliasDetailFromExport } from '@/types/opnsense';
import type { CustomEmoji, CustomFlag, ValidLocalNetwork } from '@/types/settings';
import type { User } from '@/types/opnsense';
import type { OpnsenseAliasTableSizeDetail } from '@/lib/opnsense-api';
import { toJsonArray, toJsonArrayOrUndefined } from '@/lib/utils';
import { isIpAllowedForSelfService } from '@/lib/network-utils';

export async function GET(request: Request) {
  let auth: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  try {
    auth = await authenticateRequest(request);

    // For unauthenticated users, validate IP is in allowed networks for self-service
    if (!auth.user) {
      const { getClientIp } = await import('@/lib/network-utils');
      const clientIp = getClientIp(request) || '0.0.0.0';

      // Get global settings to check allowed networks
      const globalSettings = await prisma.globalSettings.findFirst({
        orderBy: { id: 'asc' },
      });
      const allowedNetworks = toJsonArrayOrUndefined<ValidLocalNetwork>(globalSettings?.allowedNetworks) || [];

      // Check if the client IP is allowed for self-service operations
      const ipValidation = isIpAllowedForSelfService(
        clientIp,
        clientIp || '', // For network groups, we check if the client's own IP is allowed
        allowedNetworks,
        false // unauthenticated
      );

      if (!ipValidation.isAllowed) {
        logger.info(`Self-service access denied for network groups from client IP ${clientIp}: ${ipValidation.reason}`);
        return NextResponse.json({ error: `Forbidden: ${ipValidation.reason}` }, { status: 403 });
      }
    }

    const { searchParams } = new URL(request.url);
    const debugQueryParam = searchParams.get('debug');
    const includeDisabledParam = searchParams.get('includeDisabled');

    const [exportedAliasesResponse, aliasSizesResponse, opnsenseGroupDisplays, globallyDisabledGroups, globalSettings] = await Promise.all([
      exportAliases(),
      getAliasTableSize(),
      prisma.opnsenseGroupDisplay.findMany({ orderBy: { friendlyName: 'asc' } }),
      prisma.globallyDisabledGroup.findMany({ orderBy: { opnsenseUuid: 'asc' } }),
      prisma.globalSettings.findFirst({ orderBy: { id: 'asc' } }), // Fetch global settings
    ]);

    if (debugQueryParam === 'true' && auth.user?.role === 'SUPER_ADMIN') {
      logger.debug("Debug query parameter enabled for SUPER_ADMIN. Returning raw OPNsense alias data.");
      return NextResponse.json(exportedAliasesResponse);
    }

    const aliases = exportedAliasesResponse.aliases.alias;
    const aliasSizes = aliasSizesResponse.details;

    let networkGroups: NetworkGroup[] = Object.keys(aliases)
      .map((uuid): NetworkGroup | null => {
        // uuid is from Object.keys of aliases
        // eslint-disable-next-line security/detect-object-injection
        const aliasDetail: OpnsenseAliasDetailFromExport = aliases[uuid];

        if (aliasDetail.type !== 'networkgroup') {
          return null;
        }


        const sizeDetail: OpnsenseAliasTableSizeDetail | undefined = aliasSizes[aliasDetail.name];

        const members: NetworkObject[] = aliasDetail.content
          ? aliasDetail.content.split('\n')
            .map(item => item.trim())
            .filter(item => item !== '')
            .map(item => ({
              id: item,
              ipAddress: item,
              description: '',
            }))
          : [];

        const displayInfo = opnsenseGroupDisplays.find(d => d.opnsenseUuid.toLowerCase() === uuid.toLowerCase());

        return {
          id: uuid,
          uuid: uuid,
          name: aliasDetail.name,
          description: aliasDetail.description,
          enabled: aliasDetail.enabled === '1',
          members: members,
          itemCount: sizeDetail?.count ?? 0,
          lastUpdated: sizeDetail?.updated ?? null,
          rawContent: aliasDetail.content,
          type: aliasDetail.type,
          proto: aliasDetail.proto,
          interface: aliasDetail.interface,
          counters: aliasDetail.counters,
          updatefreq: aliasDetail.updatefreq,
          categories: aliasDetail.categories,
          friendlyName: displayInfo?.friendlyName || aliasDetail.name, // Use friendly name if available
          iconIdentifier: displayInfo?.iconIdentifier || null, // Use icon identifier if available
          groupType: (displayInfo?.groupType === 'MultiSelect' || displayInfo?.groupType === 'SingleSelect') ? displayInfo.groupType : 'SingleSelect', // Use group type as union, default to SingleSelect
        };
      })
      .filter((group): group is NetworkGroup => group !== null);

    // Apply global and user-specific filters
    let userSpecificFilters = null;
    if (auth.user?.id) {
      // Directly call the GET handler for user-specific group filters
      const userFiltersResponse = await getUserGroupFilters(request);
      if (userFiltersResponse.ok) {
        userSpecificFilters = await userFiltersResponse.json();
      } else {
        logger.warn(`Failed to fetch user-specific group filters for user ${auth.user.id}. Status: ${userFiltersResponse.status}`);
      }
    }

    const globalFilters = (await prisma.groupFilterSetting.findMany({ orderBy: { createdAt: 'asc' } })).map(filter => ({
      ...filter,
      type: filter.type as "include" | "exclude",
    }));

    networkGroups = await filterNetworkGroups(
      networkGroups,
      globalFilters,
      includeDisabledParam === 'true' ? [] : globallyDisabledGroups, // Pass empty array if includeDisabled is true
      auth.user as User, // Cast to User type instead of any
      userSpecificFilters
    );

    // Ensure networkGroups is always an array
    if (!Array.isArray(networkGroups)) {
      logger.error('filterNetworkGroups did not return an array:', networkGroups);
      networkGroups = [];
    }

    // Filter sensitive information for unauthenticated users and USER roles
    const customEmojis: CustomEmoji[] = toJsonArray<CustomEmoji>(globalSettings?.customEmojis);
    const customFlags: CustomFlag[] = toJsonArray<CustomFlag>(globalSettings?.customFlags);

    // Combine system-defined and custom emoji/flag values
    // Note: SelfServiceCard.tsx already imports generalEmojis and flags,
    // so we only need to provide the custom ones here.
    // However, to simplify the frontend logic, we can send the combined list.
    const allEmojiValues = [...customEmojis.map(e => e.value)];
    const allFlagValues = [...customFlags.map(f => f.value)];

    logger.info(`[network-groups] Auth: ${auth.user ? 'yes' : 'no'}, Role: ${auth.user?.role || 'none'}`);

    // Check if self-service is globally disabled for unauthenticated users
    if (!auth.user && globalSettings?.removeSelfServicePage) {
      logger.info('[network-groups] Unauthenticated access blocked - self-service functionality is disabled');
      return NextResponse.json({
        error: 'Forbidden: Self-service functionality is disabled'
      }, { status: 403 });
    }

    // Return minimal data for unauthenticated users or USER role (original behavior)
    // This matches the original filtered-aliases endpoint behavior
    if (!auth.user || auth.user.role === 'USER') {
      logger.info('[network-groups] Returning minimal network groups for unauthenticated/USER access');
      const publicNetworkGroups = networkGroups.map(group => ({
        id: group.id,
        uuid: group.uuid, // Include uuid for proper group matching in optimistic updates
        name: group.name,
        description: group.description,
        enabled: group.enabled,
        friendlyName: group.friendlyName,
        iconIdentifier: group.iconIdentifier,
        groupType: group.groupType, // Include groupType for UI functionality
      }));

      // Track usage for authenticated requests (USER role)
      if (auth && auth.user) {
        await trackUsageByAuthMethod(request, auth, 200);
      }

      return NextResponse.json({
        networkGroups: publicNetworkGroups,
        allEmojiValues,
        allFlagValues,
        debugRole: auth.user?.role || 'unauthenticated',
      });
    }

    logger.info('[network-groups] Returning full/detailed network groups for admin');

    // Track usage for authenticated requests
    if (auth) {
      await trackUsageByAuthMethod(request, auth, 200);
    }

    return NextResponse.json({
      networkGroups,
      allEmojiValues,
      allFlagValues,
      debugRole: auth.user?.role || 'unauthenticated',
    });
  } catch (error) {
    logger.error('Failed to fetch network groups:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';

    // Track usage for authenticated requests (even failed ones)
    if (auth) {
      await trackUsageByAuthMethod(request, auth, 500);
    }

    return NextResponse.json({ message: 'Failed to fetch network groups', error: errorMessage }, { status: 500 });
  }
}
