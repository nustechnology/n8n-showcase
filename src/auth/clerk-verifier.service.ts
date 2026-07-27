import { Inject, Injectable } from '@nestjs/common';

import { JWTVerifyGetKey, jwtVerify } from 'jose';

import { CLERK_ISSUER, CLERK_JWKS } from './clerk.constants';
import { ClerkSessionClaims, normalizeClerkSessionClaims } from './clerk-session-claims';

// Verifies a Clerk session token against Clerk's JWKS — networked signature
// verification, re-checked on every call (`jose`'s remote JWKS resolver
// caches keys but re-validates signature/exp/issuer per token). Thin on
// purpose: ClerkTenantGuard owns what happens with the claims afterwards.
@Injectable()
export class ClerkVerifierService {
  constructor(
    @Inject(CLERK_JWKS) private readonly jwks: JWTVerifyGetKey,
    @Inject(CLERK_ISSUER) private readonly issuer: string,
  ) {}

  async verify(token: string): Promise<ClerkSessionClaims> {
    const { payload } = await jwtVerify(token, this.jwks, { issuer: this.issuer });
    return normalizeClerkSessionClaims(payload);
  }
}
