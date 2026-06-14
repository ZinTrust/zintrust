import { ErrorFactory } from '@zintrust/core/errors';
import { isArray, isNonEmptyString, isObject, isUndefinedOrNull } from '@zintrust/core/helper';
import { Logger } from '@zintrust/core/logger';
import { Sanitizer } from '@zintrust/core/security';
import {
  Job,
  Queue,
  QueueEvents,
  type JobType,
  type ObliterateOpts,
  type QueueOptions,
} from 'bullmq';
import IORedis, { type Redis, type RedisOptions } from 'ioredis';
import { redisConnectionOptions, rpcServerOptions } from './env';
import { createRpcValidationError } from './errors';
import type {
  CreateRedisRpcBackendOptions,
  RedisRpcBackend,
  RedisRpcServiceHandler,
  RpcPayload,
} from './types';

const DEFAULT_JOB_STATES: JobType[] = [
  'waiting',
  'active',
  'completed',
  'failed',
  'delayed',
  'paused',
  'prioritized',
  'waiting-children',
];
const CLEAN_JOB_TYPES = new Set([
  'completed',
  'failed',
  'active',
  'delayed',
  'prioritized',
  'waiting',
  'paused',
  'wait',
]);
const EVENT_NAMES = [
  'added',
  'waiting',
  'active',
  'completed',
  'failed',
  'delayed',
  'removed',
  'drained',
  'paused',
  'resumed',
] as const;
const PULL_WORKER_TOKEN = 'pull-worker';

type EventLogEntry = Readonly<{ event: string; payload: unknown; at: number }>;
type RedisCommandArg = string | number | Buffer;
type RedisCommandEntry = Readonly<{ command?: unknown; args?: unknown[] }>;
type RedisCommandPipeline = {
  exec: () => Promise<Array<[Error | null, unknown]>>;
  call?: (command: string, ...args: unknown[]) => RedisCommandPipeline;
  [key: string]: unknown;
};

type BackendState = {
  prefix: string;
  connectionOptions: RedisOptions;
  queues: Map<string, Queue>;
  queueEvents: Map<string, QueueEvents>;
  eventLogs: Map<string, EventLogEntry[]>;
  connections: Set<Redis>;
  services: Map<string, RedisRpcServiceHandler>;
};

