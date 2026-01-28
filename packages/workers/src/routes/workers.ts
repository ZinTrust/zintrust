/**
 * Worker Management Routes
 * HTTP API for managing workers with dashboard functionality
 */

import type { IRouter } from '@zintrust/core';
import { Logger, Router } from '@zintrust/core';
import { type WorkersDashboardUiOptions } from '../dashboard';
import { WorkerApiController } from '../http/WorkerApiController';
import { WorkerController } from '../http/WorkerController';
import { ValidationSchemas, withCustomValidation } from '../http/middleware/CustomValidation';
import { withEditWorkerValidation } from '../http/middleware/EditWorkerValidation';
import { withDriverValidation } from '../http/middleware/ValidateDriver';
import {
  withCreateWorkerValidation,
  withWorkerOperationValidation,
} from '../http/middleware/WorkerValidationChain';
import { registerStaticAssets } from '../ui/router/ui';

type WorkerUiOptions = WorkersDashboardUiOptions;
type RouteOptions = { middleware?: ReadonlyArray<string> } | undefined;

const controller = WorkerController.create();
const apiController = WorkerApiController.create();

function registerCoreWorkerRoutes(r: IRouter): void {
  // Core worker operations
  Router.post(r, '/create', withCreateWorkerValidation(controller.create));
  Router.put(r, '/:name', withCreateWorkerValidation(controller.update));

  // Worker editing with custom validation that handles processorPath mapping
  Router.put(r, '/:name/edit', withEditWorkerValidation(controller.update));
  Router.post(
    r,
    '/:name/start',
    withDriverValidation(withWorkerOperationValidation(controller.start))
  );
  Router.post(
    r,
    '/:name/auto-start',
    withDriverValidation(withWorkerOperationValidation(controller.setAutoStart))
  );
  Router.post(
    r,
    '/:name/stop',
    withDriverValidation(withWorkerOperationValidation(controller.stop))
  );
  Router.post(
    r,
    '/:name/restart',
    withDriverValidation(withWorkerOperationValidation(controller.restart))
  );
  Router.post(
    r,
    '/:name/pause',
    withDriverValidation(withWorkerOperationValidation(controller.pause))
  );
  Router.post(
    r,
    '/:name/resume',
    withDriverValidation(withWorkerOperationValidation(controller.resume))
  );
  Router.del(r, '/:name', withDriverValidation(withWorkerOperationValidation(controller.remove)));
}

function registerWorkerQueryRoutes(r: IRouter): void {
  // Worker listing and filtering
  Router.get(
    r,
    '/',
    withDriverValidation(
      withCustomValidation(ValidationSchemas.workerFilter, apiController.listWorkers)
    )
  );

  Router.get(r, '/:name', withDriverValidation(withWorkerOperationValidation(controller.get)));

  Router.get(r, '/:name/status', withWorkerOperationValidation(controller.status));
  Router.get(
    r,
    '/:name/creation-status',
    withWorkerOperationValidation(controller.getCreationStatus)
  );
  Router.get(r, '/:name/metrics', withWorkerOperationValidation(controller.metrics));
  Router.get(r, '/:name/health', withWorkerOperationValidation(controller.health));

  // Worker details
  Router.get(r, '/:name/details', withDriverValidation(apiController.getWorkerDetailsHandler));

  // Worker driver data for editing
  Router.get(
    r,
    '/:name/driver-data',
    withDriverValidation(apiController.getWorkerDriverDataHandler)
  );
}

function registerMonitoringRoutes(r: IRouter): void {
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
}

function registerVersioningRoutes(r: IRouter): void {
  // Versioning
  Router.post(r, '/:name/versions', controller.registerVersion);
  Router.get(r, '/:name/versions', controller.listVersions);
  Router.get(r, '/:name/versions/:version', controller.getVersion);
}

function registerUtilityRoutes(r: IRouter): void {
  // Utility endpoints
  Router.get(r, '/drivers', apiController.getDriversHandler);
  Router.get(r, '/queue-data', apiController.getQueueDataHandler);
  Router.get(r, '/health', apiController.getHealthSummaryHandler);
}

function registerWorkerLifecycleRoutes(router: IRouter, middleware?: ReadonlyArray<string>): void {
  Router.group(
    router,
    '/api/workers',
    (r: IRouter) => {
      Logger.info('Registering Worker Management Routes');

      registerCoreWorkerRoutes(r);
      registerWorkerQueryRoutes(r);
      registerMonitoringRoutes(r);
      registerVersioningRoutes(r);
      registerUtilityRoutes(r);
    },
    { middleware: middleware }
  );
}

export function registerWorkerRoutes(
  router: IRouter,
  _options?: WorkerUiOptions,
  routeOptions?: RouteOptions
): void {
  registerStaticAssets(router, routeOptions?.middleware ?? []);
  registerWorkerLifecycleRoutes(router, routeOptions?.middleware);
  Logger.info('Worker routes registered at http://127.0.0.1:7777/workers');
}

export default registerWorkerRoutes;
