import type { CloudflareRequest } from '@/runtime/adapters/CloudflareAdapter';
import type { AdapterConfig, PlatformResponse } from '@/runtime/RuntimeAdapter';
import { describe, expect, it, vi } from 'vitest';

const envState = vi.hoisted(() => ({ nodeEnv: 'test' }));

const loggerState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@config/env', () => ({
  Env: {
    get NODE_ENV(): string {
      return envState.nodeEnv;
    },
  },
}));

vi.mock('@config/logger', () => ({
  Logger: loggerState,
  default: loggerState,
}));

async function importAdapter(): Promise<{
  CloudflareAdapter: new (config: AdapterConfig) => {
    platform: 'cloudflare';
    handle(event: unknown): Promise<PlatformResponse>;
    parseRequest(event: CloudflareRequest): {
      method: string;
      path: string;
      headers: Record<string, string | string[]>;
      query?: Record<string, string | string[]>;
      remoteAddr?: string;
    };
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
    getD1Database(): unknown;
    getKV(namespace: string): unknown;
  };
}> {
  return import('@/runtime/adapters/CloudflareAdapter');
}

function getGlobalEnvRef(): { env?: Record<string, unknown> } {
  return globalThis as unknown as { env?: Record<string, unknown> };
}

describe('CloudflareAdapter', () => {
  it('should identify as cloudflare platform', async () => {
    const { CloudflareAdapter } = await importAdapter();
    const adapter = new CloudflareAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    expect(adapter.platform).toBe('cloudflare');
  });

  it('supportsPersistentConnections should be false', async () => {
    const { CloudflareAdapter } = await importAdapter();
    const adapter = new CloudflareAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    expect(adapter.supportsPersistentConnections()).toBe(false);
  });

  it('parseRequest should default remoteAddr without cf header', async () => {
    const { CloudflareAdapter } = await importAdapter();
    const adapter = new CloudflareAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const request = new Request('http://localhost/path?query=1', {
      method: 'GET',
      headers: { 'X-Custom': 'value' },
    });

    const parsed = adapter.parseRequest(request as unknown as CloudflareRequest);
    expect(parsed.method).toBe('GET');
    expect(parsed.path).toBe('/path');
    expect(parsed.query).toEqual({ query: '1' });
    expect(parsed.remoteAddr).toBe('0.0.0.0');
  });

  it('formatResponse should handle array headers and Buffer body', async () => {
    const { CloudflareAdapter } = await importAdapter();
    const adapter = new CloudflareAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const response = adapter.formatResponse({
      statusCode: 201,
      headers: {
        'set-cookie': ['a=1', 'b=2'],
        'content-type': 'text/plain',
      },
      body: Buffer.from('hello', 'utf-8'),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(response.headers.get('set-cookie')).toBe('a=1, b=2');
  });

  it('formatResponse should handle nullish body', async () => {
    const { CloudflareAdapter } = await importAdapter();
    const adapter = new CloudflareAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const response = adapter.formatResponse({
      statusCode: 200,
      headers: { 'content-type': 'text/plain' },
      body: null,
    });

    await expect(response.text()).resolves.toBe('');
  });

  it('formatResponse should passthrough string body', async () => {
    const { CloudflareAdapter } = await importAdapter();
    const adapter = new CloudflareAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const response = adapter.formatResponse({
      statusCode: 200,
      headers: { 'content-type': 'text/plain' },
      body: 'hello',
    });

    await expect(response.text()).resolves.toBe('hello');
  });

  it('getLogger should return provided logger', async () => {
    const { CloudflareAdapter } = await importAdapter();
    const configLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const adapter = new CloudflareAdapter({
      handler: async () => undefined,
      logger: configLogger,
    });

    const logger = adapter.getLogger();
    logger.info('hello', { ok: true });
    expect(configLogger.info).toHaveBeenCalledWith('hello', { ok: true });
  });

  it('getLogger should fall back to global Logger when internal logger is missing', async () => {
    const { CloudflareAdapter } = await importAdapter();
    const adapter = new CloudflareAdapter({
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

    expect(loggerState.debug).toHaveBeenCalledWith('[Cloudflare] d');
    expect(loggerState.info).toHaveBeenCalledWith('[Cloudflare] i');
    expect(loggerState.warn).toHaveBeenCalledWith('[Cloudflare] w');
    expect(loggerState.error).toHaveBeenCalledWith('[Cloudflare] e', 'x');
  });

  it('getEnvironment/getD1Database/getKV should read globalThis.env with defaults', async () => {
    const { CloudflareAdapter } = await importAdapter();
    const adapter = new CloudflareAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const globalEnvRef = getGlobalEnvRef();
    const previous = globalEnvRef.env;
    delete globalEnvRef.env;

    const env = adapter.getEnvironment();
    expect(env.nodeEnv).toBe('production');
    expect(env.runtime).toBe('cloudflare');
    expect(env.dbConnection).toBe('d1');
    expect(adapter.getD1Database()).toBeNull();
    expect(adapter.getKV('SOME_NAMESPACE')).toBeNull();

    globalEnvRef.env = previous;
  });

  it('getEnvironment/getD1Database/getKV should return values from globalThis.env', async () => {
    const { CloudflareAdapter } = await importAdapter();
    const adapter = new CloudflareAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const globalEnvRef = getGlobalEnvRef();
    const previous = globalEnvRef.env;
    globalEnvRef.env = {
      ENVIRONMENT: 'staging',
      DB_CONNECTION: 'd1',
      DB: { kind: 'd1' },
      MY_KV: { kind: 'kv' },
    };

    const env = adapter.getEnvironment();
    expect(env.nodeEnv).toBe('staging');
    expect(env.dbConnection).toBe('d1');
    expect(adapter.getD1Database()).toEqual({ kind: 'd1' });
    expect(adapter.getKV('MY_KV')).toEqual({ kind: 'kv' });

    globalEnvRef.env = previous;
  });

  it('handle should pass null body for GET and HEAD', async () => {
    const { CloudflareAdapter } = await importAdapter();

    const handler = vi.fn(async (_req: unknown, _res: unknown, body: Buffer | null) => {
      expect(body).toBeNull();
    });

    const adapter = new CloudflareAdapter({
      handler: handler as unknown as AdapterConfig['handler'],
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await adapter.handle(new Request('http://localhost/test', { method: 'GET' }));
    await adapter.handle(new Request('http://localhost/test', { method: 'HEAD' }));
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('handle should read body for non-GET/HEAD methods', async () => {
    const { CloudflareAdapter } = await importAdapter();

    const handler = vi.fn(async (_req: unknown, _res: unknown, body: Buffer | null) => {
      expect(body?.toString('utf-8')).toBe(JSON.stringify({ test: true }));
    });

    const adapter = new CloudflareAdapter({
      handler: handler as unknown as AdapterConfig['handler'],
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const response = await adapter.handle(
      new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      })
    );

    expect(response.statusCode).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('handle should exercise mock res writeHead/end/write branches', async () => {
    const { CloudflareAdapter } = await importAdapter();

    const handler = vi.fn(async (_req: unknown, res: unknown) => {
      const serverRes = res as {
        writeHead: (statusCode: number, headers?: Record<string, string | string[]>) => unknown;
        write: (chunk: string | Buffer) => boolean;
        end: (chunk?: string | Buffer) => unknown;
      };

      serverRes.writeHead(201);
      serverRes.write(Buffer.from('hi', 'utf-8'));
      serverRes.end();
    });

    const adapter = new CloudflareAdapter({
      handler: handler as unknown as AdapterConfig['handler'],
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const response = await adapter.handle(new Request('http://localhost/test', { method: 'GET' }));
    expect(response.statusCode).toBe(201);
    expect(response.body).toBeInstanceOf(Buffer);
  });

  it('handle should merge headers and set body via res.end(chunk)', async () => {
    const { CloudflareAdapter } = await importAdapter();

    const handler = vi.fn(async (_req: unknown, res: unknown) => {
      const serverRes = res as {
        writeHead: (statusCode: number, headers?: Record<string, string | string[]>) => unknown;
        end: (chunk?: string | Buffer) => unknown;
      };

      serverRes.writeHead(202, { 'x-test': '1' });
      serverRes.end('done');
    });

    const adapter = new CloudflareAdapter({
      handler: handler as unknown as AdapterConfig['handler'],
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const response = await adapter.handle(new Request('http://localhost/test', { method: 'GET' }));
    expect(response.statusCode).toBe(202);
    expect(response.headers['x-test']).toBe('1');
    expect(response.body).toBe('done');
  });

  it('handle should set 504 on timeout path', async () => {
    vi.useFakeTimers();

    const { CloudflareAdapter } = await importAdapter();

    let resolveHandler: (() => void) | undefined;
    const handler = vi.fn(
      async () =>
        await new Promise<void>((resolve) => {
          resolveHandler = resolve;
        })
    );

    const adapter = new CloudflareAdapter({
      handler: handler as unknown as AdapterConfig['handler'],
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const handlePromise = adapter.handle(new Request('http://localhost/test', { method: 'GET' }));
    await vi.advanceTimersByTimeAsync(30000);

    resolveHandler?.();
    await expect(handlePromise).resolves.toEqual(
      expect.objectContaining({
        statusCode: 504,
      })
    );

    vi.useRealTimers();
  });

  it('handle should include error message in development but omit in production', async () => {
    const { CloudflareAdapter } = await importAdapter();
    const baseLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    envState.nodeEnv = 'development';
    const devAdapter = new CloudflareAdapter({
      handler: vi.fn().mockRejectedValue(new Error('Test error')),
      logger: baseLogger,
    });
    const devResponse = await devAdapter.handle(
      new Request('http://localhost/test', { method: 'GET' })
    );
    const devBody = JSON.parse(String(devResponse.body));
    expect(devBody.details).toEqual({ message: 'Test error' });

    envState.nodeEnv = 'production';
    const prodAdapter = new CloudflareAdapter({
      handler: vi.fn().mockRejectedValue(new Error('Test error')),
      logger: baseLogger,
    });
    const prodResponse = await prodAdapter.handle(
      new Request('http://localhost/test', { method: 'GET' })
    );
    const prodBody = JSON.parse(String(prodResponse.body));
    expect(prodBody.details).toBeUndefined();
  });

  it('default logger should stringify data and handle nullish data', async () => {
    const { CloudflareAdapter } = await importAdapter();

    const adapter = new CloudflareAdapter({
      handler: async () => undefined,
      // no logger => createDefaultLogger()
    });

    const logger = adapter.getLogger();
    logger.debug('a', { ok: true });
    logger.debug('a2');
    logger.info('b');
    logger.info('b2', { ok: false });
    logger.warn('c', null);
    logger.warn('c2', { ok: 1 });
    logger.error('d', new Error('x'));

    expect(loggerState.debug).toHaveBeenCalledWith('[Cloudflare] a', JSON.stringify({ ok: true }));
    expect(loggerState.debug).toHaveBeenCalledWith('[Cloudflare] a2', '');
    expect(loggerState.info).toHaveBeenCalledWith('[Cloudflare] b', '');
    expect(loggerState.info).toHaveBeenCalledWith('[Cloudflare] b2', JSON.stringify({ ok: false }));
    expect(loggerState.warn).toHaveBeenCalledWith('[Cloudflare] c', '');
    expect(loggerState.warn).toHaveBeenCalledWith('[Cloudflare] c2', JSON.stringify({ ok: 1 }));
    expect(loggerState.error).toHaveBeenCalledWith('[Cloudflare] d', 'x');
  });
});
