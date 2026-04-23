import { beforeEach, describe, expect, it, vi } from 'vitest';

const emitHttpClient = vi.fn();
const loggerDebug = vi.fn();

vi.mock('@/trace/SystemTraceBridge', () => ({
  SystemTraceBridge: {
    emitHttpClient,
  },
}));

describe('HttpClient credential URL normalization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    vi.doMock('@config/env', () => ({
      Env: {
        getInt: (_key: string, fallback: number) => fallback,
      },
    }));

    vi.doMock('@/observability/OpenTelemetry', () => ({
      OpenTelemetry: {
        isEnabled: () => false,
        injectTraceHeaders: () => undefined,
      },
    }));

    vi.doMock('@config/logger', () => ({
      Logger: {
        debug: loggerDebug,
      },
    }));
  });

  it('removes credentials from the outbound URL and derives a Basic auth header', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response('{"ok":true}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchSpy as typeof globalThis.fetch);

    const { HttpClient } = await import('@httpClient/Http');

    await HttpClient.get('https://user%40name:pa%3Ass@example.test/resource').send();

    const expectedAuth = Buffer.from('user@name:pa:ss', 'utf8').toString('base64');
    const [url, init] = fetchSpy.mock.calls[0] ?? [];

    expect(url).toBe('https://example.test/resource');
    expect(init?.headers).toMatchObject({ Authorization: `Basic ${expectedAuth}` });
    expect(loggerDebug).toHaveBeenCalledWith(
      'HTTP GET https://example.test/resource',
      expect.objectContaining({ status: 200 })
    );
    expect(emitHttpClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.test/resource',
        requestHeaders: expect.objectContaining({ Authorization: `Basic ${expectedAuth}` }),
      })
    );
  });

  it('preserves an explicit authorization header over URL credentials', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response('{"ok":true}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchSpy as typeof globalThis.fetch);

    const { HttpClient } = await import('@httpClient/Http');

    await HttpClient.get('https://user:password@example.test/resource')
      .withHeader('authorization', 'Bearer explicit-token')
      .send();

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    const headers = (init?.headers ?? {}) as Record<string, string>;

    expect(url).toBe('https://example.test/resource');
    expect(headers['authorization']).toBe('Bearer explicit-token');
    expect(headers['Authorization']).toBeUndefined();
  });
});
