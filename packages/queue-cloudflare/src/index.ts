import { Cloudflare } from '@zintrust/core/cloudflare';
import { ErrorFactory } from '@zintrust/core/errors';
import { generateUuid } from '@zintrust/core/utils';
import { CloudflareJobStore, type CloudflareJobStore as ICloudflareJobStore } from './CloudflareJobStore.js';
import { CloudflareQueueConsumer } from './CloudflareQueueConsumer.js';
import { CloudflareQueueMigrator } from './CloudflareQueueMigrator.js';
import { CloudflareQueueScheduler } from './CloudflareQueueScheduler.js';
import type {
  CloudflareJobOptions,
  CloudflareFlowInput,
  CloudflareFlowResult,
  CloudflareQueueBinding,
  CloudflareQueueConfig,
  CloudflareQueueContentType,
  CloudflareQueueCoordinatorStub,
  CloudflareQueueEnvelope,
  CloudflareQueueJob,
  CloudflareQueueMetrics,
  CloudflareQueueProcessor,
  CloudflareQueueSendOptions,
  CloudflareQueueState,
  QueueMessage,
} from './types.js';

export type {
  CloudflareJobOptions,
  CloudflareFlowInput,
  CloudflareFlowResult,
  CloudflareQueueBackoff,
  CloudflareQueueBinding,
  CloudflareQueueConfig,
  CloudflareQueueContentType,
  CloudflareQueueEnvelope,
  CloudflareQueueJob,
  CloudflareQueueMetrics,
  CloudflareQueueProcessor,
  CloudflareQueueProcessorContext,
  CloudflareQueueState,
  CloudflareQueueStateConfig,
  CloudflareQueueRetention,
  CloudflareRepeatOptions,
  QueueMessage,
} from './types.js';
export { CloudflareJobStore } from './CloudflareJobStore.js';
export { CloudflareQueueConsumer } from './CloudflareQueueConsumer.js';
export { CloudflareQueueCoordinator } from './CloudflareQueueCoordinator.js';
export { CloudflareQueueMigrator } from './CloudflareQueueMigrator.js';
export { CloudflareQueueScheduler } from './CloudflareQueueScheduler.js';

type CloudflareQueuesApiEnvelope<T> = {
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: string[];
  result?: T;
};

type CloudflareQueuesMetrics = {
  metadata?: {
    metrics?: {
      backlog_count?: number;
      backlog_bytes?: number;
      oldest_message_timestamp_ms?: number;
    };
  };
};

type CloudflarePulledMessage = {
  id?: string;
  attempts?: number;
  body?: unknown;
  lease_id?: string;
};

type CloudflarePullResponse = CloudflareQueuesMetrics & {
  message_backlog_count?: number;
  messages?: CloudflarePulledMessage[];
};

type CloudflareQueueDriverState = {
  leases: Map<string, { leaseId: string; seenAt: number }>;
  lastBacklogCount?: number;
};

const LEASES_MAX_ENTRIES = 10000;
const LEASES_TTL_MS = 15 * 60 * 1000;

const envValue = (key: string): string => {
  const workersValue = Cloudflare.getWorkersVar(key);
  if (workersValue !== null) return workersValue;

  const nodeEnv =
    typeof process !== 'undefined' && process.env !== undefined ? process.env[key] : undefined;
  return typeof nodeEnv === 'string' ? nodeEnv : '';
};

const nonEmpty = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const resolveBindingName = (queue: string, config?: CloudflareQueueConfig): string => {
  return (
    nonEmpty(config?.bindingName) ??
    nonEmpty(envValue('CLOUDFLARE_QUEUE_BINDING')) ??
    nonEmpty(envValue('QUEUE_BINDING')) ??
    queue
  );
};

const resolveBinding = (
  queue: string,
  config?: CloudflareQueueConfig
): CloudflareQueueBinding | null => {
  const bindingName = resolveBindingName(queue, config);
  const configured = config?.bindings?.[bindingName];
  if (configured !== undefined) return configured;

  const env = Cloudflare.getWorkersEnv();
  const candidate = env?.[bindingName] as CloudflareQueueBinding | undefined;
  if (candidate !== undefined && typeof candidate.send === 'function') return candidate;

  return null;
};

const resolveApiBaseUrl = (config?: CloudflareQueueConfig): string => {
  return (
    nonEmpty(config?.apiBaseUrl) ??
    nonEmpty(envValue('CLOUDFLARE_API_BASE_URL')) ??
    'https://api.cloudflare.com/client/v4'
  ).replace(/\/$/, '');
};

