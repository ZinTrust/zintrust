import { Logger, Router, type IRouter } from '@zintrust/core';
import { TelemetryAPI } from './api/TelemetryAPI';
import { getDashboardHtml } from './routes/dashboard';

export type TelemetryDashboardConfig = {
  enabled?: boolean;
  basePath?: string;
  middleware?: ReadonlyArray<string>;
  autoRefresh?: boolean;
  refreshIntervalMs?: number;
};

const DEFAULTS = {
  enabled: true,
  basePath: '/telemetry',
  autoRefresh: true,
  refreshIntervalMs: 10000,
};

export type TelemetryDashboardApi = {
  registerRoutes: (router: IRouter) => void;
};

type ResourceCurrentResponse = { ok: boolean; usage?: unknown };

const isOkWithUsage = (value: ResourceCurrentResponse): value is ResourceCurrentResponse =>
  value.ok === true && 'usage' in value;

export const TelemetryDashboard = Object.freeze({
  create(config: TelemetryDashboardConfig): TelemetryDashboardApi {
    const settings = {
      enabled: config.enabled ?? DEFAULTS.enabled,
      basePath: config.basePath ?? DEFAULTS.basePath,
      middleware: config.middleware ?? [],
      autoRefresh: config.autoRefresh ?? DEFAULTS.autoRefresh,
      refreshIntervalMs:
        typeof config.refreshIntervalMs === 'number' && Number.isFinite(config.refreshIntervalMs)
          ? Math.max(1000, Math.floor(config.refreshIntervalMs))
          : DEFAULTS.refreshIntervalMs,
    };

    const registerRoutes = (router: IRouter): void => {
      if (!settings.enabled) return;

      const routeOptions =
        settings.middleware.length > 0 ? { middleware: settings.middleware } : undefined;

      Router.get(
        router,
        settings.basePath,
        (_req, res) => {
          res.html(
            getDashboardHtml({
              basePath: settings.basePath,
              autoRefresh: settings.autoRefresh,
              refreshIntervalMs: settings.refreshIntervalMs,
            })
          );
        },
        routeOptions
      );

      Router.get(
        router,
        `${settings.basePath}/api/summary`,
        async (_req, res) => {
          const [systemSummaryResult, resourceCurrentResult] = await Promise.allSettled([
            TelemetryAPI.getSystemSummary(),
            TelemetryAPI.getResourceCurrent(),
          ]);

          if (systemSummaryResult.status === 'rejected') {
            Logger.error('Telemetry dashboard summary failed', systemSummaryResult.reason);
          }

          if (resourceCurrentResult.status === 'rejected') {
            Logger.error('Telemetry resource summary failed', resourceCurrentResult.reason);
          }

          const systemSummary =
            systemSummaryResult.status === 'fulfilled' ? systemSummaryResult.value : { ok: false };
          const resourceCurrent =
            resourceCurrentResult.status === 'fulfilled'
              ? resourceCurrentResult.value
              : ({ ok: false } as ResourceCurrentResponse);

          res.json({
            ok: systemSummary.ok ?? false,
            summary: systemSummary.ok ? (systemSummary.summary ?? {}) : {},
            resources: isOkWithUsage(resourceCurrent) ? resourceCurrent.usage : null,
            cost: null,
          });
        },
        routeOptions
      );
    };

    return Object.freeze({ registerRoutes });
  },
});

export default TelemetryDashboard;
