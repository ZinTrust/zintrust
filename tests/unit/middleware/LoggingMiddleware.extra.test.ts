/* eslint-disable no-console */
import { LoggingMiddleware } from '@/middleware/LoggingMiddleware';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

describe('LoggingMiddleware additional branches', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips logging when enabled=false', async () => {
    const mw = LoggingMiddleware.create({ enabled: false });
    const req: any = { getMethod: () => 'GET', getPath: () => '/x', context: {} };
    const res: any = {};
    let nextCalled = false;
    await mw(req, res, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(console.log).not.toHaveBeenCalled();
  });

  it('logs with getStatus function', async () => {
    const mw = LoggingMiddleware.create({ enabled: true });
    const req: any = {
      getMethod: () => 'POST',
      getPath: () => '/y',
      context: { requestId: 'rid' },
    };
    const res: any = { getStatus: () => 201 };

    await mw(req, res, async () => {});

    expect(console.log).toHaveBeenCalledTimes(2);
    const last = (console.log as unknown as Mock).mock.calls[1][0] as string;
    expect(last).toContain('201');
    expect(last).toMatch(/\d+ms/);
  });

  it('logs with statusCode fallback', async () => {
    const mw = LoggingMiddleware.create({ enabled: true });
    const req: any = {
      getMethod: () => 'PUT',
      getPath: () => '/z',
      context: { requestId: 'rid2' },
    };
    const res: any = { statusCode: 404 };

    await mw(req, res, async () => {});

    expect(console.log).toHaveBeenCalledTimes(2);
    const last = (console.log as unknown as Mock).mock.calls[1][0] as string;
    expect(last).toContain('404');
  });
});
