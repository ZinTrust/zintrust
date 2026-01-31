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

## Complete Implementation Examples

### 1. Refactored Route Handler (routes/mail.ts)

This example shows how to properly structure advanced queue patterns in a route handler with focused functions:

```typescript
/* istanbul ignore file */
import AdvancedEmailJobService from '@app/Jobs/AdvancedEmailJobService';
import EmailJobService from '@app/Jobs/EmailJobService';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { Mail } from '@mail/Mail';
import { Router, type IRouter } from '@zintrust/core';

// Focused helper functions for each scenario
const demonstrateDelayScheduling = async (): Promise<void> => {
  // Schedule email for 1 hour from now - job won't process until delay expires
  await AdvancedEmailJobService.sendScheduledLock(
    'scheduled@zintrust.com',
    'Meeting Reminder',
    'welcome',
    { meetingTime: '2026-02-01T10:00:00Z' },
    3600000 // 1 hour delay in milliseconds
  );
};

const demonstratePriorityJobOrdering = async (): Promise<void> => {
  // High priority urgent email - processes before lower priority jobs
  await AdvancedEmailJobService.sendHighPriority(
    'urgent@zintrust.com',
    'URGENT: System Alert',
    'welcome',
    { alertType: 'critical' },
    { priority: 10, attempts: 5 } // Higher number = higher priority
  );
};

const demonstrateRetryControl = async (): Promise<void> => {
  // Email with custom retry attempts and exponential backoff
  await AdvancedEmailJobService.sendHighPriority(
    'retry@zintrust.com',
    'Retry Test',
    'welcome',
    { test: 'retry-logic' },
    { attempts: 7, delay: 0 } // Will retry 7 times with exponential backoff
  );
};

const demonstrateDeduplication = async (): Promise<void> => {
  // Prevents duplicate emails from being sent within 24-hour window
  await AdvancedEmailJobService.sendWithDeduplication(
    'dedup@zintrust.com',
    'Welcome Email',
    'welcome',
    { name: 'User' },
    'welcome-user-123', // Same uniqueId = same job
    'example-redis1'
  );

  await AdvancedEmailJobService.sendWithDeduplication(
    'dedup-2@zintrust.com',
    'Weekly Digest',
    'welcome',
    { digest: 'week-1', delay: 300000 },
    'weekly-digest-001',
    'example-redis1'
  );

  await AdvancedEmailJobService.sendWithDeduplication(
    'dedup-3@zintrust.com',
    'Invoice Ready',
    'welcome',
    { invoiceId: 'inv-8899', delay: 300000 },
    'invoice-inv-8899',
    'example-redis1'
  );
};

const demonstrateCustomLockProvider = async (): Promise<void> => {
  // Use custom lock provider (redis/database/memory) for uniqueness
  await AdvancedEmailJobService.sendWithUniqueLock(
    'unique@zintrust.com',
    'Password Reset',
    'welcome',
    { token: 'abc123' },
    'redis', // uniqueVia: 'redis' | 'database' | 'memory'
    'example-redis1'
  );

  await AdvancedEmailJobService.sendWithUniqueLock(
    'unique-2@zintrust.com',
    'Email Verification',
    'welcome',
    { token: 'verify-456' },
    'memory',
    'example-redis1'
  );

  await AdvancedEmailJobService.sendWithUniqueLock(
    'unique-3@zintrust.com',
    'Account Recovery',
    'welcome',
    { token: 'recover-789' },
    'database',
    'example-redis1'
  );
};

const demonstrateBulkProcessing = async (): Promise<void> => {
  // Send bulk emails with batch ID and per-recipient deduplication
  await AdvancedEmailJobService.sendBulk(
    ['bulk1@zintrust.com', 'bulk2@zintrust.com', 'bulk3@zintrust.com'],
    'Monthly Newsletter',
    'welcome',
    { campaign: 'Q1-2026', issue: 'January' },
    'batch-newsletter-202601', // batchId for tracking
    'example-redis1'
  );
};

const demonstrateMetadataTracking = async (): Promise<void> => {
  // Email with campaign tracking metadata
  await AdvancedEmailJobService.sendWithMetadata(
    'metadata@zintrust.com',
    'Campaign Email',
    'welcome',
    { userName: 'Alice' },
    {
      campaign: 'winter-sale',
      source: 'web-signup',
      priority: 'high',
      tags: ['marketing', 'promotion', 'new-user'],
    },
    'example-redis1'
  );
};

const demonstrateCombinedAdvancedOptions = async (): Promise<void> => {
  // High-priority scheduled email with retry logic
  await AdvancedEmailJobService.sendHighPriority(
    'combined@zintrust.com',
    'VIP Scheduled Notification',
    'welcome',
    { vipLevel: 'platinum' },
    {
      priority: 10, // High priority
      delay: 300000, // 5 minutes delay
      attempts: 5, // Retry up to 5 times
    },
    'example-redis1'
  );
};

// Main orchestrator function - clean and readable
const TestAdvancedJob = async (): Promise<void> => {
  // ====================================================================
  // SCENARIO 1: Delay Scheduling (delay option)
  // ====================================================================
  await demonstrateDelayScheduling();

  // ====================================================================
  // SCENARIO 2: Priority Job Ordering (priority option)
  // ====================================================================
  await demonstratePriorityJobOrdering();

  // ====================================================================
  // SCENARIO 3: Retry Control (attempts + backoff options)
  // ====================================================================
  await demonstrateRetryControl();

  // ====================================================================
  // SCENARIO 4: Deduplication Support (uniqueId + deduplication options)
  // ====================================================================
  await demonstrateDeduplication();

  // ====================================================================
  // SCENARIO 5: Custom Lock Provider (uniqueVia option)
  // ====================================================================
  await demonstrateCustomLockProvider();

  // ====================================================================
  // SCENARIO 6: Bulk Processing with Deduplication
  // ====================================================================
  await demonstrateBulkProcessing();

  // ====================================================================
  // SCENARIO 7: Metadata Tracking (custom envelope data)
  // ====================================================================
  await demonstrateMetadataTracking();

  // ====================================================================
  // SCENARIO 8: Combined Advanced Options
  // ====================================================================
  await demonstrateCombinedAdvancedOptions();
};

export const registerMailUiPag = async (router: IRouter): Promise<void> => {
  /* istanbul ignore next */
  // const { EmailJobService } = await import('@app/Jobs/EmailJobService');

  const handler = async (req: IRequest, res: IResponse): Promise<void> => {
    TestAdvancedJob();
    // Enterprise BullMQ worker (example-test-mysql2) is already running and will process this job
    const templateName = req.getParam('template') ?? 'welcome';
    const html = await Mail.render({
      template: templateName,
      variables:
        templateName === 'general'
          ? {
              name: 'Alice',
              headline: 'Hello Alice',
              message: 'Welcome to ZinTrust platform.',
              primary_color: '#0ea5e9',
            }
          : { name: 'Alice' },
    });
    res.html(html);
  };

  Router.get(router, '/mail/:template', handler);
};
```

