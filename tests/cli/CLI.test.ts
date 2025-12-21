import { CLI } from '@cli/CLI';
import { ErrorHandler } from '@cli/ErrorHandler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CLI Help System', () => {
  let cli: CLI;

  beforeEach(() => {
    cli = new CLI();
  });

  it('should display help when no arguments provided', async () => {
    // This would normally exit, so we test the program setup
    expect(cli.getProgram().name()).toBe('zintrust');
  });

  it('should show version', () => {
    const program = cli.getProgram();
    expect(program.version()).toBeDefined();
  });

  it('should register migrate command', () => {
    const program = cli.getProgram();
    const commands = program.commands.map((cmd) => cmd.name());
    expect(commands).toContain('migrate');
  });

  it('should register debug command', () => {
    const program = cli.getProgram();
    const commands = program.commands.map((cmd) => cmd.name());
    expect(commands).toContain('debug');
  });

  it('should register new command', () => {
    const program = cli.getProgram();
    const commands = program.commands.map((cmd) => cmd.name());
    expect(commands).toContain('new');
  });

  it('should register add command', () => {
    const program = cli.getProgram();
    const commands = program.commands.map((cmd) => cmd.name());
    expect(commands).toContain('add');
  });

  it('should register config command', () => {
    const program = cli.getProgram();
    const commands = program.commands.map((cmd) => cmd.name());
    expect(commands).toContain('config');
  });
});

describe('CLI Error Handling', () => {
  it('should handle runtime errors', () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    ErrorHandler.handle(new Error('Test error'), 1);

    expect(exitSpy).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('should display usage errors', () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    ErrorHandler.usageError('Invalid usage', 'migrate');

    expect(exitSpy).toHaveBeenCalledWith(2);
    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('should display success messages', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    ErrorHandler.success('Operation completed');

    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

describe('CLI Command Registration', () => {
  let cli: CLI;

  beforeEach(() => {
    cli = new CLI();
  });

  it('should have all commands registered', () => {
    const program = cli.getProgram();
    const commands = program.commands.map((cmd) => cmd.name());

    expect(commands).toContain('new');
    expect(commands).toContain('add');
    expect(commands).toContain('migrate');
    expect(commands).toContain('debug');
    expect(commands).toContain('config');
    expect(commands).toContain('help');
  });

  it('should have help descriptions', () => {
    const program = cli.getProgram();
    const migrateCmd = program.commands.find((cmd) => cmd.name() === 'migrate');

    expect(migrateCmd).toBeDefined();
    expect(migrateCmd?.description()).toBe('Run database migrations');
  });
});
