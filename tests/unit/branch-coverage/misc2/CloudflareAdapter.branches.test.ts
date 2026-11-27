import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  workersEnv: null as Record<string, unknown> | null,
  processEnv: undefined as Record<string, unknown> | undefined,
  setSource: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  logDetails: vi.fn(),
  dev: false,
  createMockHttpObjects: vi.fn(),
  errorResponse: vi.fn(),
}));

vi.mock('@config/cloudflare', () => ({
  Cloudflare: { getWorkersEnv: () => m.workersEnv },
}));

vi.mock('@config/env', () => ({
  Env: { setSource: (...args: unknown[]) => m.setSource(...args) },
  getProcessLike: () => (m.processEnv === undefined ? undefined : { env: m.processEnv }),
}));

vi.mock('@config/logger', () => ({
  Logger: {
    debug: (...args: unknown[]) => m.debug(...args),
    info: (...args: unknown[]) => m.info(...args),
    warn: (...args: unknown[]) => m.warn(...args),
    error: (...args: unknown[]) => m.error(...args),
  },
}));

vi.mock('@/config', () => ({
  appConfig: { isDevelopment: () => m.dev },
}));

vi.mock('@runtime/StartupErrorLogging', () => ({
  StartupErrorLogging: { logDetails: (...args: unknown[]) => m.logDetails(...args) },
}));

vi.mock('@runtime/RuntimeAdapter', () => ({
  createMockHttpObjects: (...args: unknown[]) => m.createMockHttpObjects(...args),
  ErrorResponse: {
    create: (...args: unknown[]) => {
      m.errorResponse(...args);
      return { toResponse: () => ({ errorResponse: true }) };
    },
  },
  HttpResponse: {
    create: () => {
      const response = {
        statusCode: 200,
        headers: {} as Record<string, string | string[]>,
        body: undefined as unknown,
        setStatus(status: number) {
          this.statusCode = status;
          return this;
        },
        setHeaders(headers: Record<string, string | string[]>) {
          this.headers = headers;
          return this;
        },
        setBody(body: unknown) {
          this.body = body;
          return this;
        },
        toResponse() {
          return { statusCode: response.statusCode, headers: response.headers, body: response.body };
        },
      };
      return response;
    },
  },
}));

import { CloudflareAdapter } from '@/runtime/adapters/CloudflareAdapter';
import type { PlatformRequest, PlatformResponse } from '@/runtime/RuntimeAdapter';

const makeEvent = (overrides: Partial<{
  method: string;
  url: string;
  headers: Headers;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
  signal: AbortSignal;
}> = {}) => ({
  method: overrides.method ?? 'GET',
  url: overrides.url ?? 'https://example.com/path?a=1&a=2&b=3',
  headers: overrides.headers ?? new Headers(),
  text: overrides.text ?? (async () => 'text-body'),
  arrayBuffer: overrides.arrayBuffer ?? (async () => new Uint8Array([1, 2, 3]).buffer),
  signal: overrides.signal ?? new AbortController().signal,
});

