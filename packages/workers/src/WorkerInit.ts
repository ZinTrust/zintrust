/**
 * Worker Management System Initializer
 *
 * Handles initialization and lifecycle management of the worker management system.
 * - Registers shutdown handlers
 * - Initializes monitoring and resource management
 * - Sets up auto-scaling and health checks
 * - Ensures graceful startup and shutdown
 */

import { Env, Logger } from '@zintrust/core';
import { ResourceMonitor } from './ResourceMonitor';
import { WorkerFactory } from './WorkerFactory';
import { WorkerShutdown } from './WorkerShutdown';

// ============================================================================
// Types
// ============================================================================

export interface IWorkerInitOptions {
  /**
   * Whether to start resource monitoring on initialization
   * @default true
   */
  enableResourceMonitoring?: boolean;

  /**
   * Whether to start health monitoring on initialization
   * @default true
   */
  enableHealthMonitoring?: boolean;

  /**
   * Whether to start auto-scaling on initialization
   * @default false - must be explicitly enabled
   */
  enableAutoScaling?: boolean;

  /**
   * Whether to register graceful shutdown handlers
   * @default true
   */
  registerShutdownHandlers?: boolean;

  /**
   * Resource monitoring interval in milliseconds
   * @default 60000 (1 minute)
   */
  resourceMonitoringInterval?: number;
}

interface IInitState {
  initialized: boolean;
  initializedAt: Date | null;
  resourceMonitoring: boolean;
  healthMonitoring: boolean;
  autoScaling: boolean;
  shutdownHandlersRegistered: boolean;
}

// ============================================================================
// State
// ============================================================================

const state: IInitState = {
  initialized: false,
  initializedAt: null,
  resourceMonitoring: false,
  healthMonitoring: false,
  autoScaling: false,
  shutdownHandlersRegistered: false,
};

// ============================================================================
// Implementation
// ============================================================================

/**
 * Initialize resource monitoring based on environment and worker settings
 */
function initializeResourceMonitoring(
  enableResourceMonitoring: boolean,
  resourceMonitoringInterval: number
): boolean {
  // Check global environment gate first
  const globalResourceMonitoring = Env.getBool('WORKER_RESOURCE_MONITORING', false);

  if (enableResourceMonitoring && globalResourceMonitoring) {
    // Check if any workers have resourceMonitoring enabled
    const shouldStart = shouldStartResourceMonitoring();

    if (shouldStart) {
      if (ResourceMonitor.isRunning() === false) {
        ResourceMonitor.start(resourceMonitoringInterval / 1000);
      }
      Logger.debug('✓ Resource monitoring started (worker requested)');
      return true;
    } else {
      Logger.debug('⏸️ Resource monitoring disabled (no workers requested it)');
    }
  } else if (!globalResourceMonitoring) {
    Logger.debug('⏸️ Resource monitoring disabled (WORKER_RESOURCE_MONITORING=false)');
  }

  return false;
}

/**
 * Get persistence override configuration based on driver name
 */
function getPersistenceOverride(driver: string): { driver: 'redis' | 'memory' } | undefined {
  if (driver === 'redis') {
    return { driver: 'redis' };
  }
  if (driver === 'database' || driver === 'db') {
    return undefined;
  }
  if (driver === 'memory') {
    return { driver: 'memory' };
  }
  return undefined;
}

/**
 * Check if any workers have resource monitoring enabled
 */
function shouldStartResourceMonitoring(): boolean {
  try {
    const workerNames = WorkerFactory.list();
    return workerNames.some((name) => {
      const worker = WorkerFactory.get(name);
      return worker?.config?.features?.resourceMonitoring === true;
    });
  } catch {
    return false;
  }
}

/**
 * Initialize the worker management system
 */
async function initialize(options: IWorkerInitOptions = {}): Promise<void> {
  if (state.initialized) {
    Logger.warn('Worker management system already initialized');
    return;
  }

  const {
    enableResourceMonitoring = true,
    enableHealthMonitoring = true,
    enableAutoScaling = false,
    registerShutdownHandlers = true,
    resourceMonitoringInterval = 60000,
  } = options;

  Logger.info('🚀 Initializing worker management system', {
    enableResourceMonitoring,
    enableHealthMonitoring,
    enableAutoScaling,
    registerShutdownHandlers,
  });

  try {
    // 1. Register shutdown handlers first (so they're ready for any failures)
    if (registerShutdownHandlers) {
      WorkerShutdown.registerShutdownHandlers();
      state.shutdownHandlersRegistered = true;
      Logger.debug('✓ Shutdown handlers registered');
    }

    // 2. Start resource monitoring (important for scaling decisions)
    state.resourceMonitoring = initializeResourceMonitoring(
      enableResourceMonitoring,
      resourceMonitoringInterval
    );

    // 3. Enable health monitoring (depends on workers being created)
    if (enableHealthMonitoring) {
      // Health checks will start automatically when workers are created
      state.healthMonitoring = true;
      Logger.debug('✓ Health monitoring enabled');
    }

    // 4. Start auto-scaling if explicitly enabled
    if (enableAutoScaling) {
      // Auto-scaling will evaluate workers when they are created
      state.autoScaling = true;
      Logger.debug('✓ Auto-scaling enabled');
    }

    state.initialized = true;
    state.initializedAt = new Date();

    Logger.info('✅ Worker management system initialized successfully', {
      timestamp: state.initializedAt.toISOString(),
    });
  } catch (error) {
    Logger.error('❌ Failed to initialize worker management system', error);
    throw error;
  }
}