**Key Benefits of This Structure:**

- ✅ **Single Responsibility**: Each function demonstrates one specific pattern
- ✅ **Maintainable**: Easy to modify individual scenarios
- ✅ **Testable**: Each function can be tested independently
- ✅ **Readable**: Clear function names describe the purpose
- ✅ **Lint Compliant**: All functions under 80 lines

### 2. Advanced Email Job Service (app/Jobs/AdvancedEmailJobService.ts)

This service provides a comprehensive API for advanced queue patterns:

```typescript
import { AdvancEmailQueue, type AdvancedEmailJobPayload } from '@app/Workers/AdvancEmailWorker';
import { generateUuid, Logger } from '@zintrust/core';

export const AdvancedEmailJobService = Object.freeze({
  async sendScheduledLock(
    to: string,
    subject: string,
    template: string,
    templateData: Record<string, unknown>,
    delayMs: number,
    queueName = 'advanced-queue'
  ): Promise<string> {
    const payload: AdvancedEmailJobPayload = {
      to,
      subject,
      template,
      templateData,
      uniqueId: `scheduled-${Date.now()}-${generateUuid()}`,
    };

    const queueOptions = {
      delay: delayMs, // ✅ This passes delay to BullMQ
    };

    const jobId = await AdvancEmailQueue.add(payload, queueName, queueOptions);
    const scheduledTime = new Date(Date.now() + delayMs).toISOString();
    Logger.info('Scheduled advanced email queued', { jobId, to, subject, scheduledTime });
    return jobId;
  },

  /**
   * Send an advanced email with deduplication support
   */
  async sendWithDeduplication(
    to: string,
    subject: string,
    template: string,
    templateData: Record<string, unknown>,
    deduplicationId: string,
    queueName = 'advanced-queue'
  ): Promise<string> {
    const payload: AdvancedEmailJobPayload = {
      to,
      subject,
      template,
      templateData,
      uniqueId: deduplicationId,
      deduplication: {
        id: deduplicationId,
        ttl: 86400000, // 24 hours
        releaseAfter: 3600000, // 1 hour
      },
    };

    const jobId = await AdvancEmailQueue.add(payload, queueName);
    Logger.info('Advanced email with deduplication queued', {
      jobId,
      to,
      subject,
      deduplicationId,
    });
    return jobId;
  },

  /**
   * Send an email with unique lock to prevent duplicates
   */
  async sendWithUniqueLock(
    to: string,
    subject: string,
    template: string,
    templateData: Record<string, unknown>,
    uniqueVia: string,
    queueName = 'advanced-queue'
  ): Promise<string> {
    const payload: AdvancedEmailJobPayload = {
      to,
      subject,
      template,
      templateData,
      uniqueId: `unique-${Date.now()}-${generateUuid()}`,
      uniqueVia,
    };

    const jobId = await AdvancEmailQueue.add(payload, queueName);
    Logger.info('Advanced email with unique lock queued', { jobId, to, subject, uniqueVia });
    return jobId;
  },

  /**
   * Send a high-priority email with custom options
   */
  async sendHighPriority(
    to: string,
    subject: string,
    template: string,
    templateData: Record<string, unknown>,
    options: {
      priority?: number;
      delay?: number;
      attempts?: number;
    } = {},
    queueName = 'advanced-queue'
  ): Promise<string> {
    const payload: AdvancedEmailJobPayload = {
      to,
      subject,
      template,
      templateData,
      timestamp: Date.now(),
      attempts: options.attempts ?? 3,
    };

    const queueOptions = {
      priority: options.priority ?? 10,
      delay: options.delay ?? 0,
    };

    const jobId = await AdvancEmailQueue.add(payload, queueName, queueOptions);
    Logger.info('High priority advanced email queued', {
      jobId,
      to,
      subject,
      priority: queueOptions.priority,
    });
    return jobId;
  },

  /**
   * Send a bulk email with batch processing support
   */
  async sendBulk(
    recipients: string[],
    subject: string,
    template: string,
    templateData: Record<string, unknown>,
    batchId?: string,
    queueName = 'advanced-queue'
  ): Promise<string[]> {
    const batchIdentifier = batchId ?? `batch-${Date.now()}-${generateUuid()}`;

    const jobPromises = recipients.map(async (to, index) => {
      const payload: AdvancedEmailJobPayload = {
        to,
        subject,
        template,
        templateData: {
          ...templateData,
          batch_id: batchIdentifier,
          recipient_index: index + 1,
          total_recipients: recipients.length,
        },
        uniqueId: `${batchIdentifier}-${to}`,
        deduplication: {
          id: `${batchIdentifier}-${to}`,
          ttl: 86400000, // 24 hours
        },
      };

      return AdvancEmailQueue.add(payload, queueName);
    });

    const jobIds = await Promise.all(jobPromises);

    Logger.info('Bulk advanced emails queued', {
      batchId: batchIdentifier,
      recipientCount: recipients.length,
      jobIds: jobIds.length,
    });
    return jobIds;
  },

  /**
   * Send an email with custom envelope metadata
   */
  async sendWithMetadata(
    to: string,
    subject: string,
    template: string,
    templateData: Record<string, unknown>,
    metadata: {
      campaign?: string;
      source?: string;
      priority?: string;
      tags?: string[];
    },
    queueName = 'advanced-queue'
  ): Promise<string> {
    const payload: AdvancedEmailJobPayload = {
      to,
      subject,
      template,
      templateData: {
        ...templateData,
        campaign: metadata.campaign,
        source: metadata.source,
        priority: metadata.priority,
        tags: metadata.tags,
      },
      uniqueId: `meta-${Date.now()}-${generateUuid()}`,
    };

    const jobId = await AdvancEmailQueue.add(payload, queueName);
    Logger.info('Advanced email with metadata queued', { jobId, to, subject, metadata });
    return jobId;
  },

  /**
   * Send a scheduled email with delay
   */
  async sendScheduled(
    to: string,
    subject: string,
    template: string,
    templateData: Record<string, unknown>,
    delayMs: number,
    queueName = 'advanced-queue'
  ): Promise<string> {
    const payload: AdvancedEmailJobPayload = {
      to,
      subject,
      template,
      templateData,
      uniqueId: `scheduled-${Date.now()}-${generateUuid()}`,
    };

    const queueOptions = {
      delay: delayMs,
    };

    const jobId = await AdvancEmailQueue.add(payload, queueName, queueOptions);
    const scheduledTime = new Date(Date.now() + delayMs).toISOString();
    Logger.info('Scheduled advanced email queued', { jobId, to, subject, scheduledTime });
    return jobId;
  },

  /**
   * Process a single advanced email job
   */
  async processOne(queueName = 'advanced-queue'): Promise<boolean> {
    return AdvancEmailQueue.processOne(queueName);
  },

  /**
   * Process all advanced email jobs in queue
   */
  async processAll(queueName = 'advanced-queue'): Promise<number> {
    return AdvancEmailQueue.processAll(queueName);
  },

  /**
   * Start the advanced email worker
   */
  async start(queueName = 'advanced-queue'): Promise<void> {
    return AdvancEmailQueue.start(queueName);
  },
});

export default AdvancedEmailJobService;

// Test samples for advanced queue patterns
export const testSamples = Object.freeze({
  advancedQueuePatternsHeadline: 'Advanced Queue Patterns',
  uniqueIdExample:
    "await AdvancedEmailJobService.sendWithDeduplication('user@example.com', 'Welcome', 'welcome', { name: 'User' }, 'welcome-user-123')",
  uniqueViaExample:
    "await AdvancedEmailJobService.sendWithUniqueLock('user@example.com', 'Reset Password', 'password-reset', { token: 'abc123' }, 'user-email')",
  bulkExample:
    "await AdvancedEmailJobService.sendBulk(['user1@example.com', 'user2@example.com'], 'Newsletter', 'newsletter', { issue: 'Q1-2024' })",
  scheduledExample:
    "await AdvancedEmailJobService.sendScheduled('user@example.com', 'Reminder', 'reminder', { event: 'meeting' }, 3600000)",
});
```

