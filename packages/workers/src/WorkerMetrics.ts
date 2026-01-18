/**
 * Worker Metrics Manager
 * Time-series metrics persistence with Redis Sorted Sets
 * Sealed namespace for immutability
 */

import { ErrorFactory, Logger, createRedisConnection, type RedisConfig } from '@zintrust/core';
import type IORedis from 'ioredis';

export type MetricType =
  | 'processed'
  | 'errors'
  | 'duration'
  | 'memory'
  | 'cpu'
  | 'queue-size'
  | 'active-jobs'
  | 'waiting-jobs'
  | 'delayed-jobs'
  | 'failed-jobs'
  | 'completed-jobs';

export type MetricGranularity = 'hourly' | 'daily' | 'monthly';

export type MetricPoint = {
  timestamp: Date;
  value: number;
  metadata?: Record<string, unknown>;
};

export type MetricEntry = {
  workerName: string;
  metricType: MetricType;
  granularity: MetricGranularity;
  points: ReadonlyArray<MetricPoint>;
};

export type MetricQueryOptions = {
  workerName: string;
  metricType: MetricType;
  granularity: MetricGranularity;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
};

export type AggregatedMetrics = {
  workerName: string;
  metricType: MetricType;
  period: { start: Date; end: Date };
  total: number;
  average: number;
  min: number;
  max: number;
  count: number;
};

export type WorkerHealthScore = {
  workerName: string;
  timestamp: Date;
  score: number; // 0-100
  factors: {
    errorRate: number;
    throughput: number;
    latency: number;
    resourceUsage: number;
  };
  status: 'healthy' | 'degraded' | 'unhealthy';
};

// Redis key prefixes
const METRICS_PREFIX = 'worker:metrics:';
const HEALTH_PREFIX = 'worker:health:';

// Retention periods (in seconds)
const RETENTION = {
  hourly: 7 * 24 * 60 * 60, // 7 days
  daily: 30 * 24 * 60 * 60, // 30 days
  monthly: 365 * 24 * 60 * 60, // 1 year
};

// Internal state
let redisClient: IORedis | null = null;

/**
 * Helper: Get Redis key for metrics
 */
const getMetricsKey = (
  workerName: string,
  metricType: MetricType,
  granularity: MetricGranularity
): string => {
  return `${METRICS_PREFIX}${workerName}:${metricType}:${granularity}`;
};

/**
 * Helper: Get Redis key for health scores
 */
const getHealthKey = (workerName: string): string => {
  return `${HEALTH_PREFIX}${workerName}`;
};

/**
 * Helper: Round timestamp to granularity
 */
const roundTimestamp = (date: Date, granularity: MetricGranularity): Date => {
  const timestamp = date.getTime();

  switch (granularity) {
    case 'hourly':
      // Round to nearest hour
      return new Date(Math.floor(timestamp / (60 * 60 * 1000)) * 60 * 60 * 1000);
    case 'daily': {
      // Round to start of day (UTC)
      const d = new Date(timestamp);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }
    case 'monthly': {
      // Round to start of month (UTC)
      const m = new Date(timestamp);
      m.setUTCDate(1);
      m.setUTCHours(0, 0, 0, 0);
      return m;
    }
  }
};

/**
 * Helper: Clean up old metrics based on retention policy
 */
const cleanupOldMetrics = async (
  client: IORedis,
  key: string,
  granularity: MetricGranularity
): Promise<void> => {
  try {
    const retentionSeconds = RETENTION[granularity];
    const cutoffTimestamp = Date.now() - retentionSeconds * 1000;

    // Remove entries older than retention period
    await client.zremrangebyscore(key, '-inf', cutoffTimestamp);

    // Set expiry on the key (2x retention period for safety)
    await client.expire(key, retentionSeconds * 2);
  } catch (error) {
    Logger.error(`Failed to cleanup old metrics for key "${key}"`, error);
  }
};

/**
 * Helper: Calculate health score based on metrics
 */
