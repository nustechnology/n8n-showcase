import { HttpException, HttpStatus } from '@nestjs/common';

// Same structured shape as CircuitOpenException (src/common/circuit-breaker)
// — a throttled caller and a tripped breaker are both "try again shortly,"
// distinguishable by `error` but otherwise a consistent contract to build a
// retry against.
export class TooManyRequestsException extends HttpException {
  constructor(retryAfterMs: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'TooManyRequests',
        message: 'Too many requests — try again shortly',
        retryAfterMs,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
