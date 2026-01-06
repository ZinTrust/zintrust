import { BaseCommand, type CommandOptions, type IBaseCommand } from '@cli/BaseCommand';
import { QueueWorkCommandUtils } from '@cli/commands/QueueWorkCommandUtils';
import { QueueWorkRunner, type QueueWorkKind } from '@cli/workers/QueueWorkRunner';
import { Command } from 'commander';

type KindWorkCommandOptions = CommandOptions & {
  timeout?: string;
  retry?: string;
  maxItems?: string;
  driver?: string;
};

export function createKindWorkCommand(options: {
  name: string;
  description: string;
  kind: QueueWorkKind;
  helpHint: string;
}): IBaseCommand {
  return BaseCommand.create({
    name: options.name,
    description: options.description,
    addOptions: (command: Command) => {
      command
        .argument('<queueName>', 'Queue name to work')
        .option('--timeout <seconds>', 'Stop after this many seconds (default: 10)')
        .option('--retry <count>', 'Retries after first attempt (default: 3)')
        .option('--max-items <count>', 'Max items to process in one run (default: 1000)')
        .option('--driver <name>', 'Queue driver name (default: from QUEUE_DRIVER)');
    },
    execute: async (cmdOptions: KindWorkCommandOptions) => {
      const queueName = QueueWorkCommandUtils.requireQueueNameFromArgs(
        cmdOptions.args,
        options.helpHint
      );

      const timeoutSeconds = QueueWorkCommandUtils.parsePositiveInt(
        cmdOptions.timeout,
        '--timeout'
      );
      const retry = QueueWorkCommandUtils.parseNonNegativeInt(cmdOptions.retry, '--retry');
      const maxItems = QueueWorkCommandUtils.parsePositiveInt(cmdOptions.maxItems, '--max-items');
      const driverName = QueueWorkCommandUtils.normalizeDriverName(cmdOptions.driver);

      const result = await QueueWorkRunner.run({
        kind: options.kind,
        queueName,
        timeoutSeconds,
        retry,
        maxItems,
        driverName,
      });

      QueueWorkCommandUtils.logSummary(queueName, options.kind, result);
    },
  });
}
