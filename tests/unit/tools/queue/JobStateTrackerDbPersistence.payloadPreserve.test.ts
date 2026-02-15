import { beforeEach, describe, expect, it, vi } from 'vitest';

type FakeQuery = {
  where: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
};

describe('JobStateTrackerDbPersistence payload preservation', () => {
  const getMock = vi.fn();
  const getBoolMock = vi.fn();

  const useDatabaseMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    getBoolMock.mockImplementation((_key: string, fallback: boolean) => fallback);
    getMock.mockImplementation((key: string, fallback: string) => {
      if (key === 'JOB_TRACKING_DB_CONNECTION') return 'default';
      if (key === 'JOB_TRACKING_DB_TABLE') return 'zintrust_jobs';
      if (key === 'JOB_TRACKING_DB_TRANSITIONS_TABLE') return 'zintrust_job_transitions';
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

  it('does not overwrite payload_json when payload is undefined on update', async () => {
    const update = vi.fn(async () => 1);

    const query: FakeQuery = {
      where: vi.fn(function () {
        return this;
      }),
      first: vi.fn(async () => ({ job_id: 'job-1' })),
      update,
      insert: vi.fn(async () => 1),
    };

    const table = vi.fn(() => query);
    useDatabaseMock.mockReturnValue({ table });

    const { createJobStateTrackerDbPersistence } =
      await import('@/tools/queue/JobStateTrackerDbPersistence');

    const adapter = createJobStateTrackerDbPersistence();
    await adapter.upsertJob({
      jobId: 'job-1',
      queueName: 'emails',
      status: 'completed',
      attempts: 1,
      payload: undefined,
      createdAt: '2026-02-15T00:00:00.000Z',
      updatedAt: '2026-02-15T00:00:01.000Z',
    });

    expect(update).toHaveBeenCalledTimes(1);
    const payload = update.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(payload).toBeTruthy();
    expect(Object.prototype.hasOwnProperty.call(payload, 'payload_json')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(payload, 'created_at')).toBe(false);
  });

  it('forces payload_json to a non-null value on insert when payload is undefined', async () => {
    const insert = vi.fn(async () => 1);

    const query: FakeQuery = {
      where: vi.fn(function () {
        return this;
      }),
      first: vi.fn(async () => null),
      update: vi.fn(async () => 1),
      insert,
    };

    const table = vi.fn(() => query);
    useDatabaseMock.mockReturnValue({ table });

    const { createJobStateTrackerDbPersistence } =
      await import('@/tools/queue/JobStateTrackerDbPersistence');

    const adapter = createJobStateTrackerDbPersistence();
    await adapter.upsertJob({
      jobId: 'job-2',
      queueName: 'emails',
      status: 'pending',
      attempts: 0,
      payload: undefined,
      createdAt: '2026-02-15T00:00:00.000Z',
      updatedAt: '2026-02-15T00:00:01.000Z',
    });

    expect(insert).toHaveBeenCalledTimes(1);
    const payload = insert.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(payload['payload_json']).toBe('{}');
  });
});
