# AdvancedEmailJobService Usage Examples

The `AdvancedEmailJobService` provides advanced email queue functionality with
support for deduplication, unique locks, bulk processing, and scheduling.

## Basic Usage

```typescript
import AdvancedEmailJobService from '@app/Jobs/AdvancedEmailJobService';

// Send with deduplication (prevents duplicate emails)
await AdvancedEmailJobService.sendWithDeduplication(
  'user@example.com',
  'Welcome to ZinTrust!',
  'welcome',
  { name: 'John Doe' },
  'welcome-user-123' // unique deduplication ID
);

// Send with unique lock (only one email per unique constraint)
await AdvancedEmailJobService.sendWithUniqueLock(
  'user@example.com',
  'Password Reset',
  'password-reset',
  { resetToken: 'abc123' },
  'user-email' // unique constraint
);
```

## Bulk Email Processing

```typescript
// Send bulk emails with batch tracking
const recipients = ['user1@example.com', 'user2@example.com', 'user3@example.com'];
const jobIds = await AdvancedEmailJobService.sendBulk(
  recipients,
  'Monthly Newsletter',
  'newsletter',
  { issue: 'Q1-2024', campaign: 'monthly' },
  'newsletter-april-2024' // optional batch ID
);

console.log(`Queued ${jobIds.length} emails`);
```

## High Priority and Scheduled Emails

```typescript
// Send high priority email
await AdvancedEmailJobService.sendHighPriority(
  'admin@example.com',
  'Critical System Alert',
  'system-alert',
  { error: 'Database connection failed' },
  { priority: 20, delay: 0 } // higher priority = more important
);

// Schedule email for later
await AdvancedEmailJobService.sendScheduled(
  'user@example.com',
  'Meeting Reminder',
  'meeting-reminder',
  { meetingTime: '2024-02-01T10:00:00Z' },
  3600000 // delay in milliseconds (1 hour)
);
```

## Email with Custom Metadata

```typescript
await AdvancedEmailJobService.sendWithMetadata(
  'customer@example.com',
  'Special Offer Just for You!',
  'promotion',
  { discountCode: 'SAVE20', expiryDate: '2024-02-15' },
  {
    campaign: 'spring-sale',
    source: 'email-marketing',
    priority: 'high',
    tags: ['promotion', 'spring', 'discount'],
  }
);
```

## Queue Management

```typescript
// Process a single job
const processed = await AdvancedEmailJobService.processOne();
console.log(`Processed ${processed ? '1' : '0'} job`);

// Process all jobs in queue
const processedCount = await AdvancedEmailJobService.processAll();
console.log(`Processed ${processedCount} jobs`);

// Start worker for continuous processing
await AdvancedEmailJobService.start();
```

## Advanced Features

### Deduplication

Prevents duplicate emails with the same deduplication ID for 24 hours:

```typescript
// This will only be sent once, even if called multiple times
await AdvancedEmailJobService.sendWithDeduplication(
  'user@example.com',
  'Welcome',
  'welcome',
  { name: 'User' },
  'welcome-user-123'
);
```

### Unique Locks

This section demonstrates unique lock functionality.

```typescript
// Only one email will be sent per user, regardless of template
await AdvancedEmailJobService.sendWithUniqueLock(
  'user@example.com',
  'Account Update',
  'account-update',
  { changes: ['email', 'password'] },
  'user-email'
);
```

### Bulk Processing with Parallel Queuing

Bulk emails are queued in parallel for better performance:

```typescript
const recipients = Array.from({ length: 1000 }, (_, i) => `user${i}@example.com`);
const startTime = Date.now();

const jobIds = await AdvancedEmailJobService.sendBulk(
  recipients,
  'Bulk Campaign',
  'bulk-campaign',
  { campaignId: 'spring-2024' }
);

const endTime = Date.now();
console.log(`Queued ${jobIds.length} emails in ${endTime - startTime}ms`);
```

## Error Handling

All methods return a `Promise<string>` (job ID) or
`Promise<string[]>` for bulk operations:

```typescript
try {
  const jobId = await AdvancedEmailJobService.sendWithDeduplication(
    'user@example.com',
    'Test Email',
    'test',
    {}
  );
  console.log(`Email queued with job ID: ${jobId}`);
} catch (error) {
  console.error('Failed to queue email:', error);
}
```

## Test Samples

The service includes test samples for documentation and testing:

```typescript
import { testSamples } from '@app/Jobs/AdvancedEmailJobService';

console.log(testSamples.advancedQueuePatternsHeadline);
console.log(testSamples.uniqueIdExample);
console.log(testSamples.bulkExample);
```
