/**
 * Application Bootstrap
 * Entry point for running the Zintrust server
 * Sealed namespace for immutability
 */

import { Application } from '@/Application';
import { Server } from '@/Server';
import { Env } from '@config/env';
import { Logger } from '@config/logger';

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

      // Boot application
      await app.boot();

      // Get port and host from environment
      const port = Env.getInt('PORT', 3000);
      const host = Env.get('HOST', 'localhost');

      // Create and start server
      const server = Server.create(app, port, host);

      // Start listening
      await server.listen();

      Logger.info(`Server running at http://${host}:${port}`);
    } catch (error) {
      Logger.error('Failed to bootstrap application:', error);
      process.exit(1);
    }
  },

  /**
   * Handle graceful shutdown
   */
  setupShutdownHandler(): void {
    process.on('SIGTERM', () => {
      Logger.info('SIGTERM received, shutting down gracefully...');
      process.exit(0);
    });
  },
});

// Run bootstrap
await BootstrapFunctions.start();

// Handle graceful shutdown
BootstrapFunctions.setupShutdownHandler();
