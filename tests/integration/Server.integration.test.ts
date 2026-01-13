import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_MAX_BODY_SIZE = process.env['MAX_BODY_SIZE'];

beforeEach(() => {
  vi.resetAllMocks();

  // Ensure tests don't leak MAX_BODY_SIZE overrides across cases.
  if (ORIGINAL_MAX_BODY_SIZE === undefined) {
    delete process.env['MAX_BODY_SIZE'];
  } else {
    process.env['MAX_BODY_SIZE'] = ORIGINAL_MAX_BODY_SIZE;
  }
});

const makeReq = (
  chunks: unknown[],
  opts?: { method?: string; url?: string; headers?: Record<string, string> }
) => {
  const iterator = (async function* () {
    for (const c of chunks) {
      yield c;
    }
  })();

  const req: any = {
    method: opts?.method ?? 'POST',
    url: opts?.url ?? '/test',
    headers: opts?.headers ?? { 'content-type': 'application/x-www-form-urlencoded' },
    socket: { remoteAddress: '127.0.0.1' },
    destroy: () => {},
    [Symbol.asyncIterator]: () => iterator,
  };
  return req;
};

const makeRes = () => {
  const calls: any = {};
  const headers: Record<string, string> = {};
  return {
    statusCode: 0,
    headers,
    setStatus: (s: number) => ({ json: (payload: any) => (calls.payload = payload), status: s }),
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
    writeHead: (s: number, h: Record<string, string>) => {
      calls.status = s;
      calls.headers = h;
    },
    end: (payload?: any) => {
      calls.ended = payload;
    },
    _calls: calls,
  } as any;
};

describe('Server integration - body parsing and oversized payloads', () => {
  it('parses application/x-www-form-urlencoded into arrays when keys repeat', async () => {
    vi.resetModules();
    vi.unmock('@node-singletons/http');

    const { Router } = await import('@routing/Router');
    const router = Router.createRouter();

    Router.post(router, '/test', (req: any, res: any) => {
      res.json({ body: req.getBody ? req.getBody() : req.body });
    });

    const app = { getRouter: () => router } as any;

    // Provide a tiny kernel stub so this test is isolated from global middleware
    // like CSRF, while still exercising Server body parsing.
    const kernel = {
      handleRequest: async (req: any, res: any) => {
        const { bodyParsingMiddleware } = await import('@http/middleware/BodyParsingMiddleware');
        await bodyParsingMiddleware(req, res, async () => undefined);

        const match = Router.match(router, req.getMethod(), req.getPath());
        if (match === null) {
          res.setStatus(404).json({ error: 'Not Found' });
          return;
        }
        req.setParams(match.params ?? {});
        await match.handler(req, res);
      },
    };

    const { Server } = await import('@boot/Server');

    const server = Server.create(app, 0, '127.0.0.1', kernel as any);
    const httpServer = server.getHttpServer();

    const req = makeReq(['a=1&a=2&b=3'], {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    const res = makeRes();

    const p = new Promise<string>((resolve) => {
      res.end = (payload?: any) => {
        res._calls.ended = payload;
        resolve(String(payload ?? ''));
      };
    });

    // Emit request
    (httpServer as any).emit('request', req, res);

    const ended = await p;
    expect(JSON.parse(ended)).toEqual({ body: { a: ['1', '2'], b: '3' } });
  });

  it('returns 413 when body exceeds MAX_BODY_SIZE', async () => {
    vi.resetModules();
    vi.unmock('@node-singletons/http');

    process.env['MAX_BODY_SIZE'] = '10';

    const { Router } = await import('@routing/Router');
    const router = Router.createRouter();

    Router.post(router, '/test', (req: any, res: any) => {
      res.json({ body: req.getBody ? req.getBody() : req.body });
    });

    const app = { getRouter: () => router } as any;

    const kernel = {
      handleRequest: async (req: any, res: any) => {
        const { bodyParsingMiddleware } = await import('@http/middleware/BodyParsingMiddleware');
        await bodyParsingMiddleware(req, res, async () => undefined);

        const match = Router.match(router, req.getMethod(), req.getPath());
        if (match === null) {
          res.setStatus(404).json({ error: 'Not Found' });
          return;
        }
        req.setParams(match.params ?? {});
        await match.handler(req, res);
      },
    };
    const { Server } = await import('@boot/Server');

    const server = Server.create(app, 0, '127.0.0.1', kernel as any);
    const httpServer = server.getHttpServer();

    const req = makeReq(['01234567', '89AB'], { headers: { 'content-type': 'text/plain' } });
    const res = makeRes();

    const p = new Promise<string>((resolve) => {
      res.end = (payload?: any) => {
        res._calls.ended = payload;
        resolve(String(payload ?? ''));
      };
    });

    (httpServer as any).emit('request', req, res);

    const ended = await p;
    expect(JSON.parse(ended)).toEqual({ error: 'Payload Too Large' });
  });

  it('handles mixed chunk types and sets raw text body for non-JSON content', async () => {
    vi.resetModules();
    vi.unmock('@node-singletons/http');

    const { Router } = await import('@routing/Router');
    const router = Router.createRouter();

    Router.post(router, '/test', (req: any, res: any) => {
      res.json({ body: req.getBody ? req.getBody() : req.body });
    });

    const app = { getRouter: () => router } as any;

    const kernel = {
      handleRequest: async (req: any, res: any) => {
        const { bodyParsingMiddleware } = await import('@http/middleware/BodyParsingMiddleware');
        await bodyParsingMiddleware(req, res, async () => undefined);

        const match = Router.match(router, req.getMethod(), req.getPath());
        if (match === null) {
          res.setStatus(404).json({ error: 'Not Found' });
          return;
        }
        req.setParams(match.params ?? {});
        await match.handler(req, res);
      },
    };
    const { Server } = await import('@boot/Server');

    const server = Server.create(app, 0, '127.0.0.1', kernel as any);
    const httpServer = server.getHttpServer();

    const arrBuf = new Uint8Array([65, 66, 67]).buffer; // 'ABC'
    const req = makeReq(['hello-', Buffer.from('world'), new Uint8Array([33]), arrBuf], {
      headers: { 'content-type': 'text/plain' },
    });
    const res = makeRes();

    const p = new Promise<string>((resolve) => {
      res.end = (payload?: any) => {
        res._calls.ended = payload;
        resolve(String(payload ?? ''));
      };
    });

    (httpServer as any).emit('request', req, res);

    const ended = await p;
    const parsed = JSON.parse(ended) as { body: string };
    expect(typeof parsed.body).toBe('string');
    expect(parsed.body).toContain('hello-');
    expect(parsed.body).toContain('world');
    expect(parsed.body).toContain('ABC');
  });
});
