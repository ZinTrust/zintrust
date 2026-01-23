# queue config

- Source: `src/config/queue.ts`

## Usage

Import from the framework:

```ts
import { queue } from '@zintrust/core';

// Example (if supported by the module):
// queue.*
```

## Snapshot (top)

```ts
/**
 * Queue Configuration
 * Background job and message queue settings
 * Sealed namespace for immutability
 */

import { Env } from '@zintrust/core';

import type { QueueConfigWithDrivers, QueueDriverName, QueueDriversConfig } from '@zintrust/core';

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
```

Note: The workers package and queue monitor share a Redis connection helper from core config. It uses the workers Redis settings (host/port/password/db), not the queue driver `database` field.

## BullMQ Redis Driver Environment Variables

When `QUEUE_DRIVER=redis`, the system uses BullMQ for enterprise features. Additional BullMQ-specific settings:

| Environment Variable        | Default     | Description                                        | Example |
| --------------------------- | ----------- | -------------------------------------------------- | ------- |
| `BULLMQ_REMOVE_ON_COMPLETE` | 100         | Number of completed jobs to keep in Redis          | 200     |
| `BULLMQ_REMOVE_ON_FAIL`     | 50          | Number of failed jobs to keep in Redis             | 25      |
| `BULLMQ_DEFAULT_ATTEMPTS`   | 3           | Default retry attempts for jobs                    | 5       |
| `BULLMQ_BACKOFF_DELAY`      | 2000        | Delay between retries (milliseconds)               | 5000    |
| `BULLMQ_BACKOFF_TYPE`       | exponential | Backoff strategy: 'exponential', 'fixed', 'custom' | fixed   |

### Usage Examples

**Development:**

```bash
BULLMQ_REMOVE_ON_COMPLETE=500 BULLMQ_DEFAULT_ATTEMPTS=2
```

**Production:**

```bash
BULLMQ_REMOVE_ON_COMPLETE=50 BULLMQ_DEFAULT_ATTEMPTS=5
```

**High-Volume:**

```bash
BULLMQ_REMOVE_ON_COMPLETE=10 BULLMQ_BACKOFF_DELAY=500
```

## Snapshot (bottom)

```ts
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

```
