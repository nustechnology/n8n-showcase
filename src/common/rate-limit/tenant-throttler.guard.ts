import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { ClsService } from 'nestjs-cls';

import { TenantClsStore } from '../context/tenant-cls-store';

import { TooManyRequestsException } from './too-many-requests.exception';

// Generous enough that no real dashboard usage pattern should ever hit it —
// this exists to catch one noisy tenant, not to shape normal traffic.
// name: 'default' is deliberate, not the obvious 'tenant' — @nestjs/throttler
// suffixes every header it sets (Retry-After, X-RateLimit-*) with the
// throttler's name unless that name is exactly 'default', in which case it
// stays unsuffixed. A plain Retry-After is the contract callers build
// against, so this can't be named anything more descriptive.
const TENANT_THROTTLE_OPTIONS: ThrottlerModuleOptions = {
  throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
};

// Registered as a global APP_GUARD in AuthModule, after ClerkTenantGuard so
// CLS is already populated. Keyed by the tenantId ClerkTenantGuard resolved
// — not req.ip (the base class's default tracker) — because the thing worth
// protecting is one noisy tenant, not one noisy IP behind a shared NAT.
// Routes that never resolve a tenant (health, webhooks, /internal/* — all
// @Public()) have no tenantId in CLS at the point this guard runs, so
// shouldSkip excludes them without needing a decorator on every one of
// those controllers; InternalThrottlerGuard covers /internal/* separately.
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  constructor(
    // Both parameter decorators below are load-bearing, not just the
    // storage one: ThrottlerGuard's base constructor is
    // (options, storageService, reflector), decorated with
    // @InjectThrottlerOptions()/@InjectThrottlerStorage() at positions 0/1.
    // Nest's DI merges self-declared-dep metadata by array index, and
    // @nestjs/common's Inject() decorator reads that metadata via
    // Reflect.getMetadata (which walks the prototype chain) before
    // appending to it — so decorating *only* position 0 here still leaves
    // position 1 carrying the inherited "inject ThrottlerStorage" entry,
    // silently resolving `reflector` below to the storage service instead
    // of a real Reflector. Redeclaring both positions overwrites both
    // inherited entries with what this constructor actually needs.
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    @Inject(Reflector) reflector: Reflector,
    private readonly cls: ClsService<TenantClsStore>,
  ) {
    super(TENANT_THROTTLE_OPTIONS, storageService, reflector);
  }

  protected override async shouldSkip(): Promise<boolean> {
    return !this.cls.get('tenantId');
  }

  protected override async getTracker(): Promise<string> {
    return this.cls.get('tenantId');
  }

  protected override async throwThrottlingException(
    _context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    // timeToBlockExpire is in whole seconds (the base class also uses it,
    // as-is, for the Retry-After header it already set before calling
    // this) — the body's retryAfterMs is the same value in milliseconds,
    // matching CircuitOpenException's unit.
    throw new TooManyRequestsException(throttlerLimitDetail.timeToBlockExpire * 1000);
  }
}
