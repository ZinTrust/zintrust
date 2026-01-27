import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@queue/AdvancedQueue', () => ({
  createAdvancedQueue: vi.fn(),
}));

vi.mock('@queue/LockProvider', () => ({
  getLockProvider: vi.fn(),
}));

vi.mock('@exceptions/ZintrustError', () => ({
  ErrorFactory: {
    createCliError: (message: string) => new Error(message),
  },
}));

type MockActions = Record<string, (...args: any[]) => Promise<void> | void>;

class MockSubcommand {
  constructor(
    private name: string,
    private actions: MockActions
  ) {}

  description = vi.fn(() => this);

  option = vi.fn(() => this);

  action = vi.fn((fn: (...args: any[]) => any) => {
    const baseName = this.name.split(' ')[0] ?? this.name;
    this.actions[baseName] = fn;
    return this;
  });
}

class MockCommand {
  public actions: MockActions = {};

  command = vi.fn((name: string) => {
    return new MockSubcommand(name, this.actions);
  });
}

describe('QueueLockCommand patch coverage', () => {
  it('logs when no locks are found', async () => {
    const { getLockProvider } = await import('@queue/LockProvider');
    const { Logger } = await import('@config/logger');
    const { setupQueueLockCommands } = await import('@cli/commands/QueueLockCommand');

    const provider = {
      list: vi.fn().mockResolvedValue([]),
      status: vi.fn(),
      release: vi.fn(),
      extend: vi.fn(),
    };
    vi.mocked(getLockProvider).mockReturnValue(provider as any);

    const command = new MockCommand();
    setupQueueLockCommands(command as any);

    await command.actions['lock:list']({ pattern: '*', provider: 'redis' });

    expect(Logger.info).toHaveBeenCalledWith('No locks found.');
  });

  it('logs errors when listing locks fails', async () => {
    const { getLockProvider } = await import('@queue/LockProvider');
    const { Logger } = await import('@config/logger');
    const { setupQueueLockCommands } = await import('@cli/commands/QueueLockCommand');

    const provider = {
      list: vi.fn().mockRejectedValue(new Error('list boom')),
      status: vi.fn(),
      release: vi.fn(),
      extend: vi.fn(),
    };
    vi.mocked(getLockProvider).mockReturnValue(provider as any);

    const command = new MockCommand();
    setupQueueLockCommands(command as any);

    await command.actions['lock:list']({ pattern: '*', provider: 'redis' });

    expect(Logger.error).toHaveBeenCalledWith('Failed to list locks', expect.any(Error));
  });

  it('logs error when provider cannot be resolved', async () => {
    const { getLockProvider } = await import('@queue/LockProvider');
    const { Logger } = await import('@config/logger');
    const { setupQueueLockCommands } = await import('@cli/commands/QueueLockCommand');

    vi.mocked(getLockProvider).mockReturnValue(undefined);

    const command = new MockCommand();
    setupQueueLockCommands(command as any);

    await command.actions['lock:list']({ pattern: '*', provider: 'redis' });

    expect(Logger.error).toHaveBeenCalledWith('Failed to list locks', expect.any(Error));
  });

  it('logs when releasing a missing lock', async () => {
    const { getLockProvider } = await import('@queue/LockProvider');
    const { Logger } = await import('@config/logger');
    const { setupQueueLockCommands } = await import('@cli/commands/QueueLockCommand');

    const provider = {
      list: vi.fn(),
      status: vi.fn().mockResolvedValue({ exists: false }),
      release: vi.fn(),
      extend: vi.fn(),
    };
    vi.mocked(getLockProvider).mockReturnValue(provider as any);

    const command = new MockCommand();
    setupQueueLockCommands(command as any);

    await command.actions['lock:release']('missing', { provider: 'redis' });

    expect(Logger.info).toHaveBeenCalledWith("Lock 'missing' does not exist.");
  });

  it('logs errors when releasing a lock fails', async () => {
    const { getLockProvider } = await import('@queue/LockProvider');
    const { Logger } = await import('@config/logger');
    const { setupQueueLockCommands } = await import('@cli/commands/QueueLockCommand');

    const provider = {
      list: vi.fn(),
      status: vi.fn().mockResolvedValue({ exists: true }),
      release: vi.fn().mockRejectedValue(new Error('release boom')),
      extend: vi.fn(),
    };
    vi.mocked(getLockProvider).mockReturnValue(provider as any);

    const command = new MockCommand();
    setupQueueLockCommands(command as any);

    await command.actions['lock:release']('job-1', { provider: 'redis' });

    expect(Logger.error).toHaveBeenCalledWith('Failed to release lock job-1', expect.any(Error));
  });

  it('logs when extension fails', async () => {
    const { getLockProvider } = await import('@queue/LockProvider');
    const { Logger } = await import('@config/logger');
    const { setupQueueLockCommands } = await import('@cli/commands/QueueLockCommand');

    const provider = {
      list: vi.fn(),
      status: vi.fn(),
      release: vi.fn(),
      extend: vi.fn().mockResolvedValue(false),
    };
    vi.mocked(getLockProvider).mockReturnValue(provider as any);

    const command = new MockCommand();
    setupQueueLockCommands(command as any);

    await command.actions['lock:extend']('job-2', '5', { provider: 'redis' });

    expect(Logger.info).toHaveBeenCalledWith("Failed to extend lock 'job-2' (may not exist).");
  });

  it('logs errors when extension throws', async () => {
    const { getLockProvider } = await import('@queue/LockProvider');
    const { Logger } = await import('@config/logger');
    const { setupQueueLockCommands } = await import('@cli/commands/QueueLockCommand');

    const provider = {
      list: vi.fn(),
      status: vi.fn(),
      release: vi.fn(),
      extend: vi.fn().mockRejectedValue(new Error('extend boom')),
    };
    vi.mocked(getLockProvider).mockReturnValue(provider as any);

    const command = new MockCommand();
    setupQueueLockCommands(command as any);

    await command.actions['lock:extend']('job-3', '5', { provider: 'redis' });

    expect(Logger.error).toHaveBeenCalledWith('Failed to extend lock job-3', expect.any(Error));
  });

  it('logs when a job ID is not locked', async () => {
    const { getLockProvider } = await import('@queue/LockProvider');
    const { Logger } = await import('@config/logger');
    const { setupQueueLockCommands } = await import('@cli/commands/QueueLockCommand');

    const provider = {
      list: vi.fn(),
      status: vi.fn().mockResolvedValue({ exists: false }),
      release: vi.fn(),
      extend: vi.fn(),
    };
    vi.mocked(getLockProvider).mockReturnValue(provider as any);

    const command = new MockCommand();
    setupQueueLockCommands(command as any);

    await command.actions['dedupe:status']('job-4', { provider: 'redis' });

    expect(Logger.info).toHaveBeenCalledWith(
      "Job ID 'job-4' is NOT locked (Ready for processing or expired)."
    );
  });

  it('logs errors when dedupe status fails', async () => {
    const { getLockProvider } = await import('@queue/LockProvider');
    const { Logger } = await import('@config/logger');
    const { setupQueueLockCommands } = await import('@cli/commands/QueueLockCommand');

    const provider = {
      list: vi.fn(),
      status: vi.fn().mockRejectedValue(new Error('status boom')),
      release: vi.fn(),
      extend: vi.fn(),
    };
    vi.mocked(getLockProvider).mockReturnValue(provider as any);

    const command = new MockCommand();
    setupQueueLockCommands(command as any);

    await command.actions['dedupe:status']('job-5', { provider: 'redis' });

    expect(Logger.error).toHaveBeenCalledWith(
      'Failed to check status for job-5',
      expect.any(Error)
    );
  });
});