const calculateHealthScore = (metrics: {
  errorRate: number;
  throughput: number;
  avgDuration: number;
  memoryUsage: number;
  cpuUsage: number;
}): {
  score: number;
  status: WorkerHealthScore['status'];
  factors: {
    errorRate: number;
    throughput: number;
    latency: number;
    resourceUsage: number;
  };
} => {
  // Error rate factor (0-100, lower is better)
  // 0% errors = 100, 10%+ errors = 0
  const errorRateFactor = Math.max(0, 100 - metrics.errorRate * 1000);

  // Throughput factor (0-100, higher is better)
  // Normalized: >100 jobs/min = 100, 0 jobs/min = 0
  const throughputFactor = Math.min(100, metrics.throughput);

  // Latency factor (0-100, lower is better)
  // <1s = 100, >10s = 0
  const latencyFactor = Math.max(0, 100 - (metrics.avgDuration / 10000) * 100);

  // Resource usage factor (0-100, lower is better)
  // <50% = 100, >90% = 0
  const avgResourceUsage = (metrics.memoryUsage + metrics.cpuUsage) / 2;
  const resourceFactor = Math.max(0, 100 - Math.max(0, avgResourceUsage - 50) * 2.5);

  // Weighted average: errors are most important
  const score =
    errorRateFactor * 0.4 + throughputFactor * 0.2 + latencyFactor * 0.2 + resourceFactor * 0.2;

  let status: WorkerHealthScore['status'];
  if (score >= 80) {
    status = 'healthy';
  } else if (score >= 50) {
    status = 'degraded';
  } else {
    status = 'unhealthy';
  }

  return {
    score: Math.round(score),
    status,
    factors: {
      errorRate: Math.round(errorRateFactor),
      throughput: Math.round(throughputFactor),
      latency: Math.round(latencyFactor),
      resourceUsage: Math.round(resourceFactor),
    },
  };
};

/**
 * Worker Metrics Manager - Sealed namespace
 */
