import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { JobReconciliationRunner } from '@queue/JobReconciliationRunner';
import { JobRecoveryDaemon } from '@queue/JobRecoveryDaemon';
import { StalledJobMonitor } from '@queue/StalledJobMonitor';

type TimerRef = ReturnType<typeof setInterval>;

type OrchestratorState = {
  started: boolean;
  reconciliationTimer?: TimerRef;
  recoveryTimer?: TimerRef;
  stalledTimer?: TimerRef;
};

const state: OrchestratorState = {
  started: false,
};

const clearTimer = (timer: TimerRef | undefined): void => {
  if (timer === undefined) return;
  clearInterval(timer);
};

const startInterval = (handler: () => Promise<void>, intervalMs: number): TimerRef =>
  setInterval(() => {
    handler().catch((error: unknown) => {
      Logger.warn('Queue reliability interval failed', {
        error: error instanceof Error ? error : String(error),
      });
    });
  }, intervalMs);

export const QueueReliabilityOrchestrator = Object.freeze({
  isEnabled(): boolean {
    return Env.getBool('JOB_RELIABILITY_ENABLED', true);
  },

  start(): void {
    if (!this.isEnabled()) return;
    if (state.started) return;

    const reconciliationMs = Math.max(5000, Env.getInt('JOB_RECONCILIATION_INTERVAL_MS', 60000));
    const recoveryMs = Math.max(5000, Env.getInt('JOB_RECOVERY_INTERVAL_MS', 30000));
    const stalledMs = Math.max(5000, Env.getInt('STALLED_JOB_CHECK_INTERVAL_MS', 30000));

    state.reconciliationTimer = startInterval(async () => {
      await JobReconciliationRunner.runOnce();
    }, reconciliationMs);

    state.recoveryTimer = startInterval(async () => {
      await JobRecoveryDaemon.runOnce();
    }, recoveryMs);

    state.stalledTimer = startInterval(async () => {
      await StalledJobMonitor.scanOnce();
    }, stalledMs);

    state.started = true;
    Logger.info('Queue reliability orchestrator started', {
      reconciliationMs,
      recoveryMs,
      stalledMs,
    });
  },

  stop(): void {
    clearTimer(state.reconciliationTimer);
    clearTimer(state.recoveryTimer);
    clearTimer(state.stalledTimer);

    state.reconciliationTimer = undefined;
    state.recoveryTimer = undefined;
    state.stalledTimer = undefined;
    state.started = false;
  },
});

export default QueueReliabilityOrchestrator;