const resolveAccountId = (config?: CloudflareQueueConfig): string => {
  const accountId =
    nonEmpty(config?.accountId) ??
    nonEmpty(envValue('CLOUDFLARE_ACCOUNT_ID')) ??
    nonEmpty(envValue('CF_ACCOUNT_ID'));
  if (accountId === undefined) {
    throw ErrorFactory.createConfigError('Cloudflare Queues requires CLOUDFLARE_ACCOUNT_ID');
  }
  return accountId;
};

const resolveQueueId = (queue: string, config?: CloudflareQueueConfig): string => {
  const queueId =
    nonEmpty(config?.queueId) ??
    nonEmpty(envValue('CLOUDFLARE_QUEUE_ID')) ??
    nonEmpty(envValue('CF_QUEUE_ID')) ??
    nonEmpty(queue);
  if (queueId === undefined) {
    throw ErrorFactory.createConfigError('Cloudflare Queues requires a queue id or queue name');
  }
  return queueId;
};

const resolveApiToken = (config?: CloudflareQueueConfig): string => {
  const apiToken =
    nonEmpty(config?.apiToken) ??
    nonEmpty(envValue('CLOUDFLARE_API_TOKEN')) ??
    nonEmpty(envValue('CF_API_TOKEN'));
  if (apiToken === undefined) {
    throw ErrorFactory.createConfigError('Cloudflare Queues requires CLOUDFLARE_API_TOKEN');
  }
  return apiToken;
};

const resolveSendOptions = (config?: CloudflareQueueConfig): CloudflareQueueSendOptions => {
  const options: CloudflareQueueSendOptions = {};
  if (config?.contentType !== undefined) options.contentType = config.contentType;
  if (config?.delaySeconds !== undefined) options.delaySeconds = config.delaySeconds;
  return options;
};

const toApiContentType = (contentType?: CloudflareQueueContentType): 'json' | 'text' => {
  return contentType === 'text' ? 'text' : 'json';
};

const createEnvelope = <T>(id: string, payload: T): QueueMessage<T> => ({
  id,
  payload,
  attempts: 0,
});

const pruneLeases = (state: CloudflareQueueDriverState): void => {
  const now = Date.now();

  for (const [id, value] of state.leases.entries()) {
    if (now - value.seenAt > LEASES_TTL_MS) state.leases.delete(id);
  }

  if (state.leases.size <= LEASES_MAX_ENTRIES) return;

  const overflow = state.leases.size - LEASES_MAX_ENTRIES;
  let removed = 0;
  for (const id of state.leases.keys()) {
    state.leases.delete(id);
    removed += 1;
    if (removed >= overflow) break;
  }
};

const apiUrl = (queue: string, config: CloudflareQueueConfig | undefined, path: string): string => {
  const accountId = encodeURIComponent(resolveAccountId(config));
  const queueId = encodeURIComponent(resolveQueueId(queue, config));
  return `${resolveApiBaseUrl(config)}/accounts/${accountId}/queues/${queueId}${path}`;
};

