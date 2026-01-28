import { AdvancEmailQueue, type AdvancedEmailJobPayload } from '@app/Workers/AdvancEmailWorker';
import { generateUuid } from '@common/utility';
import Logger from '@config/logger';

export const AdvancedEmailJobService = Object.freeze({
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
