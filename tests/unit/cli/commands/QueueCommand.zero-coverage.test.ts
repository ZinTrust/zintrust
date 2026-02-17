import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  run: vi.fn(async () => ({ ok: true })),
  parseKind: vi.fn(() => 'broadcast'),
  logSummary: vi.fn(),
  requireQueueNameFromArgs: vi.fn(() => 'q'),
  parsePositiveInt: vi.fn(() => 1),
  parseNonNegativeInt: vi.fn(() => 0),
  normalizeDriverName: vi.fn(() => 'redis'),
  setupQueueLockCommands: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  qbCreate: vi.fn(),
  useEnsureDbConnected: vi.fn(),
  dbGetConnection: vi.fn(() => ({})),
}));

vi.mock('@cli/commands/QueueLockCommand', () => ({
  setupQueueLockCommands: (...args: any[]) => mocked.setupQueueLockCommands(...args),
}));

vi.mock('@cli/commands/QueueWorkCommandUtils', () => ({
  QueueWorkCommandUtils: {
    requireQueueNameFromArgs: (...args: any[]) => mocked.requireQueueNameFromArgs(...args),
    parsePositiveInt: (...args: any[]) => mocked.parsePositiveInt(...args),
    parseNonNegativeInt: (...args: any[]) => mocked.parseNonNegativeInt(...args),
    normalizeDriverName: (...args: any[]) => mocked.normalizeDriverName(...args),
    logSummary: (...args: any[]) => mocked.logSummary(...args),
  },
}));

vi.mock('@cli/workers/QueueWorkRunner', () => ({
  QueueWorkRunner: {
    run: (...args: any[]) => mocked.run(...args),
    parseKind: (...args: any[]) => mocked.parseKind(...args),
  },
}));

vi.mock('@config/logger', () => ({ Logger: mocked.logger }));

// Mocks for prune subcommand dynamic imports
vi.mock('@orm/QueryBuilder', () => ({
  QueryBuilder: {
    create: (...args: any[]) => mocked.qbCreate(...args),
  },
}));
vi.mock('@orm/Database', () => ({
  useEnsureDbConnected: (...args: any[]) => mocked.useEnsureDbConnected(...args),
}));
vi.mock('@config/database', () => ({
  databaseConfig: {
    getConnection: (...args: any[]) => mocked.dbGetConnection(...args),
  },
}));

describe('QueueCommand (zero branch coverage)', () => {
  it('runs default queue worker execution path', async () => {
    const { QueueCommand } = await import('@cli/commands/QueueCommand');
    const cmd = QueueCommand.create();
    await cmd.execute({ args: ['q'], timeout: '1', retry: '0', maxItems: '1', driver: 'redis' });

    expect(mocked.run).toHaveBeenCalledTimes(1);
    expect(mocked.logSummary).toHaveBeenCalledTimes(1);
  });

  it('runs work subcommand action path', async () => {
    const { QueueCommand } = await import('@cli/commands/QueueCommand');
    const program = QueueCommand.create().getCommand();
    program.exitOverride();
    await program.parseAsync(['node', 'test', 'work', 'broadcast', 'q']);

    expect(mocked.parseKind).toHaveBeenCalledWith('broadcast');
    expect(mocked.run).toHaveBeenCalled();
  });

  it('prune warns and does not exit when table is missing', async () => {
    mocked.useEnsureDbConnected.mockResolvedValueOnce({});
    mocked.qbCreate.mockReturnValueOnce({
      where: () => ({
        delete: async () => {
          throw new Error('no such table: queue_jobs_failed');
        },
      }),
    });

    const { QueueCommand } = await import('@cli/commands/QueueCommand');
    const program = QueueCommand.create().getCommand();
    program.exitOverride();

    await program.parseAsync(['node', 'test', 'prune', '--hours', '1']);

    expect(mocked.logger.warn).toHaveBeenCalledWith(
      '[Queue] Table queue_jobs_failed not found. Skipping prune.'
    );
  });
});
