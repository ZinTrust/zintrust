import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { databaseConfig } from '@config/database';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
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

const waitForSignal = async (): Promise<'SIGTERM' | 'SIGINT'> => {
  if (typeof process === 'undefined' || typeof process.once !== 'function') {
    throw ErrorFactory.createGeneralError('schedule:start is only supported in Node.js runtimes');
  }

  return new Promise<'SIGTERM' | 'SIGINT'>((resolve) => {
    process.once('SIGTERM', () => resolve('SIGTERM'));
    process.once('SIGINT', () => resolve('SIGINT'));
  });
};

const execute = async (_options: Options): Promise<void> => {
  if (Env.getBool('SCHEDULES_ENABLED', false) === false) {
    Logger.info('Schedules are disabled (SCHEDULES_ENABLED=false); exiting');
    return;
  }

  // Schedules may need DB for persistence-backed work.
  registerDatabasesFromRuntimeConfig(databaseConfig);

  const modules = await loadScheduleModules();
  SchedulerRuntime.registerMany(modules.core, 'core');
  SchedulerRuntime.registerMany(modules.app, 'app');

  const registeredCount = SchedulerRuntime.list().length;
  Logger.info('Starting schedules daemon', { registeredCount });

  SchedulerRuntime.start();

  const signal = await waitForSignal();
  Logger.info('Stopping schedules daemon', { signal });

  const timeoutMs = Env.getInt('SCHEDULE_SHUTDOWN_TIMEOUT_MS', 30000);
  await SchedulerRuntime.stop(timeoutMs);

  Logger.info('Schedules daemon stopped');
};

export const ScheduleStartCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'schedule:start',
      description: 'Start schedules and keep running until SIGINT/SIGTERM',
      execute,
    });
  },
});

export default ScheduleStartCommand;
