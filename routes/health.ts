/**
 * Health Routes
 * Provides health, liveness, and readiness endpoints.
 */

import { appConfig } from '@/config';
import { RuntimeHealthProbes } from '@/health/RuntimeHealthProbes';
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

    let databaseResponseTime: number | null = null;
    let cacheResponseTime: number | null = null;

    try {
      const db = useDatabase();
      await QueryBuilder.ping(db);

      databaseResponseTime = Date.now() - startTime;

      // Only probe KV at runtime when explicitly configured.
      cacheResponseTime = await RuntimeHealthProbes.pingKvCache(2000);

      res.json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        environment,
        dependencies: {
          database: {
            status: 'ready',
            responseTime: databaseResponseTime,
          },
          ...(cacheResponseTime === null
            ? {}
            : {
                cache: {
                  status: 'ready',
                  responseTime: cacheResponseTime,
                },
              }),
        },
      });
    } catch (error) {
      Logger.error('Readiness check failed:', error);

      const isProd = environment === 'production';

      const responseTime = Date.now() - startTime;

      const dependencies: Record<string, unknown> = {
        database: {
          status: databaseResponseTime === null ? 'unavailable' : 'ready',
          responseTime: databaseResponseTime ?? responseTime,
        },
      };

      if (RuntimeHealthProbes.getCacheDriverName() === 'kv') {
        dependencies['cache'] = {
          status: 'unavailable',
          responseTime: cacheResponseTime ?? responseTime,
        };
      }

      res.setStatus(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        environment,
        dependencies,
        error: isProd ? 'Service unavailable' : (error as Error).message,
      });
    }
  });
}
