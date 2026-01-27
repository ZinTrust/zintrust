import { queueConfig, Router, type IRouter } from '@zintrust/core';
import { createRedisConnection, type RedisConfig } from './connection';
import { getDashboardHtml } from './dashboard-ui';
import { createBullMQDriver, type QueueDriver } from './driver';
import { createMetrics, type Metrics } from './metrics';

export type { JobPayload } from './driver';
export { createWorker as createQueueWorker, type QueueWorker } from './worker';

export type QueueMonitorConfig = {
  enabled?: boolean;
  basePath?: string;
  middleware?: ReadonlyArray<string>;
  autoRefresh?: boolean;
  refreshIntervalMs?: number;
  redis: RedisConfig;
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
};

type JobSummary = {
  id: string | undefined;
  name: string;
  data: unknown;
  attempts: number;
  status?: string;
  failedReason?: string;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
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

const DEFAULT_LOCK_PREFIX = 'zintrust:locks:';
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

function createGetLocks(redisConfig: RedisConfig) {
  let redisConnection: ReturnType<typeof createRedisConnection> | null = null;

  const resolveRedisConnection = (): ReturnType<typeof createRedisConnection> => {
    if (!redisConnection) {
      redisConnection = createRedisConnection(redisConfig);
    }
    return redisConnection;
  };

  const resolveLockPrefix = (): string => {
    const fromEnv = String(process.env['QUEUE_LOCK_PREFIX'] ?? '').trim();
    return fromEnv.length > 0 ? fromEnv : DEFAULT_LOCK_PREFIX;
  };

  return async (pattern: string = '*'): Promise<LockAnalytics> => {
    const client = resolveRedisConnection();
    const prefix = resolveLockPrefix();
    const searchPattern = `${prefix}${pattern}`;

    const keys: string[] = [];
    let cursor = '0';

    do {
      // eslint-disable-next-line no-await-in-loop
      const [nextCursor, batch] = await client.scan(cursor, 'MATCH', searchPattern, 'COUNT', '200');
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    const statuses = await Promise.all(keys.map((key) => client.pttl(key)));

    const locks = keys.map((key, index) => {
      const ttl = statuses[index];
      const exists = typeof ttl === 'number' && ttl > 0;
      return {
        key: key.replace(prefix, ''),
        ttl: exists ? ttl : undefined,
        expires: exists ? new Date(Date.now() + ttl).toISOString() : undefined,
      };
    });

    const metricsKeys = [
      `${prefix}${METRICS_KEYS.attempts}`,
      `${prefix}${METRICS_KEYS.acquired}`,
      `${prefix}${METRICS_KEYS.collisions}`,
    ];
    const [attemptsRaw, acquiredRaw, collisionsRaw] = await client.mget(...metricsKeys);
    const parseMetric = (value: string | null): number =>
      Number.isFinite(Number(value)) ? Number(value) : 0;
    const attempts = parseMetric(attemptsRaw);
    const acquired = parseMetric(acquiredRaw);
    const collisions = parseMetric(collisionsRaw);
    const collisionRate = attempts > 0 ? collisions / attempts : 0;

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

    return {
      locks,
      metrics: {
        active: locks.length,
        attempts,
        acquired,
        collisions,
        collisionRate,
      },
      histogram,
    };
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

  const recent = await metrics.getRecentJobs(queueName);
  const failed = await metrics.getFailedJobs(queueName);
  const all = [...recent, ...failed].sort((a, b) => b.timestamp - a.timestamp).slice(0, 100);

  if (all.length > 0) {
    res.json(all);
    return;
  }

  const jobs = await driver.getRecentJobs(queueName, 100);
  const now = Date.now();
  const fallback: JobSummary[] = jobs.map((job) => {
    // Use the actual state from BullMQ if available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jobState = (job as any)._state as string | undefined;

    // Fallback detection if state is not available
    const isFailed = Boolean(job.failedReason) || jobState === 'failed';
    const isCompleted = Boolean(job.finishedOn) || jobState === 'completed';
    const isActive =
      Boolean(job.processedOn && !job.finishedOn && !job.failedReason) || jobState === 'active';
    const isDelayed = jobState === 'delayed';
    const isPaused = jobState === 'paused';

    let status: string;
    if (isFailed) {
      status = 'failed';
    } else if (isCompleted) {
      status = 'completed';
    } else if (isActive) {
      status = 'active';
    } else if (isDelayed) {
      status = 'delayed';
    } else if (isPaused) {
      status = 'paused';
    } else {
      status = 'waiting';
    }

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      attempts: job.attemptsMade,
      status,
      failedReason: job.failedReason || undefined,
      timestamp: job.timestamp ?? now,
      processedOn: job.processedOn ?? undefined,
      finishedOn: job.finishedOn ?? undefined,
    };
  });
  res.json(fallback);
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

    const renderDashboard = (_req: unknown, res: { html: (value: string) => void }): void => {
      res.html(
        getDashboardHtml({
          autoRefresh: settings.autoRefresh,
          refreshIntervalMs: settings.refreshIntervalMs,
        })
      );
    };

    // Dashboard HTML
    Router.get(router, settings.basePath, renderDashboard, routeOptions);
    Router.get(router, `${settings.basePath}/`, renderDashboard, routeOptions);

    // API: Snapshot
    Router.get(
      router,
      `${settings.basePath}/api/snapshot`,
      async (_req, res) => {
        const data = await getSnapshot();
        res.json(data);
      },
      routeOptions
    );

    // API: Recent Jobs for Queue
    Router.get(
      router,
      `${settings.basePath}/api/jobs/:queue`,
      async (req, res) => {
        await handleJobsEndpoint(req as RequestWithParams, res, metrics, driver);
      },
      routeOptions
    );

    // API: Locks
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

    // API: Retry Failed Job
    Router.post(
      router,
      `${settings.basePath}/api/retry/:queue/:jobId`,
      async (req, res) => {
        await handleRetryEndpoint(req as RequestWithParams, res, driver);
      },
      routeOptions
    );
  };
}

export const QueueMonitor = Object.freeze({
  create(config: QueueMonitorConfig): QueueMonitorApi {
    const settings = buildSettings(config);
    const driver = createBullMQDriver(config.redis);
    const metrics = createMetrics(config.redis);
    const startedAt = new Date().toISOString();

    const getSnapshot = createGetSnapshot(driver, startedAt);
    const getLocks = createGetLocks(config.redis);
    const registerRoutes = createRegisterRoutes(settings, metrics, driver, getSnapshot, getLocks);

    return Object.freeze({
      registerRoutes,
      getSnapshot,
      getLocks,
      driver,
      metrics,
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
