import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => {
  return {
    Logger: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

const useDatabaseMock = vi.fn();
vi.mock('@orm/Database', () => {
  return {
    useDatabase: (...args: unknown[]) => useDatabaseMock(...args),
  };
});

import { Logger } from '../../../../src/config/logger';
import { createJobStateTrackerDbPersistence, JobStateTracker } from '../../../../src/index';

type TableApi = {
  where: ReturnType<typeof vi.fn>;
  whereIn: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};

type DbApi = {
  table: ReturnType<typeof vi.fn>;
  _tableApi: TableApi;
};

const makeDb = (): DbApi => {
  const tableApi: TableApi = {
    where: vi.fn().mockReturnThis(),
    whereIn: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    first: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue([]),
  };

  const db: DbApi = {
    table: vi.fn().mockReturnValue(tableApi),
    _tableApi: tableApi,
  };

  return db;
};

describe('createJobStateTrackerDbPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDatabaseMock.mockReset();
    vi.stubEnv('JOB_TRACKING_DB_CONNECTION', 'default');
    vi.stubEnv('JOB_TRACKING_DB_TABLE', 'zintrust_jobs');
    vi.stubEnv('JOB_TRACKING_DB_TRANSITIONS_TABLE', 'zintrust_job_transitions');
    vi.stubEnv('JOB_TRACKING_PERSIST_TRANSITIONS_ENABLED', '0');

    JobStateTracker.reset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    JobStateTracker.reset();
  });

  it('updates existing rows unless already enqueued', async () => {
    const db = makeDb();
    useDatabaseMock.mockReturnValue(db);

    const adapter = createJobStateTrackerDbPersistence({ persistResult: false });

    // Case 1: existing row is enqueued -> no update
    db._tableApi.first.mockResolvedValueOnce({ status: 'enqueued' });
    await adapter.upsertJob({
      jobId: 'j1',
      queueName: 'q',
      status: 'pending_recovery',
      attempts: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      payload: undefined,
      result: { ok: true },
    });

    expect(db._tableApi.update).not.toHaveBeenCalled();
    expect(db._tableApi.insert).not.toHaveBeenCalled();

    // Case 2: existing row not enqueued -> update
    db._tableApi.first.mockResolvedValueOnce({ status: 'pending' });
    await adapter.upsertJob({
      jobId: 'j2',
      queueName: 'q',
      status: 'pending',
      attempts: 2,
      maxAttempts: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      result: { ok: true },
      lastError: 'x',
      retryAt: '2026-01-01T00:00:00.000Z',
    });

    expect(db._tableApi.update).toHaveBeenCalledTimes(1);
    const payload = db._tableApi.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ status: 'pending', attempts: 2 });
    expect(payload['result_json']).toBeNull();
  });

  it('inserts only pending_recovery and forces non-null payload_json', async () => {
    const db = makeDb();
    useDatabaseMock.mockReturnValue(db);

    const adapter = createJobStateTrackerDbPersistence({ persistResult: true });

    // No existing row
    db._tableApi.first.mockResolvedValueOnce(null);

    await adapter.upsertJob({
      jobId: 'j3',
      queueName: 'q',
      status: 'pending_recovery',
      attempts: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      payload: undefined,
    });

    expect(db._tableApi.insert).toHaveBeenCalledTimes(1);
    const inserted = db._tableApi.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted['payload_json']).toBe('{}');

    // No existing row, but not pending_recovery => no insert
    db._tableApi.first.mockResolvedValueOnce(null);
    await adapter.upsertJob({
      jobId: 'j4',
      queueName: 'q',
      status: 'enqueued',
      attempts: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(db._tableApi.insert).toHaveBeenCalledTimes(1);
  });

  it('does nothing when DB connection is unavailable (and warns)', async () => {
    useDatabaseMock.mockImplementation(() => {
      throw new Error('no conn');
    });

    const adapter = createJobStateTrackerDbPersistence();
    await adapter.upsertJob({
      jobId: 'j5',
      queueName: 'q',
      status: 'pending_recovery',
      attempts: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(
      (Logger.warn as unknown as { mock: { calls: unknown[] } }).mock.calls.length
    ).toBeGreaterThan(0);
  });

  it('inserts transitions only when JOB_TRACKING_PERSIST_TRANSITIONS_ENABLED is true', async () => {
    const db = makeDb();
    useDatabaseMock.mockReturnValue(db);

    const adapter = createJobStateTrackerDbPersistence();
    await adapter.insertTransition({
      jobId: 'j6',
      queueName: 'q',
      fromStatus: null,
      toStatus: 'pending',
      reason: 'r',
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(db._tableApi.insert).not.toHaveBeenCalled();

    vi.stubEnv('JOB_TRACKING_PERSIST_TRANSITIONS_ENABLED', '1');
    await adapter.insertTransition({
      jobId: 'j7',
      queueName: 'q',
      fromStatus: 'pending',
      toStatus: 'active',
      reason: 'r',
      timestamp: '2026-01-01T00:00:00.000Z',
      attempts: 1,
      error: 'x',
    });

    expect(db._tableApi.insert).toHaveBeenCalledTimes(1);
  });
});
