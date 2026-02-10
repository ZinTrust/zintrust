import { Env, ErrorFactory, Logger } from '@zintrust/core';
import { WorkerFactory } from '../WorkerFactory';
import { WorkerMetrics as WorkerMetricsManager } from '../WorkerMetrics';
import type { WorkerRecord } from '../storage/WorkerStore';
import type {
  GetWorkersQuery,
  QueueData,
  RawWorkerData,
  WorkerConfiguration,
  WorkerData,
  WorkerDriver,
  WorkerHealth,
  WorkerHealthCheckStatus,
  WorkerHealthStatus,
  WorkerMetrics,
  WorkersListResponse,
} from './types';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

type PersistenceResult = {
  workers: WorkerData[];
  total: number;
  drivers: WorkerDriver[];
  effectiveLimit: number;
  prePaginated: boolean;
};

// Helper for timeout handling
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMsg: string
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    // eslint-disable-next-line no-restricted-syntax
    timer = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    if (timer) clearTimeout(timer);
    return result;
  } catch (error) {
    if (timer) clearTimeout(timer);
    throw error;
  }
}

async function fetchPersistenceWithTimeout(
  page: number,
  limit: number,
  query: GetWorkersQuery
): Promise<PersistenceResult> {
  const driver = Env.get('WORKER_PERSISTENCE_DRIVER', 'memory');
  try {
    const result = await withTimeout(
      getWorkersFromPersistence(page, limit, query.driver, query),
      5000,
      'Persistence timeout'
    );
    return result;
  } catch (err) {
    Logger.error(
      `[getWorkers] Persistence hung or failed (driver=${driver}), resetting connection state`,
      err
    );
    if (typeof WorkerFactory.resetPersistence === 'function') {
      await WorkerFactory.resetPersistence();
    }
    return {
      workers: [],
      total: 0,
      drivers: ['memory'],
      effectiveLimit: limit,
      prePaginated: true,
    };
  }
}

async function fetchQueueDataSafe(): Promise<QueueData> {
  const defaultData: QueueData = {
    driver: 'memory',
    totalQueues: 0,
    totalJobs: 0,
    processingJobs: 0,
    failedJobs: 0,
  };

  try {
    return await withTimeout(getQueueData(), 3000, 'Queue data timeout');
  } catch (err) {
    Logger.warn('[getWorkers] Queue data fetch failed or timed out', err);
    return defaultData;
  }
}

async function enrichWithMetricsSafe(workers: WorkerData[]): Promise<WorkerData[]> {
  try {
    return await withTimeout(enrichWithMetrics(workers), 5000, 'Metrics timeout');
  } catch (err) {
    Logger.warn('[getWorkers] Metrics fetch failed or timed out', err);

    // Reset metrics connection to avoid hanging next request
    // We use fire-and-forget here because the request is already delayed/timed-out
    // and we want to ensure the NEXT request has a clean slate (redisClient=null)
    WorkerMetricsManager.shutdown().catch((e) =>
      Logger.error('Failed to reset metrics connection', e)
    );

    return workers;
  }
}

