import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { getStorageToken, ThrottlerStorageService } from '@nestjs/throttler';

import { createRemoteJWKSet } from 'jose';

import { TenantThrottlerGuard } from '../common/rate-limit/tenant-throttler.guard';

import { CLERK_ISSUER, CLERK_JWKS } from './clerk.constants';
import { ClerkBackendService } from './clerk-backend.service';
import { ClerkVerifierService } from './clerk-verifier.service';
import { ClerkTenantGuard } from './guards/clerk-tenant.guard';
import { PermissionsGuard } from './guards/permissions.guard';

@Module({
  providers: [
    {
      provide: CLERK_ISSUER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => config.getOrThrow<string>('CLERK_ISSUER'),
    },
    {
      provide: CLERK_JWKS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createRemoteJWKSet(
          new URL(`${config.getOrThrow<string>('CLERK_ISSUER')}/.well-known/jwks.json`),
        ),
    },
    ClerkVerifierService,
    ClerkBackendService,
    // Bound to @nestjs/throttler's own DI token (getStorageToken()), not
    // just the class — TenantThrottlerGuard's constructor asks for that
    // token via @InjectThrottlerStorage(), same token the package's own
    // ThrottlerModule.forRoot() would wire up; providing the bare class
    // wouldn't satisfy it.
    { provide: getStorageToken(), useClass: ThrottlerStorageService },
    // Order matters: ClerkTenantGuard resolves tenantId/userId into CLS,
    // TenantThrottlerGuard and PermissionsGuard both depend on them already
    // being there. TenantThrottlerGuard runs before PermissionsGuard so a
    // throttled caller fails fast before the extra membership/permission
    // DB lookup.
    { provide: APP_GUARD, useClass: ClerkTenantGuard },
    { provide: APP_GUARD, useClass: TenantThrottlerGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [ClerkVerifierService, ClerkBackendService],
})
export class AuthModule {}