const apiFetch = async <T>(
  queue: string,
  config: CloudflareQueueConfig | undefined,
  path: string,
  init?: RequestInit
): Promise<T> => {
  const response = await fetch(apiUrl(queue, config, path), {
    ...init,
    headers: {
      authorization: `Bearer ${resolveApiToken(config)}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const parsed = text === '' ? {} : (JSON.parse(text) as CloudflareQueuesApiEnvelope<T>);

  if (!response.ok || parsed.success === false) {
    const message =
      parsed.errors?.map((error) => error.message).filter(Boolean).join('; ') ||
      `Cloudflare Queues API error (${response.status})`;
    throw ErrorFactory.createConnectionError(message, { status: response.status, body: parsed });
  }

  return (parsed.result ?? parsed) as T;
};

const decodePulledBody = <T>(message: CloudflarePulledMessage): QueueMessage<T> => {
  const body = message.body;

  if (
    body !== null &&
    typeof body === 'object' &&
    typeof (body as QueueMessage<T>).id === 'string' &&
    'payload' in body
  ) {
    const envelope = body as QueueMessage<T>;
    return {
      id: envelope.id,
      payload: envelope.payload,
      attempts: typeof envelope.attempts === 'number' ? envelope.attempts : (message.attempts ?? 0),
    };
  }

  return {
    id: message.id ?? generateUuid(),
    payload: body as T,
    attempts: message.attempts ?? 0,
  };
};

type CloudflareQueueDriver = {
  enqueue<T = unknown>(queue: string, payload: T): Promise<string>;
  dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined>;
  ack(queue: string, id: string): Promise<void>;
  length(queue: string): Promise<number>;
  drain(queue: string): Promise<void>;
  add<T = unknown>(queue: string, name: string, data: T, options?: CloudflareJobOptions): Promise<CloudflareQueueJob<T>>;
  addBulk<T = unknown>(
    queue: string,
    jobs: Array<{ name: string; data: T; options?: CloudflareJobOptions }>
  ): Promise<Array<CloudflareQueueJob<T>>>;
  getJob<T = unknown>(queue: string, id: string): Promise<CloudflareQueueJob<T> | null>;
  getJobs<T = unknown>(
    queue: string,
    states?: CloudflareQueueState[],
    limit?: number
  ): Promise<Array<CloudflareQueueJob<T>>>;
  getJobCounts(queue: string, ...states: CloudflareQueueState[]): Promise<Record<string, number>>;
  getMetrics(queue: string): Promise<CloudflareQueueMetrics>;
  updateProgress(queue: string, id: string, progress: unknown): Promise<void>;
  log(queue: string, id: string, message: string, data?: unknown): Promise<void>;
  remove(queue: string, id: string): Promise<void>;
  retry(queue: string, id: string): Promise<void>;
  promote(queue: string, id: string): Promise<void>;
  clean(queue: string, states: CloudflareQueueState[], olderThanMs: number): Promise<void>;
  upsertJobScheduler<T = unknown>(
    queue: string,
    name: string,
    data: T,
    repeat: NonNullable<CloudflareJobOptions['repeat']>,
    id?: string
  ): Promise<unknown>;
  removeJobScheduler(id: string): Promise<void>;
  runScheduler(queue: string, limit?: number): Promise<{ jobs: number; repeatables: number }>;
  reconcileStalled(queue: string, olderThanMs?: number, limit?: number): Promise<number>;
  createFlow<TParent = unknown, TChild = unknown>(
    input: CloudflareFlowInput<TParent, TChild>
  ): Promise<CloudflareFlowResult<TParent, TChild>>;
  getFlowChildren<T = unknown>(
    queue: string,
    parentJobId: string
  ): Promise<Array<CloudflareQueueJob<T>>>;
  markFlowChildCompleted(queue: string, childJobId: string): Promise<Array<CloudflareQueueJob>>;
  createConsumer<T = unknown, TResult = unknown>(
    processor: CloudflareQueueProcessor<T, TResult>,
    queueName?: string
  ): ReturnType<typeof CloudflareQueueConsumer.create<T, TResult>>;
  migrateState(): Promise<void>;
};

const createEnqueue =
  (config?: CloudflareQueueConfig) =>
  async <T = unknown>(queue: string, payload: T): Promise<string> => {
    const id = generateUuid();
    const envelope = createEnvelope(id, payload);
    const options = resolveSendOptions(config);
    const binding = resolveBinding(queue, config);

    if (binding !== null) {
      await binding.send(envelope, options);
      return id;
    }

    const contentType = toApiContentType(config?.contentType);
    await apiFetch<CloudflareQueuesMetrics>(queue, config, '/messages', {
      method: 'POST',
      body: JSON.stringify({
        body: contentType === 'text' ? JSON.stringify(envelope) : envelope,
        content_type: contentType,
        delay_seconds: config?.delaySeconds,
      }),
    });

    return id;
  };

const sendRaw =
  (config?: CloudflareQueueConfig) =>
  async (queue: string, payload: unknown, optionsOverride?: CloudflareQueueSendOptions): Promise<void> => {
    const options = { ...resolveSendOptions(config), ...(optionsOverride ?? {}) };
    const binding = resolveBinding(queue, config);

    if (binding !== null) {
      await binding.send(payload, options);
      return;
    }

    const contentType = toApiContentType(options.contentType ?? config?.contentType);
    await apiFetch<CloudflareQueuesMetrics>(queue, config, '/messages', {
      method: 'POST',
      body: JSON.stringify({
        body: contentType === 'text' ? JSON.stringify(payload) : payload,
        content_type: contentType,
        delay_seconds: options.delaySeconds,
      }),
    });
  };

const sendRawBatch =
  (config?: CloudflareQueueConfig) =>
  async (
    queue: string,
    messages: Array<{ body: unknown; options?: CloudflareQueueSendOptions }>
  ): Promise<void> => {
    if (messages.length === 0) return;
    const binding = resolveBinding(queue, config);
    if (binding?.sendBatch !== undefined) {
      for (let index = 0; index < messages.length; index += 100) {
        await binding.sendBatch(messages.slice(index, index + 100));
      }
      return;
    }

    const rawSender = sendRaw(config);
    for (const message of messages) {
      await rawSender(queue, message.body, message.options);
    }
  };

const createDequeue =
  (state: CloudflareQueueDriverState, config?: CloudflareQueueConfig) =>
  async <T = unknown>(queue: string): Promise<QueueMessage<T> | undefined> => {
    pruneLeases(state);

    const body: Record<string, number> = {};
    if (config?.batchSize !== undefined) body['batch_size'] = config.batchSize;
    if (config?.visibilityTimeoutMs !== undefined) {
      body['visibility_timeout_ms'] = config.visibilityTimeoutMs;
    }

    const pulled = await apiFetch<CloudflarePullResponse>(queue, config, '/messages/pull', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    state.lastBacklogCount =
      pulled.message_backlog_count ?? pulled.metadata?.metrics?.backlog_count ?? state.lastBacklogCount;

    const message = pulled.messages?.[0];
    if (message === undefined) return undefined;

    const decoded = decodePulledBody<T>(message);
    if (message.lease_id !== undefined) {
      state.leases.set(decoded.id, { leaseId: message.lease_id, seenAt: Date.now() });
    }

    return decoded;
  };

const createAck =
  (state: CloudflareQueueDriverState, config?: CloudflareQueueConfig) =>
  async (queue: string, id: string): Promise<void> => {
    pruneLeases(state);
    const lease = state.leases.get(id);
    if (lease === undefined) return;
    state.leases.delete(id);

    await apiFetch(queue, config, '/messages/ack', {
      method: 'POST',
      body: JSON.stringify({
        acks: [{ lease_id: lease.leaseId }],
        retries: [],
      }),
    });
  };

const createLength =
  (state: CloudflareQueueDriverState, config?: CloudflareQueueConfig) =>
  async (queue: string): Promise<number> => {
    const metrics = await apiFetch<CloudflareQueuesMetrics>(queue, config, '/metrics', {
      method: 'GET',
    });

    const count = metrics.metadata?.metrics?.backlog_count ?? state.lastBacklogCount ?? 0;
    return Number.isFinite(count) ? count : 0;
  };

const createDrain =
  (config?: CloudflareQueueConfig) =>
  async (queue: string): Promise<void> => {
    await apiFetch(queue, config, '/purge', {
      method: 'POST',
      body: JSON.stringify({ delete_messages_permanently: true }),
    });
  };

const createStore = (config?: CloudflareQueueConfig): ICloudflareJobStore => {
  return CloudflareJobStore.create(config?.state);
};

const toQueueEnvelope = (job: CloudflareQueueJob): CloudflareQueueEnvelope => ({
  protocol: 'zintrust.cf.queue.v1',
  jobId: job.id,
  queueName: job.queueName,
  name: job.name,
  attempt: job.attemptsMade,
  availableAt: job.availableAt,
});

const resolveCoordinator = (
  config: CloudflareQueueConfig | undefined,
  queueName: string
): CloudflareQueueCoordinatorStub | null => {
  const direct = config?.state?.coordinator;
  if (direct?.getByName !== undefined) return direct.getByName(queueName);
  if (direct?.idFromName !== undefined && direct.get !== undefined) {
    return direct.get(direct.idFromName(queueName));
  }

  const env = Cloudflare.getWorkersEnv();
  const bindingName = config?.state?.coordinatorBindingName ?? 'QUEUE_COORDINATOR';
  const binding = env?.[bindingName] as typeof direct | undefined;
  if (binding?.getByName !== undefined) return binding.getByName(queueName);
  if (binding?.idFromName !== undefined && binding.get !== undefined) {
    return binding.get(binding.idFromName(queueName));
  }
  return null;
};

const shouldSendImmediately = (options?: CloudflareJobOptions): boolean => {
  const delay = options?.delay ?? 0;
  if (options?.priority !== undefined || options?.lifo === true) return false;
  return delay <= 43200 * 1000;
};

const delayOptions = (options?: CloudflareJobOptions): CloudflareQueueSendOptions | undefined => {
  const delaySeconds = Math.max(0, Math.floor((options?.delay ?? 0) / 1000));
  return delaySeconds > 0 ? { delaySeconds } : undefined;
};

function createCloudflareQueueDriver(config?: CloudflareQueueConfig): CloudflareQueueDriver {
  const state: CloudflareQueueDriverState = { leases: new Map() };
  const rawSender = sendRaw(config);
  const rawBatchSender = sendRawBatch(config);
  let storeRef: ICloudflareJobStore | undefined;
  const getStore = (): ICloudflareJobStore => {
    storeRef ??= createStore(config);
    return storeRef;
  };

  return {
    enqueue: createEnqueue(config),
    dequeue: createDequeue(state, config),
    ack: createAck(state, config),
    length: createLength(state, config),
    drain: createDrain(config),
    async add<T = unknown>(
      queue: string,
      name: string,
      data: T,
      options?: CloudflareJobOptions
    ): Promise<CloudflareQueueJob<T>> {
      const job = await getStore().createJob({ queueName: queue, name, data, options });
      const coordinator = resolveCoordinator(config, queue);
      if ((await coordinator?.isPaused?.()) === true) return job;
      const rate = config?.state?.rateLimit;
      if (rate !== undefined) {
        const result = await coordinator?.rateLimit?.({
          key: rate.key ?? queue,
          max: rate.max,
          durationMs: rate.durationMs,
        });
        if (result !== undefined && !result.allowed) {
          await getStore().updateState({
            queueName: queue,
            jobId: job.id,
            state: job.state,
            availableAt: new Date(result.resetAt).toISOString(),
          });
          return job;
        }
      }
      if (shouldSendImmediately(options)) {
        await rawSender(queue, toQueueEnvelope(job), delayOptions(options));
        await getStore().markDispatched(queue, job.id);
      }
      return job;
    },
    async addBulk<T = unknown>(
      queue: string,
      jobs: Array<{ name: string; data: T; options?: CloudflareJobOptions }>
    ): Promise<Array<CloudflareQueueJob<T>>> {
      const created: Array<CloudflareQueueJob<T>> = [];
      const batch: Array<{ body: CloudflareQueueEnvelope; options?: CloudflareQueueSendOptions; id: string }> = [];
      const coordinator = resolveCoordinator(config, queue);
      const rate = config?.state?.rateLimit;
      const rateResult =
        rate === undefined
          ? undefined
          : await coordinator?.rateLimit?.({
              key: rate.key ?? queue,
              max: rate.max,
              durationMs: rate.durationMs,
            });
      for (const jobInput of jobs) {
        const job = await getStore().createJob({
          queueName: queue,
          name: jobInput.name,
          data: jobInput.data,
          options: jobInput.options,
        });
        created.push(job);
        if (rateResult !== undefined && !rateResult.allowed) {
          await getStore().updateState({
            queueName: queue,
            jobId: job.id,
            state: job.state,
            availableAt: new Date(rateResult.resetAt).toISOString(),
          });
          continue;
        }
        if (shouldSendImmediately(jobInput.options)) {
          batch.push({
            body: toQueueEnvelope(job),
            options: delayOptions(jobInput.options),
            id: job.id,
          });
        }
      }
      if ((await resolveCoordinator(config, queue)?.isPaused?.()) !== true) {
        await rawBatchSender(
          queue,
          batch.map((message) => ({ body: message.body, options: message.options }))
        );
        for (const message of batch) {
          await getStore().markDispatched(queue, message.id);
        }
      }
      return created;
    },
    async getJob<T = unknown>(queue: string, id: string): Promise<CloudflareQueueJob<T> | null> {
      return await getStore().getJob<T>(queue, id);
    },
    async getJobs<T = unknown>(
      queue: string,
      states?: CloudflareQueueState[],
      limit?: number
    ): Promise<Array<CloudflareQueueJob<T>>> {
      return await getStore().getJobs<T>(queue, states, limit);
    },
    async getJobCounts(queue: string, ...states: CloudflareQueueState[]): Promise<Record<string, number>> {
      return await getStore().getJobCounts(queue, ...states);
    },
    async getMetrics(queue: string): Promise<CloudflareQueueMetrics> {
      return await getStore().getMetrics(queue);
    },
    async updateProgress(queue: string, id: string, progress: unknown): Promise<void> {
      await getStore().updateProgress(queue, id, progress);
    },
    async log(queue: string, id: string, message: string, data?: unknown): Promise<void> {
      await getStore().recordLog(queue, id, 'info', message, data);
    },
    async remove(queue: string, id: string): Promise<void> {
      await getStore().updateState({ queueName: queue, jobId: id, state: 'canceled' });
    },
    async retry(queue: string, id: string): Promise<void> {
      const job = await getStore().getJob(queue, id);
      if (job === null) return;
      await getStore().updateState({ queueName: queue, jobId: id, state: 'waiting' });
      await rawSender(queue, toQueueEnvelope(job));
      await getStore().markDispatched(queue, id);
    },
    async promote(queue: string, id: string): Promise<void> {
      const job = await getStore().getJob(queue, id);
      if (job === null) return;
      await getStore().updateState({
        queueName: queue,
        jobId: id,
        state: 'waiting',
        availableAt: new Date().toISOString(),
      });
      await rawSender(queue, toQueueEnvelope(job));
      await getStore().markDispatched(queue, id);
    },
    async clean(queue: string, states: CloudflareQueueState[], olderThanMs: number): Promise<void> {
      await getStore().clean(queue, states, olderThanMs);
    },
    async upsertJobScheduler<T = unknown>(
      queue: string,
      name: string,
      data: T,
      repeat: NonNullable<CloudflareJobOptions['repeat']>,
      id?: string
    ): Promise<unknown> {
      return await getStore().upsertRepeatable({ id, queueName: queue, name, data, options: repeat });
    },
    async removeJobScheduler(id: string): Promise<void> {
      await getStore().removeRepeatable(id);
    },
    async runScheduler(queue: string, limit?: number): Promise<{ jobs: number; repeatables: number }> {
      return await CloudflareQueueScheduler.create({
        queueName: queue,
        store: getStore(),
        queue: { enqueue: async (queueName, payload) => {
          await rawSender(queueName, payload);
          return generateUuid();
        } },
        batchSize: limit,
      }).run();
    },
    async reconcileStalled(queue: string, olderThanMs?: number, limit?: number): Promise<number> {
      return await CloudflareQueueScheduler.create({
        queueName: queue,
        store: getStore(),
        queue: { enqueue: async (queueName, payload) => {
          await rawSender(queueName, payload);
          return generateUuid();
        } },
        batchSize: limit,
        stalledAfterMs: olderThanMs,
      }).reconcileStalled();
    },
    async createFlow<TParent = unknown, TChild = unknown>(
      input: CloudflareFlowInput<TParent, TChild>
    ): Promise<CloudflareFlowResult<TParent, TChild>> {
      return await getStore().createFlow(input);
    },
    async getFlowChildren<T = unknown>(
      queue: string,
      parentJobId: string
    ): Promise<Array<CloudflareQueueJob<T>>> {
      return await getStore().getFlowChildren<T>(queue, parentJobId);
    },
    async markFlowChildCompleted(queue: string, childJobId: string): Promise<Array<CloudflareQueueJob>> {
      const released = await getStore().markFlowChildCompleted(queue, childJobId);
      for (const parent of released) {
        await rawSender(parent.queueName, toQueueEnvelope(parent));
        await getStore().markDispatched(parent.queueName, parent.id);
      }
      return released;
    },
    createConsumer<T = unknown, TResult = unknown>(
      processor: CloudflareQueueProcessor<T, TResult>,
      queueName?: string
    ): ReturnType<typeof CloudflareQueueConsumer.create<T, TResult>> {
      return CloudflareQueueConsumer.create({
        queueName,
        store: getStore(),
        processor,
        state: config?.state,
        queue: { enqueue: async (queueName, payload) => {
          await rawSender(queueName, payload);
        } },
      });
    },
    async migrateState(): Promise<void> {
      if (config?.state?.d1 !== undefined) {
        await CloudflareQueueMigrator.up({ d1: config.state.d1 });
        return;
      }
      if (config?.state?.db !== undefined) {
        await CloudflareQueueMigrator.up({ db: config.state.db });
        return;
      }
      throw ErrorFactory.createConfigError(
        'Cloudflare queue state migration requires config.state.d1 or config.state.db'
      );
    },
  };
}

export const CloudflareQueues = Object.freeze({
  create(config?: CloudflareQueueConfig): CloudflareQueueDriver {
    return createCloudflareQueueDriver(config);
  },
});

export const CloudflareQueue = CloudflareQueues;

export default CloudflareQueues;
