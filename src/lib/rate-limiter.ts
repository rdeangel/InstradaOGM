import { prisma } from './prisma';
import { logger } from './logger';

const WINDOW_TYPES = [
  { type: 'burst', ms: 60 * 1000 }, // 1 minute - Check first (most restrictive)
  { type: 'hourly', ms: 60 * 60 * 1000 },
  { type: 'daily', ms: 24 * 60 * 60 * 1000 },
  { type: 'monthly', ms: 31 * 24 * 60 * 60 * 1000 }, // Use 31 days for max window
];

export async function checkRateLimit(apiKeyId: string) {
  const now = new Date();
  const apiKey = await prisma.apiKey.findUnique({ where: { id: apiKeyId } });
  if (!apiKey) throw new Error('API key not found');

  logger.debug(`Rate limit check for API key ${apiKeyId} (${apiKey.name})`);
  logger.debug(`API key limits: burst=${apiKey.burstLimit}, hourly=${apiKey.hourlyLimit}, daily=${apiKey.dailyLimit}, monthly=${apiKey.monthlyLimit}`);

  let allowed = true;
  let limit = 0;
  let remaining = 0;
  let resetTime = now;
  let windowType = '';

  for (const window of WINDOW_TYPES) {
    const windowStart = new Date(now.getTime() - (now.getTime() % window.ms));
    logger.debug(`Checking ${window.type} window: start=${windowStart.toISOString()}, now=${now.toISOString()}`);
    
    let maxAllowed: number | null = null; // Use null to indicate no limit
    if (window.type === 'hourly') maxAllowed = apiKey.hourlyLimit;
    if (window.type === 'daily') maxAllowed = apiKey.dailyLimit;
    if (window.type === 'monthly') maxAllowed = apiKey.monthlyLimit;
    if (window.type === 'burst') maxAllowed = apiKey.burstLimit;

    // If maxAllowed is null, it means no limit for this window type
    if (maxAllowed === null) {
      logger.debug(`Rate limit disabled for ${window.type} window for API key ${apiKeyId}.`);
      continue; // Skip rate limit check for this window type
    }
    
    const rateLimit = await prisma.apiKeyRateLimit.findUnique({
      where: {
        apiKeyId_windowType_windowStart: {
          apiKeyId,
          windowType: window.type,
          windowStart,
        },
      },
    });
    
    const used = rateLimit?.requestCount ?? 0;
    logger.debug(`${window.type} window: used=${used}, maxAllowed=${maxAllowed}, allowed=${used < maxAllowed}`);
    
    if (used >= maxAllowed) {
      allowed = false;
      limit = maxAllowed;
      remaining = 0;
      resetTime = new Date(windowStart.getTime() + window.ms);
      windowType = window.type;
      logger.debug(`Rate limit exceeded: ${window.type} window (${used}/${maxAllowed})`);
      break;
    } else {
      // Track the tightest window for remaining
      if (remaining === 0 || maxAllowed - used < remaining) {
        limit = maxAllowed;
        remaining = maxAllowed - used;
        resetTime = new Date(windowStart.getTime() + window.ms);
        windowType = window.type;
      }
    }
  }
  
  logger.debug(`Rate limit result: allowed=${allowed}, windowType=${windowType}, remaining=${remaining}`);
  return { allowed, limit, remaining, resetTime, windowType };
}

export async function incrementRequestCount(apiKeyId: string) {
  const now = new Date();
  logger.debug(`Incrementing request count for API key ${apiKeyId} at ${now.toISOString()}`);
  
  const apiKey = await prisma.apiKey.findUnique({ where: { id: apiKeyId } });
  if (!apiKey) {
    logger.error(`API key ${apiKeyId} not found during incrementRequestCount. Cannot increment.`);
    return; // Cannot increment if API key is not found
  }

  for (const window of WINDOW_TYPES) {
    let limitValue: number | null = null;
    if (window.type === 'hourly') limitValue = apiKey.hourlyLimit;
    if (window.type === 'daily') limitValue = apiKey.dailyLimit;
    if (window.type === 'monthly') limitValue = apiKey.monthlyLimit;
    if (window.type === 'burst') limitValue = apiKey.burstLimit;

    // Always create rate limit records for usage tracking, even if no limit is set
    // This ensures Usage Trends charts have data to display
    if (limitValue === null) {
      logger.debug(`No limit defined for ${window.type} window for API key ${apiKeyId}, but creating record for usage tracking.`);
    }

    const windowStart = new Date(now.getTime() - (now.getTime() % window.ms));
    logger.debug(`Incrementing ${window.type} window: start=${windowStart.toISOString()}`);
    
    const result = await prisma.apiKeyRateLimit.upsert({
      where: {
        apiKeyId_windowType_windowStart: {
          apiKeyId,
          windowType: window.type,
          windowStart,
        },
      },
      update: {
        requestCount: { increment: 1 },
        lastRequest: now,
      },
      create: {
        apiKeyId,
        windowType: window.type,
        windowStart,
        requestCount: 1,
        lastRequest: now,
      },
    });
    
    logger.debug(`${window.type} window updated: requestCount=${result.requestCount}`);
  }
} 