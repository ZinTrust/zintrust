import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { formatHttpRequestLog } from '@http/HttpStatus';
import type { IRequest } from '@http/Request';
import { RequestContext } from '@http/RequestContext';
import type { IResponse } from '@http/Response';
import type { Middleware } from '@middleware/MiddlewareStack';

export interface LoggingOptions {
  enabled?: boolean;
}

const getStatusSafe = (res: IResponse): number => {
  const anyRes = res as unknown as { getStatus?: () => number; statusCode?: number };
  if (typeof anyRes.getStatus === 'function') return anyRes.getStatus();
  if (typeof anyRes.statusCode === 'number') return anyRes.statusCode;
  return 200;
};

export const LoggingMiddleware = Object.freeze({
  create(options: LoggingOptions = {}): Middleware {
    const enabled: boolean =
      typeof options.enabled === 'boolean'
        ? options.enabled
        : Env.getBool('LOG_HTTP_REQUEST', true);

    return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
      if (enabled === false) {
        await next();
        return;
      }

      const start = Date.now();
      const method = req.getMethod();
      const path = req.getPath();
      const ctx = RequestContext.get(req);
      const requestId = ctx?.requestId ?? (req.context['requestId'] as string);
      const traceId = ctx?.traceId;

      try {
        await next();
      } finally {
        const durationMs = Date.now() - start;
        const status = getStatusSafe(res);
        Logger.info(
          formatHttpRequestLog({
            method,
            path,
            status,
            durationMs,
            requestId,
            traceId,
          })
        );
      }
    };
  },
});

export default LoggingMiddleware;
