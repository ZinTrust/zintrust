import { BroadcastWorkCommand } from '@cli/commands/BroadcastWorkCommand';
import { NotificationWorkCommand } from '@cli/commands/NotificationWorkCommand';
import { QueueCommand } from '@cli/commands/QueueCommand';
import { QueueWorkRunner } from '@cli/workers/QueueWorkRunner';
import { Logger } from '@config/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@cli/workers/QueueWorkRunner', () => {
  const api = {
    run: vi.fn(),
    parseKind: (value: unknown) => {
      const v = String(value ?? '')
        .trim()
        .toLowerCase();
      if (v === 'broadcast' || v === 'broad') return 'broadcast';
      if (v === 'notification' || v === 'notify') return 'notification';
      throw new Error('Invalid kind');
    },
  };

  return {
    QueueWorkRunner: api,
    default: api,
  };
});

describe('QueueCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(QueueWorkRunner.run).mockResolvedValue({
      processed: 0,
      retried: 0,
      dropped: 0,
      notDueRequeued: 0,
      unknown: 0,
    });
  });

  it('should have correct name', () => {
    const command = QueueCommand.create();
    expect(command.name).toBe('queue');
  });

  it('should call QueueWorkRunner for `queue <queueName>`', async () => {
    const cmd = QueueCommand.create().getCommand();
    cmd.exitOverride();

    await cmd.parseAsync([
      'node',
      'test',
      'broadcasts',
      '--timeout',
      '5',
      '--retry',
      '2',
      '--max-items',
      '10',
      '--driver',
      'sync',
    ]);

    expect(QueueWorkRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'broadcasts',
        timeoutSeconds: 5,
        retry: 2,
        maxItems: 10,
        driverName: 'sync',
      })
    );

    expect(Logger.info).toHaveBeenCalled();
  });

  it('should call QueueWorkRunner for `queue work broadcast <queueName>`', async () => {
    const cmd = QueueCommand.create().getCommand();
    cmd.exitOverride();

    await cmd.parseAsync(['node', 'test', 'work', 'broadcast', 'broadcasts']);

    expect(QueueWorkRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'broadcast',
        queueName: 'broadcasts',
      })
    );
  });

  it('should call QueueWorkRunner for `broadcast:work <queueName>`', async () => {
    const cmd = BroadcastWorkCommand.create().getCommand();
    cmd.exitOverride();

    await cmd.parseAsync(['node', 'test', 'broadcasts', '--timeout', '3']);

    expect(QueueWorkRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'broadcast',
        queueName: 'broadcasts',
        timeoutSeconds: 3,
      })
    );
  });

  it('should call QueueWorkRunner for `notification:work <queueName>`', async () => {
    const cmd = NotificationWorkCommand.create().getCommand();
    cmd.exitOverride();

    await cmd.parseAsync(['node', 'test', 'notifications', '--retry', '0']);

    expect(QueueWorkRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'notification',
        queueName: 'notifications',
        retry: 0,
      })
    );
  });

  it('should validate numeric options', async () => {
    const command = QueueCommand.create();

    await expect(command.execute({ args: ['q'], timeout: '0' } as any)).rejects.toThrow(
      /Invalid --timeout/i
    );

    await expect(command.execute({ args: ['q'], retry: '-1' } as any)).rejects.toThrow(
      /Invalid --retry/i
    );
  });
});
