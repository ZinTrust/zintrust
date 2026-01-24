import { ErrorFactory, Logger } from '@zintrust/core';
import { WorkerFactory } from '../WorkerFactory';
import type {
  GetWorkersQuery,
  QueueData,
  RawWorkerData,
  WorkerConfiguration,
  WorkerData,
  WorkerDetails,
  WorkerDriver,
  WorkerHealth,
  WorkerHealthCheckStatus,
  WorkerHealthStatus,
  WorkerMetrics,
  WorkersListResponse,
} from './types';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

export async function getWorkers(query: GetWorkersQuery): Promise<WorkersListResponse> {
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, query.limit || DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * limit;

  // Get workers from persistence based on configuration
  const workers = await getWorkersFromPersistence();

  // Apply filters
  let filteredWorkers = applyFilters(workers, query);

  // Apply search
  if (query.search) {
    filteredWorkers = applySearch(filteredWorkers, query.search);
  }

  // Apply sorting
  filteredWorkers = applySorting(filteredWorkers, query.sortBy, query.sortOrder);

  // Get queue data
  const queueData = await getQueueData();

  // Apply pagination
  const paginatedWorkers = filteredWorkers.slice(offset, offset + limit);

  // Include details if requested
  if (query.includeDetails) {
    const enrichedWorkers = await enrichWithDetails(paginatedWorkers);
    return {
      workers: enrichedWorkers,
      queueData,
      pagination: {
        page,
        limit,
        total: filteredWorkers.length,
        totalPages: Math.ceil(filteredWorkers.length / limit),
        hasNext: offset + limit < filteredWorkers.length,
        hasPrev: page > 1,
      },
      drivers: getAvailableDrivers(workers),
    };
  }

  return {
    workers: paginatedWorkers,
    queueData,
    pagination: {
      page,
      limit,
      total: filteredWorkers.length,
      totalPages: Math.ceil(filteredWorkers.length / limit),
      hasNext: offset + limit < filteredWorkers.length,
      hasPrev: page > 1,
    },
    drivers: getAvailableDrivers(workers),
  };
}

async function getWorkersFromPersistence(): Promise<WorkerData[]> {
  const workers: WorkerData[] = [];

  // Check if we have mixed persistence (database + redis)
  const persistenceDriver = process.env['WORKER_PERSISTENCE_DRIVER'];

  if (persistenceDriver === 'db') {
    // Mixed persistence: get from both database and redis
    try {
      const dbWorkers = await WorkerFactory.list();
      const redisWorkers = await WorkerFactory.list();

      workers.push(
        ...transformToWorkerData(dbWorkers, 'db'),
        ...transformToWorkerData(redisWorkers, 'redis')
      );
    } catch (error) {
      Logger.error('Error fetching workers from mixed persistence:', error);
    }
  } else {
    // Single persistence driver
    try {
      const driverWorkers = await WorkerFactory.list();
      workers.push(...transformToWorkerData(driverWorkers, persistenceDriver as WorkerDriver));
    } catch (error) {
      Logger.error(`Error fetching workers from ${persistenceDriver}:`, error);
    }
  }

  return workers;
}

function transformToWorkerData(
  workers: (string | RawWorkerData)[],
  driver: WorkerDriver // Make this required and of type WorkerDriver
): WorkerData[] {
  return workers.map((worker: string | RawWorkerData) => {
    // Handle case where worker is a string (worker name)
    if (typeof worker === 'string') {
      return {
        name: worker,
        queueName: `${worker}-queue`,
        status: 'stopped' as WorkerData['status'],
        health: {
          status: 'healthy' as const,
          checks: [],
          lastCheck: new Date().toISOString(),
        },
        driver,
        version: '1.0.0',
        processed: 0,
        avgTime: 0,
        memory: 0,
        autoSwitch: false,
        details: {
          configuration: {} as WorkerConfiguration,
          health: {} as WorkerHealth,
          metrics: {} as WorkerMetrics,
          recentLogs: [],
        },
      };
    }

    // Handle case where worker is a RawWorkerData object
    const workerData = worker as RawWorkerData;
    return {
      name: workerData.name,
      queueName: workerData.queueName || `${workerData.name}-queue`,
      status: (workerData.status || 'stopped') as WorkerData['status'],
      health: determineHealth(workerData),
      driver: driver,
      version: workerData.version || '1.0.0',
      processed: workerData.processed || 0,
      avgTime: workerData.avgTime || 0,
      memory: workerData.memory || 0,
      autoSwitch: workerData.autoSwitch || false,
      details: workerData.details || {
        configuration: {} as WorkerConfiguration,
        health: {} as WorkerHealth,
        metrics: {} as WorkerMetrics,
        recentLogs: [],
      },
    };
  });
}

