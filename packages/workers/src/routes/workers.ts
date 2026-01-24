/**
 * Worker Management Routes
 * HTTP API for managing workers with dashboard functionality
 */

import type { IRequest, IResponse, IRouter } from '@zintrust/core';
import { Logger, Router } from '@zintrust/core';
import {
  createWorkersDashboard,
  type GetWorkersQuery,
  type WorkersDashboardUiOptions,
} from '../dashboard';
import type { WorkerDriver, WorkerSortBy, WorkerSortOrder, WorkerStatus } from '../dashboard/types';
import {
  getWorkerDetails,
  getWorkers,
  restartWorker,
  startWorker,
  stopWorker,
  toggleAutoSwitch,
} from '../dashboard/workers-api';
import { WorkerController } from '../http/WorkerController';

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

function registerWorkerLifecycleRoutes(router: IRouter): void {
  Router.group(router, '/api/workers', (r: IRouter) => {
    // Core worker operations
    Logger.info('Registering Worker Management Routes');

    Router.post(r, '/create', controller.create);
    Router.post(r, '/:name/start', controller.start);
    Router.post(r, '/:name/auto-start', controller.setAutoStart);
    Router.post(r, '/:name/stop', controller.stop);
    Router.post(r, '/:name/restart', controller.restart);
    Router.post(r, '/:name/pause', controller.pause);
    Router.post(r, '/:name/resume', controller.resume);
    Router.del(r, '/:name', controller.remove);

    // Worker information
    Router.get(r, '/', controller.list);
    Router.get(r, '/:name', controller.get);
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

    // Versioning
    Router.post(r, '/:name/versions', controller.registerVersion);
    Router.get(r, '/:name/versions', controller.listVersions);
    Router.get(r, '/:name/versions/:version', controller.getVersion);

    // Dashboard API routes
    registerDashboardRoutes(r);
  });
}

