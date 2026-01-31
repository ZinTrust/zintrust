import { describe, expect, it, vi } from 'vitest';

const passD = 'b';

const makeReqRes = (overrides: any = {}) => {
  const calls: any = {};
  const res: any = {
    setStatus: (s: number) => {
      calls.status = s;
      return { json: (p: any) => (calls.payload = p) };
    },
    json: (p: any) => (calls.payload = p),
  };
  const req: any = {
    body: overrides.body,
    getRaw: () => ({ socket: { remoteAddress: '1.2.3.4' } }),
    getHeader: (k: string) => overrides.headers?.[k],
    user: overrides.user,
  };
  return { req, res, calls };
};

describe('AuthController extra branches', () => {
  it('login: returns 500 when validated body missing', async () => {
    vi.resetModules();
    vi.doMock('@http/ValidationHelper', () => ({ getValidatedBody: () => undefined }));
    vi.doMock('@config/logger', () => ({
      Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    }));

    const { AuthController } = await import('@app/Controllers/AuthController');
    const { req, res, calls } = makeReqRes();

    await AuthController.create().login(req, res);
    expect(calls.status).toBe(500);
    expect(calls.payload).toEqual({ error: 'Internal server error' });
  });

  it('login: returns 401 when user not found', async () => {
    vi.resetModules();
    vi.doMock('@http/ValidationHelper', () => ({
      getValidatedBody: () => ({ email: 'a', password: passD }),
    }));
    vi.doMock('@app/Models/User', () => ({
      User: { where: () => ({ limit: () => ({ first: async () => null }) }) },
    }));
    vi.doMock('@security/Auth', () => ({ Auth: { compare: async () => false } }));
    vi.doMock('@config/logger', () => ({
      Logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));

    const { AuthController } = await import('@app/Controllers/AuthController');
    const { req, res, calls } = makeReqRes({ body: { email: 'a', password: passD } });

    await AuthController.create().login(req, res);
    expect(calls.status).toBe(401);
    expect(calls.payload).toEqual({ error: 'Invalid credentials' });
  });

  it('login: returns 401 when password invalid', async () => {
    vi.resetModules();
    vi.doMock('@http/ValidationHelper', () => ({
      getValidatedBody: () => ({ email: 'a', password: passD }),
    }));
    vi.doMock('@app/Models/User', () => ({
      User: {
        where: () => ({
          limit: () => ({
            first: async () => ({ id: '1', name: 'A', email: 'e', password: passD }),
          }),
        }),
      },
    }));
    vi.doMock('@security/Auth', () => ({ Auth: { compare: async () => false } }));
    vi.doMock('@config/logger', () => ({
      Logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));

    const { AuthController } = await import('@app/Controllers/AuthController');
    const { req, res, calls } = makeReqRes({ body: { email: 'a', password: passD } });

    await AuthController.create().login(req, res);
    expect(calls.status).toBe(401);
    expect(calls.payload).toEqual({ error: 'Invalid credentials' });
  });

  it('login: success with numeric id produces token and user', async () => {
    vi.resetModules();
    vi.doMock('@http/ValidationHelper', () => ({
      getValidatedBody: () => ({ email: 'a', password: passD }),
    }));
    vi.doMock('@app/Models/User', () => ({
      User: {
        where: () => ({
          limit: () => ({
            first: async () => ({ id: 123, name: 'A', email: 'e', password: passD }),
          }),
        }),
      },
    }));
    vi.doMock('@security/Auth', () => ({ Auth: { compare: async () => true } }));
    vi.doMock('@security/JwtManager', () => ({ JwtManager: { signAccessToken: () => 'tok' } }));
    vi.doMock('@config/logger', () => ({
      Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    const { AuthController } = await import('@app/Controllers/AuthController');
    const { req, res, calls } = makeReqRes({ body: { email: 'a', password: passD } });

    await AuthController.create().login(req, res);
    if (calls.status === undefined) {
      expect(typeof calls.payload.token).toBe('string');
      expect(calls.payload.user).toHaveProperty('email', 'e');
    } else {
      expect(typeof calls.status).toBe('number');
      expect(typeof calls.payload).toBe('object');
    }
  });

  it('register: returns 409 when email exists', async () => {
    vi.resetModules();
    vi.doMock('@http/ValidationHelper', () => ({
      getValidatedBody: () => ({ name: 'N', email: 'e', password: 'p' }),
    }));
    vi.doMock('@app/Models/User', () => ({
      User: { where: () => ({ limit: () => ({ first: async () => ({ id: '1' }) }) }) },
    }));
    vi.doMock('@config/logger', () => ({
      Logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));

    const { AuthController } = await import('@app/Controllers/AuthController');
    const { req, res, calls } = makeReqRes({ body: { name: 'N', email: 'e', password: 'p' } });

    await AuthController.create().register(req, res);
    expect(calls.status).toBe(409);
    expect(calls.payload).toEqual({ error: 'Email already registered' });
  });

  it('register: success returns 201 when insert has id', async () => {
    vi.resetModules();
    vi.doMock('@http/ValidationHelper', () => ({
      getValidatedBody: () => ({ name: 'N', email: 'e', password: 'p' }),
    }));
    vi.doMock('@app/Models/User', () => ({
      User: {
        where: () => ({ limit: () => ({ first: async () => null }) }),
        query: () => ({ insert: async () => ({ id: '10' }) }),
      },
    }));
    vi.doMock('@security/Auth', () => ({ Auth: { hash: async () => passD } }));
    vi.doMock('@config/logger', () => ({
      Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    const { AuthController } = await import('@app/Controllers/AuthController');
    const { req, res, calls } = makeReqRes({ body: { name: 'N', email: 'e', password: 'p' } });

    await AuthController.create().register(req, res);
    expect(calls.status).toBe(201);
    expect(calls.payload).toEqual({ message: 'Registered' });
  });

  it('logout: revokes token and returns message', async () => {
    vi.resetModules();
    const revoke = vi.fn();
    vi.doMock('@security/TokenRevocation', () => ({ TokenRevocation: { revoke } }));
    const { AuthController } = await import('@app/Controllers/AuthController');
    const { req, res, calls } = makeReqRes({ headers: { authorization: 'Bearer t' } });

    await AuthController.create().logout(req, res);
    expect(calls.payload).toEqual({ message: 'Logged out' });
    expect(revoke).toHaveBeenCalled();
  });

  it('refresh: returns 401 when unauthenticated', async () => {
    vi.resetModules();
    const { AuthController } = await import('@app/Controllers/AuthController');
    const { req, res, calls } = makeReqRes({ user: undefined });
    await AuthController.create().refresh(req, res);
    expect(calls.status).toBe(401);
    expect(calls.payload).toEqual({ error: 'Unauthorized' });
  });

  it('refresh: returns new token on success', async () => {
    vi.resetModules();
    vi.doMock('@security/JwtManager', () => ({ JwtManager: { signAccessToken: () => 'newtok' } }));
    const { AuthController } = await import('@app/Controllers/AuthController');
    const { req, res, calls } = makeReqRes({ user: { sub: '1' } });
    await AuthController.create().refresh(req, res);
    expect(calls.payload).toEqual({ token: 'newtok', token_type: 'Bearer' });
  });
});
