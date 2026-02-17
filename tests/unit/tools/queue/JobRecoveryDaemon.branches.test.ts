import { JobRecoveryDaemon, JobStateTracker } from '@/index';
import { Logger } from '@config/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => {
  return {
    Logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

const enqueueMock = vi.fn();
vi.mock('@queue/Queue', () => {
  return {
    Queue: {
      enqueue: (...args: unknown[]) => enqueueMock(...args),
    },
  };
});

const useDatabaseMock = vi.fn();
vi.mock('@orm/Database', () => {
  return {
    useDatabase: (...args: unknown[]) => useDatabaseMock(...args),
  };
});

type TableApi = {
  select: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};

type DbApi = {
  table: ReturnType<typeof vi.fn>;
  _tableApi: TableApi;
};

const makeDb = (rows: unknown[]): DbApi => {
  const tableApi: TableApi = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(rows),
  };

  return {
    table: vi.fn().mockReturnValue(tableApi),
    _tableApi: tableApi,
  };
};

describe('JobRecoveryDaemon (branches)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    vi.stubEnv('JOB_TRACKING_ENABLED', '1');
    vi.stubEnv('JOB_TRACKING_PERSISTENCE_ENABLED', '0');
    vi.stubEnv('JOB_RECOVERY_MIN_AGE_MS', '0');

    enqueueMock.mockReset();
    useDatabaseMock.mockReset();
    JobStateTracker.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    JobStateTracker.reset();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('recoverOne returns dead_letter when attempts >= maxAttempts', async () => {
    const out = await JobRecoveryDaemon.recoverOne({
      queueName: 'q',
      jobId: 'j',
      status: 'pending_recovery',
      attempts: 3,
      maxAttempts: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(out).toBe('dead_letter');
    expect(JobStateTracker.get('q', 'j')?.status).toBe('dead_letter');
  });

  it('recoverOne requeues and hands off with backoff timestamp (attempt=1 -> 60s)', async () => {
    enqueueMock.mockResolvedValue('qid-1');
    const out = await JobRecoveryDaemon.recoverOne({
      queueName: 'q',
      jobId: 'j',
      status: 'pending_recovery',
      attempts: 1,
      maxAttempts: 3,
      payload: { a: 1 },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(out).toBe('requeued');
    const payload = enqueueMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload['uniqueId']).toBe('j');
    expect(payload['timestamp']).toBe(new Date('2026-01-01T00:01:00.000Z').getTime());
    expect(JobStateTracker.get('q', 'j')?.status).toBe('enqueued');
  });

  it('recoverOne uses 3m backoff for attempt>=2 and handles already-exists errors (non-Error)', async () => {
    enqueueMock.mockRejectedValue('JobId already exists');

    const out = await JobRecoveryDaemon.recoverOne({
      queueName: 'q',
      jobId: 'j3',
      status: 'pending_recovery',
      attempts: 2,
      maxAttempts: 5,
      payload: { a: 1 },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(out).toBe('requeued');
    expect(JobStateTracker.get('q', 'j3')?.status).toBe('enqueued');
  });

  it('recoverOne marks pending_recovery and rethrows on non-duplicate enqueue errors', async () => {
    enqueueMock.mockRejectedValueOnce(new Error('boom'));

    await expect(
      JobRecoveryDaemon.recoverOne({
        queueName: 'q',
        jobId: 'jerr',
        status: 'pending_recovery',
        attempts: 0,
        maxAttempts: 3,
        payload: { a: 1 },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
    ).rejects.toBeDefined();

    const rec = JobStateTracker.get('q', 'jerr');
    expect(rec?.status).toBe('pending_recovery');
    expect(rec?.attempts).toBe(1);
  });

  it('runOnce pulls persisted recoverables, de-dupes, and logs summary', async () => {
    vi.stubEnv('JOB_TRACKING_PERSISTENCE_ENABLED', '1');

    // Create in-memory recoverable
    await JobStateTracker.pendingRecovery({ queueName: 'q', jobId: 'same', attempts: 0 });
    const inMemory = JobStateTracker.get('q', 'same');
    if (inMemory) inMemory.updatedAt = '2025-12-31T00:00:00.000Z';

    enqueueMock.mockResolvedValue('qid');

    const db = makeDb([
      {
        queue_name: 'q',
        job_id: 'same',
        attempts: 1,
        max_attempts: 2,
        payload_json: '{bad json',
        retry_at: '',
        updated_at: '',
      },
      {
        queue_name: 'q',
        job_id: 'other',
        attempts: 0,
        max_attempts: 2,
        payload_json: '{"x":1}',
        retry_at: null,
        updated_at: '2025-12-31 00:00:00',
      },
      {
        queue_name: 'q',
        job_id: 'fallbacks',
        attempts: 'bad',
        max_attempts: 'bad',
        payload_json: null,
        retry_at: '   ',
        updated_at: null,
      },
    ]);
    useDatabaseMock.mockReturnValue(db);

    const out = await JobRecoveryDaemon.runOnce();

    expect(out.scanned).toBe(3);
    expect(enqueueMock).toHaveBeenCalled();

    const infoCalls = (Logger.info as unknown as { mock: { calls: unknown[] } }).mock.calls;
    expect(infoCalls.length).toBeGreaterThan(0);
  });
});
