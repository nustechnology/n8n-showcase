import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ClsService } from 'nestjs-cls';

import { PrismaService } from '../../prisma/prisma.service';

import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { TenantClsStore } from '../../common/context/tenant-cls-store';

import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

/**
 * Runs after ClerkTenantGuard (registration order in AuthModule matters —
 * this one depends on tenantId/userId already being in CLS). A no-op on
 * any route without @RequirePermission: this only ever narrows access,
 * it never grants it, so leaving a route undecorated keeps today's
 * behavior (any active tenant member can call it).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<TenantClsStore>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredPermission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredPermission) return true;

    const tenantId = this.cls.get('tenantId');
    const userId = this.cls.get('userId');

    const membership = await this.prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: {
        status: true,
        role: { select: { rolePermissions: { select: { permission: { select: { key: true } } } } } },
      },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException('Not an active member of this workspace');
    }

    const permissionKeys = membership.role.rolePermissions.map((rp) => rp.permission.key);
    if (!permissionKeys.includes(requiredPermission)) {
      throw new ForbiddenException(`Missing required permission: ${requiredPermission}`);
    }

    return true;
  }
}