type WorkerRegistryRecord = Readonly<{
  workerName: string;
  queueName: string;
  processorSpec: string | null;
  concurrency: number;
  status: 'running' | 'stopped';
  updatedAt: string;
  source?: string;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  isObject(value) && !isArray(value);

const sanitizeKey = (value: string): string => {
  const sanitized = Sanitizer.keyLike(value);
  return sanitized.length > 0 ? sanitized : value.trim();
};

const requireRecord = (value: unknown, name: string): RpcPayload => {
  if (!isRecord(value)) {
    throw createRpcValidationError(`${name} must be an object`);
  }
  return value;
};

const requireString = (value: unknown, name: string): string => {
  if (!isNonEmptyString(value)) {
    throw createRpcValidationError(`${name} is required`);
  }
  return sanitizeKey(value);
};

const asArgs = (payload: RpcPayload): unknown[] => (isArray(payload.args) ? payload.args : []);

const firstDefined = (...values: unknown[]): unknown =>
  values.find((value) => !isUndefinedOrNull(value));

const redisCommandArgs = (values: unknown[]): RedisCommandArg[] =>
  values.flatMap((value) => {
    if (!isRecord(value)) return [Buffer.isBuffer(value) ? value : String(value)];
    return Object.entries(value).flatMap(([key, entry]) => {
      if (typeof entry !== 'boolean') return [key, String(entry)];
      return entry ? [key] : [];
    });
  });

const redisPipelineCommands = (payload: RpcPayload): RedisCommandEntry[] => {
  const commands = payload.commands;
  if (!isArray(commands)) {
    throw createRpcValidationError('commands must be an array');
  }
  return commands.map((command) => {
    if (!isRecord(command)) {
      throw createRpcValidationError('commands entries must be objects');
    }
    return command;
  });
};

const queuePipelineCommand = (
  pipeline: RedisCommandPipeline,
  command: string,
  args: unknown[]
): void => {
  const lower = command.toLowerCase();
  const candidate = pipeline[lower];
  if (typeof candidate === 'function') {
    (candidate as (...input: unknown[]) => RedisCommandPipeline).apply(pipeline, args);
    return;
  }

  if (typeof pipeline.call === 'function') {
    pipeline.call(command, ...args);
    return;
  }

  throw createRpcValidationError(`Unsupported redis command: ${command}`);
};

const serializePipelineResults = (
  results: Array<[Error | null, unknown]>
): Array<[string | null, unknown]> =>
  results.map(([error, result]) => [error === null ? null : error.message, result]);

const queueNameFromPayload = (payload: RpcPayload): string => {
  return requireString(firstDefined(payload.queueName, payload.queue, payload.target), 'queueName');
};

const numberFrom = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const positiveNumberFrom = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const boolFrom = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const normalizeStates = (value: unknown): JobType[] => {
  if (!isArray(value)) {
    return DEFAULT_JOB_STATES;
  }
  const states = value.map((state) => String(state).trim()).filter(Boolean) as JobType[];
  return states.length > 0 ? states : DEFAULT_JOB_STATES;
};

const withTimeout = async <T>(operation: () => Promise<T>, timeoutMs = 5000): Promise<T> => {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timeout = globalThis.setTimeout(
          () => reject(ErrorFactory.createTryCatchError('Redis RPC close timed out')),
          timeoutMs
        );
        timeout.unref?.();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const serializeJob = async (
  job: Job | undefined | null
): Promise<Record<string, unknown> | null> => {
  if (!job) return null;
  let state: string | undefined;
  try {
    state = await job.getState();
  } catch (error) {
    Logger.warn('Redis RPC failed to read job state', { error });
  }

  return {
    id: isUndefinedOrNull(job.id) ? undefined : String(job.id),
    name: job.name,
    queueName: job.queueName,
    data: job.data,
    opts: job.opts,
    progress: job.progress,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    stacktrace: job.stacktrace,
    returnvalue: job.returnvalue,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    delay: job.delay,
    priority: job.priority,
    state,
  };
};

const createConnection = (state: BackendState, extra: RedisOptions = {}): Redis => {
  const connection = new IORedis({ ...state.connectionOptions, ...extra });
  state.connections.add(connection);
  connection.once('end', () => state.connections.delete(connection));
  return connection;
};

const queueOptions = (state: BackendState): QueueOptions => ({
  connection: createConnection(state),
  prefix: state.prefix,
});

const getQueue = (state: BackendState, queueName: unknown): Queue => {
  const name = requireString(queueName, 'queueName');
  const existing = state.queues.get(name);
  if (existing) return existing;
  const queue = new Queue(name, queueOptions(state));
  state.queues.set(name, queue);
  return queue;
};

const getQueueEvents = (state: BackendState, queueName: unknown): QueueEvents => {
  const name = requireString(queueName, 'queueName');
  const existing = state.queueEvents.get(name);
  if (existing) return existing;
  const events = new QueueEvents(name, queueOptions(state));
  const log: EventLogEntry[] = [];
  state.eventLogs.set(name, log);
  for (const eventName of EVENT_NAMES) {
    events.on(eventName, (payload: unknown) => {
      log.push({ event: eventName, payload, at: Date.now() });
      if (log.length > 200) log.shift();
    });
  }
  state.queueEvents.set(name, events);
  return events;
};

const getJob = async (
  state: BackendState,
  queueName: unknown,
  jobId: unknown
): Promise<Job | undefined | null> => {
  const queue = getQueue(state, queueName);
  return queue.getJob(requireString(jobId, 'jobId'));
};

const addJob = async (state: BackendState, payload: RpcPayload): Promise<unknown> => {
  const queue = getQueue(state, queueNameFromPayload(payload));
  const args = asArgs(payload);

  let name = 'default';
  if (isNonEmptyString(args[0])) {
    name = args[0].trim();
  } else if (isNonEmptyString(payload.name)) {
    name = payload.name.trim();
  }

  const data = args.length > 1 ? args[1] : firstDefined(payload.data, payload.payload, {});
  let opts: Record<string, unknown> = {};
  if (isRecord(args[2])) {
    opts = args[2];
  } else if (isRecord(payload.opts)) {
    opts = payload.opts;
  }
  return serializeJob(await queue.add(name, data, opts));
};

const getQueueJob = async (
  state: BackendState,
  queueName: string,
  payload: RpcPayload
): Promise<unknown> => {
  const args = asArgs(payload);
  return serializeJob(
    await getJob(state, queueName, firstDefined(args[0], payload.jobId, payload.id))
  );
};

const listQueueJobs = async (
  state: BackendState,
  queueName: string,
  payload: RpcPayload
): Promise<unknown> => {
  const args = asArgs(payload);
  const queue = getQueue(state, queueName);
  const jobs = await queue.getJobs(
    normalizeStates(firstDefined(args[0], payload.states)),
    numberFrom(firstDefined(args[1], payload.start), 0),
    numberFrom(firstDefined(args[2], payload.end), 99),
    boolFrom(firstDefined(args[3], payload.asc), false)
  );
  return Promise.all(jobs.map((job) => serializeJob(job)));
};

const getQueueJobCounts = async (
  state: BackendState,
  queueName: string,
  payload: RpcPayload
): Promise<unknown> => {
  const args = asArgs(payload);
  const queue = getQueue(state, queueName);

  let types: JobType[] = [];
  if (args.length > 0) {
    types = args.map(String) as JobType[];
  } else if (isArray(payload.types)) {
    types = payload.types.map(String) as JobType[];
  }

  return types.length > 0 ? queue.getJobCounts(...types) : queue.getJobCounts();
};

const closeQueue = async (state: BackendState, queueName: string): Promise<boolean> => {
  await state.queues.get(queueName)?.close();
  await state.queueEvents.get(queueName)?.close();
  state.queues.delete(queueName);
  state.queueEvents.delete(queueName);
  state.eventLogs.delete(queueName);
  return true;
};

const getObliterateOptions = (payload: RpcPayload): ObliterateOpts => {
  const args = asArgs(payload);
  const options = args[0];
  return isRecord(options) ? options : { force: payload.force !== false };
};

const getQueueJobById = async (
  state: BackendState,
  queueName: string,
  payload: RpcPayload
): Promise<Job | undefined | null> => {
  const args = asArgs(payload);
  return getJob(state, queueName, firstDefined(args[0], payload.jobId, payload.id));
};

const normalizedPrefix = (state: BackendState): string => state.prefix.replace(/:+$/u, '');

const claimLockKey = (state: BackendState, queueName: string, jobId: string): string =>
  `${normalizedPrefix(state)}:${queueName}:__pull_claim:${jobId}`;

const releaseClaim = async (
  state: BackendState,
  queueName: string,
  jobId: string
): Promise<void> => {
  const connection = createConnection(state, { maxRetriesPerRequest: 1 });
  try {
    await connection.del(claimLockKey(state, queueName, jobId));
  } finally {
    connection.disconnect();
  }
};

const ensurePullWorkerJobLock = async (
  queue: Queue,
  jobId: string,
  ttlMs: number
): Promise<void> => {
  const client = await (queue as unknown as { client: Promise<Redis> }).client;
  await client.set(queue.toKey(jobId) + ':lock', PULL_WORKER_TOKEN, 'PX', Math.max(1, ttlMs));
};

const staleActiveThresholdMs = (visibilityTimeoutMs: number): number => {
  const override = positiveNumberFrom(process.env['REDIS_RPC_STALE_ACTIVE_MS']);
  if (override !== null) {
    return override;
  }
  return Math.max(visibilityTimeoutMs * 2, 120_000);
};

const recoverStaleActiveJobs = async (
  state: BackendState,
  queueName: string,
  queue: Queue,
  visibilityTimeoutMs: number
): Promise<void> => {
  const thresholdMs = staleActiveThresholdMs(visibilityTimeoutMs);
  const activeJobs = await queue.getJobs(['active'], 0, 99, true);

  for (const job of activeJobs) {
    if (isUndefinedOrNull(job.processedOn) || isUndefinedOrNull(job.id)) {
      continue;
    }

    const processedOn = Number(job.processedOn);
    if (!Number.isFinite(processedOn)) {
      continue;
    }

    const ageMs = Date.now() - processedOn;
    if (ageMs <= thresholdMs) {
      continue;
    }

    const jobId = String(job.id);

    try {
      job.discard();
      // eslint-disable-next-line no-await-in-loop
      await ensurePullWorkerJobLock(queue, jobId, visibilityTimeoutMs);
      // eslint-disable-next-line no-await-in-loop
      await job.moveToFailed(
        new Error(`stale active job recovered after ${ageMs}ms without ack/fail`),
        PULL_WORKER_TOKEN,
        false
      );
      // eslint-disable-next-line no-await-in-loop
      await releaseClaim(state, queueName, jobId);
    } catch (error) {
      Logger.warn('Redis RPC stale active recovery failed', {
        queueName,
        jobId,
        thresholdMs,
        processedOn,
        ageMs,
        error,
      });
    }
  }
};

const dequeueQueueJob = async (
  state: BackendState,
  queueName: string,
  payload: RpcPayload
): Promise<unknown> => {
  const queue = getQueue(state, queueName);
  const visibilityTimeoutMs = Math.max(1, numberFrom(payload.visibilityTimeoutMs, 30_000));
  (queue as unknown as { opts: { lockDuration?: number } }).opts.lockDuration = visibilityTimeoutMs;
  const scripts = (
    queue as unknown as {
      scripts?: {
        moveToActive: (
          client: Redis,
          token: string,
          name?: string
        ) => Promise<[Record<string, string> | undefined, string | undefined]>;
      };
    }
  ).scripts;
  if (scripts === undefined) return undefined;

  await recoverStaleActiveJobs(state, queueName, queue, visibilityTimeoutMs);

  const client = await (queue as unknown as { client: Promise<Redis> }).client;
  const [jobData, jobId] = await scripts.moveToActive(client, PULL_WORKER_TOKEN, '');
  if (!jobData || isUndefinedOrNull(jobId)) return undefined;
  const job = Job.fromJSON(
    queue,
    jobData as unknown as Parameters<typeof Job.fromJSON>[1],
    String(jobId)
  );
  job.token = PULL_WORKER_TOKEN;
  return {
    id: String(job.id),
    name: job.name,
    payload: job.data,
    attempts: job.attemptsMade || 0,
  };
};

const ackQueueJob = async (
  state: BackendState,
  queueName: string,
  payload: RpcPayload
): Promise<boolean> => {
  const job = await getQueueJobById(state, queueName, payload);
  if (!job) return false;
  const args = asArgs(payload);
  const returnValue = firstDefined(
    args[1],
    payload.returnValue,
    payload.returnvalue,
    'acknowledged'
  );
  await job.moveToCompleted(returnValue, PULL_WORKER_TOKEN, false);
  if (!isUndefinedOrNull(job.id)) {
    await releaseClaim(state, queueName, String(job.id));
  }
  return true;
};

const failQueueJob = async (
  state: BackendState,
  queueName: string,
  payload: RpcPayload
): Promise<boolean> => {
  const job = await getQueueJobById(state, queueName, payload);
  if (!job) return false;
  const args = asArgs(payload);
  const reason = isNonEmptyString(firstDefined(args[1], payload.reason))
    ? String(firstDefined(args[1], payload.reason))
    : 'failed by pull worker';

  if (boolFrom(payload.force, false) || boolFrom(payload.discard, false)) {
    if (!isUndefinedOrNull(job.id)) {
      await ensurePullWorkerJobLock(
        getQueue(state, queueName),
        String(job.id),
        Math.max(1, numberFrom(payload.visibilityTimeoutMs, 30_000))
      );
    }
    job.discard();
  }

  await job.moveToFailed(new Error(reason), PULL_WORKER_TOKEN, false);
  if (!isUndefinedOrNull(job.id)) {
    await releaseClaim(state, queueName, String(job.id));
  }
  return true;
};

const removeQueueJob = async (
  state: BackendState,
  queueName: string,
  payload: RpcPayload
): Promise<boolean> => {
  const job = await getQueueJobById(state, queueName, payload);
  if (!job) return false;
  await job.remove();
  return true;
};

const retryQueueJob = async (
  state: BackendState,
  queueName: string,
  payload: RpcPayload
): Promise<unknown> => {
  const args = asArgs(payload);
  const job = await getQueueJobById(state, queueName, payload);
  if (!job) return { ok: false, status: 'missing' };
  await job.retry(firstDefined(args[1], payload.state) as 'failed' | 'completed' | undefined);
  return { ok: true, status: 'retried' };
};

const promoteQueueJob = async (
  state: BackendState,
  queueName: string,
  payload: RpcPayload
): Promise<unknown> => {
  const job = await getQueueJobById(state, queueName, payload);
  if (!job) return { ok: false, status: 'missing' };
  await job.promote();
  return { ok: true, status: 'promoted' };
};

/* eslint-disable complexity */
const dispatchQueue = async (
  state: BackendState,
  method: string,
  payload: RpcPayload
): Promise<unknown> => {
  const queueName = queueNameFromPayload(payload);

  switch (method) {
    case 'add':
    case 'enqueue':
      return addJob(state, payload);
    case 'get':
    case 'getJob':
      return getQueueJob(state, queueName, payload);
    case 'getJobs':
      return listQueueJobs(state, queueName, payload);
    case 'getJobCounts':
    case 'counts':
      return getQueueJobCounts(state, queueName, payload);
    case 'count':
    case 'length':
      return getQueue(state, queueName).count();
    case 'dequeue':
      return dequeueQueueJob(state, queueName, payload);
    case 'ack':
      return ackQueueJob(state, queueName, payload);
    case 'fail':
    case 'nack':
      return failQueueJob(state, queueName, payload);
    case 'pause':
      await getQueue(state, queueName).pause();
      return true;
    case 'resume':
      await getQueue(state, queueName).resume();
      return true;
    case 'drain':
      await getQueue(state, queueName).drain(
        Boolean(firstDefined(asArgs(payload)[0], payload.delayed))
      );
      return true;
    case 'obliterate':
      await getQueue(state, queueName).obliterate(getObliterateOptions(payload));
      return true;
    case 'clean': {
      const args = asArgs(payload);
      const cleanType = String(firstDefined(args[2], payload.type, 'completed'));
      return getQueue(state, queueName).clean(
        numberFrom(firstDefined(args[0], payload.grace), 0),
        numberFrom(firstDefined(args[1], payload.limit), 1000),
        (CLEAN_JOB_TYPES.has(cleanType) ? cleanType : 'completed') as
          | 'completed'
          | 'failed'
          | 'active'
          | 'delayed'
          | 'prioritized'
          | 'waiting'
          | 'paused'
          | 'wait'
      );
    }
    case 'removeJob':
      return removeQueueJob(state, queueName, payload);
    case 'retryJob':
      return retryQueueJob(state, queueName, payload);
    case 'promoteJob':
      return promoteQueueJob(state, queueName, payload);
    case 'closeQueue':
      return closeQueue(state, queueName);
    default:
      throw createRpcValidationError(`Unsupported queue method: ${method}`);
  }
};
/* eslint-enable complexity */

const workerRegistryKey = (state: BackendState): string =>
  `${normalizedPrefix(state)}:__rpc_workers`;

const buildWorkerRecord = (
  payload: RpcPayload,
  status: WorkerRegistryRecord['status']
): WorkerRegistryRecord => {
  const args = asArgs(payload);
  const queueName = requireString(
    firstDefined(args[0], payload.queueName, payload.queue),
    'queueName'
  );
  const workerName = requireString(
    firstDefined(args[1], payload.workerName, payload.name, `${queueName}:worker`),
    'workerName'
  );
  const processorSpec = firstDefined(payload.processorSpec, payload.spec, payload.processor);
  return {
    workerName,
    queueName,
    processorSpec: isNonEmptyString(processorSpec) ? String(processorSpec) : null,
    concurrency: Math.max(1, numberFrom(payload.concurrency, 1)),
    status,
    updatedAt: new Date().toISOString(),
    source: 'redis-rpc-registry',
  };
};

const parseWorkerRecord = (raw: string): WorkerRegistryRecord | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<WorkerRegistryRecord>;
    if (!isNonEmptyString(parsed.workerName) || !isNonEmptyString(parsed.queueName)) return null;
    return {
      workerName: parsed.workerName,
      queueName: parsed.queueName,
      processorSpec: isNonEmptyString(parsed.processorSpec) ? parsed.processorSpec : null,
      concurrency: Math.max(1, numberFrom(parsed.concurrency, 1)),
      status: parsed.status === 'running' ? 'running' : 'stopped',
      updatedAt: isNonEmptyString(parsed.updatedAt) ? parsed.updatedAt : new Date().toISOString(),
      source: 'redis-rpc-registry',
    };
  } catch {
    return null;
  }
};

