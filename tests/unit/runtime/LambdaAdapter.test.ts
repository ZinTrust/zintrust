import type { AdapterConfig, PlatformRequest, PlatformResponse } from '@/runtime/RuntimeAdapter';
import { describe, expect, it, vi } from 'vitest';

const loggerState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const envState = vi.hoisted(() => ({
  NODE_ENV: 'test',
  DB_CONNECTION: 'sqlite',
  DB_HOST: 'localhost',
  DB_PORT: 1234,
}));

vi.mock('@config/logger', () => ({
  Logger: loggerState,
}));

vi.mock('@config/env', () => ({
  Env: envState,
}));

async function importAdapter(): Promise<typeof import('@/runtime/adapters/LambdaAdapter')> {
  return import('@/runtime/adapters/LambdaAdapter');
}

describe('LambdaAdapter', () => {
  it('should identify as lambda platform', async () => {
    const { LambdaAdapter } = await importAdapter();
    const adapter = LambdaAdapter.create({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    expect(adapter.platform).toBe('lambda');
  });

  it('getLogger should use provided logger', async () => {
    const { LambdaAdapter } = await importAdapter();
    const configLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const adapter = LambdaAdapter.create({
      handler: async () => undefined,
      logger: configLogger,
    });

    const logger = adapter.getLogger();
    logger.info('test');
    expect(configLogger.info).toHaveBeenCalledWith('test');
    expect(loggerState.info).not.toHaveBeenCalled();
  });

  it('getLogger should fall back when internal logger missing', async () => {
    const { LambdaAdapter } = await importAdapter();
    const adapter = LambdaAdapter.create({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }) as unknown as { getLogger: () => any; logger?: unknown };

    adapter.logger = undefined;
    const fallback = adapter.getLogger() as {
      debug: (msg: string) => void;
      info: (msg: string) => void;
      warn: (msg: string) => void;
      error: (msg: string, err?: Error) => void;
    };

    fallback.debug('d');
    fallback.info('i');
    fallback.warn('w');
    fallback.error('e', new Error('x'));

    expect(loggerState.debug).toHaveBeenCalledWith('[Lambda] d');
    expect(loggerState.info).toHaveBeenCalledWith('[Lambda] i');
    expect(loggerState.warn).toHaveBeenCalledWith('[Lambda] w');
    expect(loggerState.error).toHaveBeenCalledWith('[Lambda] e', 'x');
  });

  it('default logger should stringify data and handle undefined', async () => {
    const { LambdaAdapter } = await importAdapter();
    const adapter = LambdaAdapter.create({
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

    expect(loggerState.debug).toHaveBeenCalledWith('[Lambda] a', JSON.stringify({ ok: true }));
    expect(loggerState.debug).toHaveBeenCalledWith('[Lambda] a2', '');
    expect(loggerState.info).toHaveBeenCalledWith('[Lambda] b', '');
    expect(loggerState.info).toHaveBeenCalledWith('[Lambda] b2', JSON.stringify({ ok: false }));
    expect(loggerState.warn).toHaveBeenCalledWith('[Lambda] c', '');
    expect(loggerState.warn).toHaveBeenCalledWith('[Lambda] c2', 'null');
    expect(loggerState.error).toHaveBeenCalledWith('[Lambda] d', 'x');
  });

  it('supportsPersistentConnections and getEnvironment should work', async () => {
    const { LambdaAdapter } = await importAdapter();
    const adapter = LambdaAdapter.create({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    expect(adapter.supportsPersistentConnections()).toBe(true);
    expect(adapter.getEnvironment()).toEqual({
      nodeEnv: 'test',
      runtime: 'lambda',
      dbConnection: 'sqlite',
      dbHost: 'localhost',
      dbPort: 1234,
    });
  });

  it('parseRequest should support API Gateway v1 and normalize headers + remoteAddr', async () => {
    const { LambdaAdapter } = await importAdapter();
    const adapter = LambdaAdapter.create({ handler: async () => undefined });

    const v1 = {
      httpMethod: 'get',
      path: '/v1',
      headers: { 'X-Forwarded-For': '192.0.2.1, 192.0.2.2', 'Content-Type': 'text/plain' },
      queryStringParameters: { a: '1' },
      body: 'hello',
    };

    const request = adapter.parseRequest(v1);
    expect(request.method).toBe('GET');
    expect(request.path).toBe('/v1');
    expect(request.headers['content-type']).toBe('text/plain');
    expect(request.remoteAddr).toBe('192.0.2.1');
    expect(Buffer.isBuffer(request.body)).toBe(true);
    expect((request.body as Buffer).toString('utf-8')).toBe('hello');
  });

  it('parseRequest should support API Gateway v2 remoteAddr fallbacks', async () => {
    const { LambdaAdapter } = await importAdapter();
    const adapter = LambdaAdapter.create({ handler: async () => undefined });

    const v2a = {
      requestContext: { http: { method: 'POST', sourceIp: '127.0.0.1' } },
      rawPath: '/v2',
      headers: { 'x-forwarded-for': '198.51.100.1' },
      queryStringParameters: {},
      body: null,
    };
    expect(adapter.parseRequest(v2a).remoteAddr).toBe('127.0.0.1');

    const v2b = {
      requestContext: { http: { method: 'POST', sourceIp: '' } },
      rawPath: '/v2',
      headers: { 'x-forwarded-for': '198.51.100.1, 198.51.100.2' },
      queryStringParameters: undefined,
      body: null,
    };
    expect(adapter.parseRequest(v2b).remoteAddr).toBe('198.51.100.1');

    const v2c = {
      requestContext: { http: { method: 'POST', sourceIp: '' } },
      rawPath: '/v2',
      headers: {},
      queryStringParameters: undefined,
      body: null,
    };
    expect(adapter.parseRequest(v2c).remoteAddr).toBe('0.0.0.0');

    const v2NoHeaders = {
      requestContext: { http: { method: 'POST', sourceIp: '' } },
      rawPath: '/v2',
      // headers omitted => event.headers ?? {}
    };
    const parsed = adapter.parseRequest(v2NoHeaders);
    expect(parsed.headers).toEqual({});
    expect(parsed.remoteAddr).toBe('0.0.0.0');
  });

  it('parseRequest should support ALB remoteAddr fallbacks', async () => {
    const { LambdaAdapter } = await importAdapter();
    const adapter = LambdaAdapter.create({ handler: async () => undefined });

    const albForwarded = {
      httpMethod: 'GET',
      path: '/alb',
      headers: { 'x-forwarded-for': '203.0.113.1, 203.0.113.2' },
      requestContext: { elb: { targetGroupArn: 'arn:...' } },
    };
    expect(adapter.parseRequest(albForwarded).remoteAddr).toBe('203.0.113.1');

    const albRealIp = {
      httpMethod: 'GET',
      path: '/alb',
      headers: { 'x-forwarded-for': '', 'x-real-ip': '203.0.113.3' },
      requestContext: { elb: { targetGroupArn: 'arn:...' } },
    };
    expect(adapter.parseRequest(albRealIp).remoteAddr).toBe('203.0.113.3');

    const albFallback = {
      httpMethod: 'GET',
      path: '/alb',
      requestContext: { elb: { targetGroupArn: 'arn:...' } },
    };
    expect(adapter.parseRequest(albFallback).remoteAddr).toBe('0.0.0.0');

    const albNoHeaders = {
      httpMethod: 'GET',
      path: '/alb',
      headers: undefined,
      requestContext: { elb: { targetGroupArn: 'arn:...' } },
    };
    expect(adapter.parseRequest(albNoHeaders).headers).toEqual({});
  });

  it('parseRequest should allow v1 events with missing headers', async () => {
    const { LambdaAdapter } = await importAdapter();
    const adapter = LambdaAdapter.create({ handler: async () => undefined });

    const v1NoHeaders = {
      httpMethod: 'GET',
      path: '/v1',
      headers: undefined,
    };

    const parsed = adapter.parseRequest(v1NoHeaders);
    expect(parsed.headers).toEqual({});
    expect(parsed.remoteAddr).toBe('0.0.0.0');
  });

  it('formatResponse should convert body and default isBase64Encoded', async () => {
    const { LambdaAdapter } = await importAdapter();
    const adapter = LambdaAdapter.create({ handler: async () => undefined });

    expect(
      adapter.formatResponse({
        statusCode: 200,
        headers: { a: 'b' },
        body: 'hi',
      } as PlatformResponse)
    ).toEqual({ statusCode: 200, headers: { a: 'b' }, body: 'hi', isBase64Encoded: false });

    expect(
      adapter.formatResponse({
        statusCode: 201,
        headers: { a: 'b' },
        body: Buffer.from('buf', 'utf-8'),
      } as PlatformResponse)
    ).toEqual({ statusCode: 201, headers: { a: 'b' }, body: 'buf', isBase64Encoded: false });

    expect(
      adapter.formatResponse({
        statusCode: 204,
        headers: { a: 'b' },
        body: null,
        isBase64Encoded: true,
      } as PlatformResponse)
    ).toEqual({ statusCode: 204, headers: { a: 'b' }, body: '', isBase64Encoded: true });
  });

  it('handle should process API Gateway v1, allow response mutations, and log debug', async () => {
    const { LambdaAdapter } = await importAdapter();

    const configLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const adapter = LambdaAdapter.create({
      logger: configLogger,
      handler: async (_req: unknown, res: unknown, body: unknown) => {
        expect(body?.toString()).toBe('hello');
        (res as { writeHead: (code: number, headers?: Record<string, string>) => void }).writeHead(
          201,
          { 'X-Test': '1' }
        );
        (res as { write: (chunk: string | Buffer) => boolean }).write(Buffer.from('buf', 'utf-8'));
        (res as { end: (chunk?: unknown) => void }).end();
      },
    });

    const event = {
      httpMethod: 'POST',
      path: '/test',
      headers: { 'content-type': 'text/plain', 'x-forwarded-for': '192.0.2.4' },
      queryStringParameters: { a: '1' },
      body: 'hello',
      isBase64Encoded: false,
    };

    const response = await adapter.handle(event);
    expect(response.statusCode).toBe(201);
    expect(configLogger.debug).toHaveBeenCalledWith(
      'Lambda request processed',
      expect.objectContaining({ statusCode: 201, path: '/test', method: 'POST' })
    );
  });

  it('handle should accept base64 encoded body, body "" and non-string body', async () => {
    const { LambdaAdapter } = await importAdapter();

    const bodies: Array<{ event: Record<string, unknown>; expected: string | null }> = [
      {
        event: {
          httpMethod: 'POST',
          path: '/b64',
          headers: {},
          body: Buffer.from('test').toString('base64'),
          isBase64Encoded: true,
        },
        expected: 'test',
      },
      {
        event: {
          httpMethod: 'POST',
          path: '/empty',
          headers: {},
          body: '',
          isBase64Encoded: false,
        },
        expected: null,
      },
      {
        event: {
          httpMethod: 'POST',
          path: '/bytes',
          headers: {},
          body: new Uint8Array([0x61, 0x62, 0x63]),
        },
        expected: 'abc',
      },
    ];

    const handler = vi.fn(async (_req, _res, body) => {
      const text = body === null ? null : body.toString('utf-8');
      return text;
    });

    const adapter = LambdaAdapter.create({
      handler: handler as unknown as AdapterConfig['handler'],
    });

    await bodies.reduce(async (prev, c) => {
      await prev;
      const response = await adapter.handle(c.event);
      expect(response.statusCode).toBe(200);
    }, Promise.resolve());

    expect(handler).toHaveBeenCalledTimes(3);
    expect((handler.mock.calls[0]?.[2] as Buffer).toString('utf-8')).toBe('test');
    expect(handler.mock.calls[1]?.[2]).toBeNull();
    expect((handler.mock.calls[2]?.[2] as Buffer).toString('utf-8')).toBe('abc');
  });

  it('handle should set 504 on timeout when handler hangs', async () => {
    vi.useFakeTimers();

    const { LambdaAdapter } = await importAdapter();
    let resolveHandler: (() => void) | undefined;
    const handler = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveHandler = resolve;
        })
    );

    const adapter = LambdaAdapter.create({
      handler: handler as unknown as AdapterConfig['handler'],
      timeout: 5,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const promise = adapter.handle({
      httpMethod: 'GET',
      path: '/t',
      headers: {},
      body: null,
    });

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5);
    resolveHandler?.();

    const response = await promise;
    expect(response.statusCode).toBe(504);
    expect(JSON.parse(String(response.body))).toEqual({
      error: 'Gateway Timeout',
      statusCode: 504,
    });

    vi.useRealTimers();
  });

  it('handle should include error details only in development', async () => {
    const { LambdaAdapter } = await importAdapter();

    envState.NODE_ENV = 'development';
    const dev = LambdaAdapter.create({
      handler: async () => {
        throw new Error('boom');
      },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const devResp = await dev.handle({ httpMethod: 'GET', path: '/x', headers: {}, body: null });
    expect(JSON.parse(String(devResp.body)).details).toEqual({ message: 'boom' });

    envState.NODE_ENV = 'production';
    const prod = LambdaAdapter.create({
      handler: async () => {
        throw new Error('boom');
      },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const prodResp = await prod.handle({ httpMethod: 'GET', path: '/x', headers: {}, body: null });
    expect(JSON.parse(String(prodResp.body)).details).toBeUndefined();
  });

  it('createMockHttpObjects should cover writeHead/end branches', async () => {
    const { LambdaAdapter } = await importAdapter();
    const adapter = LambdaAdapter.create({ handler: async () => undefined }) as unknown as {
      createMockHttpObjects: (req: PlatformRequest) => {
        req: unknown;
        res: {
          writeHead: (...args: unknown[]) => unknown;
          end: (...args: unknown[]) => unknown;
        };
        responseData: {
          statusCode: number;
          headers: Record<string, string | string[]>;
          body: unknown;
        };
      };
    };

    const { res, responseData } = adapter.createMockHttpObjects({
      method: 'GET',
      path: '/x',
      headers: {},
      query: {},
      body: null,
      remoteAddr: '',
    });

    res.writeHead(201, { 'X-A': '1' });
    expect(responseData.statusCode).toBe(201);
    expect(responseData.headers['X-A']).toBe('1');

    res.writeHead(202, 'OK', { 'X-B': '2' });
    expect(responseData.statusCode).toBe(202);
    expect(responseData.headers['X-B']).toBe('2');

    res.writeHead(203, 'OK');
    expect(responseData.statusCode).toBe(203);

    const endCb = vi.fn();
    res.end(endCb);
    expect(endCb).toHaveBeenCalledTimes(1);
    res.end('done');
    expect(responseData.body).toBe('done');
    res.end();
  });
});
