import { EventEmitter } from 'node:events';

import type { AdapterConfig, PlatformResponse } from '@/runtime/RuntimeAdapter';
import { describe, expect, it, vi } from 'vitest';

type RequestBody = Buffer | null;

const loggerState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const envState = vi.hoisted(() => ({
  Env: {
    NODE_ENV: 'test',
    DB_CONNECTION: 'sqlite',
    DB_HOST: 'localhost',
    DB_PORT: 1234,
  },
}));

const httpState = vi.hoisted(() => {
  let lastListener: ((req: unknown, res: unknown) => void) | undefined;

  const handlers: Record<string, (...args: unknown[]) => void> = {};

  const server = {
    listen: vi.fn((_port: number, _host: string, cb?: () => void) => {
      cb?.();
    }),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      handlers[event] = cb;
      return server;
    }),
    close: vi.fn((cb?: () => void) => {
      cb?.();
    }),
  };

  const createServer = vi.fn((listener: (req: unknown, res: unknown) => void) => {
    lastListener = listener;
    return server;
  });

  const reset = (): void => {
    lastListener = undefined;
    server.listen.mockImplementation((_port: number, _host: string, cb?: () => void) => {
      cb?.();
    });
    server.listen.mockClear();
    server.on.mockClear();
    server.close.mockClear();
    createServer.mockClear();
    for (const key of Object.keys(handlers)) {
      Reflect.deleteProperty(handlers, key);
    }
  };

  return {
    handlers,
    server,
    createServer,
    reset,
    getLastListener: (): ((req: unknown, res: unknown) => void) | undefined => lastListener,
  };
});

vi.mock('@config/logger', () => ({
  Logger: loggerState,
}));

vi.mock('@config/env', () => envState);

vi.mock('node:http', () => ({
  createServer: httpState.createServer,
  IncomingMessage: class IncomingMessage {
    public _mock = true;
  },
  ServerResponse: class ServerResponse {
    public _mock = true;
  },
  Server: class Server {
    public _mock = true;
  },
}));

class FakeReq extends EventEmitter {
  public method: string | undefined = 'GET';
  public url: string | undefined = '/';
}

class FakeRes {
  public statusCode = 200;
  public headersSent = false;
  public writtenHeaders: Record<string, unknown> | undefined;
  public endedBody: string | undefined;

  public writeHead(code: number, headers: Record<string, unknown>): void {
    this.statusCode = code;
    this.writtenHeaders = headers;
    this.headersSent = true;
  }

  public end(body?: string): void {
    this.endedBody = body;
  }
}

async function importAdapter(): Promise<{
  FargateAdapter: new (config: AdapterConfig) => {
    platform: 'fargate';
    handle(): Promise<PlatformResponse>;
    startServer(port?: number, host?: string): Promise<void>;
    stop(): Promise<void>;
    parseRequest(): unknown;
    formatResponse(): unknown;
    getLogger(): {
      debug(msg: string, data?: unknown): void;
      info(msg: string, data?: unknown): void;
      warn(msg: string, data?: unknown): void;
      error(msg: string, err?: Error): void;
    };
    supportsPersistentConnections(): boolean;
    getEnvironment(): Record<string, unknown>;
  };
}> {
  return import('@/runtime/adapters/FargateAdapter');
}

