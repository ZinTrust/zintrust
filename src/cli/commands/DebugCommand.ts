/**
 * Debug Command
 * Launch debug mode with profiling and monitoring
 */

import { BaseCommand, CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { Dashboard } from '@cli/debug/Dashboard';
import { Logger } from '@config/logger';
import { Command } from 'commander';

type DashboardHandle = {
  start(): void;
  stop(): void;
};

type IDebugCommand = IBaseCommand & {
  dashboard: DashboardHandle | undefined;
};

const addOptions = (command: Command): void => {
  command
    .option('--port <number>', 'Debug server port', '3000')
    .option('--enable-profiling', 'Enable memory profiling')
    .option('--enable-tracing', 'Enable request tracing');
};

const executeDebug = async (cmd: IDebugCommand, options: CommandOptions): Promise<void> => {
  cmd.info(`Debug command executed with options: ${JSON.stringify(options)}`);

  try {
    cmd.dashboard = Dashboard.create() as unknown as DashboardHandle;
    cmd.dashboard.start();

    process.on('SIGINT', () => {
      cmd.dashboard?.stop();
      process.exit(0);
    });

    await new Promise<never>(() => {
      // Intentionally never resolves
    });
  } catch (error) {
    Logger.error('Debug command failed', error);
    cmd.dashboard?.stop();
    throw new Error(`Debug failed: ${(error as Error).message}`);
  }
};

/**
 * Debug Command
 * Launch debug mode with profiling and monitoring
 */

/**
 * Debug Command Factory
 */
export const DebugCommand = Object.freeze({
  /**
   * Create a new debug command instance
   */
  create(): IBaseCommand {
    const cmd = BaseCommand.create({
      name: 'debug',
      description: 'Launch debug mode with real-time monitoring dashboard',
      addOptions,
      execute: async (options: CommandOptions): Promise<void> => executeDebug(cmd, options),
    }) as IDebugCommand;

    cmd.dashboard = undefined;

    return cmd;
  },
});
