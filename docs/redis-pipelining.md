---
title: Redis Pipelining Guide
description: Optimize Redis performance using ioredis pipelining in ZinTrust
---

# Redis Pipelining Guide

## Overview

ZinTrust uses **ioredis** for Redis connections (via `@zintrust/queue-redis` and core's `createRedisConnection`). This document explains how to use ioredis pipelining features to optimize Redis performance, especially over high-latency connections like Cloudflare tunnels.

## What is Redis Pipelining?

Redis pipelining allows you to send multiple commands to Redis in a single network round-trip, then receive all responses together. This dramatically reduces latency when executing multiple Redis operations sequentially.

**Without pipelining:**

```
Client → [CMD1] → Redis → [RES1] → Client (round-trip 1)
Client → [CMD2] → Redis → [RES2] → Client (round-trip 2)
Client → [CMD3] → Redis → [RES3] → Client (round-trip 3)
Total: 3 network round-trips
```

**With pipelining:**

```
Client → [CMD1, CMD2, CMD3] → Redis → [RES1, RES2, RES3] → Client
Total: 1 network round-trip
```

## Current Pipelining Usage in ZinTrust

### ✅ Already Using Pipelining

#### 1. Workers Package - WorkerMetrics.ts

**Location:** `packages/workers/src/WorkerMetrics.ts:286`

**Current Implementation:**

```typescript
const buildMetricsPipeline = (
  client: RedisConnection,
  optionsList: MetricQueryOptions[]
): RedisPipeline => {
  const pipeline = client.pipeline();

  for (const options of optionsList) {
    const { workerName, metricType, granularity, startDate, endDate, limit = 1000 } = options;
    const key = getMetricsKey(workerName, metricType, granularity);
    const minScore = startDate ? startDate.getTime() : '-inf';
    const maxScore = endDate ? endDate.getTime() : '+inf';
    pipeline.zrangebyscore(key, minScore, maxScore, 'LIMIT', 0, limit);
  }

  return pipeline;
};
```

**Analysis:** ✅ **Already optimized** - This code correctly uses pipelining for batch metrics queries, reducing network round-trips when querying multiple metrics.

#### 2. Queue-Monitor Package - metrics.ts

**Location:** `packages/queue-monitor/src/metrics.ts:96`

**Current Implementation:**

```typescript
const getStatsImpl = async (
  redis: RedisConnection,
  queue: string,
  minutes: number
): Promise<QueueStats[]> => {
  const keys = [];
  const timestamps: number[] = [];

  for (let i = 0; i < minutes; i++) {
    const m = currentMinute - i;
    timestamps.push(m);
    keys.push(getKey('stats', queue, m.toString()));
  }

  if (keys.length === 0) return [];

  const pipeline = redis.pipeline();
  keys.forEach((k) => pipeline.hgetall(k));
  const results = await pipeline.exec();

  // ... process results
};
```

**Analysis:** ✅ **Already optimized** - This code correctly uses pipelining for batch stats queries, fetching multiple time-series data points in a single round-trip.

#### 3. Queue-Monitor Package - metrics.ts (recordJobImpl) - NEWLY OPTIMIZED

**Location:** `packages/queue-monitor/src/metrics.ts:43`

**Optimized Implementation:**

```typescript
const recordJobImpl = async (
  redis: RedisConnection,
  queue: string,
  status: JobStatus,
  job: Job,
  error?: Error
): Promise<void> => {
  const minute = Math.floor(Date.now() / 60000);
  const dateKey = getKey('stats', queue, minute.toString());

  const jobData: JobSummary = {
    id: job.id,
    name: job.name,
    data: job.data,
    opts: job.opts,
    attempts: job.attemptsMade,
    failedReason: job.failedReason || error?.message,
    timestamp: Date.now(),
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
  };

  const pipeline = redis.pipeline();
  pipeline.hincrby(dateKey, status, 1);
  pipeline.expire(dateKey, 86400);

  const listKey = getKey('recent', queue);
  pipeline.lpush(listKey, JSON.stringify(jobData));
  pipeline.ltrim(listKey, 0, 99);

  if (status === 'failed') {
    const failedKey = getKey('failed', queue);
    pipeline.lpush(failedKey, JSON.stringify(jobData));
    pipeline.ltrim(failedKey, 0, 99);
  }

  await pipeline.exec();
};
```

**Analysis:** ✅ **Newly optimized** - This function now uses pipelining to batch 4-6 Redis operations into a single round-trip, providing 75-83% performance improvement.

### 🔄 Opportunities for Pipelining

#### 1. Queue-Monitor Package - driver.ts

**Location:** `packages/queue-monitor/src/driver.ts:56`

**Current Implementation:**

```typescript
const scanAsync = (cur: string): Promise<[string, string[]]> =>
  redis.scan(cur, 'MATCH', prefix + ':*', 'COUNT', '100');

while (shouldContinue) {
  // Redis scan must be sequential as it depends on the cursor from previous result
  const [nextCursor, keys] = await scanAsync(cursor);
  cursor = nextCursor;
  // ... process keys
}
```

**Analysis:** ⚠️ **Cannot use pipelining** - Redis SCAN operations are inherently sequential because each iteration depends on the cursor from the previous result. This is a limitation of Redis SCAN, not an optimization opportunity.

**Recommendation:** Keep current implementation - pipelining is not applicable here.

#### 2. Queue-Monitor Package - metrics.ts (getRecentJobs/getFailedJobs)

**Location:** `packages/queue-monitor/src/metrics.ts:128-136`

**Current Implementation:**

```typescript
getRecentJobs: async (queue: string): Promise<JobSummary[]> => {
  const list = await redis.lrange(getKey('recent', queue), 0, -1);
  return list.map((item: string) => JSON.parse(item) as JobSummary);
},

getFailedJobs: async (queue: string): Promise<JobSummary[]> => {
  const list = await redis.lrange(getKey('failed', queue), 0, -1);
  return list.map((item: string) => JSON.parse(item) as JobSummary);
},
```

**Analysis:** ⚠️ **Limited pipelining benefit** - These are single LRANGE operations, so pipelining wouldn't help unless combined with other operations.

**Recommendation:** Keep current implementation - single operations don't benefit from pipelining.

#### 3. Workers Package - MultiQueueWorker.ts

**Location:** `packages/workers/src/MultiQueueWorker.ts`

**Current Implementation:** Uses BullMQ Worker which internally manages Redis connections.

**Analysis:** ⚠️ **Indirect Redis usage** - BullMQ handles Redis operations internally. Direct pipelining not applicable unless accessing underlying Redis client.

**Recommendation:** BullMQ has its own optimization strategies. Focus on BullMQ configuration rather than direct pipelining.

## ioredis Pipelining APIs

### 1. `client.pipeline()` - Non-transactional Pipelining

**Purpose:** Send multiple commands without transaction guarantees. Commands are executed sequentially but not atomically.

**When to use:**

- You need performance optimization
- Commands don't need to be atomic
- You're okay with partial execution if errors occur
- Read-heavy operations

**Basic Usage:**

```typescript
import Redis from 'ioredis';

const redis = new Redis();

// Create a pipeline
const pipeline = redis.pipeline();

// Add commands to the pipeline
pipeline.set('key1', 'value1');
pipeline.set('key2', 'value2');
pipeline.get('key1');
pipeline.get('key2');

// Execute all commands in a single round-trip
const results = await pipeline.exec();

// results is an array of [error, result] tuples
// [
//   [null, 'OK'],           // SET key1 result
//   [null, 'OK'],           // SET key2 result
//   [null, 'value1'],       // GET key1 result
//   [null, 'value2']        // GET key2 result
// ]
```

**Error Handling:**

```typescript
const pipeline = redis.pipeline();
pipeline.set('key1', 'value1');
pipeline.get('nonexistent_key'); // This will return null, not an error
pipeline.incr('not_a_number'); // This might cause an error

const results = await pipeline.exec();

results.forEach(([error, result], index) => {
  if (error) {
    console.error(`Command ${index} failed:`, error);
  } else {
    console.log(`Command ${index} succeeded:`, result);
  }
});
```

**Advanced Usage with Promise Chaining:**

```typescript
const results = await redis
  .pipeline()
  .set('user:1:name', 'John')
  .set('user:1:email', 'john@example.com')
  .set('user:1:age', '30')
  .get('user:1:name')
  .get('user:1:email')
  .exec();
```

### 2. `client.multi()` - Transactional Pipelining

**Purpose:** Execute commands atomically using Redis transactions (MULTI/EXEC). All commands either succeed together or fail together.

**When to use:**

- You need atomicity (all-or-nothing execution)
- Commands depend on each other's results
- You need to prevent race conditions
- Write operations that require consistency

**Basic Usage:**

```typescript
const redis = new Redis();

// Create a transaction
const multi = redis.multi();

// Add commands to the transaction
multi.set('key1', 'value1');
multi.set('key2', 'value2');
multi.incr('counter');

// Execute all commands atomically
const results = await multi.exec();

// All commands executed atomically or none at all
// results format is same as pipeline: [[error, result], ...]
```

**Conditional Transactions with WATCH:**

```typescript
// Watch a key for changes
await redis.watch('balance');

const currentBalance = await redis.get('balance');
const newBalance = parseInt(currentBalance) - amount;

if (newBalance >= 0) {
  // Transaction will only succeed if 'balance' hasn't changed
  const results = await redis.multi().set('balance', newBalance).exec();

  if (results) {
    console.log('Transaction succeeded');
  } else {
    console.log('Transaction failed due to concurrent modification');
  }
} else {
  await redis.unwatch();
  console.log('Insufficient funds');
}
```

## Key Differences

| Feature                 | `pipeline()`                       | `multi()`                              |
| ----------------------- | ---------------------------------- | -------------------------------------- |
| **Atomicity**           | No (commands execute sequentially) | Yes (all-or-nothing)                   |
| **Performance**         | Faster (no transaction overhead)   | Slightly slower (transaction overhead) |
| **Error Handling**      | Individual commands can fail       | Transaction fails if any command fails |
| **Use Case**            | Performance optimization           | Data consistency                       |
| **WATCH Support**       | No                                 | Yes (conditional transactions)         |
| **Network Round-trips** | 1 round-trip for all commands      | 1 round-trip for all commands          |

## Performance Considerations

### When Pipelining Helps Most

1. **High-latency connections** (Cloudflare tunnels, WAN)
2. **Batch operations** (getting multiple keys, setting multiple values)
3. **Sequential independent operations**

### When Pipelining Doesn't Help

1. **Single operations** (no benefit for one command)
2. **Commands that depend on previous results** (need normal execution)
3. **Very large batches** (memory/network considerations)
4. **Redis SCAN operations** (inherently sequential)

### Performance Impact Example

**Without pipelining (4 sequential operations over 50ms latency):**

```
Total time: 50ms × 4 = 200ms
```

**With pipelining (4 operations in one batch):**

```
Total time: 50ms × 1 = 50ms (75% faster)
```

## Integration with ZinTrust

### Current State

- **ZinTrust core** uses ioredis via `createRedisConnection()`
- **Connection pooling** is already implemented (shared connections)
- **Pipelining** is used in some areas (WorkerMetrics, queue-monitor metrics)
- **Application code** can use pipelining by accessing the underlying Redis client

### How to Access Redis Client in ZinTrust

**Option 1: Direct Redis operations (no pipelining):**

```typescript
import { Cache } from '@zintrust/core/runtime';

// Current approach - individual operations
await Cache.set('key1', 'value1');
await Cache.set('key2', 'value2');
const value1 = await Cache.get('key1');
const value2 = await Cache.get('key2');
```

**Option 2: Access underlying Redis client for pipelining:**

```typescript
import { Cache } from '@zintrust/core/runtime';

// Get the underlying Redis client (only works with Redis driver)
const redisClient = Cache.getRedisClient();

const pipeline = redisClient.pipeline();
pipeline.set('key1', 'value1');
pipeline.set('key2', 'value2');
const results = await pipeline.exec();
```

**Note:** `Cache.getRedisClient()` only works with the Redis cache driver and will throw an error for other drivers (memory, KV, MongoDB, etc.).

**Option 3: Using transactions with multi():**

```typescript
import { Cache } from '@zintrust/core/runtime';

// Get the underlying Redis client
const redisClient = Cache.getRedisClient();

// Create a transaction
const multi = redisClient.multi();

// Add commands to the transaction
multi.set('key1', 'value1');
multi.set('key2', 'value2');
multi.incr('counter');

// Execute all commands atomically
const results = await multi.exec();
```

### Recommended Approach

1. **Identify bottlenecks**: Profile your application to find sequential Redis operations
2. **Batch operations**: Look for loops that make multiple Redis calls
3. **Use existing patterns**: Follow the patterns in WorkerMetrics.ts and queue-monitor metrics.ts
4. **Consider Cloudflare tunnels**: Pipelining provides significant benefits over high-latency connections

## Code Patterns to Optimize

### Pattern 1: Batch GET Operations

**Current (slow):**

```typescript
const userIds = ['user:1', 'user:2', 'user:3', 'user:4', 'user:5'];
const users = [];

for (const userId of userIds) {
  const user = await Cache.get(userId);
  users.push(user);
}
```

**Optimized with pipelining:**

```typescript
import { Cache } from '@zintrust/core/runtime';

const userIds = ['user:1', 'user:2', 'user:3', 'user:4', 'user:5'];
const redisClient = Cache.getRedisClient();
const pipeline = redisClient.pipeline();

userIds.forEach((userId) => {
  pipeline.get(userId);
});

const results = await pipeline.exec();
const users = results.map(([, result]) => result);
```

### Pattern 2: Batch SET Operations

**Current (slow):**

```typescript
const userData = {
  'user:1:name': 'John',
  'user:1:email': 'john@example.com',
  'user:1:age': '30',
};

for (const [key, value] of Object.entries(userData)) {
  await Cache.set(key, value);
}
```

**Optimized with pipelining:**

```typescript
import { Cache } from '@zintrust/core/runtime';

const userData = {
  'user:1:name': 'John',
  'user:1:email': 'john@example.com',
  'user:1:age': '30',
};

const redisClient = Cache.getRedisClient();
const pipeline = redisClient.pipeline();

Object.entries(userData).forEach(([key, value]) => {
  pipeline.set(key, value);
});

await pipeline.exec();
```

### Pattern 3: Mixed Read/Write Operations

**Current (slow):**

```typescript
await Cache.set('session:user123', JSON.stringify(sessionData));
await Cache.expire('session:user123', 3600);
const counter = await Cache.get('counter:login');
await Cache.set('counter:login', parseInt(counter || '0') + 1);
```

**Optimized with pipelining:**

```typescript
import { Cache } from '@zintrust/core/runtime';

const redisClient = Cache.getRedisClient();
const pipeline = redisClient.pipeline();

pipeline.set('session:user123', JSON.stringify(sessionData));
pipeline.expire('session:user123', 3600);
pipeline.get('counter:login');

const results = await pipeline.exec();
const counter = results[2][1] as string;
pipeline.set('counter:login', parseInt(counter || '0') + 1);
await pipeline.exec();
```

## Summary of ZinTrust Pipelining Status

### ✅ Already Optimized

- **WorkerMetrics.ts**: Batch metrics queries using pipelining
- **queue-monitor metrics.ts**: Batch stats queries using pipelining
- **queue-monitor metrics.ts (recordJobImpl)**: Newly optimized batch writes using pipelining

### 🔄 Can Be Optimized

- **Application code**: Use `Cache.getRedisClient()` to access the underlying Redis client for custom pipelining

### ⚠️ Not Applicable

- **queue-monitor driver.ts**: Redis SCAN operations are inherently sequential
- **MultiQueueWorker.ts**: Uses BullMQ which handles Redis internally
- **Single operations**: Individual commands don't benefit from pipelining

## Additional Resources

- [ioredis Documentation](https://ioredis.readthedocs.io/) - For advanced ioredis configuration
- [Redis Pipelining Documentation](https://redis.io/docs/manual/pipelining/) - Official Redis documentation
