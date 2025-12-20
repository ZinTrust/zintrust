/**
 * Debug Command
 * Launch debug mode with profiling and monitoring
 */

import { BaseCommand, CommandOptions } from '@cli/BaseCommand';
import { Dashboard } from '@cli/debug/Dashboard';
import { Logger } from '@config/logger';
import { Command } from 'commander';

export class DebugCommand extends BaseCommand {
  private dashboard?: Dashboard;

  constructor() {
    super();
    this.name = 'debug';
    this.description = 'Launch debug mode with real-time monitoring dashboard';
  }

  protected addOptions(command: Command): void {
    command
      .option('--port <number>', 'Debug server port', '3000')
      .option('--enable-profiling', 'Enable memory profiling')
      .option('--enable-tracing', 'Enable request tracing');
  }

  async execute(options: CommandOptions): Promise<void> {
    this.debug(`Debug command executed with options: ${JSON.stringify(options)}`);

    try {
      this.dashboard = new Dashboard();
      this.dashboard.start();

      // Handle termination
      process.on('SIGINT', () => {
        this.dashboard?.stop();
        process.exit(0);
      });

      // Keep process running
      await new Promise(() => {
        // Infinite wait
      });
    } catch (error) {
      Logger.error('Debug command failed', error);
      this.dashboard?.stop();
      throw new Error(`Debug failed: ${(error as Error).message}`);
    }
  }
}
