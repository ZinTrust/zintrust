/**
 * Worker-native Redis RPC client.
 *
 * The Cloudflare Worker cannot open a raw TCP/ioredis connection reliably, so all Redis
 * access goes over HTTP to the Redis RPC backend (`REDIS_RPC_URL`). This is the same
 * `/rpc` envelope used by the worker dashboard.
 */
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { ZedgiClient, ZedgiClientOptions } from '@zedgi/zedgi-client';

type RpcEnvelope = {
  ok?: boolean;
  result?: unknown;
  error?: { message?: string };
};

export type PulledJob = {
  id: string;
  name: string;
  payload: unknown;
  attempts: number;
};

type ZedgiClientModule = {
  createZedgiClient: (options: ZedgiClientOptions) => ZedgiClient;
};

const getBaseUrl = (): string => Env.get('REDIS_RPC_URL', '').trim();

const getSecret = (): string =>
  Env.get('REDIS_RPC_SECRET', Env.get('REDIS_PROXY_SECRET', Env.get('APP_KEY', ''))).trim();

export const isRedisRpcConfigured = (): boolean => getBaseUrl().length > 0;

export const resolveActiveQueueConnection = (): string => {
  const connection = Env.get('QUEUE_CONNECTION', '').trim().toLowerCase();
  if (connection !== '') return connection;
  return Env.get('QUEUE_DRIVER', '').trim().toLowerCase();
};

const isZedgiQueueSelected = (): boolean => resolveActiveQueueConnection() === 'queue-zedgi';

const isZedgiQueueConfigured = (): boolean =>
  Env.get('ZEDGI_URL', '').trim() !== '' && Env.get('ZEDGI_KEY', '').trim() !== '';

export const isWorkerQueueRuntimeConfigured = (): boolean =>
  isZedgiQueueSelected() ? isZedgiQueueConfigured() : isRedisRpcConfigured();

/**
 * Resolve the target Redis database index from env
 * (REDIS_QUEUE_DB → REDIS_DB → undefined).
 * Returns undefined when no explicit DB is configured,
 * which means the RPC backend uses its own server default.
 */
const getQueueDb = (): number | undefined => {
  const workersQueueDb = Env.getInt('WORKERS_REDIS_QUEUE_DB', -1);
  if (workersQueueDb >= 0) return workersQueueDb;
  const queueDb = Env.getInt('REDIS_QUEUE_DB', -1);
  if (queueDb >= 0) return queueDb;
  const redisDb = Env.getInt('REDIS_DB', -1);
  if (redisDb >= 0) return redisDb;
  return undefined;
};

/** Merge target DB into any queue RPC payload when configured. */
const queuePayload = <T extends Record<string, unknown>>(extra: T): T & { db?: number } => {
  const db = getQueueDb();
  return db === undefined ? extra : { db, ...extra };
};

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const isPullJobId = (value: unknown): value is string | number =>
  (typeof value === 'string' && value.trim() !== '') ||
  (typeof value === 'number' && Number.isFinite(value));

const parseHeaderEnv = (key: string): Record<string, unknown> | undefined => {
  const raw = Env.get(key, '').trim();
  if (raw === '') return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return { value: raw };
  }
  return undefined;
};

const resolveZedgiRedisCredential = (): Record<string, unknown> => {
  const credential: Record<string, unknown> = {};
  const password = Env.get('WORKERS_REDIS_PASSWORD', Env.get('REDIS_PASSWORD', '')).trim();
  if (password !== '') credential['password'] = password;

  const db = getQueueDb();
  if (db !== undefined) credential['db'] = db;

  const header = parseHeaderEnv('ZEDGI_QUEUE_HEADER') ?? parseHeaderEnv('ZEDGI_REDIS_HEADER');
  if (header !== undefined) credential['header'] = header;

  return credential;
};

const resolveZedgiRedisProfile = (): string | undefined => {
  const profile = Env.get('ZEDGI_QUEUE_PROFILE', Env.get('ZEDGI_REDIS_PROFILE', '')).trim();
  return profile === '' ? undefined : profile;
};

