import { QueueRecoveryCommand } from '@cli/commands/QueueRecoveryCommand';
import { Logger } from '@config/logger';
import { registerDatabasesFromRuntimeConfig } from '@orm/DatabaseRuntimeRegistration';
import { JobRecoveryDaemon } from '@queue/JobRecoveryDaemon';
import { JobStateTracker } from '@queue/JobStateTracker';
import { Queue } from '@queue/Queue';
import { QueueReliabilityOrchestrator } from '@queue/QueueReliabilityOrchestrator';
import { registerQueuesFromRuntimeConfig } from '@queue/QueueRuntimeRegistration';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/ErrorHandler', () => ({
  ErrorHandler: {
    handle: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@queue/QueueRuntimeRegistration', () => ({
  registerQueuesFromRuntimeConfig: vi.fn(async () => {}),
}));

vi.mock('@config/database', () => ({
  databaseConfig: {},
}));

vi.mock('@orm/Database', () => ({
  resetDatabase: vi.fn(async () => undefined),
  useDatabase: vi.fn(),
}));

vi.mock('@orm/DatabaseRuntimeRegistration', () => ({
  registerDatabasesFromRuntimeConfig: vi.fn(),
}));

vi.mock('@queue/JobRecoveryDaemon', () => ({
  JobRecoveryDaemon: {
    runOnce: vi.fn(async () => ({ scanned: 0, requeued: 0, deadLetter: 0, manualReview: 0 })),
    recoverOne: vi.fn(async () => 'requeued'),
  },
}));

vi.mock('@queue/QueueReliabilityOrchestrator', () => ({
  QueueReliabilityOrchestrator: {
    start: vi.fn(),
    stop: vi.fn(),
  },
}));

vi.mock('@queue/Queue', () => ({
  Queue: {
    enqueue: vi.fn(async () => 'replay-job-id'),
  },
}));

const mockTracker = vi.hoisted(() => ({
  get: vi.fn(),
  list: vi.fn((): Array<Record<string, unknown>> => []),
  markedRecovered: vi.fn(async () => {}),
  handedOffToQueue: vi.fn(async () => {}),
}));

vi.mock('@queue/JobStateTracker', () => ({
  JobStateTracker: mockTracker,
}));

