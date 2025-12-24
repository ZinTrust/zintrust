import { IRequest } from '@/http/Request';
import { IResponse } from '@/http/Response';
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
      setHeader: vi.fn((name: string, value: string) => {
        headers[name.toLowerCase()] = value;
        return res;
      }),
      setStatus: vi.fn().mockReturnThis(),
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
    expect(next).not.toHaveBeenCalled();
  });
});
