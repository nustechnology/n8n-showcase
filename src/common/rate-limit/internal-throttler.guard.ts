import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';

import { TooManyRequestsException } from './too-many-requests.exception';

// name: 'default' (not 'internal') for the same reason as
// TenantThrottlerGuard — @nestjs/throttler only leaves Retry-After/
// X-RateLimit-* headers unsuffixed for a throttler literally named
// 'default'.
const INTERNAL_THROTTLE_OPTIONS: ThrottlerModuleOptions = {
  throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
};

// Applied per-controller (@UseGuards on InternalController and
// IntegrationActionsController, alongside InternalAuthGuard), not as a
// global APP_GUARD — same reasoning as InternalAuthGuard itself: it should
// only ever run on /internal/* routes. n8n's calls carry no per-tenant auth
// context beyond a body field, so this is keyed globally (one shared bucket
// per deployment, not per-tenant, not per-IP) — protecting against a
// runaway workflow loop rather than any one tenant.
@Injectable()
export class InternalThrottlerGuard extends ThrottlerGuard {
  // See TenantThrottlerGuard for why both parameter decorators here are
  // load-bearing, not just the storage one — leaving `reflector`
  // undecorated would silently resolve it to the inherited "inject
  // ThrottlerStorage" entry at that position instead of a real Reflector.
  constructor(
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    @Inject(Reflector) reflector: Reflector,
  ) {
    super(INTERNAL_THROTTLE_OPTIONS, storageService, reflector);
  }

  protected override async getTracker(): Promise<string> {
    return 'internal';
  }

  protected override async throwThrottlingException(
    _context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new TooManyRequestsException(throttlerLimitDetail.timeToBlockExpire * 1000);
  }
}
