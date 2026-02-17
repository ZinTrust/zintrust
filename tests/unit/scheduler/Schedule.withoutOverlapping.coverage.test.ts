import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@queue/AdvancedQueue', () => ({
  createAdvancedQueue: vi.fn(() => ({ enqueue: vi.fn() })),
}));

const getLockProviderMock = vi.fn();
vi.mock('@queue/LockProvider', () => ({
  getLockProvider: (...args: unknown[]) => getLockProviderMock(...args),
}));

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { Schedule } from '../../../src/scheduler/Schedule';

describe('Schedule.withoutOverlapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLockProviderMock.mockReset();
    vi.useFakeTimers();
  });

  it('runs handler when provider is unavailable', async () => {
    getLockProviderMock.mockReturnValue(undefined);

    const handler = vi.fn(async () => undefined);
    const schedule = Schedule.define('s1', handler)
      .withoutOverlapping({ provider: 'redis' })
      .build();

    await schedule.handler(undefined as any);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('runs handler when lock acquire times out', async () => {
    getLockProviderMock.mockReturnValue({
      acquire: () => new Promise(() => undefined),
      release: vi.fn(async () => undefined),
      extend: vi.fn(async () => true),
    });

    vi.stubEnv('SCHEDULE_OVERLAP_LOCK_ACQUIRE_TIMEOUT_MS', '1');

    const handler = vi.fn(async () => undefined);
    const schedule = Schedule.define('s2', handler).withoutOverlapping({ ttlMs: 10 }).build();

    const p = schedule.handler(undefined as any);
    await vi.advanceTimersByTimeAsync(10);
    await p;

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('skips handler when lock is not acquired', async () => {
    getLockProviderMock.mockReturnValue({
      acquire: vi.fn(async () => ({ acquired: false })),
      release: vi.fn(async () => undefined),
      extend: vi.fn(async () => true),
    });

    const handler = vi.fn(async () => undefined);
    const schedule = Schedule.define('s3', handler).withoutOverlapping().build();

    await schedule.handler(undefined as any);
    expect(handler).toHaveBeenCalledTimes(0);
  });

  it('releases lock best-effort (release errors are swallowed)', async () => {
    getLockProviderMock.mockReturnValue({
      acquire: vi.fn(async () => ({ acquired: true })),
      release: vi.fn(async () => {
        throw new Error('release failed');
      }),
      extend: vi.fn(async () => true),
    });

    const handler = vi.fn(async () => undefined);
    const schedule = Schedule.define('s4', handler).withoutOverlapping().build();

    await expect(schedule.handler(undefined as any)).resolves.toBeUndefined();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
