/**
 * Health Monitor
 * Comprehensive health monitoring for workers
 * Sealed namespace for immutability
 */

import { ErrorFactory, Logger } from '@zintrust/core';
import { CircuitBreaker } from './CircuitBreaker';
import { ResourceMonitor } from './ResourceMonitor';
import { WorkerMetrics, type MetricEntry } from './WorkerMetrics';
import { WorkerRegistry } from './WorkerRegistry';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'critical';

type StatusD = 'improving' | 'stable' | 'degrading';

export type HealthCheckResult = {
  status: HealthStatus;
  score: number; // 0-100
  timestamp: Date;
  checks: {
    errorRate: { status: HealthStatus; value: number; threshold: number };
    latency: { status: HealthStatus; value: number; threshold: number };
    throughput: { status: HealthStatus; value: number; threshold: number };
    resources: { status: HealthStatus; cpu: number; memory: number };
    circuitBreaker: { status: HealthStatus; state: string };
    queueHealth: { status: HealthStatus; waiting: number; active: number };
  };
  recommendations: string[];
};

export type HealthMonitorConfig = {
  checkInterval: number; // Seconds between health checks
  thresholds: {
    errorRate: { warning: number; critical: number }; // 0-1
    latency: { warning: number; critical: number }; // ms
    throughput: { warning: number; critical: number }; // jobs/sec
    cpu: { warning: number; critical: number }; // 0-100%
    memory: { warning: number; critical: number }; // 0-100%
    queueSize: { warning: number; critical: number }; // absolute count
  };
  alerting: {
    enabled: boolean;
    degradedCallback?: (workerName: string, result: HealthCheckResult) => void;
    criticalCallback?: (workerName: string, result: HealthCheckResult) => void;
  };
};

// Internal state
const healthChecks = new Map<string, HealthCheckResult[]>(); // Keep history
const monitoringIntervals = new Map<string, NodeJS.Timeout>();
const workerConfigs = new Map<string, HealthMonitorConfig>();

/**
 * Default health monitor config
 */
const DEFAULT_CONFIG: HealthMonitorConfig = {
  checkInterval: 30,
  thresholds: {
    errorRate: { warning: 0.05, critical: 0.1 }, // 5% warning, 10% critical
    latency: { warning: 1000, critical: 3000 }, // 1s warning, 3s critical
    throughput: { warning: 10, critical: 5 }, // 10 jobs/sec warning, 5 critical
    cpu: { warning: 70, critical: 90 },
    memory: { warning: 75, critical: 85 },
    queueSize: { warning: 1000, critical: 5000 },
  },
  alerting: {
    enabled: true,
  },
};

/**
 * Helper: Calculate health status from score
 */
const getStatusFromScore = (score: number): HealthStatus => {
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'degraded';
  if (score >= 30) return 'unhealthy';
  return 'critical';
};

const sumMetricEntry = (entry: MetricEntry): number =>
  entry.points.reduce((sum, point) => sum + point.value, 0);

const averageMetricEntry = (entry: MetricEntry): number =>
  entry.points.length > 0 ? sumMetricEntry(entry) / entry.points.length : 0;

const queryMetricEntry = async (
  workerName: string,
  metricType: MetricEntry['metricType'],
  startDate: Date,
  endDate: Date
): Promise<MetricEntry> =>
  WorkerMetrics.query({
    workerName,
    metricType,
    granularity: 'hourly',
    startDate,
    endDate,
  });

