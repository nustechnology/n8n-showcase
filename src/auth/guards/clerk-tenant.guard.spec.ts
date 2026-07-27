import { BadRequestException, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';

import { JWTVerifyGetKey, KeyLike, SignJWT, generateKeyPair } from 'jose';
import { ClsService } from 'nestjs-cls';

import { PrismaService } from '../../prisma/prisma.service';

import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

import { CLERK_ISSUER, CLERK_JWKS } from '../clerk.constants';
import { ClerkVerifierService } from '../clerk-verifier.service';
import { ClerkTenantGuard } from './clerk-tenant.guard';

const ISSUER = 'https://test.clerk.accounts.dev';

function buildContext(headers: Record<string, string | undefined>): ExecutionContext {
  const handler = function testHandler() {};
  const klass = class TestController {};
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    getHandler: () => handler,
    getClass: () => klass,
  } as unknown as ExecutionContext;
}

async function signToken(
  privateKey: KeyLike,
  claims: { sub?: string; org_id?: string; org_role?: string; org_slug?: string },
): Promise<string> {
  let jwt = new SignJWT(claims).setProtectedHeader({ alg: 'RS256' }).setIssuer(ISSUER).setIssuedAt().setExpirationTime('5m');
  if (claims.sub) jwt = jwt.setSubject(claims.sub);
  return jwt.sign(privateKey);
}

// "v": 2 Clerk session tokens nest org info under a compact `o` claim
// instead of the legacy flat org_id/org_slug/org_role claims.
async function signCompactToken(
  privateKey: KeyLike,
  claims: { sub: string; o?: { id?: string; slg?: string; rol?: string } },
): Promise<string> {
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(ISSUER)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime('5m');
  return jwt.sign(privateKey);
}

describe('ClerkTenantGuard', () => {
  let guard: ClerkTenantGuard;
  let prisma: { tenant: { findUnique: jest.Mock }; user: { findUnique: jest.Mock } };
  let cls: { set: jest.Mock; get: jest.Mock };
  let privateKey: KeyLike;

  beforeAll(async () => {
    const keyPair = await generateKeyPair('RS256');
    privateKey = keyPair.privateKey;

    const getKey: JWTVerifyGetKey = async () => keyPair.publicKey;

    prisma = { tenant: { findUnique: jest.fn() }, user: { findUnique: jest.fn() } };
    cls = { set: jest.fn(), get: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ClerkTenantGuard,
        ClerkVerifierService,
        Reflector,
        { provide: CLERK_JWKS, useValue: getKey },
        { provide: CLERK_ISSUER, useValue: ISSUER },
        { provide: PrismaService, useValue: prisma },
        { provide: ClsService, useValue: cls },
      ],
    }).compile();

    guard = moduleRef.get(ClerkTenantGuard);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default happy-path resolution; individual tests override as needed.
    prisma.tenant.findUnique.mockResolvedValue({ id: 't_1', status: 'ACTIVE' });
    prisma.user.findUnique.mockResolvedValue({ id: 'u_1' });
  });

  it('lets public routes through without touching the token', async () => {
    const context = buildContext({});
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, context.getHandler());

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a missing bearer token', async () => {
    const context = buildContext({});
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a garbage token', async () => {
    const context = buildContext({ authorization: 'Bearer not-a-real-jwt' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a valid token with no org_id claim', async () => {
    const token = await signToken(privateKey, { sub: 'user_1' });
    const context = buildContext({ authorization: `Bearer ${token}`, 'x-workspace-id': 'org_1' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a missing X-Workspace-Id header', async () => {
    const token = await signToken(privateKey, { sub: 'user_1', org_id: 'org_1' });
    const context = buildContext({ authorization: `Bearer ${token}` });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an X-Workspace-Id that does not match the org_id claim', async () => {
    const token = await signToken(privateKey, { sub: 'user_1', org_id: 'org_1' });
    const context = buildContext({ authorization: `Bearer ${token}`, 'x-workspace-id': 'org_2' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an org_id with no provisioned tenant', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    const token = await signToken(privateKey, { sub: 'user_1', org_id: 'org_1' });
    const context = buildContext({ authorization: `Bearer ${token}`, 'x-workspace-id': 'org_1' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a tenant that is not ACTIVE', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 't_1', status: 'SUSPENDED' });
    const token = await signToken(privateKey, { sub: 'user_1', org_id: 'org_1' });
    const context = buildContext({ authorization: `Bearer ${token}`, 'x-workspace-id': 'org_1' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a user that has not been provisioned yet', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const token = await signToken(privateKey, { sub: 'user_1', org_id: 'org_1' });
    const context = buildContext({ authorization: `Bearer ${token}`, 'x-workspace-id': 'org_1' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolves the tenant and user, and populates CLS on a fully valid request', async () => {
    const token = await signToken(privateKey, {
      sub: 'user_1',
      org_id: 'org_1',
      org_role: 'org:admin',
      org_slug: 'alpha',
    });
    const context = buildContext({ authorization: `Bearer ${token}`, 'x-workspace-id': 'org_1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { clerkOrgId: 'org_1' },
      select: { id: true, status: true },
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { clerkUserId: 'user_1' },
      select: { id: true },
    });
    expect(cls.set).toHaveBeenCalledWith('tenantId', 't_1');
    expect(cls.set).toHaveBeenCalledWith('userId', 'u_1');
    expect(cls.set).toHaveBeenCalledWith('clerkOrgId', 'org_1');
    expect(cls.set).toHaveBeenCalledWith('clerkUserId', 'user_1');
    expect(cls.set).toHaveBeenCalledWith('orgRole', 'org:admin');
    expect(cls.set).toHaveBeenCalledWith('orgSlug', 'alpha');
  });

  it('resolves org_id from a "v": 2 token\'s compact `o` claim, not just the legacy flat claim', async () => {
    const token = await signCompactToken(privateKey, {
      sub: 'user_1',
      o: { id: 'org_1', slg: 'alpha', rol: 'admin' },
    });
    const context = buildContext({ authorization: `Bearer ${token}`, 'x-workspace-id': 'org_1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { clerkOrgId: 'org_1' },
      select: { id: true, status: true },
    });
    expect(cls.set).toHaveBeenCalledWith('clerkOrgId', 'org_1');
    expect(cls.set).toHaveBeenCalledWith('orgRole', 'org:admin');
    expect(cls.set).toHaveBeenCalledWith('orgSlug', 'alpha');
  });
});
