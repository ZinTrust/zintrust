import { LoggingMiddleware } from '@/middleware/LoggingMiddleware';
import { Logger } from '@config/logger';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/env', () => ({
  Env: {
    getBool: vi.fn((_key: string, defaultVal?: boolean) => defaultVal ?? true),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
  },
}));

describe('LoggingMiddleware additional branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(Logger.info).not.toHaveBeenCalled();
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

    expect(Logger.info).toHaveBeenCalledTimes(1);
    const last = (Logger.info as unknown as Mock).mock.calls[0][0] as string;
    expect(last).toContain('[POST] /y 201 Created');
    expect(last).toContain('[requestId=rid]');
    expect(last).toMatch(/\(\d+ms\)/);
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

    expect(Logger.info).toHaveBeenCalledTimes(1);
    const last = (Logger.info as unknown as Mock).mock.calls[0][0] as string;
    expect(last).toContain('[PUT] /z 404 Not Found');
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

    expect(Logger.info).toHaveBeenCalledTimes(1);
    const last = (Logger.info as unknown as Mock).mock.calls[0][0] as string;
    expect(last).toContain('[GET] /auto 200 OK');
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

    expect(Logger.info).toHaveBeenCalledTimes(1);
    const last = (Logger.info as unknown as Mock).mock.calls[0][0] as string;
    expect(last).toContain('[GET] /default 200 OK');
    expect(last).toContain('[requestId=rid-default]');
    expect(last).toMatch(/\(\d+ms\)/);
  });
});