export async function getWorkers(query: GetWorkersQuery): Promise<WorkersListResponse> {
  const start = Date.now();
  Logger.debug('[getWorkers] Start', query);

  const page = Math.max(1, query.page || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, query.limit || DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * limit;

  // Get workers from persistence based on configuration
  const persistenceStart = Date.now();
  const persistence = await fetchPersistenceWithTimeout(page, limit, query);
  Logger.debug('[getWorkers] Persistence took ' + (Date.now() - persistenceStart) + 'ms', {
    count: persistence.workers.length,
    total: persistence.total,
  });

  // Apply filters/search/sorting
  let filteredWorkers = applyFilters(persistence.workers, query);
  if (query.search) {
    filteredWorkers = applySearch(filteredWorkers, query.search);
  }
  filteredWorkers = applySorting(filteredWorkers, query.sortBy, query.sortOrder);

  // Get queue data
  const queueStart = Date.now();
  const queueData = await fetchQueueDataSafe();
  Logger.debug('[getWorkers] Queue data took ' + (Date.now() - queueStart) + 'ms');

  // Apply pagination
  const paginatedWorkers = persistence.prePaginated
    ? filteredWorkers
    : filteredWorkers.slice(offset, offset + persistence.effectiveLimit);

  // Enrich with metrics
  const metricsStart = Date.now();
  const workersWithMetrics = await enrichWithMetricsSafe(paginatedWorkers);
  Logger.debug('[getWorkers] Metrics took ' + (Date.now() - metricsStart) + 'ms');

  // Prepare result
  const result: WorkersListResponse = {
    workers: workersWithMetrics,
    queueData,
    pagination: {
      page,
      limit: persistence.effectiveLimit,
      total: persistence.prePaginated ? persistence.total : filteredWorkers.length,
      totalPages: Math.ceil(
        (persistence.prePaginated ? persistence.total : filteredWorkers.length) /
          persistence.effectiveLimit
      ),
      hasNext:
        offset + persistence.effectiveLimit <
        (persistence.prePaginated ? persistence.total : filteredWorkers.length),
      hasPrev: page > 1,
    },
    drivers: persistence.drivers,
  };

  // Include details if requested
  if (query.includeDetails) {
    const detailsStart = Date.now();
    try {
      result.workers = await enrichWithDetails(result.workers);
    } catch (err) {
      Logger.warn('[getWorkers] Details fetch failed', err);
    }
    Logger.debug('[getWorkers] Details took ' + (Date.now() - detailsStart) + 'ms');
  }

  Logger.debug('[getWorkers] Total took ' + (Date.now() - start) + 'ms');
  return result;
}

async function getWorkersFromPersistence(
  page: number,
  limit: number,
  driverFilter: WorkerDriver | undefined,
  query: GetWorkersQuery
): Promise<PersistenceResult> {
  const offset = (page - 1) * limit;

  const persistenceDriver = Env.get('WORKER_PERSISTENCE_DRIVER', 'memory');
  const isMixedPersistence = persistenceDriver === 'database' || persistenceDriver === 'db';

  if (driverFilter) {
    return getWorkersByDriverFilter(driverFilter, offset, limit, query);
  }

  if (isMixedPersistence) {
    return getWorkersFromMixedPersistence(offset, limit, query);
  }

  return getWorkersFromSinglePersistence(persistenceDriver, offset, limit, query);
}

async function getWorkersByDriverFilter(
  driverFilter: WorkerDriver,
  offset: number,
  limit: number,
  query: GetWorkersQuery
): Promise<PersistenceResult> {
  try {
    const driverRecords = await WorkerFactory.listPersistedRecords(
      { driver: driverFilter },
      { offset, limit, includeInactive: query.includeInactive }
    );
    const workers = transformToWorkerData(driverRecords, driverFilter);

    return {
      workers,
      total: driverRecords.length === limit ? offset + limit + 100 : offset + driverRecords.length,
      drivers: getAvailableDriversFromDrivers([driverFilter]),
      effectiveLimit: limit,
      prePaginated: true,
    };
  } catch (error) {
    Logger.error(`Error fetching workers from ${driverFilter}:`, error);
    return {
      workers: [],
      total: 0,
      drivers: getAvailableDriversFromDrivers([driverFilter]),
      effectiveLimit: limit,
      prePaginated: true,
    };
  }
}

async function getWorkersFromMixedPersistence(
  offset: number,
  limit: number,
  query: GetWorkersQuery
): Promise<PersistenceResult> {
  const includeInactive = query.includeInactive;
  let dbRecords: WorkerRecord[] = [];
  let redisRecords: WorkerRecord[] = [];

  try {
    dbRecords = await WorkerFactory.listPersistedRecords(
      { driver: 'database', connection: 'mysql' },
      { offset, limit, includeInactive }
    );
  } catch (error) {
    // In some environments (like Cloudflare), database access might not be available.
    // We log this as debug instead of error to avoid noise.
    Logger.debug('Failed to fetch from database persistence:', error);
  }

  try {
    redisRecords = await WorkerFactory.listPersistedRecords(
      { driver: 'redis' },
      { offset, limit, includeInactive }
    );
  } catch (error) {
    // Similarly for Redis if direct connection is not available.
    Logger.debug('Failed to fetch from redis persistence:', error);
  }

  try {
    const workers = [
      ...transformToWorkerData(dbRecords, 'database'),
      ...transformToWorkerData(redisRecords, 'redis'),
    ];

    return {
      workers,
      total:
        dbRecords.length + redisRecords.length >= limit
          ? offset + limit * 2
          : offset + dbRecords.length + redisRecords.length,
      drivers: getAvailableDriversFromDrivers(['database', 'redis']),
      effectiveLimit: Math.min(MAX_PAGE_SIZE, limit * 2),
      prePaginated: true,
    };
  } catch (error) {
    Logger.error('Error transforming workers from mixed persistence:', error);
    return {
      workers: [],
      total: 0,
      drivers: getAvailableDriversFromDrivers(['database', 'redis']),
      effectiveLimit: Math.min(MAX_PAGE_SIZE, limit * 2),
      prePaginated: true,
    };
  }
}

async function getWorkersFromSinglePersistence(
  persistenceDriver: string,
  offset: number,
  limit: number,
  query: GetWorkersQuery
): Promise<PersistenceResult> {
  try {
    const normalizedDriver = normalizeDriver(persistenceDriver);
    const driverRecords = await WorkerFactory.listPersistedRecords(
      { driver: normalizedDriver },
      { offset, limit, includeInactive: query.includeInactive }
    );
    const workers = transformToWorkerData(driverRecords, normalizedDriver);

    return {
      workers,
      total: driverRecords.length === limit ? offset + limit + 100 : offset + driverRecords.length,
      drivers: getAvailableDriversFromDrivers([normalizedDriver]),
      effectiveLimit: limit,
      prePaginated: true,
    };
  } catch (error) {
    Logger.error(`Error fetching workers from ${persistenceDriver}:`, error);
    return {
      workers: [],
      total: 0,
      drivers: getAvailableDriversFromDrivers([normalizeDriver(persistenceDriver)]),
      effectiveLimit: limit,
      prePaginated: false,
    };
  }
}

const normalizeDriver = (driver: string): WorkerDriver => {
  if (driver === 'db' || driver === 'database') return 'database';
  if (driver === 'redis') return 'redis';
  return 'memory';
};

const getAvailableDriversFromDrivers = (drivers: WorkerDriver[]): WorkerDriver[] => {
  const uniqueDrivers = new Set(drivers);
  return Array.from(uniqueDrivers);
};

function transformToWorkerData(
  workers: (string | RawWorkerData | WorkerRecord)[],
  driver: WorkerDriver
): WorkerData[] {
  return workers.map((worker) => {
    if (typeof worker === 'string') {
      return buildWorkerFromRaw({ name: worker }, driver);
    }

    if (isWorkerRecord(worker)) {
      return buildWorkerFromRecord(worker, driver);
    }

    return buildWorkerFromRaw(worker, driver);
  });
}

const isWorkerRecord = (worker: RawWorkerData | WorkerRecord): worker is WorkerRecord => {
  return 'autoStart' in worker && 'queueName' in worker && 'createdAt' in worker;
};

const buildWorkerFromRecord = (record: WorkerRecord, driver: WorkerDriver): WorkerData => {
  const status = normalizeStatus(record.status);
  const rawData: RawWorkerData = {
    name: record.name,
    queueName: record.queueName,
    status,
    version: record.version ?? '1.0.0',
    autoStart: record.autoStart,
    lastError: record.lastError,
    activeStatus: record.activeStatus ?? true,
  };

  return buildWorkerFromRaw(rawData, driver);
};

const buildWorkerFromRaw = (workerData: RawWorkerData, driver: WorkerDriver): WorkerData => {
  const status = normalizeStatus(workerData.status ?? 'stopped');
  return {
    name: workerData.name,
    queueName: workerData.queueName || `${workerData.name}-queue`,
    status,
    health: determineHealth({ ...workerData, status }),
    driver,
    version: workerData.version || '1.0.0',
    processed: workerData.processed || 0,
    avgTime: workerData.avgTime || 0,
    memory: workerData.memory || 0,
    autoStart: workerData.autoStart || false,
    activeStatus: workerData.activeStatus ?? true,
    details: workerData.details || {
      configuration: {} as WorkerConfiguration,
      health: {} as WorkerHealth,
      metrics: {} as WorkerMetrics,
      recentLogs: [],
    },
  };
};

const normalizeStatus = (status: string): WorkerData['status'] => {
  if (status === 'running' || status === 'stopped' || status === 'error' || status === 'paused') {
    return status;
  }
  return 'stopped';
};

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
  const queueDriver = Env.get('QUEUE_DRIVER', 'redis');

  try {
    // Get queue statistics based on QUEUE_DRIVER
    switch (queueDriver) {
      case 'redis':
        return getRedisQueueData();
      case 'database':
        return getDatabaseQueueData();
      case 'db':
        return getDatabaseQueueData();
      default:
        return getMemoryQueueData();
    }
  } catch (error) {
    Logger.error('Error fetching queue data:', error);
    return getMemoryQueueData();
  }
}

