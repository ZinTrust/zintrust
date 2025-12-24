import { afterEach, describe, expect, it, vi } from 'vitest';

type Listener = (...args: unknown[]) => void;

type FakeServer = {
  listen: (port: number, host: string, cb: () => void) => void;
  close: (cb: () => void) => void;
  on: (event: string, cb: Listener) => void;
  emit: (event: string, ...args: unknown[]) => void;
  __getRequestHandler: () => ((req: unknown, res: unknown) => void) | undefined;
};

// `vi.mock()` is hoisted; use `var` to avoid TDZ issues.
// eslint-disable-next-line no-var
var lastServer: FakeServer | undefined;

vi.mock('node:http', () => {
  const listeners = new Map<string, Listener>();
  let requestHandler: ((req: unknown, res: unknown) => void) | undefined;

  const server: FakeServer = {
    listen: (_port: number, _host: string, cb: () => void) => cb(),
    close: (cb: () => void) => cb(),
    on: (event: string, cb: Listener) => {
      listeners.set(event, cb);
    },
    emit: (event: string, ...args: unknown[]) => {
      const cb = listeners.get(event);
      if (cb) cb(...args);
    },
    __getRequestHandler: () => requestHandler,
  };

  lastServer = server;

  return {
    createServer: (handler: (req: unknown, res: unknown) => void) => {
      requestHandler = handler;
      return server;
    },
    IncomingMessage: class {
      _ = 0;
    },
    ServerResponse: class {
      _ = 0;
    },
    Server: class {
      _ = 0;
    },
  };
});

import { EventEmitter } from '@node-singletons/events';

import { NodeServerAdapter } from '@/runtime/adapters/NodeServerAdapter';

type ResState = {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: string;
  headersSent: boolean;
};

function createFakeRes(): { res: Record<string, unknown>; state: ResState } {
  const state: ResState = {
    statusCode: 200,
    headers: {},
    body: '',
    headersSent: false,
  };

  const res: Record<string, unknown> = {
    get statusCode() {
      return state.statusCode;
    },
    set statusCode(code: number) {
      state.statusCode = code;
    },
    get headersSent() {
      return state.headersSent;
    },
    writeHead: (statusCode: number, headers?: Record<string, string | string[]>) => {
      state.statusCode = statusCode;
      state.headersSent = true;
      if (headers) {
        state.headers = { ...state.headers, ...headers };
      }
      return res;
    },
    end: (chunk?: string | Buffer) => {
      state.headersSent = true;
      if (chunk !== undefined) {
        state.body += Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : chunk;
      }
      return res;
    },
  };

  return { res, state };
}

