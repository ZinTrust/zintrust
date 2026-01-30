# Advanced Queue Patterns

This document describes the advanced queue patterns available in ZinTrust, including job deduplication, unique identification, and fine-grained lock management.

## Overview

ZinTrust provides powerful advanced queue patterns that enable:

- **Job Deduplication**: Prevent duplicate jobs from being processed
- **Custom Lock Management**: Fine-grained control over distributed locks
- **TTL Control**: Configure expiration times for locks and jobs
- **Cross-Service Coordination**: Coordinate tasks across multiple services
- **CLI Management**: Monitor and manage locks via command-line tools

## 📋 BullMQ JobOptions Reference

ZinTrust's BullMQ implementation supports all standard BullMQ JobOptions. These options are extracted from the payload and passed directly to BullMQ for processing.

| **Option**           | **Type**            | **Description**                                                                                                                                   | **Default**               | **Example**               |
| -------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------- |
| **jobId**            | `string`            | **Unique job identifier**. If specified, prevents duplicate jobs with same ID. Uses `uniqueId` from payload if present, otherwise generates UUID. | Auto-generated            | `jobId: 'custom-job-123'` |
| **delay**            | `number`            | **Delay in milliseconds** before job becomes available for processing. Used for scheduling future jobs.                                           | `undefined` (immediate)   | `delay: 3600000` (1 hour) |
| **attempts**         | `number`            | **Maximum retry attempts** before job is marked as failed.                                                                                        | `3` (BullMQ default)      | `attempts: 5`             |
| **priority**         | `number`            | **Job priority level** (1-10). Higher numbers = higher priority. Controls processing order.                                                       | `0` (normal)              | `priority: 10` (highest)  |
| **removeOnComplete** | `number \| boolean` | **Number of completed jobs to keep** in Redis. `0` = remove all, `true` = keep all, `false` = remove all.                                         | `100`                     | `removeOnComplete: 50`    |
| **removeOnFail**     | `number \| boolean` | **Number of failed jobs to keep** in Redis. `0` = remove all, `true` = keep all, `false` = remove all.                                            | `50`                      | `removeOnFail: 25`        |
| **backoff**          | `object`            | **Retry delay strategy**. Controls how long to wait between retries.                                                                              | Exponential with 2s delay | See below                 |
| **repeat**           | `object`            | **Recurring job configuration**. Supports cron patterns, intervals, or repeat every X times.                                                      | `undefined`               | See below                 |
| **lifo**             | `boolean`           | **Last-In-First-Out processing**. If `true`, processes newest jobs first.                                                                         | `false` (FIFO)            | `lifo: true`              |

### 🔄 Backoff Strategy Options

| **Type**        | **Description**                                 | **Example**                                           |
| --------------- | ----------------------------------------------- | ----------------------------------------------------- |
| **fixed**       | **Fixed delay** between retries.                | `{ type: 'fixed', delay: 5000 }` (5 seconds)          |
| **exponential** | **Exponential backoff** with increasing delays. | `{ type: 'exponential', delay: 2000 }` (starts at 2s) |

### ⏰ Repeat Job Options

| **Property** | **Type** | **Description**                             | **Example**                       |
| ------------ | -------- | ------------------------------------------- | --------------------------------- |
| **every**    | `number` | **Repeat every N milliseconds**.            | `every: 86400000` (daily)         |
| **cron**     | `string` | **Cron expression** for complex scheduling. | `cron: '0 9 * * 1'` (Monday 9 AM) |
| **limit**    | `number` | **Maximum number of repetitions**.          | `limit: 10` (repeat 10 times)     |

### 🎯 Usage Examples

#### **Basic Job with Delay**

```typescript
await Queue.enqueue('email', {
  to: 'user@example.com',
  subject: 'Welcome!',
  template: 'welcome',
  delay: 60000, // 1 minute delay
  uniqueId: 'welcome-123',
});
```

#### **High Priority Job with Custom Retry**

