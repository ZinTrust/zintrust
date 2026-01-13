/**
 * Queue Command
 * Run queued jobs via the framework CLI.
 */

import { BaseCommand, type CommandOptions, type IBaseCommand } from '@cli/BaseCommand';
import { QueueWorkCommandUtils } from '@cli/commands/QueueWorkCommandUtils';
import { QueueWorkRunner } from '@cli/workers/QueueWorkRunner';
import type { Command } from 'commander';

type QueueCommandOptions = CommandOptions & {
  timeout?: string;
  retry?: string;
  maxItems?: string;
  driver?: string;
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

        command
          .command('work <kind> <queueName>')
          .alias('w')
          .description('Work a queue with explicit kind (broadcast|notification)')
          .option('--timeout <seconds>', 'Stop after this many seconds (default: 10)')
          .option('--retry <count>', 'Retries after first attempt (default: 3)')
          .option('--max-items <count>', 'Max items to process in one run (default: 1000)')
          .option('--driver <name>', 'Queue driver name (default: from QUEUE_DRIVER)')
          .action(
            async (kindRaw: string, queueName: string, subOptions: Record<string, unknown>) => {
              const kind = QueueWorkRunner.parseKind(kindRaw);

              const timeoutSeconds = QueueWorkCommandUtils.parsePositiveInt(
                subOptions['timeout'],
                '--timeout'
              );
              const retry = QueueWorkCommandUtils.parseNonNegativeInt(
                subOptions['retry'],
                '--retry'
              );
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
            }
          );
      },
      execute: async (options: QueueCommandOptions) => {
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
      },
    });
  },
});

export default QueueCommand;
