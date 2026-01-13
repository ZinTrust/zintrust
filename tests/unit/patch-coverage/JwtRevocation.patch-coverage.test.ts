import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@security/TokenRevocation', () => ({
  TokenRevocation: {
    isRevoked: vi.fn(() => true),
    revoke: vi.fn(() => null),
  },
}));

vi.mock('@config/security', () => ({
  securityConfig: {
    jwt: {
      algorithm: 'HS256',
      secret: 'secret',
    },
  },
}));

vi.mock('@security/JwtManager', () => ({
  JwtManager: {
    create: vi.fn(() => ({
      setHmacSecret: vi.fn(),
      verify: vi.fn(() => ({ sub: '1' })),
    })),
  },
}));

vi.mock('@/config/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { jwtMiddleware } from '@app/Middleware';
import { JwtAuthMiddleware } from '@middleware/JwtAuthMiddleware';

const createReqRes = (authorization: string): { req: IRequest; res: IResponse } => {
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
    getHeader(name: string) {
      if (name.toLowerCase() === 'authorization') return authorization;
      return undefined;
    },
  };

  return { req, res };
};

describe('patch coverage: JWT revocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 in JwtAuthMiddleware when token is revoked', async () => {
    const middleware = JwtAuthMiddleware.create();
    const { req, res } = createReqRes('Bearer token');

    await middleware(req, res, async () => undefined);

    expect((res as any).statusCode).toBe(401);
    expect((res as any).body).toEqual({ error: 'Invalid or expired token' });
  });

  it('returns 401 in app jwtMiddleware when token is revoked', async () => {
    const middleware = jwtMiddleware({ verify: vi.fn() } as any);
    const { req, res } = createReqRes('Bearer token');

    await middleware(req, res, async () => undefined);

    expect((res as any).statusCode).toBe(401);
    expect((res as any).body).toEqual({ error: 'Invalid or expired token' });
  });
});
