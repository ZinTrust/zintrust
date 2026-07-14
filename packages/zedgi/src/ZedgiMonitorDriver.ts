import { Logger } from '@zintrust/core/logger';
import type {
  QueueDriver,
  RecoverActiveJobResult,
  RetryJobResult,
} from '@zintrust/queue-monitor/driver';
import type { Job } from 'bullmq';
import { ZedgiRuntime } from './ZedgiRuntime.js';
import type { ZedgiQueueConfig } from './types.js';

type RedisConfig = {
  password?: string;
  db?: number;
  database?: number;
  header?: Record<string, unknown>;
  profile?: string;
};

const createZedgiEnqueue =
  (getQueueConfig: () => Partial<ZedgiQueueConfig>) =>
  async <T>(name: string, payload: T, options?: Record<string, unknown>): Promise<string> => {
    try {
      const queue = ZedgiRuntime.queue(name, getQueueConfig());
      const result = await queue.add(
        `${name}-job`,
        payload,
        (options ?? {}) as Record<string, unknown>
      );
      const jobId =
        result !== null && 'id' in result ? String((result as { id?: string }).id ?? '') : '';
      return jobId;
    } catch (error) {
      Logger.warn(`[queue-monitor:zedgi] enqueue failed queue=${name}`, error);
      throw error;
    }
  };

const createZedgiGetJob =
  (getQueueConfig: () => Partial<ZedgiQueueConfig>) =>
  async (queueName: string, jobId: string): Promise<Job | undefined> => {
    try {
      const queue = ZedgiRuntime.queue(queueName, getQueueConfig());
      const job = await queue.getJob(jobId);
      return (job ?? undefined) as unknown as Job | undefined;
    } catch (error) {
      Logger.warn(`[queue-monitor:zedgi] getJob failed queue=${queueName} jobId=${jobId}`, error);
      return undefined;
    }
  };

const createZedgiGetJobCounts =
  (getQueueConfig: () => Partial<ZedgiQueueConfig>) =>
  async (queueName: string): Promise<Record<string, number>> => {
    try {
      const queue = ZedgiRuntime.queue(queueName, getQueueConfig());
      const counts = await queue.getJobCounts();
      return counts;
    } catch (error) {
      Logger.warn(`[queue-monitor:zedgi] getJobCounts failed queue=${queueName}`, error);
      return {};
    }
  };

const createZedgiGetJobCountsMany =
  (getQueueConfig: () => Partial<ZedgiQueueConfig>) =>
  async (
    queueNames: string[]
  ): Promise<Array<{ name: string; counts: Record<string, number> }>> => {
    try {
      const snapshot = await ZedgiRuntime.queue('snapshot', getQueueConfig()).getSnapshot();
      const result = snapshot.queues.filter((q) => queueNames.includes(q.name));
      return result;
    } catch (error) {
      Logger.warn(`[queue-monitor:zedgi] getJobCountsMany failed`, error);
      return queueNames.map((name) => ({ name, counts: {} }));
    }
  };

const createZedgiGetRecentJobs =
  (getQueueConfig: () => Partial<ZedgiQueueConfig>) =>
  async (queueName: string, limit = 100): Promise<Job[]> => {
    try {
      const queue = ZedgiRuntime.queue(queueName, getQueueConfig());
      const jobs = await queue.getRecentJobsForQueue(limit);
      return jobs as unknown as Job[];
    } catch (error) {
      Logger.warn(`[queue-monitor:zedgi] getRecentJobs failed queue=${queueName}`, error);
      return [];
    }
  };

const createZedgiRetryJob =
  (getQueueConfig: () => Partial<ZedgiQueueConfig>) =>
  async (queueName: string, jobId: string): Promise<RetryJobResult> => {
    try {
      const queue = ZedgiRuntime.queue(queueName, getQueueConfig());
      const result = await queue.retryJob(jobId);
      return result as RetryJobResult;
    } catch (error) {
      Logger.warn(`[queue-monitor:zedgi] retryJob failed queue=${queueName} jobId=${jobId}`, error);
      throw error;
    }
  };

const createZedgiRecoverActiveJob =
  (getQueueConfig: () => Partial<ZedgiQueueConfig>) =>
  async (queueName: string, jobId: string): Promise<RecoverActiveJobResult> => {
    try {
      const queue = ZedgiRuntime.queue(queueName, getQueueConfig());
      const job = await queue.getJob(jobId);
      if (!job) {
        return { ok: true, status: 'removed' };
      }
      const state = job.state;
      if (state === 'failed') {
        return { ok: true, status: 'failed', state };
      }
      if (state === 'delayed') {
        await queue.removeJob(jobId);
        return { ok: true, status: 'removed_after_delayed_retry', state };
      }
      if (state && state !== 'active') {
        return { ok: true, status: 'moved', state };
      }
      return { ok: false, status: 'not_recoverable', reason: 'Job is still active' };
    } catch (error) {
      Logger.warn(
        `[queue-monitor:zedgi] recoverActiveJob failed queue=${queueName} jobId=${jobId}`,
        error
      );
      throw error;
    }
  };

const createZedgiGetQueues =
  (getQueueConfig: () => Partial<ZedgiQueueConfig>) => async (): Promise<string[]> => {
    try {
      const snapshot = await ZedgiRuntime.queue('snapshot', getQueueConfig()).getSnapshot();
      const queues = snapshot.queues.map((q) => q.name);
      return queues;
    } catch (error) {
      Logger.warn(`[queue-monitor:zedgi] getQueues failed`, error);
      return [];
    }
  };

const createZedgiClose = () => async (): Promise<void> => {
  // ZedgiRuntime manages connections globally, no per-driver cleanup needed
};

const createZedgiMonitorDriver = (config: RedisConfig): QueueDriver => {
  const getQueueConfig = (): Partial<ZedgiQueueConfig> => ({
    password: config.password,
    database: config.db ?? config.database,
    header: config.header,
    profile: config.profile,
  });

  return {
    enqueue: createZedgiEnqueue(getQueueConfig),
    getJob: createZedgiGetJob(getQueueConfig),
    getJobCounts: createZedgiGetJobCounts(getQueueConfig),
    getJobCountsMany: createZedgiGetJobCountsMany(getQueueConfig),
    getRecentJobs: createZedgiGetRecentJobs(getQueueConfig),
    retryJob: createZedgiRetryJob(getQueueConfig),
    recoverActiveJob: createZedgiRecoverActiveJob(getQueueConfig),
    getQueues: createZedgiGetQueues(getQueueConfig),
    close: createZedgiClose(),
  };
};

export { createZedgiMonitorDriver };
