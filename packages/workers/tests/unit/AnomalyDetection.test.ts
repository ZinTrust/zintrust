import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/WorkerMetrics', () => ({
  WorkerMetrics: {
    query: vi.fn(),
    aggregate: vi.fn(),
  },
}));

import { AnomalyDetection, type IAnomalyConfig } from '../../src/AnomalyDetection';
import { WorkerMetrics, type MetricEntry } from '../../src/WorkerMetrics';

describe('AnomalyDetection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects anomalies based on baseline', async () => {
    const config: IAnomalyConfig = {
      workerName: 'email-worker',
      metrics: ['duration'],
      sensitivity: 0.8,
      learningPeriod: 7,
      alertThreshold: 0.2,
      autoAdjust: false,
    };

    AnomalyDetection.configure(config);
    AnomalyDetection.trainModel('email-worker', [
      { metricType: 'duration', value: 100, timestamp: new Date() },
      { metricType: 'duration', value: 110, timestamp: new Date() },
      { metricType: 'duration', value: 120, timestamp: new Date() },
    ]);

    vi.mocked(WorkerMetrics.query).mockResolvedValue({
      workerName: 'email-worker',
      metricType: 'duration',
      granularity: 'hourly',
      points: [
        { timestamp: new Date(), value: 115 },
        { timestamp: new Date(), value: 125 },
        { timestamp: new Date(), value: 320 },
      ],
    } as MetricEntry);

    const anomalies = await AnomalyDetection.detectAnomalies('email-worker');
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0]?.metric).toBe('duration');
  });
});
