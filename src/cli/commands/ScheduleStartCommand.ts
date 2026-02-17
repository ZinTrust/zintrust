import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { ScheduleCliSupport } from '@cli/commands/schedule/ScheduleCliSupport';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { SchedulerRuntime } from '@scheduler/SchedulerRuntime';

type Options = CommandOptions & {
  json?: boolean;
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

  await ScheduleCliSupport.registerAll();

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
