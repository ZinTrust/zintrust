# Redis Key Manager Singleton

## Overview

The `RedisKeyManager` has been refactored to use a singleton pattern for managing Queue and Worker Redis keys. This provides centralized, consistent key management across the entire ZinTrust framework.

## Key Features

- **Singleton Pattern**: Single instance ensures consistent key prefixes across all modules
- **Lazy Initialization**: Keys are created only when first accessed
- **Type Safety**: Full TypeScript support with proper typing
- **Backward Compatible**: Legacy functions still work but are deprecated

## Usage

### Modern Approach (Recommended)

```typescript
import { RedisKeys } from '@zintrust/core';

// Worker metrics keys
const metricsKey = RedisKeys.createMetricsKey('emailWorker', 'processed', 'hourly');
const healthKey = RedisKeys.createHealthKey('emailWorker');

// Queue keys
const queueKey = RedisKeys.createQueueKey('emails');
const bullmqKey = RedisKeys.createBullMQKey('emails');
const lockKey = RedisKeys.createQueueLockKey('email-processing');

// Cache and session keys
const cacheKey = RedisKeys.createCacheKey('user:123');
const sessionKey = RedisKeys.createSessionKey('session-abc-123');

// Direct prefix access
const metricsPrefix = RedisKeys.metricsPrefix;
const healthPrefix = RedisKeys.healthPrefix;
const queuePrefix = RedisKeys.queuePrefix;
```

### Legacy Approach (Deprecated)

```typescript
import {
  createWorkerKey,
  createQueueKey,
  createBullMQKey,
  METRICS_PREFIX,
  HEALTH_PREFIX,
} from '@zintrust/core';

// These still work but are deprecated
const workerKey = createWorkerKey('emailWorker');
const queueKey = createQueueKey('emails');
const prefix = METRICS_PREFIX;
```

## Available Keys

### Worker-Related Keys

- `RedisKeys.metricsPrefix` - Base prefix for worker metrics
- `RedisKeys.healthPrefix` - Base prefix for worker health checks
- `RedisKeys.workerPrefix` - Base prefix for worker instances
- `RedisKeys.createMetricsKey(workerName, metricType, granularity)` - Create metrics key
- `RedisKeys.createHealthKey(workerName)` - Create health check key
- `RedisKeys.createWorkerKey(workerName)` - Create worker instance key

### Queue-Related Keys

- `RedisKeys.queuePrefix` - Base prefix for queues
- `RedisKeys.bullmqPrefix` - Base prefix for BullMQ queues
- `RedisKeys.queueLockPrefix` - Base prefix for queue locks
- `RedisKeys.createQueueKey(queueName)` - Create queue key
- `RedisKeys.createBullMQKey(queueName)` - Create BullMQ queue key
- `RedisKeys.createQueueLockKey(lockName)` - Create queue lock key

### Cache and Session Keys

- `RedisKeys.cachePrefix` - Base prefix for cache
- `RedisKeys.sessionPrefix` - Base prefix for sessions
- `RedisKeys.createCacheKey(cacheKey)` - Create cache key
- `RedisKeys.createSessionKey(sessionId)` - Create session key

## Implementation Details

### Singleton Pattern

The singleton is implemented as a class with private constructor:

```typescript
class RedisKeyManagerSingleton {
  private static instance: RedisKeyManagerSingleton;

  private constructor() {
    // Private constructor prevents direct instantiation
  }

  public static getInstance(): RedisKeyManagerSingleton {
    if (!RedisKeyManagerSingleton.instance) {
      RedisKeyManagerSingleton.instance = new RedisKeyManagerSingleton();
    }
    return RedisKeyManagerSingleton.instance;
  }
}

// Export singleton instance
export const RedisKeys = RedisKeyManagerSingleton.getInstance();
```

### Lazy Initialization

Keys are initialized only when first accessed:

```typescript
public get metricsPrefix(): string {
  if (!this._metricsPrefix) {
    this._metricsPrefix = `${PREFIX}_worker:metrics:`;
  }
  return this._metricsPrefix;
}
```

### Testing

For testing purposes, you can reset all cached keys:

```typescript
import { RedisKeys } from '@zintrust/core';

// In test teardown
afterEach(() => {
  RedisKeys.reset();
});
```

## Migration Guide

### From Legacy to Singleton

**Before:**

```typescript
import { createWorkerKey, METRICS_PREFIX } from '@zintrust/core';

const key = createWorkerKey('myWorker');
const prefix = METRICS_PREFIX;
```

**After:**

```typescript
import { RedisKeys } from '@zintrust/core';

const key = RedisKeys.createWorkerKey('myWorker');
const prefix = RedisKeys.metricsPrefix;
```

### Custom Key Patterns

**Before:**

```typescript
const METRICS_PREFIX = `${PREFIX}_worker:metrics:`;
const key = `${METRICS_PREFIX}${workerName}:${metricType}:${granularity}`;
```

**After:**

```typescript
import { RedisKeys } from '@zintrust/core';

const key = RedisKeys.createMetricsKey(workerName, metricType, granularity);
```

## Benefits

1. **Consistency**: All keys use the same prefix generation logic
2. **Performance**: Keys are cached after first access
3. **Maintainability**: Single source of truth for key management
4. **Type Safety**: Full TypeScript support prevents errors
5. **Testability**: Easy to reset keys in tests
6. **Flexibility**: Environment-specific prefixes through `appConfig.prefix`

## Related Files

- [src/tools/redis/RedisKeyManager.ts](../src/tools/redis/RedisKeyManager.ts) - Main implementation
- [packages/workers/src/WorkerMetrics.ts](../packages/workers/src/WorkerMetrics.ts) - Worker metrics using singleton
- [src/tools/queue/Queue.ts](../src/tools/queue/Queue.ts) - Queue using singleton
- [packages/queue-monitor/src/metrics.ts](../packages/queue-monitor/src/metrics.ts) - Queue monitor using singleton

## See Also

- [Redis Configuration](./redis.md)
- [Worker Architecture](./workers.md)
- [Queue System](./queue.md)
