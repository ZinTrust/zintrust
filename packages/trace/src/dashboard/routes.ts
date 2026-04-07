/**
 * Dashboard route registrar for @zintrust/trace.
 * Mounts the SPA + all REST API endpoints under the configured basePath.
 * Auth is NOT applied here — callers add middleware via routeOptions.
 */
import { appConfig, Router, useDatabase, type IRouter, type RouteOptions } from '@zintrust/core';
import { TraceConfig } from '../config';
import { TraceStorage } from '../storage';
import type { ITraceStorage } from '../types';
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

export type TraceDashboardOptions = {
  /** Base path for the dashboard, e.g. '/trace'. Defaults to '/trace'. */
  basePath?: string;
  /** Optional ZinTrust middleware names to apply to all routes. */
  middleware?: ReadonlyArray<string>;
};

export type TraceDashboardRegistrationOptions = TraceDashboardOptions & {
  /** Optional trace storage connection override. Defaults to TraceConfig / runtime default. */
  connectionName?: string;
};

const resolveDashboardConnectionName = (connectionName?: string): string | undefined => {
  const explicitConnection = connectionName?.trim();
  if (explicitConnection !== undefined && explicitConnection !== '') {
    return explicitConnection;
  }

  const configuredConnection = TraceConfig.merge().connection?.trim();
  return configuredConnection === undefined || configuredConnection === ''
    ? undefined
    : configuredConnection;
};

export const registerTraceRoutes = (
  router: IRouter,
  storage: ITraceStorage,
  options: TraceDashboardOptions = {}
): void => {
  setHandlerStorage(storage);

  const base = options.basePath ?? '/trace';
  const routeOptions: RouteOptions | undefined =
    (options.middleware?.length ?? 0) > 0
      ? ({ middleware: options.middleware } as RouteOptions)
      : undefined;

  // SPA shell
  Router.get(
    router,
    base,
    (_req, res) => {
      res.html(buildDashboardHtml(base, appConfig.name));
    },
    routeOptions
  );
  // Serve the SPA for any /<basePath>/* sub-path (client-side routing)
  Router.get(
    router,
    `${base}/*`,
    (_req, res) => {
      res.html(buildDashboardHtml(base, appConfig.name));
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

export const registerTraceDashboard = (
  router: IRouter,
  options: TraceDashboardRegistrationOptions = {}
): void => {
  const storage = TraceStorage.resolveStorage(
    useDatabase(undefined, resolveDashboardConnectionName(options.connectionName))
  );

  registerTraceRoutes(router, storage, options);
};
