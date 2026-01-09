import { MiddlewareConfigType } from '@config/type';
import { AuthMiddleware } from '@middleware/AuthMiddleware';
import { CsrfMiddleware } from '@middleware/CsrfMiddleware';
import { ErrorHandlerMiddleware } from '@middleware/ErrorHandlerMiddleware';
import { JwtAuthMiddleware } from '@middleware/JwtAuthMiddleware';
import { LoggingMiddleware } from '@middleware/LoggingMiddleware';
import type { Middleware } from '@middleware/MiddlewareStack';
import { RateLimiter } from '@middleware/RateLimiter';
import { SecurityMiddleware } from '@middleware/SecurityMiddleware';
import { ValidationMiddleware } from '@middleware/ValidationMiddleware';
import { Schema } from '@validation/Validator';

type SharedMiddlewares = {
  log: Middleware;
  error: Middleware;
  security: Middleware;
  rateLimit: Middleware;
  fillRateLimit: Middleware;
  csrf: Middleware;
  auth: Middleware;
  jwt: Middleware;
  validateLogin: Middleware;
  validateRegister: Middleware;
};

function createSharedMiddlewares(): SharedMiddlewares {
  return Object.freeze({
    log: LoggingMiddleware.create(),
    error: ErrorHandlerMiddleware.create(),
    security: SecurityMiddleware.create(),
    rateLimit: RateLimiter.create(),
    fillRateLimit: RateLimiter.create({
      windowMs: 60_000,
      max: 5,
      message: 'Too many fill requests, please try again later.',
    }),
    csrf: CsrfMiddleware.create(),
    auth: AuthMiddleware.create(),
    jwt: JwtAuthMiddleware.create(),
    validateLogin: ValidationMiddleware.create(
      Schema.create().required('email').email('email').required('password').string('password')
    ),
    validateRegister: ValidationMiddleware.create(
      Schema.create()
        .required('name')
        .string('name')
        .minLength('name', 1)
        .required('email')
        .email('email')
        .required('password')
        .string('password')
        .minLength('password', 8)
    ),
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

// Proxy target must satisfy JS Proxy invariants.
// When we lazily create a frozen config object (with non-configurable properties),
// we mirror its property descriptors onto this target so reflective operations
// like Object.getOwnPropertyDescriptor() do not throw.
const proxyTarget: MiddlewareConfigType = {} as MiddlewareConfigType;

function ensureMiddlewareConfig(): MiddlewareConfigType {
  if (cached) return cached;
  cached = createMiddlewareConfig();

  try {
    Object.defineProperties(
      proxyTarget as unknown as object,
      Object.getOwnPropertyDescriptors(cached)
    );
  } catch {
    // best-effort; proxy still functions via `get` trap even if reflection fails
  }

  return cached;
}

export const middlewareConfig: MiddlewareConfigType = new Proxy(proxyTarget, {
  get(_target, prop: keyof MiddlewareConfigType) {
    return ensureMiddlewareConfig()[prop];
  },
  ownKeys() {
    ensureMiddlewareConfig();
    return Reflect.ownKeys(proxyTarget as unknown as object);
  },
  getOwnPropertyDescriptor(_target, prop) {
    ensureMiddlewareConfig();
    return Object.getOwnPropertyDescriptor(proxyTarget as unknown as object, prop);
  },
});

export default middlewareConfig;
