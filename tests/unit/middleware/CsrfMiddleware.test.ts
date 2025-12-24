import { IRequest } from '@/http/Request';
import { IResponse } from '@/http/Response';
import { CsrfMiddleware } from '@/middleware/CsrfMiddleware';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('CsrfMiddleware', () => {
  let req: IRequest;
  let res: IResponse;
  let next: () => Promise<void>;
  let headers: Record<string, string>;
  let locals: Record<string, any>;

  beforeEach(() => {
    headers = {};
    locals = {};
    req = {
      getMethod: vi.fn(() => 'GET'),
      getHeader: vi.fn((name: string) => headers[name.toLowerCase()]),
      getBody: vi.fn(() => ({})),
      context: { sessionId: 'test-session' },
    } as unknown as IRequest;

    res = {
      setHeader: vi.fn((name: string, value: string) => {
        headers[name.toLowerCase()] = value;
        return res;
      }),
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
      locals,
    } as unknown as IResponse;

    next = vi.fn().mockResolvedValue(undefined);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should generate token for safe methods', async () => {
    const middleware = CsrfMiddleware.create();

    await middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('XSRF-TOKEN=')
    );
    expect(res.locals['csrfToken']).toBeDefined();
    expect(next).toHaveBeenCalled();
  });

  it('should validate token for unsafe methods', async () => {
    const middleware = CsrfMiddleware.create();

    // 1. Generate token first
    await middleware(req, res, next);
    const token = res.locals['csrfToken'];

    // 2. Simulate POST request with valid token
    (req.getMethod as any).mockReturnValue('POST');
    (req.getHeader as any).mockImplementation((name: string) => {
      if (name === 'X-CSRF-Token') return token;
      return null;
    });

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(2); // Once for GET, once for POST
  });

  it('should reject invalid token', async () => {
    const middleware = CsrfMiddleware.create();

    (req.getMethod as any).mockReturnValue('POST');
    (req.getHeader as any).mockReturnValue('invalid-token');

    await middleware(req, res, next);

    expect(res.setStatus).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
