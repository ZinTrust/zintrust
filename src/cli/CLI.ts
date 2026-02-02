/**
 * CLI - Main CLI Class
 * Orchestrates all CLI commands using Commander
 */

import { AddCommand } from '@cli/commands/AddCommand';
import { BroadcastWorkCommand } from '@cli/commands/BroadcastWorkCommand';
import { ConfigCommand } from '@cli/commands/ConfigCommand';
import {
  AddMigrationCommand,
  CreateCommand,
  CreateMigrationCommand,
} from '@cli/commands/CreateCommand';
import { D1MigrateCommand } from '@cli/commands/D1MigrateCommand';
import { DbSeedCommand } from '@cli/commands/DbSeedCommand';
import { DebugCommand } from '@cli/commands/DebugCommand';
import { FixCommand } from '@cli/commands/FixCommand';
import { JwtDevCommand } from '@cli/commands/JwtDevCommand';
import { KeyGenerateCommand } from '@cli/commands/KeyGenerateCommand';
import { MakeMailTemplateCommand } from '@cli/commands/MakeMailTemplateCommand';
import { MakeNotificationTemplateCommand } from '@cli/commands/MakeNotificationTemplateCommand';
import { MigrateCommand } from '@cli/commands/MigrateCommand';
import { MigrateWorkerCommand } from '@cli/commands/MigrateWorkerCommand';
import { MySqlProxyCommand } from '@cli/commands/MySqlProxyCommand';
import { NewCommand } from '@cli/commands/NewCommand';
import { NotificationWorkCommand } from '@cli/commands/NotificationWorkCommand';
import { PluginCommand } from '@cli/commands/PluginCommand';
import { PrepareCommand } from '@cli/commands/PrepareCommand';
import { PublishCommand } from '@cli/commands/PublishCommand';
import { QACommand } from '@cli/commands/QACommand';
import { QueueCommand } from '@cli/commands/QueueCommand';
import { ResourceControlCommand } from '@cli/commands/ResourceControlCommand';
import { RoutesCommand } from '@cli/commands/RoutesCommand';
import { SecretsCommand } from '@cli/commands/SecretsCommand';
import { SimulateCommand } from '@cli/commands/SimulateCommand';
import { StartCommand } from '@cli/commands/StartCommand';
import { TemplatesCommand } from '@cli/commands/TemplatesCommand';
import { UpgradeCommand } from '@cli/commands/UpgradeCommand';
import { WorkerCommands } from '@cli/commands/WorkerCommands';
import { ErrorHandler } from '@cli/ErrorHandler';
import { VersionChecker } from '@cli/services/VersionChecker';
import { esmDirname } from '@common/index';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { readFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';
import { Command } from 'commander';

const __dirname = esmDirname(import.meta.url);

export interface ICLI {
  run(args: string[]): Promise<void>;
  getProgram(): Command;
}
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
    .description('ZinTrust Framework CLI - Build production-grade TypeScript APIs')
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
    UpgradeCommand.create(),
    PrepareCommand,
    AddCommand.create(),
    CreateCommand.create(),
    CreateMigrationCommand.create(),
    AddMigrationCommand.create(),
    StartCommand.create(),
    QueueCommand.create(),
    BroadcastWorkCommand.create(),
    NotificationWorkCommand.create(),
    ResourceControlCommand,
    MigrateWorkerCommand.create(),
    MigrateCommand.create(),
    DbSeedCommand.create(),
    D1MigrateCommand.create(),
    DebugCommand.create(),
    SecretsCommand.create(),
    ConfigCommand.create(),
    PluginCommand.create(),
    PublishCommand.create(),
    QACommand(),
    FixCommand.create(),
    KeyGenerateCommand.create(),
    SimulateCommand,
    TemplatesCommand,
    MakeMailTemplateCommand.create(),
    MakeNotificationTemplateCommand.create(),
    RoutesCommand.create(),
    JwtDevCommand,
    MySqlProxyCommand.create(),
    // Worker management commands
    WorkerCommands.createWorkerListCommand(),
    WorkerCommands.createWorkerStatusCommand(),
    WorkerCommands.createWorkerStartCommand(),
    WorkerCommands.createWorkerStopCommand(),
    WorkerCommands.createWorkerRestartCommand(),
    WorkerCommands.createWorkerSummaryCommand(),
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

  const exitCode = getExitCode(error);

  if (error instanceof Error) {
    ErrorHandler.handle(error, undefined, log);
  }

  // Check for commander-specific errors that need special handling
  if (
    error instanceof Error &&
    'code' in error &&
    typeof (error as Error & { code: unknown }).code === 'string' &&
    (error as Error & { code: string }).code.startsWith('commander.')
  ) {
    ErrorFactory.createCliError('CLI execution failed', error);
    process.exit(exitCode);
    return;
  }

  throw ErrorFactory.createCliError('Unhandled CLI execution error', error);
};

/**
 * Run CLI with arguments
 */
const runCLI = async (program: Command, version: string, args: string[]): Promise<void> => {
  try {
    // If version is requested, let Commander print it (no banner, fast/clean output).
    if (args.includes('-v') || args.includes('--version')) {
      await program.parseAsync(['node', 'zintrust', ...args]);
      return;
    }

    // Always show banner for normal commands
    ErrorHandler.banner(version);

    // Run version check in background (non-blocking)
    VersionChecker.runVersionCheck().catch((error: unknown) => {
      // Version check should never crash the CLI
      Logger.debug('Version check encountered an error', error);
    });

    // Show help if no arguments provided
    if (args.length === 0) {
      program.help();
      return;
    }

    // Convert global aliases to subcommand format
    // e.g., `zin -sim my-app` -> `zin simulate my-app`
    let processedArgs = args;
    if (args[0] === '-sim' || args[0] === '--sim') {
      processedArgs = ['simulate', ...args.slice(1)];
    }

    await program.parseAsync(['node', 'zintrust', ...processedArgs]);
  } catch (error) {
    // Handle all errors with proper logging and exit logic
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
