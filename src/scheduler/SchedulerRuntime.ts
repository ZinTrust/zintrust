import { Logger } from '@config/logger';
import { createScheduleRunner } from '@scheduler/index';
import { SchedulerLeader } from '@scheduler/leader/SchedulerLeader';
import type { ScheduleRunState } from '@scheduler/state/ScheduleStateStore';
import type { ISchedule, IScheduleKernel } from '@scheduler/types';

type SchedulerRuntimeApi = Readonly<{
  registerMany: (schedules: ReadonlyArray<ISchedule>, source?: 'core' | 'app') => void;
  start: (kernel?: IScheduleKernel) => void;
  stop: (timeoutMs?: number) => Promise<void>;
  list: () => ISchedule[];
  listWithState: () => Promise<Array<{ schedule: ISchedule; state: ScheduleRunState | null }>>;
  runOnce: (name: string, kernel?: IScheduleKernel) => Promise<void>;
}>;

type SchedulerRuntimeState = {
  runner: ReturnType<typeof createScheduleRunner>;
  registered: Map<string, 'core' | 'app'>;
  leader: ReturnType<typeof SchedulerLeader.create>;
  leaderStarted: boolean;
};

const state: SchedulerRuntimeState = {
  runner: createScheduleRunner(),
  registered: new Map<string, 'core' | 'app'>(),
  leader: SchedulerLeader.create(),
  leaderStarted: false,
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
    // If leader mode is enabled, only the leader instance starts timers.
    if (state.leader.isEnabled()) {
      if (state.leaderStarted) return;
      state.leaderStarted = true;

      state.leader.start({
        onBecameLeader: () => {
          state.runner.start(kernel);
        },
        onLostLeadership: () => {
          // Best-effort stop; leadership transitions should not crash the process.
          void state.runner.stop();
        },
      });

      return;
    }

    state.runner.start(kernel);
  },
  async stop(timeoutMs?: number): Promise<void> {
    if (state.leaderStarted) {
      state.leaderStarted = false;
      await state.leader.stop();
    }
    await state.runner.stop(timeoutMs);
  },
  list(): ISchedule[] {
    return state.runner.list();
  },
  async listWithState(): Promise<Array<{ schedule: ISchedule; state: ScheduleRunState | null }>> {
    const schedules = state.runner.list();
    const getState = (state.runner as unknown as { getState?: (name: string) => Promise<unknown> })
      .getState;

    if (typeof getState !== 'function') {
      return schedules.map((schedule) => ({ schedule, state: null }));
    }

    const rows = await Promise.all(
      schedules.map(async (schedule) => {
        const stateRow = (await getState(schedule.name)) as ScheduleRunState | null;
        return { schedule, state: stateRow };
      })
    );

    return rows;
  },
  async runOnce(name: string, kernel?: IScheduleKernel): Promise<void> {
    await state.runner.runOnce(name, kernel);
  },
}) satisfies SchedulerRuntimeApi;

export default SchedulerRuntime;
