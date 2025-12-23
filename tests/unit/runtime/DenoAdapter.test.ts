import { describe, expect, it } from 'vitest';

import { DenoAdapter } from '@/runtime/adapters/DenoAdapter';

describe('DenoAdapter', () => {
  it('should identify as deno platform', () => {
    const adapter = DenoAdapter.create({
      handler: async () => undefined,
    });

    expect(adapter.platform).toBe('deno');
  });

  it('supportsPersistentConnections should be false', () => {
    const adapter = DenoAdapter.create({
      handler: async () => undefined,
    });

    expect(adapter.supportsPersistentConnections()).toBe(false);
  });

  it('parseRequest should normalize headers/query/remoteAddr', () => {
    const adapter = DenoAdapter.create({
      handler: async () => undefined,
    });

    const req = {
      method: 'GET',
      url: 'https://example.test/hello?x=1&y=2',
      headers: new Headers({ 'X-Forwarded-For': '1.2.3.4, 5.6.7.8' }),
    } as unknown as Request;

    const parsed = adapter.parseRequest(req);
    expect(parsed.method).toBe('GET');
    expect(parsed.path).toBe('/hello');
    expect(parsed.query).toEqual({ x: '1', y: '2' });
    expect(parsed.headers['x-forwarded-for']).toBe('1.2.3.4, 5.6.7.8');
    expect(parsed.remoteAddr).toBe('1.2.3.4'); //NOSONAR
  });

  it('formatResponse should handle string and array headers', async () => {
    const adapter = DenoAdapter.create({
      handler: async () => undefined,
    });

    const res = adapter.formatResponse({
      statusCode: 200,
      headers: {
        'content-type': 'text/plain',
        'set-cookie': ['a=1', 'b=2'],
      },
      body: 'ok',
    });

    expect(res).toBeInstanceOf(Response);
    const response = res as Response;
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(await response.text()).toBe('ok');
  });

  it('handle should process GET without reading body', async () => {
    const adapter = DenoAdapter.create({
      handler: async (_req, res, body) => {
        expect(body).toBeNull();
        (res as unknown as { writeHead: (code: number) => void }).writeHead(204);
        (res as unknown as { end: () => void }).end();
      },
    });

    const event = {
      method: 'GET',
      url: 'https://example.test/empty',
      headers: new Headers(),
      arrayBuffer: async () => {
        throw new Error('should not be called');
      },
    } as unknown as Request;

    const result = await adapter.handle(event);
    expect(result.statusCode).toBe(204);
  });

  it('handle should read body for POST and pass Buffer to handler', async () => {
    const adapter = DenoAdapter.create({
      handler: async (_req, res, body) => {
        expect(body?.toString('utf-8')).toBe('hi');
        (res as unknown as { writeHead: (code: number) => void }).writeHead(201);
        (res as unknown as { end: (chunk: string) => void }).end('done');
      },
    });

    const bytes = new TextEncoder().encode('hi');
    const event = {
      method: 'POST',
      url: 'https://example.test/create',
      headers: new Headers(),
      arrayBuffer: async () => bytes.buffer,
    } as unknown as Request;

    const result = await adapter.handle(event);
    expect(result.statusCode).toBe(201);
    expect(String(result.body)).toBe('done');
  });

  it('getEnvironment should return defaults when Deno is undefined', () => {
    (globalThis as unknown as { Deno?: unknown }).Deno = undefined;

    const adapter = DenoAdapter.create({
      handler: async () => undefined,
    });

    const env = adapter.getEnvironment();
    expect(env.runtime).toBe('deno');
    expect(env.nodeEnv).toBe('production');
    expect(env.dbConnection).toBe('postgresql');
  });

  it('getEnvironment should read from Deno.env.toObject when available', () => {
    (
      globalThis as unknown as {
        Deno?: { env?: { toObject?: () => Record<string, string> } };
      }
    ).Deno = {
      env: {
        toObject: () => ({
          DENO_ENV: 'development',
          DB_CONNECTION: 'sqlite',
          DB_HOST: 'db',
          DB_PORT: '1234',
        }),
      },
    };

    const adapter = DenoAdapter.create({
      handler: async () => undefined,
    });

    const env = adapter.getEnvironment();
    expect(env.nodeEnv).toBe('development');
    expect(env.dbConnection).toBe('sqlite');
    expect(env.dbHost).toBe('db');
    expect(env.dbPort).toBe(1234);
  });

  it('handle should return ErrorResponse and include details in DENO_ENV=development', async () => {
    (
      globalThis as unknown as {
        Deno?: { env?: { get?: (key: string) => string | undefined } };
      }
    ).Deno = {
      env: {
        get: (key: string) => (key === 'DENO_ENV' ? 'development' : undefined),
      },
    };

    const adapter = DenoAdapter.create({
      handler: async () => {
        throw new Error('boom');
      },
    });

    const event = {
      method: 'GET',
      url: 'https://example.test/err',
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Request;

    const result = await adapter.handle(event);
    expect(result.statusCode).toBe(500);
    const parsed = JSON.parse(String(result.body));
    expect(parsed.error).toBe('Internal Server Error');
    expect(parsed.details?.message).toBe('boom');
  });

  it('getEnvVar should return default when missing', () => {
    (
      globalThis as unknown as { Deno?: { env?: { get?: (key: string) => string | undefined } } }
    ).Deno = {
      env: { get: () => undefined },
    };
    const value = DenoAdapter.getEnvVar('NO_SUCH_KEY', 'fallback');
    expect(value).toBe('fallback');
  });

  it('isDeployEnvironment should be false in Node tests', () => {
    (globalThis as unknown as { Deno?: { mainModule?: string } }).Deno = {
      mainModule: 'file:///main.ts',
    };
    expect(DenoAdapter.isDeployEnvironment()).toBe(false);
  });

  it('getKV should return undefined when Deno.openKv missing', async () => {
    (globalThis as unknown as { Deno?: { openKv: (() => Promise<unknown>) | undefined } }).Deno = {
      openKv: undefined,
    };
    const kv = await DenoAdapter.getKV();
    expect(kv).toBeUndefined();
  });
});
