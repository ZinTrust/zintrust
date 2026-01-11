import { Env } from '@config/env';
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

const shouldLogValidationBody = (): boolean => {
  if (Env.NODE_ENV === 'production') return false;
  return Env.getBool('ZIN_DEBUG_VALIDATION_BODY', false);
};

const safeCall = <T>(fn: (() => T) | undefined): T | undefined => {
  try {
    return fn?.();
  } catch {
    return undefined;
  }
};

const getContentType = (req: IRequest): unknown => {
  const fromGetHeader = safeCall(() => req.getHeader?.('content-type'));
  if (fromGetHeader !== undefined) return fromGetHeader;

  const fromHeaders = safeCall(() => req.getHeaders?.()['content-type']);
  if (fromHeaders !== undefined) return fromHeaders;

  return (req.headers as Record<string, unknown> | undefined)?.['content-type'];
};

const logValidationBodyInput = (req: IRequest, stage: string): void => {
  if (!shouldLogValidationBody()) return;

  Logger.debug('[Validation] body input:', {
    stage,
    method: safeCall(() => req.getMethod()),
    path: safeCall(() => req.getPath()),
    contentType: getContentType(req),
    rawBody: safeCall(() => (typeof req.getBody === 'function' ? req.getBody() : undefined)),
    bodyRecord: req.body,
  });
};

const toBodyRecord = (value: unknown): Record<string, unknown> => toRecord(value);

const getBodyForValidation = (req: IRequest): Record<string, unknown> => {
  const bodyRecord = toBodyRecord(req.body);
  if (Object.keys(bodyRecord).length > 0) return bodyRecord;

  const raw = safeCall(() => req.getBody?.());
  return toBodyRecord(raw);
};

const handleValidationError = (res: IResponse, error: unknown): void => {
  // Temporary: log validation error details to help debugging failing requests.
  // Remove this detailed debug logging once the issue is investigated.
  Logger.warn('Validation failed');

  try {
    const err = error as ValidationErrorLike;

    if (typeof err?.toObject === 'function') {
      // Prefer structured debug output when available
      try {
        Logger.debug('[Validation] errors:', err.toObject());
      } catch {
        // best-effort: fall back to direct log
        Logger.debug('[Validation] errors (toObject threw):', err);
      }

      res.setStatus(422).json({ errors: err.toObject() });
      return;
    }

    // Fallback: log raw error
    Logger.debug('[Validation] error:', err);
    res.setStatus(400).json({ error: 'Invalid request body' });
  } catch (error_) {
    // Ensure we don't throw while handling validation errors
    Logger.debug('[Validation] failed to log error details:', error_ as Error);
    res.setStatus(400).json({ error: 'Invalid request body' });
  }
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
        logValidationBodyInput(req, 'create:before-validate');
        const bodyForValidation = getBodyForValidation(req);
        if (Object.keys(bodyForValidation).length > 0 && Object.keys(req.body ?? {}).length === 0) {
          safeCall(() => req.setBody?.(bodyForValidation));
        }

        Validator.validate(bodyForValidation, schema);
        req.validated.body = bodyForValidation;
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
        logValidationBodyInput(req, 'createBody:before-validate');
        const bodyForValidation = getBodyForValidation(req);
        if (Object.keys(bodyForValidation).length > 0 && Object.keys(req.body ?? {}).length === 0) {
          safeCall(() => req.setBody?.(bodyForValidation));
        }

        Validator.validate(bodyForValidation, schema);
        req.validated.body = bodyForValidation as Body;
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

        const bodyForValidation = toBodyRecord(fieldSanitized);

        safeCall(() => req.setBody?.(bodyForValidation));

        logValidationBodyInput(req, 'createBodyWithSanitization:before-validate');
        Validator.validate(bodyForValidation, schema);
        req.validated.body = bodyForValidation as Body;
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

  /**
   * Create body validation middleware with bulletproof sanitization error handling.
   * Automatically converts SanitizerError to 422 validation response.
   * Recommended for authentication, user management, and financial operations.
   *
   * Use this when controllers apply Sanitizer methods with bulletproof=true (default).
   * The middleware will catch SanitizerError and convert to proper validation error response.
   *
   * @param schema - Validation schema
   * @param sanitizers - Optional field sanitizers to apply before validation
   * @returns Middleware with bulletproof error handling
   */
  createBodyWithBulletproofSanitization<TSchema extends TypedSchema<unknown>>(
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

        const bodyForValidation = toBodyRecord(fieldSanitized);

        safeCall(() => req.setBody?.(bodyForValidation));

        logValidationBodyInput(req, 'createBodyWithBulletproofSanitization:before-validate');
        Validator.validate(bodyForValidation, schema);
        req.validated.body = bodyForValidation as Body;
        await next();
      } catch (error: unknown) {
        // Handle SanitizerError by converting to validation error format
        if (isSanitizerError(error)) {
          res.setStatus(400).json({
            errors: {
              sanitization: [error.message],
            },
          });
          return;
        }
        handleValidationError(res, error);
      }
    };
  },
});

/**
 * Check if error is a SanitizerError
 */
function isSanitizerError(error: unknown): error is { name: string; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: string }).name === 'SanitizerError'
  );
}
