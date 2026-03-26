import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import {
  respondWithMiddlewareFailure,
  type MiddlewareFailureResponder,
} from '@middleware/MiddlewareFailureResponder';
import type { Middleware } from '@middleware/MiddlewareStack';

export interface AuthOptions {
  headerName?: string;
  message?: string;
  onUnauthorized?: MiddlewareFailureResponder;
}

export const AuthMiddleware = Object.freeze({
  create(options: AuthOptions = {}): Middleware {
    const headerName = (options.headerName ?? 'authorization').toLowerCase();
    const message = options.message ?? 'Unauthorized';

    return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
      const header = req.getHeader(headerName);
      const value = Array.isArray(header) ? header[0] : header;

      if (typeof value !== 'string' || value.trim() === '') {
        await respondWithMiddlewareFailure(req, res, options.onUnauthorized, {
          middleware: 'auth',
          reason: 'missing_authorization_header',
          statusCode: 401,
          message,
          body: { error: message },
        });
        return;
      }

      await next();
    };
  },
});

export default AuthMiddleware;
