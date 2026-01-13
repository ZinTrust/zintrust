/**
 * Queue Configuration
 * Background job and message queue settings
 * Sealed namespace for immutability
 */

import { Env } from '@config/env';

import { StartupConfigFile, StartupConfigFileRegistry } from '@/runtime/StartupConfigFileRegistry';
import type { QueueConfigWithDrivers, QueueDriverName, QueueDriversConfig } from '@config/type';

export type QueueConfigOverrides = Partial<{
  default: QueueDriverName;
  drivers: Partial<QueueDriversConfig>;
  failed: { database: string; table: string };
  processing: { timeout: number; retries: number; backoff: number; workers: number };
}>;

const getQueueDriver = (config: QueueConfigWithDrivers): QueueDriversConfig[QueueDriverName] => {
  const driverName = config.default;
  return config.drivers[driverName];
};

const createQueueConfig = (): {
  default: QueueDriverName;
  drivers: QueueDriversConfig;
  getDriver: (this: QueueConfigWithDrivers) => QueueDriversConfig[QueueDriverName];
  failed: { database: string; table: string };
  processing: { timeout: number; retries: number; backoff: number; workers: number };
} => {
  const overrides: QueueConfigOverrides =
    StartupConfigFileRegistry.get<QueueConfigOverrides>(StartupConfigFile.Queue) ?? {};

  const baseDefault = Env.get('QUEUE_DRIVER', 'sync') as QueueDriverName;
  const baseDrivers = {
    sync: {
      driver: 'sync' as const,
    },
    database: {
      driver: 'database' as const,
      table: Env.get('QUEUE_TABLE', 'jobs'),
      connection: Env.get('QUEUE_DB_CONNECTION', 'default'),
    },
    redis: {
      driver: 'redis' as const,
      host: Env.get('REDIS_HOST', 'localhost'),
      port: Env.getInt('REDIS_PORT', 6379),
      password: Env.get('REDIS_PASSWORD'),
      database: Env.getInt('REDIS_QUEUE_DB', 1),
    },
    rabbitmq: {
      driver: 'rabbitmq' as const,
      host: Env.get('RABBITMQ_HOST', 'localhost'),
      port: Env.getInt('RABBITMQ_PORT', 5672),
      username: Env.get('RABBITMQ_USER', 'guest'),
      password: Env.get('RABBITMQ_PASSWORD', 'guest'),
      vhost: Env.get('RABBITMQ_VHOST', '/'),
    },
    sqs: {
      driver: 'sqs' as const,
      key: Env.get('AWS_ACCESS_KEY_ID'),
      secret: Env.get('AWS_SECRET_ACCESS_KEY'),
      region: Env.AWS_REGION,
      queueUrl: Env.get('AWS_SQS_QUEUE_URL'),
    },
  } satisfies QueueDriversConfig;

  const baseFailed = {
    database: Env.get('FAILED_JOBS_DB_CONNECTION', 'default'),
    table: Env.get('FAILED_JOBS_TABLE', 'failed_jobs'),
  };

  const baseProcessing = {
    timeout: Env.getInt('QUEUE_JOB_TIMEOUT', 60),
    retries: Env.getInt('QUEUE_JOB_RETRIES', 3),
    backoff: Env.getInt('QUEUE_JOB_BACKOFF', 0),
    workers: Env.getInt('QUEUE_WORKERS', 1),
  };

  const mergedDrivers = {
    ...baseDrivers,
    ...(overrides.drivers ?? {}),
  } satisfies QueueDriversConfig;

  const queueConfigObj = {
    /**
     * Default queue driver
     */
    default: (overrides.default ?? baseDefault) as QueueDriverName,

    /**
     * Queue drivers
     */
    drivers: mergedDrivers,

    /**
     * Get queue driver config
     */
    getDriver(): QueueDriversConfig[QueueDriverName] {
      return getQueueDriver(this);
    },

    /**
     * Failed jobs table
     */
    failed: {
      ...baseFailed,
      ...(overrides.failed ?? {}),
    },

    /**
     * Job processing
     */
    processing: {
      ...baseProcessing,
      ...(overrides.processing ?? {}),
    },
  };

  return Object.freeze(queueConfigObj);
};

export type QueueConfig = ReturnType<typeof createQueueConfig>;

let cached: QueueConfig | null = null;
const proxyTarget: QueueConfig = {} as QueueConfig;

const ensureQueueConfig = (): QueueConfig => {
  if (cached) return cached;
  cached = createQueueConfig();

  try {
    Object.defineProperties(
      proxyTarget as unknown as object,
      Object.getOwnPropertyDescriptors(cached)
    );
  } catch {
    // best-effort
  }

  return cached;
};

export const queueConfig: QueueConfig = new Proxy(proxyTarget, {
  get(_target, prop: keyof QueueConfig) {
    return ensureQueueConfig()[prop];
  },
  ownKeys() {
    ensureQueueConfig();
    return Reflect.ownKeys(proxyTarget as unknown as object);
  },
  getOwnPropertyDescriptor(_target, prop) {
    ensureQueueConfig();
    return Object.getOwnPropertyDescriptor(proxyTarget as unknown as object, prop);
  },
});
