import type { LockProvider } from '@/types/Queue';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ZintrustLang } from '@lang/lang';
import { createAdvancedQueue } from '@queue/AdvancedQueue';
import { getLockProvider } from '@queue/LockProvider';
import type { ISchedule } from '@scheduler/types';

type WithoutOverlappingOptions = {
  provider?: string;
  ttlMs?: number;
  key?: string;
};

export type ScheduleBuilderApi = Readonly<{
  everyMinute: () => ScheduleBuilderApi;
  everyMinutes: (minutes: number) => ScheduleBuilderApi;
  everyHour: () => ScheduleBuilderApi;
  everyHours: (hours: number) => ScheduleBuilderApi;
  intervalMs: (ms: number) => ScheduleBuilderApi;
  runOnStart: () => ScheduleBuilderApi;
  enabledWhen: (value: boolean) => ScheduleBuilderApi;
  withoutOverlapping: (options?: WithoutOverlappingOptions) => ScheduleBuilderApi;
  build: () => ISchedule;
}>;

type ScheduleBuilderState = {
  name: string;
  handler: ISchedule['handler'];
  intervalMs?: number;
  enabled?: boolean;
  runOnStart?: boolean;
  overlap?: WithoutOverlappingOptions;
};

const toIntervalMs = (ms: number): number => {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms);
};

const resolveLockProvider = (providerName: string): LockProvider | undefined => {
  const name = providerName.trim().toLowerCase();
  if (name.length === 0) return undefined;

  // Ensure provider is registered. createAdvancedQueue triggers lock-provider registration.
  createAdvancedQueue({
    name: ZintrustLang.CLI_LOCKS,
    connection: undefined,
    defaultDedupTtl: Env.getInt('SCHEDULE_OVERLAP_LOCK_TTL_MS', 300000),
    lockProvider: name,
  });

  return getLockProvider(name);
};

const wrapWithoutOverlapping = (
  scheduleName: string,
  handler: ISchedule['handler'],
  options: WithoutOverlappingOptions
): ISchedule['handler'] => {
  const providerName = (options.provider ?? 'redis').trim();
  const lockKey = (options.key ?? `schedule:${scheduleName}`).trim();
  const ttlMs = Env.getInt('SCHEDULE_OVERLAP_LOCK_TTL_MS', options.ttlMs ?? 300000);
  const acquireTimeoutMs = Env.getInt('SCHEDULE_OVERLAP_LOCK_ACQUIRE_TIMEOUT_MS', 2000);

  const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutId = globalThis.setTimeout(() => {
            // eslint-disable-next-line no-restricted-syntax
            reject(new Error('Lock acquire timed out'));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
    }
  };

  return async (kernel) => {
    const provider = resolveLockProvider(providerName);
    if (!provider) {
      Logger.warn(
        'Schedule withoutOverlapping requested but lock provider not available; running anyway',
        {
          schedule: scheduleName,
          provider: providerName,
        }
      );
      await handler(kernel);
      return;
    }

    let lock: Awaited<ReturnType<LockProvider['acquire']>>;
    try {
      lock = await withTimeout(provider.acquire(lockKey, { ttl: ttlMs }), acquireTimeoutMs);
    } catch (error) {
      Logger.warn('Schedule lock acquire failed; running anyway', {
        schedule: scheduleName,
        provider: providerName,
        timeoutMs: acquireTimeoutMs,
        message: error instanceof Error ? error.message : String(error),
      });
      await handler(kernel);
      return;
    }
    if (!lock.acquired) {
      Logger.info(`Skipping overlapping run for schedule: ${scheduleName}`);
      return;
    }

    try {
      await handler(kernel);
    } finally {
      try {
        await provider.release(lock);
      } catch {
        // best-effort
      }
    }
  };
};

export const Schedule = Object.freeze({
  define(name: string, handler: ISchedule['handler']): ScheduleBuilderApi {
    return ScheduleBuilder.create({ name, handler });
  },
});

export const ScheduleBuilder = Object.freeze({
  create(input: { name: string; handler: ISchedule['handler'] }): ScheduleBuilderApi {
    const state: ScheduleBuilderState = {
      name: input.name,
      handler: input.handler,
    };

    const api: ScheduleBuilderApi = Object.freeze({
      everyMinute: () => api.everyMinutes(1),
      everyMinutes: (minutes: number) => {
        const resolved = Math.max(1, Math.floor(minutes));
        state.intervalMs = resolved * 60_000;
        return api;
      },
      everyHour: () => api.everyHours(1),
      everyHours: (hours: number) => {
        const resolved = Math.max(1, Math.floor(hours));
        state.intervalMs = resolved * 3_600_000;
        return api;
      },
      intervalMs: (ms: number) => {
        state.intervalMs = toIntervalMs(ms);
        return api;
      },
      runOnStart: () => {
        state.runOnStart = true;
        return api;
      },
      enabledWhen: (value: boolean) => {
        state.enabled = value;
        return api;
      },
      withoutOverlapping: (options?: WithoutOverlappingOptions) => {
        state.overlap = options ?? {};
        return api;
      },
      build: () => {
        const handler =
          state.overlap === undefined
            ? state.handler
            : wrapWithoutOverlapping(state.name, state.handler, state.overlap);

        const schedule: ISchedule = {
          name: state.name,
          intervalMs: state.intervalMs,
          handler,
          enabled: state.enabled,
          runOnStart: state.runOnStart,
        };

        return schedule;
      },
    });

    return api;
  },
});

export default Schedule;
