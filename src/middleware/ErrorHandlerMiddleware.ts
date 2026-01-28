import { Env } from '@config/env';
import { Logger } from '@config/logger';
import ErrorRouting from '@core-routes/error';
import { ErrorResponse } from '@http/ErrorResponse';
import type { IRequest } from '@http/Request';
import { RequestContext } from '@http/RequestContext';
import type { IResponse } from '@http/Response';
import type { Middleware } from '@middleware/MiddlewareStack';

const isWritableEnded = (res: IResponse): boolean => {
  if (typeof res.getRaw !== 'function') return false;
  const raw = res.getRaw();
  if (typeof raw !== 'object' || raw === null) return false;
  if (!('writableEnded' in raw)) return false;
  return Boolean((raw as unknown as { writableEnded?: boolean }).writableEnded);
};

export const ErrorHandlerMiddleware = Object.freeze({
  create(): Middleware {
    return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
      try {
        await next();
      } catch (error) {
        Logger.error('Unhandled request error:', error as Error);

        const requestId =
          RequestContext.get(req)?.requestId ?? (req.context['requestId'] as string);
        const includeStack = Env.NODE_ENV !== 'production';

        if (!isWritableEnded(res)) {
          const errorMode = Env.get('ERROR_MODE', 'html');
          res.setStatus(500);

          if (errorMode === 'html') {
            // Use HTML error page instead of JSON
            ErrorRouting.handleInternalServerErrorWithWrappers(req, res, error, requestId);
          } else {
            res.json(
              ErrorResponse.internalServerError(
                'Internal server error',
                requestId,
                includeStack ? (error as Error)?.stack : undefined
              )
            );
          }
        }
      }
    };
  },
});

export default ErrorHandlerMiddleware;
