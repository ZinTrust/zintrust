import type { IRequest } from '@/http/Request';
import type { IResponse } from '@/http/Response';
import { SecurityMiddleware } from '@/middleware/SecurityMiddleware';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('SecurityMiddleware', () => {
  let req: IRequest;
  let res: IResponse;
  let next: () => Promise<void>;
  let headers: Record<string, string>;

  beforeEach(() => {
    headers = {};
    req = {
      getHeader: vi.fn((name: string) => headers[name.toLowerCase()]),
      getMethod: vi.fn(() => 'GET'),
    } as unknown as IRequest;

    res = {
      setHeader: vi.fn((name: string, value: string | string[]) => {
        headers[name.toLowerCase()] = Array.isArray(value) ? value.join(',') : value;
        return res;
      }),
      setStatus: vi.fn().mockReturnThis(),
      send: vi.fn(),
    } as unknown as IResponse;

    next = vi.fn().mockResolvedValue(undefined);
  });

  it('should set default security headers', async () => {
    const middleware = SecurityMiddleware.create();
    await middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Strict-Transport-Security',
      expect.stringContaining('max-age=')
    );
  });

  it('should set CORS headers when configured', async () => {
    const middleware = SecurityMiddleware.create({
      cors: {
        origin: 'https://example.com',
        methods: ['GET', 'POST'],
      },
    });

    (req.getHeader as any).mockReturnValue('https://example.com');

    await middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Origin',
      'https://example.com'
    );
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, POST');
  });

  it('should handle preflight OPTIONS requests', async () => {
    const middleware = SecurityMiddleware.create({
      cors: { origin: '*' },
    });

    (req.getMethod as any).mockReturnValue('OPTIONS');
    (req.getHeader as any).mockReturnValue('https://example.com');

    await middleware(req, res, next);

    expect(res.setStatus).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalledWith('');
    expect(next).not.toHaveBeenCalled();
  });

  it('should keep default CORS fields when only origin is overridden', async () => {
    const middleware = SecurityMiddleware.create({
      cors: { origin: 'https://example.com' },
    });

    (req.getHeader as any).mockReturnValue('https://example.com');

    await middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Origin',
      'https://example.com'
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Headers',
      expect.stringContaining('Content-Type')
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Methods',
      expect.stringContaining('POST')
    );
  });

  it('should use securityConfig CORS defaults when options are omitted', async () => {
    vi.resetModules();
    vi.doMock('@config/security', () => ({
      securityConfig: {
        cors: {
          origins: ['https://ui.example'],
          methods: ['GET', 'POST'],
          allowedHeaders: ['Authorization', 'X-CSRF-Token'],
          credentials: false,
          maxAge: 600,
        },
      },
    }));

    const { SecurityMiddleware: MockedSecurityMiddleware } =
      await import('@/middleware/SecurityMiddleware');

    const localHeaders: Record<string, string> = {};
    const localReq = {
      getHeader: vi.fn(() => 'https://ui.example'),
      getMethod: vi.fn(() => 'GET'),
    } as unknown as IRequest;
    const localRes = {
      setHeader: vi.fn((name: string, value: string | string[]) => {
        localHeaders[name.toLowerCase()] = Array.isArray(value) ? value.join(',') : value;
        return localRes;
      }),
      setStatus: vi.fn().mockReturnThis(),
      send: vi.fn(),
    } as unknown as IResponse;
    const localNext = vi.fn().mockResolvedValue(undefined);

    await MockedSecurityMiddleware.create()(localReq, localRes, localNext);

    expect(localRes.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Origin',
      'https://ui.example'
    );
    expect(localHeaders['access-control-allow-methods']).toBe('GET, POST');
    expect(localHeaders['access-control-allow-headers']).toBe('Authorization, X-CSRF-Token');
    expect(localHeaders['access-control-allow-credentials']).toBe('false');
    expect(localHeaders['access-control-max-age']).toBe('600');

    vi.doUnmock('@config/security');
    vi.resetModules();
  });
});
