/**
 * test-app - Zintrust Application Entry Point
 */

import { Application, Env, Logger, Server } from '@zintrust/core';
import process from '@zintrust/core/node';

type AppInstance = ReturnType<typeof Application.create>;
type ServerInstance = ReturnType<typeof Server.create>;

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage = 'Shutdown timed out'): Promise<T> {
  if (ms <= 0) return promise;

  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new globalThis.Error(timeoutMessage)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

async function stopServices(server: ServerInstance, app: AppInstance): Promise<void> {
  await server.close();
  await app.shutdown();
}

async function shutdownGracefully(signal: string, server: ServerInstance, app: AppInstance): Promise<void> {
  Logger.info(`${signal} received, shutting down gracefully...`);

  const timeoutMs = Env.getInt('SHUTDOWN_TIMEOUT', 10000);

  try {
    await withTimeout(stopServices(server, app), timeoutMs);
    process.exit(0);
  } catch (error) {
    Logger.error('Graceful shutdown failed:', error);
    process.exit(1);
  }
}

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

    process.on('SIGTERM', () => void shutdownGracefully('SIGTERM', server, app));
    process.on('SIGINT', () => void shutdownGracefully('SIGINT', server, app));
  } catch (error) {
    Logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Run start
await start();
