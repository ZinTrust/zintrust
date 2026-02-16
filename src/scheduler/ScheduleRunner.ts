/**
 * ScheduleRunner
 * Lightweight, zero-dependency schedule runner for long-running runtimes
 */

import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { Cron } from '@scheduler/cron/Cron';
import {
  InMemoryScheduleStateStore,
  type IScheduleStateStore,
  type ScheduleRunState,
} from '@scheduler/state/ScheduleStateStore';
import type { ISchedule, IScheduleKernel } from '@scheduler/types';

type InternalScheduleState = {
  schedule: ISchedule;
  timeoutId?: ReturnType<typeof globalThis.setTimeout>;
  isRunning: boolean;
  runningPromise?: Promise<void>;
  lastRunAt?: number;
  consecutiveFailures: number;
};

type RunnerState = {
  schedules: Map<string, InternalScheduleState>;
  started: boolean;
  kernel?: IScheduleKernel;
  store: IScheduleStateStore;
};

type ScheduleRunner = {
  register: (schedule: ISchedule) => void;
  start: (kernel?: IScheduleKernel) => void;
  stop: (timeoutMs?: number) => Promise<void>;
  list: () => ISchedule[];
  runOnce: (name: string, kernel?: IScheduleKernel) => Promise<void>;
  getState: (name: string) => Promise<ScheduleRunState | null>;
  listStates: () => Promise<Array<{ name: string; state: ScheduleRunState }>>;
};

const nowMs = (): number => Date.now();

const randomInt = (min: number, maxInclusive: number): number => {
  if (!Number.isFinite(min) || !Number.isFinite(maxInclusive)) return 0;
  if (maxInclusive <= min) return Math.floor(min);
  return Math.floor(min + Math.random() * (maxInclusive - min + 1)); //NOSONAR
};

const resolveBackoffDelayMs = (state: InternalScheduleState): number => {
  const policy = state.schedule.backoff;
  if (!policy) return 0;

  const initialMs = Number.isFinite(policy.initialMs)
    ? Math.max(0, Math.floor(policy.initialMs))
    : 0;
  const maxMs = Number.isFinite(policy.maxMs) ? Math.max(0, Math.floor(policy.maxMs)) : 0;
  if (initialMs <= 0 || maxMs <= 0) return 0;

  const factor =
    policy.factor === undefined || !Number.isFinite(policy.factor) || policy.factor <= 1
      ? 2
      : policy.factor;

  const power = Math.max(0, state.consecutiveFailures - 1);
  const raw = initialMs * Math.pow(factor, power);
  return Math.min(maxMs, Math.floor(raw));
};

const resolveJitterMs = (jitterMs: number | undefined): number => {
  return typeof jitterMs === 'number' && jitterMs > 0 ? randomInt(0, Math.floor(jitterMs)) : 0;
};

const computeBackoffDelay = (state: InternalScheduleState): number | null => {
  if (state.schedule.enabled === false) return null;

  const backoffDelayMs = resolveBackoffDelayMs(state);
  if (backoffDelayMs > 0) {
    const jitter = resolveJitterMs(state.schedule.jitterMs);
    return backoffDelayMs + jitter;
  }

  return null;
};

const computeCronDelay = (schedule: ISchedule): number | null => {
  if (typeof schedule.cron !== 'string' || schedule.cron.trim().length === 0) {
    return null;
  }

  const tz =
    typeof schedule.timezone === 'string' && schedule.timezone.trim().length > 0
      ? schedule.timezone
      : 'UTC';
  const nextAt = Cron.nextRunAtMs(nowMs(), schedule.cron, tz);
  const baseDelay = Math.max(0, nextAt - nowMs());
  const jitter = resolveJitterMs(schedule.jitterMs);
  return baseDelay + jitter;
};

const computeIntervalDelay = (schedule: ISchedule): number | null => {
  if (typeof schedule.intervalMs !== 'number' || schedule.intervalMs <= 0) {
    return null;
  }

  const base = Math.floor(schedule.intervalMs);
  const jitter = resolveJitterMs(schedule.jitterMs);
  return base + jitter;
};

const computeNextDelayMs = (
  state: InternalScheduleState,
  outcome: 'success' | 'failure'
): number | null => {
  const schedule = state.schedule;

  if (schedule.enabled === false) return null;

  if (outcome === 'failure') {
    const backoffDelay = computeBackoffDelay(state);
    if (backoffDelay !== null) return backoffDelay;
  }

  const cronDelay = computeCronDelay(schedule);
  if (cronDelay !== null) return cronDelay;

  const intervalDelay = computeIntervalDelay(schedule);
  if (intervalDelay !== null) return intervalDelay;

  return null;
};

const clearTimer = (state: InternalScheduleState): void => {
  if (state.timeoutId !== undefined) {
    globalThis.clearTimeout(state.timeoutId);
    state.timeoutId = undefined;
  }
};

const scheduleNext = (
  state: InternalScheduleState,
  kernel: IScheduleKernel | undefined,
  invoke: (
    state: InternalScheduleState,
    kernel?: IScheduleKernel
  ) => Promise<'success' | 'failure'>,
  outcome: 'success' | 'failure',
  store: IScheduleStateStore
): void => {
  clearTimer(state);

  const delay = computeNextDelayMs(state, outcome);
  if (delay === null) return;

  const nextRunAt = nowMs() + delay;
  void store.set(state.schedule.name, {
    nextRunAt,
    consecutiveFailures: state.consecutiveFailures,
  });

  state.timeoutId = globalThis.setTimeout(() => {
    void runOnceAndReschedule(state, kernel, invoke, store);
  }, delay);
};

