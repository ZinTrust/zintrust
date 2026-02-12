import {
  Logger,
  queueConfig,
  resolveLockPrefix,
  Router,
  type IRequest,
  type IResponse,
  type IRouter,
  type RouteOptions,
} from '@zintrust/core';
import { createRedisConnection, type RedisConfig } from './connection';
import { getDashboardHtml } from './dashboard-ui';
import { createBullMQDriver, type QueueDriver } from './driver';
import { createMetrics, type Metrics } from './metrics';
import { getRecentJobsForQueue, QueueMonitoringStream } from './QueueMonitoringService';

export type { JobPayload } from './driver';
export { createWorker as createQueueWorker, type QueueWorker } from './worker';

export type QueueMonitorConfig = {
  enabled?: boolean;
  basePath?: string;
  middleware?: ReadonlyArray<string>;
  autoRefresh?: boolean;
  refreshIntervalMs?: number;
  redis?: RedisConfig;
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
  registerRoutes: (router: IRouter) => void;
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

type RequestWithParams = {
  getParam?: (name: string) => string | undefined;
  params?: Record<string, string>;
};

function extractQueueParam(req: RequestWithParams): string | undefined {
  if (typeof req.getParam === 'function') {
    return (
      req.getParam('queue') || (req && req.params !== undefined ? req?.params['queue'] : undefined)
    );
  }
  return req && req.params !== undefined ? req?.params['queue'] : undefined;
}

function fieldError(key: string, message: string): { error: string } {
  return { error: `[${key}] ${message}` };
}

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
    const client = createRedisConnection(redisConfig);
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

async function handleJobsEndpoint(
  req: RequestWithParams,
  res: {
    status: (code: number) => { json: (data: unknown) => void };
    json: (data: unknown) => void;
  },
  metrics: Metrics,
  driver: QueueDriver
): Promise<void> {
  const queueName = extractQueueParam(req);

  if (!queueName) {
    res.status(400).json(fieldError('queue_name', 'Queue name must be provided'));
    return;
  }

  const jobs = await getRecentJobsForQueue(queueName, metrics, driver);
  res.json(jobs);
}

async function handleRetryEndpoint(
  req: RequestWithParams,
  res: {
    status: (code: number) => { json: (data: unknown) => void };
    json: (data: unknown) => void;
  },
  driver: QueueDriver
): Promise<void> {
  const queueName = extractQueueParam(req);
  const jobId =
    typeof req.getParam === 'function' ? req.getParam?.('jobId') : req.params?.['jobId'];

  if (!queueName || !jobId) {
    res.status(400).json(fieldError('queue_name,job_id', 'Queue name and job ID must be provided'));
    return;
  }

  const success = await driver.retryJob(queueName, jobId);
  if (success) {
    res.json({ ok: true, message: `Job ${jobId} queued for retry` });
  } else {
    res.status(404).json({ error: 'Job not found or cannot be retried' });
  }
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

function createGetSnapshot(driver: QueueDriver, startedAt: string) {
  return async (): Promise<QueueMonitorSnapshot> => {
    const queues = await driver.getQueues();
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

function createRegisterRoutes(
  settings: {
    enabled: boolean;
    basePath: string;
    middleware: ReadonlyArray<string>;
    autoRefresh: boolean;
    refreshIntervalMs: number;
  },
  metrics: Metrics,
  driver: QueueDriver,
  getSnapshot: () => Promise<QueueMonitorSnapshot>,
  getLocks: (pattern?: string) => Promise<LockAnalytics>
) {
  return (router: IRouter): void => {
    if (!settings.enabled) return;

    const routeOptions =
      settings.middleware.length > 0
        ? { middleware: settings.middleware }
        : { ...queueConfig.monitor };

    registerDashboardRoutes(router, settings, routeOptions);
    registerApiRoutes(router, settings, routeOptions, metrics, driver, getSnapshot, getLocks);
  };
}

function registerDashboardRoutes(
  router: IRouter,
  settings: {
    enabled: boolean;
    basePath: string;
    middleware: ReadonlyArray<string>;
    autoRefresh: boolean;
    refreshIntervalMs: number;
  },
  routeOptions: RouteOptions
): void {
  const renderDashboard = (_req: unknown, res: { html: (value: string) => void }): void => {
    res.html(
      getDashboardHtml({
        basePath: settings.basePath,
        autoRefresh: settings.autoRefresh,
        refreshIntervalMs: settings.refreshIntervalMs,
      })
    );
  };

  // Dashboard HTML
  Router.get(router, settings.basePath, renderDashboard, routeOptions);
  Router.get(router, `${settings.basePath}/`, renderDashboard, routeOptions);
}

function registerApiRoutes(
  router: IRouter,
  settings: {
    enabled: boolean;
    basePath: string;
    middleware: ReadonlyArray<string>;
    autoRefresh: boolean;
    refreshIntervalMs: number;
  },
  routeOptions: RouteOptions,
  metrics: Metrics,
  driver: QueueDriver,
  getSnapshot: () => Promise<QueueMonitorSnapshot>,
  getLocks: (pattern?: string) => Promise<LockAnalytics>
): void {
  registerSnapshotApi(router, settings, routeOptions, getSnapshot);
  registerJobsApi(router, settings, routeOptions, metrics, driver);
  registerLocksApi(router, settings, routeOptions, getLocks);
  registerRetryApi(router, settings, routeOptions, driver);
  registerEventsApi(router, settings, routeOptions, getSnapshot, getLocks, metrics, driver);
}

function registerSnapshotApi(
  router: IRouter,
  settings: { basePath: string },
  routeOptions: RouteOptions,
  getSnapshot: () => Promise<QueueMonitorSnapshot>
): void {
  Router.get(
    router,
    `${settings.basePath}/api/snapshot`,
    async (_req, res) => {
      const data = await getSnapshot();
      res.json(data);
    },
    routeOptions
  );
}

function registerJobsApi(
  router: IRouter,
  settings: { basePath: string },
  routeOptions: RouteOptions,
  metrics: Metrics,
  driver: QueueDriver
): void {
  Router.get(
    router,
    `${settings.basePath}/api/jobs/:queue`,
    async (req, res) => {
      await handleJobsEndpoint(req as RequestWithParams, res, metrics, driver);
    },
    routeOptions
  );
}

function registerLocksApi(
  router: IRouter,
  settings: { basePath: string },
  routeOptions: RouteOptions,
  getLocks: (pattern?: string) => Promise<LockAnalytics>
): void {
  Router.get(
    router,
    `${settings.basePath}/api/locks`,
    async (req, res) => {
      const query =
        typeof (req as { getQuery?: () => Record<string, string> }).getQuery === 'function'
          ? (req as { getQuery: () => Record<string, string> }).getQuery()
          : ((req as { query?: Record<string, string> }).query ?? {});
      const pattern = query['pattern'] ?? '*';
      const locks = await getLocks(pattern);
      res.json(locks);
    },
    routeOptions
  );
}

function registerRetryApi(
  router: IRouter,
  settings: { basePath: string },
  routeOptions: RouteOptions,
  driver: QueueDriver
): void {
  Router.post(
    router,
    `${settings.basePath}/api/retry/:queue/:jobId`,
    async (req, res) => {
      await handleRetryEndpoint(req as RequestWithParams, res, driver);
    },
    routeOptions
  );
}

function registerEventsApi(
  router: IRouter,
  settings: {
    basePath: string;
    refreshIntervalMs: number;
  },
  routeOptions: RouteOptions,
  getSnapshot: () => Promise<QueueMonitorSnapshot>,
  getLocks: (pattern?: string) => Promise<LockAnalytics>,
  metrics: Metrics,
  driver: QueueDriver
): void {
  Router.get(
    router,
    `${settings.basePath}/api/events`,
    async (req: IRequest, res: IResponse) => {
      QueueMonitoringStream(res, req, getSnapshot, getLocks, metrics, driver, settings);
    },
    routeOptions
  );
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

    const getSnapshot = createGetSnapshot(driver, startedAt);
    const getLocks = createGetLocks(redisConfig);
    const registerRoutes = createRegisterRoutes(settings, metrics, driver, getSnapshot, getLocks);

    const close = async (): Promise<void> => {
      await Promise.all([driver.close(), metrics.close()]);
    };

    return Object.freeze({
      registerRoutes,
      getSnapshot,
      getLocks,
      driver,
      metrics,
      close,
    });
  },
});

export default QueueMonitor;

export { createBullMQDriver } from './driver';

/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const _ZINTRUST_QUEUE_MONITOR_VERSION = '0.1.0';
export const _ZINTRUST_QUEUE_MONITOR_BUILD_DATE = '__BUILD_DATE__';
