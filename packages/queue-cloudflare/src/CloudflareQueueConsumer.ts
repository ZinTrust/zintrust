import type { CloudflareJobStore } from './CloudflareJobStore.js';
import type {
  CloudflareQueueEnvelope,
  CloudflareQueueJob,
  CloudflareQueueProcessor,
  CloudflareQueueStateConfig,
  CloudflareQueueCoordinatorStub,
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

const resolveCoordinator = (
  config?: CloudflareQueueStateConfig,
  queueName?: string
): CloudflareQueueCoordinatorStub | null => {
  const direct = config?.coordinator;
  if (direct?.getByName !== undefined) return direct.getByName(queueName ?? 'default');
  if (direct?.idFromName !== undefined && direct.get !== undefined) {
    return direct.get(direct.idFromName(queueName ?? 'default'));
  }

  const env = (globalThis as unknown as { env?: Record<string, unknown> }).env;
  const bindingName = config?.coordinatorBindingName ?? 'QUEUE_COORDINATOR';
  const binding = env?.[bindingName] as typeof direct | undefined;
  if (binding?.getByName !== undefined) return binding.getByName(queueName ?? 'default');
  if (binding?.idFromName !== undefined && binding.get !== undefined) {
    return binding.get(binding.idFromName(queueName ?? 'default'));
  }

  return null;
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
  const delayMs =
    backoff?.type === 'fixed' ? baseMs : baseMs * 2 ** Math.max(0, attempts);
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
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return error;
};

const createConsumer = <T = unknown, TResult = unknown>(
  config: CloudflareQueueConsumerConfig<T, TResult>
) => {
  return {
    async processMessage(message: CloudflareMessageLike, batchQueueName?: string): Promise<void> {
      const envelope = isEnvelope(message.body)
        ? message.body
        : {
            protocol: 'zintrust.cf.queue.v1' as const,
            jobId: message.id,
            queueName: config.queueName ?? batchQueueName ?? 'default',
            name: 'default',
            attempt: message.attempts,
            availableAt: new Date().toISOString(),
          };

      const queueName = config.queueName ?? envelope.queueName;
      const coordinator = resolveCoordinator(config.state, queueName);
      if ((await coordinator?.isPaused?.()) === true) {
        message.retry({ delaySeconds: config.retryDelaySeconds ?? 30 });
        return;
      }

      const job = await config.store.getJob<T>(queueName, envelope.jobId);
      if (job === null || job.state === 'canceled') {
        message.ack();
        return;
      }

      const lease = await coordinator?.acquireLease?.({
        queueName,
        jobId: job.id,
        workerId: resolveWorkerId(config.state),
        ttlMs: config.state?.heartbeatTtlMs ?? 60_000,
      });
      if (lease !== undefined && !lease.acquired) {
        message.retry({ delaySeconds: config.retryDelaySeconds ?? 30 });
        return;
      }

      await config.store.updateState({
        queueName,
        jobId: job.id,
        state: 'active',
        incrementAttempts: true,
      });

      try {
        const result = await config.processor(job.data, {
          job,
          attempt: message.attempts,
          updateProgress: async (progress: unknown) => {
            await config.store.updateProgress(queueName, job.id, progress);
          },
          log: async (logMessage: string, data?: unknown) => {
            await config.store.recordLog(queueName, job.id, 'info', logMessage, data);
          },
          heartbeat: async () => {
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
      } catch (error) {
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

  createDeadLetter(input: {
    queueName?: string;
    store: CloudflareJobStore;
  }) {
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
