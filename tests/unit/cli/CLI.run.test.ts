import { CLI } from '@/cli/CLI';
import { ErrorHandler } from '@/cli/ErrorHandler';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import * as fs from '@node-singletons/fs';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@node-singletons/fs', () => ({
  readFileSync: vi.fn(),
}));

vi.mock('@cli/ErrorHandler', () => ({
  ErrorHandler: {
    banner: vi.fn(),
    handle: vi.fn(),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@exceptions/ZintrustError', () => ({
  ErrorFactory: {
    createCliError: vi.fn((msg, _err) => new Error(msg)),
  },
}));

describe('CLI.run', () => {
  let program: Command;
  let cli: any;

  beforeEach(() => {
    vi.clearAllMocks();
    cli = CLI.create();
    program = cli.getProgram();
    // Mock program methods that exit or show help
    vi.spyOn(program, 'help').mockImplementation(() => {
      throw new Error('help called');
    });
    vi.spyOn(program, 'parseAsync').mockResolvedValue(program);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should show banner and version when -v is provided', async () => {
    await cli.run(['-v']);
    expect(ErrorHandler.banner).toHaveBeenCalled();
    expect(program.parseAsync).not.toHaveBeenCalled();
  });

  it('should show banner and version when --version is provided', async () => {
    await cli.run(['--version']);
    expect(ErrorHandler.banner).toHaveBeenCalled();
    expect(program.parseAsync).not.toHaveBeenCalled();
  });

  it('should show help when no arguments provided', async () => {
    await expect(cli.run([])).rejects.toThrow('Unhandled CLI execution error');
    expect(ErrorHandler.banner).toHaveBeenCalled();
    expect(program.help).toHaveBeenCalled();
  });

  it('should process -sim alias', async () => {
    await cli.run(['-sim', 'my-app']);
    expect(program.parseAsync).toHaveBeenCalledWith(['node', 'zintrust', 'simulate', 'my-app']);
  });

  it('should process --sim alias', async () => {
    await cli.run(['--sim', 'my-app']);
    expect(program.parseAsync).toHaveBeenCalledWith(['node', 'zintrust', 'simulate', 'my-app']);
  });

  it('should run normal command', async () => {
    await cli.run(['new', 'my-app']);
    expect(program.parseAsync).toHaveBeenCalledWith(['node', 'zintrust', 'new', 'my-app']);
  });

  it('should handle commander error with exitCode 0', async () => {
    const commanderError = new Error('commander error');
    (commanderError as any).code = 'commander.helpDisplayed';
    (commanderError as any).exitCode = 0;
    vi.spyOn(program, 'parseAsync').mockRejectedValue(commanderError);

    await cli.run(['help']);
    // Should not throw and not call ErrorHandler.handle
    expect(ErrorHandler.handle).not.toHaveBeenCalled();
  });

  it('should return false for commander error with non-numeric exitCode', async () => {
    const commanderError = new Error('commander error');
    (commanderError as any).code = 'commander.unknownCommand';
    (commanderError as any).exitCode = 'not a number';

    vi.spyOn(program, 'parseAsync').mockRejectedValue(commanderError);
    await expect(cli.run(['unknown'])).rejects.toThrow();
  });

  it('should return false for non-error object in isIgnorableCommanderError', async () => {
    // This is hard to trigger directly but we can try passing a non-error to runCLI
    vi.spyOn(program, 'parseAsync').mockRejectedValue({ code: 'commander.help', exitCode: 0 });
    await expect(cli.run(['help'])).rejects.toThrow();
  });

  it('should return false for non-commander error with code', async () => {
    const error = new Error('other error');
    (error as any).code = 'other.code';

    vi.spyOn(program, 'parseAsync').mockRejectedValue(error);
    await expect(cli.run(['unknown'])).rejects.toThrow();
  });

  it('should return early in handleExecutionError if isIgnorableCommanderError is true', async () => {
    const error = new Error('some error');
    (error as any).code = 'commander.help';
    (error as any).exitCode = 0;

    vi.spyOn(program, 'parseAsync').mockRejectedValue(error);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });

    await cli.run(['test']);

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should handle commander error with non-zero exitCode in handleExecutionError', async () => {
    const error = new Error('some error');
    (error as any).code = 'commander.unknownCommand';
    (error as any).exitCode = 1;

    vi.spyOn(program, 'parseAsync').mockRejectedValue(error);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });

    await expect(cli.run(['test'])).rejects.toThrow('exit');

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should return 1 as default exit code', async () => {
    const error = new Error('generic error');
    // No exitCode property
    vi.spyOn(program, 'parseAsync').mockRejectedValue(error);

    await expect(cli.run(['new', 'app'])).rejects.toThrow();
  });

  it('should return early in handleExecutionError if error equals version', async () => {
    // This is a bit tricky to trigger via runCLI, but we can try to mock handleExecutionError if it was exported.
    // Since it's not, we'll try to pass the version string as the error.
    const version = '1.0.0';
    vi.spyOn(program, 'parseAsync').mockRejectedValue(version);

    await cli.run(['new', 'app']);
    expect(ErrorHandler.handle).not.toHaveBeenCalled();
  });

  it('should handle generic errors during run', async () => {
    const error = new Error('generic error');
    vi.spyOn(program, 'parseAsync').mockRejectedValue(error);

    await expect(cli.run(['new', 'app'])).rejects.toThrow('Unhandled CLI execution error');
    expect(ErrorHandler.handle).toHaveBeenCalledWith(error, undefined, false);
  });

  it('should handle help command with valid subcommand', async () => {
    const helpCmd = program.commands.find((c) => c.name() === 'help');
    expect(helpCmd).toBeDefined();

    const migrateCmd = program.commands.find((c) => c.name() === 'migrate');
    const helpSpy = vi
      .spyOn(migrateCmd!, 'help')
      .mockImplementation((_cb?: (str: string) => string): never => {
        throw new Error('help');
      });

    // @ts-ignore - accessing private action handler
    try {
      await (helpCmd as any)!._actionHandler(['migrate']);
    } catch {
      // commander help() is typed to never-return
    }
    expect(helpSpy).toHaveBeenCalled();
  });

  it('should handle help command with unknown subcommand', async () => {
    const helpCmd = program.commands.find((c) => c.name() === 'help');
    const helpSpy = vi
      .spyOn(program, 'help')
      .mockImplementation((_cb?: (str: string) => string): never => {
        throw new Error('help');
      });

    // @ts-ignore
    try {
      await (helpCmd as any)!._actionHandler(['unknown']);
    } catch {
      // commander help() is typed to never-return
    }
    expect(Logger.error).toHaveBeenCalledWith('Unknown command: unknown');
    expect(helpSpy).toHaveBeenCalled();
  });

  it('should handle help command with no subcommand', async () => {
    const helpCmd = program.commands.find((c) => c.name() === 'help');
    const helpSpy = vi
      .spyOn(program, 'help')
      .mockImplementation((_cb?: (str: string) => string): never => {
        throw new Error('help');
      });

    // @ts-ignore
    try {
      await (helpCmd as any)!._actionHandler([]);
    } catch {
      // commander help() is typed to never-return
    }
    expect(helpSpy).toHaveBeenCalled();
  });
});

describe('CLI.loadVersion', () => {
  it('should load version from package.json', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '2.0.0' }));
    const cli = CLI.create();
    expect(cli.getProgram().version()).toBe('2.0.0');
  });

  it('should fallback to 1.0.0 if package.json is invalid', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('invalid json');
    const cli = CLI.create();
    expect(cli.getProgram().version()).toBe('1.0.0');
    expect(ErrorFactory.createCliError).toHaveBeenCalled();
  });

  it('should fallback to 1.0.0 if version is missing in package.json', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));
    const cli = CLI.create();
    expect(cli.getProgram().version()).toBe('1.0.0');
  });
});
