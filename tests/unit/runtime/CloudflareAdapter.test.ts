import { beforeEach, describe, expect, it, vi } from 'vitest';

let CloudflareAdapter: typeof import('@/runtime/adapters/CloudflareAdapter').CloudflareAdapter;

beforeEach(async () => {
  vi.resetModules();
  CloudflareAdapter = (await import('@/runtime/adapters/CloudflareAdapter')).CloudflareAdapter;
});

describe('CloudflareAdapter', () => {
  it('should identify as cloudflare platform', () => {
    const adapter = CloudflareAdapter.create({
      handler: async () => undefined,
    });

    expect(adapter.platform).toBe('cloudflare');
  });

  it('supportsPersistentConnections should be false', () => {
    const adapter = CloudflareAdapter.create({
      handler: async () => undefined,
    });

    expect(adapter.supportsPersistentConnections()).toBe(false);
  });

  it('parseRequest should use cf-connecting-ip when present', () => {
    const adapter = CloudflareAdapter.create({
      handler: async () => undefined,
    });

    const req = {
      method: 'GET',
      url: 'https://example.test/cf?a=1',
      headers: new Headers({ 'cf-connecting-ip': '192.168.0.1' }), //NOSONAR
      body: null,
    } as unknown as import('@/runtime/adapters/CloudflareAdapter').CloudflareRequest;

    const parsed = adapter.parseRequest(req);
    expect(parsed.path).toBe('/cf');
    expect(parsed.query).toEqual({ a: '1' });
    expect(parsed.remoteAddr).toBe('192.168.0.1'); //NOSONAR
  });

  it('formatResponse should append array headers and stringify body', async () => {
    const adapter = CloudflareAdapter.create({
      handler: async () => undefined,
    });

    const response = adapter.formatResponse({
      statusCode: 200,
      headers: { 'set-cookie': ['a=1', 'b=2'], 'content-type': 'text/plain' },
      body: Buffer.from('ok'),
    }) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(await response.text()).toBe('ok');
  });

  it('handle should process request and return normalized PlatformResponse', async () => {
    const adapter = CloudflareAdapter.create({
      handler: async (_req, res) => {
        (
          res as unknown as { writeHead: (code: number, headers?: Record<string, string>) => void }
        ).writeHead(201, { 'Content-Type': 'text/plain' });
        (res as unknown as { end: (chunk: string) => void }).end('done');
      },
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    const event = {
      method: 'POST',
      url: 'https://example.test/cf',
      headers: new Headers({ 'cf-connecting-ip': '1.1.1.1' }), //NOSONAR
      text: async () => 'hello',
      body: null,
    } as unknown as import('@/runtime/adapters/CloudflareAdapter').CloudflareRequest;

    const result = await adapter.handle(event);
    expect(result.statusCode).toBe(201);
    expect(String(result.body)).toBe('done');
  });

  it('handle should read multipart bodies as a binary Buffer (not text)', async () => {
    let receivedBody: unknown;
    const adapter = CloudflareAdapter.create({
      handler: async (req, res) => {
        receivedBody = (req as unknown as { body?: unknown }).body;
        (res as unknown as { end: (chunk: string) => void }).end('ok');
      },
    });

    const multipart = Buffer.from('--Bd\r\nbinary\x00bytes\r\n--Bd--\r\n');
    const textSpy = vi.fn(async () => 'should-not-be-called');
    const event = {
      method: 'POST',
      url: 'https://example.test/upload',
      headers: new Headers({ 'content-type': 'multipart/form-data; boundary=Bd' }),
      text: textSpy,
      arrayBuffer: async () =>
        multipart.buffer.slice(multipart.byteOffset, multipart.byteOffset + multipart.byteLength),
      body: null,
    } as unknown as import('@/runtime/adapters/CloudflareAdapter').CloudflareRequest;

    await adapter.handle(event);

    expect(textSpy).not.toHaveBeenCalled();
    expect(Buffer.isBuffer(receivedBody)).toBe(true);
    expect((receivedBody as Buffer).equals(multipart)).toBe(true);
  });

  it('handle should preserve status set through the framework response wrapper', async () => {
    const adapter = CloudflareAdapter.create({
      handler: async (_req, res) => {
        const { Response } = await import('@/http/Response');
        const wrapped = Response.create(res as any);
        wrapped.setStatus(403);
        wrapped.json({ message: 'Unauthorized', status: 403, ty: 'OT' });
      },
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    const event = {
      method: 'GET',
      url: 'https://example.test/protected',
      headers: new Headers(),
      text: async () => '',
      body: null,
    } as unknown as import('@/runtime/adapters/CloudflareAdapter').CloudflareRequest;

    const result = await adapter.handle(event);
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(String(result.body))).toEqual({
      message: 'Unauthorized',
      status: 403,
      ty: 'OT',
    });
  });

  it('getD1Database/getKV should read from globalThis.env', () => {
    (globalThis as unknown as { env?: Record<string, unknown> }).env = {
      DB: { kind: 'd1' },
      MY_NAMESPACE: { kind: 'kv' },
    };

    expect(CloudflareAdapter.getD1Database()).toEqual({ kind: 'd1' });
    expect(CloudflareAdapter.getKV('MY_NAMESPACE')).toEqual({ kind: 'kv' });

    (globalThis as unknown as { env?: Record<string, unknown> }).env = undefined;
  });

  it('getEnvironment should return cloudflare defaults', () => {
    const adapter = CloudflareAdapter.create({
      handler: async () => undefined,
    });

    const env = adapter.getEnvironment();
    expect(env.runtime).toBe('cloudflare');
    expect(typeof env.nodeEnv).toBe('string');
    expect(typeof env.dbConnection).toBe('string');
  });

  it('sets packed worker env values on the shared Env facade', async () => {
    (globalThis as unknown as { env?: Record<string, unknown> }).env = {
      USE_PACK: 'true',
      PACK_KEYS: 'K1',
      K1: JSON.stringify({ APP_NAME: 'Packed Worker App', JWT_SECRET: 'worker-secret' }),
      APP_NAME: 'Direct Worker App',
    };

    CloudflareAdapter.create({
      handler: async () => undefined,
    });

    const { Env } = await import('@/config/env');
    expect(Env.get('APP_NAME')).toBe('Direct Worker App');
    expect(Env.get('JWT_SECRET')).toBe('worker-secret');
    expect(Env.getSourceOf('JWT_SECRET')).toBe('K1');

    (globalThis as unknown as { env?: Record<string, unknown> }).env = undefined;
  });

  it('handle should include error details when NODE_ENV=development', async () => {
    process.env.NODE_ENV = 'development';
    vi.resetModules();
    const CF = (await import('@/runtime/adapters/CloudflareAdapter')).CloudflareAdapter;

    const adapter = CF.create({
      handler: async () => {
        throw new Error('boom');
      },
    });

    const event = {
      method: 'GET',
      url: 'https://example.test/cf-err',
      headers: new Headers(),
      text: async () => '',
      body: null,
    } as unknown as import('@/runtime/adapters/CloudflareAdapter').CloudflareRequest;

    const result = await adapter.handle(event);
    expect(result.statusCode).toBe(500);
    const parsed = JSON.parse(String(result.body));
    expect(parsed.error).toBe('Internal Server Error');
    expect(parsed.details?.message).toBe('boom');
  });

  it('formatResponse should force null body for null-body status codes (204, 205, 304)', () => {
    const adapter = CloudflareAdapter.create({
      handler: async () => undefined,
    });

    // Note: 101 (Switching Protocols) is not valid for Response constructor (200-599 range)
    const nullBodyStatuses = [204, 205, 304];
    nullBodyStatuses.forEach((statusCode) => {
      const response = adapter.formatResponse({
        statusCode,
        headers: {},
        body: '', // Empty string should be forced to null for these statuses
      }) as Response;

      expect(response.status).toBe(statusCode);
      expect(response.body).toBeNull();
    });
  });

  it('formatResponse should allow body for non-null-body status codes', () => {
    const adapter = CloudflareAdapter.create({
      handler: async () => undefined,
    });

    const response = adapter.formatResponse({
      statusCode: 200,
      headers: { 'content-type': 'text/plain' },
      body: 'hello',
    }) as Response;

    expect(response.status).toBe(200);
    expect(response.body).not.toBeNull();
  });
});
