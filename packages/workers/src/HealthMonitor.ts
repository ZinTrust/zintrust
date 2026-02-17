import { ErrorFactory, Logger } from '@zintrust/core';
import type { Worker } from 'bullmq';
import { WorkerCreationStatus, WorkerFactory } from './WorkerFactory';

export type HealthCheckResult = {
  timestamp: Date;
  status: 'healthy' | 'degraded' | 'critical';
  latency: number;
  message?: string;
  meta?: Record<string, unknown>;
};

type HealthMonitorConfig = {
  enabled: boolean;
  tickIntervalMs: number;
  concurrencyLimit: number;
  checkTimeoutMs: number;
  intervalHealthyMs: number;
  intervalSuspectMs: number;
  failureThreshold: number;
  historyLimit: number;
};

type WorkerMonitorConfig = {
  degradedCallback?: (name: string, result: HealthCheckResult) => void;
  criticalCallback?: (name: string, result: HealthCheckResult) => void;
  [key: string]: unknown;
};

type WorkerHealthState = {
  name: string;
  worker?: Worker; // Optional because startMonitoring might be called before register
  queueName?: string;
  status: WorkerCreationStatus;
  lastCheck: Date;
  nextCheck: Date;
  consecutiveFailures: number;
  inProgress: boolean;
  config?: WorkerMonitorConfig;
  history: HealthCheckResult[];
};

const DEFAULT_CONFIG: HealthMonitorConfig = {
  enabled: true,
  tickIntervalMs: 1000,
  concurrencyLimit: 50,
  checkTimeoutMs: 5000,
  intervalHealthyMs: 30000,
  intervalSuspectMs: 5000,
  failureThreshold: 2,
  historyLimit: 50,
};

// Module-level state (Singleton by nature of ESM)
const registry = new Map<string, WorkerHealthState>();
let config: HealthMonitorConfig = { ...DEFAULT_CONFIG };
let timer: NodeJS.Timeout | null = null;
let runningChecks = 0;

// Internal Helpers
const persistStatusChange = async (
  name: string,
  status: WorkerCreationStatus,
  lastError?: string
): Promise<void> => {
  try {
    await WorkerFactory.updateStatus(name, status, lastError);
  } catch (err) {
    Logger.error(`Failed to persist status change for ${name}`, err);
  }
};

const verifyWorkerHealth = async (worker: Worker): Promise<boolean> => {
  // Check if isClosing exists (isClosing check safe for mocks)
  const workerAny = worker as unknown as Record<string, unknown>;
  const isClosingFn = workerAny['isClosing'];

  if (
    worker.isPaused() ||
    (typeof isClosingFn === 'function' && (isClosingFn as () => boolean)())
  ) {
    return false;
  }

  const isRunning = await worker.isRunning();
  if (!isRunning) return false;

  const client = await worker.client;
  const pingResult = await client.ping();
  if (pingResult !== 'PONG') {
    throw ErrorFactory.createWorkerError(`Redis ping failed: ${pingResult}`);
  }
  return true;
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => Error
): Promise<T> => {
  let timeoutId: NodeJS.Timeout | null = null;

  return await new Promise<T>((resolve, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      reject(onTimeout());
    }, timeoutMs);
    timeoutId.unref();

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      });
  });
};

const updateState = (
  state: WorkerHealthState,
  isHealthy: boolean,
  errorMsg: string | undefined,
  latency: number
): void => {
  const now = new Date();
  state.lastCheck = now;

  // Determine status (healthy > degraded > critical)
  let status: 'healthy' | 'degraded' | 'critical';
  if (isHealthy) {
    status = 'healthy';
  } else if (state.consecutiveFailures < config.failureThreshold) {
    status = 'degraded';
  } else {
    status = 'critical';
  }

  // Create Check Result
  const result: HealthCheckResult = {
    timestamp: now,
    status,
    latency,
    message: errorMsg,
  };

  // Add to history
  state.history.push(result);
  if (state.history.length > config.historyLimit) {
    state.history.shift();
  }

  // Callbacks
  if (!isHealthy && state.config?.degradedCallback) {
    state.config.degradedCallback(state.name, result);
  }
  if (result.status === 'critical' && state.config?.criticalCallback) {
    state.config.criticalCallback(state.name, result);
  }

  if (isHealthy) {
    state.consecutiveFailures = 0;
    if (state.status !== WorkerCreationStatus.RUNNING) {
      persistStatusChange(state.name, WorkerCreationStatus.RUNNING);
      state.status = WorkerCreationStatus.RUNNING;
      Logger.info(`Worker ${state.name} recovered to RUNNING`);
    }
    const jitter = Math.floor(Math.random() * 500); //NOSONAR
    state.nextCheck = new Date(now.getTime() + config.intervalHealthyMs + jitter);
  } else {
    state.consecutiveFailures++;

    if (
      state.consecutiveFailures >= config.failureThreshold &&
      state.status !== WorkerCreationStatus.FAILED
    ) {
      persistStatusChange(state.name, WorkerCreationStatus.FAILED, errorMsg);
      state.status = WorkerCreationStatus.FAILED;
      Logger.warn(`Worker ${state.name} marked FAILED after ${state.consecutiveFailures} checks`, {
        error: errorMsg,
      });
    }

    const jitter = Math.floor(Math.random() * 500); //NOSONAR
    state.nextCheck = new Date(now.getTime() + config.intervalSuspectMs + jitter);
  }
};

