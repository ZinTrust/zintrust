import { Logger } from '@config/logger';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import type { Middleware } from '@middleware/MiddlewareStack';
import type { ISchema } from '@validation/Validator';
import { Validator } from '@validation/Validator';

type ValidationErrorLike = Error & { toObject?: () => Record<string, unknown> };

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
        await next();
      } catch (error: unknown) {
        Logger.warn('Validation failed');
        const err = error as ValidationErrorLike;
        if (typeof err?.toObject === 'function') {
          res.setStatus(422).json({ errors: err.toObject() });
          return;
        }
        res.setStatus(400).json({ error: 'Invalid request body' });
      }
    };
  },
});

export default ValidationMiddleware;
