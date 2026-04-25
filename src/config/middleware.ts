import { Env } from '@config/env';
import { securityConfig } from '@config/security';
import type { MiddlewareConfigType } from '@config/type';
import { isArray, isObject } from '@helper/index';
import { bodyParsingMiddleware } from '@http/middleware/BodyParsingMiddleware';
import { fileUploadMiddleware } from '@http/middleware/FileUploadMiddleware';
import { AuthMiddleware } from '@middleware/AuthMiddleware';
import { BulletproofAuthMiddleware } from '@middleware/BulletproofAuthMiddleware';
import { CsrfMiddleware } from '@middleware/CsrfMiddleware';
import { ErrorHandlerMiddleware } from '@middleware/ErrorHandlerMiddleware';
import { JwtAuthMiddleware } from '@middleware/JwtAuthMiddleware';
import { LoggingMiddleware } from '@middleware/LoggingMiddleware';
import type { MiddlewareFailureResponder } from '@middleware/MiddlewareFailureResponder';
import type { Middleware } from '@middleware/MiddlewareStack';
import { RateLimiter } from '@middleware/RateLimiter';
import { SanitizeBodyMiddleware } from '@middleware/SanitizeBodyMiddleware';
import { SecurityMiddleware } from '@middleware/SecurityMiddleware';
import { ValidationMiddleware } from '@middleware/ValidationMiddleware';
import { StartupConfigFile, StartupConfigFileRegistry } from '@runtime/StartupConfigFileRegistry';
import { Sanitizer } from '@security/Sanitizer';
import { Schema } from '@validation/Validator';

type LoginBody = {
  email: string;
  password: string;
};

type RegisterBody = {
  name: string;
  email: string;
  password: string;
};

type UserStoreBody = {
  name: string;
  email: string;
  password: string;
};

type UserUpdateBody = {
  name?: string;
  email?: string;
  password?: string;
};

type UserFillBody = {
  count?: number;
};

type SharedMiddlewares = {
  log: Middleware;
  error: Middleware;
  security: Middleware;
  rateLimit: Middleware;
  sanitizeBody: Middleware;
  fillRateLimit: Middleware;
  authRateLimit: Middleware;
  userMutationRateLimit: Middleware;
  csrf: Middleware;
  auth: Middleware;
  jwt: Middleware;
  bulletproof: Middleware;
  validateLogin: Middleware;
  validateRegister: Middleware;
  validateUserStore: Middleware;
  validateUserUpdate: Middleware;
  validateUserFill: Middleware;
};

type MiddlewareResponderKey = keyof SharedMiddlewares;
type MiddlewareResponderConfig = Partial<
  Record<MiddlewareResponderKey, MiddlewareFailureResponder>
>;

export const MiddlewareBody = {
  email: 'email',
  password: 'password', //NOSONAR
  name: 'name',
  count: 'count',
} as const;

export type MiddlewaresType = {
  skipPaths: ReadonlyArray<string>;
  fillRateLimit: { windowMs: number; maxRequests: number; message: string };
  authRateLimit: { windowMs: number; maxRequests: number; message: string };
  userMutationRateLimit: { windowMs: number; maxRequests: number; message: string };
  responders?: MiddlewareResponderConfig;
  global?: ReadonlyArray<Middleware>;
  route?: Record<string, Middleware>;
};

export const MiddlewareKeys = Object.freeze({
  log: true,
  error: true,
  security: true,
  rateLimit: true,
  sanitizeBody: true,
  fillRateLimit: true,
  authRateLimit: true,
  userMutationRateLimit: true,
  csrf: true,
  auth: true,
  jwt: true,
  bulletproof: true,
  validateLogin: true,
  validateRegister: true,
  validateUserStore: true,
  validateUserUpdate: true,
  validateUserFill: true,
} satisfies Record<keyof SharedMiddlewares, true>);

export type ParameterizedRateLimitMiddlewareKey = `rateLimit:${number}:${number}`;

type StaticMiddlewareKey = keyof typeof MiddlewareKeys;

export type MiddlewareKey = StaticMiddlewareKey | ParameterizedRateLimitMiddlewareKey;

