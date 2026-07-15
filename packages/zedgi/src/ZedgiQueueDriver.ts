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

type ZedgiRedisRpcClient = {
  hook?: <T = unknown>(name: string, payload?: Record<string, unknown>) => Promise<T>;
};

type ConsumerCapableQueueClient = QueueClient & {
  dequeue?: <T = unknown>(visibilityTimeoutMs?: number) => Promise<QueueMessage<T> | undefined>;
  ack?: (id: string, returnValue?: unknown) => Promise<unknown>;
  fail?: (id: string, reason?: string) => Promise<unknown>;
};

const resolveVisibilityTimeoutMs = (): number =>
  Env.getInt(
    'QUEUE_ZEDGI_VISIBILITY_TIMEOUT_MS',
    Env.getInt('QUEUE_REDIS_VISIBILITY_TIMEOUT_MS', 30_000)
  );

const callQueueRpc = async <T>(
  config: ZedgiQueueConfig,
  queueName: string,
  method: 'dequeue' | 'ack' | 'fail',
  payload: Record<string, unknown>
): Promise<T> => {
  const redis = ZedgiRuntime.redis(config) as ZedgiRedisRpcClient;
  if (typeof redis.hook === 'function') {
    return redis.hook<T>(`bull:${method}`, {
      target: queueName,
      ...payload,
    });
  }

  throw ErrorFactory.createConfigError(
    'Zedgi Redis RPC hook support is required for queue consumption'
  );
};

const createDriver = (config: ZedgiQueueConfig): QueueDriver => {
  const queue = (name: string): ConsumerCapableQueueClient =>
    ZedgiRuntime.queue(name, config) as ConsumerCapableQueueClient;

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

    async dequeue<T = unknown>(queueName: string): Promise<QueueMessage<T> | undefined> {
      const visibilityTimeoutMs = resolveVisibilityTimeoutMs();
      const client = queue(queueName);
      if (typeof client.dequeue === 'function') {
        return client.dequeue<T>(visibilityTimeoutMs);
      }

      return callQueueRpc<QueueMessage<T> | undefined>(config, queueName, 'dequeue', {
        visibilityTimeoutMs,
      });
    },

    async ack(queueName: string, id: string): Promise<void> {
      const client = queue(queueName);
      if (typeof client.ack === 'function') {
        await client.ack(id, 'acknowledged');
        return;
      }

      await callQueueRpc(config, queueName, 'ack', { args: [id, 'acknowledged'] });
    },

    async fail(
      queueName: string,
      id: string,
      reason = 'failed by queue-zedgi worker'
    ): Promise<void> {
      const client = queue(queueName);
      if (typeof client.fail === 'function') {
        await client.fail(id, reason);
        return;
      }

      await callQueueRpc(config, queueName, 'fail', { args: [id, reason] });
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
