import { Router, type IRouter } from '@zintrust/core';
import { type RedisConfig } from './connection';
import { DASHBOARD_HTML } from './dashboard-ui';
import { createBullMQDriver, type QueueDriver } from './driver';
import { createMetrics, type Metrics } from './metrics';

export type { JobPayload } from './driver';
export { createWorker as createQueueWorker, type QueueWorker } from './worker';

export type QueueMonitorConfig = {
  enabled?: boolean;
  basePath?: string;
  middleware?: ReadonlyArray<string>;
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

export type QueueMonitorApi = {
  registerRoutes: (router: IRouter) => void;
  getSnapshot: () => Promise<QueueMonitorSnapshot>;
  driver: QueueDriver;
  metrics: Metrics;
};

const DEFAULTS = {
  enabled: true,
  basePath: '/queue-monitor',
  middleware: [],
};

export const QueueMonitor = Object.freeze({
  create(config: QueueMonitorConfig): QueueMonitorApi {
    const settings = {
      enabled: config.enabled ?? DEFAULTS.enabled,
      basePath: config.basePath ?? DEFAULTS.basePath,
      middleware: config.middleware ?? DEFAULTS.middleware,
    };

    const driver = createBullMQDriver(config.redis);
    const metrics = createMetrics(config.redis);
    const startedAt = new Date().toISOString();

    const getSnapshot = async (): Promise<QueueMonitorSnapshot> => {
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

    const registerRoutes = (router: IRouter): void => {
      if (!settings.enabled) return;

      const routeOptions =
        settings.middleware.length > 0 ? { middleware: settings.middleware } : undefined;

      // Dashboard HTML
      Router.get(
        router,
        settings.basePath,
        (_req, res) => {
          res.html(DASHBOARD_HTML);
        },
        routeOptions
      );

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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const queueName = (req as any).params?.queue as string | undefined;

          if (!queueName) {
            res.status(400).json({ error: 'Queue name required' });
            return;
          }

          const recent = await metrics.getRecentJobs(queueName);
          const failed = await metrics.getFailedJobs(queueName);
          // Merge and sort
          const all = [...recent, ...failed]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 100);
          res.json(all);
        },
        routeOptions
      );
    };

    return Object.freeze({
      registerRoutes,
      getSnapshot,
      driver,
      metrics,
    });
  },
});

export default QueueMonitor;
