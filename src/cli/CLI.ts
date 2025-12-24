/**
 * CLI - Main CLI Class
 * Orchestrates all CLI commands using Commander
 */

import { AddCommand } from '@cli/commands/AddCommand';
import { ConfigCommand } from '@cli/commands/ConfigCommand';
import { D1MigrateCommand } from '@cli/commands/D1MigrateCommand';
import { DebugCommand } from '@cli/commands/DebugCommand';
import { FixCommand } from '@cli/commands/FixCommand';
import { KeyGenerateCommand } from '@cli/commands/KeyGenerateCommand';
import { MigrateCommand } from '@cli/commands/MigrateCommand';
import { NewCommand } from '@cli/commands/NewCommand';
import { PluginCommand } from '@cli/commands/PluginCommand';
import { QACommand } from '@cli/commands/QACommand';
import { StartCommand } from '@cli/commands/StartCommand';
import { ErrorHandler } from '@cli/ErrorHandler';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { readFileSync } from '@node-singletons/fs';
import { dirname, join } from '@node-singletons/path';
import { fileURLToPath } from '@node-singletons/url';
import { Command } from 'commander';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ICLI {
  run(args: string[]): Promise<void>;
  getProgram(): Command;
}

/**
 * CLI - Main CLI Class
 * Orchestrates all CLI commands using Commander
 */
/**
 * Load version from package.json
 */
const loadVersion = (): string => {
  try {
    const packagePath = join(__dirname, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8')) as {
      version?: string;
    };
    return typeof packageJson.version === 'string' ? packageJson.version : '1.0.0';
  } catch (error) {
    ErrorFactory.createCliError('Failed to load version from package.json', error);
    // Use default version if package.json not found
    return '1.0.0';
  }
};

/**
 * Setup program metadata
 */
const setupProgram = (program: Command, version: string): void => {
  program
    .name('zintrust')
    .description('Zintrust Framework CLI - Build production-grade TypeScript APIs')
    .version(version, '-v, --version', 'Output version number')
    .helpOption('-h, --help', 'Display help for command')
    .usage('[command] [options]');

  // Global error handling
  program.exitOverride();
};

/**
 * Register all available commands
 */
const registerCommands = (program: Command): void => {
  const commands = [
    NewCommand.create(),
    AddCommand.create(),
    StartCommand.create(),
    MigrateCommand.create(),
    D1MigrateCommand.create(),
    DebugCommand.create(),
    ConfigCommand.create(),
    PluginCommand.create(),
    QACommand(),
    FixCommand.create(),
    KeyGenerateCommand.create(),
  ];

  for (const command of commands) {
    program.addCommand(command.getCommand());
  }

  // Help command
  program
    .command('help [command]')
    .description('Display help for a command')
    .action((commandName: string) => {
      if (commandName) {
        const cmd = program.commands.find((c) => c.name() === commandName);
        if (cmd) {
          cmd.help();
        } else {
          Logger.error(`Unknown command: ${commandName}`);
          program.help();
        }
      } else {
        program.help();
      }
    });
};

/**
 * Check if error is a commander error that can be safely ignored
 */
const isIgnorableCommanderError = (error: unknown): boolean => {
  if (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('commander.')
  ) {
    const commanderError = error as unknown as Error & { exitCode: number };
    return typeof commanderError.exitCode === 'number' && commanderError.exitCode === 0;
  }
  return false;
};

/**
 * Get exit code from error
 */
const getExitCode = (error: unknown): number => {
  if (
    error instanceof Error &&
    'exitCode' in error &&
    typeof (error as unknown as { exitCode: unknown }).exitCode === 'number'
  ) {
    return (error as unknown as { exitCode: number }).exitCode;
  }
  return 1;
};

/**
 * Handle CLI execution error
 */
const handleExecutionError = (error: unknown, version: string, log: boolean = true): void => {
  if (isIgnorableCommanderError(error)) {
    return;
  }

  if (error === version) {
    return;
  }

  if (error instanceof Error) {
    ErrorHandler.handle(error, undefined, log);
  }
  throw ErrorFactory.createCliError('Unhandled CLI execution error', error);
};

/**
 * Run CLI with arguments
 */
const runCLI = async (program: Command, version: string, args: string[]): Promise<void> => {
  try {
    // Always show banner
    ErrorHandler.banner(version);

    // If version is requested, we've already shown the banner which includes the version.
    if (args.includes('-v') || args.includes('--version')) {
      return;
    }

    // Show help if no arguments provided
    if (args.length === 0) {
      program.help();
      return;
    }

    await program.parseAsync(['node', 'zintrust', ...args]);
  } catch (error) {
    // Check for commander-specific errors that need special handling
    if (
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string' &&
      error.code.startsWith('commander.')
    ) {
      const exitCode = getExitCode(error);
      if (exitCode !== 0) {
        ErrorFactory.createCliError('CLI execution failed', error);
        process.exit(exitCode);
      }
      return;
    }

    // Handle all other errors with proper logging
    ErrorFactory.createCliError('CLI execution failed', error);
    handleExecutionError(error, version, false);
  }
};

/**
 * CLI - Main CLI Class
 * Orchestrates all CLI commands using Commander
 *
 * Notes:
 * - `CLI.create()` is the preferred API (used by current bin scripts/tests).
 * - `new CLI()` remains supported for backward compatibility with older bin scripts.
 */
export const CLI = Object.freeze({
  create(): ICLI {
    const program = new Command();
    const version = loadVersion();

    setupProgram(program, version);
    registerCommands(program);

    const run = async (args: string[]): Promise<void> => runCLI(program, version, args);
    const getProgram = (): Command => program;

    return Object.freeze({
      run,
      getProgram,
    });
  },
});
