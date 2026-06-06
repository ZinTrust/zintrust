import { Cloudflare } from '@zintrust/core/cloudflare';
import { Env, queueConfig } from '@zintrust/core/config';
import { ErrorFactory } from '@zintrust/core/errors';
import { isNullish, isUndefinedOrNull } from '@zintrust/core/helper';
import { Logger } from '@zintrust/core/logger';
import type { BullMQPayload, QueueMessage } from '@zintrust/core/queue';
import {
  createLockProvider,
  getLockProvider,
  registerLockProvider,
  resolveDeduplicationLockKey,
  resolveLockPrefix,
} from '@zintrust/core/queue';
import { createRedisConnection, getBullMQSafeQueueName } from '@zintrust/core/redis';
import { generateUuid, ZintrustLang } from '@zintrust/core/utils';
import type { JobsOptions, Queue } from 'bullmq';
import { RedisRpcQueueDriver, shouldUseRedisRpcQueueDriver } from './RedisRpcQueueDriver';

type RedisConnection = ReturnType<typeof createRedisConnection>;

// Lazy BullMQ loader keyed on a variable specifier so bundlers (esbuild/wrangler)
// do not inline bullmq/ioredis into the Workers bundle. Every public method routes
// through RedisRpcQueueDriver first when shouldUseRedisRpcQueueDriver() is true
// (always, on Workers), so this loader never runs there.
let QueueCtor: typeof Queue | undefined;
const ensureBullmqLoaded = async (): Promise<typeof Queue> => {
  if (QueueCtor !== undefined) return QueueCtor;
  const bullmqPkg = 'bullmq';
  const loaded = (await import(bullmqPkg)).Queue;
  QueueCtor = loaded;
  return loaded;
};

interface IQueueDriver {
  enqueue(queue: string, payload: BullMQPayload): Promise<string>;
  dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined>;
  ack(queue: string, id: string): Promise<void>;
  length(queue: string): Promise<number>;
  drain(queue: string): Promise<void>;
}

interface IBullMQRedisQueue extends IQueueDriver {
  getQueue(queueName: string): Promise<Queue>;
  shutdown(): Promise<void>;
  closeQueue(queueName: string): Promise<void>;
  getQueueNames(): string[];
}

type DeduplicationReleaseAfter = Exclude<BullMQPayload['deduplication'], undefined>['releaseAfter'];

/**
 * BullMQ Redis Queue Driver
 *
 * Implements the same interface as the basic Redis driver but uses BullMQ internally.
 * This provides enterprise features while maintaining full API compatibility.
 */
