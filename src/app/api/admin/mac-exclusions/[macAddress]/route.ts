import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';
import { logAuditEvent } from '@/lib/auditLog';
import {
  updateExclusionSchema,
  type UpdateExclusionResponse,
  type DeleteExclusionResponse,
  type ExclusionMode
} from '@/types/mac-exclusion';

// GET /api/admin/mac-exclusions/[macAddress] - Get specific MAC exclusion
export async function GET(
  request: Request,
  { params }: { params: Promise<{ macAddress: string }> }
) {
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
      // Normalize MAC address from URL parameter
      const { macAddress } = await params;
      // Decode URL-encoded MAC address first
      const decodedMac = decodeURIComponent(macAddress);
      // Use same normalization as working MAC tracking route
      // MAC addresses in database are stored with colons in lowercase
      const normalizedMac = decodedMac.toLowerCase();

      // Find MAC address record
      const macAddressRecord = await prisma.macAddress.findUnique({
        where: { macAddress: normalizedMac }
      });

      if (!macAddressRecord) {
        return NextResponse.json({
          success: false,
          message: 'MAC address not found'
        }, { status: 404 });
      }

      // Find exclusion for this MAC
      const exclusion = await prisma.macExclusion.findUnique({
        where: { macAddressId: macAddressRecord.id },
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

      if (!exclusion) {
        return NextResponse.json({
          success: false,
          message: 'MAC exclusion not found'
        }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        data: exclusion
      });

    } catch (error) {
      logger.error('Error fetching MAC exclusion:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to fetch MAC exclusion'
      }, { status: 500 });
    }
  });
}

// PUT /api/admin/mac-exclusions/[macAddress] - Update MAC exclusion
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ macAddress: string }> }
) {
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
      const validationResult = updateExclusionSchema.safeParse(body);

      if (!validationResult.success) {
        return NextResponse.json({
          success: false,
          message: 'Invalid request body',
          errors: validationResult.error.errors
        }, { status: 400 });
      }

      // Normalize MAC address from URL parameter
      const { macAddress } = await params;
      // Decode URL-encoded MAC address first
      const decodedMac = decodeURIComponent(macAddress);
      // Use same normalization as working MAC tracking route
      // MAC addresses in database are stored with colons in lowercase
      const normalizedMac = decodedMac.toLowerCase();
      const { enabled, reason } = validationResult.data;

      // Find MAC address record
      const macAddressRecord = await prisma.macAddress.findUnique({
        where: { macAddress: normalizedMac }
      });

      if (!macAddressRecord) {
        return NextResponse.json({
          success: false,
          message: 'MAC address not found'
        }, { status: 404 });
      }

      // Find existing exclusion
      const existingExclusion = await prisma.macExclusion.findUnique({
        where: { macAddressId: macAddressRecord.id }
      });

      if (!existingExclusion) {
        return NextResponse.json({
          success: false,
          message: 'MAC exclusion not found'
        }, { status: 404 });
      }

      // Update the exclusion
      const updatedExclusion = await prisma.macExclusion.update({
        where: { id: existingExclusion.id },
        data: {
          ...(enabled !== undefined && { enabled }),
          ...(reason !== undefined && { reason }),
          lastModifiedBy: auth.user.id,
          lastModifiedAt: new Date()
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
        action: 'MAC_EXCLUSION_UPDATED',
        method: auth.method || 'UNKNOWN',
        details: {
          exclusionId: updatedExclusion.id,
          macAddress: macAddressRecord.macAddress,
          previousState: {
            enabled: existingExclusion.enabled,
            reason: existingExclusion.reason
          },
          newState: {
            enabled: updatedExclusion.enabled,
            reason: updatedExclusion.reason
          }
        },
        reason: `MAC exclusion updated for ${macAddressRecord.macAddress}`
      });

      const payload = { ...updatedExclusion, exclusionMode: updatedExclusion.exclusionMode as ExclusionMode };
      return NextResponse.json({
        success: true,
        data: payload,
        message: 'MAC exclusion updated successfully'
      } satisfies UpdateExclusionResponse);

    } catch (error) {
      logger.error('Error updating MAC exclusion:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to update MAC exclusion'
      }, { status: 500 });
    }
  });
}

// DELETE /api/admin/mac-exclusions/[macAddress] - Delete MAC exclusion
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ macAddress: string }> }
) {
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
      // Normalize MAC address from URL parameter
      const { macAddress } = await params;
      // Decode URL-encoded MAC address first
      const decodedMac = decodeURIComponent(macAddress);
      // Use same normalization as working MAC tracking route
      // MAC addresses in database are stored with colons in lowercase
      const normalizedMac = decodedMac.toLowerCase();

      // Find MAC address record
      const macAddressRecord = await prisma.macAddress.findUnique({
        where: { macAddress: normalizedMac }
      });

      if (!macAddressRecord) {
        return NextResponse.json({
          success: false,
          message: 'MAC address not found'
        }, { status: 404 });
      }

      // Find existing exclusion
      const existingExclusion = await prisma.macExclusion.findUnique({
        where: { macAddressId: macAddressRecord.id }
      });

      if (!existingExclusion) {
        return NextResponse.json({
          success: false,
          message: 'MAC exclusion not found'
        }, { status: 404 });
      }

      // Delete the exclusion
      await prisma.macExclusion.delete({
        where: { id: existingExclusion.id }
      });

      // Log audit event
      await logAuditEvent({
        userId: auth.user.id,
        action: 'MAC_EXCLUSION_DELETED',
        method: auth.method || 'UNKNOWN',
        details: {
          exclusionId: existingExclusion.id,
          macAddress: macAddressRecord.macAddress,
          deletedExclusion: {
            enabled: existingExclusion.enabled,
            reason: existingExclusion.reason,
            excludedBy: existingExclusion.excludedBy,
            excludedAt: existingExclusion.excludedAt
          }
        },
        reason: `MAC exclusion deleted for ${macAddressRecord.macAddress}`
      });

      return NextResponse.json({
        success: true,
        message: 'MAC exclusion deleted successfully'
      } satisfies DeleteExclusionResponse);

    } catch (error) {
      logger.error('Error deleting MAC exclusion:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to delete MAC exclusion'
      }, { status: 500 });
    }
  });
}