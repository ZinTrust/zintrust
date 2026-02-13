import { Logger, NodeSingletons, workersConfig } from '@zintrust/core';
import { HealthMonitor } from '../HealthMonitor';
import { getWorkers } from '../dashboard/workers-api';

type SnapshotData = {
  type: string;
  ts: string;
  monitoring: unknown;
  workers: unknown;
};

type EventEmitterLike = {
  on: (event: string, listener: (payload: SnapshotData) => void) => void;
  off: (event: string, listener: (payload: SnapshotData) => void) => void;
  emit: (event: string, payload: unknown) => boolean;
  setMaxListeners?: (count: number) => void;
};

const createFallbackEmitter = (): EventEmitterLike => {
  const listeners = new Map<string, Set<(payload: SnapshotData) => void>>();

  return {
    on(event, listener) {
      const set = listeners.get(event) ?? new Set<(payload: SnapshotData) => void>();
      set.add(listener);
      listeners.set(event, set);
    },
    off(event, listener) {
      const set = listeners.get(event);
      if (!set) return;
      set.delete(listener);
      if (set.size === 0) listeners.delete(event);
    },
    emit(event, payload) {
      const set = listeners.get(event);
      if (!set) return false;
      for (const listener of set) listener(payload as SnapshotData);
      return true;
    },
  };
};

// Internal state
const EventEmitterCtor = NodeSingletons?.EventEmitter as (new () => EventEmitterLike) | undefined;
const emitter: EventEmitterLike =
  typeof EventEmitterCtor === 'function' ? new EventEmitterCtor() : createFallbackEmitter();
emitter.setMaxListeners?.(Infinity);
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
