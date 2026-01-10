import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { ValidationMiddleware } from '@middleware/ValidationMiddleware';
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
});
