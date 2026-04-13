import { beforeEach, describe, expect, it, vi } from 'vitest';

const emitHttpClient = vi.fn();

vi.mock('@/trace/SystemTraceBridge', () => ({
  SystemTraceBridge: {
    emitHttpClient,
  },
}));

const prepareHttpClient = async () => {
  vi.resetModules();

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
      debug: vi.fn(),
    },
  }));

  return import('@httpClient/Http');
};

describe('patch coverage: tools/http/Http body modes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('serializes arrays, dates, nested objects, and nullish values in form mode', async () => {
    const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.body).toBeInstanceOf(URLSearchParams);
      expect((init.body as URLSearchParams).toString()).toBe(
        'tags=alpha&tags=beta&scheduledAt=2026-01-02T03%3A04%3A05.000Z&meta=%7B%22enabled%22%3Atrue%7D&count=2'
      );

      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchSpy as any);

    const { HttpClient } = await prepareHttpClient();

    await HttpClient.post('https://example.test/form-complex', {
      tags: ['alpha', 'beta'],
      scheduledAt: new Date('2026-01-02T03:04:05.000Z'),
      meta: { enabled: true },
      empty: null,
      missing: undefined,
      count: 2,
    })
      .asForm()
      .send();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('normalizes binary bodies for form/json modes and preserves the fallback form passthrough', async () => {
    const fetchSpy = vi
      .fn(async (_url: string, _init: RequestInit) => {
        return new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });
    vi.stubGlobal('fetch', fetchSpy as any);

    const { HttpClient } = await prepareHttpClient();

    await HttpClient.post('https://example.test/form-binary', new Uint8Array([1, 2, 3]))
      .asForm()
      .send();

    await HttpClient.post('https://example.test/json-blob', new Blob(['blob-body'])).send();

    await HttpClient.post('https://example.test/form-fallback', 42 as any)
      .asForm()
      .send();

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'https://example.test/form-binary',
      expect.objectContaining({
        body: expect.any(Uint8Array),
      })
    );
    expect(fetchSpy.mock.calls[0]?.[1]?.body).toBeInstanceOf(Uint8Array);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'https://example.test/json-blob',
      expect.objectContaining({
        body: expect.any(Blob),
      })
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      3,
      'https://example.test/form-fallback',
      expect.objectContaining({
        body: 42,
      })
    );
    expect(emitHttpClient).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        requestBody: '[binary]',
      })
    );
  });

  it('keeps custom serializer objects on the trace path', async () => {
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) => {
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchSpy as any);

    const { HttpClient } = await prepareHttpClient();

    await HttpClient.post('https://example.test/custom-object', { foo: 'bar' })
      .asCustom({
        contentType: 'application/custom+json',
        serializeBody: (body) => body as RequestInit['body'],
      })
      .send();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.test/custom-object',
      expect.objectContaining({
        body: { foo: 'bar' },
      })
    );
    expect(emitHttpClient).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: { foo: 'bar' },
      })
    );
  });
});