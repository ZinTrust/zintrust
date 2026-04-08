import { Env } from '@config/env';
import { Logger } from '@config/logger';
import ErrorRouting from '@core-routes/error';
import { ErrorResponse } from '@http/ErrorResponse';
import type { IRequest } from '@http/Request';
import { RequestContext } from '@http/RequestContext';
import type { IResponse } from '@http/Response';
import {
  respondWithMiddlewareFailure,
  type MiddlewareFailureResponder,
} from '@middleware/MiddlewareFailureResponder';
import type { Middleware } from '@middleware/MiddlewareStack';
import { captureTraceException } from '@runtime/plugins/trace-runtime';

export interface ErrorHandlerOptions {
  onFailure?: MiddlewareFailureResponder;
}

const isWritableEnded = (res: IResponse): boolean => {
  if (typeof res.getRaw !== 'function') return false;
  const raw = res.getRaw();
  if (typeof raw !== 'object' || raw === null) return false;
  if (!('writableEnded' in raw)) return false;
  return Boolean((raw as unknown as { writableEnded?: boolean }).writableEnded);
};

const shouldHideStackFromResponse = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;

  const candidate = error as {
    name?: unknown;
    code?: unknown;
    statusCode?: unknown;
  };

  return (
    candidate.name === 'NotFoundError' ||
    candidate.code === 'NOT_FOUND' ||
    candidate.statusCode === 404
  );
};

export const ErrorHandlerMiddleware = Object.freeze({
  create(options: ErrorHandlerOptions = {}): Middleware {
    return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
      try {
        await next();
      } catch (error) {
        captureTraceException(error);
        Logger.error('Unhandled request error:', error as Error);

        const requestId =
          RequestContext.get(req)?.requestId ?? (req.context['requestId'] as string);
        const includeStack = Env.NODE_ENV !== 'production' && !shouldHideStackFromResponse(error);

        if (!isWritableEnded(res)) {
          const errorMode = Env.get('ERROR_MODE', 'html');
          res.setStatus(500);

          if (errorMode === 'html') {
            // Use HTML error page instead of JSON
            const handleInternalServerErrorWithWrappers =
              ErrorRouting.handleInternalServerErrorWithWrappers as (
                request: IRequest,
                response: IResponse,
                error: unknown,
                requestId?: string
              ) => Promise<void>;
            await handleInternalServerErrorWithWrappers(req, res, error, requestId);
          } else {
            const body = ErrorResponse.internalServerError(
              'Internal server error',
              requestId,
              includeStack ? (error as Error)?.stack : undefined
            );
            await respondWithMiddlewareFailure(req, res, options.onFailure, {
              middleware: 'error',
              reason: 'unhandled_exception',
              statusCode: 500,
              message: 'Internal server error',
              body,
              error,
              requestId,
            });
          }
        }
      }
    };
  },
});

export default ErrorHandlerMiddleware;
