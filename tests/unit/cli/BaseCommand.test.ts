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
    await commanderCmd.parseAsync([], { from: 'user' });

    expect(executeMock).toHaveBeenCalled();
    expect(ErrorHandler.handle).toHaveBeenCalledWith(error, undefined, false);
  });

  it('should handle non-error objects during execution', async () => {
    const error = 'String error';
    const executeMock = vi.fn().mockRejectedValue(error);

    const cmd = BaseCommand.create({
      name: 'test',
      description: 'Test command',
      execute: executeMock,
    });

    const commanderCmd = cmd.getCommand();
    await commanderCmd.parseAsync([], { from: 'user' });

    expect(executeMock).toHaveBeenCalled();
    expect(ErrorHandler.handle).toHaveBeenCalled();
  });

  it('should call ErrorHandler methods', () => {
    const cmd = BaseCommand.create({
      name: 'test',
      description: 'Test command',
      execute: vi.fn(),
    });

    cmd.info('info');
    cmd.success('success');
    cmd.warn('warn');
    cmd.debug('debug');

    expect(ErrorHandler.info).toHaveBeenCalledWith('info');
    expect(ErrorHandler.success).toHaveBeenCalledWith('success');
    expect(ErrorHandler.warn).toHaveBeenCalledWith('warn');
    expect(ErrorHandler.debug).toHaveBeenCalledWith('debug', true);
  });

  it('should call addOptions if provided', () => {
    const addOptionsMock = vi.fn();
    const cmd = BaseCommand.create({
      name: 'test',
      description: 'Test command',
      addOptions: addOptionsMock,
      execute: vi.fn(),
    });

    cmd.getCommand();
    expect(addOptionsMock).toHaveBeenCalled();
  });
});
