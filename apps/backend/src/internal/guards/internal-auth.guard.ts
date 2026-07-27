import { timingSafeEqual } from 'crypto';

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Request } from 'express';

// Authenticates n8n's HTTP Request nodes, not a Clerk session — there is no
// tenant/user identity behind this call, only a machine caller holding the
// shared secret both repos were given out of band. Applied per-controller
// (InternalModule) rather than as a second global APP_GUARD, so it never
// runs on routes ClerkTenantGuard already covers. Controllers using this
// guard must also carry @Public() to opt out of ClerkTenantGuard/
// PermissionsGuard, which would otherwise reject a request with no Clerk
// session before this guard ever gets a chance to run.
@Injectable()
export class InternalAuthGuard implements CanActivate {
  private readonly sharedSecret: string;

  constructor(config: ConfigService) {
    this.sharedSecret = config.getOrThrow<string>('N8N_INTERNAL_TOKEN');
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['authorization'];

    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = header.slice('Bearer '.length);
    const tokenBuf = Buffer.from(token);
    const secretBuf = Buffer.from(this.sharedSecret);

    // timingSafeEqual throws on a buffer-length mismatch rather than
    // returning false, so a wrong-length token has to be rejected before it
    // ever gets there.
    if (tokenBuf.length !== secretBuf.length || !timingSafeEqual(tokenBuf, secretBuf)) {
      throw new UnauthorizedException('Invalid bearer token');
    }

    return true;
  }
}
