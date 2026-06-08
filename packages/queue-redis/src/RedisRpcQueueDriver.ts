import { Env } from '@zintrust/core/config';
import { ErrorFactory } from '@zintrust/core/errors';
import type { BullMQPayload, QueueMessage } from '@zintrust/core/queue';
import { JobStateTracker, TimeoutManager } from '@zintrust/core/queue';
import { generateUuid } from '@zintrust/core/utils';
import type { JobsOptions } from 'bullmq';
import { resolveRetentionSetting } from './retentionUtils';

type RedisRpcClient = {
  queue: <T = unknown>(method: string, payload?: Record<string, unknown>) => Promise<T>;
};

export interface IQueueDriver {
  enqueue(queue: string, payload: BullMQPayload): Promise<string>;
  dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined>;
  ack(queue: string, id: string): Promise<void>;
  length(queue: string): Promise<number>;
  drain(queue: string): Promise<void>;
}

export const shouldUseRedisRpcQueueDriver = (): boolean => {
  return Env.USE_REDIS_PROXY === true && Env.get('REDIS_RPC_URL', '').trim() !== '';
};

const resolveRpcBaseUrl = (): string => {
  const configured = Env.get('REDIS_RPC_URL', '').trim();
  if (configured.length > 0) return configured;
  const host = Env.get('REDIS_RPC_HOST', '127.0.0.1').trim() || '127.0.0.1';
  const port = Env.getInt('REDIS_RPC_PORT', 8794);
  return `http://${host}:${port}`;
};

const createRpcClient = async (): Promise<RedisRpcClient> => {
  try {
    const { createRedisRpcClient } = await import('@zintrust/redis-rpc/client');
    return createRedisRpcClient({
      baseUrl: resolveRpcBaseUrl(),
      secret: Env.get('REDIS_RPC_SECRET', Env.get('REDIS_PROXY_SECRET', Env.APP_KEY)),
    });
  } catch (error) {
    throw ErrorFactory.createConfigError(
      '@zintrust/redis-rpc is required when USE_REDIS_PROXY=true and REDIS_RPC_URL is configured',
      error
    );
  }
};

const resolveRequestedJobId = (payloadData: BullMQPayload): string => {
  if (typeof payloadData?.jobId === 'string' && payloadData.jobId.trim().length > 0) {
    return payloadData.jobId.trim();
  }
  return generateUuid();
};

const createJobOptions = (payloadData: BullMQPayload): JobsOptions => ({
  jobId: resolveRequestedJobId(payloadData),
  delay: payloadData.delay,
  attempts: payloadData.attempts ?? Env.getInt('BULLMQ_DEFAULT_ATTEMPTS', 3),
  priority: payloadData.priority,
  removeOnComplete: payloadData.removeOnComplete ?? resolveRetentionSetting('BULLMQ_REMOVE_ON_COMPLETE', 100),
  removeOnFail: payloadData.removeOnFail ?? resolveRetentionSetting('BULLMQ_REMOVE_ON_FAIL', 50),
  backoff: payloadData.backoff || {
    type: Env.get('BULLMQ_BACKOFF_TYPE', 'exponential') as 'exponential' | 'fixed',
    delay: Env.getInt('BULLMQ_BACKOFF_DELAY', 2000),
  },
  repeat: payloadData.repeat,
  lifo: payloadData.lifo ?? false,
});

const resolveJobId = (result: unknown, fallback: string): string => {
  if (typeof result === 'object' && result !== null) {
    const id = (result as { id?: unknown }).id;
    if (typeof id === 'string' && id.trim().length > 0) return id;
    if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  }
  return fallback;
};

const markPendingRecoveryFallback = async (input: {
  queue: string;
  fallbackJobId: string;
  payload: BullMQPayload;
  error: unknown;
}): Promise<void> => {
  const payload = input.payload as Record<string, unknown>;
  const currentAttempts =
    typeof payload['_currentAttempts'] === 'number' && Number.isFinite(payload['_currentAttempts'])
      ? Math.max(0, Math.floor(payload['_currentAttempts']))
      : 0;
  const maxAttempts =
    typeof payload['attempts'] === 'number' && Number.isFinite(payload['attempts'])
      ? Math.max(1, Math.floor(payload['attempts']))
      : undefined;
  const idempotencyKey =
    typeof payload['uniqueId'] === 'string' && payload['uniqueId'].trim().length > 0
      ? payload['uniqueId'].trim()
      : undefined;

  await (
    JobStateTracker as unknown as {
      enqueued: (input: Record<string, unknown>) => Promise<void>;
    }
  ).enqueued({
    queueName: input.queue,
    jobId: input.fallbackJobId,
    payload: input.payload,
    attempts: currentAttempts,
    maxAttempts,
    idempotencyKey,
  });

  const pendingRecoveryApi = JobStateTracker as unknown as {
    pendingRecovery?: (input: Record<string, unknown>) => Promise<void>;
  };
  await pendingRecoveryApi.pendingRecovery?.({
    queueName: input.queue,
    jobId: input.fallbackJobId,
    reason: 'Redis RPC enqueue failed; marked pending recovery',
    error: input.error,
  });
};

export const RedisRpcQueueDriver: IQueueDriver = Object.freeze({
  async enqueue(queue: string, payload: BullMQPayload): Promise<string> {
    const fallbackJobId = resolveRequestedJobId(payload);
    const timeoutMs = Env.getInt(
      'REDIS_RPC_TIMEOUT_MS',
      Env.getInt('QUEUE_HTTP_PROXY_TIMEOUT_MS', 10000)
    );
    const options = createJobOptions({ ...payload, jobId: fallbackJobId });

    try {
      return await TimeoutManager.withTimeoutRetry(
        async () => {
          const client = await createRpcClient();
          const result = await client.queue('add', {
            target: queue,
            args: [`${queue}-job`, payload, options as Record<string, unknown>],
          });
          return resolveJobId(result, fallbackJobId);
        },
        {
          timeoutMs,
          maxRetries: Math.max(
            0,
            Env.getInt('REDIS_RPC_RETRY_MAX', Env.getInt('QUEUE_HTTP_PROXY_RETRY_MAX', 2))
          ),
          retryDelayMs: Math.max(
            0,
            Env.getInt(
              'REDIS_RPC_RETRY_DELAY_MS',
              Env.getInt('QUEUE_HTTP_PROXY_RETRY_DELAY_MS', 500)
            )
          ),
          operationName: `redis-rpc-queue-enqueue:${queue}`,
        }
      );
    } catch (error) {
      await markPendingRecoveryFallback({ queue, fallbackJobId, payload, error });
      return fallbackJobId;
    }
  },

  async dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined> {
    const client = await createRpcClient();
    return client.queue<QueueMessage<T> | undefined>('dequeue', {
      target: queue,
      visibilityTimeoutMs: Env.getInt('QUEUE_REDIS_VISIBILITY_TIMEOUT_MS', 30_000),
    });
  },

  async ack(queue: string, id: string): Promise<void> {
    const client = await createRpcClient();
    await client.queue('ack', { target: queue, args: [id] });
  },

  async length(queue: string): Promise<number> {
    const client = await createRpcClient();
    return client.queue<number>('length', { target: queue });
  },

  async drain(queue: string): Promise<void> {
    const client = await createRpcClient();
    await client.queue('drain', { target: queue });
  },
});

export default RedisRpcQueueDriver;
