import { RequestProfiler } from '@profiling/RequestProfiler';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

type CapturedProfile = {
  duration: number;
  queriesExecuted: number;
  n1Patterns: unknown[];
  memoryDelta: { heapUsed: number; heapTotal: number; external: number; rss: number };
  timestamp: Date;
};

const captureRequest = vi.fn<(fn: () => Promise<unknown>) => Promise<CapturedProfile>>();
const generateReport = vi.fn<(profile: unknown) => string>();
const logQuery =
  vi.fn<(sql: string, params: unknown[], duration: number, source: string) => void>();

vi.mock('@profiling/RequestProfiler', () => ({
  RequestProfiler: {
    create: vi.fn(() => ({
      getQueryLogger: () => ({ logQuery }),
      captureRequest,
      generateReport,
    })),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    error: vi.fn(),
  },
}));

describe('ProfilerMiddleware', () => {
  const previousEnableProfiler = process.env['ENABLE_PROFILER'];

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    captureRequest.mockReset();
    generateReport.mockReset();
    logQuery.mockReset();

    if (previousEnableProfiler === undefined) {
      delete process.env['ENABLE_PROFILER'];
    } else {
      process.env['ENABLE_PROFILER'] = previousEnableProfiler;
    }
  });

  it('passes through when disabled', async () => {
    process.env['ENABLE_PROFILER'] = 'false';

    const { ProfilerMiddleware } = await import('@app/Middleware/ProfilerMiddleware');

    const next = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const req = { context: {} } as unknown as { context: Record<string, unknown> };
    const res = {
      locals: {},
      setHeader: vi.fn(),
    } as unknown as { locals: Record<string, unknown>; setHeader: Mock };

    await ProfilerMiddleware(req as never, res as never, next as never);

    expect(next).toHaveBeenCalledTimes(1);
    expect(RequestProfiler.create).not.toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('profiles request, logs queries, and sets headers (including N1)', async () => {
    process.env['ENABLE_PROFILER'] = 'true';

    const profile = {
      duration: 123,
      queriesExecuted: 7,
      n1Patterns: [{ table: 'users' }],
      memoryDelta: { heapUsed: 1, heapTotal: 2, external: 3, rss: 4 },
      timestamp: new Date(),
    };

    captureRequest.mockImplementationOnce(async (fn) => {
      await fn();
      return profile;
    });

    generateReport.mockReturnValueOnce('report');

    const { ProfilerMiddleware } = await import('@app/Middleware/ProfilerMiddleware');

    const afterQueryHandlers: Array<(sql: string, params: unknown[], duration: number) => void> =
      [];
    const db = {
      onAfterQuery: vi.fn((handler: (sql: string, params: unknown[], duration: number) => void) => {
        afterQueryHandlers.push(handler);
      }),
    };

    const next = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const req = { context: { db } } as unknown as { context: { db: unknown } };
    const res = {
      locals: {},
      setHeader: vi.fn(),
    } as unknown as { locals: Record<string, unknown>; setHeader: Mock };

    await ProfilerMiddleware(req as never, res as never, next as never);

    expect(next).toHaveBeenCalledTimes(1);
    expect(RequestProfiler.create).toHaveBeenCalledTimes(1);

    expect(db.onAfterQuery).toHaveBeenCalledTimes(1);
    expect(afterQueryHandlers).toHaveLength(1);

    // cover the db.onAfterQuery callback
    afterQueryHandlers[0]('select 1', ['a'], 10);
    expect(logQuery).toHaveBeenCalledWith('select 1', ['a'], 10, 'middleware-profiling');

    // profile attached
    expect(res.locals['profile']).toBe(profile);

    // headers
    const headers = (res.setHeader as unknown as Mock).mock.calls.map((c) => c[0]) as string[];
    expect(headers).toContain('X-Profiler-Report');
    expect(headers).toContain('X-Profiler-Queries');
    expect(headers).toContain('X-Profiler-Duration');
    expect(headers).toContain('X-Profiler-N1-Patterns');

    const reportHeader = (res.setHeader as unknown as Mock).mock.calls.find(
      (c) => c[0] === 'X-Profiler-Report'
    )?.[1] as string | undefined;

    expect(reportHeader).toBe(Buffer.from('report').toString('base64'));
  });

  it('logs and continues when report encoding fails', async () => {
    process.env['ENABLE_PROFILER'] = 'true';

    const profile = {
      duration: 1,
      queriesExecuted: 0,
      n1Patterns: [],
      memoryDelta: { heapUsed: 1, heapTotal: 2, external: 3, rss: 4 },
      timestamp: new Date(),
    };

    captureRequest.mockImplementationOnce(async (fn) => {
      await fn();
      return profile;
    });

    generateReport.mockImplementationOnce(() => {
      throw new Error('encode fail');
    });

    const { ProfilerMiddleware } = await import('@app/Middleware/ProfilerMiddleware');
    const { Logger } = await import('@config/logger');

    const next = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const req = { context: {} } as unknown as { context: Record<string, unknown> };
    const res = {
      locals: {},
      setHeader: vi.fn(),
    } as unknown as { locals: Record<string, unknown>; setHeader: Mock };

    await ProfilerMiddleware(req as never, res as never, next as never);

    expect(res.locals['profile']).toBe(profile);
    expect(Logger.error as unknown as Mock).toHaveBeenCalledWith(
      'Failed to encode profiler report header:',
      expect.any(Error)
    );
  });
});
