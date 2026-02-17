import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { Logger } from '@config/logger';
import { createScheduleRunner } from '@scheduler/index';
import type { ISchedule } from '@scheduler/types';

describe('ScheduleRunner (patch coverage extras)', () => {
  it('schedules using cron with timezone fallback and supports replacement branches', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const runner = createScheduleRunner();
    const handlerA = vi.fn(async () => undefined);
    const handlerB = vi.fn(async () => undefined);

    const scheduleA: ISchedule = {
      name: 's1',
      enabled: true,
      cron: '* * * * *',
      timezone: '',
      handler: handlerA,
    };

    runner.register(scheduleA);
    runner.start();

    // scheduleNext should fire using timezone fallback ('UTC')
    await vi.advanceTimersByTimeAsync(61_000);
    expect(handlerA).toHaveBeenCalled();

    // Replace with a disabled schedule: should clear any timer and return.
    runner.register({ ...scheduleA, enabled: false, handler: handlerB });
    handlerA.mockClear();
    handlerB.mockClear();
    await vi.advanceTimersByTimeAsync(61_000);
    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('defaults backoff factor to 2 and skips overlapping runs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const runner = createScheduleRunner();

    let resolveFirstRun: (() => void) | undefined;
    const firstRun = new Promise<void>((resolve) => {
      resolveFirstRun = resolve;
    });

    const handler = vi.fn(async () => firstRun);

    runner.register({
      name: 's2',
      enabled: true,
      runOnStart: true,
      intervalMs: 10_000,
      // factor <= 1 should default to 2
      backoff: { initialMs: 1000, maxMs: 10_000, factor: 1 },
      handler,
    });

    runner.start();

    // Let the runOnStart invocation begin.
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();

    // While the first run is still in-flight, runOnce should skip overlapping.
    await runner.runOnce('s2');
    expect(Logger.info).toHaveBeenCalledWith('Skipping overlapping run for schedule: s2');
    expect(handler).toHaveBeenCalledTimes(1);

    resolveFirstRun?.();
    await Promise.resolve();

    vi.useRealTimers();
  });

  it('uses backoff policy even when initialMs is not finite (branch) and listStates delegates to store', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const runner = createScheduleRunner();

    runner.register({
      name: 's3',
      enabled: true,
      runOnStart: true,
      intervalMs: 1000,
      backoff: { initialMs: Number.NaN, maxMs: 10_000 },
      handler: vi.fn(async () => {
        throw new Error('fail');
      }),
    });

    runner.start();
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();

    const states = await runner.listStates();
    expect(states.length).toBe(1);

    vi.useRealTimers();
  });

  it('covers replacement branch when existing is running (early return)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const runner = createScheduleRunner();

    let resolveRun: (() => void) | undefined;
    const longRun = new Promise<void>((resolve) => {
      resolveRun = resolve;
    });

    const handlerA = vi.fn(async () => longRun);
    const handlerB = vi.fn(async () => undefined);

    runner.register({
      name: 'replace-running',
      enabled: true,
      runOnStart: true,
      intervalMs: 1000,
      handler: handlerA,
    });

    runner.start();
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    expect(handlerA).toHaveBeenCalledTimes(1);

    runner.register({
      name: 'replace-running',
      enabled: true,
      runOnStart: true,
      intervalMs: 1000,
      handler: handlerB,
    });

    await vi.advanceTimersByTimeAsync(1);
    expect(handlerB).not.toHaveBeenCalled();

    resolveRun?.();
    await Promise.resolve();

    vi.useRealTimers();
  });

  it('covers replacement branch with runOnStart (immediate reschedule)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const runner = createScheduleRunner();
    const handlerA = vi.fn(async () => undefined);
    const handlerB = vi.fn(async () => undefined);

    runner.register({
      name: 'replace-runOnStart',
      enabled: true,
      runOnStart: false,
      intervalMs: 1000,
      handler: handlerA,
    });
    runner.start();

    runner.register({
      name: 'replace-runOnStart',
      enabled: true,
      runOnStart: true,
      intervalMs: 1000,
      handler: handlerB,
    });

    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    expect(handlerB).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('covers replacement branch scheduling next run when runOnStart=false', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const runner = createScheduleRunner();
    const handlerA = vi.fn(async () => undefined);
    const handlerC = vi.fn(async () => undefined);

    runner.register({
      name: 'replace-scheduleNext',
      enabled: true,
      runOnStart: false,
      intervalMs: 1000,
      handler: handlerA,
    });
    runner.start();

    runner.register({
      name: 'replace-scheduleNext',
      enabled: true,
      runOnStart: false,
      intervalMs: 10,
      handler: handlerC,
    });

    await vi.advanceTimersByTimeAsync(50);
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(handlerC).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('covers backoff factor default (<=1 -> 2) on failure outcome', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const runner = createScheduleRunner();

    runner.register({
      name: 'backoff-fail',
      enabled: true,
      runOnStart: true,
      intervalMs: 1000,
      backoff: { initialMs: 1000, maxMs: 10_000, factor: 1 },
      handler: vi.fn(async () => {
        throw new Error('fail');
      }),
    });

    runner.start();
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();

    vi.useRealTimers();
  });

  it('registering a new schedule after start schedules next run (scheduleNext branch)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const runner = createScheduleRunner();
    runner.start();

    const handler = vi.fn(async () => undefined);
    runner.register({
      name: 'post-start',
      enabled: true,
      runOnStart: false,
      intervalMs: 10,
      handler,
    });

    await vi.advanceTimersByTimeAsync(50);
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(handler).toHaveBeenCalled();

    vi.useRealTimers();
  });
});
