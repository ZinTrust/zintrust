import { Logger, Router, type IRequest, type IResponse, type IRouter } from '@zintrust/core';
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
type SystemSummaryResponse = { ok: boolean; summary?: unknown };

const isOkWithUsage = (value: ResourceCurrentResponse): value is ResourceCurrentResponse =>
  value.ok === true && 'usage' in value;

const isOkWithSummary = (value: SystemSummaryResponse): value is SystemSummaryResponse =>
  value.ok === true && 'summary' in value;

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

    const buildSnapshot = async (): Promise<{
      ok: boolean;
      summary: unknown;
      resources: unknown;
      cost: unknown;
    }> => {
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

      const systemSummary: SystemSummaryResponse =
        systemSummaryResult.status === 'fulfilled' ? systemSummaryResult.value : { ok: false };
      const resourceCurrent =
        resourceCurrentResult.status === 'fulfilled'
          ? resourceCurrentResult.value
          : ({ ok: false } as ResourceCurrentResponse);

      return {
        ok: systemSummary.ok ?? false,
        summary: isOkWithSummary(systemSummary) ? systemSummary.summary : {},
        resources: isOkWithUsage(resourceCurrent) ? resourceCurrent.usage : null,
        cost: null,
      };
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
          const snapshot = await buildSnapshot();
          res.json(snapshot);
        },
        routeOptions
      );

      Router.get(
        router,
        `${settings.basePath}/api/events`,
        async (_req: IRequest, res: IResponse) => {
          const raw = res.getRaw();

          raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          });

          let closed = false;

          const send = async (payload: unknown) => {
            try {
              raw.write(`data: ${JSON.stringify(payload)}\n\n`);
            } catch (err) {
              Logger.error('Telemetry SSE send failed', err);
            }
          };

          await send({ type: 'hello', ts: new Date().toISOString() });

          const interval = setInterval(async () => {
            try {
              const snapshot = await buildSnapshot();
              await send({ type: 'snapshot', ts: new Date().toISOString(), ...snapshot });
            } catch (err) {
              await send({
                type: 'error',
                ts: new Date().toISOString(),
                message: (err as Error).message,
              });
            }
          }, settings.refreshIntervalMs);

          const hb = setInterval(() => {
            if (!closed) raw.write(': ping\n\n');
          }, 15000);

          raw.on('close', () => {
            closed = true;
            clearInterval(interval);
            clearInterval(hb);
          });
        },
        routeOptions
      );
    };

    return Object.freeze({ registerRoutes });
  },
});

export default TelemetryDashboard;
