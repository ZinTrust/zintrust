import type { IServiceContainer } from '@container/ServiceContainer';
import { Kernel } from '@http/Kernel';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import type { IRouter } from '@routing/Router';
import { Router } from '@routing/Router';
import { Schema } from '@validation/Validator';
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

// Keep this test focused on route middleware. No default framework middleware.
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

function createReq(overrides?: Partial<IRequest>): IRequest {
  const req: IRequest = {
    getMethod: vi.fn(() => 'POST'),
    getPath: vi.fn(() => '/test'),
    getHeader: vi.fn(() => undefined),
    setParams: vi.fn(),
    params: {},
    body: {},
    context: {},
  } as unknown as IRequest;

  return Object.assign(req, overrides ?? {});
}

function createRes(): IResponse {
  const res: IResponse = {
    setStatus: vi.fn().mockReturnThis(),
    json: vi.fn(),
    getRaw: vi.fn(() => ({ writableEnded: false })),
    locals: {},
  } as unknown as IResponse;

  return res;
}

describe('Kernel route middleware: auth/jwt/validation', () => {
  let mockRouter: IRouter;
  let mockContainer: IServiceContainer;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRouter = { routes: [] } as unknown as IRouter;
    mockContainer = {} as unknown as IServiceContainer;
  });

  it('auth middleware blocks when Authorization missing', async () => {
    const { authMiddleware } = await import('@app/Middleware');

    const kernel = Kernel.create(mockRouter, mockContainer);
    kernel.registerRouteMiddleware('auth', authMiddleware);

    const handler = vi.fn(async () => undefined);

    vi.mocked(Router.match).mockReturnValue({
      params: {},
      middleware: ['auth'],
      handler,
    } as any);

    const req = createReq({
      getHeader: vi.fn(() => undefined),
    });
    const res = createRes();

    await kernel.handleRequest(req, res);

    expect(res.setStatus).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('jwt middleware sets req.user and allows handler for valid bearer', async () => {
    const { jwtMiddleware } = await import('@app/Middleware');

    const verify = vi.fn(() => ({ sub: '123', role: 'user' }));
    const kernel = Kernel.create(mockRouter, mockContainer);
    kernel.registerRouteMiddleware('jwt', jwtMiddleware({ verify } as any));

    const handler = vi.fn(async (req: IRequest, res: IResponse) => {
      res.json({ user: (req as any).user });
    });

    vi.mocked(Router.match).mockReturnValue({
      params: {},
      middleware: ['jwt'],
      handler,
    } as any);

    const req = createReq({
      getHeader: vi.fn((name: string) =>
        name.toLowerCase() === 'authorization' ? 'Bearer good' : undefined
      ),
    });
    const res = createRes();

    await kernel.handleRequest(req, res);

    expect(verify).toHaveBeenCalled();
    expect(handler).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ user: { sub: '123', role: 'user' } });
  });

  it('validation middleware returns 422 on invalid body', async () => {
    const { validationMiddleware } = await import('@app/Middleware');

    const schema = Schema.create().required('name').string('name').minLength('name', 1);

    const kernel = Kernel.create(mockRouter, mockContainer);
    kernel.registerRouteMiddleware('validate', validationMiddleware(schema));

    const handler = vi.fn(async () => undefined);

    vi.mocked(Router.match).mockReturnValue({
      params: {},
      middleware: ['validate'],
      handler,
    } as any);

    const req = createReq({
      body: {},
      getMethod: vi.fn(() => 'POST'),
    });
    const res = createRes();

    await kernel.handleRequest(req, res);

    expect(res.setStatus).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ errors: expect.any(Object) });
    expect(handler).not.toHaveBeenCalled();
  });

  it('middleware order stops downstream when auth fails', async () => {
    const { authMiddleware, validationMiddleware } = await import('@app/Middleware');

    const schema = Schema.create().required('name').string('name').minLength('name', 1);
    const validate = vi.fn(validationMiddleware(schema));

    const kernel = Kernel.create(mockRouter, mockContainer);
    kernel.registerRouteMiddleware('auth', authMiddleware);
    kernel.registerRouteMiddleware('validate', validate);

    const handler = vi.fn(async () => undefined);

    vi.mocked(Router.match).mockReturnValue({
      params: {},
      middleware: ['auth', 'validate'],
      handler,
    } as any);

    const req = createReq({
      getHeader: vi.fn(() => undefined),
      body: {},
      getMethod: vi.fn(() => 'POST'),
    });
    const res = createRes();

    await kernel.handleRequest(req, res);

    expect(res.setStatus).toHaveBeenCalledWith(401);
    expect(handler).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
  });
});
