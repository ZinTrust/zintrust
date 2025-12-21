import { EventEmitter } from 'node:events';

import { Env } from '@config/env';
import Logger from '@config/logger';
import { describe, expect, it, vi } from 'vitest';

const loggerState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const envState = vi.hoisted(() => {
  const envGet = vi.fn((key: string, defaultValue: string = '') => {
    return key === 'NODE_ENV' ? 'test' : defaultValue;
  });

  return { envGet };
});

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
    server,
    handlers,
    createServer,
    reset,
    getLastListener: (): ((req: unknown, res: unknown) => void) | undefined => lastListener,
  };
});

vi.mock('@config/logger', () => ({
  default: loggerState,
}));

vi.mock('@config/env', () => ({
  Env: {
    get: envState.envGet,
    NODE_ENV: 'test',
    DB_CONNECTION: 'sqlite',
    DB_HOST: 'localhost',
    DB_PORT: 1234,
  },
}));

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
  public socket: {
    remoteAddress?: string;
    destroy: () => void;
  } = {
    remoteAddress: '127.0.0.1',
    destroy: vi.fn(),
  };
}

class FakeRes {
  public headersSent = false;
  public statusCode = 200;
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

type RequestBody = string | Buffer | null;

async function importAdapter(): Promise<{
  NodeServerAdapter: new (config: {
    handler: (req: unknown, res: unknown, body: RequestBody) => Promise<void>;
    logger?: {
      debug(msg: string, data?: unknown): void;
      info(msg: string, data?: unknown): void;
      warn(msg: string, data?: unknown): void;
      error(msg: string, err?: Error): void;
    };
    timeout?: number;
    maxBodySize?: number;
  }) => unknown;
}> {
  return import('@/runtime/adapters/NodeServerAdapter');
}

describe('NodeServerAdapter', () => {
  it('should identify as nodejs platform', async () => {
    const { NodeServerAdapter } = await importAdapter();
    const adapter = new NodeServerAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }) as { platform: string };

    expect(adapter.platform).toBe('nodejs');
  });

  it('constructor should use provided logger', async () => {
    const { NodeServerAdapter } = await importAdapter();
    const configLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const adapter = new NodeServerAdapter({
      handler: async () => undefined,
      logger: configLogger,
    }) as { getLogger: () => { info: (msg: string) => void } };

    const logger = adapter.getLogger();
    logger.info('hello');
    expect(configLogger.info).toHaveBeenCalledWith('hello');
    expect(loggerState.info).not.toHaveBeenCalled();
  });

  it('handle should throw (node server requires startServer)', async () => {
    const { NodeServerAdapter } = await importAdapter();
    const adapter = new NodeServerAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }) as { handle: () => Promise<unknown> };

