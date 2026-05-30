/**
 * Queue Monitor - Runtime-only entrypoint for production Workers
 * Excludes dashboard UI components that are not needed for runtime
 */

import { queueConfig } from '@zintrust/core/config';
import { Logger } from '@zintrust/core/logger';
import { resolveLockPrefix } from '@zintrust/core/queue';
import { isNonEmptyString } from '@zintrust/core/utils';
import { ShutdownTrace } from '@zintrust/core/workers';
import { createRedisConnection, type RedisConfig } from './connection.js';
import { createBullMQDriver, type QueueDriver } from './driver.js';
import { createMetrics, type Metrics } from './metrics.js';

export type { JobPayload } from './driver.js';
export { createMetrics, type JobStatus, type JobSummary, type Metrics } from './metrics.js';
export { createWorker as createQueueWorker, type QueueWorker } from './worker.js';

export type QueueMonitorConfig = {
  enabled?: boolean;
  basePath?: string;
  middleware?: ReadonlyArray<string>;
  autoRefresh?: boolean;
  refreshIntervalMs?: number;
  redis?: RedisConfig;
  knownQueues?:
    | ReadonlyArray<string>
    | (() => Promise<ReadonlyArray<string>> | ReadonlyArray<string>);
};

export type QueueCounts = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
};

export type QueueMonitorSnapshot = {
  status: 'ok';
  startedAt: string;
  queues: Array<{
    name: string;
    counts: QueueCounts;
  }>;
};

export type LockSummary = {
  key: string;
  ttl?: number;
  expires?: string;
};

export type LockMetrics = {
  active: number;
  attempts: number;
  acquired: number;
  collisions: number;
  collisionRate: number;
};

export type LockHistogramBucket = {
  label: string;
  count: number;
};

export type LockAnalytics = {
  locks: LockSummary[];
  metrics: LockMetrics;
  histogram: LockHistogramBucket[];
};

export type QueueMonitorApi = {
  getSnapshot: () => Promise<QueueMonitorSnapshot>;
  getLocks: (pattern?: string) => Promise<LockAnalytics>;
  driver: QueueDriver;
  metrics: Metrics;
  close: () => Promise<void>;
};

const DEFAULTS = {
  enabled: true,
  basePath: '/queue-monitor',
  middleware: [],
  autoRefresh: true,
  refreshIntervalMs: 5000,
};

const METRICS_KEYS = {
  attempts: 'metrics:attempts',
  acquired: 'metrics:acquired',
  collisions: 'metrics:collisions',
} as const;

const HISTOGRAM_BUCKETS: Array<{ label: string; min?: number; max?: number }> = [
  { label: '<30s', max: 30_000 },
  { label: '30s-2m', max: 120_000 },
  { label: '2-10m', max: 600_000 },
  { label: '10-60m', max: 3_600_000 },
  { label: '>60m', min: 3_600_000 },
];

const MAX_LOCK_KEYS = 10_000;

function normalizeQueueNames(queueNames: ReadonlyArray<unknown>): string[] {
  return Array.from(
    new Set(
      queueNames
        .filter(
          (queueName): queueName is string =>
            typeof queueName === 'string' && isNonEmptyString(queueName)
        )
        .map((name) => name.trim())
    )
  )
    .filter((name) => name.length > 0)
    .sort((left, right) => left.localeCompare(right));
}

async function resolveKnownQueues(
  knownQueues:
    | ReadonlyArray<string>
    | (() => Promise<ReadonlyArray<string>> | ReadonlyArray<string>)
    | undefined
): Promise<string[]> {
  if (typeof knownQueues === 'function') {
    return normalizeQueueNames(await knownQueues());
  }

  if (Array.isArray(knownQueues)) {
    return normalizeQueueNames(knownQueues);
  }

  return [];
}