const saveWorkerRecord = async (
  state: BackendState,
  record: WorkerRegistryRecord
): Promise<WorkerRegistryRecord> => {
  const connection = createConnection(state, { maxRetriesPerRequest: 1 });
  try {
    await connection.hset(workerRegistryKey(state), record.workerName, JSON.stringify(record));
  } finally {
    connection.disconnect();
  }
  return record;
};

const getWorkerRecord = async (
  state: BackendState,
  workerName: string
): Promise<WorkerRegistryRecord | null> => {
  const connection = createConnection(state, { maxRetriesPerRequest: 1 });
  try {
    const raw = await connection.hget(workerRegistryKey(state), workerName);
    return raw ? parseWorkerRecord(raw) : null;
  } finally {
    connection.disconnect();
  }
};

const listWorkerRecords = async (state: BackendState): Promise<WorkerRegistryRecord[]> => {
  const connection = createConnection(state, { maxRetriesPerRequest: 1 });
  try {
    const records = Object.values(await connection.hgetall(workerRegistryKey(state)))
      .map((raw) => parseWorkerRecord(raw))
      .filter((record): record is WorkerRegistryRecord => record !== null);
    return records.sort((left, right) => left.workerName.localeCompare(right.workerName));
  } finally {
    connection.disconnect();
  }
};

