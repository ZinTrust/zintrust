/**
 * {{projectName}} - Zintrust Application Entry Point
 */

import { Application, Server } from '@zintrust/core';
import { Env } from '@config/env';
import { Logger } from '@config/logger';

/**
 * Start the application
 */
async function start() {
  try {
    // Create application instance
    const app = Application.create();

    // Boot application
    await app.boot();

    // Get port and host from environment
    const port = Env.getInt('APP_PORT', 3000);
    const host = Env.get('HOST', 'localhost');

    // Create and start server
    const server = Server.create(app, port, host);

    // Start listening
    await server.listen();

    Logger.info(`Server running at http://${host}:${port}`);

    const shutdown = async (signal: string): Promise<void> => {
      Logger.info(`${signal} received, shutting down gracefully...`);

      const timeoutMs = Env.getInt('SHUTDOWN_TIMEOUT', 10000);
      const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
        if (ms <= 0) return promise;
        return new Promise<T>((resolve, reject) => {
          const timer = setTimeout(() => reject(new globalThis.Error('Shutdown timed out')), ms);
          promise
            .then((value) => {
              clearTimeout(timer);
              resolve(value);
            })
            .catch((err) => {
              clearTimeout(timer);
              reject(err);
            });
        });
      };

      try {
        await withTimeout(
          (async () => {
            await server.close();
            await app.shutdown();
          })(),
          timeoutMs
        );
        process.exit(0);
      } catch (error) {
        Logger.error('Graceful shutdown failed:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
  } catch (error) {
    Logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Run start
await start();
