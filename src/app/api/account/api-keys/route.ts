import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { logAuditEvent } from '@/lib/auditLog';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// GET /api/account/api-keys - List all API keys for the current user
export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    // At this point, auth.user is guaranteed to be non-null
    if (!auth.user) {
      return NextResponse.json({ message: 'Unexpected authentication error' }, { status: 500 });
    }

    try {
      const apiKeys = await prisma.apiKey.findMany({
        where: { userId: auth.user.id },
        select: {
          id: true,
          name: true,
          createdAt: true,
          lastUsed: true,
          expiresAt: true,
          hourlyLimit: true,
          dailyLimit: true,
          monthlyLimit: true,
          burstLimit: true,
          enabled: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      await logAuditEvent({
        userId: auth.user.id,
        action: 'API_KEYS_LISTED',
      });

      return NextResponse.json(apiKeys);
    } catch (error) {
      logger.error(`Error listing API keys for user ${auth.user.id}:`, error);
      await logAuditEvent({
        userId: auth.user.id,
        action: 'API_KEYS_LIST_FAILURE',
        reason: 'Database error',
      });
      return NextResponse.json({ message: 'Failed to list API keys' }, { status: 500 });
    }
  });
}

// POST /api/account/api-keys - Create a new API key
export async function POST(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    // At this point, auth.user is guaranteed to be non-null
    if (!auth.user) {
      return NextResponse.json({ message: 'Unexpected authentication error' }, { status: 500 });
    }

  try {
    const { name, hourlyLimit, dailyLimit, monthlyLimit, burstLimit, expiresAt } = await request.json();

    if (!name || typeof name !== 'string' || name.trim() === '') {
      await logAuditEvent({
        userId: auth.user.id,
        action: 'API_KEY_CREATE_FAILURE',
        reason: 'Invalid name provided',
      });
      return NextResponse.json({ message: 'Valid name is required' }, { status: 400 });
    }

    // Check if user already has an API key with this name
    const existingKey = await prisma.apiKey.findFirst({
      where: {
        userId: auth.user.id,
        name: name.trim(),
      },
    });

    if (existingKey) {
      await logAuditEvent({
        userId: auth.user.id,
        action: 'API_KEY_CREATE_FAILURE',
        reason: 'API key with this name already exists',
      });
      return NextResponse.json({ message: 'An API key with this name already exists' }, { status: 409 });
    }

    // Generate new API key
    const apiKeyValue = crypto.randomBytes(32).toString('hex');
    const hashedKey = await bcrypt.hash(apiKeyValue, 10);

    const newApiKey = await prisma.apiKey.create({
      data: {
        userId: auth.user.id,
        name: name.trim(),
        keyHash: hashedKey,
        hourlyLimit: hourlyLimit !== undefined ? hourlyLimit : 1000,
        dailyLimit: dailyLimit !== undefined ? dailyLimit : 10000,
        monthlyLimit: monthlyLimit !== undefined ? monthlyLimit : 100000,
        burstLimit: burstLimit !== undefined ? burstLimit : 100,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        expiresAt: true,
        hourlyLimit: true,
        dailyLimit: true,
        monthlyLimit: true,
        burstLimit: true,
        enabled: true,
      },
    });

    await logAuditEvent({
      userId: auth.user.id,
      action: 'API_KEY_CREATED',
      details: { apiKeyId: newApiKey.id, apiKeyName: newApiKey.name },
    });

    // Return the API key value only once (for security)
    return NextResponse.json({
      ...newApiKey,
      apiKey: apiKeyValue, // This should only be returned once
    });
  } catch (error) {
    logger.error(`Error creating API key for user ${auth.user.id}:`, error);
    await logAuditEvent({
      userId: auth.user.id,
      action: 'API_KEY_CREATE_FAILURE',
      reason: 'Database error',
    });
    return NextResponse.json({ message: 'Failed to create API key' }, { status: 500 });
  }
  });
}