const QUEUE_DISCOVERY_EVENT_KEYS = new Set([
  'wait',
  'waiting',
  'active',
  'completed',
  'failed',
  'delayed',
  'paused',
  'meta',
]);

const discoverQueueNames = async (state: BackendState): Promise<string[]> => {
  const discovered = new Set(state.queues.keys());
  const connection = createConnection(state, { maxRetriesPerRequest: 1 });
  const prefix = normalizedPrefix(state);
  const marker = `${prefix}:`;
  let cursor = '0';
  try {
    do {
      // eslint-disable-next-line no-await-in-loop
      const [nextCursor, keys] = await connection.scan(
        cursor,
        'MATCH',
        `${prefix}:*`,
        'COUNT',
        '500'
      );
      cursor = String(nextCursor ?? '0');
      for (const key of Array.isArray(keys) ? keys : []) {
        if (typeof key !== 'string' || !key.startsWith(marker)) continue;
        const [queueName, keyKind] = key.slice(marker.length).split(':');
        if (queueName && QUEUE_DISCOVERY_EVENT_KEYS.has(keyKind ?? '')) {
          discovered.add(queueName);
        }
      }
    } while (cursor !== '0');
  } finally {
    connection.disconnect();
  }
  return Array.from(discovered).sort((left, right) => left.localeCompare(right));
};

