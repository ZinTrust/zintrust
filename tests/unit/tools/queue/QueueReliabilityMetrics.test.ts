import { Env } from '@/config/env';
import { JobStateTracker } from '@/tools/queue/JobStateTracker';
import { Queue, type IQueueDriver } from '@/tools/queue/Queue';
import { QueueReliabilityMetrics } from '@/tools/queue/QueueReliabilityMetrics';
import { beforeEach, describe, expect, it } from 'vitest';

const clearDashboardEnv = (): void => {
  Env.unset('JOB_RUNBOOK_BASE_URL');
  Env.unset('JOB_DASHBOARD_DEFAULT_QUEUE');
  Env.unset('JOB_ALERT_FAILURE_RATE_THRESHOLD');
  Env.unset('JOB_ALERT_STALLED_THRESHOLD');
  Env.unset('JOB_ALERT_QUEUE_DEPTH_THRESHOLD');
  Env.unset('JOB_ALERT_MANUAL_REVIEW_THRESHOLD');
};

describe('QueueReliabilityMetrics dashboard snapshot', () => {
  beforeEach(() => {
    clearDashboardEnv();
    JobStateTracker.reset();
    Queue.reset();
  });

  it('builds dashboard snapshot with derived metrics and runbook map', async () => {
    const driver: IQueueDriver = {
      enqueue: async () => 'job-id',
      dequeue: async () => undefined,
      ack: async () => undefined,
      length: async () => 12,
      drain: async () => undefined,
    };
    Queue.register('inmemory', driver);

    await JobStateTracker.enqueued({ queueName: 'emails', jobId: 'job-1' });
    await JobStateTracker.started({ queueName: 'emails', jobId: 'job-1', attempts: 1 });
    await JobStateTracker.completed({ queueName: 'emails', jobId: 'job-1' });

    const dashboard = await QueueReliabilityMetrics.dashboardSnapshot('emails');

    expect(dashboard.queueName).toBe('emails');
    expect(dashboard.metrics.completed).toBe(1);
    expect(dashboard.metrics.queueDepth).toBe(12);
    expect(dashboard.metrics.totalTracked).toBeGreaterThanOrEqual(1);
    expect(typeof dashboard.runbooks.HighJobFailureRate).toBe('string');
  });

  it('emits alerts using configured thresholds with runbook links', async () => {
    const driver: IQueueDriver = {
      enqueue: async () => 'job-id',
      dequeue: async () => undefined,
      ack: async () => undefined,
      length: async () => 25,
      drain: async () => undefined,
    };
    Queue.register('inmemory', driver);

    await JobStateTracker.enqueued({ queueName: 'emails', jobId: 'job-2' });
    await JobStateTracker.setTerminalStatus({
      queueName: 'emails',
      jobId: 'job-2',
      status: 'dead_letter',
      reason: 'failed',
    });

    await JobStateTracker.enqueued({ queueName: 'emails', jobId: 'job-3' });
    await JobStateTracker.stalled({ queueName: 'emails', jobId: 'job-3' });

    await JobStateTracker.enqueued({ queueName: 'emails', jobId: 'job-3b' });
    await JobStateTracker.stalled({ queueName: 'emails', jobId: 'job-3b' });

    await JobStateTracker.enqueued({ queueName: 'emails', jobId: 'job-4' });
    await JobStateTracker.setTerminalStatus({
      queueName: 'emails',
      jobId: 'job-4',
      status: 'manual_review',
      reason: 'manual check',
    });

    await JobStateTracker.enqueued({ queueName: 'emails', jobId: 'job-4b' });
    await JobStateTracker.setTerminalStatus({
      queueName: 'emails',
      jobId: 'job-4b',
      status: 'manual_review',
      reason: 'manual check',
    });

    Env.set('JOB_RUNBOOK_BASE_URL', '/ops/runbooks');
    Env.set('JOB_ALERT_FAILURE_RATE_THRESHOLD', '0');
    Env.set('JOB_ALERT_STALLED_THRESHOLD', '0');
    Env.set('JOB_ALERT_QUEUE_DEPTH_THRESHOLD', '1');
    Env.set('JOB_ALERT_MANUAL_REVIEW_THRESHOLD', '0');

    const dashboard = await QueueReliabilityMetrics.dashboardSnapshot('emails');

    const alertIds = dashboard.alerts.map((alert) => alert.id);
    expect(alertIds).toContain('HighJobFailureRate');
    expect(alertIds).toContain('StalledJobsAccumulating');
    expect(alertIds).toContain('QueueDepthGrowing');
    expect(alertIds).toContain('ManualReviewBacklog');

    const failureAlert = dashboard.alerts.find((alert) => alert.id === 'HighJobFailureRate');
    expect(failureAlert?.runbook).toBe('/ops/runbooks/high-job-failure-rate');
  });
});
