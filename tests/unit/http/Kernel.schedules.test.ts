import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Kernel } from '@/http/Kernel';
import { Router } from '@routing/Router';

describe('Kernel schedules integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers, starts, and stops schedules', async () => {
    const kernel = Kernel.create(Router.createRouter(), {} as any);

    let runs = 0;

    kernel.registerSchedule({
      name: 'k.test',
      intervalMs: 10,
      handler: async () => {
        runs++;
      },
    });

    kernel.startSchedules();

    await vi.advanceTimersByTimeAsync(10);
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(10);
    await Promise.resolve();

    expect(runs).toBeGreaterThanOrEqual(2);

    await kernel.stopSchedules();

    const prev = runs;
    vi.advanceTimersByTime(50);
    expect(runs).toBe(prev);
  });
});
