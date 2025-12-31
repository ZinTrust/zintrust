import { MiddlewareConfigType } from '@config/type';
import { CsrfMiddleware } from '@middleware/CsrfMiddleware';
import { ErrorHandlerMiddleware } from '@middleware/ErrorHandlerMiddleware';
import { LoggingMiddleware } from '@middleware/LoggingMiddleware';
import type { Middleware } from '@middleware/MiddlewareStack';
import { RateLimiter } from '@middleware/RateLimiter';
import { SecurityMiddleware } from '@middleware/SecurityMiddleware';

const shared = Object.freeze({
  log: LoggingMiddleware.create(),
  error: ErrorHandlerMiddleware.create(),
  security: SecurityMiddleware.create(),
  rateLimit: RateLimiter.create(),
  csrf: CsrfMiddleware.create(),
} satisfies Record<string, Middleware>);

const middlewareConfigObj: MiddlewareConfigType = {
  global: [shared.log, shared.error, shared.security, shared.rateLimit, shared.csrf],
  route: shared,
};

export const middlewareConfig = Object.freeze(middlewareConfigObj);
export default middlewareConfig;
