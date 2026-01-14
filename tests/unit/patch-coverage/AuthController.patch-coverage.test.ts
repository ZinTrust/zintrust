import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@http/ValidationHelper', () => ({ getValidatedBody: vi.fn() }));
vi.mock('@features/Auth', () => ({ Auth: { hash: vi.fn(), compare: vi.fn() } }));
vi.mock('@security/JwtManager', () => ({ JwtManager: { signAccessToken: vi.fn() } }));
vi.mock('@security/TokenRevocation', () => ({ TokenRevocation: { revoke: vi.fn() } }));
vi.mock('@app/Models/User', () => ({ User: { where: vi.fn(), query: vi.fn() } }));

const makeReqRes = () => {
  const calls: any = {};
  const res: any = {
    _calls: calls,
    setStatus(s: number) {
      calls.status = s;
      return res;
    },
    status(s: number) {
      calls.status = s;
      return { json: (p: any) => (calls.payload = p) };
    },
    json(p: any) {
      calls.payload = p;
    },
  };

  const req: any = {
    getRaw: () => ({ socket: { remoteAddress: '127.0.0.1' } }),
    getHeader: () => undefined,
    user: undefined,
  };

  return { req, res, calls };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('patch coverage: AuthController (new file)', () => {
  it('register: returns 409 when email exists', async () => {
    const { getValidatedBody } = await import('@http/ValidationHelper');
    const { User } = await import('@app/Models/User');

    vi.mocked(getValidatedBody as any).mockReturnValue({ name: 'n', email: 'e', password: 'p' });
    vi.mocked(User.where as any).mockImplementation(() => ({
      limit: () => ({ first: async () => ({ id: 1 }) }),
    }));

    const { req, res } = makeReqRes();
    const AuthController = (await import('@app/Controllers/AuthController')).AuthController;
    await AuthController.create().register(req, res);

    expect(res._calls.status).toBe(409);
    expect(res._calls.payload).toEqual({ error: 'Email already registered' });
  });

  it('register: returns 201 on success', async () => {
    const { getValidatedBody } = await import('@http/ValidationHelper');
    const { User } = await import('@app/Models/User');
    const { Auth } = await import('@features/Auth');

    vi.mocked(getValidatedBody as any).mockReturnValue({ name: 'n', email: 'e', password: 'p' });
    vi.mocked(User.where as any).mockImplementation(() => ({
      limit: () => ({ first: async () => null }),
    }));
    vi.mocked(Auth.hash as any).mockResolvedValue('h');
    vi.mocked(User.query as any).mockReturnValue({ insert: async () => ({ id: 42 }) });

    const { req, res } = makeReqRes();
    const AuthController = (await import('@app/Controllers/AuthController')).AuthController;
    await AuthController.create().register(req, res);

    expect(res._calls.status).toBe(201);
    expect(res._calls.payload).toEqual({ message: 'Registered' });
  });

  it('login: handles non-string/number user ids (subject undefined)', async () => {
    const { getValidatedBody } = await import('@http/ValidationHelper');
    const { User } = await import('@app/Models/User');
    const { Auth } = await import('@features/Auth');
    const { JwtManager } = await import('@security/JwtManager');

    vi.mocked(getValidatedBody as any).mockReturnValue({ email: 'a@b.com', password: 'pw' });
    vi.mocked(User.where as any).mockImplementation(() => ({
      limit: () => ({
        first: async () => ({
          id: { nested: true },
          name: 'A',
          email: 'a@b.com',
          password: 'hash',
        }),
      }),
    }));
    vi.mocked(Auth.compare as any).mockResolvedValue(true);
    vi.mocked(JwtManager.signAccessToken as any).mockReturnValue('tk');

    const { req, res } = makeReqRes();
    const AuthController = (await import('@app/Controllers/AuthController')).AuthController;
    await AuthController.create().login(req, res);

    expect(vi.mocked(JwtManager.signAccessToken as any)).toHaveBeenCalledWith({
      sub: undefined,
      email: 'a@b.com',
    });
    expect(res._calls.payload).toEqual(
      expect.objectContaining({
        token: 'tk',
        token_type: 'Bearer',
        user: expect.objectContaining({ email: 'a@b.com' }),
      })
    );
  });

  it('logout: revokes token and responds', async () => {
    const { TokenRevocation } = await import('@security/TokenRevocation');
    const { req, res } = makeReqRes();
    req.getHeader = () => 'Bearer tok';

    const AuthController = (await import('@app/Controllers/AuthController')).AuthController;
    await AuthController.create().logout(req, res);

    expect(vi.mocked(TokenRevocation.revoke as any).mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(res._calls.payload).toEqual({ message: 'Logged out' });
  });

  it('refresh: returns token when user present', async () => {
    const { JwtManager } = await import('@security/JwtManager');
    const { req, res } = makeReqRes();
    req.user = { sub: 'u1' };
    vi.mocked(JwtManager.signAccessToken as any).mockReturnValue('tk');

    const AuthController = (await import('@app/Controllers/AuthController')).AuthController;
    await AuthController.create().refresh(req, res);

    expect(res._calls.payload).toEqual({ token: 'tk', token_type: 'Bearer' });
  });
});