type ParameterizedRateLimitConfig = Readonly<{
  maxRequests: number;
  windowMs: number;
}>;

const parseParameterizedRateLimitKey = (
  value: string
): ParameterizedRateLimitConfig | undefined => {
  const match = /^rateLimit:(\d+):(\d+(?:\.\d+)?)$/.exec(value.trim());
  if (!match) return undefined;

  const maxRequests = Number.parseInt(match[1] ?? '', 10);
  const windowMinutes = Number.parseFloat(match[2] ?? '');

  if (!Number.isInteger(maxRequests) || maxRequests < 1) return undefined;
  if (!Number.isFinite(windowMinutes) || windowMinutes <= 0) return undefined;

  const windowMs = Math.round(windowMinutes * 60_000);
  if (!Number.isFinite(windowMs) || windowMs < 1) return undefined;

  return Object.freeze({ maxRequests, windowMs });
};

export const isKnownMiddlewareName = (value: string): value is MiddlewareKey => {
  return (
    Object.hasOwn(MiddlewareKeys, value) || parseParameterizedRateLimitKey(value) !== undefined
  );
};

type ValidationMiddlewareApi = Readonly<{
  createBodyWithSanitization: <TBody extends Record<string, unknown>>(
    schema: unknown,
    sanitizers?: Partial<Record<keyof TBody, (value: unknown) => unknown>>,
    options?: {
      onFailure?: MiddlewareFailureResponder;
      middlewareKey?: string;
    }
  ) => Middleware;
}>;

// Ensure `ValidationMiddleware` is strongly typed here to avoid `error`-typed values
// triggering `@typescript-eslint/no-unsafe-*` rules.
const Validation = ValidationMiddleware as unknown as ValidationMiddlewareApi;

type SharedRateLimitMiddlewares = Pick<
  SharedMiddlewares,
  'rateLimit' | 'fillRateLimit' | 'authRateLimit' | 'userMutationRateLimit'
>;

const resolveFillRateLimit = (
  loadMiddlewareConfig: Partial<MiddlewaresType>
): { windowMs: number; maxRequests: number; message: string } => {
  return {
    windowMs: loadMiddlewareConfig.fillRateLimit?.windowMs ?? 60_000,
    maxRequests: loadMiddlewareConfig.fillRateLimit?.maxRequests ?? 5,
    message:
      loadMiddlewareConfig.fillRateLimit?.message ??
      'Too many requests, please try again after 1 minute.',
  };
};

const resolveAuthRateLimit = (
  loadMiddlewareConfig: Partial<MiddlewaresType>
): { windowMs: number; maxRequests: number; message: string } => {
  return {
    windowMs: loadMiddlewareConfig.authRateLimit?.windowMs ?? 60_000,
    maxRequests: loadMiddlewareConfig.authRateLimit?.maxRequests ?? 10,
    message:
      loadMiddlewareConfig.authRateLimit?.message ??
      'Too many login attempts, please try again after 1 minute.',
  };
};

const resolveUserMutationRateLimit = (
  loadMiddlewareConfig: Partial<MiddlewaresType>
): { windowMs: number; maxRequests: number; message: string } => {
  return {
    windowMs: loadMiddlewareConfig.userMutationRateLimit?.windowMs ?? 60_000,
    maxRequests: loadMiddlewareConfig.userMutationRateLimit?.maxRequests ?? 20,
    message:
      loadMiddlewareConfig.userMutationRateLimit?.message ??
      'Too many user requests, please try again after 1 minute.',
  };
};

function createRateLimitMiddlewares(
  loadMiddlewareConfig: Partial<MiddlewaresType>,
  responders: MiddlewareResponderConfig
): SharedRateLimitMiddlewares {
  const fillRateLimit = RateLimiter.create({
    ...resolveFillRateLimit(loadMiddlewareConfig),
    onFailure: responders.fillRateLimit,
  });
  const authRateLimit = RateLimiter.create({
    ...resolveAuthRateLimit(loadMiddlewareConfig),
    onFailure: responders.authRateLimit,
  });
  const userMutationRateLimit = RateLimiter.create({
    ...resolveUserMutationRateLimit(loadMiddlewareConfig),
    onFailure: responders.userMutationRateLimit,
  });

  return Object.freeze({
    rateLimit: RateLimiter.create({
      onFailure: responders.rateLimit,
      ...securityConfig.rateLimit,
    }),
    fillRateLimit,
    authRateLimit,
    userMutationRateLimit,
  } satisfies SharedRateLimitMiddlewares);
}

