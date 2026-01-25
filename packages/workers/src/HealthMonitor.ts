import { Logger } from '@zintrust/core';
import type { Worker } from 'bullmq';
import { WorkerCreationStatus, WorkerFactory } from './WorkerFactory';

export type HealthCheckResult = {
  timestamp: Date;
  status: 'healthy' | 'degraded' | 'critical';
  latency: number;
  message?: string;
  meta?: any;
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
  [key: string]: any;
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

export class HealthMonitor {
  private static instance: HealthMonitor;
  private registry = new Map<string, WorkerHealthState>();
  private config: HealthMonitorConfig = { ...DEFAULT_CONFIG };
  private timer: NodeJS.Timeout | null = null;
  private runningChecks = 0;

  private constructor() {
    this.scheduleTick();
  }

  public static getInstance(): HealthMonitor {
    if (!HealthMonitor.instance) {
      HealthMonitor.instance = new HealthMonitor();
    }
    return HealthMonitor.instance;
  }

  public static configure(config: Partial<HealthMonitorConfig>): void {
    const instance = HealthMonitor.getInstance();
    instance.config = { ...instance.config, ...config };
    if (instance.timer) {
      instance.stop();
      instance.start();
    }
  }

  /**
   * Register a worker instance (Called by WorkerFactory)
   */
  public static register(name: string, worker: Worker, queueName: string): void {
    const instance = HealthMonitor.getInstance();
    let state = instance.registry.get(name);

    if (state) {
      // update existing entry (maybe created by startMonitoring)
      state.worker = worker;
      state.queueName = queueName;
      // Reset checks if needed, or keep existing schedule
    } else {
      // Add jitter
      const initialDelay = Math.floor(Math.random() * 5000);
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
      instance.registry.set(name, state);
    }

    if (!instance.timer) {
      instance.start();
    }
  }

  /**
   * Start or configure monitoring for a worker (External API)
   */
  public static startMonitoring(name: string, config?: WorkerMonitorConfig): void {
    const instance = HealthMonitor.getInstance();
    const state = instance.registry.get(name);

    if (state) {
      if (config) state.config = { ...state.config, ...config };
    } else {
      // Worker instance not yet registered, create placeholder
      const initialDelay = Math.floor(Math.random() * 5000);
      instance.registry.set(name, {
        name,
        status: WorkerCreationStatus.STARTING,
        lastCheck: new Date(),
        nextCheck: new Date(Date.now() + initialDelay),
        consecutiveFailures: 0,
        inProgress: false,
        history: [],
        config,
      });
    }

    if (!instance.timer) instance.start();
  }

  public static stopMonitoring(name: string): void {
    HealthMonitor.unregister(name);
  }

  public static unregister(name: string): void {
    const instance = HealthMonitor.getInstance();
    instance.registry.delete(name);
    // don't stop loops eagerly if other workers might join, but maybe?
    if (instance.registry.size === 0) {
      instance.stop();
    }
  }

  public static updateConfig(name: string, config: WorkerMonitorConfig): void {
    HealthMonitor.startMonitoring(name, config);
  }

  public static getCurrentHealth(name: string): HealthCheckResult | null {
    const instance = HealthMonitor.getInstance();
    const state = instance.registry.get(name);
    if (!state || state.history.length === 0) return null;
    return state.history[state.history.length - 1];
  }

  public static getHealthHistory(name: string, limit?: number): HealthCheckResult[] {
    const instance = HealthMonitor.getInstance();
    const state = instance.registry.get(name);
    if (!state) return [];
    const history = state.history;
    return limit ? history.slice(-limit) : history;
  }

  public static getHealthTrend(name: string): any {
    // Simple implementation
    const history = HealthMonitor.getHealthHistory(name, 10);
    const uptime = history.filter((h) => h.status === 'healthy').length / (history.length || 1);
    return { uptime, samples: history.length };
  }

  public static async getSummary(): Promise<any> {
    const instance = HealthMonitor.getInstance();
    const summary: any = {
      total: instance.registry.size,
      healthy: 0,
      degraded: 0,
      critical: 0,
      details: [],
    };

    for (const [name, state] of instance.registry) {
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
  }

  public static shutdown(): void {
    const instance = HealthMonitor.getInstance();
    instance.stop();
    instance.registry.clear();
  }

  public start(): void {
    this.scheduleTick();
    Logger.debug('HealthMonitor started');
  }

  private scheduleTick() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.config.tickIntervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    Logger.debug('HealthMonitor stopped');
  }

  private async tick(): Promise<void> {
    const now = new Date();
    const candidates: WorkerHealthState[] = [];

    for (const state of this.registry.values()) {
      if (this.runningChecks >= this.config.concurrencyLimit) break;
      // Skip if checks are paused or if worker instance is missing (wait for register)
      if (!state.worker && !state.queueName) continue;

      if (!state.inProgress && state.nextCheck <= now) {
        candidates.push(state);
      }
    }

    for (const candidate of candidates) {
      if (this.runningChecks >= this.config.concurrencyLimit) break;
      this.scheduleCheck(candidate);
    }
  }

  private async scheduleCheck(state: WorkerHealthState): Promise<void> {
    state.inProgress = true;
    this.runningChecks++;

    this.performCheck(state).finally(() => {
      state.inProgress = false;
      this.runningChecks--;
    });
  }

  private async performCheck(state: WorkerHealthState): Promise<void> {
    const startTime = Date.now();
    let isHealthy = false;
    let errorMsg: string | undefined;

    try {
      if (!state.worker) throw new Error('Worker instance not available');

      isHealthy = await Promise.race([
        this.verifyWorkerHealth(state.worker, state.name, state.queueName || 'unknown'),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), this.config.checkTimeoutMs)
        ),
      ]);
    } catch (err) {
      isHealthy = false;
      errorMsg = (err as Error).message;
    }

    const duration = Date.now() - startTime;
    this.updateState(state, isHealthy, errorMsg, duration);
  }

  private updateState(
    state: WorkerHealthState,
    isHealthy: boolean,
    errorMsg: string | undefined,
    latency: number
  ): void {
    const now = new Date();
    state.lastCheck = now;

    // Create Check Result
    const result: HealthCheckResult = {
      timestamp: now,
      status: isHealthy
        ? 'healthy'
        : state.consecutiveFailures < this.config.failureThreshold
          ? 'degraded'
          : 'critical',
      latency,
      message: errorMsg,
    };

    // Add to history
    state.history.push(result);
    if (state.history.length > this.config.historyLimit) {
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
        this.persistStatusChange(state.name, WorkerCreationStatus.RUNNING);
        state.status = WorkerCreationStatus.RUNNING;
        Logger.info(`Worker ${state.name} recovered to RUNNING`);
      }
      const jitter = Math.floor(Math.random() * 500);
      state.nextCheck = new Date(now.getTime() + this.config.intervalHealthyMs + jitter);
    } else {
      state.consecutiveFailures++;

      if (
        state.consecutiveFailures >= this.config.failureThreshold &&
        state.status !== WorkerCreationStatus.FAILED
      ) {
        this.persistStatusChange(state.name, WorkerCreationStatus.FAILED, errorMsg);
        state.status = WorkerCreationStatus.FAILED;
        Logger.warn(
          `Worker ${state.name} marked FAILED after ${state.consecutiveFailures} checks`,
          { error: errorMsg }
        );
      }

      const jitter = Math.floor(Math.random() * 500);
      state.nextCheck = new Date(now.getTime() + this.config.intervalSuspectMs + jitter);
    }
  }

  private async persistStatusChange(
    name: string,
    status: WorkerCreationStatus,
    lastError?: string
  ): Promise<void> {
    try {
      await WorkerFactory.updateStatus(name, status, lastError);
    } catch (err) {
      Logger.error(`Failed to persist status change for ${name}`, err);
    }
  }

  private async verifyWorkerHealth(
    worker: Worker,
    _name: string,
    _queueName: string
  ): Promise<boolean> {
    // Check if isClosing exists (isClosing check safe)
    if (
      worker.isPaused() ||
      (typeof (worker as any).isClosing === 'function' && (worker as any).isClosing())
    )
      return false;

    const isRunning = await worker.isRunning();
    if (!isRunning) return false;

    const client = await worker.client;
    const pingResult = await client.ping();
    if (pingResult !== 'PONG') throw new Error(`Redis ping failed: ${pingResult}`);

    return true;
  }
}
