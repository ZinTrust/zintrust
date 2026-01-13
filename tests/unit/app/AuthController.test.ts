import { Auth } from '@features/Auth';
import { useDatabase } from '@orm/Database';
import { QueryBuilder } from '@orm/QueryBuilder';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

vi.mock('@orm/Database', () => ({
  useDatabase: vi.fn(),
  useEnsureDbConnected: vi.fn(),
}));

vi.mock('@orm/QueryBuilder', () => ({
  QueryBuilder: {
    create: vi.fn(),
  },
}));

vi.mock('@features/Auth', () => ({
  Auth: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

vi.mock('@security/JwtManager', () => ({
  JwtManager: {
    signAccessToken: vi.fn(() => 'signed-token'),
  },
}));

type MockRes = {
  setStatus: Mock;
  json: Mock;
};

const createRes = (): MockRes => ({
  setStatus: vi.fn().mockReturnThis(),
  json: vi.fn(),
});

describe('AuthController', () => {
  it('register: returns 409 when email exists', async () => {
    const db = { isConnected: () => true, connect: vi.fn() };
    (useDatabase as unknown as Mock).mockReturnValue(db);

    const findBuilder = {
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: 1, email: 'a@example.com' }),
      get: vi.fn(),
    };

    (QueryBuilder.create as unknown as Mock).mockReturnValue(findBuilder);

    const { AuthController } = await import('@app/Controllers/AuthController');
    const controller = AuthController.create();

    const req = {
      body: { name: 'A', email: 'a@example.com', password: 'passwordpassword' },
      validated: { body: { name: 'A', email: 'a@example.com', password: 'passwordpassword' } },
      getRaw: vi.fn(() => ({ socket: { remoteAddress: '127.0.0.1' } })),
    } as any;

    const res = createRes();

    await controller.register(req, res as any);

    expect(res.setStatus).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Email already registered' });
  });

  it('register: returns 201 when email does not exist', async () => {
    const db = { isConnected: () => true, connect: vi.fn() };
    (useDatabase as unknown as Mock).mockReturnValue(db);

    const findBuilder = {
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
      get: vi.fn(),
    };

    const insertBuilder = {
      insert: vi.fn().mockResolvedValue({ id: 123 }),
      get: vi.fn(),
    };

    (QueryBuilder.create as unknown as Mock)
      .mockReturnValueOnce(findBuilder)
      .mockReturnValueOnce(insertBuilder);

    (Auth.hash as unknown as Mock).mockResolvedValue('hash');

    const { AuthController } = await import('@app/Controllers/AuthController');
    const controller = AuthController.create();

    const req = {
      body: { name: 'A', email: 'a@example.com', password: 'passwordpassword' },
      validated: { body: { name: 'A', email: 'a@example.com', password: 'passwordpassword' } },
      getRaw: vi.fn(() => ({ socket: { remoteAddress: '127.0.0.1' } })),
    } as any;

    const res = createRes();
    await controller.register(req, res as any);

    expect(Auth.hash).toHaveBeenCalledWith('passwordpassword');
    expect(insertBuilder.insert).toHaveBeenCalledWith({
      name: 'A',
      email: 'a@example.com',
      password: 'hash',
    });
    expect(res.setStatus).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ message: 'Registered' });
  });

  it('login: returns 401 when user is not found', async () => {
    vi.resetModules();
    vi.doMock('@app/Models/User', () => ({
      User: {
        where: () => ({
          limit: () => ({
            first: async () => null,
          }),
        }),
      },
    }));

    const { AuthController } = await import('@app/Controllers/AuthController');
    const controller = AuthController.create();

    const req = {
      body: { email: 'missing@example.com', password: 'wrong' },
      validated: { body: { email: 'missing@example.com', password: 'wrong' } },
      getRaw: vi.fn(() => ({ socket: { remoteAddress: '127.0.0.1' } })),
    } as any;

    const res = createRes();

    await controller.login(req, res as any);

    expect(res.setStatus).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
  });

  it('login: returns 401 on invalid password', async () => {
    vi.resetModules();
    vi.doMock('@app/Models/User', () => ({
      User: {
        where: () => ({
          limit: () => ({
            first: async () => ({ id: 1, email: 'a@example.com', password: 'hash' }),
          }),
        }),
      },
    }));

    (Auth.compare as unknown as Mock).mockResolvedValue(false);

    const { AuthController } = await import('@app/Controllers/AuthController');
    const controller = AuthController.create();

    const req = {
      body: { email: 'a@example.com', password: 'wrongpassword' },
      validated: { body: { email: 'a@example.com', password: 'wrongpassword' } },
      getRaw: vi.fn(() => ({ socket: { remoteAddress: '127.0.0.1' } })),
    } as any;

    const res = createRes();

    await controller.login(req, res as any);

    expect(res.setStatus).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
  });

  it('login: returns token + user when credentials are valid', async () => {
    vi.resetModules();
    vi.doMock('@app/Models/User', () => ({
      User: {
        where: () => ({
          limit: () => ({
            first: async () => ({
              id: 'u1',
              name: 'A',
              email: 'a@example.com',
              password: 'hash',
            }),
          }),
        }),
      },
    }));
    (Auth.compare as unknown as Mock).mockResolvedValue(true);

    const { JwtManager } = await import('@security/JwtManager');
    const { AuthController } = await import('@app/Controllers/AuthController');
    const controller = AuthController.create();

    const req = {
      body: { email: 'a@example.com', password: 'password' },
      validated: { body: { email: 'a@example.com', password: 'password' } },
      getRaw: vi.fn(() => ({ socket: { remoteAddress: '127.0.0.1' } })),
    } as any;

    const res = createRes();
    await controller.login(req, res as any);

    expect(JwtManager.signAccessToken).toHaveBeenCalledWith({ sub: 'u1', email: 'a@example.com' });
    expect(res.json).toHaveBeenCalledWith({
      token: 'signed-token',
      token_type: 'Bearer',
      user: { id: 'u1', name: 'A', email: 'a@example.com' },
    });
  });

  it('logout: returns a simple message', async () => {
    const { AuthController } = await import('@app/Controllers/AuthController');
    const controller = AuthController.create();

    const res = createRes();
    await controller.logout({} as any, res as any);
    expect(res.json).toHaveBeenCalledWith({ message: 'Logged out' });
  });

  it('refresh: returns 401 when req.user missing', async () => {
    const { AuthController } = await import('@app/Controllers/AuthController');
    const controller = AuthController.create();

    const req = { user: undefined } as any;
    const res = createRes();
    await controller.refresh(req, res as any);
    expect(res.setStatus).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('refresh: returns token when req.user present', async () => {
    const { JwtManager } = await import('@security/JwtManager');
    const { AuthController } = await import('@app/Controllers/AuthController');
    const controller = AuthController.create();

    const req = { user: { sub: 'u1' } } as any;
    const res = createRes();
    await controller.refresh(req, res as any);

    expect(JwtManager.signAccessToken).toHaveBeenCalledWith({ sub: 'u1' });
    expect(res.json).toHaveBeenCalledWith({ token: 'signed-token', token_type: 'Bearer' });
  });
});
