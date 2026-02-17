import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const mocked = vi.hoisted(() => {
  const Env = {
    get: vi.fn(),
    getInt: vi.fn(),
    getBool: vi.fn(),
  };

  const Logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  const deletes: Array<{ table: string; ids: number[] }> = [];

  const createDb = (rows: {
    transitions: Array<{ id?: unknown }>;
    jobs: Array<{ id?: unknown }>;
  }) => {
    const tableApi = (table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        where: vi.fn(() => chain),
        orderBy: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        get: vi.fn(async () => {
          if (table.includes('transition')) return rows.transitions;
          return rows.jobs;
        }),
        whereIn: vi.fn((_col: string, ids: number[]) => ({
          delete: vi.fn(async () => {
            deletes.push({ table, ids });
          }),
        })),
      };
      return chain;
    };

    return {
      table: vi.fn((table: string) => tableApi(table)),
    };
  };

  const useDatabase = vi.fn();

  return { Env, Logger, useDatabase, createDb, deletes };
});

vi.mock('@config/env', () => ({ Env: mocked.Env }));
vi.mock('@config/logger', () => ({ Logger: mocked.Logger }));
vi.mock('@orm/Database', () => ({ useDatabase: mocked.useDatabase }));

describe('schedules/job-tracking-cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    mocked.deletes.length = 0;
    vi.resetModules();
    vi.clearAllMocks();

    mocked.Env.get.mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'JOB_TRACKING_DB_CONNECTION') return 'default';
      if (key === 'JOB_TRACKING_DB_TABLE') return 'zintrust_jobs';
      if (key === 'JOB_TRACKING_DB_TRANSITIONS_TABLE') return 'zintrust_job_transitions';
      if (key === 'JOB_TRACKING_CLEANUP_RETENTION_HOURS') return '';
      if (key === 'JOB_TRACKING_CLEANUP_LOCK_PROVIDER') return 'redis';
      return defaultVal ?? '';
    });
    mocked.Env.getInt.mockImplementation((key: string, defaultVal?: number) => {
      if (key === 'JOB_TRACKING_CLEANUP_RETENTION_DAYS') return 0; // clamp to 1
      if (key === 'JOB_TRACKING_CLEANUP_BATCH_SIZE') return 10; // clamp to 100
      if (key === 'JOB_TRACKING_CLEANUP_MAX_BATCHES') return 3;
      if (key === 'JOB_TRACKING_CLEANUP_INTERVAL_MS') return defaultVal ?? 0;
      return defaultVal ?? 0;
    });
    mocked.Env.getBool.mockImplementation(
      (_key: string, defaultVal?: boolean) => defaultVal ?? false
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs batches, deletes when ids exist, and stops when no more rows', async () => {
    const dbWithRows = mocked.createDb({
      transitions: [{ id: 1 }, { id: '2' }, { id: 'nope' }],
      jobs: [{ id: 10 }, { id: undefined }],
    });
    const dbEmpty = mocked.createDb({ transitions: [], jobs: [] });
    mocked.useDatabase.mockImplementationOnce(() => dbWithRows).mockImplementation(() => dbEmpty);

    const scheduleModule = await import('@/schedules/job-tracking-cleanup');
    const schedule = scheduleModule.default;

    await schedule.handler(undefined as any);

    expect(mocked.deletes.length).toBe(2);
    expect(mocked.deletes[0]?.ids).toEqual([1, 2]);
    expect(mocked.deletes[1]?.ids).toEqual([10]);
    expect(mocked.Logger.info).toHaveBeenCalledWith(
      'Job tracking cleanup run completed',
      expect.objectContaining({ batchesRun: expect.any(Number) })
    );
  });

  it('uses retentionHours when provided and supports cleanupJobTrackingOnce', async () => {
    mocked.Env.get.mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'JOB_TRACKING_CLEANUP_RETENTION_HOURS') return '2';
      if (key === 'JOB_TRACKING_DB_TABLE') return 'zintrust_jobs';
      if (key === 'JOB_TRACKING_DB_TRANSITIONS_TABLE') return 'zintrust_job_transitions';
      if (key === 'JOB_TRACKING_CLEANUP_LOCK_PROVIDER') return 'redis';
      return defaultVal ?? '';
    });

    const db = mocked.createDb({ transitions: [], jobs: [] });
    mocked.useDatabase.mockReturnValue(db);

    const scheduleModule = await import('@/schedules/job-tracking-cleanup');
    await scheduleModule.cleanupJobTrackingOnce();

    expect(mocked.Logger.info).toHaveBeenCalledWith(
      'Job tracking cleanup batch completed',
      expect.objectContaining({
        deletedTransitions: 0,
        deletedJobs: 0,
        retentionDays: expect.any(Number),
      })
    );
  });

  it('rejects unsafe table names', async () => {
    mocked.Env.get.mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'JOB_TRACKING_DB_TABLE') return 'bad-table-name';
      if (key === 'JOB_TRACKING_DB_TRANSITIONS_TABLE') return 'zintrust_job_transitions';
      return defaultVal ?? '';
    });

    mocked.useDatabase.mockReturnValue(mocked.createDb({ transitions: [], jobs: [] }));

    const scheduleModule = await import('@/schedules/job-tracking-cleanup');
    const schedule = scheduleModule.default;

    await expect(schedule.handler(undefined as any)).rejects.toThrow(/invalid characters/i);
    expect(mocked.Logger.info as unknown as Mock).not.toHaveBeenCalledWith(
      'Job tracking cleanup run completed',
      expect.anything()
    );
  });
});
