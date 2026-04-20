import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('AuthController.login', () => {
  it('uses numeric id subject when id is number', async () => {
    vi.resetModules();
    vi.doMock('../../src/http/ValidationHelper', () => ({
      getValidatedBody: () => ({ email: 'a', password: 'b' }),
    }));

    const fakeUser = { id: 123, name: 'X', email: 'x', password: 'hash' };

    vi.doMock('@orm/Database', () => ({
      useDatabase: vi.fn(() => ({})),
    }));
    vi.doMock('@app/Models/User', () => ({
      User: {
        where: () => ({
          limit: () => ({
            first: async () => fakeUser,
          }),
          first: async () => fakeUser,
        }),
      },
    }));

    const compareSpy = vi.fn().mockResolvedValue(true);
    vi.doMock('@auth/Auth', () => ({ Auth: { compare: compareSpy } }));
    vi.doMock('@security/BulletproofDeviceStore', () => ({
      BulletproofDeviceStore: {
        upsert: vi.fn(async (record: Record<string, unknown>) => record),
      },
    }));

    const jwtSpy = vi.fn().mockReturnValue('tok');
    vi.doMock('@security/JwtManager', () => ({ JwtManager: { signAccessToken: jwtSpy } }));

    const { AuthController } = await import('../../app/Controllers/AuthController');

    const req: any = { getRaw: () => ({ socket: { remoteAddress: '1.2.3.4' } }) };
    const res: any = {
      json: (p: any) => (res.payload = p),
      setStatus: (_s: number) => ({ json: (p: any) => (res.payload = p) }),
    };

    await AuthController.create().login(req, res);

    expect(jwtSpy).toHaveBeenCalled();
    const arg = jwtSpy.mock.calls[0][0];
    expect(arg.sub).toBe('123');
  });

  it('returns 500 when validation body missing', async () => {
    vi.resetModules();
    vi.doMock('../../src/http/ValidationHelper', () => ({ getValidatedBody: () => undefined }));

    const { AuthController } = await import('../../app/Controllers/AuthController');

    const req: any = { getRaw: () => ({ socket: { remoteAddress: '1.2.3.4' } }) };
    const res: any = {
      setStatus: (s: number) => ({ json: (p: any) => (res.payload = { status: s, body: p }) }),
    };

    await AuthController.create().login(req, res);

    expect(res.payload.status).toBe(500);
    expect(res.payload.body).toEqual({ error: 'Internal server error' });
  });

  it('register: returns 500 when validation body missing', async () => {
    vi.resetModules();
    vi.doMock('../../src/http/ValidationHelper', () => ({ getValidatedBody: () => undefined }));

    const { AuthController } = await import('../../app/Controllers/AuthController');

    const req: any = { getRaw: () => ({ socket: { remoteAddress: '1.2.3.4' } }) };
    const res: any = {
      setStatus: (s: number) => ({ json: (p: any) => (res.payload = { status: s, body: p }) }),
    };

    await AuthController.create().register(req, res);

    expect(res.payload.status).toBe(500);
    expect(res.payload.body).toEqual({ error: 'Internal server error' });
  });

  it('returns 401 when the login flow reports unauthorized credentials', async () => {
    vi.resetModules();
    vi.doMock('../../src/http/ValidationHelper', () => ({
      getValidatedBody: () => ({ email: 'a', password: 'b' }),
    }));
    vi.doMock('@app/Models/User', () => ({
      User: {
        where: () => ({ first: async () => null, limit: () => ({ first: async () => null }) }),
      },
    }));
    vi.doMock('@auth/Auth', () => ({ Auth: { compare: vi.fn() } }));
    vi.doMock('@auth/LoginFlow', () => ({
      LoginFlow: {
        create: () => ({
          identify: () => ({
            verify: () => ({
              issue: () => ({
                audit: () => ({
                  run: async () => {
                    throw { details: { error: { statusCode: 401 } } };
                  },
                }),
              }),
            }),
          }),
        }),
      },
    }));

    const { AuthController } = await import('../../app/Controllers/AuthController');

    const req: any = {
      getRaw: () => ({ socket: { remoteAddress: '1.2.3.4' } }),
      getHeader: () => 'req-1',
    };
    const res: any = {
      setStatus: (s: number) => ({ json: (p: any) => (res.payload = { status: s, body: p }) }),
    };

    await AuthController.create().login(req, res);

    expect(res.payload).toEqual({
      status: 401,
      body: { error: 'Invalid credentials' },
    });
  });

  it('returns 500 when the login flow returns an invalid issued token payload', async () => {
    vi.resetModules();
    vi.doMock('../../src/http/ValidationHelper', () => ({
      getValidatedBody: () => ({ email: 'a', password: 'b' }),
    }));
    vi.doMock('@app/Models/User', () => ({
      User: {
        where: () => ({ first: async () => null, limit: () => ({ first: async () => null }) }),
      },
    }));
    vi.doMock('@auth/Auth', () => ({ Auth: { compare: vi.fn() } }));
    vi.doMock('@auth/LoginFlow', () => ({
      LoginFlow: {
        create: () => ({
          identify: () => ({
            verify: () => ({
              issue: () => ({
                audit: () => ({
                  run: async () => ({
                    verified: {
                      user: { id: 'u-1', name: 'User', email: 'u@example.com' },
                      claims: { sub: 'u-1', deviceId: 'dev-u-1' },
                    },
                    issued: { nope: 'bad' },
                  }),
                }),
              }),
            }),
          }),
        }),
      },
    }));

    const { AuthController } = await import('../../app/Controllers/AuthController');

    const req: any = {
      getRaw: () => ({ socket: { remoteAddress: '1.2.3.4' } }),
      getHeader: () => undefined,
    };
    const res: any = {
      setStatus: (s: number) => ({ json: (p: any) => (res.payload = { status: s, body: p }) }),
      json: (p: any) => (res.payload = { status: 200, body: p }),
    };

    await AuthController.create().login(req, res);

    expect(res.payload).toEqual({
      status: 500,
      body: { error: 'Login failed' },
    });
  });

  it('supports object-issued login payloads by reading issued.token', async () => {
    vi.resetModules();
    vi.doMock('../../src/http/ValidationHelper', () => ({
      getValidatedBody: () => ({ email: 'a', password: 'b' }),
    }));
    vi.doMock('@app/Models/User', () => ({
      User: {
        where: () => ({ first: async () => null, limit: () => ({ first: async () => null }) }),
      },
    }));
    vi.doMock('@auth/Auth', () => ({ Auth: { compare: vi.fn() } }));
    vi.doMock('@auth/LoginFlow', () => ({
      LoginFlow: {
        create: () => ({
          identify: () => ({
            verify: () => ({
              issue: () => ({
                audit: () => ({
                  run: async () => ({
                    verified: {
                      user: { id: 'u-1', name: 'User', email: 'u@example.com' },
                      claims: { sub: 'u-1' },
                    },
                    issued: { token: 'good', deviceId: 'dev-1', deviceSecret: 'hex:secret' },
                  }),
                }),
              }),
            }),
          }),
        }),
      },
    }));

    const { AuthController } = await import('../../app/Controllers/AuthController');

    const req: any = {
      getRaw: () => ({ socket: { remoteAddress: '1.2.3.4' } }),
      getHeader: () => undefined,
    };
    const res: any = {
      setStatus: (s: number) => ({ json: (p: any) => (res.payload = { status: s, body: p }) }),
      json: (p: any) => (res.payload = { status: 200, body: p }),
    };

    await AuthController.create().login(req, res);

    expect(res.payload).toEqual({
      status: 200,
      body: {
        token: 'good',
        token_type: 'Bearer',
        deviceId: 'dev-1',
        deviceSecret: 'hex:secret',
        user: { id: 'u-1', name: 'User', email: 'u@example.com' },
      },
    });
  });

  it('omits device fields when the login flow returns a plain string token', async () => {
    vi.resetModules();
    vi.doMock('../../src/http/ValidationHelper', () => ({
      getValidatedBody: () => ({ email: 'a', password: 'b' }),
    }));
    vi.doMock('@app/Models/User', () => ({
      User: {
        where: () => ({ first: async () => null, limit: () => ({ first: async () => null }) }),
      },
    }));
    vi.doMock('@auth/Auth', () => ({ Auth: { compare: vi.fn() } }));
    vi.doMock('@auth/LoginFlow', () => ({
      LoginFlow: {
        create: () => ({
          identify: () => ({
            verify: () => ({
              issue: () => ({
                audit: () => ({
                  run: async () => ({
                    verified: {
                      user: { id: 'u-2', name: 'User 2', email: 'u2@example.com' },
                      claims: { sub: 'u-2' },
                    },
                    issued: 'plain-token',
                  }),
                }),
              }),
            }),
          }),
        }),
      },
    }));

    const { AuthController } = await import('../../app/Controllers/AuthController');

    const req: any = {
      getRaw: () => ({ socket: { remoteAddress: '1.2.3.4' } }),
      getHeader: () => undefined,
    };
    const res: any = {
      setStatus: (s: number) => ({ json: (p: any) => (res.payload = { status: s, body: p }) }),
      json: (p: any) => (res.payload = { status: 200, body: p }),
    };

    await AuthController.create().login(req, res);

    expect(res.payload).toEqual({
      status: 200,
      body: {
        token: 'plain-token',
        token_type: 'Bearer',
        user: { id: 'u-2', name: 'User 2', email: 'u2@example.com' },
      },
    });
  });
});
