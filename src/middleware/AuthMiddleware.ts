import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import type { Middleware } from '@middleware/MiddlewareStack';

export interface AuthOptions {
  headerName?: string;
  message?: string;
}

export const AuthMiddleware = Object.freeze({
  create(options: AuthOptions = {}): Middleware {
    const headerName = (options.headerName ?? 'authorization').toLowerCase();
    const message = options.message ?? 'Unauthorized';

    return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
      const header = req.getHeader(headerName);
      const value = Array.isArray(header) ? header[0] : header;

      if (typeof value !== 'string' || value.trim() === '') {
        res.setStatus(401).json({ error: message });
        return;
      }

      await next();
    };
  },
});

export default AuthMiddleware;
