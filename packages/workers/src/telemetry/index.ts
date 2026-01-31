import type { IRequest, IResponse, IRouter, RouteOptions } from '@zintrust/core';
import { Router } from '@zintrust/core';
import type { TelemetrySettings } from './api/TelemetryAPI';
import { createSnapshotBuilder } from './api/TelemetryAPI';
import { teleStream } from './api/TelemetryMonitoringService';
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

export const TelemetryDashboard = Object.freeze({
  create(config: TelemetryDashboardConfig): TelemetryDashboardApi {
    const settings = buildSettings(config);
    const buildSnapshot = createSnapshotBuilder();
    const registerRoutes = createRouteRegistrar(settings, buildSnapshot);

    return Object.freeze({ registerRoutes });
  },
});

function buildSettings(config: TelemetryDashboardConfig): TelemetrySettings {
  return {
    enabled: config.enabled ?? DEFAULTS.enabled,
    basePath: config.basePath ?? DEFAULTS.basePath,
    middleware: config.middleware ?? [],
    autoRefresh: config.autoRefresh ?? DEFAULTS.autoRefresh,
    refreshIntervalMs:
      typeof config.refreshIntervalMs === 'number' && Number.isFinite(config.refreshIntervalMs)
        ? Math.max(1000, Math.floor(config.refreshIntervalMs))
        : DEFAULTS.refreshIntervalMs,
  };
}

function createRouteRegistrar(
  settings: TelemetrySettings,
  buildSnapshot: ReturnType<typeof createSnapshotBuilder>
) {
  return (router: IRouter): void => {
    if (!settings.enabled) return;

    const routeOptions: RouteOptions = (
      settings.middleware.length > 0 ? { middleware: settings.middleware } : undefined
    ) as RouteOptions;

    registerDashboardRoute(router, settings, routeOptions);
    registerSummaryApi(router, settings, routeOptions, buildSnapshot);
    registerEventsApi(router, settings, routeOptions, buildSnapshot);
  };
}

function registerDashboardRoute(
  router: IRouter,
  settings: TelemetrySettings,
  routeOptions: RouteOptions
): void {
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
}

function registerSummaryApi(
  router: IRouter,
  settings: { basePath: string },
  routeOptions: RouteOptions,
  buildSnapshot: ReturnType<typeof createSnapshotBuilder>
): void {
  Router.get(
    router,
    `${settings.basePath}/api/summary`,
    async (_req, res) => {
      const snapshot = await buildSnapshot();
      res.json(snapshot);
    },
    routeOptions
  );
}

function registerEventsApi(
  router: IRouter,
  settings: TelemetrySettings,
  routeOptions: RouteOptions,
  buildSnapshot: ReturnType<typeof createSnapshotBuilder>
): void {
  Router.get(
    router,
    `${settings.basePath}/api/events`,
    async (_req: IRequest, res: IResponse) => {
      teleStream(res, settings, buildSnapshot);
    },
    routeOptions
  );
}

export default TelemetryDashboard;
