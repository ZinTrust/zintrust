/**
 * Worker Registry
 * Central registry for all background workers with lifecycle management
 * Sealed namespace for immutability
 */

import { ErrorFactory, Logger, type WorkerConfig, type WorkerStatus } from '@zintrust/core';
import { AnomalyDetection } from './AnomalyDetection';

export type WorkerMetadata = {
  name: string;
  status: WorkerStatus;
  version: string;
  region: string;
  queueName: string;
  concurrency: number;
  activeStatus?: boolean;
  startedAt: Date | null;
  stoppedAt: Date | null;
  lastProcessedAt: Date | null;
  restartCount: number;
  processedCount: number;
  errorCount: number;
  lockKey: string | null;
  priority: number;
  memoryUsage: number;
  cpuUsage: number;
  circuitState: 'closed' | 'open' | 'half-open';
  queues: ReadonlyArray<string>;
  plugins: ReadonlyArray<string>;
  datacenter: string;
  canaryPercentage: number;
  config: Partial<WorkerConfig>;
};

export type WorkerInstance = {
  metadata: WorkerMetadata;
  instance: unknown; // The actual worker instance (BullMQ Worker, etc.)
  start: () => void;
  stop: () => Promise<void>;
  drain: () => Promise<void>;
  sleep: () => Promise<void>;
  wakeup: () => void;
  getStatus: () => WorkerStatus;
  getHealth: () => 'green' | 'yellow' | 'red';
};

export type RegisterWorkerOptions = {
  name: string;
  config: Partial<WorkerConfig>;
  activeStatus?: boolean;
  version?: string;
  region?: string;
  queues?: ReadonlyArray<string>;
  factory: () => Promise<WorkerInstance>;
};

export type WorkerRegistrySnapshot = {
  timestamp: Date;
  totalWorkers: number;
  runningWorkers: number;
  stoppedWorkers: number;
  sleepingWorkers: number;
  unhealthyWorkers: number;
  workers: ReadonlyArray<{
    name: string;
    status: WorkerStatus;
    health: 'green' | 'yellow' | 'red';
    uptime: number | null;
    processedCount: number;
    errorCount: number;
  }>;
};

type Rego = { workers: string[]; count: number };

// Internal storage
const workers = new Map<string, WorkerInstance>();
const registrations = new Map<string, RegisterWorkerOptions>();

// Cleanup configuration
const STOPPED_WORKER_CLEANUP_DELAY = 5 * 60 * 1000; // 5 minutes
const cleanupTimers = new Map<string, NodeJS.Timeout>();

type UnrefableTimer = { unref: () => void };

const isUnrefableTimer = (value: unknown): value is UnrefableTimer => {
  if (typeof value !== 'object' || value === null) return false;
  return 'unref' in value && typeof (value as UnrefableTimer).unref === 'function';
};

/**
 * Helper: Schedule cleanup of stopped worker
 */
const scheduleStoppedWorkerCleanup = (name: string): void => {
  // Clear existing timer if any
  const existingTimer = cleanupTimers.get(name);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Schedule new cleanup with proper cleanup handling
  // eslint-disable-next-line no-restricted-syntax
  const timer = setTimeout(() => {
    try {
      const instance = workers.get(name);
      if (instance && instance.metadata.status === 'stopped') {
        Logger.info(`Auto-cleaning up stopped worker: ${name}`);
        workers.delete(name);
        registrations.delete(name);
      }
    } catch (error) {
      Logger.error(`Error during auto-cleanup of worker ${name}`, error);
    } finally {
      cleanupTimers.delete(name);
    }
  }, STOPPED_WORKER_CLEANUP_DELAY);

  if (isUnrefableTimer(timer)) {
    timer.unref();
  }

  cleanupTimers.set(name, timer);
};

/**
 * Helper: Cancel cleanup timer
 */
const cancelCleanupTimer = (name: string): void => {
  const timer = cleanupTimers.get(name);
  if (timer) {
    clearTimeout(timer);
    cleanupTimers.delete(name);
  }
};

/**
 * Helper: Calculate uptime in seconds
 */
const calculateUptime = (startedAt: Date | null): number | null => {
  if (!startedAt) return null;
  return Math.floor((Date.now() - startedAt.getTime()) / 1000);
};

/**
 * Helper: Validate worker name
 */
const validateWorkerName = (name: string): void => {
  if (!name || typeof name !== 'string') {
    throw ErrorFactory.createWorkerError('Worker name must be a non-empty string');
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw ErrorFactory.createWorkerError(
      'Worker name must contain only lowercase letters, numbers, and hyphens'
    );
  }
};

/**
 * Worker Registry - Sealed namespace
 */
