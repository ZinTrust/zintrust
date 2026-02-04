import type { IResponse } from '@zintrust/core';
import { Logger, NodeSingletons } from '@zintrust/core';
import type { createSnapshotBuilder, TelemetrySettings } from './TelemetryAPI';

export type TelemetrySnapshotData = {
  type: string;
  ts: string;
  ok: boolean;
  summary: unknown;
  resources: unknown;
  cost: unknown;
};

// Internal state for singleton service
const emitter = new NodeSingletons.EventEmitter();
emitter.setMaxListeners(Infinity);
let interval: NodeJS.Timeout | null = null;
let subscribers = 0;
let currentSettings: TelemetrySettings | null = null;
let currentBuildSnapshot: ReturnType<typeof createSnapshotBuilder> | null = null;

const broadcastTelemetrySnapshot = async (): Promise<void> => {
  try {
    if (subscribers <= 0 || !currentBuildSnapshot || !currentSettings) return;

    const snapshot = await currentBuildSnapshot();

    const payload: TelemetrySnapshotData = {
      type: 'snapshot',
      ts: new Date().toISOString(),
      ...snapshot,
    };

    emitter.emit('snapshot', payload);
  } catch (err) {
    Logger.error('TelemetryMonitoringService.broadcastSnapshot failed', err);
    emitter.emit('error', err);
  }
};

const startPolling = (): void => {
  if (interval || !currentSettings) return;

  Logger.debug('Starting TelemetryMonitoringService polling');
  // Initial fetch
  void broadcastTelemetrySnapshot();

  interval = setInterval(() => {
    void broadcastTelemetrySnapshot();
  }, currentSettings.refreshIntervalMs);
};

const stopPolling = (): void => {
  if (interval) {
    Logger.debug('Stopping TelemetryMonitoringService polling');
    clearInterval(interval);
    interval = null;
  }
};

export const TelemetryMonitoringService = Object.freeze({
  subscribe(callback: (data: TelemetrySnapshotData) => void): void {
    emitter.on('snapshot', callback);
    subscribers++;
    if (subscribers === 1) {
      startPolling();
    }
  },

  unsubscribe(callback: (data: TelemetrySnapshotData) => void): void {
    emitter.off('snapshot', callback);
    subscribers--;
    if (subscribers <= 0) {
      stopPolling();
      currentSettings = null;
      currentBuildSnapshot = null;
    }
  },

  startMonitoring(
    settings: TelemetrySettings,
    buildSnapshot: ReturnType<typeof createSnapshotBuilder>
  ): void {
    if (subscribers === 0) {
      currentSettings = settings;
      currentBuildSnapshot = buildSnapshot;
    }
  },

  stopMonitoring(): void {
    if (subscribers <= 0) {
      stopPolling();
      currentSettings = null;
      currentBuildSnapshot = null;
    }
  },
});

export const teleStream = async (
  res: IResponse,
  settings: TelemetrySettings,
  buildSnapshot: ReturnType<typeof createSnapshotBuilder>
): Promise<void> => {
  const raw = res.getRaw();

  raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let closed = false;

  const send = async (payload: unknown): Promise<void> => {
    try {
      raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (err) {
      Logger.error('Telemetry SSE send failed', err);
    }
  };

  // Send hello immediately
  await send({ type: 'hello', ts: new Date().toISOString() });

  // Start monitoring with the singleton service
  TelemetryMonitoringService.startMonitoring(settings, buildSnapshot);

  // Subscribe to telemetry snapshots
  const onSnapshot = (data: TelemetrySnapshotData): void => {
    if (!closed) {
      void send(data);
    }
  };

  TelemetryMonitoringService.subscribe(onSnapshot);

  // Heartbeat to keep connection alive
  const hb = setInterval(() => {
    if (!closed) raw.write(': ping\n\n');
  }, 15000);

  raw.on('close', () => {
    closed = true;
    clearInterval(hb);
    TelemetryMonitoringService.unsubscribe(onSnapshot);
    TelemetryMonitoringService.stopMonitoring();
  });
};
