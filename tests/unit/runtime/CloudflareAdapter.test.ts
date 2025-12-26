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
});