const performCheck = async (state: WorkerHealthState): Promise<void> => {
  const startTime = Date.now();
  let isHealthy = false;
  let errorMsg: string | undefined;

  try {
    if (!state.worker) {
      throw ErrorFactory.createWorkerError('Worker instance not available');
    }

    isHealthy = await withTimeout(verifyWorkerHealth(state.worker), config.checkTimeoutMs, () =>
      ErrorFactory.createWorkerError('Health check timeout')
    );
  } catch (err) {
    isHealthy = false;
    errorMsg = (err as Error).message;
  }

  const duration = Date.now() - startTime;
  updateState(state, isHealthy, errorMsg, duration);
};

const scheduleCheck = async (state: WorkerHealthState): Promise<void> => {
  state.inProgress = true;
  runningChecks++;

  performCheck(state).finally(() => {
    state.inProgress = false;
    runningChecks--;
  });
};

const tick = async (): Promise<void> => {
  const now = new Date();
  const candidates: WorkerHealthState[] = [];

  for (const state of registry.values()) {
    if (runningChecks >= config.concurrencyLimit) break;
    // Skip if checks are paused or if worker instance is missing (wait for register)
    if (!state.worker && !state.queueName) continue;

    if (!state.inProgress && state.nextCheck <= now) {
      candidates.push(state);
    }
  }

  for (const candidate of candidates) {
    if (runningChecks >= config.concurrencyLimit) break;
    scheduleCheck(candidate);
  }
};

const start = (): void => {
  if (timer) return;
  timer = setInterval(() => tick(), config.tickIntervalMs);
  Logger.debug('HealthMonitor started');
};

const stop = (): void => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  Logger.debug('HealthMonitor stopped');
};

// Exported Public Methods

const configure = (newConfig: Partial<HealthMonitorConfig>): void => {
  config = { ...config, ...newConfig };
  if (timer) {
    stop();
    start();
  }
};

const register = (name: string, worker: Worker, queueName: string): void => {
  let state = registry.get(name);

  if (state) {
    // update existing entry (maybe created by startMonitoring)
    state.worker = worker;
    state.queueName = queueName;
  } else {
    // Add jitter
    const initialDelay = Math.floor(Math.random() * 5000); //NOSONAR
    state = {
      name,
      worker,
      queueName,
      status: WorkerCreationStatus.STARTING,
      lastCheck: new Date(),
      nextCheck: new Date(Date.now() + initialDelay),
      consecutiveFailures: 0,
      inProgress: false,
      history: [],
    };
    registry.set(name, state);
  }

  if (!timer) {
    start();
  }
};

const startMonitoring = (name: string, monitorConfig?: WorkerMonitorConfig): void => {
  const state = registry.get(name);

  if (state) {
    if (monitorConfig) state.config = { ...state.config, ...monitorConfig };
  } else {
    // Worker instance not yet registered, create placeholder
    const initialDelay = Math.floor(Math.random() * 5000); //NOSONAR
    registry.set(name, {
      name,
      status: WorkerCreationStatus.STARTING,
      lastCheck: new Date(),
      nextCheck: new Date(Date.now() + initialDelay),
      consecutiveFailures: 0,
      inProgress: false,
      history: [],
      config: monitorConfig,
    });
  }

  if (!timer) start();
};

const unregister = (name: string): void => {
  registry.delete(name);
  if (registry.size === 0) {
    stop();
  }
};

const stopMonitoring = (name: string): void => {
  unregister(name);
};

const updateConfig = (name: string, monitorConfig: WorkerMonitorConfig): void => {
  startMonitoring(name, monitorConfig);
};

const getCurrentHealth = (name: string): HealthCheckResult | null => {
  const state = registry.get(name);
  if (!state || state.history.length === 0) return null;
  return state.history[state.history.length - 1];
};

const getHealthHistory = (name: string, limit?: number): HealthCheckResult[] => {
  const state = registry.get(name);
  if (!state) return [];
  const history = state.history;
  return limit ? history.slice(-limit) : history;
};

const getHealthTrend = (name: string): { uptime: number; samples: number } => {
  const history = getHealthHistory(name, 10);
  const uptime = history.filter((h) => h.status === 'healthy').length / (history.length || 1);
  return { uptime, samples: history.length };
};

const getSummary = async (): Promise<unknown> => {
  interface SummaryDetail {
    name: string;
    status: string;
    lastCheck: Date;
  }

  const summary = {
    total: registry.size,
    healthy: 0,
    degraded: 0,
    critical: 0,
    details: [] as SummaryDetail[],
  };

  for (const [name, state] of registry) {
    const lastResult = state.history[state.history.length - 1];
    const status = lastResult?.status || 'unknown';
    if (status === 'healthy') summary.healthy++;
    else if (status === 'degraded') summary.degraded++;
    else if (status === 'critical') summary.critical++;

    summary.details.push({
      name,
      status,
      lastCheck: state.lastCheck,
    });
  }
  return summary;
};

const shutdown = (): void => {
  stop();
  registry.clear();
};

export const HealthMonitor = Object.freeze({
  configure,
  register,
  unregister,
  start,
  stop,
  startMonitoring,
  stopMonitoring,
  updateConfig,
  getCurrentHealth,
  getHealthHistory,
  getHealthTrend,
  getSummary,
  shutdown,
});
