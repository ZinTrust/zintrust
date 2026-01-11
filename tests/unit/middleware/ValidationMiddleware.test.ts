import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { ValidationMiddleware } from '@middleware/ValidationMiddleware';
import { Sanitizer } from '@security/Sanitizer';
import { Validator } from '@validation/Validator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
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

describe('ValidationMiddleware', () => {
  let req: IRequest;
  let res: IResponse;
  let next: () => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();

    req = {
      getMethod: vi.fn(() => 'GET'),
      body: { hello: 'world' },
      validated: {},
    } as unknown as IRequest;

    res = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as IResponse;

    next = vi.fn().mockResolvedValue(undefined);
  });

  it('skips body validation for GET in create()', async () => {
    const middleware = ValidationMiddleware.create({} as any);

    await middleware(req, res, next);

    expect(Validator.validate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.setStatus).not.toHaveBeenCalled();
    expect(req.validated.body).toBeUndefined();
  });

  it('skips body validation for DELETE in createBody()', async () => {
    (req.getMethod as any).mockReturnValue('DELETE');

    const middleware = ValidationMiddleware.createBody({} as any);

    await middleware(req, res, next);

    expect(Validator.validate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.setStatus).not.toHaveBeenCalled();
    expect(req.validated.body).toBeUndefined();
  });

  it('sanitizes then validates body in createBodyWithSanitization()', async () => {
    let bodyState: any = {
      name: '<script>alert(1)</script>',
      email: ' DEV@EXAMPLE.COM ',
      password: 'pass word123',
    };

    req = {
      getMethod: vi.fn(() => 'POST'),
      getBody: vi.fn(() => bodyState),
      setBody: vi.fn((b: unknown) => {
        bodyState = b;
        (req as any).body = b;
      }),
      body: bodyState,
      validated: {},
    } as unknown as IRequest;

    const middleware = ValidationMiddleware.createBodyWithSanitization({} as any, {
      name: (v) => Sanitizer.nameText(v).trim(),
      email: (v) => Sanitizer.email(v).trim().toLowerCase(),
      password: (v) => Sanitizer.safePasswordChars(v),
    });

    await middleware(req, res, next);

    expect(Validator.validate).toHaveBeenCalledTimes(1);
    expect((Validator.validate as any).mock.calls[0][0]).toEqual({
      name: 'alert1',
      email: 'dev@example.com',
      password: 'pass word123',
    });
    expect(req.validated.body).toEqual({
      name: 'alert1',
      email: 'dev@example.com',
      password: 'pass word123',
    });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