function createFakeReq(options: {
  method: string;
  url: string;
  remoteAddress?: string;
  socketWritable?: boolean;
}): { req: Record<string, unknown> & EventEmitter; socketDestroyed: { value: boolean } } {
  const socketDestroyed = { value: false };
  const socketWritable = options.socketWritable ?? true;
  const emitter = new EventEmitter();

  const socket = {
    remoteAddress: options.remoteAddress ?? '127.0.0.1',
    writable: socketWritable,
    destroy: () => {
      socketDestroyed.value = true;
    },
  };

  const req = Object.assign(emitter, {
    method: options.method,
    url: options.url,
    socket,
  });

  return { req: req as unknown as Record<string, unknown> & EventEmitter, socketDestroyed };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('NodeServerAdapter', () => {
  it('should identify as nodejs platform', () => {
    const adapter = NodeServerAdapter.create({
      handler: async () => undefined,
    });

    expect(adapter.platform).toBe('nodejs');
  });

  it('supportsPersistentConnections should be true', () => {
    const adapter = NodeServerAdapter.create({
      handler: async () => undefined,
    });

    expect(adapter.supportsPersistentConnections()).toBe(true);
  });

  it('getEnvironment should include runtime metadata', () => {
    const adapter = NodeServerAdapter.create({
      handler: async () => undefined,
    });

    const env = adapter.getEnvironment();
    expect(env.runtime).toBe('nodejs');
    expect(typeof env.nodeEnv).toBe('string');
    expect(typeof env.dbConnection).toBe('string');
  });

  it('startServer and stop should resolve (mocked server)', async () => {
    const adapter = NodeServerAdapter.create({
      handler: async () => undefined,
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    await adapter.startServer(0, '127.0.0.1');
    await adapter.stop();

    expect(lastServer).toBeDefined();
  });

  it('stop should resolve even if never started', async () => {
    const adapter = NodeServerAdapter.create({
      handler: async () => undefined,
    });

    await expect(adapter.stop()).resolves.toBeUndefined();
  });

  it('should respond 413 when request body exceeds maxBodySize', async () => {
    const adapter = NodeServerAdapter.create({
      maxBodySize: 1,
      handler: async () => undefined,
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    await adapter.startServer(0, '127.0.0.1');
    const requestHandler = lastServer?.__getRequestHandler();
    expect(requestHandler).toBeTypeOf('function');

    const { req, socketDestroyed } = createFakeReq({ method: 'POST', url: '/upload' });
    const { res, state } = createFakeRes();

    requestHandler?.(req, res);
    req.emit('data', Buffer.from('a'));
    req.emit('data', Buffer.from('a'));
    req.emit('data', Buffer.from('a'));

    await flushMicrotasks();

    expect(state.statusCode).toBe(413);
    expect(state.body).toContain('Payload Too Large');
    expect(socketDestroyed.value).toBe(true);
  });

  it('should respond with handler response (happy path)', async () => {
    const adapter = NodeServerAdapter.create({
      handler: async (_req, res, body) => {
        expect(body?.toString('utf-8')).toBe('hello');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (
          res as unknown as { writeHead: (code: number, headers?: Record<string, string>) => void }
        ).writeHead(201, { 'Content-Type': 'text/plain' });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (res as unknown as { end: (chunk: string) => void }).end('ok');
      },
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    await adapter.startServer(0, '127.0.0.1');
    const requestHandler = lastServer?.__getRequestHandler();
    expect(requestHandler).toBeTypeOf('function');

    const { req } = createFakeReq({ method: 'POST', url: '/hello' });
    const { res, state } = createFakeRes();

    requestHandler?.(req, res);
    req.emit('data', Buffer.from('hello'));
    req.emit('end');

    await flushMicrotasks();

    expect(state.statusCode).toBe(201);
    expect(state.body).toBe('ok');
  });

  it('should send 504 on timeout if handler is slow', async () => {
    vi.useFakeTimers();

    const adapter = NodeServerAdapter.create({
      timeout: 10,
      handler: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      },
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    await adapter.startServer(0, '127.0.0.1');
    const requestHandler = lastServer?.__getRequestHandler();
    expect(requestHandler).toBeTypeOf('function');

    const { req } = createFakeReq({ method: 'POST', url: '/slow' });
    const { res, state } = createFakeRes();

    requestHandler?.(req, res);
    req.emit('data', Buffer.from('x'));
    req.emit('end');

    await vi.advanceTimersByTimeAsync(60);
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();

    expect(state.statusCode).toBe(504);
    expect(state.body).toContain('Gateway Timeout');
  });

  it('should send 500 and include message in development when handler throws', async () => {
    process.env['NODE_ENV'] = 'development';

    const adapter = NodeServerAdapter.create({
      handler: async () => {
        throw new Error('boom');
      },
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    await adapter.startServer(0, '127.0.0.1');
    const requestHandler = lastServer?.__getRequestHandler();
    expect(requestHandler).toBeTypeOf('function');

    const { req } = createFakeReq({ method: 'POST', url: '/err' });
    const { res, state } = createFakeRes();

    requestHandler?.(req, res);
    req.emit('end');

    await flushMicrotasks();

    expect(state.statusCode).toBe(500);
    expect(state.body).toContain('Internal Server Error');
    expect(state.body).toContain('boom');
  });

  it('should send 400 on request stream error', async () => {
    const adapter = NodeServerAdapter.create({
      handler: async () => undefined,
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    await adapter.startServer(0, '127.0.0.1');
    const requestHandler = lastServer?.__getRequestHandler();
    expect(requestHandler).toBeTypeOf('function');

    const { req } = createFakeReq({ method: 'POST', url: '/stream-err' });
    const { res, state } = createFakeRes();

    requestHandler?.(req, res);
    req.emit('error', new Error('stream'));

    await flushMicrotasks();

    expect(state.statusCode).toBe(400);
    expect(state.body).toContain('Bad Request');
  });
});
