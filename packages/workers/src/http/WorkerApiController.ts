/**
 * Worker API Controller
 * HTTP handlers for worker management API
 */

import type { IRequest, IResponse } from '@zintrust/core';
import { Logger } from '@zintrust/core';
import type {
  GetWorkersQuery,
  WorkerDriver,
  WorkerSortBy,
  WorkerSortOrder,
  WorkerStatus,
} from '../dashboard/types';
import { getWorkerDetails, getWorkers, toggleAutoSwitch } from '../dashboard/workers-api';

/**
 * Helper to safely get a single string value from query params
 */
const getQueryParam = (
  query: Record<string, string | string[]>,
  key: string,
  defaultValue: string = ''
): string => {
  const value = query[key];
  return Array.isArray(value) ? value[0] : value || defaultValue;
};

/**
 * Helper to safely get a number from query params
 */
const getNumberParam = (
  query: Record<string, string | string[]>,
  key: string,
  defaultValue: number
): number => {
  const value = getQueryParam(query, key, String(defaultValue));
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

/**
 * Helper to safely get a boolean from query params
 */
const getBooleanParam = (
  query: Record<string, string | string[]>,
  key: string,
  defaultValue: boolean
): boolean => {
  const value = getQueryParam(query, key, '').toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  return defaultValue;
};

/**
 * Helper function to get typed enum value with type safety
 */
const getEnumParam = <T extends string>(
  query: Record<string, string | string[]>,
  key: string,
  validValues: readonly T[],
  defaultValue: T
): T => {
  const value = getQueryParam(query, key, defaultValue);
  return validValues.includes(value as T) ? (value as T) : defaultValue;
};

/**
 * GET /api/workers - List workers with pagination, filtering, and sorting
 */
export const listWorkers = async (req: IRequest, res: IResponse): Promise<void> => {
  try {
    const query = req.getQuery() as Record<string, string | string[]>;

    const queryParams: GetWorkersQuery = {
      page: getNumberParam(query, 'page', 1),
      limit: getNumberParam(query, 'limit', 100),
      sortBy: getEnumParam<WorkerSortBy>(
        query,
        'sortBy',
        ['name', 'status', 'driver', 'health', 'version', 'processed'] as const,
        'name'
      ),
      sortOrder: getEnumParam<WorkerSortOrder>(query, 'sortOrder', ['asc', 'desc'] as const, 'asc'),
      status: getEnumParam<WorkerStatus>(
        query,
        'status',
        ['running', 'stopped', 'error', 'paused'] as const,
        'stopped'
      ),
      driver: getEnumParam<WorkerDriver>(
        query,
        'driver',
        ['db', 'redis', 'memory'] as const,
        'memory'
      ),
      search: getQueryParam(query, 'search'),
      includeDetails: getBooleanParam(query, 'includeDetails', false),
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
};

/**
 * GET /api/workers/:name/details - Get detailed worker information
 */
export const getWorkerDetailsHandler = async (req: IRequest, res: IResponse): Promise<void> => {
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
};

/**
 * POST /api/workers/auto-switch/bulk - Bulk toggle auto-switch for multiple workers
 */
export const bulkToggleAutoSwitchHandler = async (req: IRequest, res: IResponse): Promise<void> => {
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
};

/**
 * GET /api/workers/drivers - Get available worker drivers
 */
export const getDriversHandler = async (_req: IRequest, res: IResponse): Promise<void> => {
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
};

/**
 * GET /api/workers/queue-data - Get queue statistics
 */
export const getQueueDataHandler = async (_req: IRequest, res: IResponse): Promise<void> => {
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
};

/**
 * GET /api/workers/health - Get overall workers health summary
 */
export const getHealthSummaryHandler = async (_req: IRequest, res: IResponse): Promise<void> => {
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
};

export const WorkerApiController = Object.freeze({
  create() {
    // Compose grouped handlers to keep this function short
    return {
      getDriversHandler,
      getQueueDataHandler,
      getHealthSummaryHandler,
      listWorkers,
      getWorkerDetailsHandler,
      bulkToggleAutoSwitchHandler,
    };
  },
});

export default WorkerApiController;
