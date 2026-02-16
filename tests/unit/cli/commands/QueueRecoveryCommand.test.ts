import { QueueRecoveryCommand } from '@cli/commands/QueueRecoveryCommand';
import { Logger } from '@config/logger';
import { registerDatabasesFromRuntimeConfig } from '@orm/DatabaseRuntimeRegistration';
import { JobRecoveryDaemon } from '@queue/JobRecoveryDaemon';
import { JobStateTracker } from '@queue/JobStateTracker';
import { Queue } from '@queue/Queue';
import { QueueReliabilityOrchestrator } from '@queue/QueueReliabilityOrchestrator';
import { registerQueuesFromRuntimeConfig } from '@queue/QueueRuntimeRegistration';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
});
