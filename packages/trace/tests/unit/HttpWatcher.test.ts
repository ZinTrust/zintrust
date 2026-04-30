import { ErrorFactory } from '@zintrust/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { warnSpy } = vi.hoisted(() => ({ warnSpy: vi.fn() }));

vi.mock('@zintrust/core', async () => {
  const actual = await vi.importActual<typeof import('@zintrust/core')>('@zintrust/core');

  return {
    ...actual,
    Logger: {
      ...actual.Logger,
      warn: warnSpy,
    },
  };
});

const flushAsync = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const createStorage = () => ({
  writeEntry: vi.fn().mockResolvedValue(undefined),
  updateEntry: vi.fn().mockResolvedValue(undefined),
  markFamilyStale: vi.fn().mockResolvedValue(undefined),
});

const createRawResponse = () => {
  const listeners = new Map<string, Set<() => void>>();

  return {
    writableEnded: false,
    once(event: 'finish' | 'close', listener: () => void) {
      const bucket = listeners.get(event) ?? new Set<() => void>();
      bucket.add(listener);
      listeners.set(event, bucket);
      return this;
    },
    off(event: 'finish' | 'close', listener: () => void) {
      listeners.get(event)?.delete(listener);
      return this;
    },
    emit(event: 'finish' | 'close') {
      const bucket = [...(listeners.get(event) ?? [])];
      listeners.delete(event);
      for (const listener of bucket) listener();
    },
  };
};

const createResponse = () => {
  const raw = createRawResponse();
  let statusCode = 200;
  const headers: Record<string, string> = {};

  const response = {
    setStatus: vi.fn((code: number) => {
      statusCode = code;
      return response;
    }),
    getStatus: vi.fn(() => statusCode),
    setHeader: vi.fn((name: string, value: string | string[]) => {
      headers[name] = Array.isArray(value) ? value.join(', ') : value;
      return response;
    }),
    json: vi.fn((data: unknown) => {
      void data;
      raw.writableEnded = true;
      raw.emit('finish');
    }),
    text: vi.fn((value: string) => {
      void value;
      raw.writableEnded = true;
      raw.emit('finish');
    }),
    html: vi.fn((value: string) => {
      void value;
      raw.writableEnded = true;
      raw.emit('finish');
    }),
    send: vi.fn((value: string | Buffer) => {
      void value;
      raw.writableEnded = true;
      raw.emit('finish');
    }),
    getRaw: vi.fn(() => raw),
  };

  return { response, raw, headers };
};

const createRequest = (
  path: string,
  body: unknown = {},
  context: Record<string, unknown> = {}
) => ({
  headers: {},
  body: {},
  context,
  getBody: vi.fn(() => body),
  getMethod: vi.fn(() => 'GET'),
  getPath: vi.fn(() => path),
});