describe('CloudflareAdapter remaining branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.workersEnv = null;
    m.processEnv = undefined;
    m.dev = false;
    m.createMockHttpObjects.mockImplementation((request: PlatformRequest) => ({
      req: { method: request.method },
      res: {},
      responseData: { statusCode: 201, headers: {}, body: 'ok' },
    }));
    delete (globalThis as unknown as { env?: Record<string, unknown> }).env;
  });

  afterEach(() => {
    delete (globalThis as unknown as { env?: Record<string, unknown> }).env;
  });

  it('sets the env source only for Workers and merges process env when present', async () => {
    CloudflareAdapter.create({ handler: vi.fn() } as never);
    expect(m.setSource).not.toHaveBeenCalled();

    m.workersEnv = { DB: 'd1-binding', A: 'worker' };
    CloudflareAdapter.create({ handler: vi.fn() } as never);
    expect(m.setSource).toHaveBeenCalledTimes(1);
    const resolveSource = m.setSource.mock.calls[0]?.[0] as () => Record<string, unknown>;
    expect(resolveSource()).toEqual({ DB: 'd1-binding', A: 'worker' });

    m.processEnv = { A: 'process', B: 'only-process' };
    CloudflareAdapter.create({ handler: vi.fn() } as never);
    const merged = m.setSource.mock.calls[1]?.[0] as () => Record<string, unknown>;
    expect(merged()).toEqual({ A: 'worker', B: 'only-process', DB: 'd1-binding' });
  });

  it('uses the configured logger or the default logger with optional data', () => {
    const configured = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const withLogger = CloudflareAdapter.create({ logger: configured } as never);
    expect(withLogger.getLogger()).toBe(configured);

    const adapter = CloudflareAdapter.create({} as never);
    const logger = adapter.getLogger();
    logger.debug('d');
    logger.info('i', undefined);
    logger.warn('w', null);
    logger.error('e');
    logger.error('e2', new Error('boom'));
    expect(m.debug).toHaveBeenCalledWith('[Cloudflare] d', '');
    expect(m.info).toHaveBeenCalledWith('[Cloudflare] i', '');
    expect(m.warn).toHaveBeenCalledWith('[Cloudflare] w', '');
    expect(m.error).toHaveBeenCalledWith('[Cloudflare] e', undefined);
    expect(m.error).toHaveBeenCalledWith('[Cloudflare] e2', 'boom');
  });

  it('reads global bindings and environment defaults', () => {
    const adapter = CloudflareAdapter.create({} as never);
    expect(CloudflareAdapter.getD1Database()).toBeNull();
    expect(CloudflareAdapter.getKV('KV')).toBeNull();

    (globalThis as unknown as { env: Record<string, unknown> }).env = {
      DB: { prepare: vi.fn() },
      KV: { get: vi.fn() },
      ENVIRONMENT: 'staging',
      DB_CONNECTION: 'postgres',
    };
    expect(CloudflareAdapter.getD1Database()).toBeDefined();
    expect(CloudflareAdapter.getKV('KV')).toBeDefined();
    expect(adapter.getEnvironment()).toMatchObject({
      nodeEnv: 'staging',
      runtime: 'cloudflare',
      dbConnection: 'postgres',
      dbHost: undefined,
      dbPort: undefined,
    });

    delete (globalThis as unknown as { env?: Record<string, unknown> }).env;
    expect(adapter.getEnvironment()).toMatchObject({
      nodeEnv: 'production',
      dbConnection: 'd1',
    });
    expect(adapter.supportsPersistentConnections()).toBe(false);
  });

  it('parses request headers, repeated query params and remote address', () => {
    const adapter = CloudflareAdapter.create({} as never);
    const headers = new Headers({ 'CF-Connecting-IP': '203.0.113.5' });
    const parsed = adapter.parseRequest(
      makeEvent({ url: 'https://example.com/p?a=1&a=2&a=3&b=x', headers }) as never
    );

    expect(parsed.method).toBe('GET');
    expect(parsed.path).toBe('/p');
    expect(parsed.query).toEqual({ a: ['1', '2', '3'], b: 'x' });
    expect(parsed.remoteAddr).toBe('203.0.113.5');

    const noIp = adapter.parseRequest(makeEvent({ url: 'https://example.com/' }) as never);
    expect(noIp.remoteAddr).toBe('0.0.0.0');
    expect(noIp.query).toEqual({});
  });

  it('reads GET/HEAD, multipart and text request bodies', async () => {
    const handler = vi.fn();
    const adapter = CloudflareAdapter.create({ handler } as never);

    const get = makeEvent({ method: 'GET', text: vi.fn(async () => 'ignored') });
    await adapter.handle(get as never);
    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      null
    );

    handler.mockClear();
    const head = makeEvent({ method: 'HEAD' });
    await adapter.handle(head as never);
    expect(handler).toHaveBeenCalledWith(expect.anything(), expect.anything(), null);

    handler.mockClear();
    const multipart = makeEvent({
      method: 'POST',
      headers: new Headers({ 'content-type': 'multipart/form-data; boundary=x' }),
    });
    await adapter.handle(multipart as never);
    expect(Buffer.isBuffer(handler.mock.calls[0]?.[2])).toBe(true);

    handler.mockClear();
    const arrayHeaders = makeEvent({
      method: 'POST',
      headers: new Headers(),
    });
    const parsedWithArrayHeaders = adapter.parseRequest(arrayHeaders as never);
    await expect(
      adapter.handle(
        Object.assign(arrayHeaders, {
          headers: { forEach: (cb: (value: string, key: string) => void) => cb('a', 'content-type') },
        }) as never
      )
    ).resolves.toBeDefined();
    expect(parsedWithArrayHeaders.headers['content-type']).toBeUndefined();
  });

  it('logs handler errors with and without a stack and respects dev mode', async () => {
    const adapter = CloudflareAdapter.create({
      handler: vi.fn(async () => {
        throw Object.assign(new Error('boom'), { stack: 'stack-trace' });
      }),
    } as never);

    const withStack = await adapter.handle(makeEvent() as never);
    expect(withStack).toEqual({ errorResponse: true });
    expect(m.logDetails).toHaveBeenCalled();
    expect(m.error).toHaveBeenCalledWith('Cloudflare handler stack', 'stack-trace');
    expect(m.errorResponse).toHaveBeenCalledWith(500, 'Internal Server Error', undefined);

    m.dev = true;
    const withoutStack = CloudflareAdapter.create({
      handler: vi.fn(async () => {
        throw new Error('no stack');
      }),
    } as never);
    (withoutStack as { parseRequest: () => never }).parseRequest = () => {
      const error = new Error('parse failed');
      error.stack = '';
      throw error;
    };
    await withoutStack.handle(makeEvent() as never);
    expect(m.errorResponse).toHaveBeenCalledWith(500, 'Internal Server Error', {
      message: 'parse failed',
    });
  });

  it('formats array headers, string/stream bodies and null-body status codes', async () => {
    const adapter = CloudflareAdapter.create({} as never);
    const format = (response: Partial<PlatformResponse>) =>
      adapter.formatResponse({
        statusCode: 200,
        headers: {},
        ...response,
      } as PlatformResponse);

    const arrayHeaders = format({
      headers: { 'x-multi': ['a', 'b'], 'x-single': 'c' },
      body: 'hello',
    });
    expect((arrayHeaders as any).headers.get('x-multi')).toBe('a, b');
    expect((arrayHeaders as any).headers.get('x-single')).toBe('c');
    expect((arrayHeaders as any).status).toBe(200);

    expect((format as any)({ statusCode: 204, body: 'ignored' }).body).toBeNull();
    expect((format as any)({ statusCode: 304, body: 'ignored' }).body).toBeNull();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    });
    expect((format as any)({ body: stream }).body).not.toBeNull();

    const streamLike = { constructor: { name: 'ReadableStream' }, toString: () => 'stream-like' };
    expect((format as any)({ body: streamLike }).body).not.toBeNull();

    expect(await (format as any)({ body: 42 }).text()).toBe('42');
    expect((format as any)({ body: null }).body).toBeNull();
  });
});
