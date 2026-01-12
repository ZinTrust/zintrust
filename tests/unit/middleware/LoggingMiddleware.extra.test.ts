/* eslint-disable no-console */
import { LoggingMiddleware } from '@/middleware/LoggingMiddleware';
import type { Mock} from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('honors Env.LOG_HTTP_REQUEST when options omitted', async () => {
    const mw = LoggingMiddleware.create();
    const req: any = {
      getMethod: () => 'GET',
      getPath: () => '/auto',
      context: { requestId: 'auto-rid' },
    };
    const res: any = { statusCode: 200 };

    await mw(req, res, async () => {});

    // Behavior depends on Env.LOG_HTTP_REQUEST (set at import-time) — assert accordingly
    // Importing Env here to read current test environment value
    const { Env } = await import('@config/env');
    if (Env.LOG_HTTP_REQUEST) {
      expect(console.log).toHaveBeenCalledTimes(2);
    } else {
      expect(console.log).not.toHaveBeenCalled();
    }
  });

  it('logs default 200 when no status method or code present', async () => {
    const mw = LoggingMiddleware.create({ enabled: true });
    const req: any = {
      getMethod: () => 'GET',
      getPath: () => '/default',
      context: { requestId: 'rid-default' },
    };
    const res: any = {};

    await mw(req, res, async () => {});

    expect(console.log).toHaveBeenCalledTimes(2);
    const last = (console.log as unknown as Mock).mock.calls[1][0] as string;
    expect(last).toContain('200');
  });
});
