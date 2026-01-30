import type { IRequest, IResponse } from '@zintrust/core';
import { Logger, NodeSingletons } from '@zintrust/core';
import type { QueueDriver } from './driver';
import type { LockAnalytics, QueueMonitorSnapshot } from './index';
import type { JobSummary, Metrics } from './metrics';

type QueueSnapshotData = {
  type: string;
  ts: string;
  queue: string | null;
  snapshot: QueueMonitorSnapshot;
  jobs: unknown[];
  locks: LockAnalytics;
};

type QueueMonitoringConfig = {
  getSnapshot: () => Promise<QueueMonitorSnapshot>;
  getLocks: (pattern?: string) => Promise<LockAnalytics>;
  getRecentJobsForQueue: (
    queue: string,
    metrics: Metrics,
    driver: QueueDriver
  ) => Promise<unknown[]>;
  metrics: Metrics;
  driver: QueueDriver;
  queue: string;
  pattern: string;
  intervalMs: number;
};

// Internal state
const emitter = new NodeSingletons.EventEmitter();
emitter.setMaxListeners(Infinity);
let interval: NodeJS.Timeout | null = null;
let subscribers = 0;
let currentConfig: QueueMonitoringConfig | null = null;

const broadcastSnapshot = async (): Promise<void> => {
  try {
    if (subscribers <= 0 || !currentConfig) return;

    const { getSnapshot, getLocks, metrics, driver, queue: initialQueue, pattern } = currentConfig;
    const snapshot = await getSnapshot();
    let queue = initialQueue;
    if (!queue && snapshot.queues.length > 0) {
      queue = snapshot.queues[0].name;
    }
    const jobs = queue ? await getRecentJobsForQueue(queue, metrics, driver) : [];
    const locks = await getLocks(pattern);

    const payload: QueueSnapshotData = {
      type: 'snapshot',
      ts: new Date().toISOString(),
      queue: queue || null,
      snapshot,
      jobs,
      locks,
    };

    emitter.emit('snapshot', payload);
  } catch (err) {
    Logger.error('QueueMonitoringService.broadcastSnapshot failed', err);
    emitter.emit('error', err);
  }
};

const startPolling = (): void => {
  if (interval || !currentConfig) return;

  Logger.debug('Starting QueueMonitoringService polling');
  // Initial fetch
  void broadcastSnapshot();

  interval = setInterval(() => {
    void broadcastSnapshot();
  }, currentConfig.intervalMs);
};

const stopPolling = (): void => {
  if (interval) {
    Logger.debug('Stopping QueueMonitoringService polling');
    clearInterval(interval);
    interval = null;
  }
};

export const QueueMonitoringService = Object.freeze({
  subscribe(callback: (data: QueueSnapshotData) => void): void {
    emitter.on('snapshot', callback);
    subscribers++;
  },

  unsubscribe(callback: (data: QueueSnapshotData) => void): void {
    emitter.off('snapshot', callback);
    subscribers--;
    if (subscribers <= 0) {
      stopPolling();
      currentConfig = null;
    }
  },

  startPollingForClient(config: QueueMonitoringConfig): void {
    if (subscribers === 1) {
      currentConfig = config;
      startPolling();
    }
  },

  stopPollingForClient(): void {
    if (subscribers <= 0) {
      stopPolling();
      currentConfig = null;
    }
  },
});
//  settings: {
//     basePath: string;
//     refreshIntervalMs: number;
//   },
//   routeOptions: unknown,
//   getSnapshot: () => Promise<QueueMonitorSnapshot>,
export const QueueMonitoringStream = (
  res: IResponse,
  req: IRequest,
  getSnapshot: () => Promise<QueueMonitorSnapshot>,
  getLocks: (pattern?: string) => Promise<LockAnalytics>,
  metrics: Metrics,
  driver: QueueDriver,
  settings: {
    basePath: string;
    refreshIntervalMs: number;
  }
): void => {
  const raw = res.getRaw();

  raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let closed = false;

  const send = (payload: unknown): void => {
    if (closed) return;
    try {
      const data = JSON.stringify(payload);
      raw.write(`data: ${data}\n\n`);
    } catch (err) {
      Logger.error('QueueMonitor SSE send failed', err);
    }
  };

  // Send hello immediately
  send({ type: 'hello', ts: new Date().toISOString() });

  // Get query parameters
  const getQuery = (): Record<string, string> =>
    typeof req.getQuery === 'function'
      ? (req.getQuery() as Record<string, string>)
      : ({} as Record<string, string>);

  const query = getQuery();
  const queue = query['queue'] ?? '';
  const pattern = query['pattern'] ?? '*';

  // Define subscription callback
  const onSnapshot = (data: unknown): void => {
    send(data);
  };

  // Subscribe to centralized service
  QueueMonitoringService.subscribe(onSnapshot);

  // Start polling for this client
  QueueMonitoringService.startPollingForClient({
    getSnapshot,
    getLocks,
    getRecentJobsForQueue,
    metrics,
    driver,
    queue,
    pattern,
    intervalMs: settings.refreshIntervalMs,
  });

  // Heartbeat to keep connection alive
  const hb = setInterval(() => {
    if (!closed) raw.write(': ping\n\n');
  }, 15000);

  raw.on('close', () => {
    closed = true;
    clearInterval(hb);
    QueueMonitoringService.unsubscribe(onSnapshot);
    QueueMonitoringService.stopPollingForClient();
  });
};

export async function getRecentJobsForQueue(
  queueName: string,
  metrics: Metrics,
  driver: QueueDriver
): Promise<JobSummary[]> {
  const recent = await metrics.getRecentJobs(queueName);
  const failed = await metrics.getFailedJobs(queueName);
  const all = [...recent, ...failed].sort((a, b) => b.timestamp - a.timestamp).slice(0, 100);

  if (all.length > 0) {
    return all as JobSummary[];
  }

  const jobs = await driver.getRecentJobs(queueName, 100);
  const now = Date.now();
  return jobs.map((job) => {
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
}
