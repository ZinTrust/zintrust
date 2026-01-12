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

    vi.doMock('@orm/Database', () => ({ useEnsureDbConnected: vi.fn().mockResolvedValue({}) }));
    vi.doMock('@orm/QueryBuilder', () => ({
      QueryBuilder: {
        create: () => ({ where: () => ({ limit: () => ({ first: async () => fakeUser }) }) }),
      },
    }));

    const compareSpy = vi.fn().mockResolvedValue(true);
    vi.doMock('@features/Auth', () => ({ Auth: { compare: compareSpy } }));

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
});
