import { beforeEach, describe, expect, it, vi } from 'vitest';

const emitHttpClient = vi.fn();

vi.mock('@/trace/SystemTraceBridge', () => ({
  SystemTraceBridge: {
    emitHttpClient,
  },
}));

describe('patch coverage: tools/http/HttpClient raw+stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendRaw() and sendStream() return Response and stream', async () => {
    vi.resetModules();

    const fetchSpy = vi.fn(
      async () =>
        new Response('{"ok":true}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchSpy as any);

    vi.doMock('@config/env', () => ({
      Env: {
        getInt: (_k: string, fallback: number) => fallback,
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
        debug: vi.fn(),
      },
    }));

    const { HttpClient } = await import('@httpClient/Http');

    const raw = await HttpClient.get('https://example.test').sendRaw();
    expect(raw.status).toBe(200);
    expect(await raw.text()).toBe('{"ok":true}');

    const streamed = await HttpClient.get('https://example.test').sendStream();
    expect(streamed.response.status).toBe(200);
    expect(streamed.stream).not.toBeNull();
    expect(await streamed.response.text()).toBe('{"ok":true}');

    expect(fetchSpy).toHaveBeenCalled();
    expect(emitHttpClient).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: 'GET',
        url: 'https://example.test',
        responseStatus: 200,
        responseHeaders: expect.objectContaining({ 'content-type': 'application/json' }),
        responseBody: '{"ok":true}',
      })
    );
    expect(emitHttpClient).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: 'GET',
        url: 'https://example.test',
        responseStatus: 200,
        responseHeaders: expect.objectContaining({ 'content-type': 'application/json' }),
        responseBody: '{"ok":true}',
      })
    );

    vi.unstubAllGlobals();
  });

  it('normalizes non-Headers response headers and tolerates clone failures for tracing', async () => {
    vi.resetModules();

    const streamBody = new Response('{"ok":true}').body;
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        headers: {
          entries: function* () {
            yield ['content-type', 'application/json'] as [string, string];
          },
        },
        clone: () => {
          throw new Error('clone unavailable');
        },
        text: async () => '{"ok":true}',
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-trace-id': 'abc123',
          ignored: 7,
        },
        clone: () => ({
          text: async () => '{"stream":true}',
        }),
        text: async () => '{"stream":true}',
        body: streamBody,
      });

    vi.stubGlobal('fetch', fetchSpy as any);

    vi.doMock('@config/env', () => ({
      Env: {
        getInt: (_k: string, fallback: number) => fallback,
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
        debug: vi.fn(),
      },
    }));

    const { HttpClient } = await import('@httpClient/Http');

    const raw = await HttpClient.get('https://example.test/raw-custom').sendRaw();
    expect(raw.status).toBe(200);
    expect(await raw.text()).toBe('{"ok":true}');

    const streamed = await HttpClient.get('https://example.test/stream-custom').sendStream();
    expect(streamed.response.status).toBe(200);
    expect(streamed.stream).toBe(streamBody);

    expect(emitHttpClient).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        url: 'https://example.test/raw-custom',
        responseHeaders: { 'content-type': 'application/json' },
        responseBody: undefined,
      })
    );
    expect(emitHttpClient).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        url: 'https://example.test/stream-custom',
        responseHeaders: {
          'content-type': 'application/json',
          'x-trace-id': 'abc123',
        },
        responseBody: '{"stream":true}',
      })
    );

    vi.unstubAllGlobals();
  });
});
