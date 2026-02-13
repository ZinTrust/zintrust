import { Env } from '@config/env';
import { JobStateTracker } from '@queue/JobStateTracker';
import { Queue } from '@queue/Queue';

export type QueueReliabilitySnapshot = {
  pending: number;
  active: number;
  completed: number;
  failed: number;
  stalled: number;
  timeout: number;
  pendingRecovery: number;
  deadLetter: number;
  manualReview: number;
};

export type QueueReliabilityAlertId =
  | 'HighJobFailureRate'
  | 'StalledJobsAccumulating'
  | 'QueueDepthGrowing'
  | 'ManualReviewBacklog';

export type QueueReliabilityAlert = {
  id: QueueReliabilityAlertId;
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  runbook: string;
};

export type QueueReliabilityDashboardSnapshot = {
  queueName: string;
  generatedAt: string;
  metrics: QueueReliabilitySnapshot & {
    totalTracked: number;
    queueDepth: number;
    failureRate: number;
  };
  alerts: QueueReliabilityAlert[];
  runbooks: Record<QueueReliabilityAlertId, string>;
};

const toNumber = (input: Record<string, number>, key: string): number => input[key] ?? 0;

const toRate = (failed: number, completed: number): number => {
  const denominator = failed + completed;
  if (denominator <= 0) return 0;
  return failed / denominator;
};

const resolveRunbookBase = (): string => {
  const base = Env.get('JOB_RUNBOOK_BASE_URL', '/docs/runbooks').trim();
  if (base === '') return '/docs/runbooks';
  return base.endsWith('/') ? base.slice(0, -1) : base;
};

const getRunbookMap = (): Record<QueueReliabilityAlertId, string> => {
  const base = resolveRunbookBase();
  return {
    HighJobFailureRate: `${base}/high-job-failure-rate`,
    StalledJobsAccumulating: `${base}/stalled-jobs-accumulating`,
    QueueDepthGrowing: `${base}/queue-depth-growing`,
    ManualReviewBacklog: `${base}/manual-review-backlog`,
  };
};

const evaluateAlerts = (
  queueName: string,
  metrics: QueueReliabilitySnapshot & {
    queueDepth: number;
    failureRate: number;
  }
): QueueReliabilityAlert[] => {
  const runbooks = getRunbookMap();
  const alerts: QueueReliabilityAlert[] = [];

  const failureThreshold = Math.max(0, Env.getFloat('JOB_ALERT_FAILURE_RATE_THRESHOLD', 0.1));
  const stalledThreshold = Math.max(1, Env.getInt('JOB_ALERT_STALLED_THRESHOLD', 50));
  const queueDepthThreshold = Math.max(1, Env.getInt('JOB_ALERT_QUEUE_DEPTH_THRESHOLD', 1000));
  const manualReviewThreshold = Math.max(1, Env.getInt('JOB_ALERT_MANUAL_REVIEW_THRESHOLD', 10));

  if (metrics.failureRate > failureThreshold) {
    alerts.push({
      id: 'HighJobFailureRate',
      severity: 'critical',
      message: `Queue ${queueName} failure rate is above threshold`,
      value: Number(metrics.failureRate.toFixed(6)),
      threshold: failureThreshold,
      runbook: runbooks.HighJobFailureRate,
    });
  }

  if (metrics.stalled > stalledThreshold) {
    alerts.push({
      id: 'StalledJobsAccumulating',
      severity: 'critical',
      message: `Queue ${queueName} stalled jobs exceed threshold`,
      value: metrics.stalled,
      threshold: stalledThreshold,
      runbook: runbooks.StalledJobsAccumulating,
    });
  }

  if (metrics.queueDepth > queueDepthThreshold) {
    alerts.push({
      id: 'QueueDepthGrowing',
      severity: 'warning',
      message: `Queue ${queueName} depth is above threshold`,
      value: metrics.queueDepth,
      threshold: queueDepthThreshold,
      runbook: runbooks.QueueDepthGrowing,
    });
  }

  if (metrics.manualReview > manualReviewThreshold) {
    alerts.push({
      id: 'ManualReviewBacklog',
      severity: 'warning',
      message: `Queue ${queueName} manual-review backlog is above threshold`,
      value: metrics.manualReview,
      threshold: manualReviewThreshold,
      runbook: runbooks.ManualReviewBacklog,
    });
  }

  return alerts;
};

export const QueueReliabilityMetrics = Object.freeze({
  snapshot(queueName?: string): QueueReliabilitySnapshot {
    const summary = JobStateTracker.getSummary(queueName);
    return {
      pending: toNumber(summary, 'pending'),
      active: toNumber(summary, 'active'),
      completed: toNumber(summary, 'completed'),
      failed: toNumber(summary, 'failed'),
      stalled: toNumber(summary, 'stalled'),
      timeout: toNumber(summary, 'timeout'),
      pendingRecovery: toNumber(summary, 'pending_recovery'),
      deadLetter: toNumber(summary, 'dead_letter'),
      manualReview: toNumber(summary, 'manual_review'),
    };
  },

  runbookMap(): Record<QueueReliabilityAlertId, string> {
    return getRunbookMap();
  },

  async dashboardSnapshot(queueName?: string): Promise<QueueReliabilityDashboardSnapshot> {
    const normalizedQueueName = typeof queueName === 'string' ? queueName.trim() : '';
    const resolvedQueueName =
      normalizedQueueName === ''
        ? Env.get('JOB_DASHBOARD_DEFAULT_QUEUE', 'default')
        : normalizedQueueName;
    const metrics = this.snapshot(resolvedQueueName);

    let queueDepth = 0;
    try {
      queueDepth = await Queue.length(resolvedQueueName);
    } catch {
      queueDepth = 0;
    }

    const totalTracked =
      metrics.pending +
      metrics.active +
      metrics.completed +
      metrics.failed +
      metrics.stalled +
      metrics.timeout +
      metrics.pendingRecovery +
      metrics.deadLetter +
      metrics.manualReview;
    const failureRate = toRate(metrics.failed + metrics.deadLetter, metrics.completed);

    const derivedMetrics = {
      ...metrics,
      totalTracked,
      queueDepth,
      failureRate,
    };

    return {
      queueName: resolvedQueueName,
      generatedAt: new Date().toISOString(),
      metrics: derivedMetrics,
      alerts: evaluateAlerts(resolvedQueueName, derivedMetrics),
      runbooks: getRunbookMap(),
    };
  },
});

export default QueueReliabilityMetrics;
