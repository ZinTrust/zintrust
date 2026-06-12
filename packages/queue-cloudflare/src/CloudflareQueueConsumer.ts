/* eslint-disable no-await-in-loop -- Sequential processing required for queue operations */
import type { CloudflareJobStore } from './CloudflareJobStore.js';
import type {
  CloudflareQueueCoordinatorStub,
  CloudflareQueueEnvelope,
  CloudflareQueueJob,
  CloudflareQueueProcessor,
  CloudflareQueueStateConfig,
} from './types.js';

type CloudflareMessageLike = {
  id: string;
  body: unknown;
  attempts: number;
  ack: () => void;
  retry: (options?: { delaySeconds?: number }) => void;
};

type CloudflareBatchLike = {
  queue: string;
  messages: CloudflareMessageLike[];
};

export type CloudflareQueueConsumerConfig<T = unknown, TResult = unknown> = {
  queueName?: string;
  store: CloudflareJobStore;
  processor: CloudflareQueueProcessor<T, TResult>;
  state?: CloudflareQueueStateConfig;
  retryDelaySeconds?: number;
  queue?: {
    enqueue<TPayload = unknown>(queue: string, payload: TPayload): Promise<unknown>;
  };
};

const isEnvelope = (value: unknown): value is CloudflareQueueEnvelope => {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as CloudflareQueueEnvelope).protocol === 'zintrust.cf.queue.v1' &&
    typeof (value as CloudflareQueueEnvelope).jobId === 'string'
  );
};

const getCoordinatorFromStub = (
  stub: import('./types.js').CloudflareQueueCoordinatorBinding | undefined,
  queueName: string
): import('./types.js').CloudflareQueueCoordinatorStub | null => {
  if (stub?.getByName !== undefined) return stub.getByName(queueName);
  if (stub?.idFromName !== undefined && stub.get !== undefined) {
    return stub.get(stub.idFromName(queueName));
  }
  return null;
};

const resolveCoordinator = (
  config?: CloudflareQueueStateConfig,
  queueName: string = 'default'
): CloudflareQueueCoordinatorStub | null => {
  const direct = config?.coordinator;
  const fromDirect = getCoordinatorFromStub(direct, queueName);
  if (fromDirect !== null) return fromDirect;

  const env = (globalThis as unknown as { env?: Record<string, unknown> }).env;
  const bindingName = config?.coordinatorBindingName ?? 'QUEUE_COORDINATOR';
  const binding = env?.[bindingName] as typeof direct | undefined;
  return getCoordinatorFromStub(binding, queueName);
};

const resolveWorkerId = (config?: CloudflareQueueStateConfig): string => {
  return config?.workerId ?? 'queue-cloudflare-worker';
};

const resolveRetryDelay = (
  job: CloudflareQueueJob,
  attempts: number,
  baseDelaySeconds: number
): number => {
  const backoff = job.opts.backoff;
  const baseMs = backoff?.delay ?? baseDelaySeconds * 1000;
  const delayMs = backoff?.type === 'fixed' ? baseMs : baseMs * 2 ** Math.max(0, attempts);
  return Math.min(Math.max(0, Math.ceil(delayMs / 1000)), 43200);
};

const toEnvelope = (job: CloudflareQueueJob): CloudflareQueueEnvelope => ({
  protocol: 'zintrust.cf.queue.v1',
  jobId: job.id,
  queueName: job.queueName,
  name: job.name,
  attempt: job.attemptsMade,
  availableAt: job.availableAt,
});

const serializeError = (error: unknown): unknown => {
  if (error instanceof Error)
    return { name: error.name, message: error.message, stack: error.stack };
  return error;
};

const createProcessorContext = <T = unknown, TResult = unknown>(
  config: CloudflareQueueConsumerConfig<T, TResult>,
  queueName: string,
  job: CloudflareQueueJob<T>,
  coordinator: CloudflareQueueCoordinatorStub | null,
  message: CloudflareMessageLike
): {
  job: CloudflareQueueJob<T>;
  attempt: number;
  updateProgress: (progress: unknown) => Promise<void>;
  log: (logMessage: string, data?: unknown) => Promise<void>;
  heartbeat: () => Promise<void>;
} => ({
  job,
  attempt: message.attempts,
  updateProgress: async (progress: unknown): Promise<void> => {
    await config.store.updateProgress(queueName, job.id, progress);
  },
  log: async (logMessage: string, data?: unknown): Promise<void> => {
    await config.store.recordLog(queueName, job.id, 'info', logMessage, data);
  },
  heartbeat: async (): Promise<void> => {
    await coordinator?.heartbeat?.({
      queueName,
      jobId: job.id,
      workerId: resolveWorkerId(config.state),
      ttlMs: config.state?.heartbeatTtlMs ?? 60_000,
    });
    await config.store.updateState({
      queueName,
      jobId: job.id,
      state: 'active',
    });
  },
});

const handleJobSuccess = async <T = unknown, TResult = unknown>(
  config: CloudflareQueueConsumerConfig<T, TResult>,
  queueName: string,
  job: CloudflareQueueJob<T>,
  result: TResult,
  coordinator: CloudflareQueueCoordinatorStub | null,
  message: CloudflareMessageLike
): Promise<void> => {
  await config.store.updateState({
    queueName,
    jobId: job.id,
    state: 'completed',
    result,
  });
  const releasedParents = await config.store.markFlowChildCompleted(queueName, job.id);
  for (const parent of releasedParents) {
    await config.queue?.enqueue(parent.queueName, toEnvelope(parent));
    await config.store.markDispatched(parent.queueName, parent.id);
  }
  await config.store.applyRetention(queueName, job.id, 'completed');
  await coordinator?.releaseLease?.({
    queueName,
    jobId: job.id,
    workerId: resolveWorkerId(config.state),
    ttlMs: config.state?.heartbeatTtlMs ?? 60_000,
  });
  message.ack();
};

