import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/WorkerMetrics', () => ({
  WorkerMetrics: {
    query: vi.fn(),
    aggregate: vi.fn(),
  },
}));

vi.mock('../../src/HealthMonitor', () => ({
  HealthMonitor: {
    getHealthHistory: vi.fn(),
  },
}));

import { SLAMonitor, type ISLAConfig } from '../../src/SLAMonitor';
import { HealthMonitor, type HealthCheckResult } from '../../src/HealthMonitor';
import { WorkerMetrics, type AggregatedMetrics, type MetricEntry } from '../../src/WorkerMetrics';

const buildHealthResult = (status: HealthCheckResult['status']): HealthCheckResult => ({
  status,
  score: status === 'healthy' ? 90 : 40,
  timestamp: new Date(),
  checks: {
    errorRate: { status, value: 0.01, threshold: 0.05 },
    latency: { status, value: 100, threshold: 1000 },
    throughput: { status, value: 20, threshold: 10 },
    resources: { status, cpu: 20, memory: 30 },
    circuitBreaker: { status, state: 'closed' },
    queueHealth: { status, waiting: 10, active: 1 },
  },
  recommendations: [],
});

const buildAggregate = (
  metricType: AggregatedMetrics['metricType'],
  total: number
): AggregatedMetrics => ({
  workerName: 'email-worker',
  metricType,
  period: { start: new Date(Date.now() - 60 * 60 * 1000), end: new Date() },
  total,
  average: total,
  min: total,
  max: total,
  count: 1,
});

const baseConfig: ISLAConfig = {
  workerName: 'email-worker',
  metrics: {
    maxLatencyP99: 300,
    minThroughput: 10,
    minAvailability: 99,
    maxErrorRate: 1,
    maxRecoveryTime: 30,
  },
  alerting: {
    channels: ['log'],
    escalation: false,
    cooldown: 1,
  },
  reporting: {
    interval: 'daily',
    recipients: [],
  },
};

describe('SLAMonitor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects SLA violations and records history', async () => {
    SLAMonitor.defineSLA(baseConfig);

    vi.mocked(WorkerMetrics.query).mockResolvedValue({
      workerName: 'email-worker',
      metricType: 'duration',
      granularity: 'hourly',
      points: [
        { timestamp: new Date(), value: 120 },
        { timestamp: new Date(), value: 240 },
        { timestamp: new Date(), value: 800 },
      ],
    } as MetricEntry);

    vi.mocked(WorkerMetrics.aggregate).mockImplementation(async (options) => {
      if (options.metricType === 'processed') {
        return buildAggregate('processed', 30);
      }
      if (options.metricType === 'errors') {
        return buildAggregate('errors', 2);
      }
      return buildAggregate(options.metricType, 0);
    });

    vi.mocked(HealthMonitor.getHealthHistory).mockReturnValue([
      buildHealthResult('healthy'),
      buildHealthResult('healthy'),
    ]);

    const status = await SLAMonitor.checkCompliance('email-worker');
    expect(status.status).toBe('breach');

    const violations = SLAMonitor.getViolations('email-worker', {
      start: new Date(Date.now() - 2 * 60 * 60 * 1000),
      end: new Date(),
    });

    expect(violations.length).toBeGreaterThan(0);
  });
});
