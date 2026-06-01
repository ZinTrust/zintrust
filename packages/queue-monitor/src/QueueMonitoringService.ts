import type { IRequest, IResponse } from '@zintrust/core/http';
import { Logger } from '@zintrust/core/logger';
import type { QueueDriver } from './driver.js';
import type { LockAnalytics, QueueMonitorSnapshot } from './index.js';
import type { JobSummary, Metrics } from './metrics.js';

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
  channelKey: string;
};

const subscriptions = new Map<QueueMonitoringCallback, QueueMonitoringSubscription>();

type QueueMonitoringChannel = {
  key: string;
  config: QueueMonitoringConfig;
  callbacks: Set<QueueMonitoringCallback>;
  interval: ReturnType<typeof setInterval> | null;
  lastPayload: QueueSnapshotData | null;
  pending: Promise<QueueSnapshotData> | null;
};

const channels = new Map<string, QueueMonitoringChannel>();
const objectIds = new WeakMap<object, number>();
let nextObjectId = 0;

const isAllQueuesSelection = (queue: string | null | undefined): boolean => queue === ALL_QUEUES;

const sortJobsByTimestamp = (jobs: JobSummary[]): JobSummary[] =>
  jobs.toSorted((left, right) => right.timestamp - left.timestamp);

export const emptyLockAnalytics = (): LockAnalytics => ({
  locks: [],
  metrics: { active: 0, attempts: 0, acquired: 0, collisions: 0, collisionRate: 0 },
  histogram: [],
});

const getObjectId = (value: object): number => {
  const existing = objectIds.get(value);
  if (existing !== undefined) return existing;

  nextObjectId += 1;
  objectIds.set(value, nextObjectId);
  return nextObjectId;
};

const buildChannelKey = (config: QueueMonitoringConfig): string => {
  const snapshotId = getObjectId(config.getSnapshot as unknown as object);
  const locksId = getObjectId(config.getLocks as unknown as object);
  const jobsId = getObjectId(config.getRecentJobsForQueue as unknown as object);
  const metricsId = getObjectId(config.metrics as unknown as object);
  const driverId = getObjectId(config.driver as unknown as object);
  return [
    config.queue,
    config.pattern,
    String(config.intervalMs),
    String(snapshotId),
    String(locksId),
    String(jobsId),
    String(metricsId),
    String(driverId),
  ].join('::');
};

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
    names.map(async (name) => {
      try {
        return await getRecentJobsForQueue(name, metrics, driver);
      } catch (error) {
        Logger.warn('[queue-monitor] Recent jobs lookup failed; returning no jobs', error);
        return [];
      }
    })
  );

  return sortJobsByTimestamp(jobsByQueue.flat()).slice(0, 100);
}

const buildSnapshotPayload = async (config: QueueMonitoringConfig): Promise<QueueSnapshotData> => {
  const { getSnapshot, getLocks, metrics, driver, queue: configuredQueue, pattern } = config;
  const snapshot = await getSnapshot().catch((error) => {
    Logger.warn('[queue-monitor] Snapshot unavailable; returning empty snapshot', error);
    return { status: 'ok' as const, startedAt: new Date().toISOString(), queues: [] };
  });
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
        ).catch((error) => {
          Logger.warn('[queue-monitor] Recent jobs unavailable; returning no jobs', error);
          return [];
        })
      : [],
    locks: await getLocks(pattern).catch((error) => {
      Logger.warn('[queue-monitor] Lock analytics unavailable; returning empty analytics', error);
      return emptyLockAnalytics();
    }),
  };
};

const pushSnapshot = async (channel: QueueMonitoringChannel): Promise<void> => {
  try {
    channel.pending ??= buildSnapshotPayload(channel.config);
    const payload = await channel.pending;
    channel.lastPayload = payload;
    channel.callbacks.forEach((callback) => {
      try {
        callback(payload);
      } catch (err) {
        Logger.error('QueueMonitoringService.pushSnapshot callback failed', err);
      }
    });
  } catch (err) {
    Logger.error('QueueMonitoringService.pushSnapshot failed', err);
  } finally {
    channel.pending = null;
  }
};

const startPolling = (channel: QueueMonitoringChannel): void => {
  if (channel.interval) return;

  void pushSnapshot(channel);
  channel.interval = setInterval(() => {
    void pushSnapshot(channel);
  }, channel.config.intervalMs);
};

const stopPolling = (channel: QueueMonitoringChannel): void => {
  if (!channel.interval) return;
  clearInterval(channel.interval);
  channel.interval = null;
};

const getOrCreateChannel = (config: QueueMonitoringConfig): QueueMonitoringChannel => {
  const key = buildChannelKey(config);
  const existing = channels.get(key);
  if (existing) return existing;

  const channel: QueueMonitoringChannel = {
    key,
    config,
    callbacks: new Set(),
    interval: null,
    lastPayload: null,
    pending: null,
  };

  channels.set(key, channel);
  return channel;
};

export const QueueMonitoringService = Object.freeze({
  subscribe(callback: QueueMonitoringCallback, config: QueueMonitoringConfig): void {
    const existing = subscriptions.get(callback);
    if (existing) {
      const existingChannel = channels.get(existing.channelKey);
      existingChannel?.callbacks.delete(callback);
      if (existingChannel?.callbacks.size === 0) {
        stopPolling(existingChannel);
        channels.delete(existingChannel.key);
      }
      subscriptions.delete(callback);
    }

    const channel = getOrCreateChannel(config);
    channel.callbacks.add(callback);

    const subscription: QueueMonitoringSubscription = {
      callback,
      config,
      channelKey: channel.key,
    };

    subscriptions.set(callback, subscription);
    if (channel.lastPayload) {
      callback(channel.lastPayload);
    }
    startPolling(channel);
  },

  unsubscribe(callback: QueueMonitoringCallback): void {
    const subscription = subscriptions.get(callback);
    if (!subscription) return;

    const channel = channels.get(subscription.channelKey);
    channel?.callbacks.delete(callback);
    if (channel?.callbacks.size === 0) {
      stopPolling(channel);
      channels.delete(channel.key);
    }
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
  const [recent, failed] = await Promise.all([
    metrics.getRecentJobs(queueName).catch(() => [] as JobSummary[]),
    metrics.getFailedJobs(queueName).catch(() => [] as JobSummary[]),
  ]);
  const all = sortJobsByTimestamp(
    [...recent, ...failed].map((job) => ({
      ...job,
      queue: job.queue ?? queueName,
    }))
  ).slice(0, 100);

  if (all.length > 0) {
    return all;
  }

  const jobs = await driver.getRecentJobs(queueName, 100).catch((error) => {
    Logger.warn('[queue-monitor] Driver recent jobs unavailable; returning no jobs', error);
    return [];
  });
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
      opts: job.opts,
      attempts: job.attemptsMade,
      status,
      failedReason: job.failedReason || undefined,
      timestamp: job.timestamp ?? now,
      processedOn: job.processedOn ?? undefined,
      finishedOn: job.finishedOn ?? undefined,
    };
  });
}
