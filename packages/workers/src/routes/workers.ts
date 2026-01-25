/**
 * Worker Management Routes
 * HTTP API for managing workers with dashboard functionality
 */

import type { IRouter } from '@zintrust/core';
import { Logger, Router } from '@zintrust/core';
import { createWorkersDashboard, type WorkersDashboardUiOptions } from '../dashboard';
import { WorkerApiController } from '../http/WorkerApiController';
import { WorkerController } from '../http/WorkerController';
import { withDriverValidation } from '../http/middleware/ValidateDriver';
import { registerStaticAssets, registerUiStaticPage } from '../ui/router/ui';

type WorkerUiOptions = WorkersDashboardUiOptions;
type RouteOptions = { middleware?: ReadonlyArray<string> } | undefined;

const registerWorkerUiPage = (
  router: IRouter,
  options?: WorkerUiOptions,
  routeOptions?: RouteOptions
): void => {
  const handler = (_req: unknown, res: { html: (value: string) => void }): void => {
    const dashboard = createWorkersDashboard(options);
    res.html(dashboard.html);
  };

  Router.get(router, `${options?.basePath || ''}/workers`, handler, routeOptions);
  Router.get(router, '/workers', handler, routeOptions);
  Router.get(router, '/workers/', handler, routeOptions);
};

const controller = WorkerController.create();
const newController = WorkerApiController.create();

function registerWorkerLifecycleRoutes(router: IRouter): void {
  Router.group(router, '/api/workers', (r: IRouter) => {
    // Core worker operations
    Logger.info('Registering Worker Management Routes');

    Router.post(r, '/create', controller.create);
    Router.post(r, '/:name/start', withDriverValidation(controller.start));
    Router.post(r, '/:name/auto-start', withDriverValidation(controller.setAutoStart));
    Router.post(r, '/:name/stop', withDriverValidation(controller.stop));
    Router.post(r, '/:name/restart', withDriverValidation(controller.restart));
    Router.post(r, '/:name/pause', withDriverValidation(controller.pause));
    Router.post(r, '/:name/resume', withDriverValidation(controller.resume));
    Router.del(r, '/:name', withDriverValidation(controller.remove));

    // Worker listing and filtering
    Router.get(r, '/', withDriverValidation(newController.listWorkers));

    Router.get(r, '/:name', withDriverValidation(controller.get));
    Router.get(r, '/:name/status', controller.status);
    Router.get(r, '/:name/creation-status', controller.getCreationStatus);
    Router.get(r, '/:name/metrics', controller.metrics);
    Router.get(r, '/:name/health', controller.health);

    // Health monitoring
    Router.post(r, '/:name/monitoring/start', controller.startMonitoring);
    Router.post(r, '/:name/monitoring/stop', controller.stopMonitoring);
    Router.get(r, '/:name/monitoring/history', controller.healthHistory);
    Router.get(r, '/:name/monitoring/trend', controller.healthTrend);
    Router.put(r, '/:name/monitoring/config', controller.updateMonitoringConfig);

    // SLA monitoring
    Router.get(r, '/:name/sla/status', controller.getSlaStatus);

    // SSE events stream for monitoring + workers snapshot
    Router.get(r, '/events', controller.eventsStream);

    // Versioning
    Router.post(r, '/:name/versions', controller.registerVersion);
    Router.get(r, '/:name/versions', controller.listVersions);
    Router.get(r, '/:name/versions/:version', controller.getVersion);

    // Worker details
    Router.get(r, '/:name/details', withDriverValidation(newController.getWorkerDetailsHandler));

    // Bulk operations
    Router.post(r, '/auto-start/bulk', newController.bulkToggleAutoStartHandler);

    // Utility endpoints
    Router.get(r, '/drivers', newController.getDriversHandler);
    Router.get(r, '/queue-data', newController.getQueueDataHandler);
    Router.get(r, '/health', newController.getHealthSummaryHandler);
  });
}

export function registerWorkerRoutes(
  router: IRouter,
  options?: WorkerUiOptions,
  routeOptions?: RouteOptions
): void {
  registerWorkerUiPage(router, options, routeOptions);
  registerUiStaticPage(router);
  registerStaticAssets(router);
  registerWorkerLifecycleRoutes(router);
  Logger.info('Worker routes registered at http://127.0.0.1:7777/workers');
}

export default registerWorkerRoutes;