const handleJobFailure = async <T = unknown, TResult = unknown>(
  config: CloudflareQueueConsumerConfig<T, TResult>,
  queueName: string,
  job: CloudflareQueueJob<T>,
  error: unknown,
  coordinator: CloudflareQueueCoordinatorStub | null,
  message: CloudflareMessageLike
): Promise<void> => {
  const exhausted = job.attemptsMade + 1 >= job.maxAttempts;
  await config.store.updateState({
    queueName,
    jobId: job.id,
    state: exhausted ? 'failed' : 'retrying',
    error: serializeError(error),
  });

  if (exhausted) {
    await config.store.applyRetention(queueName, job.id, 'failed');
    await coordinator?.releaseLease?.({
      queueName,
      jobId: job.id,
      workerId: resolveWorkerId(config.state),
      ttlMs: config.state?.heartbeatTtlMs ?? 60_000,
    });
    message.ack();
    return;
  }

  message.retry({
    delaySeconds: resolveRetryDelay(job, message.attempts, config.retryDelaySeconds ?? 30),
  });
};

const resolveEnvelope = (
  message: CloudflareMessageLike,
  configQueueName: string | undefined,
  batchQueueName: string | undefined
): CloudflareQueueEnvelope => {
  if (isEnvelope(message.body)) return message.body;
  return {
    protocol: 'zintrust.cf.queue.v1' as const,
    jobId: message.id,
    queueName: configQueueName ?? batchQueueName ?? 'default',
    name: 'default',
    attempt: message.attempts,
    availableAt: new Date().toISOString(),
  };
};

const shouldSkipProcessing = async (
  coordinator: CloudflareQueueCoordinatorStub | null,
  retryDelaySeconds: number,
  message: CloudflareMessageLike
): Promise<boolean> => {
  if ((await coordinator?.isPaused?.()) === true) {
    message.retry({ delaySeconds: retryDelaySeconds });
    return true;
  }
  return false;
};

const acquireJobLease = async (
  coordinator: CloudflareQueueCoordinatorStub | null,
  queueName: string,
  jobId: string,
  workerId: string,
  ttlMs: number,
  retryDelaySeconds: number,
  message: CloudflareMessageLike
): Promise<boolean> => {
  const lease = await coordinator?.acquireLease?.({
    queueName,
    jobId,
    workerId,
    ttlMs,
  });
  if (lease !== undefined && !lease.acquired) {
    message.retry({ delaySeconds: retryDelaySeconds });
    return false;
  }
  return true;
};

const createConsumer = <T = unknown, TResult = unknown>(
  config: CloudflareQueueConsumerConfig<T, TResult>
): {
  processMessage: (message: CloudflareMessageLike, batchQueueName?: string) => Promise<void>;
  processBatch: (batch: CloudflareBatchLike) => Promise<void>;
} => {
  return {
    async processMessage(message: CloudflareMessageLike, batchQueueName?: string): Promise<void> {
      const envelope = resolveEnvelope(message, config.queueName, batchQueueName);
      const queueName = config.queueName ?? envelope.queueName;
      const coordinator = resolveCoordinator(config.state, queueName);
      const retryDelaySeconds = config.retryDelaySeconds ?? 30;

      if (await shouldSkipProcessing(coordinator, retryDelaySeconds, message)) return;

      const job = await config.store.getJob<T>(queueName, envelope.jobId);
      if (job === null || job.state === 'canceled') {
        message.ack();
        return;
      }

      const workerId = resolveWorkerId(config.state);
      const ttlMs = config.state?.heartbeatTtlMs ?? 60_000;
      const leaseAcquired = await acquireJobLease(
        coordinator,
        queueName,
        job.id,
        workerId,
        ttlMs,
        retryDelaySeconds,
        message
      );
      if (!leaseAcquired) return;

      await config.store.updateState({
        queueName,
        jobId: job.id,
        state: 'active',
        incrementAttempts: true,
      });

      try {
        const context = createProcessorContext(config, queueName, job, coordinator, message);
        const result = await config.processor(job.data, context);
        await handleJobSuccess(config, queueName, job, result, coordinator, message);
      } catch (error) {
        await handleJobFailure(config, queueName, job, error, coordinator, message);
      }
    },

    async processBatch(batch: CloudflareBatchLike): Promise<void> {
      for (const message of batch.messages) {
        await this.processMessage(message, batch.queue);
      }
    },
  };
};

export const CloudflareQueueConsumer = Object.freeze({
  create: createConsumer,

  createDeadLetter(input: { queueName?: string; store: CloudflareJobStore }) {
    return {
      async processMessage(message: CloudflareMessageLike, batchQueueName?: string): Promise<void> {
        const envelope = isEnvelope(message.body) ? message.body : null;
        const queueName = input.queueName ?? envelope?.queueName ?? batchQueueName ?? 'default';
        const jobId = envelope?.jobId ?? message.id;
        await input.store.updateState({
          queueName,
          jobId,
          state: 'dead_lettered',
          error: { messageId: message.id, body: message.body, attempts: message.attempts },
        });
        message.ack();
      },

      async processBatch(batch: CloudflareBatchLike): Promise<void> {
        for (const message of batch.messages) {
          await this.processMessage(message, batch.queue);
        }
      },
    };
  },
});