// Helper function to scan lock keys with pagination
const scanLockKeys = async (
  client: ReturnType<typeof createRedisConnection>,
  searchPattern: string,
  maxKeys: number
): Promise<string[]> => {
  const keys: string[] = [];
  let cursor = '0';

  do {
    // Redis scan must be sequential
    // eslint-disable-next-line no-await-in-loop
    const [nextCursor, batch] = await client.scan(cursor, 'MATCH', searchPattern, 'COUNT', '200');
    cursor = nextCursor;
    keys.push(...batch);

    if (keys.length >= maxKeys) {
      Logger.warn('Lock scan limit reached', {
        pattern: searchPattern,
        keysFound: keys.length,
      });
      break;
    }
  } while (cursor !== '0');

  return keys;
};

// Helper function to get TTL statuses for keys
const getLockStatuses = async (
  client: ReturnType<typeof createRedisConnection>,
  keys: string[]
): Promise<number[]> => {
  return Promise.all(keys.map((key) => client.pttl(key)));
};

// Helper function to build lock objects from keys and statuses
const buildLockObjects = (
  keys: string[],
  statuses: number[],
  prefixLock: string
): Array<{ key: string; ttl?: number; expires?: string }> => {
  return keys.map((key, index) => {
    const ttl = statuses[index];
    const exists = typeof ttl === 'number' && ttl > 0;
    return {
      key: key.replace(prefixLock, ''),
      ttl: exists ? ttl : undefined,
      expires: exists ? new Date(Date.now() + ttl).toISOString() : undefined,
    };
  });
};

// Helper function to calculate lock metrics
const calculateLockMetrics = async (
  client: ReturnType<typeof createRedisConnection>,
  prefixLock: string
): Promise<{ attempts: number; acquired: number; collisions: number; collisionRate: number }> => {
  const metricsKeys = [
    `${prefixLock}${METRICS_KEYS.attempts}`,
    `${prefixLock}${METRICS_KEYS.acquired}`,
    `${prefixLock}${METRICS_KEYS.collisions}`,
  ];
  const [attemptsRaw, acquiredRaw, collisionsRaw] = await client.mget(...metricsKeys);

  const parseMetric = (value: string | null): number =>
    Number.isFinite(Number(value)) ? Number(value) : 0;

  const attempts = parseMetric(attemptsRaw);
  const acquired = parseMetric(acquiredRaw);
  const collisions = parseMetric(collisionsRaw);
  const collisionRate = attempts > 0 ? collisions / attempts : 0;

  return { attempts, acquired, collisions, collisionRate };
};

// Helper function to build histogram from locks
const buildLockHistogram = (locks: Array<{ ttl?: number }>): LockHistogramBucket[] => {
  const histogram: LockHistogramBucket[] = HISTOGRAM_BUCKETS.map((bucket) => ({
    label: bucket.label,
    count: 0,
  }));

  locks.forEach((lock) => {
    if (typeof lock.ttl !== 'number') return;
    const ttl = lock.ttl;
    const idx = HISTOGRAM_BUCKETS.findIndex((bucket) => {
      if (typeof bucket.min === 'number') return ttl >= bucket.min;
      if (typeof bucket.max === 'number') return ttl < bucket.max;
      return false;
    });
    if (idx >= 0) histogram[idx].count += 1;
  });

  return histogram;
};

function createGetLocks(redisConfig: RedisConfig) {
  return async (pattern: string = '*'): Promise<LockAnalytics> => {
    const client = createRedisConnection(redisConfig, 3, { subsystem: 'queue-monitor-locks' });
    const prefix_lock = resolveLockPrefix();
    const searchPattern = `${prefix_lock}${pattern}`;

    try {
      // Scan for lock keys
      const keys = await scanLockKeys(client, searchPattern, MAX_LOCK_KEYS);

      // Get TTL statuses
      const statuses = await getLockStatuses(client, keys);

      // Build lock objects
      const locks = buildLockObjects(keys, statuses, prefix_lock);

      // Calculate metrics
      const metrics = await calculateLockMetrics(client, prefix_lock);

      // Build histogram
      const histogram = buildLockHistogram(locks);

      return {
        locks,
        metrics: {
          active: locks.length,
          ...metrics,
        },
        histogram,
      };
    } finally {
      if (typeof client.quit === 'function') {
        await client.quit();
      } else if (typeof client.disconnect === 'function') {
        client.disconnect();
      }
    }
  };
}