function registerDashboardListRoute(router: IRouter): void {
  // GET /api/workers - List workers with pagination, filtering, and sorting
  Router.get(router, '/api/workers', async (req: IRequest, res: IResponse) => {
    try {
      const query = req.getQuery() as Record<string, string | string[]>;

      // Helper function to safely get a single string value from query params
      const getQueryParam = (key: string, defaultValue: string = ''): string => {
        const value = query[key];
        return Array.isArray(value) ? value[0] : value || defaultValue;
      };

      // Helper function to safely get a number from query params
      const getNumberParam = (key: string, defaultValue: number): number => {
        const value = getQueryParam(key, String(defaultValue));
        const parsed = Number.parseInt(value, 10);
        return Number.isNaN(parsed) ? defaultValue : parsed;
      };

      // Helper function to safely get a boolean from query params
      const getBooleanParam = (key: string, defaultValue: boolean): boolean => {
        const value = getQueryParam(key, '').toLowerCase();
        if (value === 'true') return true;
        if (value === 'false') return false;
        return defaultValue;
      };

      // Helper function to get typed enum value with type safety
      const getEnumParam = <T extends string>(
        key: string,
        validValues: readonly T[],
        defaultValue: T
      ): T => {
        const value = getQueryParam(key, defaultValue);
        return validValues.includes(value as T) ? (value as T) : defaultValue;
      };

      const queryParams: GetWorkersQuery = {
        page: getNumberParam('page', 1),
        limit: getNumberParam('limit', 100),
        sortBy: getEnumParam<WorkerSortBy>(
          'sortBy',
          ['name', 'status', 'driver', 'health', 'version', 'processed'] as const,
          'name'
        ),
        sortOrder: getEnumParam<WorkerSortOrder>('sortOrder', ['asc', 'desc'] as const, 'asc'),
        status: getEnumParam<WorkerStatus>(
          'status',
          ['running', 'stopped', 'error', 'paused'] as const,
          'stopped'
        ),
        driver: getEnumParam<WorkerDriver>('driver', ['db', 'redis', 'memory'] as const, 'memory'),
        search: getQueryParam('search'),
        includeDetails: getBooleanParam('includeDetails', false),
      };

      const result = await getWorkers(queryParams);
      res.json(result);
    } catch (error) {
      Logger.error('Error fetching workers:', error);
      res.status(500).json({
        error: 'Failed to fetch workers',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

function registerWorkerDetailsRoute(router: IRouter): void {
  // GET /api/workers/:name/details - Get detailed worker information
  Router.get(router, '/api/workers/:name/details', async (req: IRequest, res: IResponse) => {
    try {
      const { name } = req.params;
      const details = await getWorkerDetails(name);
      res.json(details);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          error: 'Worker not found',
          message: error.message,
        });
      } else {
        Logger.error('Error fetching worker details:', error);
        res.status(500).json({
          error: 'Failed to fetch worker details',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  });
}

function registerWorkerActionRoutes(router: IRouter): void {
  // POST /api/workers/:name/start - Start a worker
  Router.post(router, '/api/workers/:name/start', async (req: IRequest, res: IResponse) => {
    try {
      const { name } = req.params;
      await startWorker(name);
      res.json({ success: true, message: `Worker ${name} started successfully` });
    } catch (error) {
      Logger.error('Error starting worker:', error);
      res.status(500).json({
        error: 'Failed to start worker',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /api/workers/:name/stop - Stop a worker
  Router.post(router, '/api/workers/:name/stop', async (req: IRequest, res: IResponse) => {
    try {
      const { name } = req.params;
      await stopWorker(name);
      res.json({ success: true, message: `Worker ${name} stopped successfully` });
    } catch (error) {
      Logger.error('Error stopping worker:', error);
      res.status(500).json({
        error: 'Failed to stop worker',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /api/workers/:name/restart - Restart a worker
  Router.post(router, '/api/workers/:name/restart', async (req: IRequest, res: IResponse) => {
    try {
      const { name } = req.params;
      await restartWorker(name);
      res.json({ success: true, message: `Worker ${name} restarted successfully` });
    } catch (error) {
      Logger.error('Error restarting worker:', error);
      res.status(500).json({
        error: 'Failed to restart worker',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /api/workers/:name/auto-switch - Toggle auto-switch for a worker
  Router.post(router, '/api/workers/:name/auto-switch', async (req: IRequest, res: IResponse) => {
    try {
      const { name } = req.params;
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        res.status(400).json({
          error: 'Invalid request',
          message: 'enabled field must be a boolean',
        });
        return;
      }

      await toggleAutoSwitch(name, enabled);
      res.json({
        success: true,
        message: `Auto-switch ${enabled ? 'enabled' : 'disabled'} for worker ${name}`,
        autoSwitch: enabled,
      });
    } catch (error) {
      Logger.error('Error toggling auto-switch:', error);
      res.status(500).json({
        error: 'Failed to toggle auto-switch',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

function registerBulkAutoSwitchRoute(router: IRouter): void {
  // POST /api/workers/auto-switch/bulk - Bulk toggle auto-switch for multiple workers
  Router.post(router, '/api/workers/auto-switch/bulk', async (req: IRequest, res: IResponse) => {
    try {
      const { workers, enabled } = req.body;

      if (!Array.isArray(workers) || typeof enabled !== 'boolean') {
        res.status(400).json({
          error: 'Invalid request',
          message: 'workers must be an array and enabled must be a boolean',
        });
        return;
      }

      const results = await Promise.allSettled(
        workers.map(async (workerName: string) => {
          await toggleAutoSwitch(workerName, enabled);
          return { worker: workerName, success: true };
        })
      );

      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      res.json({
        success: true,
        message: `Auto-switch ${enabled ? 'enabled' : 'disabled'} for ${successful} workers`,
        summary: {
          total: workers.length,
          successful,
          failed,
        },
        results: results.map((r, i) => ({
          worker: workers[i],
          success: r.status === 'fulfilled',
          error: r.status === 'rejected' ? (r as PromiseRejectedResult).reason.message : null,
        })),
      });
    } catch (error) {
      Logger.error('Error in bulk auto-switch toggle:', error);
      res.status(500).json({
        error: 'Failed to toggle auto-switch for workers',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

function registerUtilityRoutes(router: IRouter): void {
  // GET /api/workers/drivers - Get available worker drivers
  Router.get(router, '/api/workers/drivers', async (_req: IRequest, res: IResponse) => {
    try {
      const result = await getWorkers({});
      res.json({
        drivers: result.drivers,
        count: result.drivers.length,
      });
    } catch (error) {
      Logger.error('Error fetching drivers:', error);
      res.status(500).json({
        error: 'Failed to fetch drivers',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /api/workers/queue-data - Get queue statistics
  Router.get(router, '/api/workers/queue-data', async (_req: IRequest, res: IResponse) => {
    try {
      const result = await getWorkers({});
      res.json(result.queueData);
    } catch (error) {
      Logger.error('Error fetching queue data:', error);
      res.status(500).json({
        error: 'Failed to fetch queue data',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /api/workers/health - Get overall workers health summary
  Router.get(router, '/api/workers/health', async (_req: IRequest, res: IResponse) => {
    try {
      const result = await getWorkers({});

      const healthSummary = {
        total: result.workers.length,
        running: result.workers.filter((w) => w.status === 'running').length,
        stopped: result.workers.filter((w) => w.status === 'stopped').length,
        error: result.workers.filter((w) => w.status === 'error').length,
        paused: result.workers.filter((w) => w.status === 'paused').length,
        healthy: result.workers.filter((w) => w.health.status === 'healthy').length,
        unhealthy: result.workers.filter((w) => w.health.status === 'unhealthy').length,
        warning: result.workers.filter((w) => w.health.status === 'warning').length,
        drivers: result.drivers,
        queueData: result.queueData,
      };

      res.json(healthSummary);
    } catch (error) {
      Logger.error('Error fetching health summary:', error);
      res.status(500).json({
        error: 'Failed to fetch health summary',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

function registerDashboardRoutes(router: IRouter): void {
  registerDashboardListRoute(router);
  registerWorkerDetailsRoute(router);
  registerWorkerActionRoutes(router);
  registerBulkAutoSwitchRoute(router);
  registerUtilityRoutes(router);
}

export function registerWorkerRoutes(
  router: IRouter,
  options?: WorkerUiOptions,
  routeOptions?: RouteOptions
): void {
  registerWorkerUiPage(router, options, routeOptions);
  registerWorkerLifecycleRoutes(router);
  Logger.info('Worker routes registered at http://127.0.0.1:7777/workers');
}

export default registerWorkerRoutes;
