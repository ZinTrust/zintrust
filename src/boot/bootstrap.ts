/**
 * Application Bootstrap
 * Entry point for running the ZinTrust server
 * Sealed namespace for immutability
 */

import { Application } from '@boot/Application';
import { Server } from '@boot/Server';
import { appConfig } from '@config/app';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';

let appInstance: ReturnType<typeof Application.create> | undefined;
let serverInstance: ReturnType<typeof Server.create> | undefined;
let isShuttingDown = false;
let shutdownHandlersRegistered = false;

const logBootstrapErrorDetails = (error: unknown): void => {
  // Best-effort: surface startup config validation details (already redacted)
  // so container runs show which env vars are missing/misconfigured.
  try {
    const details = (error as { details?: unknown } | undefined)?.details as
      | { errors?: unknown }
      | undefined;
    if (details?.errors !== undefined) {
      Logger.error('Startup configuration errors:', details.errors);
    }
  } catch {
    // best-effort logging
  }

  // Best-effort: surface startup health-check report details.
  try {
    const details = (error as { details?: unknown } | undefined)?.details as
      | { report?: unknown }
      | undefined;
    if (details?.report !== undefined) {
      Logger.error('Startup health report:', details.report);
    }
  } catch {
    // best-effort logging
  }
};

const startSchedulesIfNeeded = async (
  app: ReturnType<typeof Application.create>
): Promise<void> => {
  try {
    const runtime = appConfig.detectRuntime();
    if (runtime !== 'nodejs' && runtime !== 'fargate') return;
    const { create: createScheduleRunner } = await import('@/scheduler/ScheduleRunner');
    const schedules = await import('@/schedules');
    const runner = createScheduleRunner();

    for (const schedule of Object.values(schedules)) {
      // Each schedule is expected to export a default ISchedule
      // @ts-ignore
      runner.register(schedule);
    }

    runner.start();

    // Add shutdown hook to stop schedules gracefully
    const shutdownManager = app.getContainer().get('shutdownManager');
    if (
      (typeof shutdownManager === 'object' || typeof shutdownManager === 'function') &&
      shutdownManager !== null &&
      'add' in shutdownManager &&
      typeof (shutdownManager as { add?: unknown }).add === 'function'
    ) {
      (shutdownManager as { add: (fn: () => Promise<void> | void) => void }).add(async () => {
        const scheduleTimeoutMs = Env.getInt('SCHEDULE_SHUTDOWN_TIMEOUT_MS', 30000);
        await runner.stop(scheduleTimeoutMs);
      });
    }
  } catch (err) {
    Logger.warn('Failed to start schedules:', err as Error);
  }
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = globalThis.setTimeout(() => {
        reject(ErrorFactory.createGeneralError(label, { timeoutMs }));
      }, timeoutMs);
    });

    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
  }
};

const gracefulShutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  const timeoutMs = Env.getInt('SHUTDOWN_TIMEOUT', 1500);
  const forceExitMs = Env.getInt('SHUTDOWN_FORCE_EXIT_MS', 2500);
  Logger.info(`${signal} received, shutting down gracefully...`);

  try {
    const forceExitTimer = globalThis.setTimeout(() => {
      process.exit(0);
    }, forceExitMs);

    // Best-effort: don't keep the process alive just for this timer
    (forceExitTimer as unknown as { unref?: () => void }).unref?.();

    await withTimeout(
      (async () => {
        if (serverInstance !== undefined) {
          await serverInstance.close();
        }

        if (appInstance !== undefined) {
          await appInstance.shutdown();
        }
      })(),
      timeoutMs,
      'Graceful shutdown timed out'
    );

    // Shutdown worker management system first
    if (appConfig.detectRuntime() === 'nodejs' || appConfig.detectRuntime() === 'lambda') {
      try {
        const { WorkerShutdown } = await import('@zintrust/workers');
        await withTimeout(
          WorkerShutdown.shutdown({ signal, timeout: 30000, forceExit: false }),
          timeoutMs,
          'Worker shutdown timed out'
        );
        Logger.info('Worker management system shutdown complete');
      } catch (error) {
        Logger.warn('Worker shutdown failed (continuing with app shutdown)', error as Error);
      }
    }

    globalThis.clearTimeout(forceExitTimer);

    process.exit(0);
  } catch (error: unknown) {
    Logger.error('Graceful shutdown failed:', error as Error);
    process.exit(1);
  }
};

async function useWorkerStarter(): Promise<void> {
  // Initialize worker management system
  let workerInit: { autoStartPersistedWorkers?: () => Promise<void> } | null = null;
  try {
    const { WorkerInit } = await import('@zintrust/workers');
    workerInit = WorkerInit;
    await WorkerInit.initialize({
      enableResourceMonitoring: true,
      enableHealthMonitoring: true,
      enableAutoScaling: false, // Disabled by default, enable via config
      registerShutdownHandlers: true,
      resourceMonitoringInterval: 60000,
    });
    Logger.info('Worker management system initialized');
  } catch (error) {
    Logger.warn('Worker management system initialization failed (non-fatal)', error as Error);
    // Non-fatal - application can still run without worker management
  }
  if (workerInit?.autoStartPersistedWorkers) {
    await workerInit.autoStartPersistedWorkers();
  }
}
/**
 * Bootstrap implementation
 */
const BootstrapFunctions = Object.freeze({
  /**
   * Bootstrap and start the server
   */
  async start(): Promise<void> {
    try {
      // Create application instance
      // if (Env.ZINTRUST_PROJECT_ROOT) {
      // }
      const app = Application.create(Env.ZINTRUST_PROJECT_ROOT || undefined);
      appInstance = app;

      // Boot application
      await app.boot();

      // Get port and host from environment
      const port = Env.getInt('PORT', 7777);
      const host = Env.get('HOST', 'localhost');

      // Create and start server
      const server = Server.create(app, port, host);
      serverInstance = server;

      // Start listening
      await server.listen();

      Logger.info(`Server running at http://${host}:${port}`);
      Logger.info(`ZinTrust documentation at http://${host}:${port}/doc`);

      // Start schedules for long-running runtimes (Node.js / Fargate)
      await startSchedulesIfNeeded(app);

      if (appConfig.detectRuntime() === 'nodejs' || appConfig.detectRuntime() === 'lambda') {
        await useWorkerStarter();
      }
    } catch (error) {
      Logger.error('Failed to bootstrap application:', error as Error);

      logBootstrapErrorDetails(error);

      process.exit(1);
    }
  },

  /**
   * Handle graceful shutdown
   */
  setupShutdownHandler(): void {
    if (shutdownHandlersRegistered) return;
    shutdownHandlersRegistered = true;

    process.on('SIGTERM', async () => {
      await gracefulShutdown('SIGTERM');
    });

    process.on('SIGINT', async () => {
      await gracefulShutdown('SIGINT');
    });
  },
});

// Run bootstrap
await BootstrapFunctions.start().catch((error) => {
  try {
    Logger.error('Failed to bootstrap application:', error as Error);
  } catch {
    // best-effort logging
  }

  process.exit(1);
});

// Handle graceful shutdown
BootstrapFunctions.setupShutdownHandler();
