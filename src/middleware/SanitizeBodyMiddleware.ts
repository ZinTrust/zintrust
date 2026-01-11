/**
 * Sanitize Body Middleware
 * Applies recursive XSS sanitization (tag stripping + entity escaping) to JSON request bodies.
 *
 * This is a defense-in-depth layer that normalizes untrusted input early.
 */

import { IRequest } from '@http/Request';
import { IResponse } from '@http/Response';
import { Middleware } from '@middleware/MiddlewareStack';
import { Xss } from '@security/Xss';

export const SanitizeBodyMiddleware = Object.freeze({
  create(): Middleware {
    return async (req: IRequest, _res: IResponse, next: () => Promise<void>): Promise<void> => {
      const method = req.getMethod();
      if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || method === 'DELETE') {
        await next();
        return;
      }

      if (req.isJson() === false) {
        await next();
        return;
      }

      const rawBody = req.getBody();
      if (rawBody === undefined || rawBody === null) {
        await next();
        return;
      }

      const sanitized = Xss.sanitize(rawBody);
      req.setBody(sanitized);

      await next();
    };
  },
});

export default SanitizeBodyMiddleware;