type SharedValidationMiddlewares = Pick<
  SharedMiddlewares,
  | 'validateLogin'
  | 'validateRegister'
  | 'validateUserStore'
  | 'validateUserUpdate'
  | 'validateUserFill'
>;

function createAuthValidationMiddlewares(
  responders: MiddlewareResponderConfig
): Pick<SharedMiddlewares, 'validateLogin' | 'validateRegister'> {
  return {
    validateLogin: Validation.createBodyWithSanitization(
      Schema.typed<LoginBody>()
        .required(MiddlewareBody.email)
        .email(MiddlewareBody.email)
        .required(MiddlewareBody.password)
        .string(MiddlewareBody.password),
      {
        email: (v) => Sanitizer.email(v).trim().toLowerCase(),
        password: (v) => Sanitizer.safePasswordChars(v),
      },
      { onFailure: responders.validateLogin, middlewareKey: 'validateLogin' }
    ),
    validateRegister: Validation.createBodyWithSanitization(
      Schema.typed<RegisterBody>()
        .required(MiddlewareBody.name)
        .string(MiddlewareBody.name)
        .minLength(MiddlewareBody.name, 1)
        .required(MiddlewareBody.email)
        .email(MiddlewareBody.email)
        .required(MiddlewareBody.password)
        .string(MiddlewareBody.password)
        .minLength(MiddlewareBody.password, 8),
      {
        name: (v) => Sanitizer.nameText(v).trim(),
        email: (v) => Sanitizer.email(v).trim().toLowerCase(),
        password: (v) => Sanitizer.safePasswordChars(v),
      },
      { onFailure: responders.validateRegister, middlewareKey: 'validateRegister' }
    ),
  };
}

function createUserValidationMiddlewares(
  responders: MiddlewareResponderConfig
): Pick<SharedMiddlewares, 'validateUserStore' | 'validateUserUpdate' | 'validateUserFill'> {
  return {
    validateUserStore: Validation.createBodyWithSanitization(
      Schema.typed<UserStoreBody>()
        .required(MiddlewareBody.name)
        .string(MiddlewareBody.name)
        .minLength(MiddlewareBody.name, 1)
        .required(MiddlewareBody.email)
        .email(MiddlewareBody.email)
        .required(MiddlewareBody.password)
        .string(MiddlewareBody.password)
        .minLength(MiddlewareBody.password, 8),
      {
        name: (v) => Sanitizer.nameText(v).trim(),
        email: (v) => Sanitizer.email(v).trim().toLowerCase(),
        password: (v) => Sanitizer.safePasswordChars(v),
      },
      { onFailure: responders.validateUserStore, middlewareKey: 'validateUserStore' }
    ),
    validateUserUpdate: Validation.createBodyWithSanitization(
      Schema.typed<UserUpdateBody>()
        .custom(
          MiddlewareBody.name,
          (v: unknown) => v === undefined || typeof v === 'string',
          MiddlewareBody.name + ' must be a string'
        )
        .minLength(MiddlewareBody.name, 1)
        .custom(
          MiddlewareBody.email,
          (v: unknown) => v === undefined || typeof v === 'string',
          MiddlewareBody.email + ' must be a string'
        )
        .custom(
          MiddlewareBody.password,
          (v: unknown) => v === undefined || typeof v === 'string',
          MiddlewareBody.password + ' must be a string'
        )
        .minLength(MiddlewareBody.password, 8),
      {
        name: (v) => Sanitizer.nameText(v).trim(),
        email: (v) => Sanitizer.email(v).trim().toLowerCase(),
        password: (v) => Sanitizer.safePasswordChars(v),
      },
      { onFailure: responders.validateUserUpdate, middlewareKey: 'validateUserUpdate' }
    ),
    validateUserFill: Validation.createBodyWithSanitization(
      Schema.typed<UserFillBody>()
        .custom(
          MiddlewareBody.count,
          (v: unknown) => v === undefined || (typeof v === 'number' && Number.isFinite(v)),
          MiddlewareBody.count + ' must be a number'
        )
        .min(MiddlewareBody.count, 1)
        .max(MiddlewareBody.count, 100),
      undefined,
      { onFailure: responders.validateUserFill, middlewareKey: 'validateUserFill' }
    ),
  };
}

