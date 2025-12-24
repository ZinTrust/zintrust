import { IRequest } from '@/http/Request';
import { IResponse } from '@/http/Response';
import { RateLimiter } from '@/middleware/RateLimiter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('RateLimiter', () => {
  let req: IRequest;
  let res: IResponse;
  let next: () => Promise<void>;
  let headers: Record<string, string>;

  beforeEach(() => {
    headers = {};
    req = {
      getHeader: vi.fn(),
      getRaw: vi.fn(() => ({ socket: { remoteAddress: '127.0.0.1' } })),
    } as unknown as IRequest;

    res = {
      setHeader: vi.fn((name: string, value: string) => {
        headers[name.toLowerCase()] = value;
        return res;
      }),
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as IResponse;

    next = vi.fn().mockResolvedValue(undefined);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow requests within limit', async () => {
    const middleware = RateLimiter.create({ max: 2, windowMs: 1000 });

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(headers['x-ratelimit-remaining']).toBe('1');

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(headers['x-ratelimit-remaining']).toBe('0');
  });

  it('should block requests exceeding limit', async () => {
    const middleware = RateLimiter.create({ max: 1, windowMs: 1000 });

    await middleware(req, res, next); // 1st request (ok)
    await middleware(req, res, next); // 2nd request (blocked)

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.setStatus).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Too Many Requests',
      })
    );
  });

  it('should reset limit after window expires', async () => {
    const middleware = RateLimiter.create({ max: 1, windowMs: 1000 });

    await middleware(req, res, next); // 1st request
    expect(headers['x-ratelimit-remaining']).toBe('0');

    // Advance time past window
    vi.advanceTimersByTime(1001);

    await middleware(req, res, next); // 2nd request (should be allowed now)
    expect(next).toHaveBeenCalledTimes(2);
    expect(headers['x-ratelimit-remaining']).toBe('0');
  });

  it('should not create background timers (lazy cleanup)', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    RateLimiter.create({ max: 2, windowMs: 1000 });
    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });
});
