import { Logger } from '@config/logger';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import type { Middleware } from '@middleware/MiddlewareStack';
import { Xss } from '@security/Xss';
import type { InferSchema, ISchema, TypedSchema } from '@validation/Validator';
import { Validator } from '@validation/Validator';

type ValidationErrorLike = Error & { toObject?: () => Record<string, unknown> };

const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return {};
  if (Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

type FieldSanitizers = Readonly<Record<string, (value: unknown) => unknown>>;

const applyFieldSanitizers = (input: unknown, sanitizers: FieldSanitizers | undefined): unknown => {
  if (sanitizers === undefined) return input;
  if (typeof input !== 'object' || input === null) return input;
  if (Array.isArray(input)) return input;

  const record = input as Record<string, unknown>;
  let changed = false;
  const out: Record<string, unknown> = { ...record };

  for (const [field, sanitizer] of Object.entries(sanitizers)) {
    if (Object.prototype.hasOwnProperty.call(out, field) === false) continue;
    const before = out[field];
    const after = sanitizer(before);
    if (after !== before) {
      out[field] = after;
      changed = true;
    }
  }

  return changed ? out : record;
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

  createBodyWithSanitization<TSchema extends TypedSchema<unknown>>(
    schema: TSchema,
    sanitizers?: FieldSanitizers
  ): Middleware {
    type Body = InferSchema<TSchema>;

    return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
      const method = req.getMethod();
      if (method === 'GET' || method === 'DELETE') {
        await next();
        return;
      }

      try {
        const rawBody = req.getBody();
        const xssSanitized = Xss.sanitize(rawBody ?? {});
        const fieldSanitized = applyFieldSanitizers(xssSanitized, sanitizers);

        req.setBody(fieldSanitized);

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
