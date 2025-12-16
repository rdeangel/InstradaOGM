/* eslint-disable security/detect-object-injection */
// This file uses bracket notation with typed keys from database results. All uses are safe.
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { shouldExcludeApiEndpointFromAnalytics } from './analytics-exclusions';
import { toDbJson } from './db-helpers';

export interface ApiUsageEventData {
  apiKeyId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime?: number;
  ipAddress?: string;
  userAgent?: string;
  requestSize?: number;
  responseSize?: number;
  errorType?: string;
  errorMessage?: string;
  rateLimitHit?: boolean;
}

export interface DailyUsageAggregation {
  apiKeyId: string;
  date: Date;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitHits: number;
  uniqueEndpoints: number;
  uniqueIpAddresses: number;
  uniqueUserAgents: number;
  avgResponseTime?: number;
  peakHourlyUsage: number;
  peakHourlyUsageHour?: number;
  topEndpoints: Record<string, number>;
  topIpAddresses: Record<string, number>;
  topUserAgents: Record<string, number>;
  errorsByType: Record<string, number>;
  usageByHour: number[]; // Array of 24 elements (0-23 hours)
}

/**
 * Track a detailed API usage event
 */
export async function trackApiUsageEvent(eventData: ApiUsageEventData): Promise<void> {
  try {
    // Skip tracking for analytics-related endpoints (but allow frequent endpoints for API keys)
    if (shouldExcludeApiEndpointFromAnalytics(eventData.endpoint)) {
      logger.debug(`API usage tracking skipped for analytics endpoint: ${eventData.endpoint}`);
      return;
    }

    // Create the usage event record
    await prisma.apiKeyUsageEvent.create({
      data: {
        apiKeyId: eventData.apiKeyId,
        endpoint: eventData.endpoint,
        method: eventData.method,
        statusCode: eventData.statusCode,
        responseTime: eventData.responseTime,
        ipAddress: eventData.ipAddress,
        userAgent: eventData.userAgent,
        requestSize: eventData.requestSize,
        responseSize: eventData.responseSize,
        errorType: eventData.errorType,
        errorMessage: eventData.errorMessage,
        rateLimitHit: eventData.rateLimitHit || false,
      },
    });

    // Trigger daily aggregation update (async, don't wait)
    updateDailyAggregation(eventData.apiKeyId, new Date()).catch(error => {
      logger.error(`Failed to update daily aggregation for API key ${eventData.apiKeyId}:`, error);
    });

    logger.debug(`Tracked API usage event for key ${eventData.apiKeyId}: ${eventData.method} ${eventData.endpoint} (${eventData.statusCode})`);
  } catch (error) {
    logger.error(`Failed to track API usage event for key ${eventData.apiKeyId}:`, error);
    // Don't throw - we don't want to break the API request if tracking fails
  }
}

/**
 * Update daily usage aggregation for an API key
 */
