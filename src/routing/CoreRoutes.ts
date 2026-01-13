/**
 * Core Routes - Framework built-in routes
 * Health, metrics, and documentation endpoints
 * Not customizable by developers; provide env-based configuration
 */

import { RuntimeHealthProbes } from '@/health/RuntimeHealthProbes';
import type { IRequest } from '@/http/Request';
import type { IResponse } from '@/http/Response';
import { PrometheusMetrics } from '@/observability/PrometheusMetrics';
import { appConfig } from '@config/app';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { useDatabase } from '@orm/Database';
import { QueryBuilder } from '@orm/QueryBuilder';
import { registerDocRoutes } from '@routing/doc';
import { registerErrorRoutes } from '@routing/error';
import { registerErrorPagesRoutes } from '@routing/errorPages';
import type { IRouter } from '@routing/Router';
import { Router } from '@routing/Router';

/**
 * Register health endpoints
 */
async function handleHealthRoute(_req: IRequest, res: IResponse): Promise<void> {
  const environment = Env.NODE_ENV ?? 'development';

  try {
    const db = useDatabase();
    const maybeIsConnected = (db as unknown as { isConnected?: unknown }).isConnected;
    const maybeConnect = (db as unknown as { connect?: unknown }).connect;
    if (typeof maybeIsConnected === 'function' && maybeIsConnected.call(db) === false) {
      if (typeof maybeConnect === 'function') {
        await maybeConnect.call(db);
      }
    }
    await QueryBuilder.ping(db);

    const uptime =
      typeof process !== 'undefined' && typeof process.uptime === 'function' ? process.uptime() : 0;

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
}

function handleHealthLiveRoute(_req: IRequest, res: IResponse): void {
  const uptime =
    typeof process !== 'undefined' && typeof process.uptime === 'function' ? process.uptime() : 0;

  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime,
  });
}

async function handleHealthReadyRoute(_req: IRequest, res: IResponse): Promise<void> {
  const startTime = Date.now();
  const environment = appConfig.environment;

  let databaseResponseTime: number | null = null;
  let cacheResponseTime: number | null = null;

  try {
    const db = useDatabase();
    const maybeIsConnected = (db as unknown as { isConnected?: unknown }).isConnected;
    const maybeConnect = (db as unknown as { connect?: unknown }).connect;
    if (typeof maybeIsConnected === 'function' && maybeIsConnected.call(db) === false) {
      if (typeof maybeConnect === 'function') {
        await maybeConnect.call(db);
      }
    }
    await QueryBuilder.ping(db);

    databaseResponseTime = Date.now() - startTime;

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
}

function registerHealthRoutes(router: IRouter): void {
  Router.get(router, '/health', handleHealthRoute);
  Router.get(router, '/health/live', handleHealthLiveRoute);
  Router.get(router, '/health/ready', handleHealthReadyRoute);
}

/**
 * Register metrics endpoint
 */
const registerMetricsRoutes = (router: IRouter): void => {
  if (Env.getBool('METRICS_ENABLED', false) === false) return;

  const pathFromEnv = Env.get('METRICS_PATH', '/metrics').trim();
  const metricsPath = pathFromEnv === '' ? '/metrics' : pathFromEnv;

  Router.get(router, metricsPath, async (_req: IRequest, res: IResponse) => {
    const { contentType, body } = await PrometheusMetrics.getMetricsText();
    res.setHeader('Content-Type', contentType);
    res.send(body);
  });
};

/**
 * Register all core framework routes
 */
export const registerCoreRoutes = (router: IRouter): void => {
  registerHealthRoutes(router);
  registerMetricsRoutes(router);
  registerDocRoutes(router);
  registerErrorPagesRoutes(router);
  registerErrorRoutes(router);
};

export default registerCoreRoutes;