function createValidationMiddlewares(
  responders: MiddlewareResponderConfig
): SharedValidationMiddlewares {
  return Object.freeze({
    ...createAuthValidationMiddlewares(responders),
    ...createUserValidationMiddlewares(responders),
  } satisfies SharedValidationMiddlewares);
}

const resolveMiddlewareResponders = (
  loadMiddlewareConfig: Partial<MiddlewaresType>
): MiddlewareResponderConfig => {
  if (!isObject(loadMiddlewareConfig.responders)) return {};

  const entries = Object.entries(loadMiddlewareConfig.responders).filter(
    (entry): entry is [MiddlewareResponderKey, MiddlewareFailureResponder] => {
      const [name, responder] = entry;
      return typeof name === 'string' && name.trim() !== '' && typeof responder === 'function';
    }
  );

  return Object.freeze(Object.fromEntries(entries)) as MiddlewareResponderConfig;
};

function createSharedMiddlewares(
  loadMiddlewareConfig: Partial<MiddlewaresType>,
  responders: MiddlewareResponderConfig
): SharedMiddlewares {
  const rateLimits = createRateLimitMiddlewares(loadMiddlewareConfig, responders);
  const validations = createValidationMiddlewares(responders);

  return Object.freeze({
    log: LoggingMiddleware.create(),
    error: ErrorHandlerMiddleware.create({ onFailure: responders.error }),
    security: SecurityMiddleware.create(),
    sanitizeBody: SanitizeBodyMiddleware.create(),
    ...rateLimits,
    csrf: CsrfMiddleware.create({
      skipPaths: loadMiddlewareConfig?.skipPaths ?? [],
      onFailure: responders.csrf,
    }),
    auth: AuthMiddleware.create({ onUnauthorized: responders.auth }),
    jwt: JwtAuthMiddleware.create({ onUnauthorized: responders.jwt }),
    bulletproof: BulletproofAuthMiddleware.create({ onUnauthorized: responders.bulletproof }),
    ...validations,
  } satisfies SharedMiddlewares);
}

const resolveProjectGlobalMiddlewares = (
  loadMiddlewareConfig: Partial<MiddlewaresType>
): Middleware[] => {
  if (!isArray(loadMiddlewareConfig.global)) return [];

  return loadMiddlewareConfig.global.filter((middleware): middleware is Middleware => {
    return typeof middleware === 'function';
  });
};

const resolveProjectRouteMiddlewares = (
  loadMiddlewareConfig: Partial<MiddlewaresType>
): Record<string, Middleware> => {
  if (!isObject(loadMiddlewareConfig.route)) return {};

  const entries = Object.entries(loadMiddlewareConfig.route).filter(
    (entry): entry is [string, Middleware] => {
      const [name, middleware] = entry;
      return typeof name === 'string' && name.trim() !== '' && typeof middleware === 'function';
    }
  );

  return Object.fromEntries(entries);
};

const applySharedMiddlewareOverrides = (
  shared: SharedMiddlewares,
  projectRoute: Record<string, Middleware>
): SharedMiddlewares => {
  const overridden = { ...shared } as SharedMiddlewares;

  for (const key of Object.keys(MiddlewareKeys) as StaticMiddlewareKey[]) {
    const candidate = projectRoute[key];
    if (typeof candidate === 'function') {
      overridden[key] = candidate;
    }
  }

  return Object.freeze(overridden);
};

