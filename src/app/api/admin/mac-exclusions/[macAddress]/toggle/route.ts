import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';
import { logAuditEvent } from '@/lib/auditLog';
import {
  toggleExclusionSchema,
  type ToggleExclusionResponse,
  type ExclusionMode
} from '@/types/mac-exclusion';
import { macTrackingService } from '@/lib/mac-tracking-service';

// POST /api/admin/mac-exclusions/[macAddress]/toggle - Toggle exclusion status for MAC
export async function POST(
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
      logger.debug('=== MAC EXCLUSION TOGGLE DEBUG START ===');

      const body = await request.json();
      logger.debug('Request body received:', { body });

      const validationResult = toggleExclusionSchema.safeParse(body);
      logger.debug('Schema validation result:', {
        success: validationResult.success,
        data: validationResult.success ? validationResult.data : null,
        errors: validationResult.success ? null : validationResult.error.errors
      });

      if (!validationResult.success) {
        return NextResponse.json({
          success: false,
          message: 'Invalid request body',
          errors: validationResult.error.errors
        }, { status: 400 });
      }

      // Normalize MAC address from URL parameter
      const { macAddress } = await params;
      logger.debug('Raw MAC address from URL:', { macAddress });

      // Decode URL-encoded MAC address first
      const decodedMac = decodeURIComponent(macAddress);
      logger.debug('Decoded MAC address:', { decodedMac });

      // Use same normalization as working MAC tracking route
      // MAC addresses in database are stored with colons in lowercase
      const normalizedMac = decodedMac.toLowerCase();
      const { enabled, reason, exclusionMode } = validationResult.data;

      logger.debug('Processed data:', {
        normalizedMac,
        enabled,
        reason,
        userId: auth.user?.id
      });

      // Find MAC address record
      logger.debug('Looking up MAC address record...');
      const macAddressRecord = await prisma.macAddress.findUnique({
        where: { macAddress: normalizedMac }
      });

      logger.debug('MAC address lookup result:', {
        found: !!macAddressRecord,
        record: macAddressRecord ? {
          id: macAddressRecord.id,
          macAddress: macAddressRecord.macAddress,
          deviceName: macAddressRecord.deviceName,
          vendor: macAddressRecord.vendor
        } : null
      });

      if (!macAddressRecord) {
        return NextResponse.json({
          success: false,
          message: 'MAC address not found'
        }, { status: 404 });
      }

      // Find existing exclusion or create new one
      logger.debug('Looking up existing exclusion...');
      let exclusion = await prisma.macExclusion.findUnique({
        where: { macAddressId: macAddressRecord.id }
      });

      logger.debug('Exclusion lookup result:', {
        found: !!exclusion,
        exclusion: exclusion ? {
          id: exclusion.id,
          enabled: exclusion.enabled,
          reason: exclusion.reason,
          excludedAt: exclusion.excludedAt,
          lastModifiedAt: exclusion.lastModifiedAt
        } : null
      });

      if (!exclusion) {
        logger.debug('Creating new exclusion...');

        const createData = {
          macAddressId: macAddressRecord.id,
          enabled,
          exclusionMode: exclusionMode ?? 'FULL',
          reason,
          excludedBy: auth.user.id,
          excludedAt: new Date(),
          lastModifiedBy: auth.user.id
        };

        logger.debug('Create data:', createData);

        // Create new exclusion if it doesn't exist
        exclusion = await prisma.macExclusion.create({
          data: createData,
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

        logger.debug('New exclusion created:', {
          id: exclusion.id,
          enabled: exclusion.enabled,
          reason: exclusion.reason,
          excludedAt: exclusion.excludedAt,
          lastModifiedAt: exclusion.lastModifiedAt
        });

        // If enabling exclusion, clean up all history for this MAC address
        let historyCleanupCount = 0;
        let multiIpWarning: { hasMultipleIps: boolean; ipCount: number; riskLevel: string; ips: Array<{ ipAddress: string; firstSeen: Date; lastSeen: Date; networkInterface?: string | null; isActive: boolean }> } | undefined = undefined;
        if (enabled) {
          try {
            const modeForCleanup = (exclusionMode ?? 'FULL');
            logger.debug(`Cleaning up history for newly excluded MAC: ${normalizedMac} (mode=${modeForCleanup})`);
            if (modeForCleanup === 'PARTIAL') {
              historyCleanupCount = await macTrackingService.cleanupMacHistoryOnly(normalizedMac, auth.user.id);

              // For PARTIAL exclusion, check for multiple IPs (potential MAC spoofing/roaming)
              try {
                const multiIpDetection = await macTrackingService.detectMultipleIpAssociations(normalizedMac);
                if (multiIpDetection.hasMultipleIps) {
                  logger.warn(`MAC ${normalizedMac} has ${multiIpDetection.ipCount} active IPs - potential MAC spoofing or device roaming detected (Risk: ${multiIpDetection.riskLevel})`);
                  multiIpWarning = {
                    hasMultipleIps: true,
                    ipCount: multiIpDetection.ipCount,
                    riskLevel: multiIpDetection.riskLevel,
                    ips: multiIpDetection.ips
                  };
                }
              } catch (multiIpError) {
                logger.error(`Failed to check multiple IPs for ${normalizedMac}:`, multiIpError);
                // Continue even if multi-IP check fails
              }
            } else {
              historyCleanupCount = await macTrackingService.cleanupMacHistory(normalizedMac, auth.user.id);
            }
            logger.debug(`History cleanup completed for ${normalizedMac}: ${historyCleanupCount} records removed`);
          } catch (cleanupError) {
            logger.error(`Failed to clean up history for ${normalizedMac}:`, cleanupError);
            // Continue with exclusion creation even if cleanup fails
          }
        }

        // Log audit event for creation
        await logAuditEvent({
          userId: auth.user.id,
          action: 'MAC_EXCLUSION_CREATED',
          method: auth.method || 'UNKNOWN',
          details: {
            exclusionId: exclusion.id,
            macAddress: macAddressRecord.macAddress,
            enabled,
            reason,
            action: 'toggle_create',
            historyCleanupCount: enabled ? historyCleanupCount : undefined,
            ...(multiIpWarning && { multiIpWarning })
          },
          reason: `MAC exclusion created and toggled ${enabled ? 'on' : 'off'} for ${macAddressRecord.macAddress}${enabled ? ` (history cleaned up: ${historyCleanupCount} records)` : ''}${multiIpWarning ? ` (WARNING: ${multiIpWarning.ipCount} IPs detected - Risk: ${multiIpWarning.riskLevel})` : ''}`
        });

        logger.debug('=== MAC EXCLUSION TOGGLE DEBUG END (CREATE) ===');
        const payload = { ...exclusion, exclusionMode: exclusion.exclusionMode as ExclusionMode };
        return NextResponse.json({
          success: true,
          data: payload,
          message: `MAC exclusion ${enabled ? 'enabled' : 'disabled'} successfully${enabled ? ` (history cleaned up: ${historyCleanupCount} records)` : ''}`
        } satisfies ToggleExclusionResponse);
      }

      // Update existing exclusion
      const previousEnabled = exclusion.enabled;

      logger.debug('Updating existing exclusion...', {
        exclusionId: exclusion.id,
        previousEnabled,
        newEnabled: enabled,
        reason: reason !== undefined ? reason : 'unchanged'
      });

      const updateData = {
        enabled,
        ...(reason !== undefined && { reason }),
        ...(exclusionMode !== undefined && { exclusionMode }),
        lastModifiedBy: auth.user.id,
        lastModifiedAt: new Date()
      };

      logger.debug('Update data:', updateData);

      const updatedExclusion = await prisma.macExclusion.update({
        where: { id: exclusion.id },
        data: updateData,
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

      logger.debug('Exclusion updated:', {
        id: updatedExclusion.id,
        enabled: updatedExclusion.enabled,
        reason: updatedExclusion.reason,
        excludedAt: updatedExclusion.excludedAt,
        lastModifiedAt: updatedExclusion.lastModifiedAt
      });

      // Immediately invalidate the MAC exclusion cache to prevent race conditions
      // This ensures the next ARP scan will see the updated exclusion status
      macTrackingService.invalidateExclusionCache();

      // Verify the update immediately
      logger.debug('Verifying update persistence...');
      const verifyExclusion = await prisma.macExclusion.findUnique({
        where: { id: exclusion.id },
        select: {
          id: true,
          enabled: true,
          reason: true,
          lastModifiedAt: true
        }
      });

      logger.debug('Verification result:', {
        found: !!verifyExclusion,
        enabled: verifyExclusion?.enabled,
        reason: verifyExclusion?.reason,
        lastModifiedAt: verifyExclusion?.lastModifiedAt,
        updatePersisted: verifyExclusion?.enabled === enabled
      });

      // If enabling exclusion (was previously disabled), clean up all history for this MAC address
      let historyCleanupCount = 0;
      let multiIpWarning: { hasMultipleIps: boolean; ipCount: number; riskLevel: string; ips: Array<{ ipAddress: string; firstSeen: Date; lastSeen: Date; networkInterface?: string | null; isActive: boolean }> } | undefined = undefined;
      if (enabled && !previousEnabled) {
        try {
          const effectiveMode = (exclusionMode ?? exclusion.exclusionMode ?? 'FULL');
          logger.debug(`Cleaning up history for newly enabled exclusion: ${normalizedMac} (mode=${effectiveMode})`);
          if (effectiveMode === 'PARTIAL') {
            historyCleanupCount = await macTrackingService.cleanupMacHistoryOnly(normalizedMac, auth.user.id);

            // For PARTIAL exclusion, check for multiple IPs (potential MAC spoofing/roaming)
            try {
              const multiIpDetection = await macTrackingService.detectMultipleIpAssociations(normalizedMac);
              if (multiIpDetection.hasMultipleIps) {
                logger.warn(`MAC ${normalizedMac} has ${multiIpDetection.ipCount} active IPs - potential MAC spoofing or device roaming detected (Risk: ${multiIpDetection.riskLevel})`);
                multiIpWarning = {
                  hasMultipleIps: true,
                  ipCount: multiIpDetection.ipCount,
                  riskLevel: multiIpDetection.riskLevel,
                  ips: multiIpDetection.ips
                };
              }
            } catch (multiIpError) {
              logger.error(`Failed to check multiple IPs for ${normalizedMac}:`, multiIpError);
              // Continue even if multi-IP check fails
            }
          } else {
            historyCleanupCount = await macTrackingService.cleanupMacHistory(normalizedMac, auth.user.id);
          }
          logger.debug(`History cleanup completed for ${normalizedMac}: ${historyCleanupCount} records removed`);
        } catch (cleanupError) {
          logger.error(`Failed to clean up history for ${normalizedMac}:`, cleanupError);
          // Continue with exclusion update even if cleanup fails
        }
      }
      // If exclusion remains enabled and mode changed, perform appropriate cleanup
      if (enabled && previousEnabled) {
        try {
          const previousMode = (exclusion.exclusionMode ?? 'FULL');
          const currentMode = (exclusionMode ?? updatedExclusion.exclusionMode ?? 'FULL');
          if (previousMode !== currentMode) {
            logger.debug(`Exclusion mode changed for ${normalizedMac}: ${previousMode} -> ${currentMode}. Performing cleanup.`);
            if (currentMode === 'PARTIAL') {
              const cleaned = await macTrackingService.cleanupMacHistoryOnly(normalizedMac, auth.user.id);
              historyCleanupCount += cleaned;
            } else if (currentMode === 'FULL') {
              const cleaned = await macTrackingService.cleanupMacHistory(normalizedMac, auth.user.id);
              historyCleanupCount += cleaned;
            }
            logger.debug(`Mode-change cleanup completed for ${normalizedMac}: ${historyCleanupCount} records removed`);
          }
        } catch (cleanupError) {
          logger.error(`Failed to clean up history for ${normalizedMac} after mode change:`, cleanupError);
          // Continue even if cleanup fails
        }
      }


      // Log audit event for update
      await logAuditEvent({
        userId: auth.user.id,
        action: 'MAC_EXCLUSION_TOGGLED',
        method: auth.method || 'UNKNOWN',
        details: {
          exclusionId: updatedExclusion.id,
          macAddress: macAddressRecord.macAddress,
          previousEnabled,
          newEnabled: enabled,
          reason,
          action: 'toggle_update',
          historyCleanupCount: historyCleanupCount > 0 ? historyCleanupCount : undefined,
          ...(multiIpWarning && { multiIpWarning })
        },
        reason: `MAC exclusion toggled from ${previousEnabled ? 'enabled' : 'disabled'} to ${enabled ? 'enabled' : 'disabled'} for ${macAddressRecord.macAddress}${historyCleanupCount > 0 ? ` (history cleaned up: ${historyCleanupCount} records)` : ''}${multiIpWarning ? ` (WARNING: ${multiIpWarning.ipCount} IPs detected - Risk: ${multiIpWarning.riskLevel})` : ''}`
      });

      logger.debug('=== MAC EXCLUSION TOGGLE DEBUG END (UPDATE) ===');
      const payload = { ...updatedExclusion, exclusionMode: updatedExclusion.exclusionMode as ExclusionMode };
      return NextResponse.json({
        success: true,
        data: payload,
        message: `MAC exclusion ${enabled ? 'enabled' : 'disabled'} successfully${historyCleanupCount > 0 ? ` (history cleaned up: ${historyCleanupCount} records)` : ''}`
      } satisfies ToggleExclusionResponse);

    } catch (error) {
      logger.error('Error toggling MAC exclusion:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to toggle MAC exclusion'
      }, { status: 500 });
    }
  });
}