export const WorkerRegistry = Object.freeze({
  /**
   * Register a worker with the registry
   */
  register(options: RegisterWorkerOptions): void {
    validateWorkerName(options.name);

    if (registrations.has(options.name)) {
      Logger.warn(`Worker "${options.name}" is already registered. Skipping.`);
      return;
    }

    registrations.set(options.name, options);
    Logger.info(`Worker "${options.name}" registered successfully`);
  },

  /**
   * Start a worker
   */
  async start(name: string, version?: string): Promise<void> {
    validateWorkerName(name);

    const registration = registrations.get(name);
    if (!registration) {
      throw ErrorFactory.createWorkerError(`Worker "${name}" is not registered`);
    }

    if (registration.activeStatus === false) {
      throw ErrorFactory.createWorkerError(`Worker "${name}" is inactive`);
    }

    if (workers.has(name)) {
      const existing = workers.get(name);
      if (existing?.metadata.status === 'running') {
        Logger.warn(`Worker "${name}" is already running`);
        return;
      }
    }

    const versionSuffix = version === undefined ? '' : ` version ${version}`;
    Logger.info(`Starting worker "${name}"${versionSuffix}...`);

    try {
      const instance = await registration.factory();
      instance.metadata.status = 'starting';
      instance.metadata.version = version ?? '1.0.0';

      // Cancel any pending cleanup timer when worker restarts
      cancelCleanupTimer(name);

      workers.set(name, instance);

      instance.start();

      instance.metadata.status = 'running';
      instance.metadata.startedAt = new Date();
      instance.metadata.stoppedAt = null;

      Logger.info(`Worker "${name}" started successfully`);
    } catch (error) {
      Logger.error(`Failed to start worker "${name}"`, error);
      throw error;
    }
  },

  /**
   * Stop a worker
   */
  async stop(name: string): Promise<void> {
    validateWorkerName(name);

    const instance = workers.get(name);
    if (!instance) {
      Logger.warn(`Worker "${name}" is not running`);
      return;
    }

    if (instance.metadata.status === 'stopped') {
      Logger.warn(`Worker "${name}" is already stopped`);
      return;
    }

    Logger.info(`Stopping worker "${name}"...`);

    try {
      instance.metadata.status = 'stopping';
      await instance.stop();
      instance.metadata.status = 'stopped';
      instance.metadata.stoppedAt = new Date();

      AnomalyDetection.cleanup(name);

      // Schedule automatic cleanup for stopped worker
      scheduleStoppedWorkerCleanup(name);

      Logger.info(`Worker "${name}" stopped successfully`);
    } catch (error) {
      Logger.error(`Failed to stop worker "${name}"`, error);
      throw error;
    }
  },

  /**
   * Restart a worker (stop + start)
   */
  async restart(name: string): Promise<void> {
    validateWorkerName(name);

    const instance = workers.get(name);
    if (instance) {
      await WorkerRegistry.stop(name);
      instance.metadata.restartCount += 1;
    }

    await WorkerRegistry.start(name);
    Logger.info(`Worker "${name}" restarted successfully`);
  },

  /**
   * Sleep a worker (pause processing but keep lock)
   */
  async sleep(name: string): Promise<void> {
    validateWorkerName(name);

    const instance = workers.get(name);
    if (!instance) {
      throw ErrorFactory.createWorkerError(`Worker "${name}" is not running`);
    }

    if (instance.metadata.status === 'sleeping') {
      Logger.warn(`Worker "${name}" is already sleeping`);
      return;
    }

    Logger.info(`Putting worker "${name}" to sleep...`);

    try {
      await instance.sleep();
      instance.metadata.status = 'sleeping';
      Logger.info(`Worker "${name}" is now sleeping`);
    } catch (error) {
      Logger.error(`Failed to sleep worker "${name}"`, error);
      throw error;
    }
  },

  /**
   * Wakeup a worker (resume from sleep)
   */
  async wakeup(name: string): Promise<void> {
    validateWorkerName(name);

    const instance = workers.get(name);
    if (!instance) {
      throw ErrorFactory.createWorkerError(`Worker "${name}" is not found`);
    }

    if (instance.metadata.status !== 'sleeping') {
      Logger.warn(`Worker "${name}" is not sleeping (status: ${instance.metadata.status})`);
      return;
    }

    Logger.info(`Waking up worker "${name}"...`);

    try {
      instance.wakeup();
      instance.metadata.status = 'running';
      Logger.info(`Worker "${name}" is now awake and running`);
    } catch (error) {
      Logger.error(`Failed to wake up worker "${name}"`, error);
      throw error;
    }
  },

  /**
   * Get worker status
   */
  status(name: string): WorkerMetadata | null {
    validateWorkerName(name);

    const instance = workers.get(name);
    if (!instance) {
      return null;
    }

    return { ...instance.metadata };
  },

  /**
   * List all registered workers
   */
  list(): ReadonlyArray<string> {
    const names: string[] = [];
    for (const [name, registration] of registrations.entries()) {
      if (registration.activeStatus === false) continue;
      names.push(name);
    }
    return names;
  },

  /**
   * Update active status for a registered worker
   */
  setActiveStatus(name: string, activeStatus: boolean): void {
    const registration = registrations.get(name);
    if (!registration) return;
    registrations.set(name, { ...registration, activeStatus });
  },

  /**
   * List all running workers
   */
  listRunning(): ReadonlyArray<string> {
    const running: string[] = [];
    for (const [name, instance] of workers.entries()) {
      if (instance.metadata.status === 'running') {
        running.push(name);
      }
    }
    return running;
  },

  /**
   * Stop all running workers
   */
  async stopAll(): Promise<void> {
    Logger.info('Stopping all running workers...');

    const running = WorkerRegistry.listRunning();
    const tasks = running.map(async (name) => WorkerRegistry.stop(name));

    try {
      await Promise.all(tasks);
      Logger.info(`Stopped ${running.length} workers successfully`);
    } catch (error) {
      Logger.error('Failed to stop some workers', error);
      throw error;
    }
  },

  /**
   * Get worker metrics
   */
  getMetrics(
    name: string
  ): Pick<WorkerMetadata, 'processedCount' | 'errorCount' | 'memoryUsage' | 'cpuUsage'> | null {
    validateWorkerName(name);

    const instance = workers.get(name);
    if (!instance) {
      return null;
    }

    return {
      processedCount: instance.metadata.processedCount,
      errorCount: instance.metadata.errorCount,
      memoryUsage: instance.metadata.memoryUsage,
      cpuUsage: instance.metadata.cpuUsage,
    };
  },

  /**
   * Get worker health status
   */
  getHealth(name: string): 'green' | 'yellow' | 'red' | null {
    validateWorkerName(name);

    const instance = workers.get(name);
    if (!instance) {
      return null;
    }

    return instance.getHealth();
  },

  /**
   * Get registry snapshot
   */
  getSnapshot(): WorkerRegistrySnapshot {
    const allWorkers = Array.from(workers.entries()).map(([name, instance]) => ({
      name,
      status: instance.metadata.status,
      health: instance.getHealth(),
      uptime: calculateUptime(instance.metadata.startedAt),
      processedCount: instance.metadata.processedCount,
      errorCount: instance.metadata.errorCount,
    }));

    const statusCounts = allWorkers.reduce(
      (acc, w) => {
        if (w.status === 'running') acc.running++;
        else if (w.status === 'stopped') acc.stopped++;
        else if (w.status === 'sleeping') acc.sleeping++;
        if (w.health === 'red') acc.unhealthy++;
        return acc;
      },
      { running: 0, stopped: 0, sleeping: 0, unhealthy: 0 }
    );

    return {
      timestamp: new Date(),
      totalWorkers: registrations.size,
      runningWorkers: statusCounts.running,
      stoppedWorkers: statusCounts.stopped,
      sleepingWorkers: statusCounts.sleeping,
      unhealthyWorkers: statusCounts.unhealthy,
      workers: allWorkers,
    };
  },

  /**
   * Get worker topology (cluster view)
   */
  getTopology(): Record<string, { workers: string[]; count: number }> {
    const topology: Record<string, Rego> = {};

    for (const [name, instance] of workers.entries()) {
      const region = instance.metadata.region;
      if (topology[region].count <= 0) {
        topology[region] = { workers: [], count: 0 };
      }
      topology[region].workers.push(name);
      topology[region].count++;
    }

    return topology;
  },

  /**
   * Unregister a worker and clear its instance
   */
  unregister(name: string): void {
    validateWorkerName(name);

    const instance = workers.get(name);
    if (instance?.metadata.status === 'running') {
      Logger.warn(`Worker "${name}" is still running during unregister`);
    }

    // Cancel any pending cleanup timer
    cancelCleanupTimer(name);

    workers.delete(name);
    registrations.delete(name);

    AnomalyDetection.cleanup(name);

    Logger.info(`Worker "${name}" unregistered`);
  },

  /**
   * Check if worker is registered
   */
  isRegistered(name: string): boolean {
    return registrations.has(name);
  },

  /**
   * Check if worker is running
   */
  isRunning(name: string): boolean {
    const instance = workers.get(name);
    return instance?.metadata.status === 'running';
  },

  /**
   * Get worker instance (internal use)
   */
  getInstance(name: string): WorkerInstance | null {
    return workers.get(name) ?? null;
  },
});
