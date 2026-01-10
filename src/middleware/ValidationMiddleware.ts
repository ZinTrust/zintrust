import { Logger } from '@config/logger';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import type { Middleware } from '@middleware/MiddlewareStack';
import type { InferSchema, ISchema, TypedSchema } from '@validation/Validator';
import { Validator } from '@validation/Validator';

type ValidationErrorLike = Error & { toObject?: () => Record<string, unknown> };

const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return {};
  if (Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const handleValidationError = (res: IResponse, error: unknown): void => {
  Logger.warn('Validation failed');
  const err = error as ValidationErrorLike;
  if (typeof err?.toObject === 'function') {
    res.setStatus(422).json({ errors: err.toObject() });
    return;
  }
  res.setStatus(400).json({ error: 'Invalid request body' });
};

export const ValidationMiddleware = Object.freeze({
  create(schema: ISchema): Middleware {
    return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
      const method = req.getMethod();
      if (method === 'GET' || method === 'DELETE') {
        await next();
        return;
      }

      try {
        Validator.validate(req.body ?? {}, schema);
        req.validated.body = req.body;
        await next();
      } catch (error: unknown) {
        handleValidationError(res, error);
      }
    };
  },

  createBody<TSchema extends TypedSchema<unknown>>(schema: TSchema): Middleware {
    type Body = InferSchema<TSchema>;

    return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
      const method = req.getMethod();
      if (method === 'GET' || method === 'DELETE') {
        await next();
        return;
      }

      try {
        Validator.validate(req.body ?? {}, schema);
        req.validated.body = req.body as Body;
        await next();
      } catch (error: unknown) {
        handleValidationError(res, error);
      }
    };
  },

  createQuery<TSchema extends TypedSchema<unknown>>(schema: TSchema): Middleware {
    type Query = InferSchema<TSchema>;

    return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
      try {
        const query = toRecord(req.getQuery());
        Validator.validate(query, schema);
        req.validated.query = query as Query;
        await next();
      } catch (error: unknown) {
        handleValidationError(res, error);
      }
    };
  },

  createParams<TSchema extends TypedSchema<unknown>>(schema: TSchema): Middleware {
    type Params = InferSchema<TSchema>;

    return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
      try {
        const params = toRecord(req.getParams());
        Validator.validate(params, schema);
        req.validated.params = params as Params;
        await next();
      } catch (error: unknown) {
        handleValidationError(res, error);
      }
    };
  },
});

export default ValidationMiddleware;