describe('HttpWatcher', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    warnSpy.mockReset();
  });

  it('records request entries for successful responses on response finish', async () => {
    vi.resetModules();

    const { HttpWatcher } = await import('../../src/watchers/HttpWatcher');
    const storage = createStorage();
    const config = {
      watchers: { request: true },
      ignoreRoutes: ['/trace'],
      redaction: { keys: [], headers: [], body: [], query: [] },
    } as any;

    let registeredMiddleware:
      | ((req: unknown, res: unknown, next: () => Promise<void>) => Promise<void>)
      | undefined;
    HttpWatcher.register({
      storage,
      config,
      registerMiddleware(
        middleware: (req: unknown, res: unknown, next: () => Promise<void>) => Promise<void>
      ) {
        registeredMiddleware = middleware;
      },
    } as any);

    const { response } = createResponse();
    const request = createRequest('/reports');

    await registeredMiddleware?.(request, response, async () => {
      response.setHeader('x-test', 'ok');
      response.json({ ok: true });
    });
    await flushAsync();

    expect(storage.writeEntry).toHaveBeenCalledTimes(1);
    expect(storage.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'request',
        content: expect.objectContaining({
          uri: '/reports',
          responseStatus: 200,
          responseBody: { ok: true },
          responseHeaders: expect.objectContaining({ 'x-test': 'ok' }),
        }),
      })
    );
  });

  it('records request entries when downstream handling throws and the outer layer sends a 500', async () => {
    vi.resetModules();

    const { HttpWatcher } = await import('../../src/watchers/HttpWatcher');
    const storage = createStorage();
    const config = {
      watchers: { request: true },
      ignoreRoutes: ['/trace'],
      redaction: { keys: [], headers: [], body: [], query: [] },
    } as any;

    let registeredMiddleware:
      | ((req: unknown, res: unknown, next: () => Promise<void>) => Promise<void>)
      | undefined;
    HttpWatcher.register({
      storage,
      config,
      registerMiddleware(
        middleware: (req: unknown, res: unknown, next: () => Promise<void>) => Promise<void>
      ) {
        registeredMiddleware = middleware;
      },
    } as any);

    const { response } = createResponse();
    const request = createRequest('/boom');

    await expect(
      registeredMiddleware?.(request, response, async () => {
        throw ErrorFactory.createGeneralError('boom');
      })
    ).rejects.toThrow('boom');

    response.setStatus(500);
    response.json({ message: 'failed' });
    await flushAsync();

    expect(storage.writeEntry).toHaveBeenCalledTimes(1);
    expect(storage.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'request',
        tags: expect.arrayContaining(['failed']),
        content: expect.objectContaining({
          uri: '/boom',
          responseStatus: 500,
          responseBody: { message: 'failed' },
        }),
      })
    );
  });

  it('captures payloads from getBody even when req.body is empty', async () => {
    vi.resetModules();

    const { HttpWatcher } = await import('../../src/watchers/HttpWatcher');
    const storage = createStorage();
    const config = {
      watchers: { request: true },
      ignoreRoutes: ['/trace'],
      redaction: { keys: [], headers: [], body: [], query: [] },
    } as any;

    let registeredMiddleware:
      | ((req: unknown, res: unknown, next: () => Promise<void>) => Promise<void>)
      | undefined;
    HttpWatcher.register({
      storage,
      config,
      registerMiddleware(
        middleware: (req: unknown, res: unknown, next: () => Promise<void>) => Promise<void>
      ) {
        registeredMiddleware = middleware;
      },
    } as any);

    const { response } = createResponse();
    const request = createRequest('/login', { email: 'user@example.com', password: 'secret' });

    await registeredMiddleware?.(request, response, async () => {
      response.setStatus(500);
      response.json({ error: 'Login failed' });
    });
    await flushAsync();

    expect(storage.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          payload: { email: 'user@example.com', password: 'secret' },
        }),
      })
    );
  });

  it('captures route middleware names from request context', async () => {
    vi.resetModules();

    const { HttpWatcher } = await import('../../src/watchers/HttpWatcher');
    const storage = createStorage();
    const config = {
      watchers: { request: true },
      ignoreRoutes: ['/trace'],
      redaction: { keys: [], headers: [], body: [], query: [] },
    } as any;

    let registeredMiddleware:
      | ((req: unknown, res: unknown, next: () => Promise<void>) => Promise<void>)
      | undefined;
    HttpWatcher.register({
      storage,
      config,
      registerMiddleware(
        middleware: (req: unknown, res: unknown, next: () => Promise<void>) => Promise<void>
      ) {
        registeredMiddleware = middleware;
      },
    } as any);

    const { response } = createResponse();
    const request = createRequest('/reports', {}, { traceRouteMiddleware: ['auth', 'throttle'] });

    await registeredMiddleware?.(request, response, async () => {
      response.json({ ok: true });
    });
    await flushAsync();

    expect(storage.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          middleware: ['auth', 'throttle'],
        }),
      })
    );
  });

  it('persists entries even when the raw response has no lifecycle hooks', async () => {
    vi.resetModules();

    const { HttpWatcher } = await import('../../src/watchers/HttpWatcher');
    const storage = createStorage();
    const config = {
      watchers: { request: true },
      ignoreRoutes: ['/trace'],
      redaction: { keys: [], headers: [], body: [], query: [] },
    } as any;

    let registeredMiddleware:
      | ((req: unknown, res: unknown, next: () => Promise<void>) => Promise<void>)
      | undefined;
    HttpWatcher.register({
      storage,
      config,
      registerMiddleware(
        middleware: (req: unknown, res: unknown, next: () => Promise<void>) => Promise<void>
      ) {
        registeredMiddleware = middleware;
      },
    } as any);

    const response = {
      ...createResponse().response,
      getRaw: vi.fn(() => ({ writableEnded: true })),
    };
    const request = createRequest('/workers');

    await registeredMiddleware?.(request, response as any, async () => {
      response.setStatus(202);
      response.json({ ok: true });
    });
    await flushAsync();

    expect(storage.writeEntry).toHaveBeenCalledTimes(1);
    expect(storage.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          uri: '/workers',
          responseStatus: 202,
        }),
      })
    );
  });

  it('logs request write failures instead of swallowing them silently', async () => {
    vi.resetModules();

    const { HttpWatcher } = await import('../../src/watchers/HttpWatcher');
    const storage = createStorage();
    storage.writeEntry.mockRejectedValueOnce(new Error('proxy write failed'));
    const config = {
      watchers: { request: true },
      ignoreRoutes: ['/trace'],
      redaction: { keys: [], headers: [], body: [], query: [] },
    } as any;

    let registeredMiddleware:
      | ((req: unknown, res: unknown, next: () => Promise<void>) => Promise<void>)
      | undefined;
    HttpWatcher.register({
      storage,
      config,
      registerMiddleware(
        middleware: (req: unknown, res: unknown, next: () => Promise<void>) => Promise<void>
      ) {
        registeredMiddleware = middleware;
      },
    } as any);

    const { response } = createResponse();
    const request = createRequest('/proxy-check');

    await registeredMiddleware?.(request, response, async () => {
      response.json({ ok: true });
    });
    await flushAsync();

    expect(warnSpy).toHaveBeenCalledWith(
      '[trace] HttpWatcher writeEntry failed',
      expect.objectContaining({
        method: 'GET',
        uri: '/proxy-check',
        error: 'proxy write failed',
      })
    );
  });
});
