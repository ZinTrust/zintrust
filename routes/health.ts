/**
 * Health Routes
 * Provides health, liveness, and readiness endpoints.
 */

import { appConfig } from '@/config';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { useDatabase } from '@orm/Database';
import { QueryBuilder } from '@orm/QueryBuilder';
import { type IRouter, Router } from '@routing/Router';

export function registerHealthRoutes(router: IRouter): void {
  registerHealthRoute(router);
  registerHealthLiveRoute(router);
  registerHealthReadyRoute(router);
}

function registerHealthRoute(router: IRouter): void {
  Router.get(router, '/health', async (_req, res) => {
    const environment = Env.NODE_ENV ?? 'development';

    try {
      const db = useDatabase();
      await QueryBuilder.ping(db);

      const uptime =
        typeof process !== 'undefined' && typeof process.uptime === 'function'
          ? process.uptime()
          : 0;

      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime,
        database: 'connected',
        environment,
      });
    } catch (error) {
      Logger.error('Health check failed:', error);

      const isProd = environment === 'production' || environment === 'prod';

      res.setStatus(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: isProd ? 'Service unavailable' : (error as Error).message,
      });
    }
  });
}

function registerHealthLiveRoute(router: IRouter): void {
  Router.get(router, '/health/live', async (_req, res) => {
    const uptime =
      typeof process !== 'undefined' && typeof process.uptime === 'function' ? process.uptime() : 0;

    res.json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime,
    });
  });
}

function registerHealthReadyRoute(router: IRouter): void {
  Router.get(router, '/health/ready', async (_req, res) => {
    const startTime = Date.now();
    const environment = appConfig.environment;

    try {
      const db = useDatabase();
      await QueryBuilder.ping(db);

      const responseTime = Date.now() - startTime;

      res.json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        environment,
        dependencies: {
          database: {
            status: 'ready',
            responseTime,
          },
        },
      });
    } catch (error) {
      Logger.error('Readiness check failed:', error);

      const isProd = environment === 'production';

      const responseTime = Date.now() - startTime;

      res.setStatus(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        environment,
        dependencies: {
          database: {
            status: 'unavailable',
            responseTime,
          },
        },
        error: isProd ? 'Service unavailable' : (error as Error).message,
      });
    }
  });
}
