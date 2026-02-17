import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { create as createRunner } from '@/scheduler/ScheduleRunner';

describe('ScheduleRunner backoff/jitter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('applies backoff after failure and resets on success', async () => {
    const runner = createRunner();
    let calls = 0;

    runner.register({
      name: 'b.test',
      intervalMs: 100,
      backoff: { initialMs: 1000, maxMs: 1000, factor: 2 },
      handler: async () => {
        calls++;
        if (calls === 1) throw new Error('boom');
      },
    } as any);

    runner.start();

    // first run at +100ms (fails)
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    expect(calls).toBe(1);

    const s1 = await runner.getState('b.test');
    expect(s1?.consecutiveFailures).toBe(1);
    expect(s1?.nextRunAt).toBe(Date.now() + 1000);

    // backoff run at +1000ms from failure time
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();
    expect(calls).toBe(2);

    const s2 = await runner.getState('b.test');
    expect(s2?.consecutiveFailures).toBe(0);
    expect(s2?.nextRunAt).toBe(Date.now() + 100);

    await runner.stop();
  });

  it('adds jitter to interval scheduling', async () => {
    // Use near-1 random value so randomInt() hits max jitter.
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);

    const runner = createRunner();
    let calls = 0;

    runner.register({
      name: 'j.test',
      intervalMs: 100,
      jitterMs: 50,
      handler: async () => {
        calls++;
      },
    } as any);

    runner.start();

    const s0 = await runner.getState('j.test');
    // initial nextRunAt is scheduled on start()
    expect(s0?.nextRunAt).toBe(Date.now() + 150);

    await vi.advanceTimersByTimeAsync(150);
    await Promise.resolve();
    expect(calls).toBe(1);

    const s1 = await runner.getState('j.test');
    expect(s1?.nextRunAt).toBe(Date.now() + 150);

    await runner.stop();
  });
});