const dispatchWorker = async (
  state: BackendState,
  method: string,
  payload: RpcPayload
): Promise<unknown> => {
  const args = asArgs(payload);
  switch (method) {
    case 'start':
    case 'startWorker':
    case 'startAppWorker':
    case 'restart':
    case 'restartWorker':
    case 'restartAppWorker':
      return saveWorkerRecord(state, buildWorkerRecord(payload, 'running'));
    case 'stop':
    case 'stopWorker': {
      const workerName = requireString(
        firstDefined(args[0], payload.workerName, payload.name),
        'workerName'
      );
      const current = await getWorkerRecord(state, workerName);
      if (!current) return false;
      return saveWorkerRecord(state, {
        ...current,
        status: 'stopped',
        updatedAt: new Date().toISOString(),
      });
    }
    case 'list': {
      const registered = await listWorkerRecords(state);
      const registeredQueues = new Set(registered.map((record) => record.queueName));
      const placeholders = (await discoverQueueNames(state))
        .filter((queueName) => !registeredQueues.has(queueName))
        .map((queueName) => ({
          workerName: `${queueName}:redis-rpc`,
          queueName,
          processorSpec: null,
          concurrency: 1,
          status: 'stopped',
          updatedAt: new Date().toISOString(),
          source: 'bullmq-discovery',
        }));
      return [...registered, ...placeholders];
    }
    default:
      throw createRpcValidationError(`Unsupported worker method: ${method}`);
  }
};