describe('FargateAdapter', () => {
  it('should identify as fargate platform', async () => {
    const { FargateAdapter } = await importAdapter();
    const adapter = new FargateAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    expect(adapter.platform).toBe('fargate');
  });

  it('should throw error when calling handle()', async () => {
    const { FargateAdapter } = await importAdapter();
    const adapter = new FargateAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await expect(adapter.handle()).rejects.toThrow(/requires startServer\(\)/i);
  });

  it('startServer should create server, listen, and wire request listener', async () => {
    httpState.reset();
    const { FargateAdapter } = await importAdapter();

    const configLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const handler = vi.fn(async (_req: unknown, res: unknown, body: RequestBody) => {
      expect(body?.toString('utf-8')).toBe('hi');
      (res as FakeRes).end('ok');
    });

    const adapter = new FargateAdapter({
      handler: handler as unknown as AdapterConfig['handler'],
      logger: configLogger,
    }) as unknown as { startServer: (port: number, host: string) => Promise<void> };

    await adapter.startServer(8080, '127.0.0.1');

    expect(httpState.createServer).toHaveBeenCalledTimes(1);
    expect(httpState.server.listen).toHaveBeenCalledWith(8080, '127.0.0.1', expect.any(Function));
    expect(configLogger.info).toHaveBeenCalledWith('Fargate server listening on 127.0.0.1:8080');

    const listener = httpState.getLastListener();
    expect(typeof listener).toBe('function');

    const req = new FakeReq();
    const res = new FakeRes();
    listener?.(req, res);

    req.emit('data', Buffer.from('hi'));
    req.emit('end');
    await Promise.resolve();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('request listener should handle request stream error event', async () => {
    httpState.reset();
    const { FargateAdapter } = await importAdapter();

    const configLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const adapter = new FargateAdapter({
      handler: async () => undefined,
      logger: configLogger,
    }) as unknown as { startServer: (port: number, host: string) => Promise<void> };

    await adapter.startServer(3000, 'localhost');
    const listener = httpState.getLastListener();
    expect(typeof listener).toBe('function');

    const req = new FakeReq();
    const res = new FakeRes();
    listener?.(req, res);

    const err = new Error('bad');
    req.emit('error', err);

    expect(configLogger.error).toHaveBeenCalledWith('Request error', err);
    expect(res.statusCode).toBe(400);
    expect(res.endedBody).toBe(JSON.stringify({ error: 'Bad Request' }));
  });

  it('startServer should reject on server error and log', async () => {
    httpState.reset();
    const { FargateAdapter } = await importAdapter();

    const configLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    httpState.server.listen.mockImplementation(() => {
      // wait for server error event
    });

    const adapter = new FargateAdapter({
      handler: async () => undefined,
      logger: configLogger,
    }) as unknown as { startServer: (port: number, host: string) => Promise<void> };

    const promise = adapter.startServer(1, 'localhost');
    await Promise.resolve();

    const err = new Error('boom');
    httpState.handlers['error']?.(err);

    await expect(promise).rejects.toThrow('boom');
    expect(configLogger.error).toHaveBeenCalledWith('Server error', err);
  });

  it('request listener should log connection error if req.on throws', async () => {
    httpState.reset();
    const { FargateAdapter } = await importAdapter();

    const configLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const adapter = new FargateAdapter({
      handler: async () => undefined,
      logger: configLogger,
    }) as unknown as { startServer: (port: number, host: string) => Promise<void> };

    await adapter.startServer(3000, 'localhost');
    const listener = httpState.getLastListener();
    expect(typeof listener).toBe('function');

    const req = {
      on: (): void => {
        throw new Error('nope');
      },
    };
    const res = new FakeRes();
    listener?.(req, res);

    expect(configLogger.error).toHaveBeenCalledWith('Connection error', expect.any(Error));
  });

  it('handleRequestData should reject oversized payload with 413', async () => {
    const { FargateAdapter } = await importAdapter();
    const adapter = new FargateAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      maxBodySize: 1,
    }) as unknown as {
      handleRequestData: (chunk: Buffer, chunks: Buffer[], res: FakeRes) => void;
    };

    // Note: adapter currently checks `chunks.length * chunk.length`, so we pre-fill
    // to deterministically exceed maxBodySize and hit the 413 branch.
    const chunks: Buffer[] = [Buffer.from('x'), Buffer.from('y')];
    const res = new FakeRes();

    adapter.handleRequestData(Buffer.from('z'), chunks, res);

    expect(res.statusCode).toBe(413);
    expect(res.endedBody).toBe(JSON.stringify({ error: 'Payload Too Large' }));
    expect(chunks).toEqual([Buffer.from('x'), Buffer.from('y')]);
  });

  it('handleRequestError should send 400 and log', async () => {
    const { FargateAdapter } = await importAdapter();
    const configLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const adapter = new FargateAdapter({
      handler: async () => undefined,
      logger: configLogger,
    }) as unknown as {
      handleRequestError: (error: Error, res: FakeRes) => void;
    };

    const res = new FakeRes();
    const err = new Error('bad');
    adapter.handleRequestError(err, res);

    expect(configLogger.error).toHaveBeenCalledWith('Request error', err);
    expect(res.statusCode).toBe(400);
    expect(res.endedBody).toBe(JSON.stringify({ error: 'Bad Request' }));
  });

  it('handleRequestEnd should return 500 JSON with timestamp on handler error', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    const { FargateAdapter } = await importAdapter();
    const configLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const adapter = new FargateAdapter({
      handler: async () => undefined,
      logger: configLogger,
    }) as unknown as {
      handleRequestEnd: (chunks: Buffer[], req: FakeReq, res: FakeRes) => Promise<void>;
      executeRequestHandler: (req: FakeReq, res: FakeRes, body: RequestBody) => Promise<void>;
    };

    adapter.executeRequestHandler = async () => {
      throw new Error('boom');
    };

    const req = new FakeReq();
    const res = new FakeRes();
    await adapter.handleRequestEnd([], req, res);

    expect(configLogger.error).toHaveBeenCalledWith('Request handler error', expect.any(Error));
    expect(res.statusCode).toBe(500);
    expect(res.endedBody).toBe(
      JSON.stringify({
        error: 'Internal Server Error',
        timestamp: '2025-01-01T00:00:00.000Z',
      })
    );

    vi.useRealTimers();
  });

  it('executeRequestHandler should set 504 on timeout when handler hangs', async () => {
    vi.useFakeTimers();

    const { FargateAdapter } = await importAdapter();

    let resolveHandler: (() => void) | undefined;
    const handler = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveHandler = resolve;
        })
    );

    const configLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const adapter = new FargateAdapter({
      handler: handler as unknown as AdapterConfig['handler'],
      logger: configLogger,
      timeout: 5,
    }) as unknown as {
      executeRequestHandler: (req: FakeReq, res: FakeRes, body: RequestBody) => Promise<void>;
    };

    const req = new FakeReq();
    const res = new FakeRes();

    const promise = adapter.executeRequestHandler(req, res, Buffer.from('x'));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5);

    expect(res.statusCode).toBe(504);
    expect(res.endedBody).toBe(JSON.stringify({ error: 'Gateway Timeout' }));

    resolveHandler?.();
    await promise;

    expect(configLogger.debug).toHaveBeenCalledWith(
      'Request processed',
      expect.objectContaining({ method: 'GET', url: '/', statusCode: 504 })
    );

    vi.useRealTimers();
  });

  it('stop should resolve immediately if not started', async () => {
    const { FargateAdapter } = await importAdapter();
    const configLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const adapter = new FargateAdapter({
      handler: async () => undefined,
      logger: configLogger,
    });

    await expect(adapter.stop()).resolves.toBeUndefined();
    expect(configLogger.info).not.toHaveBeenCalledWith('Fargate server stopped');
  });

  it('stop should close server and log when started', async () => {
    httpState.reset();
    const { FargateAdapter } = await importAdapter();
    const configLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const adapter = new FargateAdapter({
      handler: async () => undefined,
      logger: configLogger,
    }) as unknown as {
      startServer: (port: number, host: string) => Promise<void>;
      stop: () => Promise<void>;
    };

    await adapter.startServer(3000, 'localhost');
    await adapter.stop();

    expect(httpState.server.close).toHaveBeenCalledTimes(1);
    expect(configLogger.info).toHaveBeenCalledWith('Fargate server stopped');
  });

  it('parseRequest and formatResponse should throw', async () => {
    const { FargateAdapter } = await importAdapter();
    const adapter = new FargateAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }) as unknown as { parseRequest: () => unknown; formatResponse: () => unknown };

    expect(() => adapter.parseRequest()).toThrow(/native node\.js http/i);
    expect(() => adapter.formatResponse()).toThrow(/native node\.js http/i);
  });

  it('getLogger should use fallback when internal logger missing', async () => {
    const { FargateAdapter } = await importAdapter();
    const adapter = new FargateAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }) as unknown as { getLogger: () => any };

    (adapter as unknown as { logger?: unknown }).logger = undefined;
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

    expect(loggerState.debug).toHaveBeenCalledWith('[Fargate] d');
    expect(loggerState.info).toHaveBeenCalledWith('[Fargate] i');
    expect(loggerState.warn).toHaveBeenCalledWith('[Fargate] w');
    expect(loggerState.error).toHaveBeenCalledWith('[Fargate] e', 'x');
  });

  it('default logger should stringify data and handle undefined/nullish', async () => {
    const { FargateAdapter } = await importAdapter();
    const adapter = new FargateAdapter({
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

    expect(loggerState.debug).toHaveBeenCalledWith('[Fargate] a', JSON.stringify({ ok: true }));
    expect(loggerState.debug).toHaveBeenCalledWith('[Fargate] a2', '');
    expect(loggerState.info).toHaveBeenCalledWith('[Fargate] b', '');
    expect(loggerState.info).toHaveBeenCalledWith('[Fargate] b2', JSON.stringify({ ok: false }));
    expect(loggerState.warn).toHaveBeenCalledWith('[Fargate] c', '');
    expect(loggerState.warn).toHaveBeenCalledWith('[Fargate] c2', 'null');
    expect(loggerState.error).toHaveBeenCalledWith('[Fargate] d', 'x');
  });

  it('supportsPersistentConnections and getEnvironment should work', async () => {
    const { FargateAdapter } = await importAdapter();
    const adapter = new FargateAdapter({
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
      runtime: 'fargate',
      dbConnection: 'sqlite',
      dbHost: 'localhost',
      dbPort: 1234,
    });
  });
});
