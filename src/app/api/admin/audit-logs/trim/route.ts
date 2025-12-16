import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';
import { logAuditEvent } from '@/lib/auditLog';

interface TrimRequest {
    retentionPeriod: number;
    retentionUnit: 'days' | 'weeks' | 'months' | 'years';
    confirmation: string;
    dataTypes?: ('logs' | 'analytics')[];
}

interface TrimResponse {
    success: boolean;
    cutoffDate: Date;
    auditLogs?: {
        deletedCount: number;
        remainingCount: number;
        oldestRemainingLog: string | null;
    };
    analytics?: {
        apiKeyUsageEvents: {
            deletedCount: number;
            remainingCount: number;
        };
        apiKeyUsageStats: {
            deletedCount: number;
            remainingCount: number;
        };
        sessionUsageEvents: {
            deletedCount: number;
            remainingCount: number;
        };
        sessionUsageStats: {
            deletedCount: number;
            remainingCount: number;
        };
    };
}

function calculateCutoffDate(retentionPeriod: number, retentionUnit: string): Date {
    const now = new Date();

    // If retention period is 0, delete all data by setting cutoff to future
    if (retentionPeriod === 0) {
        const futureDate = new Date(now);
        futureDate.setFullYear(futureDate.getFullYear() + 1); // Set to 1 year in the future
        return futureDate;
    }

    const cutoffDate = new Date(now);

    switch (retentionUnit) {
        case 'days':
            cutoffDate.setDate(cutoffDate.getDate() - retentionPeriod);
            break;
        case 'weeks':
            cutoffDate.setDate(cutoffDate.getDate() - (retentionPeriod * 7));
            break;
        case 'months':
            cutoffDate.setMonth(cutoffDate.getMonth() - retentionPeriod);
            break;
        case 'years':
            cutoffDate.setFullYear(cutoffDate.getFullYear() - retentionPeriod);
            break;
        default:
            throw new Error('Invalid retention unit');
    }

    return cutoffDate;
}

