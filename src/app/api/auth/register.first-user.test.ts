import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    globalSettings: { findFirst: vi.fn() },
    user: {
      count: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    verificationToken: { create: vi.fn() },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auditLog', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendVerificationEmail: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'hashed') } }));

import { POST } from '@/app/api/auth/register/route';

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/register first-user role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_REQUIRE_VERIFIED_EMAIL_LOCAL = 'false';
    prismaMock.globalSettings.findFirst.mockResolvedValue({ enableRegistration: true });
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockImplementation(async ({ data }: { data: { role: string; email: string } }) => ({
      id: 'new-user',
      ...data,
    }));
  });

  it('does not grant SUPER_ADMIN when a seed admin already exists', async () => {
    prismaMock.user.count.mockResolvedValue(1);
    const response = await POST(jsonRequest({
      email: 'second@example.com',
      password: 'password12',
      name: 'Second',
      username: 'second',
    }));
    expect(response.status).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: 'USER' }),
    }));
  });

  it('never grants SUPER_ADMIN when the user table is empty', async () => {
    prismaMock.user.count.mockResolvedValue(0);
    const response = await POST(jsonRequest({
      email: 'first@example.com',
      password: 'password12',
      name: 'First',
      username: 'first',
    }));
    expect(response.status).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: 'USER' }),
    }));
  });

  it('assigns PENDING when email verification is required, even on an empty table', async () => {
    process.env.AUTH_REQUIRE_VERIFIED_EMAIL_LOCAL = 'true';
    prismaMock.user.count.mockResolvedValue(0);
    const response = await POST(jsonRequest({
      email: 'first@example.com',
      password: 'password12',
      name: 'First',
      username: 'first',
    }));
    expect(response.status).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: 'PENDING' }),
    }));
  });
});
