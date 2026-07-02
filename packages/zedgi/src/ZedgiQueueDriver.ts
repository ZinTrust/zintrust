import { Env } from '@zintrust/core/config';
import { ErrorFactory } from '@zintrust/core/errors';
import { generateUuid } from '@zintrust/core/utils';
import type { QueueClient } from '@zedgi/zedgi-client';
import { ZedgiRuntime } from './ZedgiRuntime.js';
import type { BullMQPayload, QueueDriver, QueueMessage, ZedgiQueueConfig } from './types.js';

const resolveRequestedJobId = (payload: BullMQPayload): string => {
  const jobId = payload['jobId'];
  if (typeof jobId === 'string' && jobId.trim().length > 0) return jobId.trim();
  return generateUuid();
};

const createJobOptions = (payload: BullMQPayload, fallbackJobId: string): Record<string, unknown> => ({
  jobId: resolveRequestedJobId({ ...payload, jobId: payload['jobId'] ?? fallbackJobId }),
  delay: payload['delay'],
  attempts: payload['attempts'] ?? Env.getInt('BULLMQ_DEFAULT_ATTEMPTS', 3),
  priority: payload['priority'],
  removeOnComplete: payload['removeOnComplete'] ?? Env.getInt('BULLMQ_REMOVE_ON_COMPLETE', 100),
  removeOnFail: payload['removeOnFail'] ?? Env.getInt('BULLMQ_REMOVE_ON_FAIL', 50),
  backoff:
    payload['backoff'] ?? {
      type: Env.get('BULLMQ_BACKOFF_TYPE', 'exponential'),
      delay: Env.getInt('BULLMQ_BACKOFF_DELAY', 2000),
    },
  repeat: payload['repeat'],
  lifo: payload['lifo'] ?? false,
});

const resolveJobId = (result: unknown, fallback: string): string => {
  if (result !== null && typeof result === 'object') {
    const id = (result as { id?: unknown }).id;
    if (typeof id === 'string' && id.trim().length > 0) return id;
    if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  }
  return fallback;
};

const createDriver = (config: ZedgiQueueConfig): QueueDriver => {
  const queue = (name: string): QueueClient => ZedgiRuntime.queue(name, config);

  return {
    async enqueue(queueName: string, payload: BullMQPayload): Promise<string> {
      const fallbackJobId = resolveRequestedJobId(payload);
      const result = await queue(queueName).add(
        `${queueName}-job`,
        payload,
        createJobOptions(payload, fallbackJobId)
      );
      return resolveJobId(result, fallbackJobId);
    },

    async dequeue<T = unknown>(_queueName: string): Promise<QueueMessage<T> | undefined> {
      throw ErrorFactory.createConfigError(
        'queue-zedgi does not support pull-based dequeue yet because the Zedgi queue API does not expose a safe visibility-timeout claim operation. Use it for enqueue and monitoring, or run workers against the same Redis service.'
      );
    },

    async ack(queueName: string, id: string): Promise<void> {
      await queue(queueName).removeJob(id);
    },

    async length(queueName: string): Promise<number> {
      return queue(queueName).count();
    },

    async drain(queueName: string): Promise<void> {
      await queue(queueName).drain();
    },
  };
};

export const ZedgiQueueDriver = Object.freeze({
  create(config: ZedgiQueueConfig): QueueDriver {
    return createDriver(config);
  },
});

export default ZedgiQueueDriver;
