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
  } catch (error) {
    Logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  Logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  Logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Run start
await start();
