/**
 * SLA Monitor
 * SLA compliance checks and violation tracking for workers
 * Sealed namespace for immutability
 */

import { ErrorFactory, Logger, generateUuid } from '@zintrust/core';
import { HealthMonitor, type HealthCheckResult } from './HealthMonitor';
import { WorkerMetrics, type MetricPoint, type MetricType } from './WorkerMetrics';

export type ITimeRange = {
  start: Date;
  end: Date;
};

export interface ISLAConfig {
  workerName: string;
  metrics: {
    maxLatencyP99: number; // milliseconds
    minThroughput: number; // jobs per minute
    minAvailability: number; // percentage (99.9)
    maxErrorRate: number; // percentage (1.0)
    maxRecoveryTime: number; // seconds
  };
  alerting: {
    channels: string[];
    escalation: boolean;
    cooldown: number; // minutes between alerts
  };
  reporting: {
    interval: 'daily' | 'weekly' | 'monthly';
    recipients: string[];
  };
}

export type ISLAStatus = {
  workerName: string;
  status: 'compliant' | 'warning' | 'breach';
  evaluatedAt: Date;
  checks: {
    latencyP99: { value: number; threshold: number; status: 'pass' | 'warn' | 'fail' };
    throughput: { value: number; threshold: number; status: 'pass' | 'warn' | 'fail' };
    availability: { value: number; threshold: number; status: 'pass' | 'warn' | 'fail' };
    errorRate: { value: number; threshold: number; status: 'pass' | 'warn' | 'fail' };
    recoveryTime: { value: number; threshold: number; status: 'pass' | 'warn' | 'fail' };
  };
};

export type ISLAViolation = {
  id: string;
  workerName: string;
  metric: keyof ISLAStatus['checks'];
  expected: number;
  actual: number;
  timestamp: Date;
  severity: 'warning' | 'critical';
  message: string;
};

export type ISLAReport = {
  generatedAt: Date;
  period: ITimeRange;
  totalWorkers: number;
  totalChecks: number;
  totalViolations: number;
  complianceRate: number;
  violations: ReadonlyArray<ISLAViolation>;
  perWorker: Array<{
    workerName: string;
    violations: number;
    complianceRate: number;
  }>;
};

const slaConfigs = new Map<string, ISLAConfig>();
const violationHistory = new Map<string, ISLAViolation[]>();
const lastAlertAt = new Map<string, Date>();

const DEFAULT_LOOKBACK_MS = 60 * 60 * 1000;

const quantile = (points: ReadonlyArray<MetricPoint>, percentile: number): number => {
  if (points.length === 0) return 0;
  const sorted = [...points].sort((a, b) => a.value - b.value);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(percentile * sorted.length)));
  return sorted[index]?.value ?? 0;
};

const warnOnMaxThreshold = (value: number, threshold: number): boolean =>
  value >= threshold * 0.9 && value <= threshold;

const warnOnMinThreshold = (value: number, threshold: number): boolean =>
  value <= threshold * 1.1 && value >= threshold;

const evaluateMaxThreshold = (value: number, threshold: number): 'pass' | 'warn' | 'fail' => {
  if (value > threshold) return 'fail';
  if (warnOnMaxThreshold(value, threshold)) return 'warn';
  return 'pass';
};

const evaluateMinThreshold = (value: number, threshold: number): 'pass' | 'warn' | 'fail' => {
  if (value < threshold) return 'fail';
  if (warnOnMinThreshold(value, threshold)) return 'warn';
  return 'pass';
};

const storeViolation = (violation: ISLAViolation): void => {
  const history = violationHistory.get(violation.workerName) ?? [];
  history.push(violation);
  if (history.length > 1000) {
    history.shift();
  }
  violationHistory.set(violation.workerName, history);
};

const calculateAvailability = (checks: HealthCheckResult[]): number => {
  if (checks.length === 0) return 0;
  const upCount = checks.filter(
    (check) => check.status === 'healthy' || check.status === 'degraded'
  ).length;
  return (upCount / checks.length) * 100;
};

