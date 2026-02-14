/**
 * Queue Configuration (default override)
 *
 * Keep this file declarative:
 * - Core owns env parsing/default logic.
 * - Projects can override config by editing values below.
 *
 * BullMQ Redis Driver Environment Variables:
 * When QUEUE_DRIVER=redis, the system uses BullMQ for enterprise features.
 * Additional BullMQ-specific settings can be configured via environment variables:
 *
 * | Environment Variable | Default | Description | Example |
 * |---------------------|---------|-------------|---------|
 * | BULLMQ_REMOVE_ON_COMPLETE | 100 | Number of completed jobs to keep in Redis | 200 |
 * | BULLMQ_REMOVE_ON_FAIL | 50 | Number of failed jobs to keep in Redis | 25 |
 * | BULLMQ_DEFAULT_ATTEMPTS | 3 | Default retry attempts for jobs | 5 |
 * | BULLMQ_BACKOFF_DELAY | 2000 | Delay between retries (milliseconds) | 5000 |
 * | BULLMQ_BACKOFF_TYPE | exponential | Backoff strategy: 'exponential', 'fixed', 'custom' | fixed |
 *
 * Usage Examples:
 * Development: BULLMQ_REMOVE_ON_COMPLETE=500 BULLMQ_DEFAULT_ATTEMPTS=2
 * Production: BULLMQ_REMOVE_ON_COMPLETE=50 BULLMQ_DEFAULT_ATTEMPTS=5
 * High-Volume: BULLMQ_REMOVE_ON_COMPLETE=10 BULLMQ_BACKOFF_DELAY=500
 */
// @ts-ignore - config templates are excluded from the main TS project in this repo
import { Env } from '@config/env';
import type { QueueConfigOverrides } from '@config/queue';
import type { QueueDriverName } from '@config/type';

export default {
  default: Env.get('QUEUE_DRIVER', 'sync') as QueueDriverName,
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
      host: Env.getBool('USE_REDIS_PROXY', false)
        ? Env.get('REDIS_PROXY_HOST', Env.get('REDIS_HOST', 'localhost'))
        : Env.get('REDIS_HOST', 'localhost'),
      port: Env.getBool('USE_REDIS_PROXY', false)
        ? Env.getInt('REDIS_PROXY_PORT', Env.getInt('REDIS_PORT', 6379))
        : Env.getInt('REDIS_PORT', 6379),
      password: Env.get('REDIS_PASSWORD'),
      database: Env.getInt('REDIS_QUEUE_DB', 1),
      // Note: Redis driver uses BullMQ for enterprise features
      // See BullMQ environment variables in file header for customization
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
  failed: {
    database: Env.get('FAILED_JOBS_DB_CONNECTION', 'default'),
    table: Env.get('FAILED_JOBS_TABLE', 'failed_jobs'),
  },
  processing: {
    timeout: Env.getInt('QUEUE_JOB_TIMEOUT', 60),
    retries: Env.getInt('QUEUE_JOB_RETRIES', 3),
    backoff: Env.getInt('QUEUE_JOB_BACKOFF', 0),
    workers: Env.getInt('QUEUE_WORKERS', 1),
  },
  monitor: {
    enabled: Env.getBool('QUEUE_MONITOR_ENABLED', true),
    basePath: Env.get('QUEUE_MONITOR_BASE_PATH', '/queue-monitor'),
    middleware: Env.get('QUEUE_MONITOR_MIDDLEWARE')
      .split(',')
      .map((m: string) => m.trim())
      .filter((m: string) => m.length > 0) as ReadonlyArray<string>,
    autoRefresh: Env.getBool('QUEUE_MONITOR_AUTO_REFRESH', true),
    refreshIntervalMs: Env.getInt('QUEUE_MONITOR_REFRESH_MS', 5000),
  },
} satisfies QueueConfigOverrides;