const buildErrorRateCheck = async (
  workerName: string,
  startDate: Date,
  endDate: Date,
  config: HealthMonitorConfig
): Promise<{
  status: HealthStatus;
  score: number;
  errorRate: number;
  totalProcessed: number;
  recommendations: string[];
}> => {
  const [errorEntry, processedEntry] = await Promise.all([
    queryMetricEntry(workerName, 'errors', startDate, endDate),
    queryMetricEntry(workerName, 'processed', startDate, endDate),
  ]);

  const totalErrors = sumMetricEntry(errorEntry);
  const totalProcessed = sumMetricEntry(processedEntry);
  const errorRate = totalProcessed > 0 ? totalErrors / totalProcessed : 0;

  let status: HealthStatus = 'healthy';
  let score = 100;
  const recommendations: string[] = [];

  if (errorRate >= config.thresholds.errorRate.critical) {
    status = 'critical';
    score = 20;
    recommendations.push(
      `Critical error rate: ${(errorRate * 100).toFixed(2)}%. Investigate failures immediately.`
    );
  } else if (errorRate >= config.thresholds.errorRate.warning) {
    status = 'degraded';
    score = 60;
    recommendations.push(`Elevated error rate: ${(errorRate * 100).toFixed(2)}%. Monitor closely.`);
  }

  return { status, score, errorRate, totalProcessed, recommendations };
};

const buildLatencyCheck = async (
  workerName: string,
  startDate: Date,
  endDate: Date,
  config: HealthMonitorConfig
): Promise<{
  status: HealthStatus;
  score: number;
  avgLatency: number;
  recommendations: string[];
}> => {
  const latencyEntry = await queryMetricEntry(workerName, 'duration', startDate, endDate);
  const avgLatency = averageMetricEntry(latencyEntry);

  let status: HealthStatus = 'healthy';
  let score = 100;
  const recommendations: string[] = [];

  if (avgLatency >= config.thresholds.latency.critical) {
    status = 'critical';
    score = 20;
    recommendations.push(
      `Critical latency: ${avgLatency.toFixed(0)}ms. Consider scaling up or optimizing.`
    );
  } else if (avgLatency >= config.thresholds.latency.warning) {
    status = 'degraded';
    score = 60;
    recommendations.push(`High latency: ${avgLatency.toFixed(0)}ms. Monitor performance.`);
  }

  return { status, score, avgLatency, recommendations };
};

const buildThroughputCheck = (
  totalProcessed: number,
  config: HealthMonitorConfig
): { status: HealthStatus; score: number; throughput: number; recommendations: string[] } => {
  const throughput = totalProcessed / 3600;
  let status: HealthStatus = 'healthy';
  let score = 100;
  const recommendations: string[] = [];

  if (throughput < config.thresholds.throughput.critical) {
    status = 'critical';
    score = 20;
    recommendations.push(
      `Low throughput: ${throughput.toFixed(2)} jobs/sec. Check worker availability.`
    );
  } else if (throughput < config.thresholds.throughput.warning) {
    status = 'degraded';
    score = 60;
    recommendations.push(
      `Reduced throughput: ${throughput.toFixed(2)} jobs/sec. Consider scaling.`
    );
  }

  return { status, score, throughput, recommendations };
};

const buildResourceCheck = (
  workerName: string,
  config: HealthMonitorConfig
): {
  status: HealthStatus;
  score: number;
  cpu: number;
  memory: number;
  recommendations: string[];
} => {
  const usage = ResourceMonitor.getCurrentUsage(workerName);
  const cpuPercent = usage.resourceSnapshot.cpu.usage;
  const memPercent = usage.resourceSnapshot.memory.usage;

  let status: HealthStatus = 'healthy';
  let score = 100;
  const recommendations: string[] = [];

  if (
    cpuPercent >= config.thresholds.cpu.critical ||
    memPercent >= config.thresholds.memory.critical
  ) {
    status = 'critical';
    score = 20;
    recommendations.push(
      `Critical resource usage: CPU ${cpuPercent.toFixed(1)}%, Memory ${memPercent.toFixed(1)}%`
    );
  } else if (
    cpuPercent >= config.thresholds.cpu.warning ||
    memPercent >= config.thresholds.memory.warning
  ) {
    status = 'degraded';
    score = 60;
    recommendations.push(
      `High resource usage: CPU ${cpuPercent.toFixed(1)}%, Memory ${memPercent.toFixed(1)}%`
    );
  }

  return { status, score, cpu: cpuPercent, memory: memPercent, recommendations };
};