function buildSettings(config: QueueMonitorConfig): {
  enabled: boolean;
  basePath: string;
  middleware: ReadonlyArray<string>;
  autoRefresh: boolean;
  refreshIntervalMs: number;
} {
  return {
    enabled: config.enabled ?? DEFAULTS.enabled,
    basePath: config.basePath ?? DEFAULTS.basePath,
    middleware: config.middleware ?? DEFAULTS.middleware,
    autoRefresh: config.autoRefresh ?? DEFAULTS.autoRefresh,
    refreshIntervalMs:
      typeof config.refreshIntervalMs === 'number' && Number.isFinite(config.refreshIntervalMs)
        ? Math.max(1000, Math.floor(config.refreshIntervalMs))
        : DEFAULTS.refreshIntervalMs,
  };
}

function createGetSnapshot(
  driver: QueueDriver,
  startedAt: string,
  knownQueues:
    | ReadonlyArray<string>
    | (() => Promise<ReadonlyArray<string>> | ReadonlyArray<string>)
    | undefined
) {
  return async (): Promise<QueueMonitorSnapshot> => {
    const [discoveredQueues, persistedQueues] = await Promise.all([
      driver.getQueues(),
      resolveKnownQueues(knownQueues),
    ]);
    const queues = Array.from(new Set([...persistedQueues, ...discoveredQueues])).sort(
      (left, right) => left.localeCompare(right)
    );
    const stats = await Promise.all(
      queues.map(async (name) => {
        const counts = await driver.getJobCounts(name);
        return { name, counts: counts as unknown as QueueCounts };
      })
    );

    return {
      status: 'ok',
      startedAt,
      queues: stats,
    };
  };
}

export const QueueMonitor = Object.freeze({
  create(config: QueueMonitorConfig): QueueMonitorApi {
    const settings = buildSettings(config);
    let redisConfig: RedisConfig;
    if (config?.redis) {
      redisConfig = config?.redis;
    } else {
      redisConfig = {
        host: queueConfig.drivers.redis.host,
        port: queueConfig.drivers.redis.port,
        password: queueConfig.drivers.redis.password ?? '',
        db: queueConfig.drivers.redis.database,
      };
    }

    const driver = createBullMQDriver(redisConfig);
    const metrics = createMetrics(redisConfig);
    const startedAt = new Date().toISOString();
    ShutdownTrace.logHandles('queue-monitor.create', {
      basePath: settings.basePath,
      autoRefresh: settings.autoRefresh,
      refreshIntervalMs: settings.refreshIntervalMs,
    });

    const getSnapshot = createGetSnapshot(driver, startedAt, config.knownQueues);
    const getLocks = createGetLocks(redisConfig);

    const close = async (): Promise<void> => {
      ShutdownTrace.logHandles('queue-monitor.close.start', {
        basePath: settings.basePath,
      });
      await Promise.all([driver.close(), metrics.close()]);
      ShutdownTrace.logHandles('queue-monitor.close.complete', {
        basePath: settings.basePath,
      });
    };

    return Object.freeze({
      getSnapshot,
      getLocks,
      driver,
      metrics,
      close,
    });
  },
});

export default QueueMonitor;

export { createBullMQDriver } from './driver.js';

/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const _ZINTRUST_QUEUE_MONITOR_VERSION = '0.1.0';
export const _ZINTRUST_QUEUE_MONITOR_BUILD_DATE = '__BUILD_DATE__';
