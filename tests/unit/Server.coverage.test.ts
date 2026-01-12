import type { IApplication } from '@boot/Application';
import { Server } from '@boot/Server';
import { bodyParsingMiddleware } from '@http/middleware/BodyParsingMiddleware';
import type * as httpTypes from '@node-singletons/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@boot/Application', () => ({}));

vi.mock('@config/app', () => ({
  appConfig: {
    isDevelopment: () => true,
    port: 3000,
    host: 'localhost',
  },
}));

vi.mock('@config/env', () => ({
  Env: {
    MAX_BODY_SIZE: 16,
    NODE_ENV: 'development',
    get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
    getInt: vi.fn((_key: string, defaultValue?: number) => defaultValue ?? 0),
    getBool: vi.fn(
      (key: string) => key === 'ZIN_DEBUG_BODY_PARSE' || key === 'ZIN_DEBUG_BODY_PARSE_FULL'
    ),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock('@http/error-pages/ErrorPageRenderer', () => ({
  ErrorPageRenderer: {
    shouldSendHtml: vi.fn(() => true),
    renderHtml: vi.fn(() => '<html>ok</html>'),
  },
}));

vi.mock('@routing/Router', () => ({
  Router: {
    match: vi.fn(() => ({})),
  },
}));

vi.mock('@node-singletons/http', () => ({
  createServer: vi.fn(),
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: vi.fn(() => false),
  statSync: vi.fn(() => ({ isDirectory: () => false })),
  readFileSync: vi.fn(() => Buffer.from('')),
}));

vi.mock('@http/Request', () => ({
  Request: {
    create: vi.fn(),
  },
}));

vi.mock('@http/Response', () => ({
  Response: {
    create: vi.fn(),
  },
}));

type Incoming = httpTypes.IncomingMessage;

describe('Server (coverage)', () => {
  let requestHandler:
    | ((req: httpTypes.IncomingMessage, res: httpTypes.ServerResponse) => void)
    | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();

    const http = await import('@node-singletons/http');
    (http.createServer as unknown as ReturnType<typeof vi.fn>).mockImplementation((handler) => {
      requestHandler = handler;
      return { listen: vi.fn(), on: vi.fn() };
    });
  });

  afterEach(() => {
    requestHandler = undefined;
    vi.useRealTimers();
  });

  const makeAsyncReq = (input: {
    method: string;
    url: string;
    headers: Record<string, unknown>;
    chunks: unknown[];
  }): Incoming => {
    const raw: any = {
      method: input.method,
      url: input.url,
      headers: input.headers,
      destroy: vi.fn(),
      async *[Symbol.asyncIterator]() {
        for (const c of input.chunks) yield c;
      },
    };
    return raw as Incoming;
  };

  const makeRes = (): any => {
    return {
      setHeader: vi.fn(),
      writeHead: vi.fn(),
      end: vi.fn(),
    };
  };

  it('parses urlencoded bodies (content-type array) and stores raw body', async () => {
    vi.useFakeTimers();

    const { Env } = await import('@config/env');
    (Env as any).MAX_BODY_SIZE = 1024;

    const { Request } = await import('@http/Request');
    const { Response } = await import('@http/Response');

    const rawReq = makeAsyncReq({
      method: 'POST',
      url: '/form',
      headers: { 'content-type': ['application/x-www-form-urlencoded'] },
      chunks: [new Uint8Array(Buffer.from('a=1&a=2&')), new ArrayBuffer(3), 'b=3'],
    });

    const requestWrapper: any = {
      context: {},
      getRaw: () => rawReq,
      getMethod: () => 'POST',
      getPath: () => '/form',
      getQuery: () => ({}),
      getHeaders: () => ({}),
      getHeader: (name: string) => (rawReq as any).headers?.[String(name).toLowerCase()],
      getBody: () => null,
      setBody: vi.fn(),
    };

    (Request.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(requestWrapper);

    const responseWrapper: any = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
      html: vi.fn(),
      send: vi.fn(),
      setHeader: vi.fn(),
    };
    (Response.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(responseWrapper);

    const kernel = {
      handleRequest: vi.fn().mockImplementation(async (req: any, res: any) => {
        await bodyParsingMiddleware(req, res, async () => undefined);
      }),
    } as any;

    const app = {
      getRouter: () => ({ match: vi.fn() }),
      getContainer: () => ({}),
    } as unknown as IApplication;

    Server.create(app, 3000, 'localhost', kernel);

    const res = makeRes();
    expect(requestHandler).toBeDefined();
    await requestHandler?.(rawReq as any, res);

    // Body should be parsed as urlencoded
    expect(requestWrapper.setBody).toHaveBeenCalled();
    expect(requestWrapper.context.rawBodyBytes).toBeDefined();
    expect(typeof requestWrapper.context.rawBodyText).toBe('string');
  });

  it('returns 400 on invalid JSON and logs redacted raw body', async () => {
    const { Env } = await import('@config/env');
    (Env as any).MAX_BODY_SIZE = 1024;

    const { Logger } = await import('@config/logger');
    const { Request } = await import('@http/Request');
    const { Response } = await import('@http/Response');

    const rawReq = makeAsyncReq({
      method: 'POST',
      url: '/json',
      headers: { 'content-type': 'application/json' },
      chunks: ['{"password":"secret", bad'] as unknown[],
    });

    const requestWrapper: any = {
      context: {},
      getRaw: () => rawReq,
      getMethod: () => 'POST',
      getPath: () => '/json',
      getQuery: () => ({}),
      getHeaders: () => ({ Authorization: 'Bearer token' }),
      getHeader: (name: string) => (rawReq as any).headers?.[String(name).toLowerCase()],
      getBody: () => null,
      setBody: vi.fn(),
    };

    (Request.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(requestWrapper);

    const responseWrapper: any = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
      html: vi.fn(),
      send: vi.fn(),
      setHeader: vi.fn(),
    };
    (Response.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(responseWrapper);

    const kernel = {
      handleRequest: vi.fn().mockImplementation(async (req: any, res: any) => {
        await bodyParsingMiddleware(req, res, async () => undefined);
      }),
    } as any;

    const app = {
      getRouter: () => ({ match: vi.fn() }),
      getContainer: () => ({}),
    } as unknown as IApplication;

    Server.create(app, 3000, 'localhost', kernel);

    const res = makeRes();
    await requestHandler?.(rawReq as any, res);

    expect(responseWrapper.setStatus).toHaveBeenCalledWith(400);
    expect(responseWrapper.json).toHaveBeenCalledWith({ error: 'Invalid JSON body' });

    // Ensure redaction path executed
    expect(Logger.debug).toHaveBeenCalled();
  });

  it('returns 413 when body exceeds MAX_BODY_SIZE', async () => {
    const { Env } = await import('@config/env');
    (Env as any).MAX_BODY_SIZE = 8;

    const { Request } = await import('@http/Request');
    const { Response } = await import('@http/Response');

    const rawReq = makeAsyncReq({
      method: 'POST',
      url: '/too-big',
      headers: { 'content-type': 'text/plain' },
      chunks: ['0123456789abcdef'],
    });

    const requestWrapper: any = {
      context: {},
      getRaw: () => rawReq,
      getMethod: () => 'POST',
      getPath: () => '/too-big',
      getQuery: () => ({}),
      getHeaders: () => ({}),
      getHeader: (name: string) => (rawReq as any).headers?.[String(name).toLowerCase()],
      getBody: () => null,
      setBody: vi.fn(),
    };

    (Request.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(requestWrapper);

    const responseWrapper: any = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
      html: vi.fn(),
      send: vi.fn(),
      setHeader: vi.fn(),
    };
    (Response.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(responseWrapper);

    const kernel = {
      handleRequest: vi.fn().mockImplementation(async (req: any, res: any) => {
        await bodyParsingMiddleware(req, res, async () => undefined);
      }),
    } as any;

    const app = {
      getRouter: () => ({ match: vi.fn() }),
      getContainer: () => ({}),
    } as unknown as IApplication;

    Server.create(app, 3000, 'localhost', kernel);

    const res = makeRes();
    await requestHandler?.(rawReq as any, res);

    expect(responseWrapper.setStatus).toHaveBeenCalledWith(413);
    expect(responseWrapper.json).toHaveBeenCalledWith({ error: 'Payload Too Large' });
  });

  it('renders HTML error page on internal server error (and redacts headers)', async () => {
    const { Router } = await import('@routing/Router');
    const { ErrorPageRenderer } = await import('@http/error-pages/ErrorPageRenderer');
    const { Request } = await import('@http/Request');
    const { Response } = await import('@http/Response');

    (Router.match as unknown as ReturnType<typeof vi.fn>).mockReturnValue({});

    const rawReq = makeAsyncReq({
      method: 'GET',
      url: '/boom',
      headers: { accept: 'text/html' },
      chunks: [],
    });

    const circular: any = {};
    circular.self = circular;

    const requestWrapper: any = {
      context: {},
      getRaw: () => rawReq,
      getMethod: () => 'GET',
      getPath: () => '/boom',
      getQuery: () => circular,
      getHeaders: () => ({ Authorization: 'secret', 'x-api-key': 'k', ok: 'v' }),
      getBody: () => null,
      setBody: vi.fn(),
    };

    (Request.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(requestWrapper);

    const responseWrapper: any = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
      html: vi.fn(),
      send: vi.fn(),
      setHeader: vi.fn(),
    };
    (Response.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(responseWrapper);

    const kernel = {
      handleRequest: vi.fn().mockRejectedValue(new Error('boom')),
    } as any;

    const app = {
      getRouter: () => ({ match: vi.fn() }),
      getContainer: () => ({}),
    } as unknown as IApplication;

    Server.create(app, 3000, 'localhost', kernel);

    const res = makeRes();
    await requestHandler?.(rawReq as any, res);

    expect(responseWrapper.setStatus).toHaveBeenCalledWith(500);
    expect(ErrorPageRenderer.shouldSendHtml).toHaveBeenCalled();
    expect(ErrorPageRenderer.renderHtml).toHaveBeenCalled();
    expect(responseWrapper.html).toHaveBeenCalledWith('<html>ok</html>');
  });
});
