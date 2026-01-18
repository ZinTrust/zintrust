/**
 * Anomaly Detection
 * Statistical anomaly detection with lightweight baselines
 * Sealed namespace for immutability
 */

import { ErrorFactory, Logger, generateUuid } from '@zintrust/core';
import { ResourceMonitor } from './ResourceMonitor';
import { WorkerMetrics, type MetricPoint, type MetricType } from './WorkerMetrics';

export interface IAnomalyConfig {
  workerName: string;
  metrics: MetricType[];
  sensitivity: number; // 0-1 (higher = more sensitive)
  learningPeriod: number; // Days to learn baseline
  alertThreshold: number; // Confidence % to alert (0-1)
  autoAdjust: boolean;
}

export interface IMetric {
  metricType: MetricType;
  value: number;
  timestamp: Date;
}

export interface IAnomaly {
  id: string;
  timestamp: Date;
  workerName: string;
  metric: MetricType;
  actual: number;
  expected: number;
  deviation: number;
  confidence: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  possibleCauses: string[];
  recommendations: string[];
}

export interface IPrediction {
  workerName: string;
  horizonHours: number;
  riskScore: number;
  expectedErrorRate: number;
  summary: string;
}

export interface IRootCauseAnalysis {
  anomalyId: string;
  suspectedCauses: string[];
  supportingSignals: Record<string, number>;
}

export interface IForecast {
  workerName: string;
  metric: MetricType;
  horizonHours: number;
  forecast: number;
  confidence: number;
}

export interface IRecommendation {
  action: string;
  reason: string;
  priority: 'low' | 'medium' | 'high';
}

type MetricStats = {
  mean: number;
  variance: number;
  count: number;
  updatedAt: Date;
};

const configs = new Map<string, IAnomalyConfig>();
const models = new Map<string, Map<MetricType, MetricStats>>();

const updateStats = (stats: MetricStats, value: number): MetricStats => {
  const count = stats.count + 1;
  const delta = value - stats.mean;
  const mean = stats.mean + delta / count;
  const delta2 = value - mean;
  const variance = stats.variance + delta * delta2;

  return {
    mean,
    variance,
    count,
    updatedAt: new Date(),
  };
};

const buildStats = (values: number[]): MetricStats => {
  if (values.length === 0) {
    return { mean: 0, variance: 0, count: 0, updatedAt: new Date() };
  }

  let mean = 0;
  let variance = 0;
  let count = 0;

  values.forEach((value) => {
    const updated = updateStats({ mean, variance, count, updatedAt: new Date() }, value);
    mean = updated.mean;
    variance = updated.variance;
    count = updated.count;
  });

  return { mean, variance, count, updatedAt: new Date() };
};

const getStdDev = (stats: MetricStats): number => {
  if (stats.count <= 1) return 0;
  return Math.sqrt(stats.variance / (stats.count - 1));
};

const getThreshold = (sensitivity: number): number => {
  const clamped = Math.min(1, Math.max(0, sensitivity));
  return Math.min(3, Math.max(1, 3 - clamped * 2));
};

const buildPossibleCauses = (metric: MetricType): string[] => {
  switch (metric) {
    case 'duration':
      return ['Increased processing time', 'Downstream dependency latency'];
    case 'errors':
      return ['Increased failure rate', 'New error conditions'];
    case 'cpu':
      return ['Resource saturation', 'Inefficient processing logic'];
    case 'memory':
      return ['Memory leak risk', 'Increased payload size'];
    case 'queue-size':
      return ['Traffic spike', 'Worker throttling'];
    default:
      return ['Unexpected workload change'];
  }
};

const buildRecommendations = (metric: MetricType): string[] => {
  switch (metric) {
    case 'duration':
      return ['Review slow job traces', 'Scale worker concurrency temporarily'];
    case 'errors':
      return ['Inspect recent failures', 'Review circuit breaker events'];
    case 'cpu':
      return ['Add capacity or optimize processing', 'Monitor CPU hotspots'];
    case 'memory':
      return ['Inspect memory usage', 'Enable heap snapshots'];
    default:
      return ['Monitor trends and adjust thresholds'];
  }
};

const selectSeverity = (zScore: number): IAnomaly['severity'] => {
  if (zScore >= 3.5) return 'critical';
  if (zScore >= 2.5) return 'high';
  if (zScore >= 1.8) return 'medium';
  return 'low';
};

const ensureConfig = (workerName: string): IAnomalyConfig => {
  const config = configs.get(workerName);
  if (!config) {
    throw ErrorFactory.createNotFoundError(`Anomaly config not found for worker "${workerName}"`);
  }
  return config;
};

const ensureModelMap = (workerName: string): Map<MetricType, MetricStats> => {
  let map = models.get(workerName);
  if (!map) {
    map = new Map();
    models.set(workerName, map);
  }
  return map;
};

const mapPoints = (metric: MetricType, points: ReadonlyArray<MetricPoint>): IMetric[] =>
  points.map((point) => ({
    metricType: metric,
    value: point.value,
    timestamp: point.timestamp,
  }));

/**
 * Anomaly Detection - Sealed namespace
 */