async function autoStartPersistedWorkers(): Promise<void> {
  const envAutoStart = Env.getBool('WORKER_AUTO_START', false);
  const shouldAutoStart = envAutoStart;

  Logger.debug('Auto-start check', {
    envAutoStart,
    shouldAutoStart,
  });

  if (!shouldAutoStart) {
    Logger.debug('Auto-start disabled - WORKER_AUTO_START is not true');
    return;
  }

  try {
    const persistenceDriver = (Env.get('WORKER_PERSISTENCE_DRIVER', 'memory') || '')
      .toLowerCase()
      .trim();

    const persistenceOverride = getPersistenceOverride(persistenceDriver);

    const records = await WorkerFactory.listPersistedRecords(persistenceOverride);
    Logger.debug('Found persisted records', {
      count: records.length,
      records: records.map((r) => ({ name: r.name, autoStart: r.autoStart })),
    });

    const candidates = records.filter((record) => {
      if (record.activeStatus === false) {
        return false;
      }
      return record.autoStart === true;
    });

    Logger.debug('Auto-start candidates', {
      count: candidates.length,
      candidates: candidates.map((c) => c.name),
    });
    const results = await Promise.all(
      candidates.map(async (record) => {
        const existing = WorkerFactory.get(record.name);
        if (existing) {
          try {
            const workerLike = existing.worker as {
              isRunning?: () => boolean | Promise<boolean>;
              isPaused?: () => boolean;
            };
            const isRunning =
              typeof workerLike.isRunning === 'function'
                ? await Promise.resolve(workerLike.isRunning())
                : false;
            const isPaused =
              typeof workerLike.isPaused === 'function' ? workerLike.isPaused() : false;

            if (isRunning && !isPaused) {
              return { name: record.name, started: false, skipped: true };
            }

            Logger.warn(
              `Worker ${record.name} was registered but not truly running. Restarting to recover from stale state.`
            );
            await WorkerFactory.restart(record.name, persistenceOverride);
            return { name: record.name, started: true, skipped: false };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            Logger.warn(`Auto-start recovery failed for worker ${record.name}: ${message}`);
            return { name: record.name, started: false, skipped: false };
          }
        }

        try {
          await WorkerFactory.startFromPersisted(record.name, persistenceOverride);
          return { name: record.name, started: true, skipped: false };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          Logger.warn(`Auto-start failed for worker ${record.name}: ${message}`);
          return { name: record.name, started: false, skipped: false };
        }
      })
    );

    const startedCount = results.filter((item) => item.started).length;
    const skippedCount = results.filter((item) => item.skipped).length;
    Logger.info('Auto-started persisted workers', {
      total: candidates.length,
      started: startedCount,
      skipped: skippedCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    Logger.warn(`Auto-start persisted workers failed: ${message}`);
  }
}

/**
 * Check if worker management system is initialized
 */
function isInitialized(): boolean {
  return state.initialized;
}

/**
 * Get initialization state
 */
function getInitState(): Readonly<IInitState> {
  return { ...state };
}

/**
 * Graceful shutdown of worker management system
 * (convenience method that delegates to WorkerShutdown)
 */
async function shutdown(): Promise<void> {
  if (!state.initialized) {
    Logger.warn('Worker management system not initialized, nothing to shutdown');
    return;
  }

  await WorkerShutdown.shutdown();
  state.initialized = false;
  state.resourceMonitoring = false;
  state.healthMonitoring = false;
  state.autoScaling = false;
}

// ============================================================================
// Public API (Sealed Namespace)
// ============================================================================

export const WorkerInit = Object.freeze({
  /**
   * Initialize the worker management system
   */
  initialize,

  /**
   * Check if worker management system is initialized
   */
  isInitialized,

  /**
   * Get initialization state
   */
  getInitState,

  /**
   * Graceful shutdown of worker management system
   */
  shutdown,

  /**
   * Start persisted workers after boot completes
   */
  autoStartPersistedWorkers,
});
