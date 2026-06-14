import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { create as createRunner } from '@/scheduler/ScheduleRunner';
import { InMemoryScheduleStateStore } from '@/scheduler/state/ScheduleStateStore';
import type { ISchedule } from '@/scheduler/types';

describe('ScheduleRunner.runIfDue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs on first invocation when no last-run state exists', async () => {
    const runner = createRunner();
    let calls = 0;
    const schedule: ISchedule = {
      name: 'hourly',
      intervalMs: 60 * 60 * 1000,
      handler: async () => {
        calls++;
      },
    };
    runner.register(schedule);

    const result = await runner.runIfDue('hourly');

    expect(result.ran).toBe(true);
    expect(calls).toBe(1);
  });

  it('skips when an interval schedule is not yet due', async () => {
    const runner = createRunner();
    let calls = 0;
    const schedule: ISchedule = {
      name: 'hourly',
      intervalMs: 60 * 60 * 1000, // 1 hour
      handler: async () => {
        calls++;
      },
    };
    runner.register(schedule);

    // First tick runs and records lastRunAt.
    await runner.runIfDue('hourly');
    expect(calls).toBe(1);

    // Second tick 5 minutes later — NOT due for an hourly schedule.
    const result = await runner.runIfDue('hourly');

    expect(result.ran).toBe(false);
    expect(result.reason).toBe('not-due');
    expect(typeof result.nextRunAt).toBe('number');
    expect(calls).toBe(1); // handler not invoked again
  });

  it('runs again once the interval has elapsed', async () => {
    vi.useFakeTimers();
    const runner = createRunner();
    let calls = 0;
    const schedule: ISchedule = {
      name: 'every-min',
      intervalMs: 60 * 1000, // 1 minute
      handler: async () => {
        calls++;
      },
    };
    runner.register(schedule);

    await runner.runIfDue('every-min');
    expect(calls).toBe(1);

    // Advance past the interval.
    vi.advanceTimersByTime(61 * 1000);

    const result = await runner.runIfDue('every-min');
    expect(result.ran).toBe(true);
    expect(calls).toBe(2);
  });

  it('honours persisted lastRunAt from an injected (durable) store across runner instances', async () => {
    // Simulate two separate cold starts sharing one persistent store.
    const sharedStore = InMemoryScheduleStateStore.create();

    const makeSchedule = (counter: { n: number }): ISchedule => ({
      name: 'hourly',
      intervalMs: 60 * 60 * 1000,
      handler: async () => {
        counter.n++;
      },
    });

    // Cold start #1
    const counter = { n: 0 };
    const runnerA = createRunner(sharedStore);
    runnerA.register(makeSchedule(counter));
    const first = await runnerA.runIfDue('hourly');
    expect(first.ran).toBe(true);
    expect(counter.n).toBe(1);

    // Cold start #2 — fresh runner, fresh in-memory state, SAME durable store.
    const runnerB = createRunner(sharedStore);
    runnerB.register(makeSchedule(counter));
    const second = await runnerB.runIfDue('hourly');

    // Must NOT run again: the durable store remembers the recent run.
    expect(second.ran).toBe(false);
    expect(second.reason).toBe('not-due');
    expect(counter.n).toBe(1);
  });

  it('skips disabled schedules', async () => {
    const runner = createRunner();
    let calls = 0;
    runner.register({
      name: 'off',
      intervalMs: 1000,
      enabled: false,
      handler: async () => {
        calls++;
      },
    });

    const result = await runner.runIfDue('off');
    expect(result.ran).toBe(false);
    expect(result.reason).toBe('disabled');
    expect(calls).toBe(0);
  });

  it('throws for unknown schedules', async () => {
    const runner = createRunner();
    await expect(runner.runIfDue('does-not-exist')).rejects.toThrow(/not found/i);
  });

  it('setStore swaps the durable backend used by runIfDue', async () => {
    const runner = createRunner();
    const durable = InMemoryScheduleStateStore.create();
    // Pre-seed a recent run so the schedule is NOT due.
    await durable.set('hourly', { lastSuccessAt: Date.now() });

    runner.setStore(durable);
    let calls = 0;
    runner.register({
      name: 'hourly',
      intervalMs: 60 * 60 * 1000,
      handler: async () => {
        calls++;
      },
    });

    const result = await runner.runIfDue('hourly');
    expect(result.ran).toBe(false);
    expect(result.reason).toBe('not-due');
    expect(calls).toBe(0);
  });
});