    await expect(adapter.handle()).rejects.toThrow(/requires startServer\(\)/i);
  });

  it('startServer should create server, listen, and handle clientError branches', async () => {
    httpState.reset();
    const { NodeServerAdapter } = await importAdapter();

    const configLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const adapter = new NodeServerAdapter({
      handler: async () => undefined,
      logger: configLogger,
    }) as { startServer: (port: number, host: string) => Promise<void> };

    await adapter.startServer(12345, '0.0.0.0');
    expect(httpState.createServer).toHaveBeenCalledTimes(1);
    expect(httpState.server.listen).toHaveBeenCalledWith(12345, '0.0.0.0', expect.any(Function));
    expect(configLogger.info).toHaveBeenCalledWith(
      'Node.js server listening on http://0.0.0.0:12345'
    );

    const listener = httpState.getLastListener();
    expect(typeof listener).toBe('function');

    const socketWritable = { writable: true };
    const socketNotWritable = { writable: false };

    httpState.handlers['clientError']?.({ code: 'ECONNRESET', message: 'reset' }, socketWritable);
    httpState.handlers['clientError']?.({ code: 'EOTHER', message: 'oops' }, socketNotWritable);

    httpState.handlers['clientError']?.({ code: 'EOTHER', message: 'oops2' }, socketWritable);
    expect(configLogger.warn).toHaveBeenCalledWith('Client error: oops2');
  });

  it('startServer should reject on server error and log', async () => {
    httpState.reset();
    const { NodeServerAdapter } = await importAdapter();

    const configLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    httpState.server.listen.mockImplementation(() => {
      // Do not resolve; wait for error handler
    });

    const adapter = new NodeServerAdapter({
      handler: async () => undefined,
      logger: configLogger,
    }) as { startServer: (port: number, host: string) => Promise<void> };

    const promise = adapter.startServer(1, 'localhost');
    await Promise.resolve();

    const err = new Error('boom');
    httpState.handlers['error']?.(err);

    await expect(promise).rejects.toThrow('boom');
    expect(configLogger.error).toHaveBeenCalledWith('Server error', err);
  });

  it('stop should resolve immediately if not started', async () => {
    const { NodeServerAdapter } = await importAdapter();
    const configLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const adapter = new NodeServerAdapter({
      handler: async () => undefined,
      logger: configLogger,
    }) as { stop: () => Promise<void> };

    await expect(adapter.stop()).resolves.toBeUndefined();
    expect(configLogger.info).not.toHaveBeenCalledWith('Node.js server stopped');
  });

  it('stop should close server and log when started', async () => {
    httpState.reset();
    const { NodeServerAdapter } = await importAdapter();

    const configLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const adapter = new NodeServerAdapter({
      handler: async () => undefined,
      logger: configLogger,
    }) as {
      startServer: (port: number, host: string) => Promise<void>;
      stop: () => Promise<void>;
    };

    await adapter.startServer(3000, 'localhost');
    await adapter.stop();

    expect(httpState.server.close).toHaveBeenCalledTimes(1);
    expect(configLogger.info).toHaveBeenCalledWith('Node.js server stopped');
  });

  it('parseRequest and formatResponse should throw', async () => {
    const { NodeServerAdapter } = await importAdapter();
    const adapter = new NodeServerAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }) as { parseRequest: () => unknown; formatResponse: () => unknown };

    expect(() => adapter.parseRequest()).toThrow(/native node\.js http/i);
    expect(() => adapter.formatResponse()).toThrow(/native node\.js http/i);
  });

  it('supportsPersistentConnections and getEnvironment should work', async () => {
    const { NodeServerAdapter } = await importAdapter();
    const adapter = new NodeServerAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }) as {
      supportsPersistentConnections: () => boolean;
      getEnvironment: () => Record<string, unknown>;
    };

    expect(adapter.supportsPersistentConnections()).toBe(true);

    expect(adapter.getEnvironment()).toEqual({
      nodeEnv: 'test',
      runtime: 'nodejs',
      dbConnection: 'sqlite',
      dbHost: 'localhost',
      dbPort: 1234,
    });
  });

  it('getLogger should use fallback when internal logger is missing', async () => {
    const { NodeServerAdapter } = await importAdapter();
    const adapter = new NodeServerAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }) as { getLogger: () => any };

    // Force private logger undefined to hit fallback branch
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

    expect(loggerState.debug).toHaveBeenCalledWith('[Node.js] d');
    expect(loggerState.info).toHaveBeenCalledWith('[Node.js] i');
    expect(loggerState.warn).toHaveBeenCalledWith('[Node.js] w');
    expect(loggerState.error).toHaveBeenCalledWith('[Node.js] e', 'x');
  });

  it('default logger should stringify data and handle nullish data', async () => {
    const { NodeServerAdapter } = await importAdapter();
    const adapter = new NodeServerAdapter({
      handler: async () => undefined,
      // no logger => createDefaultLogger()
    }) as { getLogger: () => any };

    const l = adapter.getLogger() as {
      debug: (msg: string, data?: unknown) => void;
      info: (msg: string, data?: unknown) => void;
      warn: (msg: string, data?: unknown) => void;
      error: (msg: string, err?: Error) => void;
    };

    l.debug('a', { ok: true });
    l.debug('a2');
    l.info('b');
    l.info('b2', { ok: false });
    l.warn('c', null);
    l.warn('c2', { ok: 1 });
    l.error('d');

    expect(loggerState.debug).toHaveBeenCalledWith('[Node.js] a', JSON.stringify({ ok: true }));
    expect(loggerState.debug).toHaveBeenCalledWith('[Node.js] a2', '');
    expect(loggerState.info).toHaveBeenCalledWith('[Node.js] b', '');
    expect(loggerState.info).toHaveBeenCalledWith('[Node.js] b2', JSON.stringify({ ok: false }));
    expect(loggerState.warn).toHaveBeenCalledWith('[Node.js] c', '');
    expect(loggerState.warn).toHaveBeenCalledWith('[Node.js] c2', JSON.stringify({ ok: 1 }));
    expect(loggerState.error).toHaveBeenCalledWith('[Node.js] d', undefined);
  });

  it('handleRequest should use default maxBodySize when undefined', async () => {
    const { NodeServerAdapter } = await importAdapter();

    const handler = vi.fn(async (_req: unknown, res: unknown, body: RequestBody) => {
      expect(body?.toString()).toBe('x');
      (res as FakeRes).end('ok');
    });

    const adapter = new NodeServerAdapter({
      handler: handler as unknown as (
        req: unknown,
        res: unknown,
        body: RequestBody
      ) => Promise<void>,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      // omit maxBodySize to hit the nullish-coalescing default branch
    }) as { handleRequest: (req: FakeReq, res: FakeRes) => Promise<void> };

    const req = new FakeReq();
    const res = new FakeRes();

    const finished = new Promise<void>((resolve) => {
      const originalEnd = res.end.bind(res);
      res.end = (body?: string): void => {
        originalEnd(body);
        resolve();
      };
    });

    await adapter.handleRequest(req, res);
    req.emit('data', Buffer.from('x'));
    req.emit('end');

    await finished;

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('handleRequest should process request, enforce max size, and log success', async () => {
    const { NodeServerAdapter } = await importAdapter();

    const handler = vi.fn(async (_req: unknown, res: unknown, body: RequestBody) => {
      expect(body?.toString()).toBe('hello');
      (res as FakeRes).end('ok');
    });

    const configLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const adapter = new NodeServerAdapter({
      handler: handler as unknown as (
        req: unknown,
        res: unknown,
        body: RequestBody
      ) => Promise<void>,
      logger: configLogger,
      maxBodySize: 1000,
      timeout: 50,
    }) as { handleRequest: (req: FakeReq, res: FakeRes) => Promise<void> };

    const req = new FakeReq();
    const res = new FakeRes();

    const finished = new Promise<void>((resolve) => {
      const originalEnd = res.end.bind(res);
      res.end = (body?: string): void => {
        originalEnd(body);
        resolve();
      };
    });

    await adapter.handleRequest(req, res);
    req.emit('data', Buffer.from('hello'));
    req.emit('end');

    await finished;

    expect(handler).toHaveBeenCalledTimes(1);
    expect(configLogger.debug).toHaveBeenCalledWith(
      'Request processed',
      expect.objectContaining({ method: 'GET', url: '/', remoteAddr: '127.0.0.1' })
    );
  });

  it('handleRequest should pass null body when no chunks', async () => {
    const { NodeServerAdapter } = await importAdapter();

    const handler = vi.fn(async (_req: unknown, res: unknown, body: RequestBody) => {
      expect(body).toBeNull();
      (res as FakeRes).end('ok');
    });

    const adapter = new NodeServerAdapter({
      handler: handler as unknown as (
        req: unknown,
        res: unknown,
        body: RequestBody
      ) => Promise<void>,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }) as { handleRequest: (req: FakeReq, res: FakeRes) => Promise<void> };

    const req = new FakeReq();
    const res = new FakeRes();

    const finished = new Promise<void>((resolve) => {
      const originalEnd = res.end.bind(res);
      res.end = (body?: string): void => {
        originalEnd(body);
        resolve();
      };
    });

    await adapter.handleRequest(req, res);
    req.emit('end');
    await finished;
  });

  it('handleRequest should return 413 and destroy socket when payload too large', async () => {
    const { NodeServerAdapter } = await importAdapter();

    const adapter = new NodeServerAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      maxBodySize: 1,
    }) as { handleRequest: (req: FakeReq, res: FakeRes) => Promise<void> };

    const req = new FakeReq();
    const res = new FakeRes();

    await adapter.handleRequest(req, res);
    req.emit('data', Buffer.from('ab'));
    req.emit('data', Buffer.from('cd'));

    expect(res.statusCode).toBe(413);
    expect(res.endedBody).toBe(JSON.stringify({ error: 'Payload Too Large' }));
    expect(req.socket.destroy).toHaveBeenCalledTimes(1);
  });

  it('handleRequest should handle handler error and include message only in development', async () => {
    envState.envGet.mockImplementation((key: string, defaultValue: string = '') => {
      if (key === 'NODE_ENV') return 'development';
      return defaultValue;
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    const { NodeServerAdapter } = await importAdapter();
    const adapter = new NodeServerAdapter({
      handler: async (_req: unknown, _res: unknown, _body: RequestBody) => {
        throw new Error('nope');
      },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }) as { handleRequest: (req: FakeReq, res: FakeRes) => Promise<void> };

    const req = new FakeReq();
    const res = new FakeRes();

    const finished = new Promise<void>((resolve) => {
      const originalEnd = res.end.bind(res);
      res.end = (body?: string): void => {
        originalEnd(body);
        resolve();
      };
    });

    await adapter.handleRequest(req, res);
    req.emit('end');
    await finished;

    expect(res.statusCode).toBe(500);
    const parsed = JSON.parse(String(res.endedBody));
    expect(parsed).toEqual({
      error: 'Internal Server Error',
      statusCode: 500,
      timestamp: '2025-01-01T00:00:00.000Z',
      message: 'nope',
    });

    vi.useRealTimers();
    envState.envGet.mockImplementation((key: string, defaultValue: string = '') => {
      return key === 'NODE_ENV' ? 'test' : defaultValue;
    });
  });

  it('handleRequest should omit message in production errors', async () => {
    envState.envGet.mockImplementation((key: string, defaultValue: string = '') => {
      if (key === 'NODE_ENV') return 'production';
      return defaultValue;
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    const { NodeServerAdapter } = await importAdapter();
    const adapter = new NodeServerAdapter({
      handler: async () => {
        throw new Error('secret');
      },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }) as { handleRequest: (req: FakeReq, res: FakeRes) => Promise<void> };

    const req = new FakeReq();
    const res = new FakeRes();

    const finished = new Promise<void>((resolve) => {
      const originalEnd = res.end.bind(res);
      res.end = (body?: string): void => {
        originalEnd(body);
        resolve();
      };
    });

    await adapter.handleRequest(req, res);
    req.emit('end');
    await finished;

    expect(res.statusCode).toBe(500);
    const parsed = JSON.parse(String(res.endedBody));
    expect(parsed).toEqual({
      error: 'Internal Server Error',
      statusCode: 500,
      timestamp: '2025-01-01T00:00:00.000Z',
    });

    vi.useRealTimers();
    envState.envGet.mockImplementation((key: string, defaultValue: string = '') => {
      return key === 'NODE_ENV' ? 'test' : defaultValue;
    });
  });

  it('handleRequest should not write error if headers already sent', async () => {
    const { NodeServerAdapter } = await importAdapter();
    const adapter = new NodeServerAdapter({
      handler: async () => {
        throw new Error('nope');
      },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }) as { handleRequest: (req: FakeReq, res: FakeRes) => Promise<void> };

    const req = new FakeReq();
    const res = new FakeRes();
    res.headersSent = true;

    await adapter.handleRequest(req, res);
    req.emit('end');
    await Promise.resolve();

    expect(res.statusCode).toBe(200);
    expect(res.endedBody).toBeUndefined();
  });

  it('handleRequest should handle request stream error (400) only when headers not sent', async () => {
    const { NodeServerAdapter } = await importAdapter();
    const adapter = new NodeServerAdapter({
      handler: async () => undefined,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }) as { handleRequest: (req: FakeReq, res: FakeRes) => Promise<void> };

    const req = new FakeReq();
    const res = new FakeRes();

    const finished = new Promise<void>((resolve) => {
      const originalEnd = res.end.bind(res);
      res.end = (body?: string): void => {
        originalEnd(body);
        resolve();
      };
    });

    await adapter.handleRequest(req, res);
    req.emit('error', new Error('bad'));
    await finished;

    expect(res.statusCode).toBe(400);
    expect(res.endedBody).toBe(JSON.stringify({ error: 'Bad Request' }));

    const res2 = new FakeRes();
    res2.headersSent = true;
    await adapter.handleRequest(req, res2);
    req.emit('error', new Error('bad2'));
    await Promise.resolve();
    expect(res2.endedBody).toBeUndefined();
  });

  it('handleRequest should send 504 on timeout', async () => {
    vi.useFakeTimers();

    let resolveHandler: (() => void) | undefined;
    const handler = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveHandler = resolve;
        })
    );

    const { NodeServerAdapter } = await importAdapter();
    const adapter = new NodeServerAdapter({
      handler: handler as unknown as (
        req: unknown,
        res: unknown,
        body: RequestBody
      ) => Promise<void>,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      timeout: 5,
    }) as { handleRequest: (req: FakeReq, res: FakeRes) => Promise<void> };

    const req = new FakeReq();
    const res = new FakeRes();

    const finished = new Promise<void>((resolve) => {
      const originalEnd = res.end.bind(res);
      res.end = (body?: string): void => {
        originalEnd(body);
        resolve();
      };
    });

    await adapter.handleRequest(req, res);
    req.emit('end');

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5);

    expect(res.statusCode).toBe(504);
    expect(res.endedBody).toBe(JSON.stringify({ error: 'Gateway Timeout' }));

    resolveHandler?.();
    await Promise.resolve();
    await finished;

    vi.useRealTimers();
  });

  it('requestListener should invoke handleRequest', async () => {
    const { NodeServerAdapter } = await importAdapter();

    const adapter = new NodeServerAdapter({
      handler: async (_req: unknown, res: unknown) => {
        (res as FakeRes).end('ok');
      },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }) as {
      startServer: (port: number, host: string) => Promise<void>;
    };

    httpState.reset();
    await adapter.startServer(1, 'localhost');
    const listener = httpState.getLastListener();
    expect(typeof listener).toBe('function');

    const req = new FakeReq();
    const res = new FakeRes();
    listener?.(req, res);

    req.emit('end');
    await Promise.resolve();
    expect(res.endedBody).toBe('ok');
  });

  it('sanity: Env and Logger mocks are wired', () => {
    expect(Env.NODE_ENV).toBe('test');
    Logger.info('x');
    expect(loggerState.info).toHaveBeenCalledWith('x');
  });
});
