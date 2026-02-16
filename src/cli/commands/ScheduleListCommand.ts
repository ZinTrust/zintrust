import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { databaseConfig } from '@config/database';
import { Logger } from '@config/logger';
import { registerDatabasesFromRuntimeConfig } from '@orm/DatabaseRuntimeRegistration';
import { SchedulerRuntime } from '@scheduler/SchedulerRuntime';
import type { ISchedule } from '@scheduler/types';

type Options = CommandOptions & {
  json?: boolean;
};

const isSchedule = (value: unknown): value is ISchedule => {
  if (value === undefined || value === null || typeof value !== 'object') return false;
  return 'name' in value && typeof (value as { name?: unknown }).name === 'string';
};

const loadScheduleModules = async (): Promise<{
  core: ISchedule[];
  app: ISchedule[];
}> => {
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
  // Schedules may need DB for persistence-backed work.
  registerDatabasesFromRuntimeConfig(databaseConfig);

  const modules = await loadScheduleModules();
  SchedulerRuntime.registerMany(modules.core, 'core');
  SchedulerRuntime.registerMany(modules.app, 'app');

  const rows = SchedulerRuntime.list()
    .map((s) => ({
      name: s.name,
      enabled: s.enabled !== false,
      intervalMs: s.intervalMs,
      runOnStart: s.runOnStart === true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (options.json === true) {
    Logger.info(JSON.stringify(rows, null, 2));
    return;
  }

  if (rows.length === 0) {
    Logger.info('No schedules registered');
    return;
  }

  rows.forEach((row) => {
    Logger.info(
      `${row.name} (enabled=${row.enabled}, intervalMs=${row.intervalMs ?? 'manual'}, runOnStart=${row.runOnStart})`
    );
  });
};

export const ScheduleListCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'schedule:list',
      description: 'List all registered schedules',
      addOptions: (command) => {
        command.option('--json', 'Output JSON');
      },
      execute,
    });
  },
});

export default ScheduleListCommand;
