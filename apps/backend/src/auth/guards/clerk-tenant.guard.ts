import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Request } from 'express';
import { ClsService } from 'nestjs-cls';

import { PrismaService } from '../../prisma/prisma.service';

import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { TenantClsStore } from '../../common/context/tenant-cls-store';

import { ClerkVerifierService } from '../clerk-verifier.service';

const WORKSPACE_HEADER = 'x-workspace-id';

/**
 * Tenant identity is derived only from the verified Clerk session token's
 * `org_id` claim — never from the X-Workspace-Id header alone. The header
 * is a client-supplied hint the frontend sends on every call (logging,
 * cache-keying); this guard requires it to be present and checks it against
 * the JWT's `org_id`, returning 400 on mismatch. See integration contract
 * §1 — that document is authoritative over the backend plan on this point.
 */
@Injectable()
export class ClerkTenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: ClerkVerifierService,
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<TenantClsStore>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();

    const token = this.extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const claims = await this.verifier.verify(token).catch(() => {
      throw new UnauthorizedException('Invalid or expired session token');
    });

    if (!claims.sub) {
      throw new UnauthorizedException('Session token is missing a subject claim');
    }

    if (!claims.org_id) {
      throw new ForbiddenException('No active workspace selected for this session');
    }

    const workspaceHeader = request.headers[WORKSPACE_HEADER];
    const headerValue = Array.isArray(workspaceHeader) ? workspaceHeader[0] : workspaceHeader;
    if (!headerValue) {
      throw new BadRequestException(`Missing required ${WORKSPACE_HEADER} header`);
    }
    if (headerValue !== claims.org_id) {
      throw new BadRequestException(
        `${WORKSPACE_HEADER} does not match the active workspace for this session`,
      );
    }

    const [tenant, user] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { clerkOrgId: claims.org_id },
        select: { id: true, status: true },
      }),
      this.prisma.user.findUnique({
        where: { clerkUserId: claims.sub },
        select: { id: true },
      }),
    ]);
    if (!tenant) {
      throw new ForbiddenException('Workspace is not provisioned');
    }
    if (tenant.status !== 'ACTIVE') {
      throw new ForbiddenException('Workspace is not active');
    }
    if (!user) {
      // Clerk's user.created webhook hasn't been processed yet — a real
      // race, not just a defensive check: webhook delivery can lag behind
      // the session token being issued.
      throw new ForbiddenException('User is not provisioned yet');
    }

    this.cls.set('tenantId', tenant.id);
    this.cls.set('userId', user.id);
    this.cls.set('clerkOrgId', claims.org_id);
    this.cls.set('clerkUserId', claims.sub);
    this.cls.set('orgRole', claims.org_role);
    this.cls.set('orgSlug', claims.org_slug);

    return true;
  }

  private extractBearerToken(authorizationHeader?: string): string | undefined {
    if (!authorizationHeader) return undefined;
    const [scheme, token] = authorizationHeader.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
  }
}
