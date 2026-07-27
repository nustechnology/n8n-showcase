import { HttpStatus } from '@nestjs/common';

import { TooManyRequestsException } from './too-many-requests.exception';

describe('TooManyRequestsException', () => {
  it('carries the distinguishable CircuitOpen-style contract', () => {
    const error = new TooManyRequestsException(12_000);

    expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(error.getResponse()).toEqual({
      statusCode: 429,
      error: 'TooManyRequests',
      message: 'Too many requests — try again shortly',
      retryAfterMs: 12_000,
    });
  });
});