const runOnceAndReschedule = async (
  state: InternalScheduleState,
  kernel: IScheduleKernel | undefined,
  invoke: (
    state: InternalScheduleState,
    kernel?: IScheduleKernel
  ) => Promise<'success' | 'failure'>,
  store: IScheduleStateStore
): Promise<void> => {
  const outcome = await invoke(state, kernel);
  scheduleNext(state, kernel, invoke, outcome, store);
};

const createRegister =
  (
    runner: RunnerState,
    invokeHandler: (
      state: InternalScheduleState,
      kernel?: IScheduleKernel
    ) => Promise<'success' | 'failure'>
  ) =>
  (schedule: ISchedule): void => {
    const existing = runner.schedules.get(schedule.name);
    if (existing !== undefined) {
      Logger.warn(`Schedule replaced: ${schedule.name}`);

      // Reuse the same internal state to avoid leaving old timers/reschedule loops behind.
      existing.schedule = schedule;

      // If disabled, ensure any pending timer is cleared.
      if (schedule.enabled === false) {
        clearTimer(existing);
        return;
      }

      // If a run is currently in progress, let it finish and reschedule naturally.
      if (existing.isRunning) {
        return;
      }

      // If schedules are already started, apply the new schedule immediately.
      if (runner.started) {
        if (schedule.runOnStart === true) {
          void runOnceAndReschedule(existing, runner.kernel, invokeHandler, runner.store);
          return;
        }

        scheduleNext(existing, runner.kernel, invokeHandler, 'success', runner.store);
      }

      return;
    }

    const state: InternalScheduleState = {
      schedule,
      isRunning: false,
      consecutiveFailures: 0,
    };

    runner.schedules.set(schedule.name, state);

    // If schedules are already started, register should take effect immediately.
    if (runner.started && schedule.enabled !== false) {
      if (schedule.runOnStart === true) {
        void runOnceAndReschedule(state, runner.kernel, invokeHandler, runner.store);
        return;
      }

      // Auto scheduling
      scheduleNext(state, runner.kernel, invokeHandler, 'success', runner.store);
    }
  };

const createInvokeHandler =
  (store: IScheduleStateStore) =>
  async (
    state: InternalScheduleState,
    kernel?: IScheduleKernel
  ): Promise<'success' | 'failure'> => {
    if (state.isRunning) {
      Logger.info(`Skipping overlapping run for schedule: ${state.schedule.name}`);
      return 'failure';
    }

    state.isRunning = true;

    try {
      const handlerPromise: Promise<'success' | 'failure'> = Promise.resolve()
        .then(async () => state.schedule.handler(kernel))
        .then(() => {
          state.lastRunAt = nowMs();
          state.consecutiveFailures = 0;
          void store.set(state.schedule.name, {
            lastRunAt: state.lastRunAt,
            lastSuccessAt: state.lastRunAt,
            lastErrorAt: undefined,
            lastErrorMessage: undefined,
            consecutiveFailures: state.consecutiveFailures,
          });
          return 'success' as const;
        })
        .catch((error: unknown) => {
          state.consecutiveFailures = Math.min(1_000_000, state.consecutiveFailures + 1);
          const errMsg = error instanceof Error ? error.message : String(error);
          const at = nowMs();
          void store.set(state.schedule.name, {
            lastRunAt: at,
            lastErrorAt: at,
            lastErrorMessage: errMsg,
            consecutiveFailures: state.consecutiveFailures,
          });
          Logger.error(`Schedule '${state.schedule.name}' failed:`, error as Error);
          return 'failure' as const;
        });

      state.runningPromise = handlerPromise.then(() => undefined);
      return await handlerPromise;
    } finally {
      state.isRunning = false;
      state.runningPromise = undefined;
    }
  };

const createStart =
  (
    runner: RunnerState,
    invokeHandler: (
      state: InternalScheduleState,
      kernel?: IScheduleKernel
    ) => Promise<'success' | 'failure'>
  ) =>
  (kernel?: IScheduleKernel): void => {
    if (runner.started) return;
    runner.started = true;
    runner.kernel = kernel;

    for (const [, state] of runner.schedules) {
      const { schedule } = state;
      if (schedule.enabled === false) continue;

      if (schedule.runOnStart === true) {
        // fire-and-forget; next scheduling happens after the handler completes
        void runOnceAndReschedule(state, kernel, invokeHandler, runner.store);
        continue;
      }

      // Auto scheduling
      scheduleNext(state, kernel, invokeHandler, 'success', runner.store);
    }
  };

const createStop = (runner: RunnerState) => async (): Promise<void> => {
  if (!runner.started) return;
  runner.started = false;
  runner.kernel = undefined;

  // Clear timers
  for (const [, state] of runner.schedules) {
    clearTimer(state);
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
    invokeHandler: (
      state: InternalScheduleState,
      kernel?: IScheduleKernel
    ) => Promise<'success' | 'failure'>
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
    store: InMemoryScheduleStateStore.create(),
  };

  const invokeHandler = createInvokeHandler(runner.store);

  const register = createRegister(runner, invokeHandler);
  const start = createStart(runner, invokeHandler);
  const stopRaw = createStop(runner);
  const stop = createStopWithTimeout(stopRaw);
  const list = createList(runner);
  const runOnce = createRunOnce(runner, invokeHandler);
  const getState = async (name: string): Promise<ScheduleRunState | null> => runner.store.get(name);
  const listStates = async (): Promise<Array<{ name: string; state: ScheduleRunState }>> =>
    runner.store.list();

  return Object.freeze({
    register,
    start,
    stop,
    list,
    runOnce,
    getState,
    listStates,
  });
};

export default { create };
