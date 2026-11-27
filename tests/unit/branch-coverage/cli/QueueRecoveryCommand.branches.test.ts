import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queueDefault: 'redis',
  tracker: {
    get: vi.fn(),
    list: vi.fn(),
    handedOffToQueue: vi.fn(),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@config/queue', () => ({
  get queueConfig() {
    return {
      get default(): string {
        return mocks.queueDefault;
      },
    };
  },
}));

vi.mock('@config/database', () => ({ databaseConfig: { connections: {} } }));
vi.mock('@orm/Database', () => ({
  resetDatabase: vi.fn(async () => undefined),
  useDatabase: vi.fn(),
}));
vi.mock('@orm/DatabaseRuntimeRegistration', () => ({
  registerDatabasesFromRuntimeConfig: vi.fn(),
}));
vi.mock('@queue/JobRecoveryDaemon', () => ({
  JobRecoveryDaemon: {
    runOnce: vi.fn(async () => ({ scanned: 1 })),
    recoverOne: vi.fn(async () => 'requeued'),
  },
}));
vi.mock('@queue/QueueReliabilityOrchestrator', () => ({
  QueueReliabilityOrchestrator: { start: vi.fn(), stop: vi.fn() },
}));
vi.mock('@queue/Queue', () => ({
  Queue: { enqueue: vi.fn(async () => 'replay-id') },
}));
vi.mock('@queue/QueueRuntimeRegistration', () => ({
  registerQueuesFromRuntimeConfig: vi.fn(async () => undefined),
}));
vi.mock('@queue/JobStateTracker', () => ({ JobStateTracker: mocks.tracker }));

import { QueueRecoveryCommand } from '@cli/commands/QueueRecoveryCommand';
import { Logger } from '@config/logger';
import { useDatabase } from '@orm/Database';
import { JobRecoveryDaemon } from '@queue/JobRecoveryDaemon';
import { JobStateTracker } from '@queue/JobStateTracker';
import { Queue } from '@queue/Queue';
import { QueueReliabilityOrchestrator } from '@queue/QueueReliabilityOrchestrator';
import { registerQueuesFromRuntimeConfig } from '@queue/QueueRuntimeRegistration';

type Options = Record<string, unknown>;

const okResponse = (records: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ records }),
  }) as never;

const chainWithRows = (rows: unknown) => {
  const chain: Record<string, any> = {
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    get: vi.fn(async () => rows),
    first: vi.fn(async () => rows),
  };
  return { table: vi.fn(() => chain), chain };
};

const persistedRow = (overrides: Record<string, unknown> = {}) => ({
  queue_name: 'emails',
  job_id: 'db-job',
  status: 'timeout',
  attempts: -2,
  max_attempts: 0,
  payload_json: '{invalid',
  result_json: '{"ok":true}',
  last_error: 42,
  retry_at: null,
  created_at: undefined,
  updated_at: undefined,
  ...overrides,
});

