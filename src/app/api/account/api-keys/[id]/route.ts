import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { logAuditEvent } from '@/lib/auditLog';
import { authenticateAndTrackRequest, authenticateRequest, handleAuthResponse } from '@/lib/auth-middleware';

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

// GET /api/account/api-keys/[id] - Get a specific API key by ID for the current user
export async function GET(request: Request, context: RouteContext) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user) {
      return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ success: false, message: 'Valid API key ID parameter is missing' }, { status: 400 });
    }

    try {
      const apiKey = await prisma.apiKey.findUnique({
        where: {
          id,
          userId: auth.user.id, // Ensure the API key belongs to the authenticated user
        },
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
      });

      if (!apiKey) {
        await logAuditEvent({
          userId: auth.user.id,
          action: 'API_KEY_READ_FAILURE',
          details: {
            apiKeyId: id,
            reason: 'API key not found or does not belong to user.',
          },
        });
        return NextResponse.json({ success: false, message: 'API key not found or does not belong to user' }, { status: 404 });
      }

      await logAuditEvent({
        userId: auth.user.id,
        action: 'API_KEY_READ_SUCCESS',
        details: {
          apiKeyId: id,
          apiKeyName: apiKey.name,
        },
      });

      return NextResponse.json({ success: true, apiKey });
    } catch (error) {
      logger.error(`Error fetching API key ${id}:`, error);
      await logAuditEvent({
        userId: auth.user.id,
        action: 'API_KEY_READ_FAILURE',
        details: {
          apiKeyId: id,
          reason: 'Exception during API key fetch.',
        },
      });
      return NextResponse.json({ success: false, message: 'Failed to fetch API key' }, { status: 500 });
    }
  });
}

// PUT /api/account/api-keys/[id] - Update a specific API key for the current user
export async function PUT(request: Request, context: RouteContext) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user) {
      return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ success: false, message: 'Valid API key ID parameter is missing' }, { status: 400 });
    }

    try {
      const body = await request.json();
      const { name, enabled, hourlyLimit, dailyLimit, monthlyLimit, burstLimit, expiresAt } = body;

      if (name === undefined && enabled === undefined) {
        await logAuditEvent({
          userId: auth.user.id,
          action: 'API_KEY_UPDATE_FAILURE',
          details: {
            apiKeyId: id,
            reason: 'No fields provided for update.',
          },
        });
        return NextResponse.json({ success: false, message: 'No fields provided for update' }, { status: 400 });
      }

      // Verify the API key belongs to the user before updating
      const existingApiKey = await prisma.apiKey.findUnique({
        where: {
          id,
          userId: auth.user.id,
        },
      });

      if (!existingApiKey) {
        await logAuditEvent({
          userId: auth.user.id,
          action: 'API_KEY_UPDATE_FAILURE',
          details: {
            apiKeyId: id,
            reason: 'API key not found or does not belong to user.',
          },
        });
        return NextResponse.json({ success: false, message: 'API key not found or does not belong to user' }, { status: 404 });
      }

      await logAuditEvent({
        userId: auth.user.id,
        action: 'API_KEY_UPDATE_ATTEMPT',
        details: {
          apiKeyId: id,
          oldName: existingApiKey.name,
          newName: name !== undefined ? name : existingApiKey.name,
          oldEnabled: existingApiKey.enabled,
          newEnabled: enabled !== undefined ? enabled : existingApiKey.enabled,
        },
      });

      const updatedApiKey = await prisma.apiKey.update({
        where: { id: id },
        data: {
          ...(name !== undefined && { name }),
          ...(enabled !== undefined && { enabled }),
          ...(hourlyLimit !== undefined && { hourlyLimit }),
          ...(dailyLimit !== undefined && { dailyLimit }),
          ...(monthlyLimit !== undefined && { monthlyLimit }),
          ...(burstLimit !== undefined && { burstLimit }),
          ...(expiresAt !== undefined && { expiresAt }),
        },
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
      });

      await logAuditEvent({
        userId: auth.user.id,
        action: 'API_KEY_UPDATE_SUCCESS',
        details: {
          apiKeyId: id,
          apiKeyName: updatedApiKey.name,
        },
      });

      return NextResponse.json({ success: true, message: 'API key updated successfully', apiKey: updatedApiKey });
    } catch (error) {
      logger.error(`Error updating API key ${id}:`, error);
      await logAuditEvent({
        userId: auth.user.id,
        action: 'API_KEY_UPDATE_FAILURE',
        details: {
          apiKeyId: id,
          reason: 'Exception during API key update.',
        },
      });
      return NextResponse.json({ success: false, message: 'Failed to update API key' }, { status: 500 });
    }
  });
}

