import {
  CsrfMiddleware,
  ErrorHandlerMiddleware,
  LoggingMiddleware,
  RateLimiter,
  SecurityMiddleware,
  type Middleware,
} from '@zintrust/core';

import { MiddlewareConfigType } from './type';

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