let zedgiClient: ZedgiClient | undefined;

const createZedgiOptions = (): ZedgiClientOptions => {
  const url = Env.get('ZEDGI_URL', '').trim();
  const key = Env.get('ZEDGI_KEY', '').trim();
  if (url === '' || key === '') {
    throw ErrorFactory.createConfigError(
      'Zedgi worker queue runtime requires ZEDGI_URL and ZEDGI_KEY when QUEUE_CONNECTION=queue-zedgi.'
    );
  }

  const options: Record<string, unknown> = {
    url,
    key,
    timeout: Env.getInt('ZEDGI_TIMEOUT', 10000),
  };

  const profile = resolveZedgiRedisProfile();
  if (profile !== undefined) {
    options['credentials'] = {
      redis: {
        [profile]: resolveZedgiRedisCredential(),
      },
    };
  }

  const signingSecret = Env.get('ZEDGI_SIGNING_SECRET', Env.get('ZEDGI_SECRET', '')).trim();
  if (signingSecret !== '') options['signingSecret'] = signingSecret;

  const publicKey = Env.get('ZEDGI_PUBLIC_KEY', '').trim();
  const accountId = Env.get('ZEDGI_ACCOUNT_ID', '').trim();
  const keyVersion = Env.get('ZEDGI_KEY_VERSION', '').trim();
  if (publicKey !== '' && accountId !== '' && keyVersion !== '') {
    options['publicKey'] = publicKey;
    options['accountId'] = accountId;
    options['keyVersion'] = Number.parseInt(keyVersion, 10);
  }

  return options as ZedgiClientOptions;
};

const getZedgiClient = async (): Promise<ZedgiClient> => {
  if (zedgiClient === undefined) {
    const options = createZedgiOptions();
    try {
      const mod = (await import('@zedgi/zedgi-client')) as unknown as ZedgiClientModule;
      zedgiClient = mod.createZedgiClient(options);
    } catch (error) {
      throw ErrorFactory.createConfigError(
        '@zedgi/zedgi-client is required when QUEUE_CONNECTION=queue-zedgi is used by the Worker runtime.',
        error
      );
    }
  }

  return zedgiClient;
};

const resolveZedgiRedisCredentialSelector = (): string | Record<string, unknown> => {
  return resolveZedgiRedisProfile() ?? resolveZedgiRedisCredential();
};

const call = async <T = unknown>(
  service: string,
  method: string,
  payload: Record<string, unknown> = {}
): Promise<T> => {
  const baseUrl = getBaseUrl();
  if (baseUrl.length === 0) {
    throw ErrorFactory.createConfigError('REDIS_RPC_URL is not configured');
  }
  const secret = getSecret();
  const response = await fetch(new URL('/rpc', baseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { 'x-redis-rpc-secret': secret } : {}),
    },
    body: JSON.stringify({ requestId: crypto.randomUUID(), service, method, payload }),
  });
  const parsed = (await response.json()) as RpcEnvelope;
  if (!response.ok || parsed.ok !== true) {
    throw ErrorFactory.createConfigError(
      parsed.error?.message ?? `Redis RPC ${service}.${method} failed (${response.status})`
    );
  }
  return parsed.result as T;
};

const resolvePulledJobPayload = (record: Record<string, unknown>): unknown => {
  if (hasOwn(record, 'payload')) return record['payload'];
  if (hasOwn(record, 'data')) return record['data'];
  throw ErrorFactory.createConfigError('Worker queue pull returned a job without payload/data');
};

const resolvePulledJobAttempts = (record: Record<string, unknown>): number => {
  const rawAttempts = hasOwn(record, 'attempts') ? record['attempts'] : record['attemptsMade'];
  return typeof rawAttempts === 'number' && Number.isFinite(rawAttempts)
    ? Math.max(0, Math.floor(rawAttempts))
    : 0;
};

