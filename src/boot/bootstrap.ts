/**
 * Application Bootstrap
 * Entry point for running the Zintrust server
 * Sealed namespace for immutability
 */

import { Application } from '@boot/Application';
import { Server } from '@boot/Server';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';

let appInstance: ReturnType<typeof Application.create> | undefined;
let serverInstance: ReturnType<typeof Server.create> | undefined;
let isShuttingDown = false;

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> => {
  if (timeoutMs <= 0) return promise;

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

  const timeoutMs = Number(Env.SHUTDOWN_TIMEOUT);
  Logger.info(`${signal} received, shutting down gracefully...`);

  try {
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
      const port = Env.getInt('PORT', 3000);
      const host = Env.get('HOST', 'localhost');

      // Create and start server
      const server = Server.create(app, port, host);
      serverInstance = server;

      // Start listening
      await server.listen();

      Logger.info(`Server running at http://${host}:${port}`);

      // Start schedules for long-running runtimes (Node.js / Fargate)
      try {
        const runtime = (await import('@/runtime/RuntimeDetector')).RuntimeDetector.detectRuntime();
        if (runtime === 'nodejs' || runtime === 'fargate') {
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
        }
      } catch (err) {
        Logger.warn('Failed to start schedules:', err as Error);
      }
    } catch (error) {
      Logger.error('Failed to bootstrap application:', error as Error);
      ErrorFactory.createTryCatchError('Failed to bootstrap application:', error);
      process.exit(1);
    }
  },

  /**
   * Handle graceful shutdown
   */
  setupShutdownHandler(): void {
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
