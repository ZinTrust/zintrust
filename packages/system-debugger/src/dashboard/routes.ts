/**
 * Dashboard route registrar for @zintrust/system-debugger.
 * Mounts the SPA + all REST API endpoints under the configured basePath.
 * Auth is NOT applied here — callers add middleware via routeOptions.
 */
import type { IRouter, RouteOptions } from '@zintrust/core';
import { Router } from '@zintrust/core';
import type { IDebuggerStorage } from '../types';
import {
  addMonitoring,
  clearEntries,
  getBatch,
  getEntry,
  getMonitoring,
  getStats,
  listEntries,
  removeMonitoring,
  setHandlerStorage,
} from './handlers';
import { buildDashboardHtml } from './ui';

export type DebuggerDashboardOptions = {
  /** Base path for the dashboard, e.g. '/debugger'. Defaults to '/debugger'. */
  basePath?: string;
  /** Optional ZinTrust middleware names to apply to all routes. */
  middleware?: ReadonlyArray<string>;
};

export const registerDebuggerRoutes = (
  router: IRouter,
  storage: IDebuggerStorage,
  options: DebuggerDashboardOptions = {}
): void => {
  setHandlerStorage(storage);

  const base = options.basePath ?? '/debugger';
  const routeOptions: RouteOptions | undefined =
    (options.middleware?.length ?? 0) > 0
      ? ({ middleware: options.middleware } as RouteOptions)
      : undefined;

  // SPA shell
  Router.get(
    router,
    base,
    (_req, res) => {
      res.html(buildDashboardHtml(base));
    },
    routeOptions
  );
  // Serve the SPA for any /<basePath>/* sub-path (client-side routing)
  Router.get(
    router,
    `${base}/*`,
    (_req, res) => {
      res.html(buildDashboardHtml(base));
    },
    routeOptions
  );

  // REST API
  Router.group(router, `${base}/api`, (r: IRouter) => {
    Router.get(r, '/entries', listEntries, routeOptions);
    Router.get(r, '/entries/:uuid', getEntry, routeOptions);
    Router.del(r, '/entries', clearEntries, routeOptions);
    Router.get(r, '/batch/:batchId', getBatch, routeOptions);
    Router.get(r, '/stats', getStats, routeOptions);
    Router.get(r, '/monitoring', getMonitoring, routeOptions);
    Router.post(r, '/monitoring/:tag', addMonitoring, routeOptions);
    Router.del(r, '/monitoring/:tag', removeMonitoring, routeOptions);
  });
};