const buildCircuitCheck = (
  workerName: string,
  version: string
): { status: HealthStatus; score: number; state: string; recommendations: string[] } => {
  const circuitState = CircuitBreaker.getState(workerName, version);
  let status: HealthStatus = 'healthy';
  let score = 100;
  const recommendations: string[] = [];

  if (circuitState?.state === 'open') {
    status = 'critical';
    score = 0;
    recommendations.push('Circuit breaker is OPEN. Worker is rejecting all jobs.');
  } else if (circuitState?.state === 'half-open') {
    status = 'degraded';
    score = 50;
    recommendations.push('Circuit breaker is HALF-OPEN. Testing recovery.');
  }

  return { status, score, state: circuitState?.state ?? 'closed', recommendations };
};

const buildQueueCheck = async (
  workerName: string,
  startDate: Date,
  endDate: Date,
  config: HealthMonitorConfig
): Promise<{
  status: HealthStatus;
  score: number;
  waiting: number;
  active: number;
  recommendations: string[];
}> => {
  const [waitingAgg, activeAgg] = await Promise.all([
    WorkerMetrics.aggregate({
      workerName,
      metricType: 'waiting-jobs',
      granularity: 'hourly',
      startDate,
      endDate,
    }),
    WorkerMetrics.aggregate({
      workerName,
      metricType: 'active-jobs',
      granularity: 'hourly',
      startDate,
      endDate,
    }),
  ]);

  const waiting = waitingAgg.total;
  const active = activeAgg.total;
  let status: HealthStatus = 'healthy';
  let score = 100;
  const recommendations: string[] = [];

  if (waiting >= config.thresholds.queueSize.critical) {
    status = 'critical';
    score = 20;
    recommendations.push(`Critical queue backlog: ${waiting} jobs waiting. Scale up immediately.`);
  } else if (waiting >= config.thresholds.queueSize.warning) {
    status = 'degraded';
    score = 60;
    recommendations.push(`Large queue backlog: ${waiting} jobs waiting. Consider scaling.`);
  }

  return { status, score, waiting, active, recommendations };
};

const buildHealthCheckResult = (params: {
  workerName: string;
  config: HealthMonitorConfig;
  errorCheck: Awaited<ReturnType<typeof buildErrorRateCheck>>;
  latencyCheck: Awaited<ReturnType<typeof buildLatencyCheck>>;
  throughputCheck: ReturnType<typeof buildThroughputCheck>;
  resourceCheck: ReturnType<typeof buildResourceCheck>;
  circuitCheck: ReturnType<typeof buildCircuitCheck>;
  queueCheck: Awaited<ReturnType<typeof buildQueueCheck>>;
  recommendations: string[];
}): HealthCheckResult => {
  const {
    config,
    errorCheck,
    latencyCheck,
    throughputCheck,
    resourceCheck,
    circuitCheck,
    queueCheck,
    recommendations,
  } = params;

  const checks = [
    errorCheck.score,
    latencyCheck.score,
    throughputCheck.score,
    resourceCheck.score,
    circuitCheck.score,
    queueCheck.score,
  ];

  const overallScore = Math.round(checks.reduce((sum, score) => sum + score, 0) / checks.length);
  const overallStatus = getStatusFromScore(overallScore);

  return {
    status: overallStatus,
    score: overallScore,
    timestamp: new Date(),
    checks: {
      errorRate: {
        status: errorCheck.status,
        value: errorCheck.errorRate,
        threshold: config.thresholds.errorRate.warning,
      },
      latency: {
        status: latencyCheck.status,
        value: latencyCheck.avgLatency,
        threshold: config.thresholds.latency.warning,
      },
      throughput: {
        status: throughputCheck.status,
        value: throughputCheck.throughput,
        threshold: config.thresholds.throughput.warning,
      },
      resources: {
        status: resourceCheck.status,
        cpu: resourceCheck.cpu,
        memory: resourceCheck.memory,
      },
      circuitBreaker: { status: circuitCheck.status, state: circuitCheck.state },
      queueHealth: {
        status: queueCheck.status,
        waiting: queueCheck.waiting,
        active: queueCheck.active,
      },
    },
    recommendations,
  };
};

