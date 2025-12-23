import { RequestProfiler } from '@profiling/RequestProfiler';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const loggerInfo = vi.fn();
const loggerError = vi.fn();

vi.mock('@config/logger', () => ({
  Logger: {
    info: loggerInfo,
    error: loggerError,
  },
}));

type Profile = {
  queriesExecuted: number;
  duration: number;
  n1Patterns: Array<unknown>;
};

const logQuery = vi.fn();
const getQueryLogger = vi.fn(() => ({ logQuery }));
const captureRequest = vi.fn(async (fn: () => Promise<void>) => {
  await fn();
  const profile: Profile = {
    queriesExecuted: 2,
    duration: 123,
    n1Patterns: ['n1'],
  };
  return profile;
});
const generateReport = vi.fn(() => 'report');

vi.mock('@profiling/RequestProfiler', () => ({
  RequestProfiler: {
    create: vi.fn(() => ({
      getQueryLogger,
      captureRequest,
      generateReport,
    })),
  },
}));

describe('ProfilerMiddleware', () => {
  const previousEnableProfiler = process.env['ENABLE_PROFILER'];

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    if (previousEnableProfiler === undefined) {
      delete process.env['ENABLE_PROFILER'];
    } else {
      process.env['ENABLE_PROFILER'] = previousEnableProfiler;
    }
  });

  it('passes through when profiler is disabled', async () => {
    process.env['ENABLE_PROFILER'] = 'false';

    const { ProfilerMiddleware } = await import(
      '@app/Middleware/ProfilerMiddleware' + '?v=disabled'
    );

    const next = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const req = { context: {} } as unknown as { context: { db?: unknown } };
    const res = {
      locals: {},
      setHeader: vi.fn(),
    } as unknown as { locals: Record<string, unknown>; setHeader: Mock };

    await ProfilerMiddleware(req as never, res as never, next as never);

    expect(next).toHaveBeenCalledTimes(1);
    expect(RequestProfiler.create).not.toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('profiles request, hooks db queries, and sets headers', async () => {
    process.env['ENABLE_PROFILER'] = 'true';

    const { ProfilerMiddleware } = await import(
      '@app/Middleware/ProfilerMiddleware' + '?v=enabled'
    );

    let onAfterQueryCb: ((sql: string, params: unknown[], duration: number) => void) | undefined;

    const next = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const req = {
      context: {
        db: {
          onAfterQuery: vi.fn((cb: (sql: string, params: unknown[], duration: number) => void) => {
            onAfterQueryCb = cb;
          }),
        },
      },
    } as unknown as { context: { db: { onAfterQuery: Mock } } };

    const res = {
      locals: {},
      setHeader: vi.fn(),
    } as unknown as { locals: Record<string, unknown>; setHeader: Mock };

    await ProfilerMiddleware(req as never, res as never, next as never);

    expect(RequestProfiler.create).toHaveBeenCalledTimes(1);
    expect(getQueryLogger).toHaveBeenCalledTimes(1);

    expect(onAfterQueryCb).toBeTypeOf('function');
    onAfterQueryCb?.('SELECT 1', [], 5);

    expect(logQuery).toHaveBeenCalledWith('SELECT 1', [], 5, 'middleware-profiling');

    expect(captureRequest).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);

    expect(res.locals['profile']).toMatchObject({
      queriesExecuted: 2,
      duration: 123,
    });

    expect(generateReport).toHaveBeenCalledTimes(1);

    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Profiler-Report',
      Buffer.from('report').toString('base64')
    );
    expect(res.setHeader).toHaveBeenCalledWith('X-Profiler-Queries', '2');
    expect(res.setHeader).toHaveBeenCalledWith('X-Profiler-Duration', '123');
    expect(res.setHeader).toHaveBeenCalledWith('X-Profiler-N1-Patterns', '1');
  });

  it('logs an error if report generation fails', async () => {
    process.env['ENABLE_PROFILER'] = 'true';

    generateReport.mockImplementationOnce(() => {
      throw new Error('encode fail');
    });

    const { ProfilerMiddleware } = await import(
      '@app/Middleware/ProfilerMiddleware' + '?v=report-fail'
    );

    const next = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const req = { context: {} } as unknown as { context: { db?: unknown } };
    const res = {
      locals: {},
      setHeader: vi.fn(),
    } as unknown as { locals: Record<string, unknown>; setHeader: Mock };

    await ProfilerMiddleware(req as never, res as never, next as never);

    expect(next).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledWith(
      'Failed to encode profiler report header:',
      expect.any(Error)
    );
  });
});