async function getRedisQueueData(): Promise<QueueData> {
  try {
    // Use existing queue monitor infrastructure
    const { QueueMonitor } = await import('@zintrust/queue-monitor');
    const { queueConfig } = await import('@zintrust/core');

    const redisConfig = queueConfig.drivers.redis;
    if (redisConfig?.driver !== 'redis') {
      throw ErrorFactory.createConfigError('Redis driver not configured');
    }

    const monitor = QueueMonitor.create({ redis: redisConfig });
    const snapshot = await monitor.getSnapshot();

    let totalJobs = 0;
    let processingJobs = 0;
    let failedJobs = 0;

    // Aggregate stats from all queues
    for (const queue of snapshot.queues) {
      totalJobs +=
        (queue.counts.waiting || 0) +
        (queue.counts.active || 0) +
        (queue.counts.completed || 0) +
        (queue.counts.failed || 0);
      processingJobs += queue.counts.active || 0;
      failedJobs += queue.counts.failed || 0;
    }

    return {
      driver: 'redis',
      totalQueues: snapshot.queues.length,
      totalJobs,
      processingJobs,
      failedJobs,
    };
  } catch (error) {
    Logger.error('Error fetching Redis queue data:', error);
    return {
      driver: 'redis',
      totalQueues: 0,
      totalJobs: 0,
      processingJobs: 0,
      failedJobs: 0,
    };
  }
}

