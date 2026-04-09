import { beforeEach, describe, expect, it, vi } from 'vitest';

const emitHttpClient = vi.fn();

vi.mock('@/trace/SystemTraceBridge', () => ({
  SystemTraceBridge: {
    emitHttpClient,
  },
}));

describe('HttpClient trace bridge integration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('sends request and response payloads to the trace bridge', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('{"ok":true}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );

    vi.stubGlobal('fetch', fetchMock);

    const { HttpClient } = await import('@httpClient/Http');
    await HttpClient.post('https://example.test/users', { email: 'user@example.com' }).send();

    expect(emitHttpClient).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://example.test/users',
        requestHeaders: expect.objectContaining({ 'Content-Type': 'application/json' }),
        responseStatus: 200,
        duration: expect.any(Number),
        requestBody: { email: 'user@example.com' },
        responseHeaders: expect.objectContaining({ 'content-type': 'application/json' }),
        responseBody: '{"ok":true}',
      })
    );
  });

  it('records outbound request failures in the trace bridge before throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );

    const { HttpClient } = await import('@httpClient/Http');

    await expect(HttpClient.get('https://example.test/fail').send()).rejects.toThrow(
      /HTTP request failed/
    );

    expect(emitHttpClient).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://example.test/fail',
        requestHeaders: expect.any(Object),
        responseStatus: undefined,
        duration: expect.any(Number),
        requestBody: undefined,
        responseHeaders: {},
        responseBody: undefined,
        error: 'network down',
      })
    );
  });
});
