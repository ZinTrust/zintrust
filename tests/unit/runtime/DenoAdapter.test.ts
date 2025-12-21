import type { AdapterConfig, PlatformRequest, PlatformResponse } from '@/runtime/RuntimeAdapter';
import { describe, expect, it, vi } from 'vitest';

const loggerState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@config/logger', () => ({
  default: loggerState,
}));

type DenoMock = {
  env: {
    toObject?: () => Record<string, string>;
    get?: (key: string) => string | undefined;
  };
  openKv?: () => Promise<unknown>;
  serve?: (
    options: { port: number; hostname: string },
    handler: (req: Request) => Promise<Response>
  ) => Promise<void>;
  mainModule?: string;
};

function setGlobalDeno(deno: DenoMock): void {
  (globalThis as unknown as { Deno?: DenoMock }).Deno = deno;
}

function clearGlobalDeno(): void {
  delete (globalThis as unknown as { Deno?: DenoMock }).Deno;
}

async function importAdapter(): Promise<{
  DenoAdapter: new (config: AdapterConfig) => {
    platform: 'deno';
    handle(event: unknown, context?: unknown): Promise<PlatformResponse>;
    startServer(port?: number, host?: string): Promise<void>;
    parseRequest(event: Request): PlatformRequest;
    formatResponse(response: PlatformResponse): Response;
    getLogger(): {
      debug(msg: string, data?: unknown): void;
      info(msg: string, data?: unknown): void;
      warn(msg: string, data?: unknown): void;
      error(msg: string, err?: Error): void;
    };
    supportsPersistentConnections(): boolean;
    getEnvironment(): {
      nodeEnv: string;
      runtime: string;
      dbConnection: string;
      dbHost?: string;
      dbPort?: number;
      [key: string]: unknown;
    };
    getKV(): Promise<unknown>;
    getEnvVar(key: string, defaultValue?: string): string;
    isDeployEnvironment(): boolean;
  };
}> {
  return import('@/runtime/adapters/DenoAdapter');
}

type MockResponse = {
  writeHead: (statusCode: number, headers?: Record<string, string | string[]>) => void;
  end: (body: string | Buffer | null) => void;
  setHeader: (name: string, value: string | string[]) => void;
  write?: (chunk: string | Buffer) => boolean;
};

