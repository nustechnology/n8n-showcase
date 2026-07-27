import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';

import { ClsService } from 'nestjs-cls';

import { PrismaService } from '../../prisma/prisma.service';

import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { PermissionsGuard } from './permissions.guard';

function buildContext(): ExecutionContext {
  const handler = function testHandler() {};
  const klass = class TestController {};
  return {
    switchToHttp: () => ({ getRequest: () => ({}) }),
    getHandler: () => handler,
    getClass: () => klass,
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let prisma: { tenantMembership: { findUnique: jest.Mock } };
  let cls: { get: jest.Mock };

  beforeEach(async () => {
    prisma = { tenantMembership: { findUnique: jest.fn() } };
    cls = { get: jest.fn((key: string) => ({ tenantId: 't_1', userId: 'u_1' })[key]) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PermissionsGuard,
        Reflector,
        { provide: PrismaService, useValue: prisma },
        { provide: ClsService, useValue: cls },
      ],
    }).compile();

    guard = moduleRef.get(PermissionsGuard);
  });

  it('passes through public routes without a DB lookup', async () => {
    const context = buildContext();
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, context.getHandler());

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.tenantMembership.findUnique).not.toHaveBeenCalled();
  });

  it('passes through routes with no @RequirePermission', async () => {
    const context = buildContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.tenantMembership.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when there is no membership for this tenant/user', async () => {
    prisma.tenantMembership.findUnique.mockResolvedValue(null);
    const context = buildContext();
    Reflect.defineMetadata(PERMISSION_KEY, 'orders:write', context.getHandler());

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when the membership is not ACTIVE', async () => {
    prisma.tenantMembership.findUnique.mockResolvedValue({
      status: 'SUSPENDED',
      role: { rolePermissions: [{ permission: { key: 'orders:write' } }] },
    });
    const context = buildContext();
    Reflect.defineMetadata(PERMISSION_KEY, 'orders:write', context.getHandler());

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects when the member's role lacks the required permission", async () => {
    prisma.tenantMembership.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      role: { rolePermissions: [{ permission: { key: 'orders:read' } }] },
    });
    const context = buildContext();
    Reflect.defineMetadata(PERMISSION_KEY, 'orders:write', context.getHandler());

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes when the role has the required permission', async () => {
    prisma.tenantMembership.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      role: {
        rolePermissions: [
          { permission: { key: 'orders:read' } },
          { permission: { key: 'orders:write' } },
        ],
      },
    });
    const context = buildContext();
    Reflect.defineMetadata(PERMISSION_KEY, 'orders:write', context.getHandler());

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.tenantMembership.findUnique).toHaveBeenCalledWith({
      where: { tenantId_userId: { tenantId: 't_1', userId: 'u_1' } },
      select: {
        status: true,
        role: { select: { rolePermissions: { select: { permission: { select: { key: true } } } } } },
      },
    });
  });
});