export async function POST(request: Request) {
    return authenticateAndTrackRequest(request, async (auth) => {
        logger.debug(`Auth in audit logs trim API for user ID: ${auth.user?.id}.`);

        // Check if the user is authenticated and has the SUPER_ADMIN role
        if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        try {
            const body: TrimRequest = await request.json();
            const { retentionPeriod, retentionUnit, confirmation, dataTypes = ['logs'] } = body;

            // Validate confirmation
            if (confirmation !== 'CONFIRM') {
                return NextResponse.json({ error: 'Confirmation required. Type "CONFIRM" to proceed.' }, { status: 400 });
            }

            // Validate input
            if (retentionPeriod === undefined || retentionPeriod === null || retentionPeriod < 0) {
                return NextResponse.json({ error: 'Retention period must be 0 or greater' }, { status: 400 });
            }

            if (!['days', 'weeks', 'months', 'years'].includes(retentionUnit)) {
                return NextResponse.json({ error: 'Invalid retention unit' }, { status: 400 });
            }

            if (!Array.isArray(dataTypes) || dataTypes.length === 0) {
                return NextResponse.json({ error: 'At least one data type must be specified' }, { status: 400 });
            }

            const validDataTypes = ['logs', 'analytics'];
            if (!dataTypes.every(type => validDataTypes.includes(type))) {
                return NextResponse.json({ error: 'Invalid data type specified' }, { status: 400 });
            }

            // Allow 0 retention period to delete all data
            const minDays = retentionUnit === 'days' ? retentionPeriod :
                retentionUnit === 'weeks' ? retentionPeriod * 7 :
                    retentionUnit === 'months' ? retentionPeriod * 30 :
                        retentionPeriod * 365;

            if (minDays < 0) {
                return NextResponse.json({ error: 'Retention period cannot be negative' }, { status: 400 });
            }

            const cutoffDate = calculateCutoffDate(retentionPeriod, retentionUnit);
            const response: TrimResponse = {
                success: true,
                cutoffDate
            };

            // Perform the deletion in a transaction
            const result = await prisma.$transaction(async (tx) => {
                const deletionResults: {
                    auditLogs?: {
                        deletedCount: number;
                        remainingCount: number;
                        oldestRemainingLog: string | null;
                    };
                    analytics?: {
                        apiKeyUsageEvents: { deletedCount: number; remainingCount: number; };
                        apiKeyUsageStats: { deletedCount: number; remainingCount: number; };
                        sessionUsageEvents: { deletedCount: number; remainingCount: number; };
                        sessionUsageStats: { deletedCount: number; remainingCount: number; };
                    };
                } = {};

                // Handle audit logs deletion
                if (dataTypes.includes('logs')) {
                    const totalCountBefore = await tx.auditLog.count();
                    const deleteResult = await tx.auditLog.deleteMany({
                        where: { timestamp: { lt: cutoffDate } }
                    });
                    const remainingCount = totalCountBefore - deleteResult.count;
                    const oldestRemainingLog = await tx.auditLog.findFirst({
                        orderBy: { timestamp: 'asc' },
                        select: { timestamp: true }
                    });

                    deletionResults.auditLogs = {
                        deletedCount: deleteResult.count,
                        remainingCount,
                        oldestRemainingLog: oldestRemainingLog?.timestamp?.toISOString() || null
                    };
                }

                // Handle analytics deletion
                if (dataTypes.includes('analytics')) {
                    // API Key Usage Events
                    const apiKeyEventsTotalBefore = await tx.apiKeyUsageEvent.count();
                    const apiKeyEventsDeleteResult = await tx.apiKeyUsageEvent.deleteMany({
                        where: { timestamp: { lt: cutoffDate } }
                    });

                    // API Key Usage Stats
                    const apiKeyStatsTotalBefore = await tx.apiKeyUsageStats.count();
                    const apiKeyStatsDeleteResult = await tx.apiKeyUsageStats.deleteMany({
                        where: { date: { lt: cutoffDate } }
                    });

                    // Session Usage Events
                    const sessionEventsTotalBefore = await tx.sessionUsageEvent.count();
                    const sessionEventsDeleteResult = await tx.sessionUsageEvent.deleteMany({
                        where: { timestamp: { lt: cutoffDate } }
                    });

                    // Session Usage Stats
                    const sessionStatsTotalBefore = await tx.sessionUsageStats.count();
                    const sessionStatsDeleteResult = await tx.sessionUsageStats.deleteMany({
                        where: { date: { lt: cutoffDate } }
                    });

                    deletionResults.analytics = {
                        apiKeyUsageEvents: {
                            deletedCount: apiKeyEventsDeleteResult.count,
                            remainingCount: apiKeyEventsTotalBefore - apiKeyEventsDeleteResult.count
                        },
                        apiKeyUsageStats: {
                            deletedCount: apiKeyStatsDeleteResult.count,
                            remainingCount: apiKeyStatsTotalBefore - apiKeyStatsDeleteResult.count
                        },
                        sessionUsageEvents: {
                            deletedCount: sessionEventsDeleteResult.count,
                            remainingCount: sessionEventsTotalBefore - sessionEventsDeleteResult.count
                        },
                        sessionUsageStats: {
                            deletedCount: sessionStatsDeleteResult.count,
                            remainingCount: sessionStatsTotalBefore - sessionStatsDeleteResult.count
                        }
                    };
                }

                return deletionResults;
            });

            // Add results to response
            if (result.auditLogs) {
                response.auditLogs = result.auditLogs;
            }
            if (result.analytics) {
                response.analytics = result.analytics;
            }

            // Log the trimming operation as an audit event
            const auditAction = dataTypes.includes('logs') && dataTypes.includes('analytics')
                ? 'AUDIT_MANAGEMENT_TRIM_BOTH'
                : dataTypes.includes('analytics')
                    ? 'AUDIT_MANAGEMENT_TRIM_ANALYTICS'
                    : 'AUDIT_MANAGEMENT_TRIM_LOGS';

            await logAuditEvent({
                userId: auth.user.id,
                action: auditAction,
                ipAddress: request.headers.get('x-forwarded-for'),
                userAgent: request.headers.get('user-agent'),
                details: {
                    retentionPeriod,
                    retentionUnit,
                    cutoffDate: cutoffDate.toISOString(),
                    dataTypes,
                    results: result
                }
            });

            const logMessage = dataTypes.includes('logs') && dataTypes.includes('analytics')
                ? `Audit management trim (both logs and analytics) completed by user ${auth.user.id}`
                : dataTypes.includes('analytics')
                    ? `Analytics data trim completed by user ${auth.user.id}`
                    : `Audit logs trim completed by user ${auth.user.id}`;

            logger.info(`${logMessage}: cutoff date ${cutoffDate.toISOString()}`);

            return NextResponse.json(response);
        } catch (error: unknown) {
            logger.error("Error trimming audit management data:", error);

            // Log the failed attempt
            try {
                await logAuditEvent({
                    userId: auth.user?.id || null,
                    action: 'AUDIT_MANAGEMENT_TRIM_FAILED',
                    ipAddress: request.headers.get('x-forwarded-for'),
                    userAgent: request.headers.get('user-agent'),
                    details: {
                        error: (error as Error).message || 'Unknown error'
                    }
                });
            } catch (auditError) {
                logger.error("Failed to log audit management trim failure:", auditError);
            }

            return NextResponse.json({
                error: (error as Error).message || 'Failed to trim audit management data'
            }, { status: 500 });
        }
    });
}
