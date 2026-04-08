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
});
