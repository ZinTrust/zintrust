/**
 * CLI - Main CLI Class
 * Orchestrates all CLI commands using Commander
 */

import { AddCommand } from '@cli/commands/AddCommand';
import { ConfigCommand } from '@cli/commands/ConfigCommand';
import { D1MigrateCommand } from '@cli/commands/D1MigrateCommand';
import { DebugCommand } from '@cli/commands/DebugCommand';
import { FixCommand } from '@cli/commands/FixCommand';
import { MigrateCommand } from '@cli/commands/MigrateCommand';
import { NewCommand } from '@cli/commands/NewCommand';
import { QACommand } from '@cli/commands/QACommand';
import { ErrorHandler } from '@cli/ErrorHandler';
import { Logger } from '@config/logger';
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class CLI {
  private readonly program: Command;
  private version: string = '1.0.0';

  constructor() {
    this.program = new Command();
    this.loadVersion();
    this.setupProgram();
    this.registerCommands();
  }

  /**
   * Load version from package.json
   */
  private loadVersion(): void {
    try {
      const packagePath = join(__dirname, '../../package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8')) as { version?: string };
      this.version = typeof packageJson.version === 'string' ? packageJson.version : '1.0.0';
    } catch (error) {
      Logger.error('Failed to load version from package.json', error);
      // Use default version if package.json not found
      this.version = '1.0.0';
    }
  }

  /**
   * Setup program metadata
   */
  private setupProgram(): void {
    this.program
      .name('zintrust')
      .description('Zintrust Framework CLI - Build production-grade TypeScript APIs')
      .version(this.version, '-v, --version', 'Output version number')
      .helpOption('-h, --help', 'Display help for command')
      .usage('[command] [options]');

    // Global error handling
    this.program.exitOverride();
  }

  /**
   * Register all available commands
   */
  private registerCommands(): void {
    const commands = [
      new NewCommand(),
      new AddCommand(),
      new MigrateCommand(),
      new D1MigrateCommand(),
      new DebugCommand(),
      new ConfigCommand(),
      new QACommand(),
      new FixCommand(),
    ];

    for (const command of commands) {
      this.program.addCommand(command.getCommand());
    }

    // Help command
    this.program
      .command('help [command]')
      .description('Display help for a command')
      .action((commandName: string) => {
        if (commandName) {
          this.program.command(commandName).help();
        } else {
          this.program.help();
        }
      });
  }

  /**
   * Run CLI with arguments
   */
  public async run(args: string[]): Promise<void> {
    try {
      // Show help if no arguments provided
      if (args.length === 0) {
        this.program.help();
        return;
      }

      await this.program.parseAsync(['node', 'zintrust', ...args]);
    } catch (error) {
      if (typeof error === 'string' && error === this.version) {
        // Commander version output, ignore
        return;
      }
      Logger.error('CLI execution failed', error);
      if (error instanceof Error) {
        if ((error as Error & { code?: string }).code === 'commander.help') {
          // Help was shown, exit gracefully
          return;
        }
        ErrorHandler.handle(error);
      }
      throw error;
    }
  }

  /**
   * Get program instance (for testing)
   */
  public getProgram(): Command {
    return this.program;
  }
}