const storeHealthCheckResult = (
  workerName: string,
  config: HealthMonitorConfig,
  result: HealthCheckResult
): void => {
  let history = healthChecks.get(workerName);
  if (!history) {
    history = [];
    healthChecks.set(workerName, history);
  }

  history.push(result);

  if (history.length > 100) {
    history.shift();
  }

  if (config.alerting.enabled) {
    if (result.status === 'critical' && config.alerting.criticalCallback) {
      config.alerting.criticalCallback(workerName, result);
    } else if (result.status === 'degraded' && config.alerting.degradedCallback) {
      config.alerting.degradedCallback(workerName, result);
    }
  }
};

/**
 * Helper: Perform comprehensive health check
 */
const performHealthCheck = async (
  workerName: string,
  config: HealthMonitorConfig
): Promise<HealthCheckResult> => {
  const workerStatus = WorkerRegistry.status(workerName);
  if (!workerStatus) {
    throw ErrorFactory.createNotFoundError(`Worker "${workerName}" not found`);
  }

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600 * 1000);

  const [errorCheck, latencyCheck, queueCheck] = await Promise.all([
    buildErrorRateCheck(workerName, oneHourAgo, now, config),
    buildLatencyCheck(workerName, oneHourAgo, now, config),
    buildQueueCheck(workerName, oneHourAgo, now, config),
  ]);

  const throughputCheck = buildThroughputCheck(errorCheck.totalProcessed, config);
  const resourceCheck = buildResourceCheck(workerName, config);
  const circuitCheck = buildCircuitCheck(workerName, workerStatus.version);
  const recommendations = [
    ...errorCheck.recommendations,
    ...latencyCheck.recommendations,
    ...throughputCheck.recommendations,
    ...resourceCheck.recommendations,
    ...circuitCheck.recommendations,
    ...queueCheck.recommendations,
  ];

  const result = buildHealthCheckResult({
    workerName,
    config,
    errorCheck,
    latencyCheck,
    throughputCheck,
    resourceCheck,
    circuitCheck,
    queueCheck,
    recommendations,
  });

  storeHealthCheckResult(workerName, config, result);

  Logger.debug(`Health check completed: ${workerName}`, {
    status: result.status,
    score: result.score,
  });

  return result;
};

/**
 * Health Monitor - Sealed namespace
 */
