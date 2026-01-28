/**
 * Core Routes - Framework built-in routes
 * Health, metrics, and documentation endpoints
 * Not customizable by developers; provide env-based configuration
 */

import type { IResponse } from '@/http/Response';
import { PrometheusMetrics } from '@/observability/PrometheusMetrics';
import { registerDocRoutes } from '@/routes/doc';
import { registerErrorRoutes } from '@/routes/error';
import { registerErrorPagesRoutes } from '@/routes/errorPages';
import type { IRouter } from '@/routes/Router';
import { Router } from '@/routes/Router';
import { registerHealthRoutes } from '@common/HealthRoutes';
import { Env } from '@config/env';
import type { IRequest } from '@http/Request';

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