// DELETE /api/account/api-keys/[id] - Delete a specific API key for the current user
export async function DELETE(request: Request, context: RouteContext) {
  const auth = await authenticateRequest(request);

  // Check for rate limiting errors
  const authError = handleAuthResponse(auth);
  if (authError) return authError;

  if (!auth.user) {
    return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ success: false, message: 'Valid API key ID parameter is missing' }, { status: 400 });
  }

  try {
    // Verify the API key belongs to the user before deleting
    const existingApiKey = await prisma.apiKey.findUnique({
      where: {
        id,
        userId: auth.user.id,
      },
    });

    if (!existingApiKey) {
      await logAuditEvent({
        userId: auth.user.id,
        action: 'API_KEY_DELETE_FAILURE',
        details: {
          apiKeyId: id,
          reason: 'API key not found or does not belong to user.',
        },
      });
      return NextResponse.json({ success: false, message: 'API key not found or does not belong to user' }, { status: 404 });
    }

    await logAuditEvent({
      userId: auth.user.id,
      action: 'API_KEY_DELETE_ATTEMPT',
      details: {
        apiKeyId: id,
        apiKeyName: existingApiKey.name,
      },
    });

    await prisma.apiKey.delete({
      where: { id: id },
    });

    await logAuditEvent({
      userId: auth.user.id,
      action: 'API_KEY_DELETE_SUCCESS',
      details: {
        apiKeyId: id,
        apiKeyName: existingApiKey.name,
      },
    });

    return NextResponse.json({ success: true, message: 'API key deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting API key ${id}:`, error);
    await logAuditEvent({
      userId: auth.user.id,
      action: 'API_KEY_DELETE_FAILURE',
      details: {
        apiKeyId: id,
        reason: 'Exception during API key deletion.',
      },
    });
    return NextResponse.json({ success: false, message: 'Failed to delete API key' }, { status: 500 });
  }
}

// PATCH /api/account/api-keys/[id] - Partial update for enable/disable and rate limits
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await authenticateRequest(request);

  // Check for rate limiting errors
  const authError = handleAuthResponse(auth);
  if (authError) return authError;

  if (!auth.user) {
    return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ success: false, message: 'Valid API key ID parameter is missing' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { enabled, hourlyLimit, dailyLimit, monthlyLimit, burstLimit, expiresAt } = body;
    // Only update fields that are present in the request
    const updateData: Record<string, boolean | number | null | string | Date> = {};
    if (enabled !== undefined) updateData.enabled = enabled;
    if ('hourlyLimit' in body) updateData.hourlyLimit = hourlyLimit;
    if ('dailyLimit' in body) updateData.dailyLimit = dailyLimit;
    if ('monthlyLimit' in body) updateData.monthlyLimit = monthlyLimit;
    if ('burstLimit' in body) updateData.burstLimit = burstLimit;
    if ('expiresAt' in body) updateData.expiresAt = expiresAt;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: false, message: 'No valid fields to update.' }, { status: 400 });
    }

    // Ensure the API key belongs to the user
    const existingApiKey = await prisma.apiKey.findUnique({
      where: { id, userId: auth.user.id },
    });
    if (!existingApiKey) {
      return NextResponse.json({ success: false, message: 'API key not found or does not belong to user' }, { status: 404 });
    }

    const updatedApiKey = await prisma.apiKey.update({
      where: { id },
      data: updateData,
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
    });

    return NextResponse.json({ success: true, apiKey: updatedApiKey });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to update API key' }, { status: 500 });
  }
} 