```typescript
await Queue.enqueue('urgent', {
  task: 'process-payment',
  priority: 10, // Highest priority
  attempts: 5, // 5 retry attempts
  backoff: {
    type: 'fixed',
    delay: 10000, // 10 second fixed delay
  },
  uniqueId: 'payment-456',
});
```

#### **Recurring Job**

```typescript
await Queue.enqueue('cleanup', {
  task: 'daily-cleanup',
  repeat: {
    every: 86400000, // Daily
  },
  removeOnComplete: 10, // Keep last 10 completions
  uniqueId: 'cleanup-daily',
});
```

#### **Cron-Scheduled Job**

```typescript
await Queue.enqueue('reports', {
  task: 'generate-report',
  repeat: {
    cron: '0 9 * * 1', // Every Monday at 9 AM
  },
  priority: 5,
  uniqueId: 'weekly-report',
});
```

#### **LIFO Processing (Stack-like)**

```typescript
await Queue.enqueue('stack', {
  task: 'process-latest-first',
  lifo: true, // Process newest jobs first
  uniqueId: 'stack-job',
});
```

## Features

### 1. uniqueId Pattern

**Purpose**: Custom unique job identification to prevent duplicates and enable external system integration.

**Code Examples**:

```typescript
// Basic usage with custom unique ID
await Queue.enqueue(
  'email',
  {
    to: 'user@example.com',
    template: 'welcome',
  },
  {
    uniqueId: `welcome-email-${userId}`, // Custom unique identifier
    deduplication: {
      id: `welcome-email-${userId}`,
      ttl: 300000, // 5 minutes
    },
  }
);

// Prevent duplicate file processing
await Queue.enqueue(
  'file-process',
  {
    fileId: 'file-123',
    operation: 'resize',
  },
  {
    uniqueId: `file-process-file-123-resize`,
    deduplication: {
      id: `file-process-file-123-resize`,
      ttl: 3600000, // 1 hour
    },
  }
);

// API rate limiting with unique ID
await Queue.enqueue(
  'api-call',
  {
    endpoint: '/api/v1/users',
    method: 'POST',
    data: userData,
  },
  {
    uniqueId: `api-post-users-${userId}`,
    deduplication: {
      id: `api-post-users-${userId}`,
      ttl: 60000, // 1 minute
    },
  }
);
```

### 2. uniqueVia Pattern

**Purpose**: Custom lock resolution mechanism for distributed systems and cross-service coordination.

**Code Examples**:

```typescript
// Using default Redis-based uniqueVia
await Queue.enqueue(
  'broadcast',
  {
    event: 'UserRegistered',
    data: userData,
  },
  {
    uniqueId: `user-registered-${userId}`,
    uniqueVia: 'redis', // Default Redis lock provider
    deduplication: {
      id: `user-registered-${userId}`,
      ttl: 30000,
    },
  }
);

// Custom uniqueVia implementation
interface CustomLockProvider {
  acquire(key: string, ttl: number): Promise<boolean>;
  release(key: string): Promise<void>;
  extend(key: string, ttl: number): Promise<boolean>;
}

// Register custom lock provider
registerLockProvider('database', createDatabaseLockProvider());

await Queue.enqueue(
  'critical-job',
  {
    operation: 'database-migration',
  },
  {
    uniqueId: 'db-migration-v2.1.0',
    uniqueVia: 'database', // Custom lock provider
    deduplication: {
      id: 'db-migration-v2.1.0',
      ttl: 7200000, // 2 hours
    },
  }
);

// Distributed lock across multiple services
await Queue.enqueue(
  'cross-service',
  {
    services: ['auth', 'billing', 'notifications'],
    operation: 'user-deactivation',
  },
  {
    uniqueId: `deactivate-user-${userId}`,
    uniqueVia: 'distributed-lock',
    deduplication: {
      id: `deactivate-user-${userId}`,
      ttl: 600000, // 10 minutes
    },
  }
);
```

### 3. expireAfter(\*).dontRelease() Pattern