const calculateRecoveryTime = (checks: HealthCheckResult[]): number => {
  if (checks.length < 2) return 0;

  const sorted = [...checks].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  let currentDownAt: Date | null = null;
  let maxRecoverySeconds = 0;

  for (const check of sorted) {
    const isDown = check.status === 'critical';
    if (isDown && currentDownAt === null) {
      currentDownAt = check.timestamp;
    }

    if (!isDown && currentDownAt !== null) {
      const recoverySeconds = (check.timestamp.getTime() - currentDownAt.getTime()) / 1000;
      maxRecoverySeconds = Math.max(maxRecoverySeconds, recoverySeconds);
      currentDownAt = null;
    }
  }

  return Math.round(maxRecoverySeconds);
};

const loadHealthChecks = async (
  workerName: string,
  range: ITimeRange
): Promise<HealthCheckResult[]> => {
  const history = HealthMonitor.getHealthHistory(workerName);
  const filtered = history.filter(
    (check) =>
      check.timestamp.getTime() >= range.start.getTime() &&
      check.timestamp.getTime() <= range.end.getTime()
  );

  if (filtered.length > 0) return filtered;

  try {
    const current = HealthMonitor.getCurrentHealth(workerName);
    return current ? [current] : [];
  } catch (error) {
    Logger.debug('Failed to get current health for SLA check', error as Error);
    return [];
  }
};

const getMetricPoints = async (
  workerName: string,
  metricType: MetricType,
  range: ITimeRange
): Promise<ReadonlyArray<MetricPoint>> => {
  const entry = await WorkerMetrics.query({
    workerName,
    metricType,
    granularity: 'hourly',
    startDate: range.start,
    endDate: range.end,
  });

  return entry.points;
};

const collectSlaMetrics = async (
  workerName: string,
  range: ITimeRange
): Promise<{
  latencyP99: number;
  throughput: number;
  availability: number;
  errorRate: number;
  recoveryTime: number;
}> => {
  const [durationPoints, processedAgg, errorAgg, healthChecks] = await Promise.all([
    getMetricPoints(workerName, 'duration', range),
    WorkerMetrics.aggregate({
      workerName,
      metricType: 'processed',
      granularity: 'hourly',
      startDate: range.start,
      endDate: range.end,
    }),
    WorkerMetrics.aggregate({
      workerName,
      metricType: 'errors',
      granularity: 'hourly',
      startDate: range.start,
      endDate: range.end,
    }),
    loadHealthChecks(workerName, range),
  ]);

  const latencyP99 = quantile(durationPoints, 0.99);
  const minutes = Math.max(1, (range.end.getTime() - range.start.getTime()) / 60000);
  const throughput = processedAgg.total / minutes;
  const errorRate = processedAgg.total > 0 ? (errorAgg.total / processedAgg.total) * 100 : 0;
  const availability = calculateAvailability(healthChecks);
  const recoveryTime = calculateRecoveryTime(healthChecks);

  return { latencyP99, throughput, availability, errorRate, recoveryTime };
};

const buildChecks = (
  metrics: Awaited<ReturnType<typeof collectSlaMetrics>>,
  config: ISLAConfig
): ISLAStatus['checks'] => ({
  latencyP99: {
    value: metrics.latencyP99,
    threshold: config.metrics.maxLatencyP99,
    status: evaluateMaxThreshold(metrics.latencyP99, config.metrics.maxLatencyP99),
  },
  throughput: {
    value: metrics.throughput,
    threshold: config.metrics.minThroughput,
    status: evaluateMinThreshold(metrics.throughput, config.metrics.minThroughput),
  },
  availability: {
    value: metrics.availability,
    threshold: config.metrics.minAvailability,
    status: evaluateMinThreshold(metrics.availability, config.metrics.minAvailability),
  },
  errorRate: {
    value: metrics.errorRate,
    threshold: config.metrics.maxErrorRate,
    status: evaluateMaxThreshold(metrics.errorRate, config.metrics.maxErrorRate),
  },
  recoveryTime: {
    value: metrics.recoveryTime,
    threshold: config.metrics.maxRecoveryTime,
    status: evaluateMaxThreshold(metrics.recoveryTime, config.metrics.maxRecoveryTime),
  },
});

const buildSlaStatus = (checks: ISLAStatus['checks']): ISLAStatus['status'] => {
  const hasFailures = Object.values(checks).some((check) => check.status === 'fail');
  if (hasFailures) return 'breach';

  const hasWarnings = Object.values(checks).some((check) => check.status === 'warn');
  return hasWarnings ? 'warning' : 'compliant';
};

