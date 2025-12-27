/**
 * ScheduleRunner
 * Lightweight, zero-dependency schedule runner for long-running runtimes
 */

import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { ISchedule, IScheduleKernel } from '@scheduler/types';

type InternalScheduleState = {
  schedule: ISchedule;
  intervalId?: ReturnType<typeof globalThis.setInterval>;
  isRunning: boolean;
  runningPromise?: Promise<void>;
  lastRunAt?: number;
};

type RunnerState = {
  schedules: Map<string, InternalScheduleState>;
  started: boolean;
  kernel?: IScheduleKernel;
};

type ScheduleRunner = {
  register: (schedule: ISchedule) => void;
  start: (kernel?: IScheduleKernel) => void;
  stop: (timeoutMs?: number) => Promise<void>;
  list: () => ISchedule[];
  runOnce: (name: string, kernel?: IScheduleKernel) => Promise<void>;
};

const createRegister =
  (
    runner: RunnerState,
    invokeHandler: (state: InternalScheduleState, kernel?: IScheduleKernel) => Promise<void>
  ) =>
  (schedule: ISchedule): void => {
    if (runner.schedules.has(schedule.name)) {
      Logger.warn(`Schedule replaced: ${schedule.name}`);
    }

    const state: InternalScheduleState = {
      schedule,
      isRunning: false,
    };

    runner.schedules.set(schedule.name, state);

    // If schedules are already started, register should take effect immediately.
    if (runner.started && schedule.enabled !== false) {
      if (schedule.runOnStart === true) {
        void invokeHandler(state, runner.kernel);
      }

      if (typeof schedule.intervalMs === 'number' && schedule.intervalMs > 0) {
        state.intervalId = globalThis.setInterval(() => {
          void invokeHandler(state, runner.kernel);
        }, schedule.intervalMs);
      }
    }
  };

const createInvokeHandler =
  () =>
  async (state: InternalScheduleState, kernel?: IScheduleKernel): Promise<void> => {
    if (state.isRunning) {
      Logger.info(`Skipping overlapping run for schedule: ${state.schedule.name}`);
      return;
    }

    state.isRunning = true;

    try {
      const handlerPromise = Promise.resolve()
        .then(async () => state.schedule.handler(kernel))
        .then(() => {
          state.lastRunAt = Date.now();
        })
        .catch((error: unknown) => {
          Logger.error(`Schedule '${state.schedule.name}' failed:`, error as Error);
        })
        .then(() => undefined);

      state.runningPromise = handlerPromise;
      await handlerPromise;
    } finally {
      state.isRunning = false;
      state.runningPromise = undefined;
    }
  };

const createStart =
  (
    runner: RunnerState,
    invokeHandler: (state: InternalScheduleState, kernel?: IScheduleKernel) => Promise<void>
  ) =>
  (kernel?: IScheduleKernel): void => {
    if (runner.started) return;
    runner.started = true;
    runner.kernel = kernel;

    for (const [, state] of runner.schedules) {
      const { schedule } = state;
      if (schedule.enabled === false) continue;

      if (schedule.runOnStart === true) {
        // fire-and-forget (handled by invokeHandler which logs errors)
        void invokeHandler(state, kernel);
      }

      if (typeof schedule.intervalMs === 'number' && schedule.intervalMs > 0) {
        const id = globalThis.setInterval(() => {
          // fire and forget invocation; overlapping runs are protected inside
          void invokeHandler(state, kernel);
        }, schedule.intervalMs);

        state.intervalId = id;
      }
    }
  };

const createStop = (runner: RunnerState) => async (): Promise<void> => {
  if (!runner.started) return;
  runner.started = false;
  runner.kernel = undefined;

  // Clear intervals
  for (const [, state] of runner.schedules) {
    if (state.intervalId !== undefined) {
      globalThis.clearInterval(state.intervalId);
      state.intervalId = undefined;
    }
  }

  // Await running handlers (runningPromise is guaranteed not to reject)
  const running: Promise<void>[] = [];
  for (const [, state] of runner.schedules) {
    if (state.isRunning && state.runningPromise !== undefined) {
      running.push(state.runningPromise);
    }
  }

  if (running.length > 0) {
    await Promise.all(running);
  }
};

const withTimeout = async (promise: Promise<void>, timeoutMs?: number): Promise<void> => {
  const ms = typeof timeoutMs === 'number' ? timeoutMs : 0;
  if (ms <= 0) {
    await promise;
    return;
  }

  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<void>((resolve) => {
        timeoutId = globalThis.setTimeout(() => {
          Logger.error('ScheduleRunner.stop() timed out; continuing shutdown', {
            timeoutMs: ms,
          });
          resolve();
        }, ms);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
  }
};

const createStopWithTimeout =
  (stop: () => Promise<void>) =>
  async (timeoutMs?: number): Promise<void> => {
    await withTimeout(stop(), timeoutMs);
  };

const createList = (runner: RunnerState) => (): ISchedule[] =>
  Array.from(runner.schedules.values()).map((s) => s.schedule);

const createRunOnce =
  (
    runner: RunnerState,
    invokeHandler: (state: InternalScheduleState, kernel?: IScheduleKernel) => Promise<void>
  ) =>
  async (name: string, kernel?: IScheduleKernel): Promise<void> => {
    const state = runner.schedules.get(name);
    if (state === undefined) throw ErrorFactory.createNotFoundError(`Schedule not found: ${name}`);
    if (state.schedule.enabled === false) return;
    await invokeHandler(state, kernel ?? runner.kernel);
  };

export const create = (): Readonly<ScheduleRunner> => {
  const runner: RunnerState = {
    schedules: new Map<string, InternalScheduleState>(),
    started: false,
    kernel: undefined,
  };

  const invokeHandler = createInvokeHandler();

  const register = createRegister(runner, invokeHandler);
  const start = createStart(runner, invokeHandler);
  const stopRaw = createStop(runner);
  const stop = createStopWithTimeout(stopRaw);
  const list = createList(runner);
  const runOnce = createRunOnce(runner, invokeHandler);

  return Object.freeze({
    register,
    start,
    stop,
    list,
    runOnce,
  });
};

export default { create };
