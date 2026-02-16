import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { ScheduleCliSupport } from '@cli/commands/schedule/ScheduleCliSupport';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { SchedulerRuntime } from '@scheduler/SchedulerRuntime';

type Options = CommandOptions & {
  name?: string;
};

const execute = async (options: Options): Promise<void> => {
  const name = (options.name ?? '').trim();
  if (name.length === 0) throw ErrorFactory.createConfigError('--name is required');

  try {
    await ScheduleCliSupport.registerAll();

    Logger.info('Running schedule once', { name });
    await SchedulerRuntime.runOnce(name);
    Logger.info('Schedule run completed', { name });
  } finally {
    await ScheduleCliSupport.shutdownCliResources();
  }
};

export const ScheduleRunCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'schedule:run',
      description: 'Run a specific schedule once and exit',
      addOptions: (command) => {
        command.option('--name <name>', 'Schedule name to run');
      },
      execute,
    });
  },
});

export default ScheduleRunCommand;