const buildViolation = (params: {
  workerName: string;
  metric: keyof ISLAStatus['checks'];
  expected: number;
  actual: number;
  severity: ISLAViolation['severity'];
  message: string;
}): ISLAViolation => ({
  id: generateUuid(),
  workerName: params.workerName,
  metric: params.metric,
  expected: params.expected,
  actual: params.actual,
  timestamp: new Date(),
  severity: params.severity,
  message: params.message,
});

/**
 * SLA Monitor - Sealed namespace
 */
export const SLAMonitor = Object.freeze({
  /**
   * Define SLA for a worker
   */
  defineSLA(config: ISLAConfig): void {
    slaConfigs.set(config.workerName, { ...config });
    Logger.info(`SLA defined for worker "${config.workerName}"`);
  },

  /**
   * Check SLA compliance for a worker
   */
  async checkCompliance(workerName: string): Promise<ISLAStatus> {
    const config = slaConfigs.get(workerName);
    if (!config) {
      throw ErrorFactory.createNotFoundError(`SLA config not found for worker "${workerName}"`);
    }

    const range: ITimeRange = {
      start: new Date(Date.now() - DEFAULT_LOOKBACK_MS),
      end: new Date(),
    };

    const metrics = await collectSlaMetrics(workerName, range);
    const checks = buildChecks(metrics, config);
    const status = buildSlaStatus(checks);

    Object.entries(checks)
      .filter(([, detail]) => detail.status === 'fail')
      .forEach(([metricKey, detail]) => {
        const violation = buildViolation({
          workerName,
          metric: metricKey as keyof ISLAStatus['checks'],
          expected: detail.threshold,
          actual: detail.value,
          severity: 'critical',
          message: `SLA breach for ${metricKey}: ${detail.value} (expected ${detail.threshold})`,
        });
        storeViolation(violation);
        SLAMonitor.alertOnViolation(violation);
      });

    return {
      workerName,
      status,
      evaluatedAt: new Date(),
      checks,
    };
  },

  /**
   * Get SLA violations for a worker
   */
  getViolations(workerName: string, timeRange: ITimeRange): ReadonlyArray<ISLAViolation> {
    const history = violationHistory.get(workerName) ?? [];
    return history.filter(
      (violation) =>
        violation.timestamp.getTime() >= timeRange.start.getTime() &&
        violation.timestamp.getTime() <= timeRange.end.getTime()
    );
  },

  /**
   * Get SLA compliance report
   */
  getComplianceReport(timeRange: ITimeRange): ISLAReport {
    const violations: ISLAViolation[] = [];
    const perWorker: ISLAReport['perWorker'] = [];

    for (const [workerName] of slaConfigs.entries()) {
      const workerViolations = SLAMonitor.getViolations(workerName, timeRange);
      violations.push(...workerViolations);

      const totalChecks = slaConfigs.size * 5;
      const breachCount = workerViolations.length;
      const complianceRate = totalChecks > 0 ? (totalChecks - breachCount) / totalChecks : 1;

      perWorker.push({
        workerName,
        violations: breachCount,
        complianceRate,
      });
    }

    const totalChecks = slaConfigs.size * 5;
    const totalViolations = violations.length;
    const complianceRate = totalChecks > 0 ? (totalChecks - totalViolations) / totalChecks : 1;

    return {
      generatedAt: new Date(),
      period: timeRange,
      totalWorkers: slaConfigs.size,
      totalChecks,
      totalViolations,
      complianceRate,
      violations,
      perWorker,
    };
  },

  /**
   * Alert on SLA violation
   */
  alertOnViolation(violation: ISLAViolation): void {
    const config = slaConfigs.get(violation.workerName);
    if (!config) return;

    const lastAlert = lastAlertAt.get(violation.workerName);
    const cooldownMs = config.alerting.cooldown * 60 * 1000;
    if (lastAlert && Date.now() - lastAlert.getTime() < cooldownMs) {
      return;
    }

    lastAlertAt.set(violation.workerName, new Date());

    Logger.warn(`SLA violation for ${violation.workerName}`, {
      metric: violation.metric,
      expected: violation.expected,
      actual: violation.actual,
      severity: violation.severity,
      channels: config.alerting.channels,
    });
  },
});

export default SLAMonitor;