const dispatchMonitor = async (
  state: BackendState,
  method: string,
  payload: RpcPayload
): Promise<unknown> => {
  const args = asArgs(payload);
  switch (method) {
    case 'snapshot':
    case 'getSnapshot': {
      let queueNames: unknown[];
      if (isArray(args[0])) {
        queueNames = args[0];
      } else if (isArray(payload.queueNames)) {
        queueNames = payload.queueNames;
      } else {
        queueNames = await discoverQueueNames(state);
      }
      const queues = await Promise.all(
        queueNames.map(async (name) => {
          const queueName = requireString(name, 'queueName');
          const queue = getQueue(state, queueName);
          await recoverStaleActiveJobs(
            state,
            queueName,
            queue,
            numberFrom(payload.visibilityTimeoutMs, 30_000)
          );
          return { name: queueName, counts: await queue.getJobCounts() };
        })
      );
      return { status: 'ok', startedAt: new Date().toISOString(), queues };
    }
    case 'events':
    case 'getEvents': {
      const queueName = requireString(
        firstDefined(args[0], payload.queueName, payload.queue),
        'queueName'
      );
      getQueueEvents(state, queueName);
      return state.eventLogs.get(queueName) ?? [];
    }
    case 'getRecentJobsForQueue': {
      const queueName = requireString(
        firstDefined(args[0], payload.queueName, payload.queue),
        'queueName'
      );
      await recoverStaleActiveJobs(
        state,
        queueName,
        getQueue(state, queueName),
        numberFrom(payload.visibilityTimeoutMs, 30_000)
      );
      return dispatchQueue(state, 'getJobs', {
        ...payload,
        args: [],
        queueName,
        states: DEFAULT_JOB_STATES,
        start: 0,
        end: firstDefined(args[1], payload.limit, 99),
      });
    }
    default:
      throw createRpcValidationError(`Unsupported queue-monitor method: ${method}`);
  }
};