async function getDatabaseQueueData(): Promise<QueueData> {
  try {
    // For database queues, use the existing database connection
    const { useEnsureDbConnected } = await import('@zintrust/core');
    const db = await useEnsureDbConnected();

    // Get queue statistics from actual database tables using proper query builder
    const queueStats = (await db
      .table('queue_jobs')
      .select('COUNT(DISTINCT queue) as totalQueues')
      .selectAs('COUNT(*)', 'totalJobs')
      .selectAs(
        'SUM(CASE WHEN reserved_at IS NOT NULL AND failed_at IS NULL THEN 1 ELSE 0 END)',
        'processingJobs'
      )
      .selectAs('SUM(CASE WHEN failed_at IS NOT NULL THEN 1 ELSE 0 END)', 'failedJobs')
      .first()) as {
      totalQueues: number;
      totalJobs: number;
      processingJobs: number;
      failedJobs: number;
    } | null;

    const stats = queueStats || {
      totalQueues: 0,
      totalJobs: 0,
      processingJobs: 0,
      failedJobs: 0,
    };

    return {
      driver: 'database',
      totalQueues: Number(stats.totalQueues) || 0,
      totalJobs: Number(stats.totalJobs) || 0,
      processingJobs: Number(stats.processingJobs) || 0,
      failedJobs: Number(stats.failedJobs) || 0,
    };
  } catch (error) {
    Logger.error('Error fetching database queue data:', error);
    return {
      driver: 'database',
      totalQueues: 0,
      totalJobs: 0,
      processingJobs: 0,
      failedJobs: 0,
    };
  }
}

