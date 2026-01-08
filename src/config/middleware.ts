import { MiddlewareConfigType } from '@config/type';
import { CsrfMiddleware } from '@middleware/CsrfMiddleware';
import { ErrorHandlerMiddleware } from '@middleware/ErrorHandlerMiddleware';
import { LoggingMiddleware } from '@middleware/LoggingMiddleware';
import type { Middleware } from '@middleware/MiddlewareStack';
import { RateLimiter } from '@middleware/RateLimiter';
import { SecurityMiddleware } from '@middleware/SecurityMiddleware';

type SharedMiddlewares = {
  log: Middleware;
  error: Middleware;
  security: Middleware;
  rateLimit: Middleware;
  csrf: Middleware;
};

function createSharedMiddlewares(): SharedMiddlewares {
  return Object.freeze({
    log: LoggingMiddleware.create(),
    error: ErrorHandlerMiddleware.create(),
    security: SecurityMiddleware.create(),
    rateLimit: RateLimiter.create(),
    csrf: CsrfMiddleware.create(),
  } satisfies SharedMiddlewares);
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
