/**
 * Application Bootstrap
 * Entry point for running the ZinTrust server
 * Sealed namespace for immutability
 */

import { Application } from '@boot/Application';
import { Server } from '@boot/Server';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
// Register plugins (adapters, drivers, etc.)
// import '@/zintrust.plugins';

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
    const { RuntimeDetector } = await import('@runtime/RuntimeDetector');
    const runtime = RuntimeDetector.detectRuntime();
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

        // Gracefully shutdown worker system
        try {
          const { WorkerShutdown } = await import('@zintrust/workers');
          await WorkerShutdown.shutdown({ signal, timeout: 5000, forceExit: false });
        } catch {
          // Worker package might not be installed or fails to load
        }
      })(),
      timeoutMs,
      'Graceful shutdown timed out'
    );

    globalThis.clearTimeout(forceExitTimer);

    process.exit(0);
  } catch (error: unknown) {
    Logger.error('Graceful shutdown failed:', error as Error);
    process.exit(1);
  }
};

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
      const app = Application.create();
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
