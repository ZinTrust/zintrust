/**
 * Queue Command
 * Run queued jobs via the framework CLI.
 */

import { BaseCommand, type CommandOptions, type IBaseCommand } from '@cli/BaseCommand';
import { setupQueueLockCommands } from '@cli/commands/QueueLockCommand';
import { QueueWorkCommandUtils } from '@cli/commands/QueueWorkCommandUtils';
import { QueueWorkRunner } from '@cli/workers/QueueWorkRunner';
import type { Command } from 'commander';

type QueueCommandOptions = CommandOptions & {
  timeout?: string;
  retry?: string;
  maxItems?: string;
  driver?: string;
};

/**
 * Setup work subcommand with explicit kind
 */
const setupWorkCommand = (command: Command): void => {
  command
    .command('work <kind> <queueName>')
    .alias('w')
    .description('Work a queue with explicit kind (broadcast|notification)')
    .option('--timeout <seconds>', 'Stop after this many seconds (default: 10)')
    .option('--retry <count>', 'Retries after first attempt (default: 3)')
    .option('--max-items <count>', 'Max items to process in one run (default: 1000)')
    .option('--driver <name>', 'Queue driver name (default: from QUEUE_DRIVER)')
    .action(async (kindRaw: string, queueName: string, subOptions: Record<string, unknown>) => {
      const kind = QueueWorkRunner.parseKind(kindRaw);

      const timeoutSeconds = QueueWorkCommandUtils.parsePositiveInt(
        subOptions['timeout'],
        '--timeout'
      );
      const retry = QueueWorkCommandUtils.parseNonNegativeInt(subOptions['retry'], '--retry');
      const maxItems = QueueWorkCommandUtils.parsePositiveInt(
        subOptions['maxItems'],
        '--max-items'
      );
      const driverName = QueueWorkCommandUtils.normalizeDriverName(subOptions['driver']);

      const result = await QueueWorkRunner.run({
        kind,
        queueName,
        timeoutSeconds,
        retry,
        maxItems,
        driverName,
      });

      QueueWorkCommandUtils.logSummary(queueName, kind, result);
    });
};

/**
 * Setup prune subcommand
 */
const setupPruneCommand = (command: Command): void => {
  command
    .command('prune')
    .description('Prune failed jobs from the database queue')
    .option('--hours <count>', 'Prune jobs older than this many hours (default: 168)', '168')
    .action(async (options: { hours?: string }) => {
      const { Logger } = await import('@config/logger');
      const { QueryBuilder } = await import('@orm/QueryBuilder');
      const { useEnsureDbConnected } = await import('@orm/Database');
      const { databaseConfig } = await import('@config/database');

      const hours = Number.parseInt(options.hours ?? '168', 10);
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

      Logger.info(`[Queue] Pruning failed jobs older than ${cutoff.toISOString()}...`);

      try {
        // Resolved connection config (Queue prune usually runs on default DB)
        const config = databaseConfig.getConnection();
        const db = await useEnsureDbConnected(config);

        const deleted = await QueryBuilder.create('queue_jobs_failed', db)
          .where('failed_at', '<', cutoff)
          .delete();
        Logger.info(`[Queue] Pruned ${deleted} failed jobs.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('no such table')) {
          Logger.warn('[Queue] Table queue_jobs_failed not found. Skipping prune.');
        } else {
          Logger.error('[Queue] Prune failed', err);
          process.exit(1);
        }
      }
    });
};

/**
 * Parse command options and run queue work
 */
const executeQueueWork = async (options: QueueCommandOptions): Promise<void> => {
  const queueName = QueueWorkCommandUtils.requireQueueNameFromArgs(
    options.args,
    'zin queue --help'
  );

  const timeoutSeconds = QueueWorkCommandUtils.parsePositiveInt(options.timeout, '--timeout');
  const retry = QueueWorkCommandUtils.parseNonNegativeInt(options.retry, '--retry');
  const maxItems = QueueWorkCommandUtils.parsePositiveInt(options.maxItems, '--max-items');
  const driverName = QueueWorkCommandUtils.normalizeDriverName(options.driver);

  const result = await QueueWorkRunner.run({
    queueName,
    timeoutSeconds,
    retry,
    maxItems,
    driverName,
  });

  QueueWorkCommandUtils.logSummary(queueName, 'auto', result);
};

export const QueueCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'queue',
      description: 'Work queued jobs (broadcast/notification)',
      addOptions: (command: Command) => {
        command
          .argument('<queueName>', 'Queue name to work')
          .option('--timeout <seconds>', 'Stop after this many seconds (default: 10)')
          .option('--retry <count>', 'Retries after first attempt (default: 3)')
          .option('--max-items <count>', 'Max items to process in one run (default: 1000)')
          .option('--driver <name>', 'Queue driver name (default: from QUEUE_DRIVER)');

        setupWorkCommand(command);
        setupPruneCommand(command);
        setupQueueLockCommands(command);
      },
      execute: executeQueueWork,
    });
  },
});

export default QueueCommand;