export const HealthMonitor = Object.freeze({
  /**
   * Start monitoring worker health
   */
  startMonitoring(workerName: string, config?: Partial<HealthMonitorConfig>): void {
    if (monitoringIntervals.has(workerName)) {
      throw ErrorFactory.createConnectionError(`Already monitoring worker: ${workerName}`);
    }

    const fullConfig: HealthMonitorConfig = {
      ...DEFAULT_CONFIG,
      ...config,
      thresholds: {
        ...DEFAULT_CONFIG.thresholds,
        ...config?.thresholds,
      },
      alerting: {
        ...DEFAULT_CONFIG.alerting,
        ...config?.alerting,
      },
    };

    workerConfigs.set(workerName, fullConfig);

    // Perform initial check immediately
    performHealthCheck(workerName, fullConfig);

    // Schedule periodic checks
    const interval = setInterval(() => {
      performHealthCheck(workerName, fullConfig);
    }, fullConfig.checkInterval * 1000);

    monitoringIntervals.set(workerName, interval);

    Logger.info(`Health monitoring started: ${workerName}`, {
      checkInterval: fullConfig.checkInterval,
    });
  },

  /**
   * Stop monitoring worker health
   */
  stopMonitoring(workerName: string): void {
    const interval = monitoringIntervals.get(workerName);

    if (!interval) {
      throw ErrorFactory.createNotFoundError(`Not monitoring worker: ${workerName}`);
    }

    clearInterval(interval);
    monitoringIntervals.delete(workerName);
    workerConfigs.delete(workerName);

    Logger.info(`Health monitoring stopped: ${workerName}`);
  },

  /**
   * Get current health status
   */
  async getCurrentHealth(workerName: string): Promise<HealthCheckResult> {
    const config = workerConfigs.get(workerName) ?? DEFAULT_CONFIG;
    return performHealthCheck(workerName, config);
  },

  /**
   * Get health history
   */
  getHealthHistory(workerName: string, limit?: number): ReadonlyArray<HealthCheckResult> {
    const history = healthChecks.get(workerName) ?? [];

    if (limit !== undefined && limit > 0) {
      return history.slice(-limit);
    }

    return history;
  },

  /**
   * Get health trend (improving/stable/degrading)
   */
  getHealthTrend(workerName: string): {
    trend: StatusD;
    scoreChange: number;
    periodChecks: number;
  } {
    const history = healthChecks.get(workerName) ?? [];

    if (history.length < 2) {
      return { trend: 'stable', scoreChange: 0, periodChecks: history.length };
    }

    // Compare recent checks (last 10) with previous period
    const recentChecks = history.slice(-10);
    const previousChecks = history.slice(-20, -10);

    const recentAvg = recentChecks.reduce((sum, c) => sum + c.score, 0) / recentChecks.length;
    const previousAvg =
      previousChecks.length > 0
        ? previousChecks.reduce((sum, c) => sum + c.score, 0) / previousChecks.length
        : recentAvg;

    const scoreChange = recentAvg - previousAvg;

    let trend: 'improving' | 'stable' | 'degrading' = 'stable';

    if (scoreChange > 5) {
      trend = 'improving';
    } else if (scoreChange < -5) {
      trend = 'degrading';
    }

    return { trend, scoreChange, periodChecks: history.length };
  },

  /**
   * Get summary for all monitored workers
   */
  getSummary(): Array<{
    workerName: string;
    status: HealthStatus;
    score: number;
    lastCheck: Date;
    trend: 'improving' | 'stable' | 'degrading';
  }> {
    const summary = [];

    for (const workerName of monitoringIntervals.keys()) {
      const history = healthChecks.get(workerName) ?? [];
      const latest = history.at(-1);
      const trend = HealthMonitor.getHealthTrend(workerName);

      if (latest) {
        summary.push({
          workerName,
          status: latest.status,
          score: latest.score,
          lastCheck: latest.timestamp,
          trend: trend.trend,
        });
      }
    }

    return summary;
  },

  /**
   * Update monitoring config
   */
  updateConfig(workerName: string, config: Partial<HealthMonitorConfig>): void {
    const existing = workerConfigs.get(workerName);

    if (!existing) {
      throw ErrorFactory.createNotFoundError(`Not monitoring worker: ${workerName}`);
    }

    const updated: HealthMonitorConfig = {
      ...existing,
      ...config,
      thresholds: {
        ...existing.thresholds,
        ...config.thresholds,
      },
      alerting: {
        ...existing.alerting,
        ...config.alerting,
      },
    };

    workerConfigs.set(workerName, updated);

    Logger.info(`Health monitoring config updated: ${workerName}`);
  },

  /**
   * Clear health history
   */
  clearHistory(workerName: string): void {
    healthChecks.delete(workerName);

    Logger.info(`Health history cleared: ${workerName}`);
  },

  /**
   * Shutdown health monitor
   */
  shutdown(): void {
    Logger.info('HealthMonitor shutting down...');

    for (const interval of monitoringIntervals.values()) {
      clearInterval(interval);
    }

    monitoringIntervals.clear();
    workerConfigs.clear();
    healthChecks.clear();

    Logger.info('HealthMonitor shutdown complete');
  },
});

// Graceful shutdown handled by WorkerShutdown
