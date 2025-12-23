/**
 * Queue Configuration
 * Background job and message queue settings
 * Sealed namespace for immutability
 */

import { Env } from '@config/env';

type QueueDriverName = 'sync' | 'database' | 'redis' | 'rabbitmq' | 'sqs';

type SyncQueueDriverConfig = {
  driver: 'sync';
};

type DatabaseQueueDriverConfig = {
  driver: 'database';
  table: string;
  connection: string;
};

type RedisQueueDriverConfig = {
  driver: 'redis';
  host: string;
  port: number;
  password?: string;
  database: number;
};

type RabbitMqQueueDriverConfig = {
  driver: 'rabbitmq';
  host: string;
  port: number;
  username: string;
  password: string;
  vhost: string;
};

type SqsQueueDriverConfig = {
  driver: 'sqs';
  key?: string;
  secret?: string;
  region: string;
  queueUrl?: string;
};

type QueueDriversConfig = {
  sync: SyncQueueDriverConfig;
  database: DatabaseQueueDriverConfig;
  redis: RedisQueueDriverConfig;
  rabbitmq: RabbitMqQueueDriverConfig;
  sqs: SqsQueueDriverConfig;
};

type QueueConfigWithDrivers = {
  default: QueueDriverName;
  drivers: QueueDriversConfig;
};

const getQueueDriver = (config: QueueConfigWithDrivers): QueueDriversConfig[QueueDriverName] => {
  const driverName = config.default;
  return config.drivers[driverName];
};

const queueConfigObj = {
  /**
   * Default queue driver
   */
  default: Env.get('QUEUE_DRIVER', 'sync') as QueueDriverName,

  /**
   * Queue drivers
   */
  drivers: {
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
  } satisfies QueueDriversConfig,

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
    database: Env.get('FAILED_JOBS_DB_CONNECTION', 'default'),
    table: Env.get('FAILED_JOBS_TABLE', 'failed_jobs'),
  },

  /**
   * Job processing
   */
  processing: {
    timeout: Env.getInt('QUEUE_JOB_TIMEOUT', 60),
    retries: Env.getInt('QUEUE_JOB_RETRIES', 3),
    backoff: Env.getInt('QUEUE_JOB_BACKOFF', 0),
    workers: Env.getInt('QUEUE_WORKERS', 1),
  },
};

export const queueConfig = Object.freeze(queueConfigObj);

export type QueueConfig = typeof queueConfig;
