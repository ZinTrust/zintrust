import { describe, expect, it, vi } from 'vitest';

const csrfCreateMock = vi.fn(() => ({ name: 'csrf' }));
const errorCreateMock = vi.fn(() => ({ name: 'error' }));
const authCreateMock = vi.fn(() => ({ name: 'auth' }));
const jwtCreateMock = vi.fn(() => ({ name: 'jwt' }));
const bulletproofCreateMock = vi.fn(() => ({ name: 'bulletproof' }));
const rateLimitCreateMock = vi.fn(() => ({ name: 'rate' }));
const validationCreateBodyWithSanitizationMock = vi.fn(() => ({ name: 'validateBody' }));

vi.mock('@runtime/StartupConfigFileRegistry', () => ({
  StartupConfigFile: { Middleware: 'Middleware' },
  StartupConfigFileRegistry: {
    get: vi.fn(() => ({ skipPaths: ['/from-config'] })),
  },
}));

vi.mock('@config/env', () => ({
  Env: {
    get: vi.fn(() => ''),
    getBool: vi.fn(() => false),
    getInt: vi.fn((_k: string, d: number) => d),
  },
}));

vi.mock('@http/middleware/BodyParsingMiddleware', () => ({
  bodyParsingMiddleware: { name: 'body' },
}));
vi.mock('@http/middleware/FileUploadMiddleware', () => ({
  fileUploadMiddleware: { name: 'upload' },
}));

vi.mock('@middleware/LoggingMiddleware', () => ({
  LoggingMiddleware: { create: () => ({ name: 'log' }) },
}));
vi.mock('@middleware/ErrorHandlerMiddleware', () => ({
  ErrorHandlerMiddleware: { create: (...args: unknown[]) => errorCreateMock(...args) },
}));
vi.mock('@middleware/SecurityMiddleware', () => ({
  SecurityMiddleware: { create: () => ({ name: 'security' }) },
}));
vi.mock('@middleware/RateLimiter', () => ({
  RateLimiter: { create: (...args: unknown[]) => rateLimitCreateMock(...args) },
}));
vi.mock('@middleware/SanitizeBodyMiddleware', () => ({
  SanitizeBodyMiddleware: { create: () => ({ name: 'sanitize' }) },
}));
vi.mock('@middleware/AuthMiddleware', () => ({
  AuthMiddleware: { create: (...args: unknown[]) => authCreateMock(...args) },
}));
vi.mock('@middleware/JwtAuthMiddleware', () => ({
  JwtAuthMiddleware: { create: (...args: unknown[]) => jwtCreateMock(...args) },
}));
vi.mock('@middleware/BulletproofAuthMiddleware', () => ({
  BulletproofAuthMiddleware: { create: (...args: unknown[]) => bulletproofCreateMock(...args) },
}));
vi.mock('@middleware/CsrfMiddleware', () => ({
  CsrfMiddleware: { create: (...args: unknown[]) => csrfCreateMock(...args) },
}));

vi.mock('@middleware/ValidationMiddleware', () => ({
  ValidationMiddleware: {
    create: () => ({ name: 'validate' }),
    createBodyWithSanitization: (...args: unknown[]) =>
      validationCreateBodyWithSanitizationMock(...args),
  },
}));

vi.mock('@security/Sanitizer', () => ({
  Sanitizer: {
    email: (v: string) => v,
    nameText: (v: string) => v,
    safePasswordChars: (v: string) => v,
  },
}));

vi.mock('@validation/Validator', () => {
  const chain = () => {
    const api: any = {};
    api.required = () => api;
    api.email = () => api;
    api.string = () => api;
    api.minLength = () => api;
    api.maxLength = () => api;
    api.min = () => api;
    api.max = () => api;
    api.optional = () => api;
    api.custom = () => api;
    return api;
  };

  return {
    Schema: {
      typed: () => chain(),
    },
  };
});

import { createMiddlewareConfig } from '../../../src/config/middleware';
import { StartupConfigFileRegistry } from '../../../src/runtime/StartupConfigFileRegistry';

describe('middleware config (coverage extras)', () => {
  it('prefers StartupConfigFileRegistry skipPaths when provided', () => {
    createMiddlewareConfig();
    expect(csrfCreateMock).toHaveBeenCalledWith({ skipPaths: ['/from-config'] });
  });

  it('merges project global and route middleware overrides', () => {
    const customGlobal = vi.fn(async (_req, _res, next) => {
      await next();
    });
    const customRoute = vi.fn(async (_req, _res, next) => {
      await next();
    });

    vi.mocked(StartupConfigFileRegistry.get).mockReturnValueOnce({
      skipPaths: ['/from-config'],
      global: [customGlobal],
      route: {
        customAuth: customRoute,
      },
    });

    const config = createMiddlewareConfig();

    expect(config.global).toContain(customGlobal);
    expect(config.route['customAuth']).toBe(customRoute);
  });

  it('allows project route middleware to override built-in keys', () => {
    const logOverride = vi.fn(async (_req, _res, next) => {
      await next();
    });
    const jwtOverride = vi.fn(async (_req, _res, next) => {
      await next();
    });

    vi.mocked(StartupConfigFileRegistry.get).mockReturnValueOnce({
      skipPaths: ['/from-config'],
      route: {
        log: logOverride,
        jwt: jwtOverride,
      },
    });

    const config = createMiddlewareConfig();

    expect(config.global[0]).toBe(logOverride);
    expect(config.route['log']).toBe(logOverride);
    expect(config.route['jwt']).toBe(jwtOverride);
  });

  it('passes responder overrides into built-in middleware factories', () => {
    const authResponder = vi.fn(async () => undefined);
    const jwtResponder = vi.fn(async () => undefined);
    const errorResponder = vi.fn(async () => undefined);
    const csrfResponder = vi.fn(async () => undefined);
    const rateLimitResponder = vi.fn(async () => undefined);
    const validateLoginResponder = vi.fn(async () => undefined);

    vi.mocked(StartupConfigFileRegistry.get).mockReturnValueOnce({
      skipPaths: ['/from-config'],
      responders: {
        auth: authResponder,
        jwt: jwtResponder,
        error: errorResponder,
        csrf: csrfResponder,
        rateLimit: rateLimitResponder,
        validateLogin: validateLoginResponder,
      },
    });

    createMiddlewareConfig();

    expect(errorCreateMock).toHaveBeenCalledWith({ onFailure: errorResponder });
    expect(authCreateMock).toHaveBeenCalledWith({ onUnauthorized: authResponder });
    expect(jwtCreateMock).toHaveBeenCalledWith({ onUnauthorized: jwtResponder });
    expect(bulletproofCreateMock).toHaveBeenCalledWith({ onUnauthorized: undefined });
    expect(csrfCreateMock).toHaveBeenCalledWith({
      skipPaths: ['/from-config'],
      onFailure: csrfResponder,
    });
    expect(rateLimitCreateMock).toHaveBeenCalledWith({
      windowMs: 60_000,
      max: 100,
      onFailure: rateLimitResponder,
    });
    expect(validationCreateBodyWithSanitizationMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        onFailure: validateLoginResponder,
        middlewareKey: 'validateLogin',
      })
    );
  });
});