const dispatchRedis = async (
  state: BackendState,
  method: string,
  payload: RpcPayload
): Promise<unknown> => {
  const args = asArgs(payload);
  const connection = createConnection(state, { maxRetriesPerRequest: 1 });
  try {
    if (method === 'ping') return await connection.ping();
    if (method === 'call') {
      const command = requireString(firstDefined(args[0], payload.command), 'command');
      const rawCommandArgs = args.length > 0 ? args.slice(1) : asArgs(payload);
      const commandArgs = redisCommandArgs(rawCommandArgs);
      return await connection.call(command, ...commandArgs);
    }
    if (method === 'pipeline' || method === 'multi') {
      const commands = redisPipelineCommands(payload);
      const transaction = method === 'multi' || boolFrom(payload.transaction, false);
      const pipeline = (transaction
        ? connection.multi()
        : connection.pipeline()) as unknown as RedisCommandPipeline;
      for (const entry of commands) {
        const command = requireString(entry.command, 'command');
        queuePipelineCommand(
          pipeline,
          command,
          redisCommandArgs(isArray(entry.args) ? entry.args : [])
        );
      }
      return serializePipelineResults(await pipeline.exec());
    }
    throw createRpcValidationError(`Unsupported redis method: ${method}`);
  } finally {
    connection.disconnect();
  }
};

