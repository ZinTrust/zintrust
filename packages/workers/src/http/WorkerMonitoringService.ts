import { Logger, NodeSingletons, workersConfig } from '@zintrust/core';
import { HealthMonitor } from '../HealthMonitor';
import { getWorkers } from '../dashboard/workers-api';

type SnapshotData = {
  type: string;
  ts: string;
  monitoring: unknown;
  workers: unknown;
};

// Internal state
const emitter = new NodeSingletons.EventEmitter();
emitter.setMaxListeners(Infinity);
let interval: NodeJS.Timeout | null = null;
let subscribers = 0;
const INTERVAL_MS = workersConfig?.intervalMs || 5000;

const broadcastSnapshot = async (): Promise<void> => {
  try {
    if (subscribers <= 0) return;

    const monitoring = await HealthMonitor.getSummary();
    // Fetch full workers listing optimized for dashboard
    const workersPayload = await getWorkers({ page: 1, limit: 200 });

    const payload: SnapshotData = {
      type: 'snapshot',
      ts: new Date().toISOString(),
      monitoring,
      workers: workersPayload,
    };

    emitter.emit('snapshot', payload);
  } catch (err) {
    Logger.error('WorkerMonitoringService.broadcastSnapshot failed', err);
    emitter.emit('error', err);
  }
};

const startPolling = (): void => {
  if (interval) return;

  Logger.debug('Starting WorkerMonitoringService polling');
  // Initial fetch
  void broadcastSnapshot();

  interval = setInterval(() => {
    void broadcastSnapshot();
  }, INTERVAL_MS);
};

const stopPolling = (): void => {
  if (interval) {
    Logger.debug('Stopping WorkerMonitoringService polling');
    clearInterval(interval);
    interval = null;
  }
};

export const WorkerMonitoringService = Object.freeze({
  subscribe(callback: (data: SnapshotData) => void): void {
    emitter.on('snapshot', callback);
    subscribers++;
    if (subscribers === 1) {
      startPolling();
    }
  },

  unsubscribe(callback: (data: SnapshotData) => void): void {
    emitter.off('snapshot', callback);
    subscribers--;
    if (subscribers <= 0) {
      stopPolling();
    }
  },
});