describe('DenoAdapter', () => {
  it('should identify as deno platform', async () => {
    setGlobalDeno({
      env: {
        toObject: () => ({ DENO_ENV: 'test' }),
        get: (key) => (key === 'DENO_ENV' ? 'test' : undefined),
      },
    });

    const { DenoAdapter } = await importAdapter();
    const adapter = new DenoAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    expect(adapter.platform).toBe('deno');
    clearGlobalDeno();
  });

  it('supportsPersistentConnections should be false', async () => {
    setGlobalDeno({ env: {} });
    const { DenoAdapter } = await importAdapter();
    const adapter = new DenoAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    expect(adapter.supportsPersistentConnections()).toBe(false);
    clearGlobalDeno();
  });

  it('getEnvironment should parse db port and default nodeEnv', async () => {
    setGlobalDeno({
      env: {
        toObject: () => ({
          DENO_ENV: 'production',
          DB_CONNECTION: 'postgresql',
          DB_HOST: 'db',
          DB_PORT: '5432',
        }),
      },
    });

    const { DenoAdapter } = await importAdapter();
    const adapter = new DenoAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const env = adapter.getEnvironment();
    expect(env.runtime).toBe('deno');
    expect(env.nodeEnv).toBe('production');
    expect(env.dbHost).toBe('db');
    expect(env.dbPort).toBe(5432);

    clearGlobalDeno();
  });

  it('getEnvironment should handle missing db port', async () => {
    setGlobalDeno({
      env: {
        toObject: () => ({ DENO_ENV: 'test' }),
      },
    });

    const { DenoAdapter } = await importAdapter();
    const adapter = new DenoAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const env = adapter.getEnvironment();
    expect(env.nodeEnv).toBe('test');
    expect(env.dbPort).toBeUndefined();
    clearGlobalDeno();
  });

  it('getEnvironment should handle missing env.toObject', async () => {
    setGlobalDeno({ env: {} });
    const { DenoAdapter } = await importAdapter();
    const adapter = new DenoAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const env = adapter.getEnvironment();
    expect(env.nodeEnv).toBe('production');
    expect(env.dbConnection).toBe('postgresql');
    clearGlobalDeno();
  });

  it('getEnvVar should return value, default, and empty string', async () => {
    setGlobalDeno({
      env: {
        get: (key) => (key === 'A' ? '1' : undefined),
      },
    });

    const { DenoAdapter } = await importAdapter();
    const adapter = new DenoAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    expect(adapter.getEnvVar('A')).toBe('1');
    expect(adapter.getEnvVar('B', 'x')).toBe('x');
    expect(adapter.getEnvVar('C')).toBe('');
    clearGlobalDeno();
  });

  it('isDeployEnvironment should detect denoDeploy in mainModule and handle missing Deno', async () => {
    setGlobalDeno({ env: {}, mainModule: 'https://example.com/denoDeploy/app.ts' });
    const { DenoAdapter } = await importAdapter();
    const adapter = new DenoAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    expect(adapter.isDeployEnvironment()).toBe(true);

    clearGlobalDeno();
    expect(adapter.isDeployEnvironment()).toBe(false);
  });

  it('getKV should return undefined when openKv missing and value when present', async () => {
    setGlobalDeno({ env: {} });
    const { DenoAdapter } = await importAdapter();
    const adapter = new DenoAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await expect(adapter.getKV()).resolves.toBeUndefined();

    setGlobalDeno({
      env: {},
      openKv: async () => ({ ok: true }),
    });
    await expect(adapter.getKV()).resolves.toEqual({ ok: true });
    clearGlobalDeno();
  });

  it('formatResponse should handle header arrays and string/buffer bodies', async () => {
    setGlobalDeno({ env: {} });
    const { DenoAdapter } = await importAdapter();
    const adapter = new DenoAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const response1 = adapter.formatResponse({
      statusCode: 201,
      headers: { 'set-cookie': ['a=1', 'b=2'], 'content-type': 'text/plain' },
      body: 'hello',
    });
    expect(response1.status).toBe(201);
    expect(response1.headers.get('content-type')).toBe('text/plain');
    expect(response1.headers.get('set-cookie')).toBe('a=1, b=2');
    await expect(response1.text()).resolves.toBe('hello');

    const response2 = adapter.formatResponse({
      statusCode: 200,
      headers: { 'content-type': 'text/plain' },
      body: Buffer.from('buf', 'utf-8'),
    });
    await expect(response2.text()).resolves.toBe('buf');

    const response3 = adapter.formatResponse({
      statusCode: 200,
      headers: { 'content-type': 'text/plain' },
      body: null,
    });
    await expect(response3.text()).resolves.toBe('');

    clearGlobalDeno();
  });

  it('getLogger should fall back when internal logger missing', async () => {
    setGlobalDeno({ env: {} });
    const { DenoAdapter } = await importAdapter();
    const adapter = new DenoAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }) as unknown as { getLogger: () => any; logger?: unknown };

    adapter.logger = undefined;
    const logger = adapter.getLogger() as {
      debug: (msg: string) => void;
      info: (msg: string) => void;
      warn: (msg: string) => void;
      error: (msg: string, err?: Error) => void;
    };

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e', new Error('x'));

    expect(loggerState.debug).toHaveBeenCalledWith('[Deno] d');
    expect(loggerState.info).toHaveBeenCalledWith('[Deno] i');
    expect(loggerState.warn).toHaveBeenCalledWith('[Deno] w');
    expect(loggerState.error).toHaveBeenCalledWith('[Deno] e', 'x');
    clearGlobalDeno();
  });

  it('default logger should stringify data and handle undefined', async () => {
    setGlobalDeno({ env: {} });
    const { DenoAdapter } = await importAdapter();
    const adapter = new DenoAdapter({
      handler: async () => undefined,
      // no logger => createDefaultLogger
    });

    const l = adapter.getLogger();
    l.debug('a', { ok: true });
    l.debug('a2');
    l.info('b');
    l.info('b2', { ok: false });
    l.warn('c');
    l.warn('c2', null);
    l.error('d', new Error('x'));

    expect(loggerState.debug).toHaveBeenCalledWith('[Deno] a', JSON.stringify({ ok: true }));
    expect(loggerState.debug).toHaveBeenCalledWith('[Deno] a2', '');
    expect(loggerState.info).toHaveBeenCalledWith('[Deno] b', '');
    expect(loggerState.info).toHaveBeenCalledWith('[Deno] b2', JSON.stringify({ ok: false }));
    expect(loggerState.warn).toHaveBeenCalledWith('[Deno] c', '');
    expect(loggerState.warn).toHaveBeenCalledWith('[Deno] c2', 'null');
    expect(loggerState.error).toHaveBeenCalledWith('[Deno] d', 'x');
    clearGlobalDeno();
  });

  it('parseRequest should handle forwarded-for header and default remoteAddr', async () => {
    setGlobalDeno({ env: {} });
    const { DenoAdapter } = await importAdapter();
    const adapter = new DenoAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const req1 = new Request('http://localhost/path?query=1', {
      method: 'GET',
      headers: { 'x-forwarded-for': '192.0.2.1, 192.0.2.2' },
    });
    const parsed1 = adapter.parseRequest(req1);
    expect(parsed1.remoteAddr).toBe('192.0.2.1'); // NOSONAR

    const req2 = new Request('http://localhost/path', { method: 'GET' });
    const parsed2 = adapter.parseRequest(req2);
    expect(parsed2.remoteAddr).toBe('0.0.0.0');
    clearGlobalDeno();
  });

  it('handle should use default processRequest and return ok response', async () => {
    setGlobalDeno({ env: {} });
    const { DenoAdapter } = await importAdapter();
    const adapter = new DenoAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const response = await adapter.handle(new Request('http://localhost/hello', { method: 'GET' }));

    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(String(response.body));
    expect(body).toEqual({ status: 'ok', path: '/hello' });
    clearGlobalDeno();
  });

  it('handle should allow overriding processRequest to cover mock res methods', async () => {
    setGlobalDeno({ env: {} });
    const { DenoAdapter } = await importAdapter();
    const adapter = new DenoAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }) as unknown as {
      handle(event: unknown): Promise<PlatformResponse>;
      processRequest: (
        request: PlatformRequest,
        body: ArrayBuffer | null,
        res: MockResponse
      ) => Promise<void>;
    };

    adapter.processRequest = async (_request, body, res) => {
      expect(body).toBeNull();
      res.setHeader('X-Test', '1');
      res.writeHead(202, { 'X-Foo': 'bar' });
      res.write?.(Buffer.from('hi', 'utf-8'));
      res.end('');
      res.end('done');
    };

    const response = await adapter.handle(new Request('http://localhost/test', { method: 'GET' }));
    expect(response.statusCode).toBe(202);
    expect(response.headers['x-test']).toBe('1');
    expect(response.headers['X-Foo']).toBe('bar');
    expect(response.body).toBe('done');
    clearGlobalDeno();
  });

  it('handle should read request body for non-GET/HEAD methods', async () => {
    setGlobalDeno({ env: {} });
    const { DenoAdapter } = await importAdapter();
    const adapter = new DenoAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }) as unknown as {
      handle(event: unknown): Promise<PlatformResponse>;
      processRequest: (
        request: PlatformRequest,
        body: ArrayBuffer | null,
        res: MockResponse
      ) => Promise<void>;
    };

    adapter.processRequest = async (_request, body, res) => {
      expect(body).not.toBeNull();
      const text = Buffer.from(body as ArrayBuffer).toString('utf-8');
      expect(text).toBe('hello');

      res.writeHead(201);
      res.end('done');
    };

    const response = await adapter.handle(
      new Request('http://localhost/post', {
        method: 'POST',
        body: 'hello',
      })
    );

    expect(response.statusCode).toBe(201);
    expect(response.body).toBe('done');
    clearGlobalDeno();
  });

  it('handle should set 504 on timeout when processRequest hangs', async () => {
    vi.useFakeTimers();
    setGlobalDeno({ env: {} });
    const { DenoAdapter } = await importAdapter();
    const adapter = new DenoAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      timeout: 10,
    }) as unknown as {
      handle(event: unknown): Promise<PlatformResponse>;
      processRequest: (
        request: PlatformRequest,
        body: ArrayBuffer | null,
        res: MockResponse
      ) => Promise<void>;
    };

    let resolveHang: (() => void) | undefined;
    adapter.processRequest = async () =>
      await new Promise<void>((resolve) => {
        resolveHang = resolve;
      });

    const handlePromise = adapter.handle(new Request('http://localhost/test', { method: 'GET' }));
    await vi.advanceTimersByTimeAsync(10);
    resolveHang?.();

    const response = await handlePromise;
    expect(response.statusCode).toBe(504);

    vi.useRealTimers();
    clearGlobalDeno();
  });

  it('handle should include error message only when DENO_ENV is development', async () => {
    setGlobalDeno({
      env: {
        get: (key) => (key === 'DENO_ENV' ? 'development' : undefined),
      },
    });

    const { DenoAdapter } = await importAdapter();
    const adapter = new DenoAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }) as unknown as {
      handle(event: unknown): Promise<PlatformResponse>;
      processRequest: (
        request: PlatformRequest,
        body: ArrayBuffer | null,
        res: MockResponse
      ) => Promise<void>;
    };

    adapter.processRequest = async () => {
      throw new Error('boom');
    };

    const response = await adapter.handle(new Request('http://localhost/test', { method: 'GET' }));
    const body = JSON.parse(String(response.body));
    expect(body.details).toEqual({ message: 'boom' });

    setGlobalDeno({
      env: {
        get: (key) => (key === 'DENO_ENV' ? 'production' : undefined),
      },
    });
    const prod = new DenoAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }) as unknown as {
      handle(event: unknown): Promise<PlatformResponse>;
      processRequest: (
        request: PlatformRequest,
        body: ArrayBuffer | null,
        res: MockResponse
      ) => Promise<void>;
    };
    prod.processRequest = async () => {
      throw new Error('boom');
    };

    const prodResponse = await prod.handle(new Request('http://localhost/test', { method: 'GET' }));
    const prodBody = JSON.parse(String(prodResponse.body));
    expect(prodBody.details).toBeUndefined();
    clearGlobalDeno();
  });

  it('startServer should call Deno.serve with host/port and use handle + formatResponse', async () => {
    const serve = vi.fn(
      async (
        _opts: { port: number; hostname: string },
        handler: (req: Request) => Promise<Response>
      ) => {
        await handler(new Request('http://localhost/test', { method: 'GET' }));
      }
    );

    setGlobalDeno({ env: {}, serve });
    const { DenoAdapter } = await importAdapter();
    const adapter = new DenoAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const handleSpy = vi.spyOn(adapter, 'handle').mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': 'text/plain' },
      body: 'ok',
    });
    const formatSpy = vi
      .spyOn(adapter, 'formatResponse')
      .mockReturnValue(new Response('ok', { status: 200 }));

    await adapter.startServer(1234, '127.0.0.1');

    expect(serve).toHaveBeenCalledWith({ port: 1234, hostname: '127.0.0.1' }, expect.any(Function));
    expect(handleSpy).toHaveBeenCalledTimes(1);
    expect(formatSpy).toHaveBeenCalledTimes(1);
    clearGlobalDeno();
  });
});
