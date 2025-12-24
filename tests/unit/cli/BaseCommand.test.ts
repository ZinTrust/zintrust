import { BaseCommand, CommandOptions } from '@/cli/BaseCommand';
import { ErrorHandler } from '@/cli/ErrorHandler';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock ErrorHandler
vi.mock('@cli/ErrorHandler', () => ({
  ErrorHandler: {
    handle: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('BaseCommand', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should configure command correctly', () => {
    const executeMock = vi.fn();
    const cmd = BaseCommand.create({
      name: 'test',
      description: 'Test command',
      execute: executeMock,
    });

    expect(cmd.name).toBe('test');
    expect(cmd.description).toBe('Test command');
    expect(cmd.getCommand()).toBeDefined();
  });

  it('should execute command logic', async () => {
    const executeMock = vi.fn();
    const cmd = BaseCommand.create({
      name: 'test',
      description: 'Test command',
      execute: executeMock,
    });

    const options: CommandOptions = { verbose: true };
    await cmd.execute(options);

    expect(executeMock).toHaveBeenCalledWith(options);
  });

  it('should handle errors during execution', async () => {
    const error = new Error('Test error');
    const executeMock = vi.fn().mockRejectedValue(error);

    const cmd = BaseCommand.create({
      name: 'test',
      description: 'Test command',
      execute: executeMock,
    });

    const commanderCmd = cmd.getCommand();

    // Manually trigger the action handler by parsing args
    await commanderCmd.parseAsync(['--verbose'], { from: 'user' });

    expect(executeMock).toHaveBeenCalled();
    expect(ErrorHandler.handle).toHaveBeenCalledWith(error, undefined, false);
  });
});