const dispatchCustom = async (
  backend: RedisRpcBackend,
  state: BackendState,
  service: string,
  method: string,
  payload: RpcPayload
): Promise<unknown> => {
  const handler = state.services.get(service);
  if (!handler) {
    throw createRpcValidationError(`Unsupported Redis RPC service: ${service}`);
  }
  return handler({ method, payload, backend });
};

const closeBackend = async (state: BackendState): Promise<void> => {
  await Promise.allSettled(
    Array.from(state.queueEvents.values()).map(async (events) => {
      try {
        await withTimeout(() => events.close());
      } catch {
        await events.disconnect();
      }
    })
  );
  await Promise.allSettled(
    Array.from(state.queues.values()).map(async (queue) => {
      try {
        await withTimeout(() => queue.close());
      } catch {
        await queue.disconnect();
      }
    })
  );
  for (const connection of state.connections) {
    connection.disconnect();
  }
  state.queues.clear();
  state.queueEvents.clear();
  state.eventLogs.clear();
  state.connections.clear();
};

export const createRedisRpcBackend = (
  options: CreateRedisRpcBackendOptions = {}
): RedisRpcBackend => {
  const serverOptions = rpcServerOptions();
  const state: BackendState = {
    prefix: options.prefix || serverOptions.prefix,
    connectionOptions: options.redis || redisConnectionOptions(),
    queues: new Map(),
    queueEvents: new Map(),
    eventLogs: new Map(),
    connections: new Set(),
    services: new Map(Object.entries(options.services ?? {})),
  };

  const backend: RedisRpcBackend = Object.freeze({
    prefix: state.prefix,
    dispatch: async (service, method, payload = {}) => {
      const normalizedService = requireString(service, 'service');
      const normalizedMethod = requireString(method, 'method');
      const body = requireRecord(payload, 'payload');

      if (normalizedService === 'queue' || normalizedService === 'bullmq')
        return dispatchQueue(state, normalizedMethod, body);
      if (normalizedService === 'worker') return dispatchWorker(state, normalizedMethod, body);
      if (normalizedService === 'queue-monitor')
        return dispatchMonitor(state, normalizedMethod, body);
      if (normalizedService === 'redis') return dispatchRedis(state, normalizedMethod, body);
      return dispatchCustom(backend, state, normalizedService, normalizedMethod, body);
    },
    registerService: (service, handler) => {
      state.services.set(requireString(service, 'service'), handler);
    },
    close: () => closeBackend(state),
  });

  return backend;
};
