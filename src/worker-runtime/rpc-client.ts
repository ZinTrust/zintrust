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

type RpcEnvelope = {
  ok?: boolean;
  result?: unknown;
  error?: { message?: string };
};

export type PulledJob = {
  id: string;
  name?: string;
  payload: unknown;
  attempts: number;
};

const getBaseUrl = (): string => Env.get('REDIS_RPC_URL', '').trim();

const getSecret = (): string =>
  Env.get('REDIS_RPC_SECRET', Env.get('REDIS_PROXY_SECRET', Env.get('APP_KEY', ''))).trim();

export const isRedisRpcConfigured = (): boolean => getBaseUrl().length > 0;

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

/** Atomically claim and pull the next waiting job for a queue, or undefined if none. */
export const pullJob = async (
  queueName: string,
  visibilityTimeoutMs: number
): Promise<PulledJob | undefined> => {
  const result = await call<PulledJob | undefined | null>('queue', 'dequeue', {
    queueName,
    visibilityTimeoutMs,
  });
  return result ?? undefined;
};

/** Mark a pulled job completed. */
export const ackJob = async (
  queueName: string,
  jobId: string,
  returnValue?: unknown
): Promise<void> => {
  await call('queue', 'ack', { queueName, jobId, returnValue });
};

/** Mark a pulled job failed. */
export const failJob = async (queueName: string, jobId: string, reason: string): Promise<void> => {
  try {
    await call('queue', 'fail', { queueName, jobId, reason });
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
  const result = await call<RegisteredWorker[]>('worker', 'list', {});
  return Array.isArray(result) ? result : [];
};
