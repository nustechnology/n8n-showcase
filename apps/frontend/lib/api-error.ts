/** Normalizes NestJS's { statusCode, message, error } shape at the client boundary. */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly body: unknown,
    /** The literal `error` string from the response body — e.g. "CircuitOpen" / "TooManyRequests" (backend Phase 4 contract). Checked as a code, not by matching message text, since human-readable copy can change independently. */
    public readonly errorCode?: string,
    /** Present alongside CircuitOpen/TooManyRequests — how long until the failure is expected to clear. */
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** class-validator returns message as string[] for field-level validation errors. */
  get fieldErrors(): string[] | undefined {
    const messages = (this.body as { message?: unknown } | null)?.message;
    return Array.isArray(messages) ? messages : undefined;
  }
}

/** True for a circuit trip or a rate limit — a failure that isn't the tenant's fault and resolves on its own. */
export function isTransientError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.errorCode === "CircuitOpen" || error.errorCode === "TooManyRequests");
}
