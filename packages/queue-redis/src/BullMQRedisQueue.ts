import type { BullMQPayload, QueueMessage } from '@zintrust/core';
import {
  Cloudflare,
  createLockProvider,
  createRedisConnection,
  Env,
  ErrorFactory,
  generateUuid,
  getBullMQSafeQueueName,
  getLockProvider,
  Logger,
  queueConfig,
  registerLockProvider,
  resolveLockPrefix,
  ZintrustLang,
} from '@zintrust/core';
import { Queue, type JobsOptions, type QueueOptions } from 'bullmq';
import { HttpQueueDriver } from './HttpQueueDriver';

type RedisConnection = ReturnType<typeof createRedisConnection>;

interface IQueueDriver {
  enqueue(queue: string, payload: BullMQPayload): Promise<string>;
  dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined>;
  ack(queue: string, id: string): Promise<void>;
  length(queue: string): Promise<number>;
  drain(queue: string): Promise<void>;
}

interface IBullMQRedisQueue extends IQueueDriver {
  getQueue(queueName: string): Queue;
  shutdown(): Promise<void>;
  closeQueue(queueName: string): Promise<void>;
  getQueueNames(): string[];
}

export const shouldUseHttpProxyDriver = (): boolean => {
  if (directModeDepth > 0) return false;
  const isCloudFlareWorkers = Cloudflare.getWorkersEnv() !== null;
  return isCloudFlareWorkers ?? Env.getBool('QUEUE_HTTP_PROXY_ENABLED', false);
};

let directModeDepth = 0;