const createRouteMiddlewareRegistry = (
  resolvedShared: SharedMiddlewares,
  projectRoute: Record<string, Middleware>,
  responders: MiddlewareResponderConfig
): Record<string, Middleware> => {
  const target: Record<string, Middleware> = Object.freeze({
    ...resolvedShared,
    ...projectRoute,
  });
  const dynamicRateLimits = new Map<string, Middleware>();

  return new Proxy(target, {
    get(currentTarget, prop, receiver) {
      if (typeof prop !== 'string') {
        return Reflect.get(currentTarget as object, prop, receiver) as unknown;
      }

      const resolved = currentTarget[prop];
      if (typeof resolved === 'function') return resolved;

      const cached = dynamicRateLimits.get(prop);
      if (cached !== undefined) return cached;

      const parsed = parseParameterizedRateLimitKey(prop);
      if (parsed === undefined) return undefined;

      const middleware = RateLimiter.create({
        maxRequests: parsed.maxRequests,
        windowMs: parsed.windowMs,
        onFailure: responders.rateLimit,
      });

      dynamicRateLimits.set(prop, middleware);
      return middleware;
    },
    ownKeys(currentTarget) {
      return Reflect.ownKeys(currentTarget);
    },
    getOwnPropertyDescriptor(currentTarget, prop) {
      return Reflect.getOwnPropertyDescriptor(currentTarget, prop);
    },
  });
};

export function createMiddlewareConfig(): MiddlewareConfigType {
  const loadMiddlewareConfig: Partial<MiddlewaresType> =
    StartupConfigFileRegistry.get<Partial<MiddlewaresType>>(StartupConfigFile.Middleware) ?? {};

  const defaultCsrfSkipPaths = ['/broadcasting/auth', '/apps/*/events'];

  const mergeCsrfSkipPaths = (...groups: ReadonlyArray<readonly string[]>): string[] => {
    const merged = new Set<string>();

    for (const group of groups) {
      for (const path of group) {
        const normalized = path.trim();
        if (normalized !== '') {
          merged.add(normalized);
        }
      }
    }

    return [...merged];
  };

  const skipPathsFromEnv = Env.get('CSRF_SKIP_PATHS', '')
    .split(',')
    .map((path: string) => path.trim())
    .filter((path: string) => path.length > 0);

  const configuredSkipPaths = Array.isArray(loadMiddlewareConfig.skipPaths)
    ? loadMiddlewareConfig.skipPaths
    : [];

  const effectiveSkipPaths = mergeCsrfSkipPaths(
    defaultCsrfSkipPaths,
    configuredSkipPaths,
    skipPathsFromEnv
  );

  const effectiveMiddlewareConfig: Partial<MiddlewaresType> = {
    ...loadMiddlewareConfig,
    skipPaths: effectiveSkipPaths,
  };

  const responders = resolveMiddlewareResponders(effectiveMiddlewareConfig);
  const shared = createSharedMiddlewares(effectiveMiddlewareConfig, responders);
  const projectGlobal = resolveProjectGlobalMiddlewares(effectiveMiddlewareConfig);
  const projectRoute = resolveProjectRouteMiddlewares(effectiveMiddlewareConfig);
  const resolvedShared = applySharedMiddlewareOverrides(shared, projectRoute);
  const routeMiddlewareRegistry = createRouteMiddlewareRegistry(
    resolvedShared,
    projectRoute,
    responders
  );

  const middlewareConfigObj: MiddlewareConfigType = {
    global: [
      resolvedShared.log,
      resolvedShared.error,
      resolvedShared.security,
      resolvedShared.rateLimit,
      fileUploadMiddleware,
      bodyParsingMiddleware,
      resolvedShared.csrf,
      resolvedShared.sanitizeBody,
      ...projectGlobal,
    ],
    route: routeMiddlewareRegistry,
  };

  return Object.freeze(middlewareConfigObj);
}

let cached: MiddlewareConfigType | null = null;

/**
 * Clear the middleware configuration cache
 * This ensures fresh config loading in watch mode
 */
export const clearMiddlewareConfigCache = (): void => {
  cached = null;
};

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
