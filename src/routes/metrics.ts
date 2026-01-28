/**
 * Metrics Routes
 *
 * Exposes Prometheus metrics when enabled.
 */

import { PrometheusMetrics } from '@/observability/PrometheusMetrics';
import { Env } from '@config/env';
import { type IRouter, Router } from '@core-routes/Router';

export function registerMetricsRoutes(router: IRouter): void {
  if (Env.getBool('METRICS_ENABLED', false) === false) return;

  const pathFromEnv = Env.get('METRICS_PATH', '/metrics').trim();
  const path = pathFromEnv === '' ? '/metrics' : pathFromEnv;

  Router.get(router, path, async (_req, res) => {
    const { contentType, body } = await PrometheusMetrics.getMetricsText();
    res.setHeader('Content-Type', contentType);
    res.send(body);
  });
}

export default registerMetricsRoutes;
