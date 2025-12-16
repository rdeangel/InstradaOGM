import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';
import { logAuditEvent } from '@/lib/auditLog';
import { getCaseInsensitiveMode } from '@/lib/prisma-utils';
import {
  createExclusionSchema,
  exclusionListQuerySchema,
  type CreateExclusionResponse,
  type ExclusionListResponse,
  type ExclusionMode
} from '@/types/mac-exclusion';

// GET /api/admin/mac-exclusions - List all MAC exclusions with pagination
export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized'
      }, { status: 401 });
    }

    // Check if MAC tracking is enabled
    const settings = await prisma.globalSettings.findFirst();
    if (!settings?.enableMacTracking) {
      return NextResponse.json({
        success: false,
        message: 'MAC Address Tracking feature is disabled'
      }, { status: 403 });
    }

    // Check if MAC exclusions are enabled
    if (!settings?.enableMacExclusions) {
      return NextResponse.json({
        success: false,
        message: 'MAC Exclusion feature is disabled'
      }, { status: 403 });
    }

    try {
      const { searchParams } = new URL(request.url);
      const queryResult = exclusionListQuerySchema.safeParse(Object.fromEntries(searchParams));

      if (!queryResult.success) {
        return NextResponse.json({
          success: false,
          message: 'Invalid query parameters',
          errors: queryResult.error.errors
        }, { status: 400 });
      }

      const { page, limit, search, enabled, sortBy, sortDirection } = queryResult.data;
      const skip = (page - 1) * limit;

      // Build where clause
      const where: Record<string, unknown> = {};

      if (enabled !== undefined) {
        where.enabled = enabled;
      }

      if (search) {
        where.OR = [
          { macAddress: { macAddress: { contains: search, ...getCaseInsensitiveMode() } } },
          { reason: { contains: search, ...getCaseInsensitiveMode() } },
          { excludedBy: { contains: search, ...getCaseInsensitiveMode() } }
        ];
      }

      // Get total count
      const totalCount = await prisma.macExclusion.count({ where });

      // Get exclusions with related MAC address info
      const exclusions = await prisma.macExclusion.findMany({
        where,
        include: {
          macAddress: {
            select: {
              id: true,
              macAddress: true,
              deviceName: true,
              vendor: true
            }
          }
        },
        orderBy: { [sortBy]: sortDirection },
        skip,
        take: limit
      });

      const totalPages = Math.ceil(totalCount / limit);

      const mapped = exclusions.map(e => ({ ...e, exclusionMode: e.exclusionMode as ExclusionMode }));
      return NextResponse.json({
        success: true,
        data: {
          exclusions: mapped,
          totalCount,
          currentPage: page,
          totalPages
        }
      } satisfies ExclusionListResponse);

    } catch (error) {
      logger.error('Error fetching MAC exclusions:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to fetch MAC exclusions'
      }, { status: 500 });
    }
  });
}

// POST /api/admin/mac-exclusions - Create new MAC exclusion
export async function POST(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized'
      }, { status: 401 });
    }

    // Check if MAC tracking is enabled
    const settings = await prisma.globalSettings.findFirst();
    if (!settings?.enableMacTracking) {
      return NextResponse.json({
        success: false,
        message: 'MAC Address Tracking feature is disabled'
      }, { status: 403 });
    }

    // Check if MAC exclusions are enabled
    if (!settings?.enableMacExclusions) {
      return NextResponse.json({
        success: false,
        message: 'MAC Exclusion feature is disabled'
      }, { status: 403 });
    }

    try {
      const body = await request.json();
      const validationResult = createExclusionSchema.safeParse(body);

      if (!validationResult.success) {
        return NextResponse.json({
          success: false,
          message: 'Invalid request body',
          errors: validationResult.error.errors
        }, { status: 400 });
      }

      const { macAddress, reason } = validationResult.data;

      // Check if MAC address exists in the system
      let macAddressRecord = await prisma.macAddress.findUnique({
        where: { macAddress }
      });

      // If MAC doesn't exist, create it
      if (!macAddressRecord) {
        macAddressRecord = await prisma.macAddress.create({
          data: {
            macAddress,
            firstSeen: new Date(),
            lastSeen: new Date(),
            isActive: false, // Not actively tracked since it's excluded
            isPrivacyMac: false
          }
        });
      }

      // Check if exclusion already exists for this MAC
      const existingExclusion = await prisma.macExclusion.findUnique({
        where: { macAddressId: macAddressRecord.id }
      });

      if (existingExclusion) {
        return NextResponse.json({
          success: false,
          message: 'Exclusion already exists for this MAC address'
        }, { status: 409 });
      }

      // Create the exclusion
      const exclusion = await prisma.macExclusion.create({
        data: {
          macAddressId: macAddressRecord.id,
          enabled: true,
          reason,
          excludedBy: auth.user.id,
          excludedAt: new Date(),
          lastModifiedBy: auth.user.id
        },
        include: {
          macAddress: {
            select: {
              id: true,
              macAddress: true,
              deviceName: true,
              vendor: true
            }
          }
        }
      });

      // Log audit event
      await logAuditEvent({
        userId: auth.user.id,
        action: 'MAC_EXCLUSION_CREATED',
        method: auth.method || 'UNKNOWN',
        details: {
          exclusionId: exclusion.id,
          macAddress: macAddressRecord.macAddress,
          reason,
          enabled: exclusion.enabled
        },
        reason: `MAC exclusion created for ${macAddressRecord.macAddress}`
      });

      const payload = { ...exclusion, exclusionMode: exclusion.exclusionMode as ExclusionMode };
      return NextResponse.json({
        success: true,
        data: payload,
        message: 'MAC exclusion created successfully'
      } satisfies CreateExclusionResponse);

    } catch (error) {
      logger.error('Error creating MAC exclusion:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to create MAC exclusion'
      }, { status: 500 });
    }
  });
}