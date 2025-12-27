import { LogsCleanupCommand } from '@cli/commands/LogsCleanupCommand';
import * as logger from '@config/logger';
import { describe, expect, it, vi } from 'vitest';

describe('LogsCleanupCommand', () => {
  it('runs cleanup and prints deleted count', async () => {
    const fakeDeleted = ['logs/old-1.log', 'logs/old-2.log'];
    vi.spyOn(logger, 'cleanLogsOnce').mockResolvedValue(fakeDeleted as any);

    type CommandLike = {
      info: (message: string, meta?: unknown) => void;
      execute: (args: Record<string, unknown>) => Promise<unknown>;
    };

    const cmd = LogsCleanupCommand.create() as unknown as CommandLike;
    const spyInfo = vi.spyOn(cmd, 'info');

    await cmd.execute({});

    expect(spyInfo).toHaveBeenCalledWith('Running log cleanup...');
    expect(spyInfo).toHaveBeenCalledWith('Deleted 2 log files');
  });
});
