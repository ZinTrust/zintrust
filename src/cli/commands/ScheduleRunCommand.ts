import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { databaseConfig } from '@config/database';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { registerDatabasesFromRuntimeConfig } from '@orm/DatabaseRuntimeRegistration';
import { SchedulerRuntime } from '@scheduler/SchedulerRuntime';
import type { ISchedule } from '@scheduler/types';

type Options = CommandOptions & {
  name?: string;
};

const isSchedule = (value: unknown): value is ISchedule => {
  if (value === undefined || value === null || typeof value !== 'object') return false;
  return 'name' in value && typeof (value as { name?: unknown }).name === 'string';
};

const loadScheduleModules = async (): Promise<{ core: ISchedule[]; app: ISchedule[] }> => {
  const coreSchedules = await import('@schedules/index');
  let appSchedules: Record<string, unknown> = {};
  try {
    appSchedules = (await import('@app/Schedules')) as unknown as Record<string, unknown>;
  } catch {
    appSchedules = {};
  }

  return {
    core: Object.values(coreSchedules).filter(isSchedule),
    app: Object.values(appSchedules).filter(isSchedule),
  };
};

const execute = async (options: Options): Promise<void> => {
  const name = (options.name ?? '').trim();
  if (name.length === 0) throw ErrorFactory.createConfigError('--name is required');

  registerDatabasesFromRuntimeConfig(databaseConfig);

  const modules = await loadScheduleModules();
  SchedulerRuntime.registerMany(modules.core, 'core');
  SchedulerRuntime.registerMany(modules.app, 'app');

  Logger.info('Running schedule once', { name });
  await SchedulerRuntime.runOnce(name);
  Logger.info('Schedule run completed', { name });
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
