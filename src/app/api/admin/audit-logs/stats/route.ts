import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';

interface AuditManagementStats {
    auditLogs: {
        totalCount: number;
        oldestTimestamp: string | null;
        newestTimestamp: string | null;
        timePeriodCounts: {
            lastDay: number;
            lastWeek: number;
            lastMonth: number;
            lastYear: number;
        };
    };
    analytics: {
        apiKeyUsageEvents: {
            totalCount: number;
            oldestTimestamp: string | null;
            newestTimestamp: string | null;
            timePeriodCounts: {
                lastDay: number;
                lastWeek: number;
                lastMonth: number;
                lastYear: number;
            };
        };
        apiKeyUsageStats: {
            totalCount: number;
            oldestDate: string | null;
            newestDate: string | null;
            timePeriodCounts: {
                lastDay: number;
                lastWeek: number;
                lastMonth: number;
                lastYear: number;
            };
        };
        sessionUsageEvents: {
            totalCount: number;
            oldestTimestamp: string | null;
            newestTimestamp: string | null;
            timePeriodCounts: {
                lastDay: number;
                lastWeek: number;
                lastMonth: number;
                lastYear: number;
            };
        };
        sessionUsageStats: {
            totalCount: number;
            oldestDate: string | null;
            newestDate: string | null;
            timePeriodCounts: {
                lastDay: number;
                lastWeek: number;
                lastMonth: number;
                lastYear: number;
            };
        };
    };
}

