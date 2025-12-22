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

class TestCommand extends BaseCommand {
  constructor() {
    super();
    this.name = 'test';
    this.description = 'Test command';
  }

  public executeMock = vi.fn();

  async execute(options: CommandOptions): Promise<void> {
    await this.executeMock(options);
  }

  // Expose protected methods for testing
  public callDebug(msg: string) {
    this.debug(msg);
  }
  public callInfo(msg: string) {
    this.info(msg);
  }
  public callSuccess(msg: string) {
    this.success(msg);
  }
  public callWarn(msg: string) {
    this.warn(msg);
  }
}

describe('BaseCommand', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should configure command correctly', () => {
    const cmd = new TestCommand();
    const commanderCmd = cmd.getCommand();

    expect(commanderCmd.name()).toBe('test');
    expect(commanderCmd.description()).toBe('Test command');
    expect(commanderCmd.options.some((o) => o.flags.includes('--verbose'))).toBe(true);
  });

  it('should execute command action', async () => {
    const cmd = new TestCommand();
    const commanderCmd = cmd.getCommand();

    // Simulate action call
    // Commander action receives: arg1, arg2, ..., options, command
    // const options = { verbose: true };
    // const commandObj = {};

    // We need to trigger the action handler.
    // Since we can't easily trigger commander's parse, we can manually call the action handler if we could access it.
    // But getCommand returns the command object. We can parse arguments.

    await commanderCmd.parseAsync(['node', 'test', '--verbose']);

    expect(cmd.executeMock).toHaveBeenCalled();
    const calledOptions = cmd.executeMock.mock.calls[0][0];
    expect(calledOptions.verbose).toBe(true);
  });

  it('should handle execution errors', async () => {
    const cmd = new TestCommand();
    const error = new Error('Execution failed');
    cmd.executeMock.mockRejectedValue(error);

    const commanderCmd = cmd.getCommand();

    // Prevent process.exit from killing the test runner
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await commanderCmd.parseAsync(['node', 'test']);

    expect(ErrorHandler.handle).toHaveBeenCalledWith(error);

    exitSpy.mockRestore();
  });

  it('should delegate logging to ErrorHandler', () => {
    const cmd = new TestCommand();

    cmd.callInfo('info');
    expect(ErrorHandler.info).toHaveBeenCalledWith('info');

    cmd.callSuccess('success');
    expect(ErrorHandler.success).toHaveBeenCalledWith('success');

    cmd.callWarn('warn');
    expect(ErrorHandler.warn).toHaveBeenCalledWith('warn');

    // Debug requires verbose flag, but BaseCommand.debug calls ErrorHandler.debug passing this.verbose
    cmd.callDebug('debug');
    expect(ErrorHandler.debug).toHaveBeenCalledWith('debug', false); // Default verbose is false
  });
});
