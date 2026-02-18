import type { LockProvider } from '@/types/Queue';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ZintrustLang } from '@lang/lang';
import { createAdvancedQueue } from '@queue/AdvancedQueue';
import { getLockProvider } from '@queue/LockProvider';
import type { ISchedule, IScheduleBackoffPolicy } from '@scheduler/types';

type CronOptions = {
  timezone?: string;
};

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
  cron: (expr: string, options?: CronOptions) => ScheduleBuilderApi;
  timezone: (tz: string) => ScheduleBuilderApi;
  jitterMs: (ms: number) => ScheduleBuilderApi;
  backoff: (policy: IScheduleBackoffPolicy) => ScheduleBuilderApi;
  leaderOnly: () => ScheduleBuilderApi;
  runOnStart: () => ScheduleBuilderApi;
  enabledWhen: (value: boolean) => ScheduleBuilderApi;
  withoutOverlapping: (options?: WithoutOverlappingOptions) => ScheduleBuilderApi;
  build: () => ISchedule;
}>;

type ScheduleBuilderState = {
  name: string;
  handler: ISchedule['handler'];
  intervalMs?: number;
  cron?: string;
  timezone?: string;
  jitterMs?: number;
  backoff?: IScheduleBackoffPolicy;
  leaderOnly?: boolean;
  enabled?: boolean;
  runOnStart?: boolean;
  overlap?: WithoutOverlappingOptions;
};

const toIntervalMs = (ms: number): number => {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms);
};

const normalizeOptionalString = (value: unknown): string | undefined => {
  const s = typeof value === 'string' ? value.trim() : '';
  return s.length > 0 ? s : undefined;
};

const toPositiveInt = (value: unknown): number | undefined => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
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

const normalizeBackoffFactor = (factor: unknown): number | undefined => {
  if (factor === undefined) return undefined;
  return Number.isFinite(factor) ? (factor as number) : undefined;
};

const wrapWithoutOverlapping = (
  scheduleName: string,
  handler: ISchedule['handler'],
  options: WithoutOverlappingOptions
): ISchedule['handler'] => {
  const providerName = (options.provider ?? 'memory').trim();
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

const createScheduleApi = (state: ScheduleBuilderState): ScheduleBuilderApi => {
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
    cron: (expr: string, options?: CronOptions) => {
      state.cron = normalizeOptionalString(expr);
      if (options?.timezone !== undefined) {
        state.timezone = normalizeOptionalString(options.timezone);
      }
      return api;
    },
    timezone: (tz: string) => {
      state.timezone = normalizeOptionalString(tz);
      return api;
    },
    jitterMs: (ms: number) => {
      state.jitterMs = toPositiveInt(ms);
      return api;
    },
    backoff: (policy: IScheduleBackoffPolicy) => {
      state.backoff = {
        initialMs: toPositiveInt(policy.initialMs) ?? 0,
        maxMs: toPositiveInt(policy.maxMs) ?? 0,
        factor: normalizeBackoffFactor(policy.factor),
      };
      return api;
    },
    leaderOnly: () => {
      state.leaderOnly = true;
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
        cron: state.cron,
        timezone: state.timezone,
        jitterMs: state.jitterMs,
        backoff: state.backoff,
        leaderOnly: state.leaderOnly,
        handler,
        enabled: state.enabled,
        runOnStart: state.runOnStart,
      };

      return schedule;
    },
  });

  return api;
};

export const ScheduleBuilder = Object.freeze({
  create(input: { name: string; handler: ISchedule['handler'] }): ScheduleBuilderApi {
    const state: ScheduleBuilderState = {
      name: input.name,
      handler: input.handler,
    };

    return createScheduleApi(state);
  },
});

export default Schedule;
