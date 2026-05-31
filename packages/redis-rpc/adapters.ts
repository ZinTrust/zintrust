import { createRedisRpcClient } from './client';
import type { RedisRpcClient, RedisRpcClientOptions } from './types';

type QueueRpcMethods = Readonly<{
  add: (name: string, data?: unknown, opts?: Record<string, unknown>) => Promise<unknown>;
  enqueue: (name: string, data?: unknown, opts?: Record<string, unknown>) => Promise<unknown>;
  get: (data?: Record<string, unknown>) => Promise<unknown>;
  getJob: (jobId: string) => Promise<unknown>;
  getJobs: (states?: string[], start?: number, end?: number, asc?: boolean) => Promise<unknown>;
  getJobCounts: (...types: string[]) => Promise<unknown>;
  count: () => Promise<unknown>;
  pause: () => Promise<unknown>;
  resume: () => Promise<unknown>;
  drain: (delayed?: boolean) => Promise<unknown>;
  clean: (grace?: number, limit?: number, type?: string) => Promise<unknown>;
  removeJob: (jobId: string) => Promise<unknown>;
  retryJob: (jobId: string, state?: string) => Promise<unknown>;
  promoteJob: (jobId: string) => Promise<unknown>;
  obliterate: (options?: Record<string, unknown>) => Promise<unknown>;
  closeQueue: () => Promise<unknown>;
  close: () => Promise<unknown>;
}>;

type WorkerRpcMethods = Readonly<{
  startWorker: (queueName: string, workerName: string, options?: Record<string, unknown>) => Promise<unknown>;
  stopWorker: (workerName: string) => Promise<unknown>;
  list: () => Promise<unknown>;
}>;

type QueueMonitorRpcMethods = Readonly<{
  getSnapshot: (queueNames?: string[]) => Promise<unknown>;
  getEvents: (queueName: string) => Promise<unknown>;
  getRecentJobsForQueue: (queueName: string, limit?: number) => Promise<unknown>;
}>;

const resolveClient = (options: RedisRpcClientOptions & { client?: RedisRpcClient } = {}): RedisRpcClient => {
  return options.client || createRedisRpcClient(options);
};

export const createBullMqRpcQueue = (queueName: string, options: RedisRpcClientOptions & { client?: RedisRpcClient } = {}): QueueRpcMethods => {
  const client = resolveClient(options);
  return Object.freeze({
    add: (...args) => client.queue('add', { target: queueName, args }),
    enqueue: (...args) => client.queue('add', { target: queueName, args }),
    get: (data = {}) => client.queue('getJob', { target: queueName, ...data }),
    getJob: (...args) => client.queue('getJob', { target: queueName, args }),
    getJobs: (...args) => client.queue('getJobs', { target: queueName, args }),
    getJobCounts: (...args) => client.queue('getJobCounts', { target: queueName, args }),
    count: (...args) => client.queue('count', { target: queueName, args }),
    pause: (...args) => client.queue('pause', { target: queueName, args }),
    resume: (...args) => client.queue('resume', { target: queueName, args }),
    drain: (...args) => client.queue('drain', { target: queueName, args }),
    clean: (...args) => client.queue('clean', { target: queueName, args }),
    removeJob: (...args) => client.queue('removeJob', { target: queueName, args }),
    retryJob: (...args) => client.queue('retryJob', { target: queueName, args }),
    promoteJob: (...args) => client.queue('promoteJob', { target: queueName, args }),
    obliterate: (...args) => client.queue('obliterate', { target: queueName, args }),
    closeQueue: (...args) => client.queue('closeQueue', { target: queueName, args }),
    close: (...args) => client.queue('closeQueue', { target: queueName, args }),
  });
};

export const createWorkerRpcRuntime = (options: RedisRpcClientOptions & { client?: RedisRpcClient } = {}): WorkerRpcMethods => {
  const client = resolveClient(options);
  return Object.freeze({
    startWorker: (...args) => client.worker('startWorker', { args }),
    stopWorker: (...args) => client.worker('stopWorker', { args }),
    list: (...args) => client.worker('list', { args }),
  });
};

export const createQueueMonitorRpcDriver = (options: RedisRpcClientOptions & { client?: RedisRpcClient } = {}): QueueMonitorRpcMethods => {
  const client = resolveClient(options);
  return Object.freeze({
    getSnapshot: (...args) => client.monitor('getSnapshot', { args }),
    getEvents: (...args) => client.monitor('getEvents', { args }),
    getRecentJobsForQueue: (...args) => client.monitor('getRecentJobsForQueue', { args }),
  });
};

export const createRedisRpcService = <TService extends object>(service: string, options: RedisRpcClientOptions & { client?: RedisRpcClient; target?: string } = {}): TService => {
  const client = resolveClient(options);
  return client.service<TService>(service, options.target);
};
