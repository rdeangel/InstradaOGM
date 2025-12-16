import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';
import { macTrackingService } from '@/lib/mac-tracking-service';

/**
 * GET /api/admin/mac-exclusions/[macAddress]/multi-ip-detection
 * 
 * Detects if a MAC address has been associated with multiple IP addresses.
 * This is useful for identifying potential MAC spoofing, device roaming, or firewall MACs with multiple subinterfaces.
 * 
 * Authorization: ADMIN or SUPER_ADMIN
 * 
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     hasMultipleIps: boolean,
 *     ipCount: number,
 *     ips: Array<{
 *       ipAddress: string,
 *       firstSeen: Date,
 *       lastSeen: Date,
 *       networkInterface?: string,
 *       isActive: boolean
 *     }>,
 *     riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
 *   }
 * }
 */
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

    try {
      const { macAddress } = await params;

      // Decode URL-encoded MAC address
      const decodedMac = decodeURIComponent(macAddress);

      // Normalize MAC address (lowercase)
      const normalizedMac = decodedMac.toLowerCase();

      logger.debug(`Multi-IP detection request for MAC: ${normalizedMac}`);

      // Detect multiple IP associations
      const detection = await macTrackingService.detectMultipleIpAssociations(normalizedMac);

      logger.debug(`Multi-IP detection completed for ${normalizedMac}:`, {
        hasMultipleIps: detection.hasMultipleIps,
        ipCount: detection.ipCount,
        riskLevel: detection.riskLevel
      });

      return NextResponse.json({
        success: true,
        data: detection
      });

    } catch (error) {
      logger.error('Error detecting multiple IPs:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to detect multiple IPs for MAC address'
      }, { status: 500 });
    }
  });
}

