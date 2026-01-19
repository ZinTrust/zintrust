/**
 * Worker Management System Initializer
 *
 * Handles initialization and lifecycle management of the worker management system.
 * - Registers shutdown handlers
 * - Initializes monitoring and resource management
 * - Sets up auto-scaling and health checks
 * - Ensures graceful startup and shutdown
 */

import { Logger, workersConfig } from '@zintrust/core';
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
    if (enableResourceMonitoring) {
      if (ResourceMonitor.isRunning() === false) {
        ResourceMonitor.start(resourceMonitoringInterval / 1000);
      }
      state.resourceMonitoring = true;
      Logger.debug('✓ Resource monitoring started');
    }

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
  if (workersConfig.defaultWorker?.autoStart !== true) return;

  try {
    const records = await WorkerFactory.listPersistedRecords();
    const candidates = records.filter((record) => record.autoStart === true);
    const results = await Promise.all(
      candidates.map(async (record) => {
        if (WorkerFactory.get(record.name)) {
          return { name: record.name, started: false, skipped: true };
        }
        try {
          await WorkerFactory.startFromPersisted(record.name);
          return { name: record.name, started: true, skipped: false };
        } catch (error) {
          Logger.warn(`Auto-start failed for worker ${record.name}`, error as Error);
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
    Logger.warn('Auto-start persisted workers failed', error as Error);
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
