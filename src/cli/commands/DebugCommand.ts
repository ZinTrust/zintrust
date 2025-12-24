/**
 * Debug Command
 * Launch debug mode with profiling and monitoring
 */

import { BaseCommand, CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { Dashboard } from '@cli/debug/Dashboard';
import { ErrorFactory } from '@exceptions/ZintrustError';
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

const executeDebug = (cmd: IDebugCommand, options: CommandOptions): void => {
  cmd.info(`Debug command executed with options: ${JSON.stringify(options)}`);
  try {
    cmd.dashboard = Dashboard.create() as unknown as DashboardHandle;
    cmd.dashboard.start();

    process.on('SIGINT', () => {
      cmd.dashboard?.stop();
      process.exit(0);
    });
  } catch (error) {
    cmd.dashboard?.stop();
    throw ErrorFactory.createTryCatchError(`Debug failed: ${(error as Error).message}`, error);
  }
};

/**
 * Debug Command
 * Launch debug mode with profiling and monitoring
 */

const create = (): IBaseCommand => {
  const ext = (options: CommandOptions): void => executeDebug(cmd, options);
  const cmd = BaseCommand.create({
    name: 'debug',
    description: 'Launch debug mode with real-time monitoring dashboard',
    addOptions,
    execute: ext,
  }) as IDebugCommand;

  cmd.dashboard = undefined;

  return cmd;
};

/**
 * Debug Command Factory
 */
export const DebugCommand = Object.freeze({
  /**
   * Create a new debug command instance
   */
  create,
});
