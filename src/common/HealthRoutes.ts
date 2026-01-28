/**
 * Shared Health Route Handlers
 * Extracted to eliminate duplication between CoreRoutes.ts and routes/health.ts
 */

import { appConfig } from '@/config/app';
import { RuntimeHealthProbes } from '@/health/RuntimeHealthProbes';
import type { IRequest } from '@/http/Request';
import type { IResponse } from '@/http/Response';
import { HealthUtils } from '@common/ExternalServiceUtils';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import type { IRouter } from '@core-routes/Router';
import { Router } from '@core-routes/Router';
import { useDatabase } from '@orm/Database';
import { QueryBuilder } from '@orm/QueryBuilder';

/**
 * Health check endpoint handler
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

    const uptime = HealthUtils.getUptime();

    res.json(
      HealthUtils.buildHealthResponse('healthy', environment, {
        uptime,
        database: 'connected',
      })
    );
  } catch (error) {
    Logger.error('Health check failed:', error);

    res.setStatus(503).json(
      HealthUtils.buildErrorResponse('unhealthy', environment, error as Error, {
        database: 'disconnected',
      })
    );
  }
}

/**
 * Liveness probe endpoint handler
 */
function handleHealthLiveRoute(_req: IRequest, res: IResponse): void {
  const uptime = HealthUtils.getUptime();

  res.json(
    HealthUtils.buildHealthResponse('alive', Env.NODE_ENV ?? 'development', {
      uptime,
    })
  );
}

/**
 * Readiness probe endpoint handler
 */
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

    res.json(
      HealthUtils.buildHealthResponse('ready', environment, {
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
      })
    );
  } catch (error) {
    Logger.error('Readiness check failed:', error);

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

    res.setStatus(503).json(
      HealthUtils.buildErrorResponse('not_ready', environment, error as Error, {
        dependencies,
      })
    );
  }
}

/**
 * Register all health routes
 */
export const registerHealthRoutes = (router: IRouter): void => {
  Router.get(router, '/health', handleHealthRoute);
  Router.get(router, '/health/live', handleHealthLiveRoute);
  Router.get(router, '/health/ready', handleHealthReadyRoute);
};
