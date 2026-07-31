const DEFAULT_TIMEOUT_MS = 10_000;

// A slow/hanging upstream otherwise ties up the request's socket and
// context indefinitely — opossum's circuit breaker only times out the
// *promise* it's awaiting, it never aborts the underlying network request.
// Every outbound call to a third party should go through this instead of
// bare `fetch()`. Callers can still pass their own `signal`/`redirect` in
// `init`; only the timeout is defaulted.
export function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}
