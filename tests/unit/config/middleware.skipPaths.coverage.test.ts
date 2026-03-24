import { describe, expect, it, vi } from 'vitest';

const csrfCreateMock = vi.fn(() => ({ name: 'csrf' }));

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
  ErrorHandlerMiddleware: { create: () => ({ name: 'error' }) },
}));
vi.mock('@middleware/SecurityMiddleware', () => ({
  SecurityMiddleware: { create: () => ({ name: 'security' }) },
}));
vi.mock('@middleware/RateLimiter', () => ({ RateLimiter: { create: () => ({ name: 'rate' }) } }));
vi.mock('@middleware/SanitizeBodyMiddleware', () => ({
  SanitizeBodyMiddleware: { create: () => ({ name: 'sanitize' }) },
}));
vi.mock('@middleware/AuthMiddleware', () => ({
  AuthMiddleware: { create: () => ({ name: 'auth' }) },
}));
vi.mock('@middleware/JwtAuthMiddleware', () => ({
  JwtAuthMiddleware: { create: () => ({ name: 'jwt' }) },
}));
vi.mock('@middleware/CsrfMiddleware', () => ({
  CsrfMiddleware: { create: (...args: unknown[]) => csrfCreateMock(...args) },
}));

vi.mock('@middleware/ValidationMiddleware', () => ({
  ValidationMiddleware: {
    create: () => ({ name: 'validate' }),
    createBodyWithSanitization: () => ({ name: 'validateBody' }),
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
});
