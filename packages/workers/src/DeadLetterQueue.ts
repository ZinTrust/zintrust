/**
 * Dead Letter Queue Manager
 * Failed job handling with compliance tracking (GDPR/HIPAA/SOC2)
 * Sealed namespace for immutability
 */

import { ErrorFactory, Logger, createRedisConnection, type RedisConfig } from '@zintrust/core';
import type IORedis from 'ioredis';

export type FailedJobEntry = {
  id: string;
  queueName: string;
  workerName: string;
  jobName: string;
  data: unknown;
  error: {
    message: string;
    stack?: string;
    name: string;
  };
  attemptsMade: number;
  maxAttempts: number;
  failedAt: Date;
  firstAttemptAt: Date;
  lastAttemptAt: Date;
  processingTime: number; // milliseconds
  metadata: {
    version?: string;
    region?: string;
    instanceId?: string;
  };
  complianceFlags: {
    containsPII: boolean;
    containsPHI: boolean;
    dataClassification: 'public' | 'internal' | 'confidential' | 'restricted';
  };
};

export type ComplianceAuditEntry = {
  timestamp: Date;
  action: 'access' | 'retry' | 'delete' | 'export' | 'anonymize';
  failedJobId: string;
  userId: string;
  userRole?: string;
  reason: string;
  ipAddress?: string;
  dataAccessed?: string[]; // Field names accessed
  result: 'success' | 'failure';
  errorMessage?: string;
};

export type RetentionPolicy = {
  enabled: boolean;
  defaultRetentionDays: number;
  gdprCompliant: boolean;
  hipaaCompliant: boolean;
  soc2Compliant: boolean;
  autoDeleteAfterDays?: number;
  anonymizeInsteadOfDelete: boolean;
};

export type DLQStats = {
  totalFailed: number;
  byQueue: Record<string, number>;
  byWorker: Record<string, number>;
  byErrorType: Record<string, number>;
  oldestFailure: Date | null;
  newestFailure: Date | null;
  averageAttempts: number;
  retentionViolations: number;
};

// Redis key prefixes
const DLQ_PREFIX = 'worker:dlq:';
const AUDIT_PREFIX = 'worker:dlq:audit:';

// Internal state
let redisClient: IORedis | null = null;
let retentionPolicy: RetentionPolicy | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Helper: Get DLQ key
 */
const getDLQKey = (queueName: string): string => {
  return `${DLQ_PREFIX}${queueName}`;
};

/**
 * Helper: Get audit key
 */
const getAuditKey = (failedJobId: string): string => {
  return `${AUDIT_PREFIX}${failedJobId}`;
};

/**
 * Helper: Record audit entry
 */
const recordAuditEntry = async (entry: ComplianceAuditEntry): Promise<void> => {
  if (!redisClient) return;

  try {
    const auditKey = getAuditKey(entry.failedJobId);
    const auditData = JSON.stringify(entry);

    // Store in sorted set with timestamp as score
    await redisClient.zadd(auditKey, entry.timestamp.getTime(), auditData);

    // Keep audit logs indefinitely (or per compliance requirements)
    // HIPAA requires 6 years, SOC2 requires 1 year minimum
    const hipaaCompliant = retentionPolicy?.hipaaCompliant ?? false;
    const retentionDays = hipaaCompliant ? 6 * 365 : 365;
    await redisClient.expire(auditKey, retentionDays * 24 * 60 * 60);

    Logger.debug('DLQ audit entry recorded', {
      action: entry.action,
      failedJobId: entry.failedJobId,
      userId: entry.userId,
    });
  } catch (error) {
    Logger.error('Failed to record DLQ audit entry', error);
    // Don't throw - audit failure shouldn't break operations
  }
};

/**
 * Helper: Anonymize sensitive data
 */
