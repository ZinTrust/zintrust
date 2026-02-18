import type { Lock, LockProvider } from '@/types/Queue';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { ZintrustLang } from '@lang/lang';
import { createAdvancedQueue } from '@queue/AdvancedQueue';
import { getLockProvider } from '@queue/LockProvider';

type LeaderSettings = Readonly<{
  enabled: boolean;
  provider: string;
  key: string;
  ttlMs: number;
  renewEveryMs: number;
  retryEveryMs: number;
  acquireTimeoutMs: number;
}>;

const readSettings = (): LeaderSettings => {
  const enabled = Env.getBool('SCHEDULE_LEADER_ENABLED', false);

  const provider = Env.get('SCHEDULE_LEADER_LOCK_PROVIDER', 'memory').trim() || 'memory';
  const key = Env.get('SCHEDULE_LEADER_LOCK_KEY', 'scheduler:leader').trim() || 'scheduler:leader';

  const ttlMs = Env.getInt('SCHEDULE_LEADER_LOCK_TTL_MS', 30000);
  const renewEveryMs = Env.getInt('SCHEDULE_LEADER_LOCK_RENEW_MS', Math.floor(ttlMs / 2));
  const retryEveryMs = Env.getInt('SCHEDULE_LEADER_LOCK_RETRY_MS', 5000);
  const acquireTimeoutMs = Env.getInt('SCHEDULE_LEADER_LOCK_ACQUIRE_TIMEOUT_MS', 2000);

  return Object.freeze({
    enabled,
    provider,
    key,
    ttlMs: Math.max(1000, ttlMs),
    renewEveryMs: Math.max(250, renewEveryMs),
    retryEveryMs: Math.max(250, retryEveryMs),
    acquireTimeoutMs: Math.max(250, acquireTimeoutMs),
  });
};

const isUnrefableTimer = (timer: unknown): timer is { unref: () => void } => {
  return (
    typeof timer === 'object' &&
    timer !== null &&
    'unref' in timer &&
    typeof timer.unref === 'function'
  );
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = globalThis.setTimeout(() => {
          reject(
            ErrorFactory.createConnectionError('Leader lock acquire timed out', { timeoutMs })
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
  }
};

const resolveProvider = (providerName: string, ttlMs: number): LockProvider | null => {
  const name = providerName.trim().toLowerCase();
  if (name.length === 0) return null;

  // Ensure provider is registered; AdvancedQueue wiring bootstraps lock providers.
  createAdvancedQueue({
    name: ZintrustLang.CLI_LOCKS,
    connection: undefined,
    defaultDedupTtl: ttlMs,
    lockProvider: name,
  });

  return getLockProvider(name) ?? null;
};

export type SchedulerLeaderHooks = Readonly<{
  onBecameLeader: () => void;
  onLostLeadership: () => void;
}>;

export type SchedulerLeaderApi = Readonly<{
  isEnabled: () => boolean;
  start: (hooks: SchedulerLeaderHooks) => void;
  stop: () => Promise<void>;
}>;

type LeaderInternalState = {
  started: boolean;
  leaderLock: Lock | null;
  provider: LockProvider | null;
  renewTimer?: ReturnType<typeof globalThis.setInterval>;
  retryTimer?: ReturnType<typeof globalThis.setInterval>;
  hooks: SchedulerLeaderHooks | null;
};

const clearTimers = (state: LeaderInternalState): void => {
  if (state.renewTimer !== undefined) {
    globalThis.clearInterval(state.renewTimer);
    state.renewTimer = undefined;
  }
  if (state.retryTimer !== undefined) {
    globalThis.clearInterval(state.retryTimer);
    state.retryTimer = undefined;
  }
};

const loseLeadership = (state: LeaderInternalState): void => {
  if (state.leaderLock !== null) {
    Logger.warn('Scheduler leadership lost; stopping schedules');
  }
  state.leaderLock = null;
  state.hooks?.onLostLeadership();
};

const ensureProvider = (
  state: LeaderInternalState,
  settings: LeaderSettings
): LockProvider | null => {
  if (state.provider !== null) return state.provider;

  state.provider = resolveProvider(settings.provider, settings.ttlMs);
  if (state.provider === null) {
    Logger.warn('Leader lock provider not available; scheduling disabled', {
      provider: settings.provider,
    });
  }
  return state.provider;
};

const tryAcquire = async (state: LeaderInternalState, settings: LeaderSettings): Promise<void> => {
  if (!state.started) return;
  if (state.leaderLock !== null) return;

  const provider = ensureProvider(state, settings);
  if (provider === null) return;

  try {
    const lock = await withTimeout(
      provider.acquire(settings.key, { ttl: settings.ttlMs }),
      settings.acquireTimeoutMs
    );

    if (!lock.acquired) return;

    state.leaderLock = lock;
    Logger.info('Scheduler leadership acquired', { key: settings.key, ttlMs: settings.ttlMs });
    state.hooks?.onBecameLeader();
  } catch (error) {
    Logger.warn('Failed to acquire scheduler leader lock', {
      key: settings.key,
      provider: settings.provider,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

const startRenewLoop = (state: LeaderInternalState, settings: LeaderSettings): void => {
  if (state.renewTimer !== undefined) return;

  state.renewTimer = globalThis.setInterval(async () => {
    if (!state.started) return;
    if (state.leaderLock === null || state.provider === null) return;

    const ok = await state.provider.extend(state.leaderLock, settings.ttlMs);
    if (!ok) loseLeadership(state);
  }, settings.renewEveryMs);

  if (isUnrefableTimer(state.renewTimer)) state.renewTimer.unref();
};

const startRetryLoop = (state: LeaderInternalState, settings: LeaderSettings): void => {
  if (state.retryTimer !== undefined) return;

  state.retryTimer = globalThis.setInterval(() => {
    void tryAcquire(state, settings);
  }, settings.retryEveryMs);

  if (isUnrefableTimer(state.retryTimer)) state.retryTimer.unref();
};

export const SchedulerLeader = Object.freeze({
  create(): SchedulerLeaderApi {
    const state: LeaderInternalState = {
      started: false,
      leaderLock: null,
      provider: null,
      renewTimer: undefined,
      retryTimer: undefined,
      hooks: null,
    };

    return Object.freeze({
      isEnabled(): boolean {
        return readSettings().enabled;
      },

      start(newHooks: SchedulerLeaderHooks): void {
        const settings = readSettings();
        if (!settings.enabled) return;
        if (state.started) return;

        state.started = true;
        state.hooks = newHooks;
        state.provider = null;

        // Attempt immediately; keep retrying until acquired.
        void tryAcquire(state, settings);
        startRetryLoop(state, settings);
        startRenewLoop(state, settings);
      },

      async stop(): Promise<void> {
        if (!state.started) return;
        state.started = false;

        clearTimers(state);

        if (state.leaderLock !== null && state.provider !== null) {
          try {
            await state.provider.release(state.leaderLock);
          } catch {
            // best-effort
          }
        }

        state.leaderLock = null;
        state.provider = null;
        state.hooks = null;
      },
    });
  },
});

export default SchedulerLeader;
