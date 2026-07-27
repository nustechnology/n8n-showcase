import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';

import { getStorageToken, ThrottlerStorageService } from '@nestjs/throttler';
import { ClsService } from 'nestjs-cls';

import { TenantThrottlerGuard } from './tenant-throttler.guard';
import { TooManyRequestsException } from './too-many-requests.exception';

function buildContext(): ExecutionContext {
  const handler = function testHandler() {};
  const klass = class TestController {};
  const res = { header: jest.fn() };
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: {} }), getResponse: () => res }),
    getHandler: () => handler,
    getClass: () => klass,
  } as unknown as ExecutionContext;
}

describe('TenantThrottlerGuard', () => {
  let guard: TenantThrottlerGuard;
  let storage: ThrottlerStorageService;
  let cls: { get: jest.Mock };

  beforeEach(async () => {
    storage = new ThrottlerStorageService();
    cls = { get: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TenantThrottlerGuard,
        Reflector,
        { provide: getStorageToken(), useValue: storage },
        { provide: ClsService, useValue: cls },
      ],
    }).compile();

    guard = moduleRef.get(TenantThrottlerGuard);
    await guard.onModuleInit();
  });

  afterEach(() => {
    storage.onApplicationShutdown();
  });

  it('skips entirely when CLS has no tenantId (health, webhooks, /internal/* — all @Public())', async () => {
    cls.get.mockReturnValue(undefined);
    const context = buildContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(storage.storage.size).toBe(0);
  });

  it('allows up to the configured limit for a tenant, then throws TooManyRequestsException', async () => {
    cls.get.mockReturnValue('t_1');

    for (let i = 0; i < 100; i++) {
      await expect(guard.canActivate(buildContext())).resolves.toBe(true);
    }

    await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(TooManyRequestsException);
  });

  it('sets a plain (unsuffixed) Retry-After header when throttled', async () => {
    cls.get.mockReturnValue('t_1');
    for (let i = 0; i < 100; i++) {
      await guard.canActivate(buildContext());
    }

    const context = buildContext();
    const res = context.switchToHttp().getResponse() as { header: jest.Mock };
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(TooManyRequestsException);
    expect(res.header).toHaveBeenCalledWith('Retry-After', expect.any(Number));
  });

  it('keeps a separate budget per tenant — a different tenant is unaffected', async () => {
    cls.get.mockReturnValue('t_1');
    for (let i = 0; i < 100; i++) {
      await guard.canActivate(buildContext());
    }
    await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(TooManyRequestsException);

    cls.get.mockReturnValue('t_2');
    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
  });
});