const resolvePulledJobName = (record: Record<string, unknown>): string => {
  return typeof record['name'] === 'string' && record['name'].trim() !== ''
    ? record['name'].trim()
    : 'default';
};

const normalizePulledJob = (raw: unknown): PulledJob | undefined => {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw ErrorFactory.createConfigError('Worker queue pull returned an invalid job payload');
  }

  const record = raw as Record<string, unknown>;
  const rawId = record['id'];
  if (!isPullJobId(rawId)) {
    throw ErrorFactory.createConfigError('Worker queue pull returned a job without an id');
  }

  return {
    id: String(rawId),
    name: resolvePulledJobName(record),
    payload: resolvePulledJobPayload(record),
    attempts: resolvePulledJobAttempts(record),
  };
};

const createZedgiBullMqError = (method: string, error: unknown): Error => {
  const record =
    error !== null && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  const code = typeof record['code'] === 'string' ? record['code'] : '';
  const statusCode = typeof record['statusCode'] === 'number' ? record['statusCode'] : undefined;
  const message = error instanceof Error ? error.message : String(error);
  if (code === 'ZEDGI_HOOK_NOT_FOUND' || statusCode === 404) {
    return ErrorFactory.createConfigError(
      `Zedgi backend/account does not expose required queue consumer hook ${method}. Enable bull:dequeue, bull:ack, and bull:fail for queue-zedgi workers.`,
      error
    );
  }

  return ErrorFactory.createConfigError(
    `Zedgi queue consumer hook ${method} failed: ${message}`,
    error
  );
};

const callZedgiBullMqOperation = async <T = unknown>(
  operation: 'dequeue' | 'ack' | 'fail',
  payload: Record<string, unknown>
): Promise<T> => {
  const method = `bull:${operation}`;
  try {
    const client = await getZedgiClient();
    return await client.call<T>('redis', method, payload, {
      credential: resolveZedgiRedisCredentialSelector(),
    });
  } catch (error) {
    throw createZedgiBullMqError(method, error);
  }
};

/** Atomically claim and pull the next waiting job for a queue, or undefined if none. */
export const pullJob = async (
  queueName: string,
  visibilityTimeoutMs: number
): Promise<PulledJob | undefined> => {
  if (isZedgiQueueSelected()) {
    const result = await callZedgiBullMqOperation('dequeue', {
      target: queueName,
      visibilityTimeoutMs,
    });
    return normalizePulledJob(result);
  }

  const result = await call<PulledJob | undefined | null>(
    'queue',
    'dequeue',
    queuePayload({
      queueName,
      visibilityTimeoutMs,
    })
  );
  return normalizePulledJob(result);
};

/** Mark a pulled job completed. */
export const ackJob = async (
  queueName: string,
  jobId: string,
  returnValue?: unknown
): Promise<void> => {
  if (isZedgiQueueSelected()) {
    await callZedgiBullMqOperation('ack', { target: queueName, args: [jobId, returnValue] });
    return;
  }

  await call('queue', 'ack', queuePayload({ queueName, jobId, returnValue }));
};

/** Mark a pulled job failed. */
export const failJob = async (queueName: string, jobId: string, reason: string): Promise<void> => {
  if (isZedgiQueueSelected()) {
    await callZedgiBullMqOperation('fail', { target: queueName, args: [jobId, reason] });
    return;
  }

  try {
    await call('queue', 'fail', queuePayload({ queueName, jobId, reason }));
  } catch (error) {
    Logger.warn('[worker-runtime] failJob RPC failed', { queueName, jobId, error });
  }
};

export type RegisteredWorker = {
  workerName: string;
  queueName: string;
  status?: string;
  processorSpec?: string | null;
  source?: string;
};

/** List worker lifecycle records the backend holds (status running/stopped). */
export const listWorkers = async (): Promise<RegisteredWorker[]> => {
  if (isZedgiQueueSelected()) {
    return [];
  }

  const result = await call<RegisteredWorker[]>('worker', 'list', {});
  return Array.isArray(result) ? result : [];
};
