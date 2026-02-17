import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { Logger } from '@config/logger';
import { SchedulerLeader } from '../../../../src/scheduler/leader/SchedulerLeader';

describe('SchedulerLeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLockProviderMock.mockReset();
    vi.useFakeTimers();

    vi.stubEnv('SCHEDULE_LEADER_ENABLED', '1');
    vi.stubEnv('SCHEDULE_LEADER_LOCK_TTL_MS', '1000');
    vi.stubEnv('SCHEDULE_LEADER_LOCK_RENEW_MS', '250');
    vi.stubEnv('SCHEDULE_LEADER_LOCK_RETRY_MS', '250');
    // SchedulerLeader enforces a minimum 250ms timeout.
    vi.stubEnv('SCHEDULE_LEADER_LOCK_ACQUIRE_TIMEOUT_MS', '250');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('acquires leadership and loses it when extend returns false', async () => {
    const hooks = { onBecameLeader: vi.fn(), onLostLeadership: vi.fn() };

    const provider = {
      acquire: vi.fn(async () => ({ acquired: true })),
      release: vi.fn(async () => undefined),
      extend: vi.fn(async () => false),
    };

    getLockProviderMock.mockReturnValue(provider);

    const api = SchedulerLeader.create();
    api.start(hooks);

    // tryAcquire is async; allow it to resolve.
    await vi.advanceTimersByTimeAsync(5);
    await Promise.resolve();
    expect(hooks.onBecameLeader).toHaveBeenCalledTimes(1);

    // renew tick triggers extend -> false -> loseLeadership
    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();
    expect(hooks.onLostLeadership).toHaveBeenCalledTimes(1);

    await api.stop();
  });

  it('warns and continues when acquire times out', async () => {
    const hooks = { onBecameLeader: vi.fn(), onLostLeadership: vi.fn() };

    const provider = {
      acquire: () => new Promise(() => undefined),
      release: vi.fn(async () => undefined),
      extend: vi.fn(async () => true),
    };

    getLockProviderMock.mockReturnValue(provider);

    const api = SchedulerLeader.create();
    api.start(hooks);

    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();

    expect(hooks.onBecameLeader).not.toHaveBeenCalled();

    expect(Logger.warn).toHaveBeenCalledWith(
      'Failed to acquire scheduler leader lock',
      expect.objectContaining({ message: expect.stringContaining('timed out') })
    );
    await api.stop();
  });

  it('disables scheduling when lock provider is unavailable', async () => {
    getLockProviderMock.mockReturnValue(undefined);

    const hooks = { onBecameLeader: vi.fn(), onLostLeadership: vi.fn() };
    const api = SchedulerLeader.create();
    api.start(hooks);

    await vi.advanceTimersByTimeAsync(5);
    await Promise.resolve();

    expect(hooks.onBecameLeader).not.toHaveBeenCalled();
    expect(
      (Logger.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls.length
    ).toBeGreaterThan(0);

    await api.stop();
  });

  it('logs warning when acquire throws and stop releases best-effort', async () => {
    const hooks = { onBecameLeader: vi.fn(), onLostLeadership: vi.fn() };

    const provider = {
      acquire: vi.fn(async () => {
        throw new Error('acquire failed');
      }),
      release: vi.fn(async () => {
        throw new Error('release failed');
      }),
      extend: vi.fn(async () => true),
    };
    getLockProviderMock.mockReturnValue(provider);

    const api = SchedulerLeader.create();
    expect(api.isEnabled()).toBe(true);
    api.start(hooks);

    await vi.advanceTimersByTimeAsync(5);
    await Promise.resolve();

    expect(
      (Logger.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls.length
    ).toBeGreaterThan(0);
    await expect(api.stop()).resolves.toBeUndefined();
  });

  it('swallows release errors when stopping after leadership acquired', async () => {
    const hooks = { onBecameLeader: vi.fn(), onLostLeadership: vi.fn() };

    const provider = {
      acquire: vi.fn(async () => ({ acquired: true })),
      release: vi.fn(async () => {
        throw new Error('release failed');
      }),
      extend: vi.fn(async () => true),
    };

    getLockProviderMock.mockReturnValue(provider);

    const api = SchedulerLeader.create();
    api.start(hooks);

    await vi.advanceTimersByTimeAsync(5);
    await Promise.resolve();
    expect(hooks.onBecameLeader).toHaveBeenCalledTimes(1);

    await expect(api.stop()).resolves.toBeUndefined();
  });
});
