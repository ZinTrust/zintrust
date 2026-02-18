import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { describe, expect, it, vi } from 'vitest';

describe('patch coverage: JwtAuthMiddleware verify failure logging', () => {
  it('logs debug with non-Error thrown values', async () => {
    vi.resetModules();

    const loggerDebug = vi.fn();

    vi.doMock('@/config/logger', () => ({
      Logger: {
        debug: loggerDebug,
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));

    vi.doMock('@config/security', () => ({
      securityConfig: {
        jwt: {
          algorithm: 'HS256',
          secret: 'secret',
        },
      },
    }));

    vi.doMock('@security/TokenRevocation', () => ({
      TokenRevocation: {
        isRevoked: vi.fn(async () => false),
      },
    }));

    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: vi.fn(() => ({
          setHmacSecret: vi.fn(),
          verify: vi.fn(() => {
            throw 'boom';
          }),
        })),
      },
    }));

    const { JwtAuthMiddleware } = await import('@middleware/JwtAuthMiddleware');
    const middleware = JwtAuthMiddleware.create();

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
        if (name.toLowerCase() === 'authorization') return 'Bearer token';
        return undefined;
      },
    };

    await middleware(req as IRequest, res as IResponse, async () => undefined);

    expect(res.statusCode).toBe(401);
    expect(loggerDebug).toHaveBeenCalled();
  });
});
