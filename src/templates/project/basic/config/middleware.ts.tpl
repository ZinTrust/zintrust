import type { MiddlewareConfigType } from '@zintrust/core';
import { CsrfMiddleware } from '@zintrust/core';
import { ErrorHandlerMiddleware } from '@zintrust/core';
import { LoggingMiddleware } from '@zintrust/core';
import type { Middleware } from '@zintrust/core';
import { RateLimiter } from '@zintrust/core';
import { SecurityMiddleware } from '@zintrust/core';

function createSharedMiddlewares() {
  return Object.freeze({
    log: LoggingMiddleware.create(),
    error: ErrorHandlerMiddleware.create(),
    security: SecurityMiddleware.create(),
    rateLimit: RateLimiter.create(),
    csrf: CsrfMiddleware.create(),
  });
}

export function createMiddlewareConfig(): MiddlewareConfigType {
  const shared = createSharedMiddlewares();

  const middlewareConfigObj: MiddlewareConfigType = {
    global: [shared.log, shared.error, shared.security, shared.rateLimit, shared.csrf],
    route: shared,
  };

  return Object.freeze(middlewareConfigObj);
}

let cached: MiddlewareConfigType | null = null;

function ensureMiddlewareConfig(): MiddlewareConfigType {
  if (cached) return cached;
  cached = createMiddlewareConfig();
  return cached;
}

export const middlewareConfig: MiddlewareConfigType = new Proxy({} as MiddlewareConfigType, {
  get(_target, prop: keyof MiddlewareConfigType) {
    return ensureMiddlewareConfig()[prop];
  },
  ownKeys() {
    return Reflect.ownKeys(ensureMiddlewareConfig());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Object.getOwnPropertyDescriptor(ensureMiddlewareConfig(), prop);
  },
});

export default middlewareConfig;