async function getMemoryQueueData(): Promise<QueueData> {
  // For memory queues, we need to access the in-memory queue registry
  // This is a simplified implementation - in practice you'd need to
  // access the actual queue registry from the queue system
  // Since memory queues don't persist, we return basic info
  // In a real implementation, you'd track active memory queues
  return {
    driver: 'memory',
    totalQueues: 0, // Memory queues are not persisted
    totalJobs: 0,
    processingJobs: 0,
    failedJobs: 0,
  };
}

async function enrichWithMetrics(workers: WorkerData[]): Promise<WorkerData[]> {
  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const endDate = new Date(now);

  if (workers.length === 0) return workers;

  const metricRequests = workers.flatMap((worker) => [
    {
      workerName: worker.name,
      metricType: 'processed' as const,
      granularity: 'hourly' as const,
      startDate: oneHourAgo,
      endDate,
    },
    {
      workerName: worker.name,
      metricType: 'duration' as const,
      granularity: 'hourly' as const,
      startDate: oneHourAgo,
      endDate,
    },
    {
      workerName: worker.name,
      metricType: 'memory' as const,
      granularity: 'hourly' as const,
      startDate: oneHourAgo,
      endDate,
    },
  ]);

  try {
    const results = await WorkerMetricsManager.aggregateBatch(metricRequests);

    return workers.map((worker, index) => {
      const baseIdx = index * 3;
      const processedMetric = results[baseIdx];
      const durationMetric = results[baseIdx + 1];
      const memoryMetric = results[baseIdx + 2];

      const processed =
        processedMetric && Number.isFinite(processedMetric.total)
          ? Math.round(processedMetric.total)
          : worker.processed;
      const avgTime =
        durationMetric && Number.isFinite(durationMetric.average)
          ? Math.round(durationMetric.average)
          : worker.avgTime;
      const memory =
        memoryMetric && Number.isFinite(memoryMetric.average)
          ? Math.round(memoryMetric.average)
          : worker.memory;

      return {
        ...worker,
        processed,
        avgTime,
        memory,
      };
    });
  } catch (error) {
    Logger.debug('Batch metrics unavailable', error);
    return workers;
  }
}

async function enrichWithDetails(workers: WorkerData[]): Promise<WorkerData[]> {
  return Promise.all(workers.map((worker) => buildWorkerDetails(worker)));
}

async function buildWorkerDetails(worker: WorkerData): Promise<WorkerData> {
  try {
    const persistenceOverride = resolvePersistenceOverride(worker.driver);
    const persisted = await WorkerFactory.getPersisted(worker.name, persistenceOverride);
    const health = await getWorkerHealthSnapshot(worker.name, worker.health);
    const metrics = await getWorkerMetricsSnapshot(worker.name, worker);
    const configuration = buildWorkerConfiguration(worker, persisted);

    return {
      ...worker,
      processed: metrics.processed,
      avgTime: metrics.avgTime,
      memory: metrics.memory,
      details: {
        configuration,
        health,
        metrics,
        recentLogs: worker.details?.recentLogs ?? [],
      },
    };
  } catch (error) {
    Logger.error(`Error fetching details for worker ${worker.name}:`, error);
    return worker;
  }
}

function buildWorkerConfiguration(
  worker: WorkerData,
  persisted: Awaited<ReturnType<typeof WorkerFactory.getPersisted>>
): WorkerConfiguration {
  if (!persisted) {
    return {
      queueName: worker.queueName,
      concurrency: null,
      region: null,
      processorSpec: null,
      activeStatus: null,
      version: worker.version,
      features: null,
      infrastructure: null,
      datacenter: null,
    };
  }

  return {
    queueName: persisted.queueName ?? worker.queueName,
    concurrency: persisted.concurrency ?? null,
    region: persisted.region ?? null,
    processorSpec: persisted.processorSpec ?? null,
    activeStatus: persisted.activeStatus ?? true,
    version: persisted.version ?? worker.version,
    features: persisted.features ?? null,
    infrastructure: persisted.infrastructure ?? null,
    datacenter: persisted.datacenter ?? null,
  };
}

