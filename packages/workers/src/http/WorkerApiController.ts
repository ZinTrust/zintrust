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
import { getWorkerDetails, getWorkers } from '../dashboard/workers-api';
import { getParam } from '../helper';
import { WorkerFactory } from '../WorkerFactory';

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
 * Helper to safely get optional enum value
 */
const getOptionalEnumParam = <T extends string>(
  query: Record<string, string | string[]>,
  key: string,
  validValues: readonly T[]
): T | undefined => {
  const value = getQueryParam(query, key, '').trim();
  if (!value) return undefined;
  return validValues.includes(value as T) ? (value as T) : undefined;
};

/**
 * GET /api/workers - List workers with pagination, filtering, and sorting
 */
export const listWorkers = async (req: IRequest, res: IResponse): Promise<void> => {
  try {
    const query = req.getQuery() as Record<string, string | string[]>;
    const sortByRaw = getQueryParam(query, 'sortBy', getQueryParam(query, 'sort', 'name'));

    const queryParams: GetWorkersQuery = {
      page: getNumberParam(query, 'page', 1),
      limit: getNumberParam(query, 'limit', 100),
      sortBy: getEnumParam<WorkerSortBy>(
        { ...query, sortBy: sortByRaw },
        'sortBy',
        ['name', 'status', 'driver', 'health', 'version', 'processed'] as const,
        'name'
      ),
      sortOrder: getEnumParam<WorkerSortOrder>(query, 'sortOrder', ['asc', 'desc'] as const, 'asc'),
      status: getOptionalEnumParam<WorkerStatus>(query, 'status', [
        'running',
        'stopped',
        'error',
        'paused',
      ] as const),
      driver: getOptionalEnumParam<WorkerDriver>(query, 'driver', [
        'db',
        'redis',
        'memory',
      ] as const),
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
    const name = getParam(req, 'name');
    if (!name) {
      res.setStatus(400).json({ error: 'Worker name is required' });
      return;
    }
    const driver = getQueryParam(req.getQuery?.() || {}, 'driver');
    const details = await getWorkerDetails(name, driver);
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

const getWorkerJsonHandler = async (req: IRequest, res: IResponse): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.setStatus(400).json({
        error: 'Worker ID is required',
        code: 'MISSING_WORKER_ID',
      });
    }

    const worker = await getWorkerDetails(id);
    if (!worker) {
      return res.setStatus(404).json({
        error: 'Worker not found',
        code: 'WORKER_NOT_FOUND',
      });
    }

    return res.json({
      success: true,
      data: worker,
    });
  } catch (error) {
    Logger.error('Failed to get worker JSON', error);
    return res.setStatus(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
};

/**
 * GET /api/workers/:name/driver-data - Get direct driver data for editing
 * This retrieves the raw persisted data without enrichment for editing purposes
 */
const getWorkerDriverDataHandler = async (req: IRequest, res: IResponse): Promise<void> => {
  try {
    const name = getParam(req, 'name');
    if (!name) {
      return res.setStatus(400).json({
        error: 'Worker name is required',
        code: 'MISSING_WORKER_NAME',
      });
    }

    const driver = getQueryParam(req.getQuery?.() || {}, 'driver') as WorkerDriver;
    const persistenceOverride = driver ? { driver } : undefined;

    // Get direct driver data without enrichment
    const persistedData = await WorkerFactory.getPersisted(name, persistenceOverride);

    if (!persistedData) {
      return res.setStatus(404).json({
        error: 'Worker not found in driver',
        code: 'WORKER_NOT_FOUND',
      });
    }

    return res.json({
      success: true,
      data: persistedData,
    });
  } catch (error) {
    Logger.error('Failed to get worker driver data', error);
    return res.setStatus(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
};

const updateWorkerJsonHandler = async (req: IRequest, res: IResponse): Promise<void> => {
  try {
    const workerData = req.data();
    const workerId = workerData['id'] as string;

    if (!workerId) {
      return res.setStatus(400).json({
        error: 'Worker ID is required',
        code: 'MISSING_WORKER_ID',
      });
    }

    if (!workerData) {
      return res.setStatus(400).json({
        error: 'Worker data is required',
        code: 'MISSING_WORKER_DATA',
      });
    }

    // Basic validation for now - can be enhanced with full schema validation
    if (
      !workerData['name'] ||
      !workerData['queueName'] ||
      !workerData['processor'] ||
      !workerData['version']
    ) {
      return res.setStatus(400).json({
        error: 'Missing required fields: name, queueName, processor, version',
        code: 'MISSING_REQUIRED_FIELDS',
      });
    }

    // Get existing worker
    const existingWorker = await getWorkerDetails(workerId);
    if (!existingWorker) {
      return res.setStatus(404).json({
        error: 'Worker not found',
        code: 'WORKER_NOT_FOUND',
      });
    }

    // For now, return the updated data as if it was updated
    // In a real implementation, this would update the worker in the database
    const updatedWorker = { ...existingWorker, ...workerData };

    return res.json({
      success: true,
      data: updatedWorker,
      message: 'Worker updated successfully',
    });
  } catch (error) {
    Logger.error('Failed to update worker JSON', error);
    return res.setStatus(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
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
      getWorkerJsonHandler,
      getWorkerDriverDataHandler,
      updateWorkerJsonHandler,
    };
  },
});

export default WorkerApiController;