function determineHealth(worker: RawWorkerData): WorkerHealth {
  let status: WorkerHealthStatus = 'healthy';
  const checks: Array<{ name: string; status: WorkerHealthCheckStatus; message?: string }> = [];
  const lastCheck = new Date().toISOString();

  if (worker.status === 'error') {
    status = 'unhealthy';
    checks.push({
      name: 'worker-status',
      status: 'fail',
      message: 'Worker is in error state',
    });
  } else if (worker.status === 'stopped') {
    status = 'warning';
    checks.push({
      name: 'worker-status',
      status: 'warn',
      message: 'Worker is stopped',
    });
  }

  if (worker.lastError) {
    const timeSinceLastError = Date.now() - new Date(worker.lastError).getTime();
    if (timeSinceLastError < 300000) {
      status = 'warning';
      checks.push({
        name: 'recent-error',
        status: 'warn',
        message: `Last error occurred ${Math.round(timeSinceLastError / 1000)} seconds ago`,
      });
    }
  }

  return {
    status,
    checks,
    lastCheck,
  };
}

function applyFilters(workers: WorkerData[], query: GetWorkersQuery): WorkerData[] {
  let filtered = [...workers];

  if (query.status) {
    filtered = filtered.filter((w) => w.status === query.status);
  }

  if (query.driver) {
    filtered = filtered.filter((w) => w.driver === query.driver);
  }

  return filtered;
}

function applySearch(workers: WorkerData[], searchTerm: string): WorkerData[] {
  const term = searchTerm.toLowerCase();
  return workers.filter(
    (worker) =>
      worker.name.toLowerCase().includes(term) ||
      worker.queueName.toLowerCase().includes(term) ||
      worker.version.toLowerCase().includes(term)
  );
}

function applySorting(
  workers: WorkerData[],
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'asc'
): WorkerData[] {
  if (!sortBy) return workers;

  return [...workers].sort((a, b) => {
    let aVal: string | number;
    let bVal: string | number;

    switch (sortBy) {
      case 'name':
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
        break;
      case 'status':
        aVal = a.status;
        bVal = b.status;
        break;
      case 'driver':
        aVal = a.driver;
        bVal = b.driver;
        break;
      case 'health':
        aVal = a.health.status;
        bVal = b.health.status;
        break;
      case 'version':
        aVal = a.version;
        bVal = b.version;
        break;
      case 'processed':
        aVal = a.processed;
        bVal = b.processed;
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });
}

async function getQueueData(): Promise<QueueData> {
  const queueDriver = process.env.QUEUE_DRIVER || 'redis';

  try {
    // Get queue statistics based on QUEUE_DRIVER
    switch (queueDriver) {
      case 'redis':
        return getRedisQueueData();
      case 'database':
        return getDatabaseQueueData();
      case 'memory':
        return getMemoryQueueData();
      default:
        return getDefaultQueueData();
    }
  } catch (error) {
    Logger.error('Error fetching queue data:', error);
    return getDefaultQueueData();
  }
}

async function getRedisQueueData(): Promise<QueueData> {
  // Implementation for Redis queue statistics
  return {
    driver: 'redis',
    totalQueues: 5,
    totalJobs: 1250,
    processingJobs: 23,
    failedJobs: 12,
  };
}

async function getDatabaseQueueData(): Promise<QueueData> {
  // Implementation for Database queue statistics
  return {
    driver: 'db',
    totalQueues: 8,
    totalJobs: 3400,
    processingJobs: 45,
    failedJobs: 28,
  };
}

async function getMemoryQueueData(): Promise<QueueData> {
  // Implementation for Memory queue statistics
  return {
    driver: 'memory',
    totalQueues: 3,
    totalJobs: 156,
    processingJobs: 5,
    failedJobs: 2,
  };
}

function getDefaultQueueData(): QueueData {
  return {
    driver: 'memory',
    totalQueues: 0,
    totalJobs: 0,
    processingJobs: 0,
    failedJobs: 0,
  };
}

function getAvailableDrivers(workers: WorkerData[]): WorkerDriver[] {
  const drivers = new Set(workers.map((w) => w.driver));
  return Array.from(drivers) as WorkerDriver[];
}

async function enrichWithDetails(workers: WorkerData[]): Promise<WorkerData[]> {
  // Add detailed information for each worker
  return Promise.all(
    workers.map(async (worker) => {
      try {
        // TODO: Implement getDetails method when available
        const details: WorkerDetails = {
          configuration: {} as WorkerConfiguration,
          health: {} as WorkerHealth,
          metrics: {} as WorkerMetrics,
          recentLogs: [],
        };
        return {
          ...worker,
          details: {
            configuration: details.configuration,
            health: details.health,
            metrics: details.metrics,
            recentLogs: details.recentLogs,
          },
        };
      } catch (error) {
        Logger.error(`Error fetching details for worker ${worker.name}:`, error);
        return worker;
      }
    })
  );
}

export async function startWorker(name: string): Promise<void> {
  await WorkerFactory.start(name);
}

export async function stopWorker(name: string): Promise<void> {
  await WorkerFactory.stop(name);
}

export async function restartWorker(name: string): Promise<void> {
  await WorkerFactory.restart(name);
}

export async function toggleAutoSwitch(name: string, enabled: boolean): Promise<void> {
  await WorkerFactory.setAutoStart(name, enabled);
}

export async function getWorkerDetails(name: string): Promise<WorkerData> {
  const workers = await getWorkersFromPersistence();
  const worker = workers.find((w) => w.name === name);

  if (!worker) {
    throw ErrorFactory.createWorkerError(`Worker ${name} not found`);
  }

  const enrichedWorkers = await enrichWithDetails([worker]);
  return enrichedWorkers[0];
}
