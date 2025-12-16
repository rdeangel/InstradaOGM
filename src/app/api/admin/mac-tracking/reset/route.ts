import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/mac-tracking/reset
 *
 * Clear the entire MAC address database, removing all MAC addresses, IP associations, 
 * IP history entries, IP activation periods, and exclusions.
 * This is a destructive operation that permanently deletes all tracking data.
 *
 * @authentication Required (session or API key)
 * @role SUPER_ADMIN only
 *
 * @returns {Object} Success response with deletion counts
 * @throws {401} Unauthorized - User is not SUPER_ADMIN
 * @throws {403} Forbidden - MAC tracking is disabled
 * @throws {500} Server error - Database operation failed
 *
 * @authentication_methods
 * - Session: Browser session with valid NextAuth.js session token
 * - API Key (Bearer): Authorization: Bearer <api-key>
 * - API Key (Header): X-API-Key: <api-key>
 *
 * @example
 * // Session Authentication
 * POST /api/admin/mac-tracking/reset
 * Cookie: next-auth.session-token=<session-token>
 *
 * // API Key Authentication (Bearer)
 * POST /api/admin/mac-tracking/reset
 * Authorization: Bearer <api-key>
 *
 * // API Key Authentication (Header)
 * POST /api/admin/mac-tracking/reset
 * X-API-Key: <api-key>
 *
 * // Response (200 OK)
 * {
 *   "success": true,
 *   "message": "Successfully cleared MAC address database. Deleted 150 MAC addresses, 450 IP associations, 1200 history entries, 3500 activation periods, and 25 exclusions.",
 *   "data": {
 *     "deletedMacs": 150,
 *     "deletedAssociations": 450,
 *     "deletedHistoryEntries": 1200,
 *     "deletedActivationPeriods": 3500,
 *     "deletedExclusions": 25,
 *     "totalDeleted": 5325
 *   }
 * }
 *
 * @security
 * - SUPER_ADMIN role required (strict enforcement)
 * - MAC tracking must be enabled in Global Settings
 * - All operations are logged for audit trail
 * - No rollback capability - data is permanently deleted
 * - API key usage is tracked and rate-limited
 * - Unauthorized attempts are logged with user ID and role
 */
export async function POST(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    // ============================================================================
    // ROLE-BASED ACCESS CONTROL: SUPER_ADMIN ONLY
    // ============================================================================
    // This endpoint is restricted to SUPER_ADMIN users only.
    // - USER role: ❌ Forbidden
    // - ADMIN role: ❌ Forbidden
    // - SUPER_ADMIN role: ✅ Allowed
    if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
      logger.warn(
        `Unauthorized MAC database reset attempt by user: ${auth.user?.id || 'unknown'} ` +
        `with role: ${auth.user?.role || 'none'}`
      );
      return NextResponse.json({
        success: false,
        message: 'Unauthorized'
      }, { status: 401 });
    }

    // ============================================================================
    // FEATURE TOGGLE CHECK
    // ============================================================================
    // Verify that MAC tracking is enabled before allowing database reset
    const settings = await prisma.globalSettings.findFirst();
    if (!settings?.enableMacTracking) {
      logger.warn(
        `MAC database reset attempted while feature is disabled by user: ${auth.user.id}`
      );
      return NextResponse.json({
        success: false,
        message: 'MAC Address Tracking feature is disabled'
      }, { status: 403 });
    }

    try {
      // ========================================================================
      // DATABASE RESET OPERATION
      // ========================================================================
      // Delete in correct order to respect foreign key constraints:
      // 1. MAC exclusions (references MAC addresses)
      // 2. IP activation periods (references MAC addresses)
      // 3. IP history entries (references MAC addresses)
      // 4. IP associations (references MAC addresses)
      // 5. MAC addresses (root entity)

      logger.info(`Starting MAC address database reset by user: ${auth.user.id}`);

      // Step 1: Delete all MAC exclusions first (due to foreign key constraints)
      const deletedExclusions = await prisma.macExclusion.deleteMany({});
      logger.debug(`Deleted ${deletedExclusions.count} MAC exclusions`);

      // Step 2: Delete all IP activation periods
      const deletedActivationPeriods = await prisma.macIpActivationPeriod.deleteMany({});
      logger.debug(`Deleted ${deletedActivationPeriods.count} IP activation periods`);

      // Step 3: Delete all IP history entries
      const deletedHistoryEntries = await prisma.macIpHistoryEntry.deleteMany({});
      logger.debug(`Deleted ${deletedHistoryEntries.count} IP history entries`);

      // Step 4: Delete all IP associations
      const deletedAssociations = await prisma.macIpAssociation.deleteMany({});
      logger.debug(`Deleted ${deletedAssociations.count} IP associations`);

      // Step 5: Delete all MAC addresses
      const deletedMacs = await prisma.macAddress.deleteMany({});
      logger.debug(`Deleted ${deletedMacs.count} MAC addresses`);

      const totalDeleted =
        deletedMacs.count +
        deletedAssociations.count +
        deletedHistoryEntries.count +
        deletedActivationPeriods.count +
        deletedExclusions.count;

      // ========================================================================
      // AUDIT LOGGING
      // ========================================================================
      logger.info(
        `MAC address database reset completed by user: ${auth.user.id} - ` +
        `deleted ${deletedMacs.count} MAC addresses, ` +
        `${deletedAssociations.count} IP associations, ` +
        `${deletedHistoryEntries.count} history entries, ` +
        `${deletedActivationPeriods.count} activation periods, and ` +
        `${deletedExclusions.count} exclusions`
      );

      return NextResponse.json({
        success: true,
        message: `Successfully cleared MAC address database. Deleted ${deletedMacs.count} MAC addresses, ${deletedAssociations.count} IP associations, ${deletedHistoryEntries.count} history entries, ${deletedActivationPeriods.count} activation periods, and ${deletedExclusions.count} exclusions.`,
        data: {
          deletedMacs: deletedMacs.count,
          deletedAssociations: deletedAssociations.count,
          deletedHistoryEntries: deletedHistoryEntries.count,
          deletedActivationPeriods: deletedActivationPeriods.count,
          deletedExclusions: deletedExclusions.count,
          totalDeleted
        }
      });

    } catch (error) {
      logger.error(
        `Error resetting MAC address database for user ${auth.user.id}:`,
        error
      );
      return NextResponse.json({
        success: false,
        message: 'Failed to reset MAC address database'
      }, { status: 500 });
    }
  });
}

