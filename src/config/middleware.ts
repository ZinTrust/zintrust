import { StartupConfigFile, StartupConfigFileRegistry } from '@/runtime/StartupConfigFileRegistry';
import type { MiddlewareConfigType } from '@config/type';
import { bodyParsingMiddleware } from '@http/middleware/BodyParsingMiddleware';
import { fileUploadMiddleware } from '@http/middleware/FileUploadMiddleware';
import { AuthMiddleware } from '@middleware/AuthMiddleware';
import { CsrfMiddleware } from '@middleware/CsrfMiddleware';
import { ErrorHandlerMiddleware } from '@middleware/ErrorHandlerMiddleware';
import { JwtAuthMiddleware } from '@middleware/JwtAuthMiddleware';
import { LoggingMiddleware } from '@middleware/LoggingMiddleware';
import type { Middleware } from '@middleware/MiddlewareStack';
import { RateLimiter } from '@middleware/RateLimiter';
import { SanitizeBodyMiddleware } from '@middleware/SanitizeBodyMiddleware';
import { SecurityMiddleware } from '@middleware/SecurityMiddleware';
import { ValidationMiddleware } from '@middleware/ValidationMiddleware';
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
  validateLogin: Middleware;
  validateRegister: Middleware;
  validateUserStore: Middleware;
  validateUserUpdate: Middleware;
  validateUserFill: Middleware;
};

export enum MiddlewareBody {
  email = 'email',
  password = 'password',
  name = 'name',
  count = 'count',
}

export type MiddlewaresType = {
  skipPaths: string[];
  fillRateLimit: { windowMs: number; max: number; message: string };
  authRateLimit: { windowMs: number; max: number; message: string };
  userMutationRateLimit: { windowMs: number; max: number; message: string };
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
  validateLogin: true,
  validateRegister: true,
  validateUserStore: true,
  validateUserUpdate: true,
  validateUserFill: true,
} satisfies Record<keyof SharedMiddlewares, true>);

export type MiddlewareKey = keyof typeof MiddlewareKeys;

type ValidationMiddlewareApi = Readonly<{
  createBodyWithSanitization: <TBody extends Record<string, unknown>>(
    schema: unknown,
    sanitizers?: Partial<Record<keyof TBody, (value: unknown) => unknown>>
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
): { windowMs: number; max: number; message: string } => {
  return {
    windowMs: loadMiddlewareConfig.fillRateLimit?.windowMs ?? 60_000,
    max: loadMiddlewareConfig.fillRateLimit?.max ?? 5,
    message:
      loadMiddlewareConfig.fillRateLimit?.message ??
      'Too many requests, please try again after 1 minute.',
  };
};

const resolveAuthRateLimit = (
  loadMiddlewareConfig: Partial<MiddlewaresType>
): { windowMs: number; max: number; message: string } => {
  return {
    windowMs: loadMiddlewareConfig.authRateLimit?.windowMs ?? 60_000,
    max: loadMiddlewareConfig.authRateLimit?.max ?? 10,
    message:
      loadMiddlewareConfig.authRateLimit?.message ??
      'Too many login attempts, please try again after 1 minute.',
  };
};

const resolveUserMutationRateLimit = (
  loadMiddlewareConfig: Partial<MiddlewaresType>
): { windowMs: number; max: number; message: string } => {
  return {
    windowMs: loadMiddlewareConfig.userMutationRateLimit?.windowMs ?? 60_000,
    max: loadMiddlewareConfig.userMutationRateLimit?.max ?? 20,
    message:
      loadMiddlewareConfig.userMutationRateLimit?.message ??
      'Too many user requests, please try again after 1 minute.',
  };
};

function createRateLimitMiddlewares(
  loadMiddlewareConfig: Partial<MiddlewaresType>
): SharedRateLimitMiddlewares {
  const fillRateLimit = RateLimiter.create(resolveFillRateLimit(loadMiddlewareConfig));
  const authRateLimit = RateLimiter.create(resolveAuthRateLimit(loadMiddlewareConfig));
  const userMutationRateLimit = RateLimiter.create(
    resolveUserMutationRateLimit(loadMiddlewareConfig)
  );

  return Object.freeze({
    rateLimit: RateLimiter.create(),
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

function createAuthValidationMiddlewares(): Pick<
  SharedMiddlewares,
  'validateLogin' | 'validateRegister'
> {
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
      }
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
      }
    ),
  };
}

function createUserValidationMiddlewares(): Pick<
  SharedMiddlewares,
  'validateUserStore' | 'validateUserUpdate' | 'validateUserFill'
> {
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
      }
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
      }
    ),
    validateUserFill: Validation.createBodyWithSanitization(
      Schema.typed<UserFillBody>()
        .custom(
          MiddlewareBody.count,
          (v: unknown) => v === undefined || (typeof v === 'number' && Number.isFinite(v)),
          MiddlewareBody.count + ' must be a number'
        )
        .min(MiddlewareBody.count, 1)
        .max(MiddlewareBody.count, 100)
    ),
  };
}

function createValidationMiddlewares(): SharedValidationMiddlewares {
  return Object.freeze({
    ...createAuthValidationMiddlewares(),
    ...createUserValidationMiddlewares(),
  } satisfies SharedValidationMiddlewares);
}

function createSharedMiddlewares(
  loadMiddlewareConfig: Partial<MiddlewaresType>
): SharedMiddlewares {
  const rateLimits = createRateLimitMiddlewares(loadMiddlewareConfig);
  const validations = createValidationMiddlewares();

  return Object.freeze({
    log: LoggingMiddleware.create(),
    error: ErrorHandlerMiddleware.create(),
    security: SecurityMiddleware.create(),
    sanitizeBody: SanitizeBodyMiddleware.create(),
    ...rateLimits,
    csrf: CsrfMiddleware.create({
      skipPaths: loadMiddlewareConfig?.skipPaths ?? [],
    }),
    auth: AuthMiddleware.create(),
    jwt: JwtAuthMiddleware.create(),
    ...validations,
  } satisfies SharedMiddlewares);
}

export function createMiddlewareConfig(): MiddlewareConfigType {
  const loadMiddlewareConfig: Partial<MiddlewaresType> =
    StartupConfigFileRegistry.get<Partial<MiddlewaresType>>(StartupConfigFile.Middleware) ?? {};

  const shared = createSharedMiddlewares(loadMiddlewareConfig);

  const middlewareConfigObj: MiddlewareConfigType = {
    global: [
      shared.log,
      shared.error,
      shared.security,
      shared.rateLimit,
      fileUploadMiddleware,
      bodyParsingMiddleware,
      shared.csrf,
      shared.sanitizeBody,
    ],
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
