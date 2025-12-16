import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';

interface PreviewTrimRequest {
    retentionPeriod: number;
    retentionUnit: 'days' | 'weeks' | 'months' | 'years';
    dataTypes?: ('logs' | 'analytics')[];
}

interface PreviewTrimResponse {
    cutoffDate: Date;
    retentionPeriod: number;
    retentionUnit: string;
    auditLogs?: {
        logsToDeleteCount: number;
        logsToKeepCount: number;
        totalCount: number;
        oldestLogToDelete: string | null;
        newestLogToDelete: string | null;
    };
    analytics?: {
        apiKeyUsageEvents: {
            eventsToDeleteCount: number;
            eventsToKeepCount: number;
            totalCount: number;
            oldestEventToDelete: string | null;
            newestEventToDelete: string | null;
        };
        apiKeyUsageStats: {
            statsToDeleteCount: number;
            statsToKeepCount: number;
            totalCount: number;
            oldestStatToDelete: string | null;
            newestStatToDelete: string | null;
        };
        sessionUsageEvents: {
            eventsToDeleteCount: number;
            eventsToKeepCount: number;
            totalCount: number;
            oldestEventToDelete: string | null;
            newestEventToDelete: string | null;
        };
        sessionUsageStats: {
            statsToDeleteCount: number;
            statsToKeepCount: number;
            totalCount: number;
            oldestStatToDelete: string | null;
            newestStatToDelete: string | null;
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
        logger.debug(`Auth in audit logs preview trim API for user ID: ${auth.user?.id}.`);

        // Check if the user is authenticated and has the SUPER_ADMIN role
        if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        try {
            const body: PreviewTrimRequest = await request.json();
            const { retentionPeriod, retentionUnit, dataTypes = ['logs'] } = body;

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
            const response: PreviewTrimResponse = {
                cutoffDate,
                retentionPeriod,
                retentionUnit
            };

            // Handle audit logs if requested
            if (dataTypes.includes('logs')) {
                const logsToDeleteCount = await prisma.auditLog.count({
                    where: { timestamp: { lt: cutoffDate } }
                });

                const oldestLogToDelete = await prisma.auditLog.findFirst({
                    where: { timestamp: { lt: cutoffDate } },
                    orderBy: { timestamp: 'asc' },
                    select: { timestamp: true }
                });

                const newestLogToDelete = await prisma.auditLog.findFirst({
                    where: { timestamp: { lt: cutoffDate } },
                    orderBy: { timestamp: 'desc' },
                    select: { timestamp: true }
                });

                const totalLogsCount = await prisma.auditLog.count();

                response.auditLogs = {
                    logsToDeleteCount,
                    logsToKeepCount: totalLogsCount - logsToDeleteCount,
                    totalCount: totalLogsCount,
                    oldestLogToDelete: oldestLogToDelete?.timestamp?.toISOString() || null,
                    newestLogToDelete: newestLogToDelete?.timestamp?.toISOString() || null
                };
            }

            // Handle analytics data if requested
            if (dataTypes.includes('analytics')) {
                // API Key Usage Events
                const apiKeyEventsToDeleteCount = await prisma.apiKeyUsageEvent.count({
                    where: { timestamp: { lt: cutoffDate } }
                });
                const oldestApiKeyEventToDelete = await prisma.apiKeyUsageEvent.findFirst({
                    where: { timestamp: { lt: cutoffDate } },
                    orderBy: { timestamp: 'asc' },
                    select: { timestamp: true }
                });
                const newestApiKeyEventToDelete = await prisma.apiKeyUsageEvent.findFirst({
                    where: { timestamp: { lt: cutoffDate } },
                    orderBy: { timestamp: 'desc' },
                    select: { timestamp: true }
                });
                const totalApiKeyEventsCount = await prisma.apiKeyUsageEvent.count();

                // API Key Usage Stats
                const apiKeyStatsToDeleteCount = await prisma.apiKeyUsageStats.count({
                    where: { date: { lt: cutoffDate } }
                });
                const oldestApiKeyStatToDelete = await prisma.apiKeyUsageStats.findFirst({
                    where: { date: { lt: cutoffDate } },
                    orderBy: { date: 'asc' },
                    select: { date: true }
                });
                const newestApiKeyStatToDelete = await prisma.apiKeyUsageStats.findFirst({
                    where: { date: { lt: cutoffDate } },
                    orderBy: { date: 'desc' },
                    select: { date: true }
                });
                const totalApiKeyStatsCount = await prisma.apiKeyUsageStats.count();

                // Session Usage Events
                const sessionEventsToDeleteCount = await prisma.sessionUsageEvent.count({
                    where: { timestamp: { lt: cutoffDate } }
                });
                const oldestSessionEventToDelete = await prisma.sessionUsageEvent.findFirst({
                    where: { timestamp: { lt: cutoffDate } },
                    orderBy: { timestamp: 'asc' },
                    select: { timestamp: true }
                });
                const newestSessionEventToDelete = await prisma.sessionUsageEvent.findFirst({
                    where: { timestamp: { lt: cutoffDate } },
                    orderBy: { timestamp: 'desc' },
                    select: { timestamp: true }
                });
                const totalSessionEventsCount = await prisma.sessionUsageEvent.count();

                // Session Usage Stats
                const sessionStatsToDeleteCount = await prisma.sessionUsageStats.count({
                    where: { date: { lt: cutoffDate } }
                });
                const oldestSessionStatToDelete = await prisma.sessionUsageStats.findFirst({
                    where: { date: { lt: cutoffDate } },
                    orderBy: { date: 'asc' },
                    select: { date: true }
                });
                const newestSessionStatToDelete = await prisma.sessionUsageStats.findFirst({
                    where: { date: { lt: cutoffDate } },
                    orderBy: { date: 'desc' },
                    select: { date: true }
                });
                const totalSessionStatsCount = await prisma.sessionUsageStats.count();

                response.analytics = {
                    apiKeyUsageEvents: {
                        eventsToDeleteCount: apiKeyEventsToDeleteCount,
                        eventsToKeepCount: totalApiKeyEventsCount - apiKeyEventsToDeleteCount,
                        totalCount: totalApiKeyEventsCount,
                        oldestEventToDelete: oldestApiKeyEventToDelete?.timestamp?.toISOString() || null,
                        newestEventToDelete: newestApiKeyEventToDelete?.timestamp?.toISOString() || null
                    },
                    apiKeyUsageStats: {
                        statsToDeleteCount: apiKeyStatsToDeleteCount,
                        statsToKeepCount: totalApiKeyStatsCount - apiKeyStatsToDeleteCount,
                        totalCount: totalApiKeyStatsCount,
                        oldestStatToDelete: oldestApiKeyStatToDelete?.date?.toISOString() || null,
                        newestStatToDelete: newestApiKeyStatToDelete?.date?.toISOString() || null
                    },
                    sessionUsageEvents: {
                        eventsToDeleteCount: sessionEventsToDeleteCount,
                        eventsToKeepCount: totalSessionEventsCount - sessionEventsToDeleteCount,
                        totalCount: totalSessionEventsCount,
                        oldestEventToDelete: oldestSessionEventToDelete?.timestamp?.toISOString() || null,
                        newestEventToDelete: newestSessionEventToDelete?.timestamp?.toISOString() || null
                    },
                    sessionUsageStats: {
                        statsToDeleteCount: sessionStatsToDeleteCount,
                        statsToKeepCount: totalSessionStatsCount - sessionStatsToDeleteCount,
                        totalCount: totalSessionStatsCount,
                        oldestStatToDelete: oldestSessionStatToDelete?.date?.toISOString() || null,
                        newestStatToDelete: newestSessionStatToDelete?.date?.toISOString() || null
                    }
                };
            }

            return NextResponse.json(response);
        } catch (error: unknown) {
            logger.error("Error previewing audit management trim:", error);
            return NextResponse.json({
                error: (error as Error).message || 'Failed to preview audit management trim'
            }, { status: 500 });
        }
    });
}
