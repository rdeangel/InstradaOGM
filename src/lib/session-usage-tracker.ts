/* eslint-disable security/detect-object-injection */
// This file uses bracket notation with typed keys from database results. All uses are safe.
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { Prisma } from '@prisma/client';
import { shouldExcludeFromAnalytics } from './analytics-exclusions';

export interface SessionUsageEventData {
  sessionToken: string;
  userId: string | null; // Allow null for deleted users
  endpoint: string;
  method: string;
  actionType: 'api_call' | 'page_view' | 'form_submit' | 'click' | 'navigation';
  statusCode?: number;
  responseTime?: number;
  ipAddress?: string;
  userAgent?: string;
  pageUrl?: string;
  referrer?: string;
  requestSize?: number;
  responseSize?: number;
  errorType?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionDailyUsageAggregation {
  sessionToken: string;
  userId: string | null; // Allow null for deleted users
  date: Date;
  totalRequests: number;
  apiCalls: number;
  pageViews: number;
  uiActions: number;
  successfulRequests: number;
  failedRequests: number;
  uniqueEndpoints: number;
  uniquePages: number;
  uniqueIpAddresses: number;
  uniqueUserAgents: number;
  avgResponseTime?: number;
  peakHourlyUsage: number;
  peakHourlyUsageHour?: number;
  topEndpoints: Record<string, number>;
  topPages: Record<string, number>;
  topIpAddresses: Record<string, number>;
  topUserAgents: Record<string, number>;
  actionsByType: Record<string, number>;
  errorsByType: Record<string, number>;
  usageByHour: number[]; // Array of 24 elements (0-23 hours)
}

/**
 * Track a detailed session usage event
 */
export async function trackSessionUsageEvent(eventData: SessionUsageEventData): Promise<void> {
  try {
    // Skip tracking for analytics-related endpoints and frequent session endpoints
    if (shouldExcludeFromAnalytics(eventData.endpoint, 'session')) {
      logger.debug(`Session usage tracking skipped for excluded endpoint: ${eventData.endpoint}`);
      return;
    }

    // Create the usage event record
    await prisma.sessionUsageEvent.create({
      data: {
        sessionToken: eventData.sessionToken,
        userId: eventData.userId,
        endpoint: eventData.endpoint,
        method: eventData.method,
        actionType: eventData.actionType,
        statusCode: eventData.statusCode,
        responseTime: eventData.responseTime,
        ipAddress: eventData.ipAddress,
        userAgent: eventData.userAgent,
        pageUrl: eventData.pageUrl,
        referrer: eventData.referrer,
        requestSize: eventData.requestSize,
        responseSize: eventData.responseSize,
        errorType: eventData.errorType,
        errorMessage: eventData.errorMessage,
        metadata: eventData.metadata as Prisma.InputJsonValue,
      },
    });

    // Trigger daily aggregation update (async, don't wait)
    updateSessionDailyAggregation(eventData.sessionToken, eventData.userId, new Date()).catch(error => {
      logger.error(`Failed to update session daily aggregation for session ${eventData.sessionToken}:`, error);
    });

    logger.debug(`Tracked session usage event for session ${eventData.sessionToken}: ${eventData.actionType} ${eventData.method} ${eventData.endpoint}`);
  } catch (error) {
    logger.error(`Failed to track session usage event for session ${eventData.sessionToken}:`, error);
    // Don't throw - we don't want to break the request if tracking fails
  }
}

/**
 * Update daily aggregation for a session
 */
export async function updateSessionDailyAggregation(
  sessionToken: string,
  userId: string | null,
  date: Date
): Promise<void> {
  try {
    // Normalize date to start of day
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);

    // Calculate aggregation data
    const aggregationData = await calculateSessionDailyAggregation(sessionToken, userId, normalizedDate);

    // Upsert the aggregation record
    await prisma.sessionUsageStats.upsert({
      where: {
        sessionToken_date: {
          sessionToken,
          date: normalizedDate,
        },
      },
      update: {
        totalRequests: aggregationData.totalRequests,
        apiCalls: aggregationData.apiCalls,
        pageViews: aggregationData.pageViews,
        uiActions: aggregationData.uiActions,
        successfulRequests: aggregationData.successfulRequests,
        failedRequests: aggregationData.failedRequests,
        uniqueEndpoints: aggregationData.uniqueEndpoints,
        uniquePages: aggregationData.uniquePages,
        uniqueIpAddresses: aggregationData.uniqueIpAddresses,
        uniqueUserAgents: aggregationData.uniqueUserAgents,
        avgResponseTime: aggregationData.avgResponseTime,
        peakHourlyUsage: aggregationData.peakHourlyUsage,
        peakHourlyUsageHour: aggregationData.peakHourlyUsageHour,
        topEndpoints: aggregationData.topEndpoints as Prisma.InputJsonValue,
        topPages: aggregationData.topPages as Prisma.InputJsonValue,
        topIpAddresses: aggregationData.topIpAddresses as Prisma.InputJsonValue,
        topUserAgents: aggregationData.topUserAgents as Prisma.InputJsonValue,
        actionsByType: aggregationData.actionsByType as Prisma.InputJsonValue,
        errorsByType: aggregationData.errorsByType as Prisma.InputJsonValue,
        usageByHour: aggregationData.usageByHour as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
      create: {
        sessionToken,
        userId,
        date: normalizedDate,
        totalRequests: aggregationData.totalRequests,
        apiCalls: aggregationData.apiCalls,
        pageViews: aggregationData.pageViews,
        uiActions: aggregationData.uiActions,
        successfulRequests: aggregationData.successfulRequests,
        failedRequests: aggregationData.failedRequests,
        uniqueEndpoints: aggregationData.uniqueEndpoints,
        uniquePages: aggregationData.uniquePages,
        uniqueIpAddresses: aggregationData.uniqueIpAddresses,
        uniqueUserAgents: aggregationData.uniqueUserAgents,
        avgResponseTime: aggregationData.avgResponseTime,
        peakHourlyUsage: aggregationData.peakHourlyUsage,
        peakHourlyUsageHour: aggregationData.peakHourlyUsageHour,
        topEndpoints: aggregationData.topEndpoints as Prisma.InputJsonValue,
        topPages: aggregationData.topPages as Prisma.InputJsonValue,
        topIpAddresses: aggregationData.topIpAddresses as Prisma.InputJsonValue,
        topUserAgents: aggregationData.topUserAgents as Prisma.InputJsonValue,
        actionsByType: aggregationData.actionsByType as Prisma.InputJsonValue,
        errorsByType: aggregationData.errorsByType as Prisma.InputJsonValue,
        usageByHour: aggregationData.usageByHour as Prisma.InputJsonValue,
      },
    });

    logger.debug(`Updated session daily aggregation for session ${sessionToken} on ${normalizedDate.toISOString()}`);
  } catch (error) {
    logger.error(`Failed to update session daily aggregation for session ${sessionToken}:`, error);
    throw error;
  }
}

/**
 * Calculate daily aggregation data for a session
 */
async function calculateSessionDailyAggregation(
  sessionToken: string,
  userId: string | null,
  date: Date
): Promise<SessionDailyUsageAggregation> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Get all events for this session on this date
  const events = await prisma.sessionUsageEvent.findMany({
    where: {
      sessionToken,
      timestamp: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    orderBy: {
      timestamp: 'asc',
    },
  });

  // Calculate basic counts
  const totalRequests = events.length;
  const apiCalls = events.filter(e => e.actionType === 'api_call').length;
  const pageViews = events.filter(e => e.actionType === 'page_view').length;
  const uiActions = events.filter(e => ['form_submit', 'click', 'navigation'].includes(e.actionType)).length;
  const successfulRequests = events.filter(e => !e.statusCode || (e.statusCode >= 200 && e.statusCode < 400)).length;
  const failedRequests = events.filter(e => e.statusCode && e.statusCode >= 400).length;

  // Calculate unique counts
  const uniqueEndpoints = new Set(events.map(e => e.endpoint)).size;
  const uniquePages = new Set(events.filter(e => e.pageUrl).map(e => e.pageUrl)).size;
  const uniqueIpAddresses = new Set(events.filter(e => e.ipAddress).map(e => e.ipAddress)).size;
  const uniqueUserAgents = new Set(events.filter(e => e.userAgent).map(e => e.userAgent)).size;

  // Calculate average response time
  const responseTimes = events.filter(e => e.responseTime !== null).map(e => e.responseTime!);
  const avgResponseTime = responseTimes.length > 0 
    ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
    : undefined;

  // Calculate hourly usage and peak
  const usageByHour = new Array(24).fill(0);
  events.forEach(event => {
    const hour = event.timestamp.getHours();
    usageByHour[hour]++;
  });

  const peakHourlyUsage = Math.max(...usageByHour);
  const peakHourlyUsageHour = peakHourlyUsage > 0 ? usageByHour.indexOf(peakHourlyUsage) : undefined;

  // Calculate top endpoints
  const endpointCounts: Record<string, number> = {};
  events.forEach(event => {
    endpointCounts[event.endpoint] = (endpointCounts[event.endpoint] || 0) + 1;
  });

  // Calculate top pages
  const pageCounts: Record<string, number> = {};
  events.forEach(event => {
    if (event.pageUrl) {
      pageCounts[event.pageUrl] = (pageCounts[event.pageUrl] || 0) + 1;
    }
  });

  // Calculate top IP addresses
  const ipCounts: Record<string, number> = {};
  events.forEach(event => {
    if (event.ipAddress) {
      ipCounts[event.ipAddress] = (ipCounts[event.ipAddress] || 0) + 1;
    }
  });

  // Calculate top user agents
  const userAgentCounts: Record<string, number> = {};
  events.forEach(event => {
    if (event.userAgent) {
      userAgentCounts[event.userAgent] = (userAgentCounts[event.userAgent] || 0) + 1;
    }
  });

  // Calculate actions by type
  const actionsByType: Record<string, number> = {};
  events.forEach(event => {
    actionsByType[event.actionType] = (actionsByType[event.actionType] || 0) + 1;
  });

  // Calculate errors by type
  const errorsByType: Record<string, number> = {};
  events.forEach(event => {
    if (event.errorType) {
      errorsByType[event.errorType] = (errorsByType[event.errorType] || 0) + 1;
    }
  });

  return {
    sessionToken,
    userId,
    date,
    totalRequests,
    apiCalls,
    pageViews,
    uiActions,
    successfulRequests,
    failedRequests,
    uniqueEndpoints,
    uniquePages,
    uniqueIpAddresses,
    uniqueUserAgents,
    avgResponseTime,
    peakHourlyUsage,
    peakHourlyUsageHour,
    topEndpoints: endpointCounts,
    topPages: pageCounts,
    topIpAddresses: ipCounts,
    topUserAgents: userAgentCounts,
    actionsByType,
    errorsByType,
    usageByHour,
  };
}
