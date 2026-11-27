import type { IRequest } from '@/http/Request';
import type { IResponse } from '@/http/Response';
import { SecurityMiddleware } from '@/middleware/SecurityMiddleware';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Branch-focused coverage for SecurityMiddleware. Every request/response is an
 * in-memory stub, and all CORS variations are driven purely through options.
 */
const createReqRes = (options: {
  headers?: Record<string, string | undefined>;
  method?: string;
  path?: string;
} = {}) => {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    if (typeof value === 'string') headers[key.toLowerCase()] = value;
  }

  const req = {
    getHeader: vi.fn((name: string) => headers[name.toLowerCase()]),
    getMethod: vi.fn(() => options.method ?? 'GET'),
    getPath: vi.fn(() => options.path ?? '/'),
  } as unknown as IRequest;

  const res = {
    setHeader: vi.fn((name: string, value: string | string[]) => {
      headers[name.toLowerCase()] = Array.isArray(value) ? value.join(',') : value;
      return res;
    }),
    setStatus: vi.fn().mockReturnThis(),
    send: vi.fn(),
  } as unknown as IResponse;

  return { req, res, next: vi.fn().mockResolvedValue(undefined), headers };
};

describe('branch coverage: SecurityMiddleware branches', () => {
  afterEach(() => {
    vi.doUnmock('@config/security');
    vi.resetModules();
  });

  it('treats a string-valued methods option as a wildcard pattern', async () => {
    const middleware = SecurityMiddleware.create({
      cors: { origin: '*', methods: '*' as never },
    });
    const { req, res, next, headers } = createReqRes({
      method: 'OPTIONS',
      headers: {
        origin: 'https://client.example',
        'access-control-request-method': 'POST',
      },
    });

    await middleware(req, res, next);

    expect(headers['access-control-allow-methods']).toBe('POST');
    expect(res.setStatus).toHaveBeenCalledWith(204);
    expect(next).not.toHaveBeenCalled();
  });

  it('falls back to empty CORS lists when configured lists are explicitly undefined', async () => {
    const middleware = SecurityMiddleware.create({
      cors: { origin: '*', methods: undefined, allowedHeaders: undefined },
    });
    const { req, res, next, headers } = createReqRes({
      method: 'OPTIONS',
      headers: { origin: 'https://client.example' },
    });

    await middleware(req, res, next);

    expect(headers).not.toHaveProperty('access-control-allow-methods');
    expect(headers).not.toHaveProperty('access-control-allow-headers');
    expect(res.setStatus).toHaveBeenCalledWith(204);
  });

  it('skips empty normalized header names in the CORS header merge', async () => {
    const middleware = SecurityMiddleware.create({
      cors: { origin: '*', allowedHeaders: [''] },
    });
    const { req, res, headers } = createReqRes({
      method: 'OPTIONS',
      headers: {
        origin: 'https://client.example',
        'access-control-request-headers': 'x-requested-with',
      },
    });

    await middleware(req, res, vi.fn());

    expect(headers['access-control-allow-headers']).toBe('x-requested-with');
    expect(res.setStatus).toHaveBeenCalledWith(204);
  });

  it('omits origin, credentials, and max-age headers when those options are undefined', async () => {
    const middleware = SecurityMiddleware.create({
      cors: { origin: undefined, credentials: undefined, maxAge: undefined },
    });
    const { req, res, next, headers } = createReqRes({
      headers: { origin: 'https://client.example' },
    });

    await middleware(req, res, next);

    expect(headers).not.toHaveProperty('access-control-allow-origin');
    expect(next).toHaveBeenCalledOnce();
  });

  it('omits credentials and max-age when both are explicitly undefined', async () => {
    const middleware = SecurityMiddleware.create({
      cors: { origin: 'https://client.example', credentials: undefined, maxAge: undefined },
    });
    const { req, res, next, headers } = createReqRes({
      headers: { origin: 'https://client.example' },
    });

    await middleware(req, res, next);

    expect(headers['access-control-allow-origin']).toBe('https://client.example');
    expect(headers).not.toHaveProperty('access-control-allow-credentials');
    expect(headers).not.toHaveProperty('access-control-max-age');
  });

  it('reflects the request origin for wildcard arrays with and without credentials', async () => {
    const withCredentials = SecurityMiddleware.create({
      cors: { origin: ['*'], credentials: true },
    });
    const withoutCredentials = SecurityMiddleware.create({
      cors: { origin: ['*'], credentials: false },
    });

    const first = createReqRes({
      method: 'OPTIONS',
      headers: { origin: 'https://client.example' },
    });
    await withCredentials(first.req, first.res, first.next);
    expect(first.headers['access-control-allow-origin']).toBe('https://client.example');

    const second = createReqRes({
      method: 'OPTIONS',
      headers: { origin: 'https://client.example' },
    });
    await withoutCredentials(second.req, second.res, second.next);
    expect(second.headers['access-control-allow-origin']).toBe('*');
  });

  it('rejects disallowed origins for both preflight and actual requests', async () => {
    const middleware = SecurityMiddleware.create({ cors: { origin: ['https://allowed.example'] } });

    const preflight = createReqRes({
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example' },
    });
    await middleware(preflight.req, preflight.res, preflight.next);
    expect(preflight.headers).not.toHaveProperty('access-control-allow-origin');
    // A rejected preflight is not "handled"; the middleware still calls next().
    expect(preflight.next).toHaveBeenCalledOnce();

    const actual = createReqRes({ headers: { origin: 'https://evil.example' } });
    await middleware(actual.req, actual.res, actual.next);
    expect(actual.headers).not.toHaveProperty('access-control-allow-origin');
    expect(actual.next).toHaveBeenCalledOnce();
  });

  it('rejects a preflight method that is not in the configured list', async () => {
    const middleware = SecurityMiddleware.create({
      cors: { origin: '*', methods: ['GET'] },
    });
    const { req, res, next, headers } = createReqRes({
      method: 'OPTIONS',
      headers: {
        origin: 'https://client.example',
        'access-control-request-method': 'DELETE',
      },
    });

    await middleware(req, res, next);

    expect(headers).not.toHaveProperty('access-control-allow-methods');
    expect(next).toHaveBeenCalledOnce();
  });

  it('omits the preload directive when it is explicitly disabled', async () => {
    const middleware = SecurityMiddleware.create({ hsts: { preload: false } });
    const { req, res, next, headers } = createReqRes();

    await middleware(req, res, next);

    expect(headers['strict-transport-security']).toBe(
      'max-age=15552000; includeSubDomains'
    );
  });

  it('uses the nullish fallback for an undefined preload flag', async () => {
    const middleware = SecurityMiddleware.create({ hsts: { preload: undefined } });
    const { req, res, next, headers } = createReqRes();

    await middleware(req, res, next);

    expect(headers['strict-transport-security']).toBe(
      'max-age=15552000; includeSubDomains'
    );
  });

  it('keeps hsts/frameguard defaults on their nullish branches and skips CSP without directives', async () => {
    const middleware = SecurityMiddleware.create({
      hsts: { includeSubDomains: undefined, preload: true },
      frameguard: { action: undefined },
      csp: { directives: undefined },
    });
    const { req, res, next, headers } = createReqRes();

    await middleware(req, res, next);

    expect(headers['strict-transport-security']).toBe('max-age=15552000; preload');
    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(headers).not.toHaveProperty('content-security-policy');
    expect(next).toHaveBeenCalledOnce();
  });

  it('uses wildcard CORS defaults when preflight headers are absent', async () => {
    const middleware = SecurityMiddleware.create({
      cors: {
        origin: '*',
        methods: ['*'],
        allowedHeaders: ['*'],
        exposedHeaders: undefined,
      },
    });
    const { req, res, next, headers } = createReqRes({
      method: 'OPTIONS',
      headers: { origin: 'https://client.example' },
    });

    await middleware(req, res, next);

    expect(headers['access-control-allow-methods']).toBe('*');
    expect(headers['access-control-allow-headers']).toBe('*');
    expect(headers).not.toHaveProperty('access-control-expose-headers');
    expect(res.setStatus).toHaveBeenCalledWith(204);
  });

  it('fills missing docs CSP directives from fallbacks', async () => {
    const withDefaultSource = SecurityMiddleware.create({
      csp: { directives: { 'default-src': ['https://a.example'] } },
    });
    const first = createReqRes({ path: '/docs' });
    await withDefaultSource(first.req, first.res, first.next);
    expect(first.headers['content-security-policy']).toContain('https://unpkg.com');

    const withoutDefaultSource = SecurityMiddleware.create({
      csp: { directives: { 'script-src': ["'self'"] } },
    });
    const second = createReqRes({ path: '/docs' });
    await withoutDefaultSource(second.req, second.res, second.next);
    expect(second.headers['content-security-policy']).toContain("script-src 'self'");

    const withStyleElem = SecurityMiddleware.create({
      csp: { directives: { 'style-src-elem': ['https://fonts.example'] } },
    });
    const third = createReqRes({ path: '/docs' });
    await withStyleElem(third.req, third.res, third.next);
    expect(third.headers['content-security-policy']).toContain('https://unpkg.com');
  });

  it('normalizes non-string CORS config values and honors disabled CSP at import time', async () => {
    vi.doMock('@config/security', () => ({
      securityConfig: {
        cors: {
          origins: [123 as never, 'https://ui.example'],
          credentials: false,
        },
        helmet: { contentSecurityPolicy: false },
      },
    }));

    const { SecurityMiddleware: MockedSecurityMiddleware } =
      await import('@/middleware/SecurityMiddleware');
    const { req, res, next, headers } = createReqRes({
      headers: { origin: 'https://ui.example' },
    });

    await MockedSecurityMiddleware.create()(req, res, next);

    expect(headers['access-control-allow-origin']).toBe('https://ui.example');
    expect(headers).not.toHaveProperty('content-security-policy');
    expect(next).toHaveBeenCalledOnce();
  });
});
