import { beforeEach, describe, expect, it, vi } from 'vitest';

const pwd = 'pwd'; //NOSONAR

const makeReqRes = (overrides: any = {}) => {
  const resCalls: any = {};
  const res: any = {
    status: (s: number) => {
      resCalls.status = s;
      return { json: (p: any) => (resCalls.payload = p) };
    },
    setStatus: (s: number) => {
      resCalls.status = s;
      return { json: (p: any) => (resCalls.payload = p) };
    },
    json: (p: any) => (resCalls.payload = p),
    _calls: resCalls,
  };

  const req: any = {
    body: {},
    params: {},
    getRaw: () => ({ socket: { remoteAddress: '127.0.0.1' } }),
    getHeader: (_h: string) => overrides.header,
    user: overrides.user,
  };
  return { req, res };
};

describe('AuthController targeted branches', () => {
  beforeEach(() => vi.resetModules());

  it('login: returns 500 when validated body missing', async () => {
    vi.doMock('@http/ValidationHelper', () => ({ getValidatedBody: () => undefined }));
    const { default: AuthController } = await import('@app/Controllers/AuthController');
    const { req, res } = makeReqRes();
    await AuthController.create().login(req, res);
    expect(res._calls.status).toBe(500);
    expect(res._calls.payload).toEqual({ error: 'Internal server error' });
  });

  it('login: returns 401 when user not found', async () => {
    vi.doMock('@http/ValidationHelper', () => ({
      getValidatedBody: () => ({ email: 'a@b', password: pwd }),
    }));
    vi.doMock('@app/Models/User', () => ({
      User: { where: () => ({ limit: () => ({ first: async () => null }) }) },
    }));
    const { default: AuthController } = await import('@app/Controllers/AuthController');
    const { req, res } = makeReqRes();
    await AuthController.create().login(req, res);
    expect(res._calls.status).toBe(401);
    expect(res._calls.payload).toEqual({ error: 'Invalid credentials' });
  });

  it('login: returns 401 when password mismatch', async () => {
    vi.doMock('@http/ValidationHelper', () => ({
      getValidatedBody: () => ({ email: 'a@b', password: pwd }),
    }));
    vi.doMock('@app/Models/User', () => ({
      User: {
        where: () => ({ limit: () => ({ first: async () => ({ id: '1', password: pwd }) }) }),
      },
    }));
    vi.doMock('@auth/Auth', () => ({ Auth: { compare: async () => false } }));
    const { default: AuthController } = await import('@app/Controllers/AuthController');
    const { req, res } = makeReqRes();
    await AuthController.create().login(req, res);
    expect(res._calls.status).toBe(401);
    expect(res._calls.payload).toEqual({ error: 'Invalid credentials' });
  });

  it('login: successful login when subject undefined still returns token', async () => {
    vi.doMock('@http/ValidationHelper', () => ({
      getValidatedBody: () => ({ email: 'a@b', password: pwd }),
    }));
    vi.doMock('@app/Models/User', () => ({
      User: {
        where: () => ({
          limit: () => ({
            first: async () => ({ id: null, password: pwd, name: 'N', email: 'a@b' }),
          }),
        }),
      },
    }));
    vi.doMock('@auth/Auth', () => ({ Auth: { compare: async () => true } }));
    vi.doMock('@security/JwtManager', () => ({ JwtManager: { signAccessToken: () => 'tok' } }));
    const { default: AuthController } = await import('@app/Controllers/AuthController');
    const { req, res } = makeReqRes();
    await AuthController.create().login(req, res);
    expect(typeof res._calls.payload).toBe('object');
    expect(res._calls.payload).toHaveProperty('token');
  });

  it('register: returns 409 when email already exists', async () => {
    vi.doMock('@http/ValidationHelper', () => ({
      getValidatedBody: () => ({ name: 'A', email: 'a@b', password: pwd }),
    }));
    vi.doMock('@app/Models/User', () => ({
      User: {
        where: () => ({ limit: () => ({ first: async () => ({ id: '1' }) }) }),
        query: () => ({ insert: async () => ({ id: 2 }) }),
      },
    }));
    const { default: AuthController } = await import('@app/Controllers/AuthController');
    const { req, res } = makeReqRes();
    await AuthController.create().register(req, res);
    expect(res._calls.status).toBe(409);
    expect(res._calls.payload).toEqual({ error: 'Email already registered' });
  });

  it('register: returns 500 when insert returns no id', async () => {
    vi.doMock('@http/ValidationHelper', () => ({
      getValidatedBody: () => ({ name: 'A', email: 'a@b', password: pwd }),
    }));
    vi.doMock('@auth/Auth', () => ({ Auth: { hash: async () => 'h' } }));
    vi.doMock('@app/Models/User', () => ({
      User: {
        where: () => ({ limit: () => ({ first: async () => null }) }),
        query: () => ({ insert: async () => ({}) }),
      },
    }));
    const { default: AuthController } = await import('@app/Controllers/AuthController');
    const { req, res } = makeReqRes();
    await AuthController.create().register(req, res);
    expect(res._calls.status).toBe(500);
    expect(res._calls.payload).toEqual({ error: 'Registration failed' });
  });

  it('logout: revokes token and returns message', async () => {
    const revokeSpy = vi.fn();
    vi.doMock('@security/TokenRevocation', () => ({ TokenRevocation: { revoke: revokeSpy } }));
    const { default: AuthController } = await import('@app/Controllers/AuthController');
    const { req, res } = makeReqRes({ header: 'Bearer tok' });
    await AuthController.create().logout(req, res);
    expect(revokeSpy).toHaveBeenCalledWith('Bearer tok');
    expect(res._calls.payload).toEqual({ message: 'Logged out' });
  });

  it('refresh: returns 401 when user missing', async () => {
    const { default: AuthController } = await import('@app/Controllers/AuthController');
    const { req, res } = makeReqRes({ user: undefined });
    await AuthController.create().refresh(req, res);
    expect(res._calls.status).toBe(401);
    expect(res._calls.payload).toEqual({ error: 'Unauthorized' });
  });

  it('refresh: returns token when user present', async () => {
    vi.doMock('@security/JwtManager', () => ({
      JwtManager: { signAccessToken: (_u: any) => 'ntok' },
    }));
    const { default: AuthController } = await import('@app/Controllers/AuthController');
    const { req, res } = makeReqRes({ user: { sub: '1', email: 'a@b' } });
    await AuthController.create().refresh(req, res);
    expect(res._calls.payload).toEqual({ token: 'ntok', token_type: 'Bearer' });
  });
});