export const runWithDirectQueueDriver = async <T>(fn: () => Promise<T>): Promise<T> => {
  directModeDepth += 1;
  try {
    return await fn();
  } finally {
    directModeDepth = Math.max(0, directModeDepth - 1);
  }
};

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

    const isWorkersRuntime = Cloudflare.getWorkersEnv() !== null;

    if (isWorkersRuntime && Cloudflare.isCloudflareSocketsEnabled() === false) {
      throw ErrorFactory.createConfigError(
        'BullMQ Redis driver requires ENABLE_CLOUDFLARE_SOCKETS=true in Cloudflare Workers. To use HTTP queue proxy mode, set QUEUE_HTTP_PROXY_ENABLED=true and QUEUE_HTTP_PROXY_URL.'
      );
    }

    const workersHost = Cloudflare.getWorkersVar('WORKERS_REDIS_HOST');
    const workersPortRaw = Cloudflare.getWorkersVar('WORKERS_REDIS_PORT');
    const workersPassword = Cloudflare.getWorkersVar('WORKERS_REDIS_PASSWORD');
    const workersDbRaw = Cloudflare.getWorkersVar('WORKERS_REDIS_QUEUE_DB');

    const resolvedHost =
      workersHost !== null && workersHost.trim() !== '' ? workersHost.trim() : Env.REDIS_HOST;

    const resolvedPort =
      workersPortRaw !== null && Number.isFinite(Number.parseInt(workersPortRaw, 10))
        ? Number.parseInt(workersPortRaw, 10)
        : Env.REDIS_PORT;

    const resolvedPassword =
      workersPassword !== null && workersPassword.trim() !== ''
        ? workersPassword
        : Env.REDIS_PASSWORD;

    const resolvedDb =
      workersDbRaw !== null && Number.isFinite(Number.parseInt(workersDbRaw, 10))
        ? Number.parseInt(workersDbRaw, 10)
        : Env.getInt('REDIS_QUEUE_DB', 0);

    const redisConfig = {
      host: resolvedHost,
      port: resolvedPort,
      password: resolvedPassword,
      database: resolvedDb,
    };

    if (
      isWorkersRuntime &&
      (redisConfig.host === 'localhost' || redisConfig.host === '127.0.0.1')
    ) {
      throw ErrorFactory.createConfigError(
        'Redis host cannot be localhost in Cloudflare Workers. Use a public Redis host, or enable queue HTTP proxy mode with QUEUE_HTTP_PROXY_ENABLED=true and QUEUE_HTTP_PROXY_URL.'
      );
    }
    sharedConnection = createRedisConnection({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.database,
    });
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
      try {
        await sharedConnection.quit();
        sharedConnection = null;
        Logger.info('Closed shared Redis connection');
      } catch (err) {
        Logger.error('Failed to close shared Redis connection', err);
      }
    }
  };

  const getQueue = (queueName: string): Queue => {
    if (shouldUseHttpProxyDriver()) {
      throw ErrorFactory.createConfigError(
        'BullMQ queue instance is not available when QUEUE_HTTP_PROXY mode is active.'
      );
    }

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

    const queue = new Queue(queueName, {
      connection: connection as QueueOptions['connection'],
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

  const createJobOptions = (payloadData: BullMQPayload): JobsOptions => {
    return {
      // Use uniqueId if present, otherwise generated
      jobId: payloadData?.uniqueId ?? generateUuid(),

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
    deduplicationId: string,
    provider: ReturnType<typeof getLockProviderForQueue>,
    replace: boolean,
    queue: string,
    jobId: string
  ): Promise<boolean> => {
    const status = await provider.status(deduplicationId);
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
    deduplicationId: string,
    provider: ReturnType<typeof getLockProviderForQueue>,
    ttl: number | undefined,
    queue: string,
    jobId: string
  ): Promise<boolean> => {
    const lockOptions = ttl ? { ttl } : {};
    const lock = await provider.acquire(deduplicationId, lockOptions);
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
    deduplicationId: string,
    provider: ReturnType<typeof getLockProviderForQueue>,
    ttl: number | undefined,
    releaseAfter: number
  ): void => {
    const timeoutId = globalThis.setTimeout(() => {
      provider.release({
        key: deduplicationId,
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
    releaseAfter: Exclude<BullMQPayload['deduplication'], undefined>['releaseAfter'],
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
    const ttl =
      typeof deduplication.ttl === 'number' && deduplication.ttl > 0
        ? deduplication.ttl
        : undefined;
    const replace = (deduplication as { replace?: boolean }).replace === true;

    // Check existing lock
    const hasExistingLock = await checkExistingLock(
      deduplicationId,
      provider,
      replace,
      queue,
      jobOptions.jobId as string
    );
    if (hasExistingLock) {
      return { payloadToSend: payloadData, shouldReturn: true, returnValue: deduplicationId };
    }

    // Acquire lock
    const lockAcquired = await acquireDeduplicationLock(
      deduplicationId,
      provider,
      ttl,
      queue,
      jobOptions.jobId as string
    );
    if (!lockAcquired) {
      return { payloadToSend: payloadData, shouldReturn: true, returnValue: deduplicationId };
    }

    // Keep jobs for deduplication tracking
    jobOptions.removeOnFail = 0;
    jobOptions.removeOnComplete = 0;

    let payloadToSend: BullMQPayload = payloadData;

    // Handle releaseAfter numeric
    if (typeof deduplication.releaseAfter === 'number' && deduplication.releaseAfter > 0) {
      scheduleLockRelease(deduplicationId, provider, ttl, deduplication.releaseAfter);
    }

    // Handle releaseAfter non-numeric
    if (
      deduplication.releaseAfter !== undefined &&
      deduplication.releaseAfter !== null &&
      typeof deduplication.releaseAfter !== 'number'
    ) {
      payloadToSend = attachWorkerSideReleaseMeta(
        payloadToSend,
        deduplicationId,
        deduplication.releaseAfter,
        payloadData.uniqueId
      );
    }

    return { payloadToSend, shouldReturn: false };
  };

  return {
    getQueue,
    shutdown,
    closeQueue,
    getQueueNames,

    async enqueue(queue: string, payload: BullMQPayload): Promise<string> {
      if (shouldUseHttpProxyDriver()) {
        return HttpQueueDriver.enqueue(queue, payload);
      }

      try {
        const q = getQueue(queue);

        // Extract BullMQ options from payload with proper typing
        const payloadData = payload as BullMQPayload;
        const jobOptions = createJobOptions(payloadData);
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
        throw ErrorFactory.createTryCatchError('Failed to enqueue job via BullMQ', error as Error);
      }
    },

    async dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined> {
      if (shouldUseHttpProxyDriver()) {
        return HttpQueueDriver.dequeue<T>(queue);
      }

      try {
        const q = getQueue(queue);

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
      if (shouldUseHttpProxyDriver()) {
        await HttpQueueDriver.ack(queue, id);
        return;
      }

      try {
        const q = getQueue(queue);
        const job = await q.getJob(id);

        if (job) {
          // Remove the job entirely upon success
          await job.remove();
          Logger.debug(`BullMQ: Job ${id} acked and removed from ${queue}`);
        } else {
          Logger.warn(`BullMQ: ACK failed - job ${id} not found in ${queue}`);
        }
      } catch (error) {
        Logger.error(`BullMQ: Failed to ack job ${id}`, error as Error);
      }
    },

    async length(queue: string): Promise<number> {
      if (shouldUseHttpProxyDriver()) {
        return HttpQueueDriver.length(queue);
      }

      try {
        const q = getQueue(queue);
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
      if (shouldUseHttpProxyDriver()) {
        await HttpQueueDriver.drain(queue);
        return;
      }

      try {
        const q = getQueue(queue);
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
