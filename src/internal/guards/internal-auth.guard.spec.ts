import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { InternalAuthGuard } from './internal-auth.guard';

const SECRET = 'test-shared-secret';

function buildContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('InternalAuthGuard', () => {
  let guard: InternalAuthGuard;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        InternalAuthGuard,
        { provide: ConfigService, useValue: { getOrThrow: () => SECRET } },
      ],
    }).compile();

    guard = moduleRef.get(InternalAuthGuard);
  });

  it('rejects a missing Authorization header', () => {
    expect(() => guard.canActivate(buildContext({}))).toThrow(UnauthorizedException);
  });

  it('rejects a header that is not a bearer token', () => {
    expect(() => guard.canActivate(buildContext({ authorization: SECRET }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a bearer token with the wrong value', () => {
    expect(() =>
      guard.canActivate(buildContext({ authorization: 'Bearer wrong-secret' })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a bearer token of a different length without crashing', () => {
    expect(() => guard.canActivate(buildContext({ authorization: 'Bearer short' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts the correct shared secret', () => {
    expect(guard.canActivate(buildContext({ authorization: `Bearer ${SECRET}` }))).toBe(true);
  });
});
