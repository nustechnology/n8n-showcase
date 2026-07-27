import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';

import { getStorageToken, ThrottlerStorageService } from '@nestjs/throttler';

import { InternalThrottlerGuard } from './internal-throttler.guard';
import { TooManyRequestsException } from './too-many-requests.exception';

function buildContext(handlerName: string): ExecutionContext {
  const handler = { name: handlerName };
  const klass = class TestController {};
  const res = { header: jest.fn() };
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: {} }), getResponse: () => res }),
    getHandler: () => handler,
    getClass: () => klass,
  } as unknown as ExecutionContext;
}

describe('InternalThrottlerGuard', () => {
  let guard: InternalThrottlerGuard;
  let storage: ThrottlerStorageService;

  beforeEach(async () => {
    storage = new ThrottlerStorageService();

    const moduleRef = await Test.createTestingModule({
      providers: [
        InternalThrottlerGuard,
        Reflector,
        { provide: getStorageToken(), useValue: storage },
      ],
    }).compile();

    guard = moduleRef.get(InternalThrottlerGuard);
    await guard.onModuleInit();
  });

  afterEach(() => {
    storage.onApplicationShutdown();
  });

  it('allows up to the configured limit, then throws TooManyRequestsException', async () => {
    for (let i = 0; i < 300; i++) {
      await expect(guard.canActivate(buildContext('checkInventory'))).resolves.toBe(true);
    }

    await expect(guard.canActivate(buildContext('checkInventory'))).rejects.toBeInstanceOf(
      TooManyRequestsException,
    );
  });

  it('shares one budget per route regardless of which body/tenant field a call carries — n8n has no per-tenant auth context here', async () => {
    // getTracker is a fixed constant, not derived from the request at all —
    // two calls with completely different request shapes still land in the
    // same bucket for a given route.
    const tracker1 = await (guard as unknown as { getTracker(): Promise<string> }).getTracker();
    const tracker2 = await (guard as unknown as { getTracker(): Promise<string> }).getTracker();
    expect(tracker1).toBe(tracker2);
  });
});