const anonymizeData = (data: unknown): unknown => {
  if (typeof data !== 'object' || data === null) {
    return '[REDACTED]';
  }

  const sensitiveFields = [
    'email',
    'phone',
    'ssn',
    'password',
    'creditCard',
    'address',
    'name',
    'firstName',
    'lastName',
    'dateOfBirth',
    'birthDate',
  ];

  const anonymized = { ...data } as Record<string, unknown>;

  for (const key of Object.keys(anonymized)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some((field) => lowerKey.includes(field))) {
      anonymized[key] = '[REDACTED]';
    } else if (typeof anonymized[key] === 'object' && anonymized[key] !== null) {
      anonymized[key] = anonymizeData(anonymized[key]);
    }
  }

  return anonymized;
};

/**
 * Helper: Check retention violations
 */
const checkRetentionViolation = (failedJobEntry: FailedJobEntry): boolean => {
  if (retentionPolicy?.enabled !== true) return false;

  const retentionDays = retentionPolicy.autoDeleteAfterDays ?? retentionPolicy.defaultRetentionDays;
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  return failedJobEntry.failedAt < cutoffDate;
};

/**
 * Helper: Cleanup old entries
 */
const cleanupOldEntries = async (): Promise<number> => {
  const client = redisClient;
  const policy = retentionPolicy;
  if (!client || policy?.enabled !== true || policy.autoDeleteAfterDays === undefined) {
    return 0;
  }

  try {
    const cutoffTimestamp = Date.now() - policy.autoDeleteAfterDays * 24 * 60 * 60 * 1000;
    // Find all DLQ keys
    const pattern = `${DLQ_PREFIX}*`;
    const keys = await client.keys(pattern);

    const cleanedCounts = await Promise.all(
      keys.map(async (key) => {
        const oldEntries = await client.zrangebyscore(key, '-inf', cutoffTimestamp);

        await Promise.all(
          oldEntries.map(async (entryJson) => {
            const entry = JSON.parse(entryJson) as FailedJobEntry;

            if (policy.anonymizeInsteadOfDelete) {
              entry.data = anonymizeData(entry.data);
              entry.complianceFlags.containsPII = false;
              entry.complianceFlags.containsPHI = false;

              await client.zrem(key, entryJson);
              await client.zadd(key, entry.failedAt.getTime(), JSON.stringify(entry));

              Logger.info('Anonymized old DLQ entry', { id: entry.id });
              return entry.id;
            }

            await client.zrem(key, entryJson);

            await recordAuditEntry({
              timestamp: new Date(),
              action: 'delete',
              failedJobId: entry.id,
              userId: 'system',
              reason: 'Automatic retention policy cleanup',
              result: 'success',
            });

            Logger.info('Deleted old DLQ entry', { id: entry.id });
            return entry.id;
          })
        );

        return oldEntries.length;
      })
    );

    const totalCleaned = cleanedCounts.reduce((sum, count) => sum + count, 0);

    if (totalCleaned > 0) {
      Logger.info(`DLQ cleanup completed: ${totalCleaned} entries processed`);
    }

    return totalCleaned;
  } catch (error) {
    Logger.error('DLQ cleanup failed', error);
    return 0;
  }
};

/**
 * Dead Letter Queue Manager - Sealed namespace
 */
