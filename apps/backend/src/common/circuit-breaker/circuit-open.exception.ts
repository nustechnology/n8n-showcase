import { HttpException, HttpStatus } from '@nestjs/common';

// The one new contract the n8n and frontend Phase 4 work builds against —
// `error: "CircuitOpen"` is the literal string to check for, not a
// message-text match. Distinct from a genuine upstream failure (which still
// surfaces as a 401/BadGatewayException with a real reason): this says
// nothing about the specific request that hit it, only that the breaker for
// this provider is currently open.
export class CircuitOpenException extends HttpException {
  constructor(provider: string, retryAfterMs: number) {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'CircuitOpen',
        message: `${provider} is temporarily unavailable — too many recent failures`,
        retryAfterMs,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