const trackedRecord = (overrides: Record<string, unknown> = {}) => ({
  queueName: 'emails',
  jobId: 'tracked-job',
  status: 'pending_recovery',
  attempts: 2,
  maxAttempts: 3,
  payload: { hello: 'world' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

describe('QueueRecoveryCommand uncovered branch coverage', () => {
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queueDefault = 'redis';
    mocks.tracker.get.mockReturnValue(undefined);
    mocks.tracker.list.mockReturnValue([]);
    process.exitCode = 0;
    vi.stubEnv('QUEUE_TRACKER_API_URL', '');
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('JOB_TRACKING_DB_CONNECTION', '');
    vi.stubEnv('JOB_TRACKING_DB_TABLE', '');
    vi.stubEnv('QUEUE_DRIVER', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
  });

  const execute = async (options: Options): Promise<void> =>
    QueueRecoveryCommand.create().execute(options);

  const loggedText = (): string =>
    vi.mocked(Logger.info).mock.calls.flat().map(String).join('\n');

  it('normalizes persisted rows with invalid, missing, and typed fields', async () => {
    const { chain } = chainWithRows([
      persistedRow(),
      persistedRow({
        job_id: 'db-job-2',
        status: 'UNKNOWN-STATUS',
        attempts: Number.NaN,
        max_attempts: 2.9,
        payload_json: '[1,2]',
        created_at: '2026-02-01T00:00:00.000Z',
        updated_at: '2026-02-02T00:00:00.000Z',
        last_error_code: 'E_FAIL',
        worker_name: 'worker-1',
      }),
    ]);
    vi.mocked(useDatabase).mockReturnValue({ table: vi.fn(() => chain) } as never);

    await execute({ list: true, source: 'db', json: true });

    const printed = loggedText();
    const rows = JSON.parse(printed.slice(printed.indexOf('['), printed.lastIndexOf(']') + 1)) as Array<
      Record<string, unknown>
    >;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      jobId: 'db-job',
      status: 'timeout',
      attempts: 0,
      result: { ok: true },
    });
    expect(rows[0]).not.toHaveProperty('maxAttempts');
    expect(rows[0]).not.toHaveProperty('payload');
    expect(typeof rows[0]?.['createdAt']).toBe('string');
    expect(rows[0]?.['updatedAt']).toBe(rows[0]?.['createdAt']);
    expect(rows[1]).toMatchObject({
      status: 'pending_recovery',
      attempts: 0,
      maxAttempts: 2,
      payload: [1, 2],
      lastErrorCode: 'E_FAIL',
      workerName: 'worker-1',
    });
  });

  it('rejects invalid limit, status, and source values', async () => {
    await expect(execute({ list: true, limit: 'abc' })).rejects.toThrow(/Invalid --limit/);
    await expect(execute({ list: true, limit: '0' })).rejects.toThrow(/Invalid --limit/);
    await expect(execute({ list: true, status: ' ' })).resolves.toBeUndefined();
    await expect(execute({ list: true, status: 'nope' })).rejects.toThrow(/Invalid --status/);
    await expect(execute({ list: true, source: 'bogus' })).rejects.toThrow(/Invalid --source/);
  });

  it('normalizes server records and handles empty or failed responses', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse([
        null,
        'not-an-object',
        { queueName: '', jobId: 'x' },
        { queueName: 'q', jobId: '' },
        { queueName: 7, jobId: null },
        {
          queueName: 'q',
          jobId: 'server-2',
          status: 'active',
          attempts: Number.NaN,
          maxAttempts: '3',
        },
        {
          queueName: 'q',
          jobId: 'server-1',
          status: 'weird',
          attempts: 'not-a-number',
          maxAttempts: -3,
          payload: null,
          result: 'text',
          lastError: 10,
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: 9,
        },
      ])
    );

    await execute({ list: true, source: 'server', json: true, queue: '  ', status: 'active' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestedUrl = String(fetchSpy.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain('status=active');
    expect(requestedUrl).not.toContain('queue=');

    const printed = loggedText();
    const rows = JSON.parse(printed.slice(printed.indexOf('['), printed.lastIndexOf(']') + 1)) as Array<
      Record<string, unknown>
    >;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ jobId: 'server-2', status: 'active', attempts: 0 });
    expect(rows[1]).toMatchObject({ jobId: 'server-1', status: 'pending_recovery', attempts: 0 });

    fetchSpy.mockResolvedValueOnce(okResponse({ records: 'not-an-array' }));
    await execute({ list: true, source: 'server', asJson: false });
    expect(Logger.info).toHaveBeenCalledWith('No jobs found for the provided filters');

    fetchSpy.mockResolvedValueOnce({ ok: false, status: 503 } as never);
    await expect(execute({ list: true, source: 'server' })).rejects.toThrow(/HTTP 503/);
  });

  it('uses tracker URL fallbacks, filters persistence queries, and handles null rows', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse([]));
    vi.stubEnv('APP_URL', 'http://app.local');
    await execute({ list: true, source: 'server', queue: 'emails', status: 'completed' });
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('http://app.local');
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('queue=emails');

    vi.stubEnv('QUEUE_TRACKER_API_URL', 'http://tracker.local');
    await execute({ list: true, source: 'server' });
    expect(String(fetchSpy.mock.calls[1]?.[0])).toContain('http://tracker.local');

    const { chain } = chainWithRows(null);
    vi.mocked(useDatabase).mockReturnValue({ table: vi.fn(() => chain) } as never);
    await execute({ list: true, source: 'db', queue: 'emails', status: 'pending' });
    expect(chain['where']).toHaveBeenCalledWith('queue_name', '=', 'emails');
    expect(chain['where']).toHaveBeenCalledWith('status', '=', 'pending');
    expect(Logger.info).toHaveBeenCalledWith('No jobs found for the provided filters');
  });

  it('covers all auto-list fallbacks without spawning network calls', async () => {
    mocks.tracker.list.mockReturnValueOnce([trackedRecord()]);
    await execute({ list: true, source: 'auto' });
    expect(loggedText()).toContain('tracked-job');

    await execute({ list: true, source: 'memory' });
    expect(loggedText()).toContain('No jobs found for the provided filters');

    vi.stubEnv('VITEST', '1');
    await execute({ list: true, source: 'auto' });
    expect(loggedText()).toContain('No jobs found for the provided filters');
    vi.stubEnv('VITEST', '');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse([]));
    await execute({ list: true, source: 'auto' });
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.stubEnv('VITEST', '');
    await execute({ list: true, source: 'auto' });
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'production');
    fetchSpy.mockResolvedValueOnce(okResponse([{ queueName: 'q', jobId: 'remote-job' }]));
    await execute({ list: true, source: 'auto' });
    expect(Logger.info).toHaveBeenCalledWith('Tracker list sourced from running app process memory');

    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    await execute({ list: true, source: 'auto' });
    expect(Logger.warn).toHaveBeenCalledWith(
      'Failed to fetch tracker list from running app',
      expect.objectContaining({ error: 'network down' })
    );
  });

  it('finds targeted jobs through memory matches or persistence fallbacks', async () => {
    mocks.tracker.get.mockReturnValue(undefined);
    mocks.tracker.list.mockReturnValueOnce([
      { queueName: 'other', jobId: 'wanted' },
      { queueName: 'emails', jobId: 'wanted', status: 'pending_recovery' },
    ]);

    await execute({ jobId: 'wanted', queue: 'emails', dryRun: true });
    expect(JobRecoveryDaemon.recoverOne).not.toHaveBeenCalled();

    mocks.tracker.list.mockReturnValue([]);
    const { chain } = chainWithRows(persistedRow({ job_id: 'persisted-job', status: 'enqueued' }));
    vi.mocked(useDatabase).mockReturnValue({ table: vi.fn(() => chain) } as never);
    await execute({ jobId: 'persisted-job', queue: 'emails' });
    expect(chain['where']).toHaveBeenCalledWith('job_id', '=', 'persisted-job');
    expect(chain['where']).toHaveBeenCalledWith('queue_name', '=', 'emails');
    expect(Logger.info).toHaveBeenCalledWith('Job already enqueued; nothing to recover', {
      jobId: 'persisted-job',
      queueName: 'emails',
    });

    vi.mocked(useDatabase).mockImplementation(() => {
      throw new Error('db offline');
    });
    await execute({ jobId: 'persisted-job' });
    expect(Logger.warn).toHaveBeenCalledWith(
      'Failed to load job from persistence',
      expect.objectContaining({ error: expect.any(Error) })
    );
  });

  it('sets exit codes for missing jobs, non-recoverable statuses, and missing payloads', async () => {
    await execute({ jobId: 'missing' });
    expect(Logger.error).toHaveBeenCalledWith(
      expect.stringContaining('or persistence store')
    );
    expect(process.exitCode).toBe(1);

    process.exitCode = 0;
    mocks.tracker.get.mockReturnValue(trackedRecord({ status: 'completed' }));
    await execute({ jobId: 'done', queue: 'emails', status: undefined });
    expect(Logger.error).toHaveBeenCalledWith(
      expect.stringContaining('not recoverable via policy runner')
    );

    process.exitCode = 0;
    mocks.tracker.get.mockReturnValue(trackedRecord({ payload: 'no-object' }));
    await execute({ jobId: 'nopayload', queue: 'emails', push: true });
    expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('payload is missing'));
    expect(process.exitCode).toBe(1);
  });

  it('pushes jobs with fallback attempts and tolerates duplicate-id errors', async () => {
    mocks.tracker.get.mockReturnValue(
      trackedRecord({
        jobId: 'dup',
        maxAttempts: undefined,
        attempts: undefined,
        payload: { a: 1 },
      })
    );

    vi.mocked(Queue.enqueue).mockRejectedValueOnce('JobId already exists' as never);
    await execute({ jobId: 'dup', queue: 'emails', push: true });

    expect(Queue.enqueue).toHaveBeenCalledWith(
      'emails',
      expect.objectContaining({ attempts: 3, _currentAttempts: 0, a: 1 }),
      'default'
    );
    expect(JobStateTracker.handedOffToQueue).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'dup', reason: 'CLI pushed job as dup' })
    );

    vi.mocked(Queue.enqueue).mockRejectedValueOnce(new Error('JobId already exists'));
    await execute({ jobId: 'dup', queue: 'emails', push: true });
    expect(process.exitCode).toBe(0);
  });

  it('runs once, starts the orchestrator, and exits for production one-off runs', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);

    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');
    await expect(execute({ once: true })).rejects.toThrow('process.exit');

    expect(JobRecoveryDaemon.runOnce).toHaveBeenCalledTimes(1);
    expect(registerQueuesFromRuntimeConfig).toHaveBeenCalledWith(
      expect.objectContaining({ default: mocks.queueDefault })
    );
    expect(exitSpy).toHaveBeenCalledWith(0);

    await execute({ start: true });
    expect(QueueReliabilityOrchestrator.start).toHaveBeenCalledTimes(1);
    exitSpy.mockRestore();
  });
});
