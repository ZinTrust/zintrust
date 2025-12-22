/**
 * Queue Configuration
 * Background job and message queue settings
 */

import { Env } from '@config/env';

export const queueConfig = {
  /**
   * Default queue driver
   */
  default: Env.get('QUEUE_DRIVER', 'sync'),

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
  },

  /**
   * Get queue driver config
   */
  getDriver() {
    const driverName = this.default as keyof typeof this.drivers;
    return this.drivers[driverName];
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
} as const;

export type QueueConfig = typeof queueConfig;
