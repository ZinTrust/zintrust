import { Logger } from '@config/logger';
import { createScheduleRunner } from '@scheduler/index';
import type { ISchedule, IScheduleKernel } from '@scheduler/types';

type SchedulerRuntimeApi = Readonly<{
  registerMany: (schedules: ReadonlyArray<ISchedule>, source?: 'core' | 'app') => void;
  start: (kernel?: IScheduleKernel) => void;
  stop: (timeoutMs?: number) => Promise<void>;
  list: () => ISchedule[];
  runOnce: (name: string, kernel?: IScheduleKernel) => Promise<void>;
}>;

type SchedulerRuntimeState = {
  runner: ReturnType<typeof createScheduleRunner>;
  registered: Map<string, 'core' | 'app'>;
};

const state: SchedulerRuntimeState = {
  runner: createScheduleRunner(),
  registered: new Map<string, 'core' | 'app'>(),
};

const registerMany = (
  schedules: ReadonlyArray<ISchedule>,
  source: 'core' | 'app' = 'core'
): void => {
  for (const schedule of schedules) {
    if (schedule === undefined || schedule === null || typeof schedule.name !== 'string') continue;
    const name = schedule.name.trim();
    if (name.length === 0) continue;

    const existing = state.registered.get(name);

    // If app already registered, it always wins.
    if (existing === 'app') continue;

    // Prevent repeated registrations from the same source.
    if (existing === source) continue;

    if (existing === 'core' && source === 'app') {
      Logger.info('Schedule overridden by app/Schedules', { name });
    }

    state.registered.set(name, source);
    state.runner.register(schedule);
  }
};

export const SchedulerRuntime = Object.freeze({
  registerMany,
  start(kernel?: IScheduleKernel): void {
    state.runner.start(kernel);
  },
  async stop(timeoutMs?: number): Promise<void> {
    await state.runner.stop(timeoutMs);
  },
  list(): ISchedule[] {
    return state.runner.list();
  },
  async runOnce(name: string, kernel?: IScheduleKernel): Promise<void> {
    await state.runner.runOnce(name, kernel);
  },
}) satisfies SchedulerRuntimeApi;

export default SchedulerRuntime;
