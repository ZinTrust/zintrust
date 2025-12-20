/**
 * Application Bootstrap
 * Entry point for running the Zintrust server
 */

import { Application } from '@/Application';
import { Server } from '@/Server';
import { Env } from '@config/env';
import { Logger } from '@config/logger';

/**
 * Bootstrap and start the server
 */
async function bootstrap(): Promise<void> {
  try {
    // Create application instance
    const app = new Application(process.cwd());

    // Get port and host from environment
    const port = Env.PORT;
    const host = Env.HOST;

    // Create and start server
    const server = new Server(app, port, host);

    // Start listening
    await server.listen();

    Logger.info(`Server running at http://${host}:${port}`);
    Logger.info(`Environment: ${Env.NODE_ENV}`);
    Logger.info(`Database: ${Env.DB_CONNECTION}`);
  } catch (error) {
    Logger.error('Failed to bootstrap application:', error);
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

// Start application
await bootstrap().catch((error) => {
  Logger.fatal('Fatal error:', error);
  process.exit(1);
});
