/* eslint-disable max-nested-callbacks */
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { describe, expect, it, vi } from 'vitest';

describe('patch coverage: JwtAuthMiddleware verify failure logging', () => {
  it('delegates missing and malformed authorization failures to onUnauthorized', async () => {
    vi.resetModules();

    vi.doMock('@/config/logger', () => ({
      Logger: {
        debug: vi.fn(),
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

    vi.doMock('@security/JwtSessions', () => ({
      JwtSessions: {
        isActive: vi.fn(async () => true),
      },
    }));

    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: vi.fn(() => ({
          setHmacSecret: vi.fn(),
          verify: vi.fn(() => ({ sub: '1' })),
        })),
      },
    }));

    const { JwtAuthMiddleware } = await import('@middleware/JwtAuthMiddleware');
    const onUnauthorized = vi.fn(async (_req, res, context) => {
      res.setStatus(context.statusCode);
      res.json({ reason: context.reason });
    });

    const missingAuth = JwtAuthMiddleware.create({ onUnauthorized });
    const missingRes: any = {
      setStatus(code: number) {
        missingRes.statusCode = code;
        return missingRes;
      },
      json(payload: unknown) {
        missingRes.body = payload;
      },
    };
    await missingAuth(
      {
        getHeader: () => undefined,
      } as IRequest,
      missingRes as IResponse,
      async () => undefined
    );

    const malformedAuth = JwtAuthMiddleware.create({ onUnauthorized });
    const malformedRes: any = {
      setStatus(code: number) {
        malformedRes.statusCode = code;
        return malformedRes;
      },
      json(payload: unknown) {
        malformedRes.body = payload;
      },
    };
    await malformedAuth(
      {
        getHeader: () => 'Token nope',
      } as IRequest,
      malformedRes as IResponse,
      async () => undefined
    );

    expect(onUnauthorized).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      missingRes,
      expect.objectContaining({ reason: 'missing_authorization_header' })
    );
    expect(onUnauthorized).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      malformedRes,
      expect.objectContaining({ reason: 'invalid_authorization_header_format' })
    );
  });

  it('maps token expiry errors to expired_token', async () => {
    vi.resetModules();

    vi.doMock('@/config/logger', () => ({
      Logger: {
        debug: vi.fn(),
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

    vi.doMock('@security/JwtSessions', () => ({
      JwtSessions: {
        isActive: vi.fn(async () => true),
      },
    }));

    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: vi.fn(() => ({
          setHmacSecret: vi.fn(),
          verify: vi.fn(() => {
            const error = new Error('expired');
            error.name = 'TokenExpiredError';
            throw error;
          }),
        })),
      },
    }));

    const { JwtAuthMiddleware } = await import('@middleware/JwtAuthMiddleware');
    const onUnauthorized = vi.fn(async (_req, res, context) => {
      res.setStatus(context.statusCode);
      res.json({ reason: context.reason });
    });
    const middleware = JwtAuthMiddleware.create({ onUnauthorized });

    const res: any = {
      setStatus(code: number) {
        res.statusCode = code;
        return res;
      },
      json(payload: unknown) {
        res.body = payload;
      },
    };

    await middleware(
      {
        getHeader: () => 'Bearer token',
      } as IRequest,
      res as IResponse,
      async () => undefined
    );

    expect(onUnauthorized).toHaveBeenCalledWith(
      expect.anything(),
      res,
      expect.objectContaining({ reason: 'expired_token' })
    );
    expect(res.body).toEqual({ reason: 'expired_token' });
  });

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

    vi.doMock('@security/JwtSessions', () => ({
      JwtSessions: {
        isActive: vi.fn(async () => true),
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

  it('maps generic object verification errors to invalid_token', async () => {
    vi.resetModules();

    vi.doMock('@/config/logger', () => ({
      Logger: {
        debug: vi.fn(),
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

    vi.doMock('@security/JwtSessions', () => ({
      JwtSessions: {
        isActive: vi.fn(async () => true),
      },
    }));

    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: vi.fn(() => ({
          setHmacSecret: vi.fn(),
          verify: vi.fn(() => {
            throw new Error('invalid');
          }),
        })),
      },
    }));

    const { JwtAuthMiddleware } = await import('@middleware/JwtAuthMiddleware');
    const onUnauthorized = vi.fn(async (_req, res, context) => {
      res.setStatus(context.statusCode);
      res.json({ reason: context.reason });
    });
    const middleware = JwtAuthMiddleware.create({ onUnauthorized });

    const res: any = {
      setStatus(code: number) {
        res.statusCode = code;
        return res;
      },
      json(payload: unknown) {
        res.body = payload;
      },
    };

    await middleware(
      {
        getHeader: () => 'Bearer token',
      } as IRequest,
      res as IResponse,
      async () => undefined
    );

    expect(onUnauthorized).toHaveBeenCalledWith(
      expect.anything(),
      res,
      expect.objectContaining({ reason: 'invalid_token' })
    );
    expect(res.body).toEqual({ reason: 'invalid_token' });
  });
});
