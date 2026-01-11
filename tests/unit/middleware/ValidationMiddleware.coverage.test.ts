import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/env', () => ({
  Env: {
    NODE_ENV: 'development',
    getBool: vi.fn((key: string) => key === 'ZIN_DEBUG_VALIDATION_BODY'),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock('@security/Xss', () => ({
  Xss: {
    sanitize: vi.fn((v: unknown) => v),
  },
}));

vi.mock('@validation/Validator', async () => {
  const actual =
    await vi.importActual<typeof import('@validation/Validator')>('@validation/Validator');
  return {
    ...actual,
    Validator: {
      ...actual.Validator,
      validate: vi.fn(),
    },
  };
});

describe('ValidationMiddleware (coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs body input and pulls body from getBody() when req.body empty', async () => {
    const { Logger } = await import('@config/logger');
    const { Validator } = await import('@validation/Validator');
    const { ValidationMiddleware } = await import('@middleware/ValidationMiddleware');

    const validated: Record<string, unknown> = {};
    const req = {
      getMethod: vi.fn(() => 'POST'),
      getPath: vi.fn(() => '/x'),
      // Force header fallback chain: getHeader throws, use getHeaders
      getHeader: vi.fn(() => {
        throw new Error('boom');
      }),
      getHeaders: vi.fn(() => ({ 'content-type': 'application/json' })),
      body: {},
      getBody: vi.fn(() => ({ a: 1 })),
      setBody: vi.fn(),
      validated,
    } as unknown as IRequest;

    (Validator.validate as unknown as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    const res = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as IResponse;

    const next = vi.fn().mockResolvedValue(undefined);

    const mw = ValidationMiddleware.create({} as any);
    await mw(req, res, next);

    expect(Logger.debug).toHaveBeenCalled();
    expect(req.setBody).toHaveBeenCalled();
    expect((req as any).validated.body).toEqual({ a: 1 });
  });

  it('returns 422 and structured errors when ValidationError supports toObject()', async () => {
    const { Validator } = await import('@validation/Validator');
    const { ValidationMiddleware } = await import('@middleware/ValidationMiddleware');

    (Validator.validate as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw {
        message: 'invalid',
        toObject: () => ({ email: ['required'] }),
      };
    });

    const req = {
      getMethod: vi.fn(() => 'POST'),
      getPath: vi.fn(() => '/x'),
      body: { email: '' },
      getBody: vi.fn(() => ({ email: '' })),
      validated: {},
    } as unknown as IRequest;

    const res = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as IResponse;

    const next = vi.fn().mockResolvedValue(undefined);

    const mw = ValidationMiddleware.create({} as any);
    await mw(req, res, next);

    expect(res.setStatus).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ errors: { email: ['required'] } });
  });

  it('falls back to 400 when error.toObject throws', async () => {
    const { Validator } = await import('@validation/Validator');
    const { ValidationMiddleware } = await import('@middleware/ValidationMiddleware');

    (Validator.validate as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw {
        message: 'invalid',
        toObject: () => {
          throw new Error('toObject failed');
        },
      };
    });

    const req = {
      getMethod: vi.fn(() => 'POST'),
      getPath: vi.fn(() => '/x'),
      body: { a: 1 },
      getBody: vi.fn(() => ({ a: 1 })),
      validated: {},
    } as unknown as IRequest;

    const res = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as IResponse;

    const next = vi.fn().mockResolvedValue(undefined);

    const mw = ValidationMiddleware.create({} as any);
    await mw(req, res, next);

    expect(res.setStatus).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid request body' });
  });

  it('createBodyWithBulletproofSanitization converts SanitizerError to validation response', async () => {
    const { Xss } = await import('@security/Xss');
    const { ValidationMiddleware } = await import('@middleware/ValidationMiddleware');

    (Xss.sanitize as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw { name: 'SanitizerError', message: 'bad input' };
    });

    const req = {
      getMethod: vi.fn(() => 'POST'),
      getBody: vi.fn(() => ({ a: 1 })),
      setBody: vi.fn(),
      body: {},
      validated: {},
    } as unknown as IRequest;

    const res = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as IResponse;

    const next = vi.fn().mockResolvedValue(undefined);

    const mw = ValidationMiddleware.createBodyWithBulletproofSanitization({} as any);
    await mw(req, res, next);

    expect(res.setStatus).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      errors: {
        sanitization: ['bad input'],
      },
    });
  });
});