**Key Features:**

- ✅ **Comprehensive API**: All advanced queue patterns covered
- ✅ **Type Safety**: Full TypeScript support with proper interfaces
- ✅ **Logging**: Detailed logging for debugging and monitoring
- ✅ **Flexible**: Configurable queue names and options
- ✅ **Batch Processing**: Built-in support for bulk operations
- ✅ **Metadata Support**: Envelope metadata for tracking

### 3. Advanced Email Worker (app/Workers/AdvancEmailWorker.ts)

This worker handles the processing of advanced email jobs with full BullMQ integration:

```typescript
import type { BullMQPayload } from '@zintrust/core';
import { generateUuid, Logger, Mail, Queue } from '@zintrust/core';
import type { CreateQueueWorkerOptions, Job } from '@zintrust/workers';
import { createQueueWorker } from '@zintrust/workers';

// Type guard function to check if argument is a Job
function isJob<T extends object>(arg: T | Job<T>): arg is Job<T> {
  return 'data' in arg && typeof arg.data !== 'undefined';
}

// Extended email job payload for advanced queue testing
export type AdvancedEmailJobPayload = {
  to: string;
  subject?: string;
  body?: string;
  template?: string;
  templateData?: Record<string, unknown>;
  // Advanced options used for testing deduplication/unique locks
  uniqueId?: string;
  uniqueVia?: string;
  deduplication?: Record<string, unknown> | null;
  // envelope metadata
  timestamp?: number;
  attempts?: number;
};

function buildBaseVariables(
  payload: AdvancedEmailJobPayload,
  jobId: string
): Record<string, unknown> {
  const { to, subject } = payload;

  return {
    email: to ?? 'test@zintrust.com',
    subject: subject ?? 'Worker Notification',
    processed_at: new Date().toISOString(),
    job_id: jobId,
    timestamp: new Date().toISOString(),
    status: 'success',
  };
}

function buildTemplateWithCustomData(
  payload: AdvancedEmailJobPayload,
  baseVars: Record<string, unknown>
): { template: string; variables: Record<string, unknown> } {
  return {
    template: (payload.template as string) || 'general',
    variables: {
      ...baseVars,
      ...payload.templateData,
    },
  };
}

function buildTemplateWithDefaultData(
  payload: AdvancedEmailJobPayload,
  baseVars: Record<string, unknown>
): { template: string; variables: Record<string, unknown> } {
  const { subject, body } = payload;

  return {
    template: (payload.template as string) || 'general',
    variables: {
      ...baseVars,
      headline: subject ?? 'Worker Notification',
      message: body ?? 'Worker job completed successfully.',
      primary_color: '#3b82f6',
    },
  };
}

function buildGeneralTemplate(
  payload: AdvancedEmailJobPayload,
  baseVars: Record<string, unknown>
): { template: string; variables: Record<string, unknown> } {
  const { subject, body } = payload;

  return {
    template: 'general',
    variables: {
      ...baseVars,
      headline: subject ?? 'Worker Job Completed',
      message: body ?? 'Worker job has been processed successfully.',
      primary_color: '#3b82f6',
      action_url: payload.templateData?.['action_url'] ?? null,
      action_text: payload.templateData?.['action_text'] ?? 'View Details',
    },
  };
}

function buildTemplateVariables(
  payload: AdvancedEmailJobPayload,
  jobId: string
): { template: string; variables: Record<string, unknown> } {
  const baseVars = buildBaseVariables(payload, jobId);

  if (payload.template !== null && payload.template !== undefined && payload.templateData) {
    return buildTemplateWithCustomData(payload, baseVars);
  }

  if (payload.template !== null && payload.template !== undefined) {
    return buildTemplateWithDefaultData(payload, baseVars);
  }

  return buildGeneralTemplate(payload, baseVars);
}

async function sendEmail(
  payload: AdvancedEmailJobPayload,
  selectedTemplate: string,
  templateVars: Record<string, unknown>
): Promise<void> {
  const { to, subject, body } = payload;

  const htmlContent = await Mail.render({
    template: selectedTemplate,
    variables: templateVars,
  });

  const result = await Mail.send({
    to: to ?? 'test@zintrust.com',
    subject: subject ?? 'Worker Notification from ZinTrust',
    text: body ?? `Worker job completed successfully.`,
    html: htmlContent,
    from: {
      address: 'no-reply@engage.vizo.app',
      name: 'ZinTrust Advanced Worker',
    },
  });

  Logger.info('Advanced email sent', {
    template: selectedTemplate,
    to: to ?? 'test@zintrust.com',
    messageId: result.messageId,
    driver: result.driver,
    ok: result.ok,
  });
}

async function processAdvancedEmailJob(
  arg: AdvancedEmailJobPayload | Job<AdvancedEmailJobPayload>
): Promise<void> {
  const payload = isJob(arg) ? arg.data : arg;

  const jobId =
    'id' in arg && typeof arg.id === 'string'
      ? arg.id
      : `adv-email-${Date.now()}-${generateUuid()}`;

  Logger.info('Processing advanced email job', {
    jobId,
    to: payload.to,
    subject: payload.subject,
    template: payload.template,
  });

  try {
    const { template: selectedTemplate, variables: templateVars } = buildTemplateVariables(
      payload,
      jobId
    );

    // For advanced testing, log deduplication metadata if provided
    if (payload.uniqueId !== undefined) {
      Logger.info('Advanced job uniqueId provided', {
        uniqueId: payload.uniqueId,
        uniqueVia: payload.uniqueVia,
        deduplication: payload.deduplication,
      });
    }

    await sendEmail(payload, selectedTemplate, templateVars);
  } catch (error) {
    Logger.error('Advanced email send failed', {
      jobId,
      to: payload.to ?? 'test@zintrust.com',
      template: payload.template ?? 'general',
      error: error as Error,
    });

    throw error;
  }
}

const advancedWorkerOptions: CreateQueueWorkerOptions<AdvancedEmailJobPayload> = {
  kindLabel: 'Advanced Email Job',
  defaultQueueName: 'advanced-queue',
  maxAttempts: 3,
  getLogFields: (payload: AdvancedEmailJobPayload) => ({
    to: payload.to,
    subject: payload.subject,
    template: payload.template ?? 'general',
  }),
  handle: processAdvancedEmailJob,
};

export const AdvancEmailWorker = createQueueWorker(advancedWorkerOptions);

export const AdvancEmailQueue = {
  async add(
    payload: AdvancedEmailJobPayload,
    queueName = 'advanced-queue',
    options?: Record<string, unknown>
  ): Promise<string> {
    // Merge payload envelope with options for advanced tests
    const queuePayload = {
      ...payload,
      ...options,
      timestamp: Date.now(),
      attempts: 0,
    };
    Logger.info('queuePayload :', queuePayload);

    return Queue.enqueue(queueName, queuePayload as BullMQPayload);
  },

  async processOne(queueName = 'advanced-queue'): Promise<boolean> {
    return AdvancEmailWorker.processOne(queueName);
  },

  async processAll(queueName = 'advanced-queue'): Promise<number> {
    return AdvancEmailWorker.processAll(queueName);
  },

  async start(queueName = 'advanced-queue'): Promise<void> {
    void AdvancEmailWorker.startWorker({ queueName });
  },
};

export { AdvancEmailWorker as AdvancEmailWorkerInstance };

export default async function advancedEmailJobProcessor(
  job: Job<AdvancedEmailJobPayload>
): Promise<void> {
  await processAdvancedEmailJob(job);
}
```

**Key Features:**

- ✅ **Type Safety**: Full TypeScript interfaces and type guards
- ✅ **Template Handling**: Flexible template rendering with fallbacks
- ✅ **Error Handling**: Comprehensive error handling and logging
- ✅ **BullMQ Integration**: Full integration with BullMQ queue system
- ✅ **Metadata Support**: Handles advanced job metadata and deduplication
- ✅ **Worker Management**: Built-in worker lifecycle management

## Support

For issues or questions:

- GitHub Issues: [ZinTrust/zintrust](https://github.com/ZinTrust/zintrust/issues)
- Documentation: [doc.zintrust.com](https://doc.zintrust.com)
