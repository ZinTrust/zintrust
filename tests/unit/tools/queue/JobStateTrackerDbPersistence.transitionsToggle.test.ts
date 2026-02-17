import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('JobStateTrackerDbPersistence transition toggle', () => {
  const getMock = vi.fn();
  const getBoolMock = vi.fn();
  const useDatabaseMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    getMock.mockImplementation((key: string, fallback: string) => {
      if (key === 'JOB_TRACKING_DB_CONNECTION') return 'default';
      if (key === 'JOB_TRACKING_DB_TABLE') return 'zintrust_jobs';
      if (key === 'JOB_TRACKING_DB_TRANSITIONS_TABLE') return 'zintrust_job_transitions';
      return fallback;
    });

    getBoolMock.mockImplementation((key: string, fallback: boolean) => {
      if (key === 'JOB_TRACKING_PERSIST_TRANSITIONS_ENABLED') return false;
      return fallback;
    });

    vi.doMock('@config/env', () => ({
      Env: {
        get: getMock,
        getBool: getBoolMock,
      },
    }));

    vi.doMock('@config/logger', () => ({
      Logger: {
        warn: vi.fn(),
      },
    }));

    vi.doMock('@orm/Database', () => ({
      useDatabase: useDatabaseMock,
    }));
  });

  it('skips inserting transitions when JOB_TRACKING_PERSIST_TRANSITIONS_ENABLED=false', async () => {
    const insert = vi.fn(async () => 1);
    const table = vi.fn(() => ({ insert }));
    useDatabaseMock.mockReturnValue({ table });

    const { createJobStateTrackerDbPersistence } =
      await import('@/tools/queue/JobStateTrackerDbPersistence');
    const adapter = createJobStateTrackerDbPersistence();

    await adapter.insertTransition({
      jobId: 'job-1',
      queueName: 'emails',
      fromStatus: 'pending',
      toStatus: 'completed',
      reason: 'test',
      timestamp: new Date().toISOString(),
      attempts: 1,
    });

    expect(table).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
