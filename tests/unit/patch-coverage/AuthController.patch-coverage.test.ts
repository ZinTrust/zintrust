import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@http/ValidationHelper', () => ({
  getValidatedBody: vi.fn(),
}));

vi.mock('@/features/Auth', () => ({
  Auth: {
    compare: vi.fn(async () => true),
    hash: vi.fn(async () => 'hash'),
  },
}));

vi.mock('@app/Models/User', () => ({
  User: {
    where: vi.fn(),
  },
}));

vi.mock('@security/JwtManager', () => ({
  JwtManager: {
    signAccessToken: vi.fn(() => 'token'),
  },
}));

vi.mock('@orm/Database', () => ({
  useDatabase: vi.fn(() => ({}) as any),
}));

vi.mock('@orm/QueryBuilder', () => ({
  QueryBuilder: {
    create: vi.fn(() => ({
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      first: vi.fn(async () => null),
      insert: vi.fn(async () => ({ insertedId: 1 })),
    })),
  },
}));

import { AuthController } from '@app/Controllers/AuthController';
import { User } from '@app/Models/User';
import { getValidatedBody } from '@http/ValidationHelper';
import { useDatabase } from '@orm/Database';
import { JwtManager } from '@security/JwtManager';

const createReqRes = (): { req: IRequest; res: IResponse; next: () => Promise<void> } => {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    setStatus(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return undefined;
    },
  };

  const req: any = {
    getRaw() {
      return { socket: { remoteAddress: '127.0.0.1' } };
    },
    getHeader: vi.fn(),
    user: undefined,
  };

  return { req, res, next: async () => undefined };
};

describe('patch coverage: AuthController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles non-string/number user ids (subject undefined)', async () => {
    vi.mocked(getValidatedBody).mockReturnValueOnce({
      email: 'a@b.com',
      password: 'pw',
    });

    vi.mocked(User.where).mockReturnValueOnce({
      limit: () => ({
        first: async () => ({
          id: { nested: true },
          name: 'A',
          email: 'a@b.com',
          password: 'hash',
        }),
      }),
    } as any);

    const { req, res } = createReqRes();
    await AuthController.create().login(req, res);

    expect(vi.mocked(JwtManager.signAccessToken)).toHaveBeenCalledWith({
      sub: undefined,
      email: 'a@b.com',
    });
    expect((res as any).statusCode).toBe(200);
    expect((res as any).body).toEqual(
      expect.objectContaining({
        token: 'token',
        token_type: 'Bearer',
        user: expect.objectContaining({ email: 'a@b.com' }),
      })
    );
  });

  it('returns 500 when login throws unexpectedly', async () => {
    vi.mocked(getValidatedBody).mockReturnValueOnce({
      email: 'a@b.com',
      password: 'pw',
    });

    vi.mocked(User.where).mockReturnValueOnce({
      limit: () => ({
        first: async () => {
          throw new Error('db down');
        },
      }),
    } as any);

    const { req, res } = createReqRes();
    await AuthController.create().login(req, res);

    expect((res as any).statusCode).toBe(500);
    expect((res as any).body).toEqual({ error: 'Login failed' });
  });

  it('returns 500 when register throws unexpectedly', async () => {
    vi.mocked(getValidatedBody).mockReturnValueOnce({
      name: 'A',
      email: 'a@b.com',
      password: 'pw',
    });

    vi.mocked(useDatabase).mockImplementationOnce(() => {
      throw new Error('db unavailable');
    });

    const { req, res } = createReqRes();
    await AuthController.create().register(req, res);

    expect((res as any).statusCode).toBe(500);
    expect((res as any).body).toEqual({ error: 'Registration failed' });
  });
});
