import { MiddlewareConfigType } from './type';
import { CsrfMiddleware } from '@zintrust/core';
import { ErrorHandlerMiddleware } from '@zintrust/core';
import { LoggingMiddleware } from '@zintrust/core';
import type { Middleware } from '@zintrust/core';
import { RateLimiter } from '@zintrust/core';
import { SecurityMiddleware } from '@zintrust/core';

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