export async function GET(request: Request) {
    return authenticateAndTrackRequest(request, async (auth) => {
        logger.debug(`Auth in audit management stats API for user ID: ${auth.user?.id}.`);

        // Check if the user is authenticated and has the SUPER_ADMIN role
        if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        try {
            // Calculate time periods
            const now = new Date();
            const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

            // Get audit log statistics
            const auditLogTotalCount = await prisma.auditLog.count();
            const auditLogOldest = await prisma.auditLog.findFirst({
                orderBy: { timestamp: 'asc' },
                select: { timestamp: true }
            });
            const auditLogNewest = await prisma.auditLog.findFirst({
                orderBy: { timestamp: 'desc' },
                select: { timestamp: true }
            });
            const [auditLogLastDay, auditLogLastWeek, auditLogLastMonth, auditLogLastYear] = await Promise.all([
                prisma.auditLog.count({ where: { timestamp: { gte: oneDayAgo } } }),
                prisma.auditLog.count({ where: { timestamp: { gte: oneWeekAgo } } }),
                prisma.auditLog.count({ where: { timestamp: { gte: oneMonthAgo } } }),
                prisma.auditLog.count({ where: { timestamp: { gte: oneYearAgo } } })
            ]);

            // Get API key usage events statistics
            const apiKeyEventsTotalCount = await prisma.apiKeyUsageEvent.count();
            const apiKeyEventsOldest = await prisma.apiKeyUsageEvent.findFirst({
                orderBy: { timestamp: 'asc' },
                select: { timestamp: true }
            });
            const apiKeyEventsNewest = await prisma.apiKeyUsageEvent.findFirst({
                orderBy: { timestamp: 'desc' },
                select: { timestamp: true }
            });
            const [apiKeyEventsLastDay, apiKeyEventsLastWeek, apiKeyEventsLastMonth, apiKeyEventsLastYear] = await Promise.all([
                prisma.apiKeyUsageEvent.count({ where: { timestamp: { gte: oneDayAgo } } }),
                prisma.apiKeyUsageEvent.count({ where: { timestamp: { gte: oneWeekAgo } } }),
                prisma.apiKeyUsageEvent.count({ where: { timestamp: { gte: oneMonthAgo } } }),
                prisma.apiKeyUsageEvent.count({ where: { timestamp: { gte: oneYearAgo } } })
            ]);

            // Get API key usage stats statistics
            const apiKeyStatsTotalCount = await prisma.apiKeyUsageStats.count();
            const apiKeyStatsOldest = await prisma.apiKeyUsageStats.findFirst({
                orderBy: { date: 'asc' },
                select: { date: true }
            });
            const apiKeyStatsNewest = await prisma.apiKeyUsageStats.findFirst({
                orderBy: { date: 'desc' },
                select: { date: true }
            });
            const [apiKeyStatsLastDay, apiKeyStatsLastWeek, apiKeyStatsLastMonth, apiKeyStatsLastYear] = await Promise.all([
                prisma.apiKeyUsageStats.count({ where: { date: { gte: oneDayAgo } } }),
                prisma.apiKeyUsageStats.count({ where: { date: { gte: oneWeekAgo } } }),
                prisma.apiKeyUsageStats.count({ where: { date: { gte: oneMonthAgo } } }),
                prisma.apiKeyUsageStats.count({ where: { date: { gte: oneYearAgo } } })
            ]);

            // Get session usage events statistics
            const sessionEventsTotalCount = await prisma.sessionUsageEvent.count();
            const sessionEventsOldest = await prisma.sessionUsageEvent.findFirst({
                orderBy: { timestamp: 'asc' },
                select: { timestamp: true }
            });
            const sessionEventsNewest = await prisma.sessionUsageEvent.findFirst({
                orderBy: { timestamp: 'desc' },
                select: { timestamp: true }
            });
            const [sessionEventsLastDay, sessionEventsLastWeek, sessionEventsLastMonth, sessionEventsLastYear] = await Promise.all([
                prisma.sessionUsageEvent.count({ where: { timestamp: { gte: oneDayAgo } } }),
                prisma.sessionUsageEvent.count({ where: { timestamp: { gte: oneWeekAgo } } }),
                prisma.sessionUsageEvent.count({ where: { timestamp: { gte: oneMonthAgo } } }),
                prisma.sessionUsageEvent.count({ where: { timestamp: { gte: oneYearAgo } } })
            ]);

            // Get session usage stats statistics
            const sessionStatsTotalCount = await prisma.sessionUsageStats.count();
            const sessionStatsOldest = await prisma.sessionUsageStats.findFirst({
                orderBy: { date: 'asc' },
                select: { date: true }
            });
            const sessionStatsNewest = await prisma.sessionUsageStats.findFirst({
                orderBy: { date: 'desc' },
                select: { date: true }
            });
            const [sessionStatsLastDay, sessionStatsLastWeek, sessionStatsLastMonth, sessionStatsLastYear] = await Promise.all([
                prisma.sessionUsageStats.count({ where: { date: { gte: oneDayAgo } } }),
                prisma.sessionUsageStats.count({ where: { date: { gte: oneWeekAgo } } }),
                prisma.sessionUsageStats.count({ where: { date: { gte: oneMonthAgo } } }),
                prisma.sessionUsageStats.count({ where: { date: { gte: oneYearAgo } } })
            ]);

            const stats: AuditManagementStats = {
                auditLogs: {
                    totalCount: auditLogTotalCount,
                    oldestTimestamp: auditLogOldest?.timestamp?.toISOString() || null,
                    newestTimestamp: auditLogNewest?.timestamp?.toISOString() || null,
                    timePeriodCounts: {
                        lastDay: auditLogLastDay,
                        lastWeek: auditLogLastWeek,
                        lastMonth: auditLogLastMonth,
                        lastYear: auditLogLastYear
                    }
                },
                analytics: {
                    apiKeyUsageEvents: {
                        totalCount: apiKeyEventsTotalCount,
                        oldestTimestamp: apiKeyEventsOldest?.timestamp?.toISOString() || null,
                        newestTimestamp: apiKeyEventsNewest?.timestamp?.toISOString() || null,
                        timePeriodCounts: {
                            lastDay: apiKeyEventsLastDay,
                            lastWeek: apiKeyEventsLastWeek,
                            lastMonth: apiKeyEventsLastMonth,
                            lastYear: apiKeyEventsLastYear
                        }
                    },
                    apiKeyUsageStats: {
                        totalCount: apiKeyStatsTotalCount,
                        oldestDate: apiKeyStatsOldest?.date?.toISOString() || null,
                        newestDate: apiKeyStatsNewest?.date?.toISOString() || null,
                        timePeriodCounts: {
                            lastDay: apiKeyStatsLastDay,
                            lastWeek: apiKeyStatsLastWeek,
                            lastMonth: apiKeyStatsLastMonth,
                            lastYear: apiKeyStatsLastYear
                        }
                    },
                    sessionUsageEvents: {
                        totalCount: sessionEventsTotalCount,
                        oldestTimestamp: sessionEventsOldest?.timestamp?.toISOString() || null,
                        newestTimestamp: sessionEventsNewest?.timestamp?.toISOString() || null,
                        timePeriodCounts: {
                            lastDay: sessionEventsLastDay,
                            lastWeek: sessionEventsLastWeek,
                            lastMonth: sessionEventsLastMonth,
                            lastYear: sessionEventsLastYear
                        }
                    },
                    sessionUsageStats: {
                        totalCount: sessionStatsTotalCount,
                        oldestDate: sessionStatsOldest?.date?.toISOString() || null,
                        newestDate: sessionStatsNewest?.date?.toISOString() || null,
                        timePeriodCounts: {
                            lastDay: sessionStatsLastDay,
                            lastWeek: sessionStatsLastWeek,
                            lastMonth: sessionStatsLastMonth,
                            lastYear: sessionStatsLastYear
                        }
                    }
                }
            };

            logger.info(`Retrieved audit management statistics: ${auditLogTotalCount} audit logs, ${apiKeyEventsTotalCount} API events, ${sessionEventsTotalCount} session events`);
            return NextResponse.json(stats);

        } catch (error: unknown) {
            logger.error("Error fetching audit management statistics:", error);
            return NextResponse.json({
                error: (error as Error).message || 'Failed to fetch audit management statistics'
            }, { status: 500 });
        }
    });
}
