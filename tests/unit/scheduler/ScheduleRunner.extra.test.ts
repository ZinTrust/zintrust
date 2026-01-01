import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const loggerError = vi.fn();
const loggerWarn = vi.fn();
const loggerInfo = vi.fn();
vi.mock('@config/logger', () => ({
  Logger: { error: loggerError, warn: loggerWarn, info: loggerInfo, debug: vi.fn() },
}));

describe('ScheduleRunner - extra branches', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    loggerError.mockReset();
    loggerWarn.mockReset();
    loggerInfo.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('register replacing schedule logs a warning', async () => {
    const { create: createScheduleRunner } =
      await import('@/scheduler/ScheduleRunner?v=replace-warning');
    const runner = createScheduleRunner();

    const sched = { name: 'a', handler: () => undefined };
    runner.register(sched as any);
    runner.register(sched as any);

    expect(loggerWarn).toHaveBeenCalledWith('Schedule replaced: a');
  });

  test('runOnStart triggers handler when start is called', async () => {
    const { create: createScheduleRunner } =
      await import('@/scheduler/ScheduleRunner?v=run-on-start');
    const called = vi.fn();
    const sched = {
      name: 'rs',
      handler: () => {
        called();
      },
      runOnStart: true,
    };

    const runner = createScheduleRunner();
    runner.register(sched as any);
    runner.start();

    // allow microtasks
    await Promise.resolve();
    expect(called).toHaveBeenCalled();
  });

  test('interval triggers handler and overlapping runs are skipped', async () => {
    const { create: createScheduleRunner } =
      await import('@/scheduler/ScheduleRunner?v=interval-overlap');
    let resolveFirst: () => void;
    const first = new Promise<void>((res) => {
      resolveFirst = res;
    });

    const handler = vi.fn().mockImplementation(async () => {
      await first;
    });

    const sched = { name: 'iv', handler, intervalMs: 100 };
    const runner = createScheduleRunner();
    runner.register(sched as any);
    runner.start();

    // first interval tick
    vi.advanceTimersByTime(100);
    // second tick shortly after; since first is still running, overlapping should be skipped
    vi.advanceTimersByTime(100);

    // allow queued tasks
    await Promise.resolve();

    // handler should only have been started once
    expect(handler).toHaveBeenCalledTimes(1);
    expect(loggerInfo).toHaveBeenCalledWith('Skipping overlapping run for schedule: iv');

    // finish first
    resolveFirst();
    await Promise.resolve();
  });

  test('handler errors are logged and do not reject', async () => {
    const { create: createScheduleRunner } =
      await import('@/scheduler/ScheduleRunner?v=handler-error');
    const handler = vi.fn().mockImplementation(() => {
      throw new Error('boom');
    });

    const sched = { name: 'err', handler };
    const runner = createScheduleRunner();
    runner.register(sched as any);

    // invoke explicitly
    await runner.runOnce('err');

    expect(loggerError).toHaveBeenCalledWith("Schedule 'err' failed:", expect.any(Error));
  });

  test('stop waits for running handlers to finish', async () => {
    const { create: createScheduleRunner } = await import('@/scheduler/ScheduleRunner?v=stop-wait');
    let resolveRun: () => void;
    const longRun = new Promise<void>((res) => {
      resolveRun = res;
    });
    const handler = vi.fn().mockImplementation(() => longRun);

    const sched = { name: 'long', handler };
    const runner = createScheduleRunner();
    runner.register(sched as any);

    // start a run
    const runPromise = runner.runOnce('long');
    // give event loop chance to start
    await Promise.resolve();

    // now call stop (should await running handler)
    const stopPromise = runner.stop();

    // stop should not be resolved yet
    let settled = false;
    stopPromise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    // finish handler
    resolveRun();
    await runPromise;
    await stopPromise;
    expect(settled).toBe(true);
  });

  test('stop with timeout logs and returns when handlers take too long', async () => {
    const { create: createScheduleRunner } =
      await import('@/scheduler/ScheduleRunner?v=stop-timeout');
    let resolveRun: () => void;
    const longRun = new Promise<void>((res) => {
      resolveRun = res;
    });
    const handler = vi.fn().mockImplementation(() => longRun);

    const sched = { name: 'long-timeout', handler };
    const runner = createScheduleRunner();
    runner.register(sched as any);

    // start a run
    const runPromise = runner.runOnce('long-timeout');
    await Promise.resolve();

    // call stop with tiny timeout
    const stopPromise = runner.stop(1);

    // advance timers so timeout fires
    vi.advanceTimersByTime(10);
    await Promise.resolve();

    expect(loggerError).toHaveBeenCalledWith(
      'ScheduleRunner.stop() timed out; continuing shutdown',
      { timeoutMs: 1 }
    );

    // cleanup
    resolveRun();
    await runPromise;
    await stopPromise;
  });

  test('list returns registered schedules', async () => {
    const { create: createScheduleRunner } = await import('@/scheduler/ScheduleRunner?v=list');
    const runner = createScheduleRunner();
    runner.register({ name: 'one', handler: () => undefined } as any);
    runner.register({ name: 'two', handler: () => undefined } as any);

    const list = runner.list();
    expect(list.map((s) => s.name).sort()).toEqual(['one', 'two']);
  });

  test('runOnce throws on unknown schedule and returns early if disabled', async () => {
    const { create: createScheduleRunner } = await import('@/scheduler/ScheduleRunner?v=run-once');
    const runner = createScheduleRunner();

    await expect(runner.runOnce('nope')).rejects.toThrow(/Schedule not found/);

    runner.register({
      name: 'off',
      handler: () => {
        throw new Error('should not run');
      },
      enabled: false,
    } as any);
    await expect(runner.runOnce('off')).resolves.toBeUndefined();
  });
});