export const WorkerMetrics = Object.freeze({
  /**
   * Initialize the metrics manager with Redis connection
   */
  initialize(config: RedisConfig): void {
    if (redisClient) {
      Logger.warn('WorkerMetrics already initialized');
      return;
    }

    redisClient = createRedisConnection(config);
    Logger.info('WorkerMetrics initialized');
  },

  /**
   * Record a metric point
   */
  async record(
    workerName: string,
    metricType: MetricType,
    value: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!redisClient) {
      throw ErrorFactory.createWorkerError(
        'WorkerMetrics not initialized. Call initialize() first.'
      );
    }

    const now = new Date();

    // Record at all granularities
    const granularities: MetricGranularity[] = ['hourly', 'daily', 'monthly'];

    await Promise.all(
      granularities.map(async (granularity) => {
        const roundedTimestamp = roundTimestamp(now, granularity);
        const key = getMetricsKey(workerName, metricType, granularity);

        const point: MetricPoint = {
          timestamp: roundedTimestamp,
          value,
          metadata,
        };

        // Store in sorted set with timestamp as score
        const score = roundedTimestamp.getTime();
        const data = JSON.stringify(point);

        await redisClient?.zadd(key, score, data);

        // Cleanup old metrics (lightweight: ~1% based on time slice)
        const client = redisClient;
        if (client && Date.now() % 100 === 0) {
          cleanupOldMetrics(client, key, granularity).catch((err) => {
            Logger.error('Failed to cleanup old metrics', err);
          });
        }
      })
    );

    Logger.debug(`Recorded metric: ${workerName}/${metricType} = ${value}`);
  },

  /**
   * Record multiple metrics at once (batch operation)
   */
  async recordBatch(
    workerName: string,
    metrics: Array<{ metricType: MetricType; value: number; metadata?: Record<string, unknown> }>
  ): Promise<void> {
    await Promise.all(
      metrics.map(async (m) => WorkerMetrics.record(workerName, m.metricType, m.value, m.metadata))
    );
  },

  /**
   * Query metrics for a time range
   */
  async query(options: MetricQueryOptions): Promise<MetricEntry> {
    if (!redisClient) {
      throw ErrorFactory.createWorkerError('WorkerMetrics not initialized');
    }

    const { workerName, metricType, granularity, startDate, endDate, limit = 1000 } = options;
    const key = getMetricsKey(workerName, metricType, granularity);

    const minScore = startDate ? startDate.getTime() : '-inf';
    const maxScore = endDate ? endDate.getTime() : '+inf';

    try {
      // Get data from sorted set
      const results = await redisClient.zrangebyscore(key, minScore, maxScore, 'LIMIT', 0, limit);

      const points: MetricPoint[] = results.map((data) => JSON.parse(data) as MetricPoint);

      return {
        workerName,
        metricType,
        granularity,
        points,
      };
    } catch (error) {
      Logger.error(`Error querying metrics for ${workerName}/${metricType}`, error);
      throw error;
    }
  },

  /**
   * Get aggregated metrics for a time range
   */
  async aggregate(options: MetricQueryOptions): Promise<AggregatedMetrics> {
    const entry = await WorkerMetrics.query(options);

    if (entry.points.length === 0) {
      return {
        workerName: entry.workerName,
        metricType: entry.metricType,
        period: {
          start: options.startDate ?? new Date(0),
          end: options.endDate ?? new Date(),
        },
        total: 0,
        average: 0,
        min: 0,
        max: 0,
        count: 0,
      };
    }

    const values = entry.points.map((p) => p.value);
    const total = values.reduce((sum, val) => sum + val, 0);
    const average = total / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    return {
      workerName: entry.workerName,
      metricType: entry.metricType,
      period: {
        start: entry.points[0].timestamp,
        end: entry.points.at(-1)?.timestamp ?? new Date(),
      },
      total,
      average,
      min,
      max,
      count: values.length,
    };
  },

  /**
   * Calculate and store health score
   */
  async calculateHealth(workerName: string): Promise<WorkerHealthScore> {
    if (!redisClient) {
      throw ErrorFactory.createWorkerError('WorkerMetrics not initialized');
    }

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    try {
      // Get recent metrics (last hour)
      const [processed, errors, duration, memory, cpu] = await Promise.all([
        WorkerMetrics.aggregate({
          workerName,
          metricType: 'processed',
          granularity: 'hourly',
          startDate: oneHourAgo,
          endDate: now,
        }),
        WorkerMetrics.aggregate({
          workerName,
          metricType: 'errors',
          granularity: 'hourly',
          startDate: oneHourAgo,
          endDate: now,
        }),
        WorkerMetrics.aggregate({
          workerName,
          metricType: 'duration',
          granularity: 'hourly',
          startDate: oneHourAgo,
          endDate: now,
        }),
        WorkerMetrics.aggregate({
          workerName,
          metricType: 'memory',
          granularity: 'hourly',
          startDate: oneHourAgo,
          endDate: now,
        }),
        WorkerMetrics.aggregate({
          workerName,
          metricType: 'cpu',
          granularity: 'hourly',
          startDate: oneHourAgo,
          endDate: now,
        }),
      ]);

      const totalJobs = processed.total + errors.total;
      const errorRate = totalJobs > 0 ? errors.total / totalJobs : 0;
      const throughput = processed.total; // Jobs in last hour
      const avgDuration = duration.average || 0;
      const memoryUsage = memory.average || 0;
      const cpuUsage = cpu.average || 0;

      const healthData = calculateHealthScore({
        errorRate,
        throughput,
        avgDuration,
        memoryUsage,
        cpuUsage,
      });

      const healthScore: WorkerHealthScore = {
        workerName,
        timestamp: now,
        score: healthData.score,
        factors: healthData.factors,
        status: healthData.status,
      };

      // Store health score in sorted set (keep last 24 hours)
      const key = getHealthKey(workerName);
      const score = now.getTime();
      const data = JSON.stringify(healthScore);

      await redisClient.zadd(key, score, data);

      // Keep only last 24 hours
      const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
      await redisClient.zremrangebyscore(key, '-inf', cutoff);

      // Set expiry (48 hours)
      await redisClient.expire(key, 48 * 60 * 60);

      Logger.debug(`Health score for ${workerName}: ${healthScore.score} (${healthScore.status})`);

      return healthScore;
    } catch (error) {
      Logger.error(`Error calculating health score for ${workerName}`, error);
      throw error;
    }
  },

  /**
   * Get recent health scores
   */
  async getHealthHistory(
    workerName: string,
    hours = 24
  ): Promise<ReadonlyArray<WorkerHealthScore>> {
    if (!redisClient) {
      throw ErrorFactory.createWorkerError('WorkerMetrics not initialized');
    }

    try {
      const key = getHealthKey(workerName);
      const now = Date.now();
      const startTime = now - hours * 60 * 60 * 1000;

      const results = await redisClient.zrangebyscore(key, startTime, now);

      return results.map((data) => JSON.parse(data) as WorkerHealthScore);
    } catch (error) {
      Logger.error(`Error retrieving health history for ${workerName}`, error);
      return [];
    }
  },

  /**
   * Get latest health score
   */
  async getLatestHealth(workerName: string): Promise<WorkerHealthScore | null> {
    if (!redisClient) {
      throw ErrorFactory.createWorkerError('WorkerMetrics not initialized');
    }

    try {
      const key = getHealthKey(workerName);

      // Get the most recent entry
      const results = await redisClient.zrevrange(key, 0, 0);

      if (results.length === 0) {
        return null;
      }

      return JSON.parse(results[0]) as WorkerHealthScore;
    } catch (error) {
      Logger.error(`Error retrieving latest health for ${workerName}`, error);
      return null;
    }
  },

  /**
   * Get metrics summary for all workers
   */
  async getAllWorkersSummary(): Promise<
    ReadonlyArray<{
      workerName: string;
      health: WorkerHealthScore | null;
      metrics: {
        processed: number;
        errors: number;
        errorRate: number;
      };
    }>
  > {
    if (!redisClient) {
      throw ErrorFactory.createWorkerError('WorkerMetrics not initialized');
    }

    try {
      // Find all unique worker names from health keys
      const pattern = `${HEALTH_PREFIX}*`;
      const keys = await redisClient.keys(pattern);
      const workerNames = keys.map((key) => key.replace(HEALTH_PREFIX, ''));

      const summaries = await Promise.all(
        workerNames.map(async (workerName) => {
          const now = new Date();
          const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

          const [health, processed, errors] = await Promise.all([
            WorkerMetrics.getLatestHealth(workerName),
            WorkerMetrics.aggregate({
              workerName,
              metricType: 'processed',
              granularity: 'hourly',
              startDate: oneHourAgo,
              endDate: now,
            }),
            WorkerMetrics.aggregate({
              workerName,
              metricType: 'errors',
              granularity: 'hourly',
              startDate: oneHourAgo,
              endDate: now,
            }),
          ]);

          const totalJobs = processed.total + errors.total;
          const errorRate = totalJobs > 0 ? errors.total / totalJobs : 0;

          return {
            workerName,
            health,
            metrics: {
              processed: processed.total,
              errors: errors.total,
              errorRate,
            },
          };
        })
      );

      return summaries;
    } catch (error) {
      Logger.error('Error retrieving all workers summary', error);
      return [];
    }
  },

  /**
   * Delete all metrics for a worker
   */
  async deleteWorkerMetrics(workerName: string): Promise<void> {
    if (!redisClient) {
      throw ErrorFactory.createWorkerError('WorkerMetrics not initialized');
    }

    try {
      const pattern = `${METRICS_PREFIX}${workerName}:*`;
      const keys = await redisClient.keys(pattern);

      if (keys.length > 0) {
        await redisClient.del(...keys);
      }

      // Also delete health scores
      const healthKey = getHealthKey(workerName);
      await redisClient.del(healthKey);

      Logger.info(`Deleted all metrics for worker "${workerName}"`);
    } catch (error) {
      Logger.error(`Error deleting metrics for worker "${workerName}"`, error);
      throw error;
    }
  },

  /**
   * Shutdown and disconnect
   */
  async shutdown(): Promise<void> {
    if (!redisClient) {
      return;
    }

    Logger.info('WorkerMetrics shutting down...');

    await redisClient.quit();
    redisClient = null;

    Logger.info('WorkerMetrics shutdown complete');
  },
});

// Graceful shutdown on process termination
process.on('SIGTERM', async () => {
  await WorkerMetrics.shutdown();
});

process.on('SIGINT', async () => {
  await WorkerMetrics.shutdown();
});
