import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Health check endpoint for load balancers and monitoring
 * 
 * This endpoint is used by:
 * - Traefik health checks
 * - Load balancers
 * - Monitoring systems
 * - Docker health checks
 * 
 * Returns 200 OK if the application is healthy
 * Returns 503 Service Unavailable if the application is unhealthy
 */
export async function GET() {
  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Health check failed:', error);

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}

