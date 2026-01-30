/**
 * Worker Shutdown Coordinator
 *
 * Centralized graceful shutdown handling for the worker management system.
 * Coordinates orderly shutdown of all worker modules and the WorkerFactory.
 */

import { Logger } from '@zintrust/core';
import { WorkerFactory } from './WorkerFactory';

// ============================================================================
// Types
// ============================================================================

export interface IShutdownOptions {
  /**
   * Timeout for graceful shutdown in milliseconds
   */
  timeout?: number;

  /**
   * Whether to force exit after timeout
   */
  forceExit?: boolean;

  /**
   * Signal that triggered shutdown (SIGTERM, SIGINT, etc.)
   */
  signal?: string;
}

interface IShutdownState {
  isShuttingDown: boolean;
  completedAt: Date | null;
  startedAt: Date | null;
  reason: string | null;
}

// ============================================================================
// Implementation
// ============================================================================

const state: IShutdownState = {
  isShuttingDown: false,
  completedAt: null,
  startedAt: null,
  reason: null,
};

let shutdownHandlersRegistered = false;

const signalHandlers: {
  sigterm?: () => Promise<void>;
  sighup?: () => Promise<void>;
  uncaughtException?: (error: Error) => Promise<void>;
  unhandledRejection?: (reason: unknown) => void;
} = {};

/**
 * Perform graceful shutdown of all worker modules
 */
async function shutdown(options: IShutdownOptions = {}): Promise<void> {
  const { timeout = 30000, forceExit = true, signal = 'unknown' } = options;

  // Prevent concurrent shutdowns
  if (state.isShuttingDown) {
    Logger.warn('Shutdown already in progress, ignoring duplicate request');
    return;
  }

  state.isShuttingDown = true;
  state.startedAt = new Date();
  state.reason = `Signal: ${signal}`;

  Logger.info('🛑 Initiating graceful shutdown of worker management system', {
    signal,
    timeout,
    forceExit,
  });

  // Setup timeout for forced shutdown
  let timeoutHandle: NodeJS.Timeout | null = null;
  if (forceExit && timeout > 0) {
    // eslint-disable-next-line no-restricted-syntax
    timeoutHandle = setTimeout(() => {
      Logger.error('❌ Graceful shutdown timeout exceeded, forcing exit', { timeout });
      process.exit(1);
    }, timeout);
  }

  try {
    // Shutdown WorkerFactory - this will coordinate shutdown of all modules
    await WorkerFactory.shutdown();

    state.completedAt = new Date();
    const duration = state.completedAt.getTime() - (state.startedAt?.getTime() ?? 0);

    Logger.info('✅ Worker management system shutdown complete', {
      duration: `${duration}ms`,
      signal,
    });

    // Clear timeout if successful
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  } catch (error) {
    Logger.error('❌ Error during worker management system shutdown', error);
    throw error;
  }
}

/**
 * Register process signal handlers for graceful shutdown
 */
function registerShutdownHandlers(): void {
  if (shutdownHandlersRegistered) {
    Logger.debug('Shutdown handlers already registered, skipping');
    return;
  }

  Logger.debug('Registering worker management system shutdown handlers');

  // SIGTERM - graceful shutdown (Docker, systemd, etc.)
  signalHandlers.sigterm = async () => {
    Logger.info('📨 Received SIGTERM signal');
    try {
      await shutdown({ signal: 'SIGTERM', timeout: 30000, forceExit: true });
    } catch (error) {
      Logger.error('Error during SIGTERM shutdown', error);
    }
  };
  process.on('SIGTERM', signalHandlers.sigterm);

  // SIGINT - user interrupt (Ctrl+C) - REMOVED: handled by bootstrap.ts to prevent race condition
  // process.on('SIGINT', async () => {
  //   Logger.info('📨 Received SIGINT signal');
  //   try {
  //     await shutdown({ signal: 'SIGINT', timeout: 30000, forceExit: true });
  //   } catch (error) {
  //     Logger.error('Error during SIGINT shutdown', error);
  //   }
  // });

  // SIGHUP - terminal closed
  signalHandlers.sighup = async () => {
    Logger.info('📨 Received SIGHUP signal');
    try {
      await shutdown({ signal: 'SIGHUP', timeout: 30000, forceExit: true });
    } catch (error) {
      Logger.error('Error during SIGHUP shutdown', error);
    }
  };
  process.on('SIGHUP', signalHandlers.sighup);

  // Handle uncaught errors during shutdown
  signalHandlers.uncaughtException = async (error: Error) => {
    Logger.error('💥 Uncaught exception during worker operations', error);
    try {
      await shutdown({ signal: 'uncaughtException', timeout: 10000, forceExit: true });
    } catch {
      // Ignore errors during emergency shutdown
    }
    process.exit(1);
  };
  process.on('uncaughtException', signalHandlers.uncaughtException);

  signalHandlers.unhandledRejection = (reason: unknown) => {
    // Only log the error - don't shut down the entire application
    Logger.error('💥 Unhandled promise rejection detected', reason);
    Logger.warn('⚠️  This error has been logged but will not shut down the server');
    Logger.warn('⚠️  Check the error context and fix the underlying issue');
  };
  process.on('unhandledRejection', signalHandlers.unhandledRejection);

  shutdownHandlersRegistered = true;
  Logger.debug('Worker management system shutdown handlers registered');
}

/**
 * Unregister process signal handlers (for hot reload/testing)
 */
function unregisterShutdownHandlers(): void {
  if (!shutdownHandlersRegistered) return;

  if (signalHandlers.sigterm) process.off('SIGTERM', signalHandlers.sigterm);
  if (signalHandlers.sighup) process.off('SIGHUP', signalHandlers.sighup);
  if (signalHandlers.uncaughtException)
    process.off('uncaughtException', signalHandlers.uncaughtException);
  if (signalHandlers.unhandledRejection)
    process.off('unhandledRejection', signalHandlers.unhandledRejection);

  signalHandlers.sigterm = undefined;
  signalHandlers.sighup = undefined;
  signalHandlers.uncaughtException = undefined;
  signalHandlers.unhandledRejection = undefined;

  shutdownHandlersRegistered = false;
  Logger.debug('Worker management system shutdown handlers unregistered');
}

/**
 * Check if system is currently shutting down
 */
function isShuttingDown(): boolean {
  return state.isShuttingDown;
}

/**
 * Get current shutdown state
 */
function getShutdownState(): Readonly<IShutdownState> {
  return { ...state };
}

// ============================================================================
// Public API (Sealed Namespace)
// ============================================================================

export const WorkerShutdown = Object.freeze({
  /**
   * Perform graceful shutdown of all worker modules
   */
  shutdown,

  /**
   * Register process signal handlers for graceful shutdown
   */
  registerShutdownHandlers,

  /**
   * Unregister process signal handlers (for hot reload/testing)
   */
  unregisterShutdownHandlers,

  /**
   * Check if system is currently shutting down
   */
  isShuttingDown,

  /**
   * Get current shutdown state
   */
  getShutdownState,
});
