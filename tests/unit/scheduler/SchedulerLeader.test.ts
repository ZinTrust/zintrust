import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const envGetBool = vi.fn();
const envGet = vi.fn();
const envGetInt = vi.fn();

vi.mock('@config/env', () => ({
  Env: {
    getBool: (...args: any[]) => envGetBool(...args),
    get: (...args: any[]) => envGet(...args),
    getInt: (...args: any[]) => envGetInt(...args),
  },
}));

vi.mock('@queue/AdvancedQueue', () => ({
  createAdvancedQueue: vi.fn(() => ({
    enqueue: vi.fn(),
  })),
}));

const acquire = vi.fn();
const release = vi.fn();
const extend = vi.fn();

vi.mock('@queue/LockProvider', () => ({
  getLockProvider: vi.fn(() => ({ acquire, release, extend })),
}));

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('SchedulerLeader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();

    envGetBool.mockImplementation((key: string, fallback?: boolean) => {
      if (key === 'SCHEDULE_LEADER_ENABLED') return true;
      return fallback ?? false;
    });

    envGet.mockImplementation((_key: string, fallback?: string) => fallback ?? '');

    envGetInt.mockImplementation((key: string, fallback?: number) => {
      if (key === 'SCHEDULE_LEADER_LOCK_TTL_MS') return 1000;
      if (key === 'SCHEDULE_LEADER_LOCK_RENEW_MS') return 200;
      if (key === 'SCHEDULE_LEADER_LOCK_RETRY_MS') return 200;
      if (key === 'SCHEDULE_LEADER_LOCK_ACQUIRE_TIMEOUT_MS') return 200;
      return fallback ?? 0;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('acquires leadership and calls hooks; loses leadership when renewal fails', async () => {
    acquire
      .mockResolvedValueOnce({
        key: 'test:scheduler:leader',
        ttl: 1000,
        acquired: true,
        expires: new Date(),
      })
      .mockResolvedValue({
        key: 'test:scheduler:leader',
        ttl: 1000,
        acquired: false,
        expires: new Date(),
      });
    extend.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const { SchedulerLeader } = await import('@/scheduler/leader/SchedulerLeader');

    const leader = SchedulerLeader.create();
    const onBecameLeader = vi.fn();
    const onLostLeadership = vi.fn();

    leader.start({ onBecameLeader, onLostLeadership });

    // Acquire runs in a best-effort background attempt + retry loop; advance time to trigger at least one attempt.
    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(onBecameLeader).toHaveBeenCalledTimes(1);

    // advance time to trigger renewal loop (first extend ok, second fails)
    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();

    expect(onLostLeadership).toHaveBeenCalledTimes(1);

    await leader.stop();
  });
});