**Purpose**: Chainable methods for advanced deduplication control with TTL and lock management.

**Code Examples**:

```typescript
// Chainable deduplication configuration
await Queue.enqueue(
  'long-running',
  {
    taskId: 'report-generation-123',
  },
  {
    deduplication: createDeduplicationBuilder()
      .id('report-generation-123')
      .expireAfter(1800000) // 30 minutes
      .dontRelease() // Lock persists until manual release
      .build(),
  }
);

// Throttled API calls with auto-release
await Queue.enqueue(
  'api-throttled',
  {
    endpoint: '/external/api/data',
    params: { userId: 123 },
  },
  {
    deduplication: createDeduplicationBuilder()
      .id(`api-call-${userId}`)
      .expireAfter(5000) // 5 seconds
      .build(), // Auto-releases after TTL
  }
);

// Debounced search indexing
await Queue.enqueue(
  'search-index',
  {
    documentId: 'doc-456',
    content: updatedContent,
  },
  {
    deduplication: createDeduplicationBuilder()
      .id(`index-doc-456`)
      .expireAfter(10000) // 10 seconds
      .replace() // Replace existing job
      .build(),
  }
);
```

### 4. releaseAfter Pattern

**Purpose**: Precise control over when deduplication locks are released.

**Code Examples**:

```typescript
// Release lock after specific delay
await Queue.enqueue(
  'scheduled-task',
  {
    taskId: 'daily-cleanup',
  },
  {
    deduplication: {
      id: 'daily-cleanup',
      ttl: 86400000, // 24 hours
      releaseAfter: 3600000, // Release lock 1 hour after completion
    },
  }
);

// Release after job success
await Queue.enqueue(
  'payment-processing',
  {
    paymentId: 'pay-789',
    amount: 99.99,
  },
  {
    deduplication: {
      id: `payment-${paymentId}`,
      ttl: 1800000, // 30 minutes
      releaseAfter: 'success', // Release only on successful completion
    },
  }
);

// Release after custom condition
await Queue.enqueue(
  'conditional-release',
  {
    processId: 'proc-123',
  },
  {
    deduplication: {
      id: `process-${processId}`,
      ttl: 600000, // 10 minutes
      releaseAfter: {
        condition: 'job.result.status === "completed"',
        delay: 30000, // Wait 30 seconds after condition met
      },
    },
  }
);
```

## Implementation Interfaces

```typescript
function createDeduplicationBuilder(): DeduplicationBuilder;

interface DeduplicationBuilder {
  id(id: string): DeduplicationBuilder;
  expireAfter(ms: number): DeduplicationBuilder;
  dontRelease(): DeduplicationBuilder;
  replace(): DeduplicationBuilder;
  releaseAfter(strategy: string | number | ReleaseCondition): DeduplicationBuilder;
  build(): DeduplicationOptions;
}

interface LockProvider {
  acquire(key: string, options: LockOptions): Promise<Lock>;
  release(lock: Lock): Promise<void>;
  extend(lock: Lock, ttl: number): Promise<boolean>;
  status(key: string): Promise<LockStatus>;
  list(pattern?: string): Promise<string[]>;
}

function createLockProvider(config: LockProviderConfig): LockProvider;

function createAdvancedQueue(config: QueueConfig): AdvancedQueue;

interface AdvancedQueue {
  enqueue(name: string, payload: unknown, options: AdvancedJobOptions): Promise<string>;
  deduplicate(id: string, builder: DeduplicationBuilder): Promise<JobResult>;
  releaseLock(key: string): Promise<void>;
  extendLock(key: string, ttl: number): Promise<boolean>;
}
```

## CLI Commands

ZinTrust provides CLI commands for managing deduplication locks and monitoring queue status.

### List Active Locks

List all active deduplication locks:

```bash
zin queue lock:list
```

With pattern matching:

```bash
# List locks matching a specific pattern
zin queue lock:list --pattern "email-*"

# Use different lock provider
zin queue lock:list --provider memory
```

**Output Example**:

```
Found 3 locks:
- [welcome-email-123] (TTL: 295s, Expires: 2026-01-26T15:30:00.000Z)
- [file-process-456] (TTL: 3540s, Expires: 2026-01-26T16:00:00.000Z)
- [api-call-789] (TTL: 55s, Expires: 2026-01-26T14:46:00.000Z)
```

### Release a Lock

Manually release a deduplication lock:

```bash
zin queue lock:release welcome-email-123
```

Use with a different provider:

```bash
zin queue lock:release my-lock-id --provider redis
```

### Extend Lock TTL

Extend the TTL of an existing lock (in seconds):

```bash
# Extend by 300 seconds (5 minutes)
zin queue lock:extend welcome-email-123 300
```

### Check Deduplication Status

Check if a specific job ID is currently locked/deduplicated:

```bash
zin queue dedupe:status welcome-email-123
```

**Output Examples**:

```
# Locked
Job ID 'welcome-email-123' is currently LOCKED (Deduplicated).
TTL Remaining: 245s
Expires At: 2026-01-26T15:30:00.000Z

# Not Locked
Job ID 'welcome-email-123' is NOT locked (Ready for processing or expired).
```

## Usage Examples

### Basic Deduplication

Prevent duplicate email jobs:

```typescript
import { Queue } from '@zintrust/core';

await Queue.enqueue(
  'email',
  {
    to: 'user@example.com',
    template: 'welcome',
  },
  {
    uniqueId: `welcome-email-${userId}`,
    deduplication: {
      id: `welcome-email-${userId}`,
      ttl: 300000, // 5 minutes
    },
  }
);
```

### Using Deduplication Builder

Fluent API for building deduplication options:

```typescript
import { createDeduplicationBuilder, Queue } from '@zintrust/core';

await Queue.enqueue(
  'report-generation',
  { userId: 123, type: 'monthly' },
  {
    deduplication: createDeduplicationBuilder()
      .id('monthly-report-123')
      .expireAfter(1800000) // 30 minutes
      .dontRelease() // Manual release required
      .build(),
  }
);

// Later, manually release the lock via CLI:
// zin queue lock:release monthly-report-123
```

### Custom Lock Providers

Use a custom lock provider for specific coordination needs:

```typescript
import { registerLockProvider, createAdvancedQueue } from '@zintrust/core';

// Register custom lock provider
registerLockProvider('database', createDatabaseLockProvider());

// Use in queue operations
await Queue.enqueue(
  'critical-migration',
  { version: '2.1.0' },
  {
    uniqueId: 'db-migration-v2.1.0',
    uniqueVia: 'database', // Use custom provider
    deduplication: {
      id: 'db-migration-v2.1.0',
      ttl: 7200000, // 2 hours
    },
  }
);
```

### Delayed Lock Release

Automatically release lock after a delay:

```typescript
await Queue.enqueue(
  'scheduled-cleanup',
  { taskId: 'daily-cleanup' },
  {
    deduplication: {
      id: 'daily-cleanup',
      ttl: 86400000, // 24 hours
      releaseAfter: 3600000, // Release 1 hour after job starts
    },
  }
);
```

## Lock Providers

ZinTrust includes two built-in lock providers:

### Redis Lock Provider

The default provider for production environments. Uses Redis for distributed locking with support for:

- Atomic lock acquisition via `SET NX PX`
- TTL-based expiration
- Lock extension
- Pattern-based key listing

**Configuration**:

```typescript
import { createLockProvider } from '@zintrust/core';

const provider = createLockProvider({
  type: 'redis',
  prefix: 'zintrust:locks:',
  defaultTtl: 300000, // 5 minutes
});
```

### Memory Lock Provider

For testing and single-instance deployments:

- In-memory lock storage
- TTL-based expiration with cleanup
- Pattern matching support

**Configuration**:

```typescript
const provider = createLockProvider({
  type: 'memory',
  prefix: 'locks:',
  defaultTtl: 300000,
});
```

## Best Practices

