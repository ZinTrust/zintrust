import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => {
  const Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    scope: vi.fn(),
  };
  return { Logger };
});

type ResState = { statusCode: number; jsonBody: unknown };

function createReq(authorizationHeader: unknown): IRequest {
  const req = {
    context: {},
    getHeader: (name: string): unknown => {
      if (name.toLowerCase() !== 'authorization') return undefined;
      return authorizationHeader;
    },
  };

  return req as unknown as IRequest;
}

function createRes(): { res: IResponse; state: ResState } {
  const state: ResState = { statusCode: 200, jsonBody: undefined };

  const res = {
    setStatus: (code: number): IResponse => {
      state.statusCode = code;
      return res as unknown as IResponse;
    },
    json: (body: unknown): void => {
      state.jsonBody = body;
    },
  };

  return { res: res as unknown as IResponse, state };
}

describe('ServiceAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.SERVICE_API_KEY = 'key123';
    process.env.SERVICE_JWT_SECRET = 'secret123';
  });

  it('strategy none attaches context and calls next', async () => {
    const mod = await import('@/microservices/ServiceAuthMiddleware');
    const mw = mod.ServiceAuthMiddleware;

    const req = createReq(undefined);
    const { res, state } = createRes();
    const next = vi.fn();

    await mw.middleware('none')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(state.jsonBody).toBeUndefined();

    const ctx = req.context['serviceAuth'] as {
      isServiceCall: boolean;
      strategy: string;
      authenticated: boolean;
    };

    expect(ctx.strategy).toBe('none');
    expect(ctx.authenticated).toBe(true);
    expect(ctx.isServiceCall).toBe(false);
  });

  it('missing authorization returns 401 and does not call next', async () => {
    const mod = await import('@/microservices/ServiceAuthMiddleware');
    const mw = mod.ServiceAuthMiddleware;

    const req = createReq(undefined);
    const { res, state } = createRes();
    const next = vi.fn();

    await mw.middleware('api-key')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(401);
    expect(state.jsonBody).toEqual({ error: 'Missing or invalid authorization header' });
  });

  it('non-string authorization returns 401', async () => {
    const mod = await import('@/microservices/ServiceAuthMiddleware');
    const mw = mod.ServiceAuthMiddleware;

    const req = createReq(['Bearer', 'x']);
    const { res, state } = createRes();
    const next = vi.fn();

    await mw.middleware('api-key')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(401);
  });

  it('api-key with invalid scheme returns 403', async () => {
    const mod = await import('@/microservices/ServiceAuthMiddleware');
    const mw = mod.ServiceAuthMiddleware;

    const req = createReq('Basic key123');
    const { res, state } = createRes();
    const next = vi.fn();

    await mw.middleware('api-key')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(403);
    expect(state.jsonBody).toEqual({ error: 'Invalid API key' });
  });

  it('api-key with correct token authenticates and calls next', async () => {
    const mod = await import('@/microservices/ServiceAuthMiddleware');
    const mw = mod.ServiceAuthMiddleware;

    const req = createReq('Bearer key123');
    const { res } = createRes();
    const next = vi.fn();

    await mw.middleware('api-key')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const ctx = req.context['serviceAuth'] as {
      isServiceCall: boolean;
      strategy: string;
      authenticated: boolean;
      serviceName?: string;
    };

    expect(ctx.strategy).toBe('api-key');
    expect(ctx.authenticated).toBe(true);
    expect(ctx.isServiceCall).toBe(true);
    expect(ctx.serviceName).toBeUndefined();
  });

  it('jwt with invalid scheme returns 401', async () => {
    const mod = await import('@/microservices/ServiceAuthMiddleware');
    const mw = mod.ServiceAuthMiddleware;

    const req = createReq('Basic abc');
    const { res, state } = createRes();
    const next = vi.fn();

    await mw.middleware('jwt')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(401);
    expect(state.jsonBody).toEqual({ error: 'Invalid authorization scheme' });
  });

  it('jwt with invalid token returns 403', async () => {
    const mod = await import('@/microservices/ServiceAuthMiddleware');
    const mw = mod.ServiceAuthMiddleware;

    const req = createReq('Bearer not-a-jwt');
    const { res, state } = createRes();
    const next = vi.fn();

    await mw.middleware('jwt')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(403);
    expect(state.jsonBody).toEqual({ error: 'Invalid JWT token' });
  });

  it('jwt with valid token sets serviceName and calls next', async () => {
    const mod = await import('@/microservices/ServiceAuthMiddleware');
    const mw = mod.ServiceAuthMiddleware;
    const jwt = mod.JwtAuth.create('secret123');

    const token = jwt.sign({ serviceName: 'billing' });

    const req = createReq(`Bearer ${token}`);
    const { res } = createRes();
    const next = vi.fn();

    await mw.middleware('jwt')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const ctx = req.context['serviceAuth'] as {
      isServiceCall: boolean;
      strategy: string;
      authenticated: boolean;
      serviceName?: string;
    };

    expect(ctx.strategy).toBe('jwt');
    expect(ctx.isServiceCall).toBe(true);
    expect(ctx.authenticated).toBe(true);
    expect(ctx.serviceName).toBe('billing');
  });

  it('jwt payload serviceName non-string becomes empty string', async () => {
    const mod = await import('@/microservices/ServiceAuthMiddleware');
    const mw = mod.ServiceAuthMiddleware;
    const jwt = mod.JwtAuth.create('secret123');

    const token = jwt.sign({ serviceName: 123 });

    const req = createReq(`Bearer ${token}`);
    const { res } = createRes();
    const next = vi.fn();

    await mw.middleware('jwt')(req, res, next);

    const ctx = req.context['serviceAuth'] as { serviceName?: string };
    expect(ctx.serviceName).toBe('');
  });

  it('custom strategy without validator returns 403', async () => {
    const mod = await import('@/microservices/ServiceAuthMiddleware');
    const mw = mod.ServiceAuthMiddleware;

    const req = createReq('Bearer ok');
    const { res, state } = createRes();
    const next = vi.fn();

    await mw.middleware('custom')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(403);
    expect(state.jsonBody).toEqual({ error: 'Authentication failed' });
  });

  it('custom strategy with validator authenticates and calls next', async () => {
    const mod = await import('@/microservices/ServiceAuthMiddleware');
    const mw = mod.ServiceAuthMiddleware;

    mw.registerCustomAuth((token: string) => token === 'ok');

    const req = createReq('Bearer ok');
    const { res } = createRes();
    const next = vi.fn();

    await mw.middleware('custom')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const ctx = req.context['serviceAuth'] as {
      isServiceCall: boolean;
      authenticated: boolean;
    };

    expect(ctx.isServiceCall).toBe(true);
    expect(ctx.authenticated).toBe(true);
  });

  it('unsupported strategy returns 401', async () => {
    const mod = await import('@/microservices/ServiceAuthMiddleware');
    const mw = mod.ServiceAuthMiddleware;
    const unsupported = 'unsupported' as unknown as import('@/microservices/ServiceAuthMiddleware').AuthStrategy;

    const req = createReq('Bearer x');
    const { res, state } = createRes();
    const next = vi.fn();

    await mw.middleware(unsupported)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(401);
    expect(state.jsonBody).toEqual({ error: 'Unsupported strategy' });
  });
});