export const DeadLetterQueue = Object.freeze({
  /**
   * Initialize DLQ with Redis and retention policy
   */
  initialize(config: RedisConfig, policy: RetentionPolicy): void {
    if (redisClient) {
      Logger.warn('DeadLetterQueue already initialized');
      return;
    }

    redisClient = createRedisConnection(config);
    retentionPolicy = policy;

    // Start cleanup interval if auto-delete is enabled
    if (policy.enabled && policy.autoDeleteAfterDays !== undefined) {
      cleanupInterval = setInterval(
        () => {
          cleanupOldEntries().catch((error) => {
            Logger.error('DLQ cleanup interval failed', error);
          });
        },
        24 * 60 * 60 * 1000
      ); // Run daily

      Logger.info('DLQ cleanup scheduler started', {
        interval: '24 hours',
        autoDeleteAfterDays: policy.autoDeleteAfterDays,
      });
    }

    Logger.info('DeadLetterQueue initialized', { policy });
  },

  /**
   * Add failed job to DLQ
   */
  async addFailedJob(entry: FailedJobEntry): Promise<void> {
    if (!redisClient) {
      throw ErrorFactory.createConfigError('DeadLetterQueue not initialized');
    }

    const key = getDLQKey(entry.queueName);
    const score = entry.failedAt.getTime();
    const data = JSON.stringify(entry);

    try {
      await redisClient.zadd(key, score, data);

      // Set expiry based on retention policy
      const policy = retentionPolicy;
      if (policy?.enabled === true && policy.autoDeleteAfterDays !== undefined) {
        const ttl = policy.autoDeleteAfterDays * 24 * 60 * 60 * 2; // 2x for safety
        await redisClient.expire(key, ttl);
      }

      Logger.info('Added failed job to DLQ', {
        id: entry.id,
        queue: entry.queueName,
        worker: entry.workerName,
        error: entry.error.message,
        containsPII: entry.complianceFlags.containsPII,
        containsPHI: entry.complianceFlags.containsPHI,
      });

      await recordAuditEntry({
        timestamp: new Date(),
        action: 'access',
        failedJobId: entry.id,
        userId: 'system',
        reason: 'Job failed and added to DLQ',
        result: 'success',
      });
    } catch (error) {
      Logger.error('Failed to add job to DLQ', error);
      throw error;
    }
  },

  /**
   * Get failed job by ID
   */
  async getFailedJob(
    queueName: string,
    jobId: string,
    userId: string,
    reason: string
  ): Promise<FailedJobEntry | null> {
    if (!redisClient) {
      throw ErrorFactory.createConfigError('DeadLetterQueue not initialized');
    }

    try {
      const key = getDLQKey(queueName);
      const entries = await redisClient.zrange(key, 0, -1);

      const entry = entries.map((e) => JSON.parse(e) as FailedJobEntry).find((e) => e.id === jobId);

      if (entry) {
        await recordAuditEntry({
          timestamp: new Date(),
          action: 'access',
          failedJobId: jobId,
          userId,
          reason,
          dataAccessed: Object.keys((entry.data as object) ?? {}),
          result: 'success',
        });
      }

      return entry ?? null;
    } catch (error) {
      Logger.error(`Failed to get DLQ entry: ${jobId}`, error);

      await recordAuditEntry({
        timestamp: new Date(),
        action: 'access',
        failedJobId: jobId,
        userId,
        reason,
        result: 'failure',
        errorMessage: (error as Error).message,
      });

      return null;
    }
  },

  /**
   * Get all failed jobs for a queue
   */
  async getFailedJobs(queueName: string, limit = 100): Promise<ReadonlyArray<FailedJobEntry>> {
    if (!redisClient) {
      throw ErrorFactory.createConfigError('DeadLetterQueue not initialized');
    }

    try {
      const key = getDLQKey(queueName);
      // Get most recent failures first (highest scores)
      const entries = await redisClient.zrevrange(key, 0, limit - 1);

      return entries.map((e) => JSON.parse(e) as FailedJobEntry);
    } catch (error) {
      Logger.error(`Failed to get DLQ entries for queue: ${queueName}`, error);
      return [];
    }
  },

  /**
   * Retry a failed job
   */
  async retry(queueName: string, jobId: string, userId: string, reason: string): Promise<boolean> {
    if (!redisClient) {
      throw ErrorFactory.createConfigError('DeadLetterQueue not initialized');
    }

    try {
      const entry = await DeadLetterQueue.getFailedJob(queueName, jobId, userId, reason);

      if (!entry) {
        Logger.warn(`Failed job not found for retry: ${jobId}`);
        return false;
      }

      // Remove from DLQ
      const key = getDLQKey(queueName);
      const entryJson = JSON.stringify(entry);
      await redisClient.zrem(key, entryJson);

      await recordAuditEntry({
        timestamp: new Date(),
        action: 'retry',
        failedJobId: jobId,
        userId,
        reason,
        result: 'success',
      });

      Logger.info(`Failed job marked for retry: ${jobId}`, { userId, reason });

      return true;
    } catch (error) {
      Logger.error(`Failed to retry job: ${jobId}`, error);

      await recordAuditEntry({
        timestamp: new Date(),
        action: 'retry',
        failedJobId: jobId,
        userId,
        reason,
        result: 'failure',
        errorMessage: (error as Error).message,
      });

      return false;
    }
  },

  /**
   * Delete a failed job (GDPR right to deletion)
   */
  async deleteFailedJob(
    queueName: string,
    jobId: string,
    userId: string,
    reason: string
  ): Promise<boolean> {
    if (!redisClient) {
      throw ErrorFactory.createConfigError('DeadLetterQueue not initialized');
    }

    try {
      const entry = await DeadLetterQueue.getFailedJob(queueName, jobId, userId, reason);

      if (!entry) {
        Logger.warn(`Failed job not found for deletion: ${jobId}`);
        return false;
      }

      const key = getDLQKey(queueName);
      const entryJson = JSON.stringify(entry);
      await redisClient.zrem(key, entryJson);

      await recordAuditEntry({
        timestamp: new Date(),
        action: 'delete',
        failedJobId: jobId,
        userId,
        reason,
        result: 'success',
      });

      Logger.info(`Failed job deleted: ${jobId}`, { userId, reason });

      return true;
    } catch (error) {
      Logger.error(`Failed to delete job: ${jobId}`, error);

      await recordAuditEntry({
        timestamp: new Date(),
        action: 'delete',
        failedJobId: jobId,
        userId,
        reason,
        result: 'failure',
        errorMessage: (error as Error).message,
      });

      return false;
    }
  },

  /**
   * Anonymize a failed job (GDPR/HIPAA compliance)
   */
  async anonymizeFailedJob(
    queueName: string,
    jobId: string,
    userId: string,
    reason: string
  ): Promise<boolean> {
    if (!redisClient) {
      throw ErrorFactory.createConfigError('DeadLetterQueue not initialized');
    }

    try {
      const entry = await DeadLetterQueue.getFailedJob(queueName, jobId, userId, reason);

      if (!entry) {
        Logger.warn(`Failed job not found for anonymization: ${jobId}`);
        return false;
      }

      // Anonymize sensitive data
      entry.data = anonymizeData(entry.data);
      entry.complianceFlags.containsPII = false;
      entry.complianceFlags.containsPHI = false;

      // Update in Redis
      const key = getDLQKey(queueName);
      const oldEntryJson = JSON.stringify(entry);
      await redisClient.zrem(key, oldEntryJson);
      await redisClient.zadd(key, entry.failedAt.getTime(), JSON.stringify(entry));

      await recordAuditEntry({
        timestamp: new Date(),
        action: 'anonymize',
        failedJobId: jobId,
        userId,
        reason,
        result: 'success',
      });

      Logger.info(`Failed job anonymized: ${jobId}`, { userId, reason });

      return true;
    } catch (error) {
      Logger.error(`Failed to anonymize job: ${jobId}`, error);

      await recordAuditEntry({
        timestamp: new Date(),
        action: 'anonymize',
        failedJobId: jobId,
        userId,
        reason,
        result: 'failure',
        errorMessage: (error as Error).message,
      });

      return false;
    }
  },

  /**
   * Get audit log for a failed job
   */
  async getAuditLog(
    failedJobId: string,
    limit = 100
  ): Promise<ReadonlyArray<ComplianceAuditEntry>> {
    if (!redisClient) {
      throw ErrorFactory.createConfigError('DeadLetterQueue not initialized');
    }

    try {
      const auditKey = getAuditKey(failedJobId);
      const entries = await redisClient.zrevrange(auditKey, 0, limit - 1);

      return entries.map((e) => JSON.parse(e) as ComplianceAuditEntry);
    } catch (error) {
      Logger.error(`Failed to get audit log for: ${failedJobId}`, error);
      return [];
    }
  },

  /**
   * Get DLQ statistics
   */
  async getStats(): Promise<DLQStats> {
    if (!redisClient) {
      throw ErrorFactory.createConfigError('DeadLetterQueue not initialized');
    }

    try {
      const client = redisClient;
      const pattern = `${DLQ_PREFIX}*`;
      const keys = await client.keys(pattern);

      const entriesByQueue = await Promise.all(
        keys.map(async (key) => {
          const queueName = key.replace(DLQ_PREFIX, '');
          const entries = await client.zrange(key, 0, -1);
          return {
            queueName,
            count: entries.length,
            entries: entries.map((e) => JSON.parse(e) as FailedJobEntry),
          };
        })
      );

      const stats: DLQStats = {
        totalFailed: 0,
        byQueue: {},
        byWorker: {},
        byErrorType: {},
        oldestFailure: null,
        newestFailure: null,
        averageAttempts: 0,
        retentionViolations: 0,
      };

      let totalAttempts = 0;

      entriesByQueue.forEach(({ queueName, count, entries }) => {
        stats.totalFailed += count;
        stats.byQueue[queueName] = count;

        entries.forEach((entry) => {
          stats.byWorker[entry.workerName] = (stats.byWorker[entry.workerName] || 0) + 1;
          stats.byErrorType[entry.error.name] = (stats.byErrorType[entry.error.name] || 0) + 1;

          totalAttempts += entry.attemptsMade;

          if (!stats.oldestFailure || entry.failedAt < stats.oldestFailure) {
            stats.oldestFailure = entry.failedAt;
          }

          if (!stats.newestFailure || entry.failedAt > stats.newestFailure) {
            stats.newestFailure = entry.failedAt;
          }

          if (checkRetentionViolation(entry)) {
            stats.retentionViolations++;
          }
        });
      });

      stats.averageAttempts = stats.totalFailed > 0 ? totalAttempts / stats.totalFailed : 0;

      return stats;
    } catch (error) {
      Logger.error('Failed to get DLQ stats', error);
      throw error;
    }
  },

  /**
   * Export failed jobs (compliance)
   */
  async exportFailedJobs(
    queueName: string,
    userId: string,
    reason: string
  ): Promise<ReadonlyArray<FailedJobEntry>> {
    if (!redisClient) {
      throw ErrorFactory.createConfigError('DeadLetterQueue not initialized');
    }

    try {
      const entries = await DeadLetterQueue.getFailedJobs(queueName, 1000);

      await recordAuditEntry({
        timestamp: new Date(),
        action: 'export',
        failedJobId: `${queueName}:export`,
        userId,
        reason,
        result: 'success',
      });

      Logger.info('Exported DLQ entries', { queueName, userId, count: entries.length });

      return entries;
    } catch (error) {
      Logger.error('Failed to export DLQ entries', error);

      await recordAuditEntry({
        timestamp: new Date(),
        action: 'export',
        failedJobId: `${queueName}:export`,
        userId,
        reason,
        result: 'failure',
        errorMessage: (error as Error).message,
      });

      return [];
    }
  },

  /**
   * Update retention policy
   */
  updateRetentionPolicy(policy: RetentionPolicy): void {
    retentionPolicy = policy;

    Logger.info('DLQ retention policy updated', { policy });
  },

  /**
   * Get current retention policy
   */
  getRetentionPolicy(): RetentionPolicy | null {
    return retentionPolicy ? { ...retentionPolicy } : null;
  },

  /**
   * Shutdown DLQ manager
   */
  async shutdown(): Promise<void> {
    Logger.info('DeadLetterQueue shutting down...');

    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }

    if (redisClient) {
      await redisClient.quit();
      redisClient = null;
    }

    retentionPolicy = null;

    Logger.info('DeadLetterQueue shutdown complete');
  },
});

// Graceful shutdown handled by WorkerShutdown