describe('QueueRecoveryCommand', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    mockTracker.get.mockReturnValue(undefined);
    mockTracker.list.mockReturnValue([]);
  });

  afterAll(() => {
    logSpy.mockRestore();
  });

  it('runs recovery once by default', async () => {
    const cmd = QueueRecoveryCommand.create().getCommand();
    cmd.exitOverride();

    await cmd.parseAsync(['node', 'test']);

    expect(registerDatabasesFromRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(registerQueuesFromRuntimeConfig).toHaveBeenCalled();
    expect(JobRecoveryDaemon.runOnce).toHaveBeenCalledTimes(1);
  });

  it('does not register queue runtime for list mode', async () => {
    const cmd = QueueRecoveryCommand.create().getCommand();
    cmd.exitOverride();

    await cmd.parseAsync(['node', 'test', '--list']);

    expect(registerDatabasesFromRuntimeConfig).not.toHaveBeenCalled();
    expect(registerQueuesFromRuntimeConfig).not.toHaveBeenCalled();
  });

  it('starts orchestrator when --start is passed', async () => {
    const cmd = QueueRecoveryCommand.create().getCommand();
    cmd.exitOverride();

    await cmd.parseAsync(['node', 'test', '--start']);

    expect(QueueReliabilityOrchestrator.start).toHaveBeenCalledTimes(1);
    expect(Logger.info).toHaveBeenCalledWith('Queue reliability orchestrator is running');
  });

  it('lists jobs from memory when --list is passed', async () => {
    const cmd = QueueRecoveryCommand.create().getCommand();
    cmd.exitOverride();

    mockTracker.list.mockReturnValue([
      {
        queueName: 'emails',
        jobId: 'job-list-1',
        status: 'pending_recovery',
        attempts: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    await cmd.parseAsync([
      'node',
      'test',
      '--list',
      '--queue',
      'emails',
      '--status',
      'pending_recovery',
      '--limit',
      '10',
    ]);

    expect(mockTracker.list).toHaveBeenCalledWith({
      queueName: 'emails',
      status: 'pending_recovery',
      limit: 10,
    });
    expect(mockTracker.list).toHaveBeenCalledTimes(1);
  });

  it('lists jobs as JSON when --list --json is passed', async () => {
    const cmd = QueueRecoveryCommand.create().getCommand();
    cmd.exitOverride();

    mockTracker.list.mockReturnValue([
      {
        queueName: 'emails',
        jobId: 'job-json-1',
        status: 'timeout',
        attempts: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    await cmd.parseAsync(['node', 'test', '--list', '--json']);

    const printedConsole = logSpy.mock.calls.at(-1)?.[0];
    const printedLogger = (Logger.info as unknown as { mock?: { calls: unknown[][] } }).mock?.calls
      .flat()
      .join(' ');

    if (typeof printedConsole === 'string') {
      expect(printedConsole).toContain('job-json-1');
    } else {
      expect(String(printedLogger ?? '')).toContain('job-json-1');
    }
  });

  it('pushes a specific job when --job-id and --push are passed', async () => {
    const cmd = QueueRecoveryCommand.create().getCommand();
    cmd.exitOverride();

    mockTracker.get.mockReturnValue({
      queueName: 'emails',
      jobId: 'job-123',
      status: 'pending_recovery',
      attempts: 0,
      payload: { to: 'user@example.com' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await cmd.parseAsync(['node', 'test', '--job-id', 'job-123', '--queue', 'emails', '--push']);

    expect(Queue.enqueue).toHaveBeenCalledWith(
      'emails',
      expect.objectContaining({
        to: 'user@example.com',
        uniqueId: 'job-123',
        attempts: 3,
        _currentAttempts: 0,
      }),
      'default'
    );
    expect(JobStateTracker.handedOffToQueue).toHaveBeenCalledTimes(1);
  });

  it('uses policy recovery for a specific job when --push is not passed', async () => {
    const cmd = QueueRecoveryCommand.create().getCommand();
    cmd.exitOverride();

    mockTracker.get.mockReturnValue({
      queueName: 'emails',
      jobId: 'job-456',
      status: 'pending_recovery',
      attempts: 1,
      payload: { id: 1 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await cmd.parseAsync(['node', 'test', '--job-id', 'job-456', '--queue', 'emails']);

    expect(JobRecoveryDaemon.recoverOne).toHaveBeenCalledTimes(1);
  });

  it('logs a friendly error when a job is not found', async () => {
    const cmd = QueueRecoveryCommand.create().getCommand();
    cmd.exitOverride();

    const startingExitCode = process.exitCode;
    process.exitCode = 0;

    await cmd.parseAsync(['node', 'test', '--job-id', 'missing-job', '--push']);

    expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('Job not found in tracker'));
    expect(process.exitCode).toBe(1);
    process.exitCode = startingExitCode;
  });

  it('logs a friendly error when status is not recoverable without --push', async () => {
    const cmd = QueueRecoveryCommand.create().getCommand();
    cmd.exitOverride();

    mockTracker.get.mockReturnValue({
      queueName: 'emails',
      jobId: 'job-pending',
      status: 'pending',
      attempts: 0,
      payload: { id: 1 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const startingExitCode = process.exitCode;
    process.exitCode = 0;

    await cmd.parseAsync(['node', 'test', '--job-id', 'job-pending', '--queue', 'emails']);

    expect(Logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Job status is not recoverable via policy runner')
    );
    expect(process.exitCode).toBe(1);
    process.exitCode = startingExitCode;
  });

  it('lists jobs from server when --source server is used (filters invalid rows)', async () => {
    const cmd = QueueRecoveryCommand.create().getCommand();
    cmd.exitOverride();

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        records: [
          { queueName: 'q', jobId: 'a', status: 'pending_recovery', attempts: 1 },
          { queueName: 'q', jobId: '', status: 'pending_recovery' },
          null,
        ],
      }),
    } as any);

    await cmd.parseAsync([
      'node',
      'test',
      '--list',
      '--source',
      'server',
      '--limit',
      '2',
      '--json',
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('"jobId": "a"'));

    fetchSpy.mockRestore();
  });

  it('routes server list HTTP errors through ErrorHandler', async () => {
    const { ErrorHandler } = await import('@cli/ErrorHandler');

    const cmd = QueueRecoveryCommand.create().getCommand();
    cmd.exitOverride();

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: false, status: 503, json: async () => ({}) } as any);

    await cmd.parseAsync(['node', 'test', '--list', '--source', 'server', '--limit', '1']);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(ErrorHandler.handle).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });

  it('lists jobs from persistence when --source db is used', async () => {
    const { useDatabase } = await import('@orm/Database');

    const chain: any = {
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      where: vi.fn(() => chain),
      get: vi.fn(async () => [
        {
          queue_name: 'q',
          job_id: 'p1',
          status: 'pending_recovery',
          attempts: 1,
          max_attempts: 3,
          payload_json: '{"x":1}',
          result_json: '',
          created_at: undefined,
          updated_at: undefined,
        },
      ]),
    };

    (useDatabase as any).mockReturnValue({ table: vi.fn(() => chain) });

    const cmd = QueueRecoveryCommand.create().getCommand();
    cmd.exitOverride();

    await cmd.parseAsync(['node', 'test', '--list', '--source', 'db', '--limit', '1', '--json']);

    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('"jobId": "p1"'));
  });

  it('does not attempt db lookup when --no-db-lookup is passed (message excludes persistence)', async () => {
    const cmd = QueueRecoveryCommand.create().getCommand();
    cmd.exitOverride();

    const startingExitCode = process.exitCode;
    process.exitCode = 0;

    await cmd.parseAsync(['node', 'test', '--job-id', 'missing-job', '--no-db-lookup']);

    expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('Job not found in tracker:'));
    expect(Logger.error).not.toHaveBeenCalledWith(
      expect.stringContaining('tracker or persistence store')
    );
    expect(process.exitCode).toBe(1);

    process.exitCode = startingExitCode;
  });

  it('supports dry-run push and dry-run policy recovery paths', async () => {
    const cmd = QueueRecoveryCommand.create().getCommand();
    cmd.exitOverride();

    mockTracker.get.mockReturnValue({
      queueName: 'emails',
      jobId: 'job-dry',
      status: 'pending_recovery',
      attempts: 2,
      payload: { id: 1 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await cmd.parseAsync([
      'node',
      'test',
      '--job-id',
      'job-dry',
      '--queue',
      'emails',
      '--push',
      '--dry-run',
    ]);
    expect(Queue.enqueue).not.toHaveBeenCalled();
    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Dry-run: skipping enqueue for target job'),
      expect.anything()
    );

    await cmd.parseAsync(['node', 'test', '--job-id', 'job-dry', '--queue', 'emails', '--dry-run']);
    expect(JobRecoveryDaemon.recoverOne).not.toHaveBeenCalled();
    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Dry-run: skipping policy recovery for target job'),
      expect.anything()
    );
  });

  it('rejects pushing when payload is missing', async () => {
    const cmd = QueueRecoveryCommand.create().getCommand();
    cmd.exitOverride();

    mockTracker.get.mockReturnValue({
      queueName: 'emails',
      jobId: 'job-nopayload',
      status: 'pending_recovery',
      attempts: 0,
      payload: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const startingExitCode = process.exitCode;
    process.exitCode = 0;

    await cmd.parseAsync([
      'node',
      'test',
      '--job-id',
      'job-nopayload',
      '--queue',
      'emails',
      '--push',
    ]);

    expect(Queue.enqueue).not.toHaveBeenCalled();
    expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('payload is missing'));
    expect(process.exitCode).toBe(1);

    process.exitCode = startingExitCode;
  });

  it('handles duplicate job id enqueue errors by treating replay id as original', async () => {
    const cmd = QueueRecoveryCommand.create().getCommand();
    cmd.exitOverride();

    mockTracker.get.mockReturnValue({
      queueName: 'emails',
      jobId: 'job-dupe',
      status: 'pending_recovery',
      attempts: 0,
      payload: { ok: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    (Queue.enqueue as any).mockRejectedValueOnce(new Error('JobId already exists'));

    await cmd.parseAsync(['node', 'test', '--job-id', 'job-dupe', '--queue', 'emails', '--push']);

    expect(JobStateTracker.handedOffToQueue).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-dupe', queueName: 'emails' })
    );
    expect(Logger.info).toHaveBeenCalledWith(
      'Target job pushed to queue',
      expect.objectContaining({ replayJobId: 'job-dupe' })
    );
  });

  it('skips targeted recovery when job is already enqueued', async () => {
    const cmd = QueueRecoveryCommand.create().getCommand();
    cmd.exitOverride();

    mockTracker.get.mockReturnValue({
      queueName: 'emails',
      jobId: 'job-enqueued',
      status: 'enqueued',
      attempts: 0,
      payload: { id: 1 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await cmd.parseAsync(['node', 'test', '--job-id', 'job-enqueued', '--queue', 'emails']);

    expect(Logger.info).toHaveBeenCalledWith(
      'Job already enqueued; nothing to recover',
      expect.objectContaining({ jobId: 'job-enqueued' })
    );
    expect(JobRecoveryDaemon.recoverOne).not.toHaveBeenCalled();
  });
});
