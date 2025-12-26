import type { IServiceContainer } from '@container/ServiceContainer';
import { Kernel } from '@http/Kernel';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import type { IRouter } from '@routing/Router';
import { Router } from '@routing/Router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

// Keep this test focused: no default framework middleware.
vi.mock('@config/middleware', () => ({
  middlewareConfig: {
    global: [],
    route: {},
  },
}));

vi.mock('@routing/Router', async () => {
  const actual = await vi.importActual<typeof import('@routing/Router')>('@routing/Router');
  return {
    ...actual,
    Router: {
      ...actual.Router,
      match: vi.fn(),
    },
  };
});

describe('Kernel middleware order', () => {
  let mockRouter: IRouter;
  let mockContainer: IServiceContainer;
  let mockReq: IRequest;
  let mockRes: IResponse;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRouter = { routes: [] } as unknown as IRouter;
    mockContainer = {} as unknown as IServiceContainer;

    mockReq = {
      getMethod: vi.fn(() => 'GET'),
      getPath: vi.fn(() => '/test'),
      getHeader: vi.fn(() => undefined),
      setParams: vi.fn(),
      context: {},
    } as unknown as IRequest;

    mockRes = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
      getRaw: vi.fn(() => ({ writableEnded: false })),
      locals: {},
    } as unknown as IResponse;
  });

  it('runs global middleware in registration order and wraps route + handler (onion model)', async () => {
    const kernel = Kernel.create(mockRouter, mockContainer);
    const events: string[] = [];

    kernel.registerGlobalMiddleware(async (_req, _res, next) => {
      events.push('g1-before');
      await next();
      events.push('g1-after');
    });

    kernel.registerGlobalMiddleware(async (_req, _res, next) => {
      events.push('g2-before');
      await next();
      events.push('g2-after');
    });

    kernel.registerRouteMiddleware('r1', async (_req, _res, next) => {
      events.push('r1-before');
      await next();
      events.push('r1-after');
    });

    vi.mocked(Router.match).mockReturnValue({
      params: {},
      middleware: ['r1'],
      handler: async () => {
        events.push('handler');
      },
    } as any);

    await kernel.handleRequest(mockReq, mockRes);

    expect(events).toEqual([
      'g1-before',
      'g2-before',
      'r1-before',
      'handler',
      'r1-after',
      'g2-after',
      'g1-after',
    ]);
  });

  it('respects route middleware name list order (not registration order)', async () => {
    const kernel = Kernel.create(mockRouter, mockContainer);
    const events: string[] = [];

    kernel.registerGlobalMiddleware(async (_req, _res, next) => {
      events.push('g-before');
      await next();
      events.push('g-after');
    });

    kernel.registerRouteMiddleware('r1', async (_req, _res, next) => {
      events.push('r1-before');
      await next();
      events.push('r1-after');
    });

    kernel.registerRouteMiddleware('r2', async (_req, _res, next) => {
      events.push('r2-before');
      await next();
      events.push('r2-after');
    });

    vi.mocked(Router.match).mockReturnValue({
      params: {},
      middleware: ['r2', 'r1'],
      handler: async () => {
        events.push('handler');
      },
    } as any);

    await kernel.handleRequest(mockReq, mockRes);

    expect(events).toEqual([
      'g-before',
      'r2-before',
      'r1-before',
      'handler',
      'r1-after',
      'r2-after',
      'g-after',
    ]);
  });

  it('does not call downstream middleware/handler when next() is not called', async () => {
    const kernel = Kernel.create(mockRouter, mockContainer);
    const events: string[] = [];

    kernel.registerGlobalMiddleware(async (_req, _res, _next) => {
      events.push('block');
      // Intentionally do not call next()
    });

    kernel.registerRouteMiddleware('r1', async (_req, _res, next) => {
      events.push('r1');
      await next();
    });

    const handler = vi.fn(async () => {
      events.push('handler');
    });

    vi.mocked(Router.match).mockReturnValue({
      params: {},
      middleware: ['r1'],
      handler,
    } as any);

    await kernel.handleRequest(mockReq, mockRes);

    expect(events).toEqual(['block']);
    expect(handler).not.toHaveBeenCalled();
  });
});
