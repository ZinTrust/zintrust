import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { create as createRunner } from '@/scheduler/ScheduleRunner';
import type { ISchedule } from '@/scheduler/types';

describe('ScheduleRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs registered interval schedules and stops them on stop()', async () => {
    const runner = createRunner();

    let callCount = 0;
    const schedule: ISchedule = {
      name: 'test.interval',
      intervalMs: 10,
      handler: async () => {
        callCount++;
      },
    };

    runner.register(schedule);
    runner.start();

    // advance timers in time slices so async handlers have time to complete
    await vi.advanceTimersByTimeAsync(10);
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(10);
    await Promise.resolve();

    expect(callCount).toBeGreaterThanOrEqual(2);

    await runner.stop();

    const prevCount = callCount;
    vi.advanceTimersByTime(50);
    expect(callCount).toBe(prevCount);
  });

  it('prevents overlapping runs', async () => {
    const runner = createRunner();

    let concurrent = 0;
    let maxConcurrent = 0;

    // Use a controllable promise to make the test deterministic with fake timers
    let resolveLongTask: (() => void) | undefined;
    const longTask = () =>
      new Promise<void>((r) => {
        resolveLongTask = r;
      });

    const schedule: ISchedule = {
      name: 'test.overlap',
      intervalMs: 10,
      handler: async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await longTask();
        concurrent--;
      },
    };

    runner.register(schedule);
    runner.start();

    // Trigger first interval
    await vi.advanceTimersByTimeAsync(10);
    await Promise.resolve();

    // Trigger second interval while first is still running
    await vi.advanceTimersByTimeAsync(10);
    await Promise.resolve();

    // Resolve the long task to allow handler to finish
    resolveLongTask?.();
    await Promise.resolve();

    expect(maxConcurrent).toBe(1); // never ran concurrently

    await runner.stop();
  });

  it('runOnce executes handler immediately', async () => {
    const runner = createRunner();
    let called = false;
    runner.register({
      name: 'run.once',
      handler: async () => {
        called = true;
      },
    });

    await runner.runOnce('run.once');
    expect(called).toBe(true);
  });

  it('runOnce throws for unknown schedule', async () => {
    const runner = createRunner();
    await expect(runner.runOnce('missing')).rejects.toThrow(/Schedule not found/);
  });

  it('logs errors and continues', async () => {
    const runner = createRunner();
    const err = new Error('boom');
    const failing: ISchedule = {
      name: 'failer',
      intervalMs: 10,
      handler: async () => {
        throw err;
      },
    };
    runner.register(failing);

    runner.start();
    vi.advanceTimersByTime(20);

    const { Logger } = await import('@config/logger');
    expect((Logger.error as unknown as Mock).mock.calls.length).toBeGreaterThan(0);

    await runner.stop();
  });
});