### 1. Choose Appropriate TTL Values

```typescript
// Short TTL for API rate limiting
deduplication: { id: 'api-call', ttl: 5000 } // 5 seconds

// Medium TTL for file processing
deduplication: { id: 'file-process', ttl: 3600000 } // 1 hour

// Long TTL for migrations
deduplication: { id: 'migration', ttl: 86400000 } // 24 hours
```

### 2. Use Meaningful Lock IDs

```typescript
// Good: descriptive and unique
uniqueId: `email-welcome-user-${userId}-${timestamp}`;

// Bad: too generic
uniqueId: `job-${id}`;
```

### 3. Monitor Lock Status

Regularly check for stale locks:

```bash
# List all locks
zin queue lock:list

# Check specific patterns
zin queue lock:list --pattern "migration-*"
```

### 4. Handle Lock Failures Gracefully

```typescript
try {
  const jobId = await Queue.enqueue('critical-task', payload, {
    deduplication: {
      id: 'task-123',
      ttl: 300000,
    },
  });

  if (jobId === 'DEDUPLICATED') {
    Logger.info('Task already in progress');
  }
} catch (error) {
  Logger.error('Failed to enqueue task', error);
}
```

## Troubleshooting

### Locks Not Releasing

If locks are not being released:

1. Check TTL values:

```bash
zin queue dedupe:status my-lock-id
```

2. Manually release if needed:

```bash
zin queue lock:release my-lock-id
```

3. Verify Redis connectivity for Redis provider

### High Lock Collision Rate

If experiencing frequent collisions:

1. Review lock ID generation strategy
2. Consider adjusting TTL values
3. Check for duplicate job submissions

### Memory Lock Provider Issues

For single-instance deployments:

- Locks are lost on process restart
- Not suitable for distributed systems
- Use Redis provider for production

## Environment Variables

Configure default behavior via environment variables:

```env
# Queue Configuration
QUEUE_DRIVER=redis
QUEUE_DEFAULT_DEDUP_TTL=300000
# Lock Provider Settings
QUEUE_LOCK_PREFIX=zintrust:locks:
QUEUE_MAX_LOCK_TTL=86400000


# Redis Configuration (for lock provider)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=secret
REDIS_QUEUE_DB=1
```

## API Reference

### `createDeduplicationBuilder()`

Creates a fluent builder for deduplication options.

**Methods**:

- `.id(string)` - Set the unique identifier
- `.expireAfter(ms)` - Set TTL in milliseconds
- `.dontRelease()` - Prevent automatic release
- `.replace()` - Replace existing job if locked
- `.releaseAfter(strategy)` - Configure release strategy
- `.build()` - Build final options object

### `createAdvancedQueue(config)`

Creates an advanced queue instance with deduplication support.

**Returns**: `AdvancedQueue`

### `registerLockProvider(name, provider)`

Register a custom lock provider.

**Parameters**:

- `name` - Provider identifier
- `provider` - LockProvider implementation

## Performance Considerations

### Lock Acquisition Overhead

- Redis locks: ~1-5ms per operation
- Memory locks: <1ms per operation
- Consider caching for high-frequency operations

### TTL Selection

Balance between:

- **Short TTL**: Lower collision, higher lock overhead
- **Long TTL**: Potential stale locks, lower overhead

### Key Pattern Matching

Use specific patterns to reduce `keys()` scan overhead:

```bash
# Efficient: specific pattern
zin queue lock:list --pattern "email-welcome-*"

# Less efficient: broad pattern
zin queue lock:list --pattern "*"
```

## Related Documentation

- [Queue Configuration](./config-queue.md)
- [Queue Monitoring](./queue-monitor.md)
- [CLI Reference](./cli-reference.md)
- [Workers Guide](./worker-management.md)

## Support

For issues or questions:

- GitHub Issues: [ZinTrust/zintrust](https://github.com/ZinTrust/zintrust/issues)
- Documentation: [docs.zintrust.dev](https://docs.zintrust.dev)