const resolvePersistenceOverride = (driver: WorkerDriver): { driver: WorkerDriver } => {
  if (driver === 'database') return { driver: 'database' } as const;
  if (driver === 'redis') return { driver: 'redis' } as const;
  return { driver: 'memory' } as const;
};

const getWorkerHealthSnapshot = async (
  name: string,
  fallback: WorkerHealth
): Promise<WorkerHealth> => {
  try {
    const health = (await WorkerFactory.getHealth(name)) as WorkerHealth | null;
    if (health && typeof health.status === 'string') {
      return health;
    }
  } catch (error) {
    Logger.debug(`Health snapshot unavailable for worker ${name}`, error);
  }
  return fallback;
};

const getWorkerMetricsSnapshot = async (
  name: string,
  fallback: WorkerData
): Promise<WorkerMetrics> => {
  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const endDate = new Date(now);

  try {
    const [processedMetric, durationMetric, memoryMetric] = await Promise.all([
      WorkerMetricsManager.aggregate({
        workerName: name,
        metricType: 'processed',
        granularity: 'hourly',
        startDate: oneHourAgo,
        endDate,
      }),
      WorkerMetricsManager.aggregate({
        workerName: name,
        metricType: 'duration',
        granularity: 'hourly',
        startDate: oneHourAgo,
        endDate,
      }),
      WorkerMetricsManager.aggregate({
        workerName: name,
        metricType: 'memory',
        granularity: 'hourly',
        startDate: oneHourAgo,
        endDate,
      }),
    ]);

    return {
      processed: Number.isFinite(processedMetric.total)
        ? Math.round(processedMetric.total)
        : fallback.processed,
      failed: 0,
      avgTime: Number.isFinite(durationMetric.average)
        ? Math.round(durationMetric.average)
        : fallback.avgTime,
      memory: Number.isFinite(memoryMetric.average)
        ? Math.round(memoryMetric.average)
        : fallback.memory,
      cpu: 0,
      uptime: 0,
    };
  } catch (error) {
    Logger.debug(`Metrics snapshot unavailable for worker ${name}`, error);
    return {
      processed: fallback.processed,
      failed: 0,
      avgTime: fallback.avgTime,
      memory: fallback.memory,
      cpu: 0,
      uptime: 0,
    };
  }
};

export async function toggleAutoStart(name: string, enabled: boolean): Promise<void> {
  await WorkerFactory.setAutoStart(name, enabled);
}

export async function getWorkerDetails(name: string, driver?: string): Promise<WorkerData> {
  const persistenceDriver = (driver || process.env['WORKER_PERSISTENCE_DRIVER']) ?? 'memory';
  const isMixedPersistence = persistenceDriver === 'database';

  let worker: WorkerData | undefined;

  if (isMixedPersistence) {
    const dbRecord = await WorkerFactory.getPersisted(name, { driver: 'database' });
    if (dbRecord) {
      worker = buildWorkerFromRecord(dbRecord, 'database');
    } else {
      const redisRecord = await WorkerFactory.getPersisted(name, { driver: 'redis' });
      if (redisRecord) {
        worker = buildWorkerFromRecord(redisRecord, 'redis');
      }
    }
  } else {
    const normalizedDriver = normalizeDriver(persistenceDriver);
    const record = await WorkerFactory.getPersisted(name, { driver: normalizedDriver });
    if (record) {
      worker = buildWorkerFromRecord(record, normalizedDriver);
    }
  }

  if (!worker) {
    throw ErrorFactory.createWorkerError(`Worker ${name} not found`);
  }

  const enrichedWorkers = await enrichWithDetails([worker]);
  return enrichedWorkers[0];
}
