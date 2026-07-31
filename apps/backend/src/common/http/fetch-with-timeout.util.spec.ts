import { fetchWithTimeout } from './fetch-with-timeout.util';

describe('fetchWithTimeout', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('passes through the url and init, defaulting a signal', async () => {
    const mockFetch = jest.fn().mockResolvedValue(new Response('ok'));
    global.fetch = mockFetch as unknown as typeof fetch;

    await fetchWithTimeout('https://example.com', { method: 'POST' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }),
    );
  });

  it('does not override a caller-supplied signal', async () => {
    const mockFetch = jest.fn().mockResolvedValue(new Response('ok'));
    global.fetch = mockFetch as unknown as typeof fetch;
    const controller = new AbortController();

    await fetchWithTimeout('https://example.com', { signal: controller.signal });

    expect(mockFetch).toHaveBeenCalledWith('https://example.com', expect.objectContaining({ signal: controller.signal }));
  });

  it('aborts once the timeout elapses', async () => {
    global.fetch = jest.fn((_input: string | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }) as unknown as typeof fetch;

    await expect(fetchWithTimeout('https://example.com', {}, 10)).rejects.toThrow('aborted');
  });
});
