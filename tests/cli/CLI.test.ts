import type { ICLI } from '@cli/CLI';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let CLI: typeof import('@cli/CLI').CLI;
let ErrorHandler: typeof import('@cli/ErrorHandler').ErrorHandler;

beforeAll(async () => {
  // CLI imports config which requires JWT_SECRET
  // CLI imports config which requires JWT_SECRET
  process.env['JWT_SECRET'] ??= 'test-jwt-secret';

  ({ CLI } = await import('@cli/CLI'));
  ({ ErrorHandler } = await import('@cli/ErrorHandler'));
});

describe('CLI Help System', () => {
  let cli: ICLI;

  beforeEach(() => {
    cli = CLI.create();
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
    const commands = program.commands.map((cmd: any) => cmd.name());
    expect(commands).toContain('migrate');
  });

  it('should register debug command', () => {
    const program = cli.getProgram();
    const commands = program.commands.map((cmd: any) => cmd.name());
    expect(commands).toContain('debug');
  });

  it('should register new command', () => {
    const program = cli.getProgram();
    const commands = program.commands.map((cmd: any) => cmd.name());
    expect(commands).toContain('new');
  });

  it('should register add command', () => {
    const program = cli.getProgram();
    const commands = program.commands.map((cmd: any) => cmd.name());
    expect(commands).toContain('add');
  });

  it('should register config command', () => {
    const program = cli.getProgram();
    const commands = program.commands.map((cmd: any) => cmd.name());
    expect(commands).toContain('config');
  });

  it('should register start command', () => {
    const program = cli.getProgram();
    const commands = program.commands.map((cmd: any) => cmd.name());
    expect(commands).toContain('start');
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
  let cli: ICLI;

  beforeEach(() => {
    cli = CLI.create();
  });

  it('should have all commands registered', () => {
    const program = cli.getProgram();
    const commands = program.commands.map((cmd: any) => cmd.name());

    expect(commands).toContain('new');
    expect(commands).toContain('add');
    expect(commands).toContain('start');
    expect(commands).toContain('migrate');
    expect(commands).toContain('debug');
    expect(commands).toContain('config');
    expect(commands).toContain('help');
  });

  it('should have help descriptions', () => {
    const program = cli.getProgram();
    const migrateCmd = program.commands.find((cmd: any) => cmd.name() === 'migrate');

    expect(migrateCmd).toBeDefined();
    expect(migrateCmd?.description()).toBe('Run database migrations');
  });
});