export async function updateDailyAggregation(apiKeyId: string, date: Date): Promise<void> {
  try {
    // Normalize date to start of day
    const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    // Get all events for this API key on this date
    const startOfDay = normalizedDate;
    const endOfDay = new Date(normalizedDate.getTime() + 24 * 60 * 60 * 1000);

    const events = await prisma.apiKeyUsageEvent.findMany({
      where: {
        apiKeyId,
        timestamp: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
      select: {
        endpoint: true,
        method: true,
        statusCode: true,
        responseTime: true,
        ipAddress: true,
        userAgent: true,
        errorType: true,
        rateLimitHit: true,
        timestamp: true,
      },
    });

    if (events.length === 0) {
      return; // No events to aggregate
    }

    // Calculate aggregated statistics
    const aggregation = calculateDailyAggregation(apiKeyId, normalizedDate, events);

    // Upsert the daily aggregation record
    await prisma.apiKeyUsageStats.upsert({
      where: {
        apiKeyId_date: {
          apiKeyId,
          date: normalizedDate,
        },
      },
      update: {
        totalRequests: aggregation.totalRequests,
        successfulRequests: aggregation.successfulRequests,
        failedRequests: aggregation.failedRequests,
        rateLimitHits: aggregation.rateLimitHits,
        uniqueEndpoints: aggregation.uniqueEndpoints,
        uniqueIpAddresses: aggregation.uniqueIpAddresses,
        uniqueUserAgents: aggregation.uniqueUserAgents,
        avgResponseTime: aggregation.avgResponseTime,
        peakHourlyUsage: aggregation.peakHourlyUsage,
        peakHourlyUsageHour: aggregation.peakHourlyUsageHour,
        topEndpoints: toDbJson(aggregation.topEndpoints) as string,
        topIpAddresses: toDbJson(aggregation.topIpAddresses) as string,
        topUserAgents: toDbJson(aggregation.topUserAgents) as string,
        errorsByType: toDbJson(aggregation.errorsByType) as string,
        usageByHour: toDbJson(aggregation.usageByHour) as string,
        updatedAt: new Date(),
      },
      create: {
        apiKeyId,
        date: normalizedDate,
        totalRequests: aggregation.totalRequests,
        successfulRequests: aggregation.successfulRequests,
        failedRequests: aggregation.failedRequests,
        rateLimitHits: aggregation.rateLimitHits,
        uniqueEndpoints: aggregation.uniqueEndpoints,
        uniqueIpAddresses: aggregation.uniqueIpAddresses,
        uniqueUserAgents: aggregation.uniqueUserAgents,
        avgResponseTime: aggregation.avgResponseTime,
        peakHourlyUsage: aggregation.peakHourlyUsage,
        peakHourlyUsageHour: aggregation.peakHourlyUsageHour,
        topEndpoints: toDbJson(aggregation.topEndpoints) as string,
        topIpAddresses: toDbJson(aggregation.topIpAddresses) as string,
        topUserAgents: toDbJson(aggregation.topUserAgents) as string,
        errorsByType: toDbJson(aggregation.errorsByType) as string,
        usageByHour: toDbJson(aggregation.usageByHour) as string,
      },
    });

    logger.debug(`Updated daily aggregation for API key ${apiKeyId} on ${normalizedDate.toISOString().split('T')[0]}`);
  } catch (error) {
    logger.error(`Failed to update daily aggregation for API key ${apiKeyId}:`, error);
    throw error;
  }
}

/**
 * Calculate daily aggregation statistics from events
 */
function calculateDailyAggregation(
  apiKeyId: string,
  date: Date,
  events: Array<{
    endpoint: string;
    method: string;
    statusCode: number;
    responseTime: number | null;
    ipAddress: string | null;
    userAgent: string | null;
    errorType: string | null;
    rateLimitHit: boolean;
    timestamp: Date;
  }>
): DailyUsageAggregation {
  const totalRequests = events.length;
  const successfulRequests = events.filter(e => e.statusCode >= 200 && e.statusCode < 400).length;
  const failedRequests = totalRequests - successfulRequests;
  const rateLimitHits = events.filter(e => e.rateLimitHit).length;

  // Calculate unique counts
  const uniqueEndpoints = new Set(events.map(e => e.endpoint)).size;
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

  // Calculate errors by type
  const errorsByType: Record<string, number> = {};
  events.forEach(event => {
    if (event.errorType) {
      errorsByType[event.errorType] = (errorsByType[event.errorType] || 0) + 1;
    }
  });

  return {
    apiKeyId,
    date,
    totalRequests,
    successfulRequests,
    failedRequests,
    rateLimitHits,
    uniqueEndpoints,
    uniqueIpAddresses,
    uniqueUserAgents,
    avgResponseTime,
    peakHourlyUsage,
    peakHourlyUsageHour,
    topEndpoints: endpointCounts,
    topIpAddresses: ipCounts,
    topUserAgents: userAgentCounts,
    errorsByType,
    usageByHour,
  };
}

/**
 * Clean up old usage events (for data retention)
 */
export async function cleanupOldUsageEvents(retentionDays: number = 90): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await prisma.apiKeyUsageEvent.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });

    logger.info(`Cleaned up ${result.count} old API usage events older than ${retentionDays} days`);
    return result.count;
  } catch (error) {
    logger.error('Failed to clean up old usage events:', error);
    throw error;
  }
}
