import type { IRequest, IResponse } from '@zintrust/core';
import { Logger } from '@zintrust/core';
import type { QueueDriver } from './driver';
import type { LockAnalytics, QueueMonitorSnapshot } from './index';
import type { JobSummary, Metrics } from './metrics';

export const ALL_QUEUES = '__all__';

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

type QueueMonitoringCallback = (data: QueueSnapshotData) => void;

type QueueMonitoringSubscription = {
  callback: QueueMonitoringCallback;
  config: QueueMonitoringConfig;
  interval: ReturnType<typeof setInterval> | null;
};

const subscriptions = new Map<QueueMonitoringCallback, QueueMonitoringSubscription>();

const isAllQueuesSelection = (queue: string | null | undefined): boolean => queue === ALL_QUEUES;

const sortJobsByTimestamp = (jobs: JobSummary[]): JobSummary[] =>
  jobs.toSorted((left, right) => right.timestamp - left.timestamp);

export async function getRecentJobsForSelection(
  queueName: string,
  metrics: Metrics,
  driver: QueueDriver,
  queueNames?: ReadonlyArray<string>
): Promise<JobSummary[]> {
  if (!isAllQueuesSelection(queueName)) {
    return getRecentJobsForQueue(queueName, metrics, driver);
  }

  const names = Array.from(new Set((queueNames ?? (await driver.getQueues())).filter(Boolean)));
  const jobsByQueue = await Promise.all(
    names.map(async (name) => getRecentJobsForQueue(name, metrics, driver))
  );

  return sortJobsByTimestamp(jobsByQueue.flat()).slice(0, 100);
}

const buildSnapshotPayload = async (config: QueueMonitoringConfig): Promise<QueueSnapshotData> => {
  const { getSnapshot, getLocks, metrics, driver, queue: configuredQueue, pattern } = config;
  const snapshot = await getSnapshot();
  let queue: string | null;
  if (isAllQueuesSelection(configuredQueue)) {
    queue = ALL_QUEUES;
  } else if (
    configuredQueue &&
    snapshot.queues.some((candidate) => candidate.name === configuredQueue)
  ) {
    queue = configuredQueue;
  } else {
    queue = snapshot.queues[0]?.name ?? null;
  }

  return {
    type: 'snapshot',
    ts: new Date().toISOString(),
    queue,
    snapshot,
    jobs: queue
      ? await getRecentJobsForSelection(
          queue,
          metrics,
          driver,
          snapshot.queues.map((candidate) => candidate.name)
        )
      : [],
    locks: await getLocks(pattern),
  };
};

const pushSnapshot = async (subscription: QueueMonitoringSubscription): Promise<void> => {
  try {
    subscription.callback(await buildSnapshotPayload(subscription.config));
  } catch (err) {
    Logger.error('QueueMonitoringService.pushSnapshot failed', err);
  }
};

const startPolling = (subscription: QueueMonitoringSubscription): void => {
  if (subscription.interval) return;

  Logger.debug('Starting QueueMonitoringService polling', {
    queue: subscription.config.queue || null,
    pattern: subscription.config.pattern,
  });

  void pushSnapshot(subscription);
  subscription.interval = setInterval(() => {
    void pushSnapshot(subscription);
  }, subscription.config.intervalMs);
};

const stopPolling = (subscription: QueueMonitoringSubscription): void => {
  if (!subscription.interval) return;

  Logger.debug('Stopping QueueMonitoringService polling', {
    queue: subscription.config.queue || null,
    pattern: subscription.config.pattern,
  });
  clearInterval(subscription.interval);
  subscription.interval = null;
};

export const QueueMonitoringService = Object.freeze({
  subscribe(callback: QueueMonitoringCallback, config: QueueMonitoringConfig): void {
    const existing = subscriptions.get(callback);
    if (existing) {
      stopPolling(existing);
      subscriptions.delete(callback);
    }

    const subscription: QueueMonitoringSubscription = {
      callback,
      config,
      interval: null,
    };

    subscriptions.set(callback, subscription);
    startPolling(subscription);
  },

  unsubscribe(callback: QueueMonitoringCallback): void {
    const subscription = subscriptions.get(callback);
    if (!subscription) return;

    stopPolling(subscription);
    subscriptions.delete(callback);
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

  QueueMonitoringService.subscribe(onSnapshot, {
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
  });
};

export async function getRecentJobsForQueue(
  queueName: string,
  metrics: Metrics,
  driver: QueueDriver
): Promise<JobSummary[]> {
  const recent = await metrics.getRecentJobs(queueName);
  const failed = await metrics.getFailedJobs(queueName);
  const all = sortJobsByTimestamp(
    [...recent, ...failed].map((job) => ({
      ...job,
      queue: job.queue ?? queueName,
    }))
  ).slice(0, 100);

  if (all.length > 0) {
    return all;
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
      queue: queueName,
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
