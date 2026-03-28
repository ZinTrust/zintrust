import type { IRequest } from '@/http/Request';
import type { IResponse } from '@/http/Response';
import { AuthMiddleware } from '@/middleware/AuthMiddleware';
import { describe, expect, it, vi } from 'vitest';

describe('AuthMiddleware', () => {
  it('returns the structured default unauthorized body when no responder is configured', async () => {
    const middleware = AuthMiddleware.create();
    const req = {
      getHeader: vi.fn(() => undefined),
    } as unknown as IRequest;
    const res = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as IResponse;

    await middleware(req, res, vi.fn().mockResolvedValue(undefined));

    expect(res.setStatus).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'missing_authorization_header',
        message: 'Unauthorized',
      },
    });
  });

  it('delegates unauthorized responses to onUnauthorized when configured', async () => {
    const onUnauthorized = vi.fn(async (_req, res, context) => {
      res.setStatus(context.statusCode).json({ code: context.reason, message: context.message });
    });

    const middleware = AuthMiddleware.create({ onUnauthorized });
    const req = {
      getHeader: vi.fn(() => undefined),
    } as unknown as IRequest;
    const res = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as IResponse;
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(req, res, next);

    expect(onUnauthorized).toHaveBeenCalledWith(
      req,
      res,
      expect.objectContaining({
        middleware: 'auth',
        reason: 'missing_authorization_header',
        statusCode: 401,
      })
    );
    expect(res.json).toHaveBeenCalledWith({
      code: 'missing_authorization_header',
      message: 'Unauthorized',
    });
    expect(next).not.toHaveBeenCalled();
  });
});
