import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { logAuditEvent } from '@/lib/auditLog';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';


export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

  try {
    const settings = await prisma.globalSettings.findFirst();
    return NextResponse.json(settings || {});
    } catch (error) {
      logger.error('Error fetching global settings:', error);
      return NextResponse.json({ message: 'Failed to fetch settings' }, { status: 500 });
    }
  });
}

export async function PUT(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

  try {
    const body = await request.json();
    const { enableRegistration, enableRenamingSelfServicePage, enableRenamingDeviceManagementPage, allowedNetworks, customLucideIcons, customEmojis, customFlags, enableGroupTypes, singleSelectName, multiSelectName } = body;

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
    const normalizedCustomLucideIcons = customLucideIcons !== undefined ? serializeCustomLucideIcons(customLucideIcons) : undefined;
    const normalizedCustomEmojis = customEmojis !== undefined && Array.isArray(customEmojis) ? customEmojis : undefined;
    const normalizedCustomFlags = customFlags !== undefined && Array.isArray(customFlags) ? customFlags : undefined;

    const settings = await prisma.globalSettings.upsert({
      where: { id: 'global' },
      update: {
        enableRegistration: enableRegistration !== undefined ? enableRegistration : undefined,
        enableRenamingSelfServicePage: enableRenamingSelfServicePage !== undefined ? enableRenamingSelfServicePage : undefined,
        enableRenamingDeviceManagementPage: enableRenamingDeviceManagementPage !== undefined ? enableRenamingDeviceManagementPage : undefined,
        allowedNetworks: allowedNetworks !== undefined ? allowedNetworks : undefined,
        customLucideIcons: normalizedCustomLucideIcons,
        customEmojis: normalizedCustomEmojis,
        customFlags: normalizedCustomFlags,
        enableGroupTypes: enableGroupTypes !== undefined ? enableGroupTypes : undefined,
        singleSelectName: singleSelectName !== undefined ? singleSelectName : undefined,
        multiSelectName: multiSelectName !== undefined ? multiSelectName : undefined,
        // Always update lastModified timestamp when any setting changes for cache invalidation
        lastModified: new Date(),
      },
      create: {
        id: 'global',
        enableRegistration: enableRegistration || false,
        enableRenamingSelfServicePage: enableRenamingSelfServicePage || false,
        enableRenamingDeviceManagementPage: enableRenamingDeviceManagementPage || false,
        allowedNetworks: allowedNetworks || [],
        customLucideIcons: customLucideIcons || [],
        customEmojis: customEmojis || [],
        customFlags: customFlags || [],
        enableGroupTypes: enableGroupTypes || false,
        singleSelectName: singleSelectName || 'Single Select',
        multiSelectName: multiSelectName || 'Multi Select',
      },
    });

    await logAuditEvent({
      userId: auth.user.id,
      action: 'SETTINGS_UPDATED',
      details: { settings: body },
    });

    return NextResponse.json(settings);
  } catch (error) {
    logger.error('Error updating global settings:', error);
    await logAuditEvent({
      userId: auth.user.id,
      action: 'SETTINGS_UPDATE_FAILURE',
      reason: 'Database error',
    });
    return NextResponse.json({ message: 'Failed to update settings' }, { status: 500 });
  }
  });
}