export const BullMQRedisQueue = ((): IBullMQRedisQueue => {
  const queues = new Map<string, Queue>();
  let sharedConnection: RedisConnection | null = null;
  let lockProviderCache: ReturnType<typeof createLockProvider> | null = null;
  const PULL_WORKER_TOKEN = 'pull-worker';
  const SHARED_CONNECTION_SHUTDOWN_TIMEOUT_MS = 100;

  const resolveQueueRedisConfig = (): {
    host: string;
    port: number;
    password?: string;
    database: number;
  } => {
    let workersHost = Cloudflare.getWorkersVar('WORKERS_REDIS_HOST');
    let workersPortRaw = Cloudflare.getWorkersVar('WORKERS_REDIS_PORT');
    let workersPassword = Cloudflare.getWorkersVar('WORKERS_REDIS_PASSWORD');
    let workersDbRaw = Cloudflare.getWorkersVar('WORKERS_REDIS_QUEUE_DB');

    if (isUndefinedOrNull(workersPassword) || isNullish(workersPassword)) {
      workersPassword = Env.get('REDIS_PASSWORD', '');
    }
    if (isUndefinedOrNull(workersPortRaw) || isNullish(workersPortRaw)) {
      workersPortRaw = Env.get('REDIS_PORT', '6379');
    }
    if (isUndefinedOrNull(workersHost) || isNullish(workersHost)) {
      workersHost = Env.get('REDIS_HOST', '127.0.0.1');
    }

    if (isUndefinedOrNull(workersDbRaw) || isNullish(workersDbRaw)) {
      workersDbRaw = Env.get('REDIS_QUEUE_DB', '0');
    }

    return {
      host: workersHost,
      port: Number(workersPortRaw),
      password: workersPassword,
      database: Number(workersDbRaw),
    };
  };

  const assertWorkersHostIsReachable = (
    isWorkersRuntime: boolean,
    redisConfig: { host: string }
  ): void => {
    if (
      isWorkersRuntime &&
      (redisConfig.host === 'localhost' || redisConfig.host === '127.0.0.1')
    ) {
      throw ErrorFactory.createConfigError(
        'Redis host cannot be localhost in Cloudflare Workers. Use a public Redis host.'
      );
    }
  };

  const createSharedBullMqConnection = (): RedisConnection => {
    const isWorkersRuntime = Cloudflare.getWorkersEnv() !== null;

    const redisConfig = resolveQueueRedisConfig();
    assertWorkersHostIsReachable(isWorkersRuntime, redisConfig);

    return createRedisConnection(
      {
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        db: redisConfig.database,
      },
      3,
      { subsystem: 'queue-bullmq' }
    );
  };

  const getDefaultLockDriveName = (): string => {
    const driver = queueConfig.default;
    return driver.length > 0 ? driver : ZintrustLang.REDIS;
  };

  const getLockProviderForQueue = (name?: string): ReturnType<typeof createLockProvider> => {
    const providerName = (name ?? getDefaultLockDriveName()).trim().toLowerCase();
    const existing = getLockProvider(providerName);
    if (existing) return existing;

    if (lockProviderCache && providerName === getDefaultLockDriveName()) {
      return lockProviderCache;
    }

    if (providerName !== ZintrustLang.REDIS && providerName !== ZintrustLang.MEMORY) {
      throw ErrorFactory.createConfigError(`Lock provider not found: ${providerName}`);
    }

    const prefix = resolveLockPrefix();
    const defaultTtl = Env.getInt('QUEUE_DEFAULT_DEDUP_TTL', 86_400_000);
    const provider = createLockProvider({
      type: providerName === ZintrustLang.REDIS ? ZintrustLang.REDIS : ZintrustLang.MEMORY,
      prefix: prefix.length > 0 ? prefix : ZintrustLang.ZINTRUST_LOCKS_PREFIX,
      defaultTtl,
    });

    registerLockProvider(providerName, provider);
    if (providerName === getDefaultLockDriveName()) {
      lockProviderCache = provider;
    }
    return provider;
  };

  const getSharedConnection = (): RedisConnection => {
    if (sharedConnection) return sharedConnection;
    sharedConnection = createSharedBullMqConnection();
    return sharedConnection; // sharedConnection is IoRedis (compatible with BullMQ)
  };

  const waitForRedisReady = async (client: RedisConnection, timeoutMs: number): Promise<void> => {
    if (client.status === 'ready') return;

    await new Promise<void>((resolve, reject) => {
      const timeoutId = globalThis.setTimeout(() => {
        reject(ErrorFactory.createConnectionError('Redis connection timeout while enqueueing job'));
      }, timeoutMs);

      const cleanup = (): void => {
        clearTimeout(timeoutId);
        client.off('ready', onReady);
        client.off('error', onError);
        client.off('end', onEnd);
      };

      const onReady = (): void => {
        cleanup();
        resolve();
      };

      const onError = (err: Error): void => {
        cleanup();
        reject(err);
      };

      const onEnd = (): void => {
        cleanup();
        reject(ErrorFactory.createConnectionError('Redis connection closed while enqueueing job'));
      };

      client.once('ready', onReady);
      client.once('error', onError);
      client.once('end', onEnd);
    });
  };

  const closeSharedConnection = async (client: RedisConnection): Promise<void> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        client.quit(),
        new Promise<never>((_, reject) => {
          timeoutId = globalThis.setTimeout(() => {
            reject(
              ErrorFactory.createGeneralError('BullMQ shared Redis shutdown timed out', {
                timeoutMs: SHARED_CONNECTION_SHUTDOWN_TIMEOUT_MS,
              })
            );
          }, SHARED_CONNECTION_SHUTDOWN_TIMEOUT_MS);
          (timeoutId as { unref?: () => void }).unref?.();
        }),
      ]);

      Logger.info('Closed shared Redis connection');
    } catch (err) {
      Logger.warn('BullMQ shared Redis graceful shutdown failed, forcing disconnect', err as Error);

      try {
        const disconnect = (client as { disconnect?: () => void }).disconnect;
        if (typeof disconnect === 'function') disconnect.call(client);
      } catch (disconnectError) {
        Logger.error('Failed to force disconnect BullMQ shared Redis connection', disconnectError);
      }
    } finally {
      if (timeoutId !== undefined) {
        globalThis.clearTimeout(timeoutId);
      }

      sharedConnection = null;
    }
  };

  const shutdown = async (): Promise<void> => {
    Logger.info('BullMQRedisQueue shutting down...');

    // Close all queues in parallel
    const closePromises = Array.from(queues.entries()).map(async ([name, queue]) => {
      try {
        await queue.close();
        Logger.debug(`Closed queue "${name}"`);
      } catch (err) {
        Logger.error(`Failed to close queue "${name}"`, err);
      }
    });

    await Promise.allSettled(closePromises);
    queues.clear();

    // Close shared connection
    if (sharedConnection) {
      await closeSharedConnection(sharedConnection);
    }
  };

  const getQueue = async (queueName: string): Promise<Queue> => {
    const QueueConstructor = await ensureBullmqLoaded();

    // Check if queue exists in cache
    if (queues.has(queueName)) {
      const existingQueue = queues.get(queueName);
      // LRU Mechanic: Promote to newest by deleting and re-inserting
      queues.delete(queueName);
      if (existingQueue) {
        queues.set(queueName, existingQueue);
        return existingQueue;
      }
    }

    // Memory Leak Protection: Limit cached queues
    if (queues.size >= 50) {
      // Find queue with no activity or just remove oldest?
      // Since we can't easily track activity, we remove the first key (oldest)
      // and close it to release Redis connections.
      const oldestKey = queues.keys().next().value;
      if (oldestKey) {
        const oldQueue = queues.get(oldestKey);
        oldQueue?.close().catch((err) => Logger.error('BullMQ: Failed to close old queue', err));
        queues.delete(oldestKey);
        Logger.debug(`BullMQ: Cleaned up cached queue ${oldestKey} to free resources`);
      }
    }

    const connection = getSharedConnection();

    // Customizable BullMQ settings from environment
    const removeOnComplete = Env.getInt('BULLMQ_REMOVE_ON_COMPLETE', 100);
    const removeOnFail = Env.getInt('BULLMQ_REMOVE_ON_FAIL', 50);
    const attempts = Env.getInt('BULLMQ_DEFAULT_ATTEMPTS', 3);
    const backoffDelay = Env.getInt('BULLMQ_BACKOFF_DELAY', 2000);
    const backoffType = Env.get('BULLMQ_BACKOFF_TYPE', 'exponential');
    const prefix = getBullMQSafeQueueName();

    const queue = new QueueConstructor(queueName, {
      connection: connection,
      prefix,
      defaultJobOptions: {
        removeOnComplete,
        removeOnFail,
        attempts,
        backoff: {
          type: backoffType as 'exponential' | 'fixed' | 'custom',
          delay: backoffDelay,
        },
      },
    });

    queues.set(queueName, queue);
    return queue;
  };

  const closeQueue = async (queueName: string): Promise<void> => {
    const queue = queues.get(queueName);
    if (queue) {
      await queue.close();
      queues.delete(queueName);
      Logger.debug(`BullMQ: Closed queue "${queueName}"`);
    }
  };

  const getQueueNames = (): string[] => {
    return Array.from(queues.keys());
  };

  const resolveRequestedJobId = (payloadData: BullMQPayload): string => {
    if (typeof payloadData?.jobId === 'string' && payloadData.jobId.trim().length > 0) {
      return payloadData.jobId.trim();
    }
    return generateUuid();
  };

  const createJobOptions = (payloadData: BullMQPayload): JobsOptions => {
    return {
      // Prefer the explicit BullMQ jobId and keep uniqueId as a legacy alias.
      jobId: resolveRequestedJobId(payloadData),

      // CRITICAL: Delay scheduling
      delay: payloadData.delay,

      // IMPORTANT: Retry configuration
      attempts: payloadData.attempts,

      // MEDIUM: Job prioritization
      priority: payloadData.priority,

      // CLEANUP: Job retention
      removeOnComplete: payloadData.removeOnComplete || 100,
      removeOnFail: payloadData.removeOnFail || 50,

      // RETRY: Backoff strategy
      backoff: payloadData.backoff || {
        type: 'exponential',
        delay: 2000,
      },

      // SCHEDULING: Recurring jobs
      repeat: payloadData.repeat,

      // ORDERING: LIFO vs FIFO
      lifo: payloadData.lifo ?? false,
    };
  };

  const validateDeduplicationId = (
    deduplication: BullMQPayload['deduplication']
  ): string | null => {
    if (!deduplication?.id) return null;
    const deduplicationId = String(deduplication.id).trim();
    return deduplicationId.length > 0 ? deduplicationId : null;
  };

  const checkExistingLock = async (
    scopedDeduplicationKey: string,
    deduplicationId: string,
    provider: ReturnType<typeof getLockProviderForQueue>,
    replace: boolean,
    queue: string,
    jobId: string
  ): Promise<boolean> => {
    const status = await provider.status(scopedDeduplicationKey);
    if (status.exists && !replace) {
      Logger.info('BullMQ: Job deduplicated', {
        queue,
        deduplicationId,
        jobId,
      });
      return true;
    }
    return false;
  };

  const acquireDeduplicationLock = async (
    scopedDeduplicationKey: string,
    deduplicationId: string,
    provider: ReturnType<typeof getLockProviderForQueue>,
    ttl: number | undefined,
    queue: string,
    jobId: string
  ): Promise<boolean> => {
    const lockOptions = ttl ? { ttl } : {};
    const lock = await provider.acquire(scopedDeduplicationKey, lockOptions);
    if (!lock.acquired) {
      Logger.info('BullMQ: Job deduplicated (lock collision)', {
        queue,
        deduplicationId,
        jobId,
      });
      return false;
    }

    Logger.debug('BullMQ: Deduplication lock acquired', {
      queue,
      deduplicationId,
      ttl,
    });
    return true;
  };

  const scheduleLockRelease = (
    scopedDeduplicationKey: string,
    provider: ReturnType<typeof getLockProviderForQueue>,
    ttl: number | undefined,
    releaseAfter: number
  ): void => {
    const timeoutId = globalThis.setTimeout(() => {
      provider.release({
        key: scopedDeduplicationKey,
        ttl: ttl ?? 0,
        acquired: true,
        expires: new Date(Date.now() + (ttl ?? 0)),
      });
    }, releaseAfter);
    timeoutId.unref();
  };

  const attachWorkerSideReleaseMeta = (
    payload: BullMQPayload,
    deduplicationId: string,
    releaseAfter: DeduplicationReleaseAfter,
    uniqueId: string | undefined
  ): BullMQPayload => {
    return {
      ...payload,
      __zintrustQueueMeta: {
        deduplicationId,
        releaseAfter,
        uniqueId,
      },
    };
  };

  const handleReleaseAfter = (
    payload: BullMQPayload,
    deduplicationId: string,
    releaseAfter: DeduplicationReleaseAfter,
    uniqueId?: string
  ): BullMQPayload => {
    if (releaseAfter !== undefined && releaseAfter !== null && typeof releaseAfter !== 'number') {
      return attachWorkerSideReleaseMeta(payload, deduplicationId, releaseAfter, uniqueId);
    }
    return payload;
  };

  const handleDeduplication = async (
    payloadData: BullMQPayload,
    jobOptions: JobsOptions,
    queue: string
  ): Promise<{ payloadToSend: BullMQPayload; shouldReturn: boolean; returnValue?: string }> => {
    const deduplicationId = validateDeduplicationId(payloadData.deduplication);
    if (!deduplicationId) {
      return { payloadToSend: payloadData, shouldReturn: false };
    }

    const deduplication = payloadData.deduplication;
    if (!deduplication) {
      return { payloadToSend: payloadData, shouldReturn: false };
    }
    const provider = getLockProviderForQueue(payloadData.uniqueVia);
    const scopedDeduplicationKey = resolveDeduplicationLockKey(queue, deduplicationId);
    const ttl =
      typeof deduplication.ttl === 'number' && deduplication.ttl > 0
        ? deduplication.ttl
        : undefined;
    const replace = (deduplication as { replace?: boolean }).replace === true;
    const collisionBehavior =
      deduplication.collisionBehavior === 'enqueue' ? 'enqueue' : 'suppress';
    const jobId = jobOptions.jobId ?? generateUuid();
    jobOptions.jobId = jobId;

    // Check existing lock
    const hasExistingLock = await checkExistingLock(
      scopedDeduplicationKey,
      deduplicationId,
      provider,
      replace,
      queue,
      jobId
    );
    if (hasExistingLock && collisionBehavior === 'suppress') {
      return { payloadToSend: payloadData, shouldReturn: true, returnValue: deduplicationId };
    }

    let lockAcquired = false;
    if (!hasExistingLock) {
      // Acquire lock
      lockAcquired = await acquireDeduplicationLock(
        scopedDeduplicationKey,
        deduplicationId,
        provider,
        ttl,
        queue,
        jobId
      );
      if (!lockAcquired && collisionBehavior === 'suppress') {
        return { payloadToSend: payloadData, shouldReturn: true, returnValue: deduplicationId };
      }
    }

    // Keep jobs for deduplication tracking
    jobOptions.removeOnFail = 0;
    jobOptions.removeOnComplete = 0;

    let payloadToSend: BullMQPayload = payloadData;

    // Handle releaseAfter numeric
    if (
      lockAcquired &&
      typeof deduplication.releaseAfter === 'number' &&
      deduplication.releaseAfter > 0
    ) {
      scheduleLockRelease(scopedDeduplicationKey, provider, ttl, deduplication.releaseAfter);
    }

    payloadToSend = handleReleaseAfter(
      payloadToSend,
      deduplicationId,
      deduplication.releaseAfter,
      payloadData.uniqueId
    );

    return { payloadToSend, shouldReturn: false };
  };

  return {
    getQueue,
    shutdown,
    closeQueue,
    getQueueNames,

    async enqueue(queue: string, payload: BullMQPayload): Promise<string> {
      if (shouldUseRedisRpcQueueDriver()) {
        return RedisRpcQueueDriver.enqueue(queue, payload);
      }

      let requestedJobId: string | number | undefined;

      try {
        const q = await getQueue(queue);

        // Extract BullMQ options from payload with proper typing
        const payloadData = payload;
        const jobOptions = createJobOptions(payloadData);
        requestedJobId = jobOptions.jobId;
        // Handle deduplication
        const deduplicationResult = await handleDeduplication(payloadData, jobOptions, queue);
        if (deduplicationResult.shouldReturn && deduplicationResult.returnValue) {
          return deduplicationResult.returnValue;
        }

        const connectTimeoutMs = Env.getInt('QUEUE_REDIS_CONNECT_TIMEOUT', 5000);
        await waitForRedisReady(getSharedConnection(), connectTimeoutMs);
        // 🎯 Custom lock provider support (ensure provider exists for uniqueVia)
        if (payloadData.uniqueVia) {
          getLockProviderForQueue(payloadData.uniqueVia);
        }

        const job = await q.add(`${queue}-job`, deduplicationResult.payloadToSend, jobOptions);
        Logger.debug(`BullMQ: Job enqueued to ${queue}`, { jobId: job.id, queue });

        return String(job.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // BullMQ throws when a job with the same jobId already exists.
        // In enqueue-fallback/recovery paths we want strict idempotency: treat as success.
        if (
          requestedJobId !== undefined &&
          /jobid/i.test(message) &&
          /already exists/i.test(message)
        ) {
          return String(requestedJobId);
        }
        throw ErrorFactory.createTryCatchError('Failed to enqueue job via BullMQ', error as Error);
      }
    },

    async dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined> {
      if (shouldUseRedisRpcQueueDriver()) {
        return RedisRpcQueueDriver.dequeue<T>(queue);
      }

      try {
        const q = await getQueue(queue);

        const jobs = await q.getJobs(['waiting'], 0, 1);
        if (jobs.length === 0) return undefined;

        const job = jobs[0];

        // Implements Visibility Timeout Pattern:
        // Move to delayed state (30s) to "lock" it from other consumers without losing data on crash.
        // If ack() is not called within 30s, the job reappears in waiting.
        // We use a fixed token 'pull-worker' as we don't have a specific worker ID in this context.
        await job.moveToDelayed(Date.now() + 30000, 'pull-worker');

        const message: QueueMessage<T> = {
          id: String(job.id),
          payload: job.data as T,
          attempts: job.attemptsMade || 0,
        };

        Logger.debug(`BullMQ: Job dequeued from ${queue}`, {
          jobId: job.id,
          payload: message.payload,
        });
        return message;
      } catch (error) {
        Logger.error('BullMQ: Failed to dequeue job', error as Error);
        throw ErrorFactory.createTryCatchError('Failed to dequeue job via BullMQ', error as Error);
      }
    },

    async ack(queue: string, id: string): Promise<void> {
      if (shouldUseRedisRpcQueueDriver()) {
        await RedisRpcQueueDriver.ack(queue, id);
        return;
      }

      try {
        const q = await getQueue(queue);
        const job = await q.getJob(id);

        if (job) {
          await job.moveToCompleted('acknowledged', PULL_WORKER_TOKEN, false);
          Logger.debug(`BullMQ: Job ${id} acked and completed in ${queue}`);
        } else {
          Logger.warn(`BullMQ: ACK failed - job ${id} not found in ${queue}`);
        }
      } catch (error) {
        Logger.error(`BullMQ: Failed to ack job ${id}`, error as Error);
      }
    },

    async length(queue: string): Promise<number> {
      if (shouldUseRedisRpcQueueDriver()) {
        return RedisRpcQueueDriver.length(queue);
      }

      try {
        const q = await getQueue(queue);
        const counts = await q.getJobCounts();

        return counts['waiting'] || 0;
      } catch (error) {
        Logger.error('BullMQ: Failed to get queue length', error as Error);
        throw ErrorFactory.createTryCatchError(
          'Failed to get queue length via BullMQ',
          error as Error
        );
      }
    },

    async drain(queue: string): Promise<void> {
      if (shouldUseRedisRpcQueueDriver()) {
        await RedisRpcQueueDriver.drain(queue);
        return;
      }

      try {
        const q = await getQueue(queue);
        await q.drain();
        Logger.debug(`BullMQ: Queue ${queue} drained`);
      } catch (error) {
        Logger.error('BullMQ: Failed to drain queue', error as Error);
        throw ErrorFactory.createTryCatchError('Failed to drain queue via BullMQ', error as Error);
      }
    },
  } as const;
})();

export default BullMQRedisQueue;