export const AnomalyDetection = Object.freeze({
  /**
   * Configure anomaly detection for a worker
   */
  configure(config: IAnomalyConfig): void {
    configs.set(config.workerName, { ...config });
    Logger.info(`Anomaly detection configured for ${config.workerName}`);
  },

  /**
   * Train baseline model
   */
  trainModel(workerName: string, historicalData: IMetric[]): void {
    const config = ensureConfig(workerName);
    const modelMap = ensureModelMap(workerName);

    const metrics = config.metrics;
    metrics.forEach((metric) => {
      const values = historicalData
        .filter((item) => item.metricType === metric)
        .map((item) => item.value);

      modelMap.set(metric, buildStats(values));
    });

    Logger.info(`Anomaly model trained for ${workerName}`);
  },

  /**
   * Update baseline model with recent data
   */
  updateModel(workerName: string, recentData: IMetric[]): void {
    ensureConfig(workerName);
    const modelMap = ensureModelMap(workerName);

    recentData.forEach((item) => {
      const current = modelMap.get(item.metricType) ?? {
        mean: 0,
        variance: 0,
        count: 0,
        updatedAt: new Date(),
      };

      modelMap.set(item.metricType, updateStats(current, item.value));
    });
  },

  /**
   * Detect anomalies for a worker
   */
  async detectAnomalies(workerName: string): Promise<IAnomaly[]> {
    const config = ensureConfig(workerName);
    const modelMap = ensureModelMap(workerName);

    const range = {
      start: new Date(Date.now() - 60 * 60 * 1000),
      end: new Date(),
    };

    const results: IAnomaly[] = [];

    for (const metric of config.metrics) {
      const entry = await WorkerMetrics.query({
        workerName,
        metricType: metric,
        granularity: 'hourly',
        startDate: range.start,
        endDate: range.end,
      });

      const points = entry.points;
      if (points.length === 0) continue;

      const stats = modelMap.get(metric) ?? buildStats(points.map((point) => point.value));
      modelMap.set(metric, stats);

      const latest = points.at(-1);
      if (!latest) continue;

      const stdDev = getStdDev(stats);
      if (stdDev === 0) continue;

      const zScore = Math.abs((latest.value - stats.mean) / stdDev);
      const threshold = getThreshold(config.sensitivity);
      const confidence = Math.min(1, zScore / threshold);

      if (zScore >= threshold && confidence >= config.alertThreshold) {
        results.push({
          id: generateUuid(),
          timestamp: latest.timestamp,
          workerName,
          metric,
          actual: latest.value,
          expected: stats.mean,
          deviation: zScore,
          confidence,
          severity: selectSeverity(zScore),
          possibleCauses: buildPossibleCauses(metric),
          recommendations: buildRecommendations(metric),
        });
      }
    }

    return results;
  },

  /**
   * Predict failure risk for a worker
   */
  async predictFailure(workerName: string, horizonHours: number): Promise<IPrediction> {
    ensureConfig(workerName);

    const range = {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: new Date(),
    };

    const [errors, processed] = await Promise.all([
      WorkerMetrics.aggregate({
        workerName,
        metricType: 'errors',
        granularity: 'hourly',
        startDate: range.start,
        endDate: range.end,
      }),
      WorkerMetrics.aggregate({
        workerName,
        metricType: 'processed',
        granularity: 'hourly',
        startDate: range.start,
        endDate: range.end,
      }),
    ]);

    const errorRate = processed.total > 0 ? errors.total / processed.total : 0;
    const riskScore = Math.min(1, errorRate * 5);

    let summary = 'Low failure risk detected';
    if (riskScore >= 0.8) {
      summary = 'High failure risk detected';
    } else if (riskScore >= 0.4) {
      summary = 'Moderate failure risk detected';
    }

    return {
      workerName,
      horizonHours,
      riskScore,
      expectedErrorRate: errorRate,
      summary,
    };
  },

  /**
   * Analyze root cause for an anomaly
   */
  analyzeRootCause(anomaly: IAnomaly): IRootCauseAnalysis {
    const usage = ResourceMonitor.getCurrentUsage(anomaly.workerName);
    const signals = {
      cpu: usage.cpu,
      memory: usage.memory.percent,
    };

    const suspected = [...anomaly.possibleCauses];
    if (usage.cpu > 80) suspected.push('CPU saturation');
    if (usage.memory.percent > 80) suspected.push('Memory pressure');

    return {
      anomalyId: anomaly.id,
      suspectedCauses: suspected,
      supportingSignals: signals,
    };
  },

  /**
   * Forecast a metric
   */
  async forecastMetric(workerName: string, metric: MetricType, hours: number): Promise<IForecast> {
    ensureConfig(workerName);

    const entry = await WorkerMetrics.query({
      workerName,
      metricType: metric,
      granularity: 'hourly',
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endDate: new Date(),
    });

    const values = entry.points.map((point) => point.value);
    const average = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

    return {
      workerName,
      metric,
      horizonHours: hours,
      forecast: average,
      confidence: values.length > 10 ? 0.7 : 0.4,
    };
  },

  /**
   * Generate recommendations for an anomaly
   */
  getRecommendations(anomaly: IAnomaly): IRecommendation[] {
    return anomaly.recommendations.map((rec) => ({
      action: rec,
      reason: `Metric ${anomaly.metric} deviated from baseline`,
      priority: anomaly.severity === 'critical' ? 'high' : 'medium',
    }));
  },

  /**
   * Attempt auto-remediation
   */
  autoRemediate(_anomaly: IAnomaly): boolean {
    return false;
  },

  /**
   * Helper: build training data from metrics
   */
  async buildTrainingData(workerName: string): Promise<IMetric[]> {
    const config = ensureConfig(workerName);
    const range = {
      start: new Date(Date.now() - config.learningPeriod * 24 * 60 * 60 * 1000),
      end: new Date(),
    };

    const data: IMetric[] = [];

    for (const metric of config.metrics) {
      const entry = await WorkerMetrics.query({
        workerName,
        metricType: metric,
        granularity: 'daily',
        startDate: range.start,
        endDate: range.end,
      });

      data.push(...mapPoints(metric, entry.points));
    }

    return data;
  },
});

export default AnomalyDetection;
