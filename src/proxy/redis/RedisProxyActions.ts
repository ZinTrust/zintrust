import { ErrorFactory } from '@exceptions/ZintrustError';
import type { QueueDriver } from '@zintrust/queue-monitor/driver';
import type { Metrics } from '@zintrust/queue-monitor/metrics';
import type { WorkerPersistenceConfig } from '@zintrust/workers';

export type QueueMonitorContext = Readonly<{
  driver: QueueDriver;
  metrics: Metrics;
}>;

export type RedisProxyRedisConfig = Readonly<{
  host: string;
  port: number;
  password: string;
  db: number;
}>;

type QueueMonitorDriverModule = typeof import('@zintrust/queue-monitor/driver');
type QueueMonitorMetricsModule = typeof import('@zintrust/queue-monitor/metrics');
type QueueMonitoringServiceModule = typeof import('@zintrust/queue-monitor/QueueMonitoringService');
type WorkersApiModule = typeof import('@zintrust/workers/dashboard/workers-api');
type WorkerFactoryModule = typeof import('@zintrust/workers/WorkerFactory');

const loadQueueMonitorDriverModule = async (): Promise<QueueMonitorDriverModule> => {
  return import('@zintrust/queue-monitor/driver');
};

const loadQueueMonitorMetricsModule = async (): Promise<QueueMonitorMetricsModule> => {
  return import('@zintrust/queue-monitor/metrics');
};

const loadQueueMonitoringServiceModule = async (): Promise<QueueMonitoringServiceModule> => {
  return import('@zintrust/queue-monitor/QueueMonitoringService');
};

const loadWorkersApiModule = async (): Promise<WorkersApiModule> => {
  return import('@zintrust/workers/dashboard/workers-api');
};

const loadWorkerFactoryModule = async (): Promise<WorkerFactoryModule> => {
  return import('@zintrust/workers/WorkerFactory');
};

export const createQueueMonitorContext = async (
  redis: RedisProxyRedisConfig
): Promise<QueueMonitorContext> => {
  const [driverModule, metricsModule] = await Promise.all([
    loadQueueMonitorDriverModule(),
    loadQueueMonitorMetricsModule(),
  ]);

  return {
    driver: driverModule.createBullMQDriver(redis),
    metrics: metricsModule.createMetrics(redis),
  };
};

const readString = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
};

const readBoolean = (value: unknown): boolean => value === true;

const readNumber = (value: unknown): number | undefined => {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const readQueueNames = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const names = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return names.length > 0 ? names : undefined;
};

const resolveWorkerPersistenceOverride = (
  payload: Record<string, unknown>
): WorkerPersistenceConfig | undefined => {
  const driver = readString(payload['driver']);

  if (driver === 'redis') return { driver: 'redis' };
  if (driver === 'database') return { driver: 'database' };
  if (driver === 'memory') return { driver: 'memory' };

  return undefined;
};

type WorkerActionHandler = (payload: Record<string, unknown>) => Promise<unknown>;
type QueueMonitorActionHandler = (
  payload: Record<string, unknown>,
  queueMonitor: QueueMonitorContext
) => Promise<unknown>;

const workerActionHandlers: Record<string, WorkerActionHandler> = {
  getWorkers: async (payload) => {
    const module = await loadWorkersApiModule();
    return module.getWorkers(payload);
  },
  getWorkerDetails: async (payload) => {
    const module = await loadWorkersApiModule();
    return module.getWorkerDetails(
      readString(payload['name'] ?? payload['workerName']) ?? '',
      readString(payload['driver'])
    );
  },
  toggleAutoStart: async (payload) => {
    const module = await loadWorkersApiModule();
    return module.toggleAutoStart(
      readString(payload['name'] ?? payload['workerName']) ?? '',
      readBoolean(payload['enabled'])
    );
  },
  listPersistedRecords: async (payload) => {
    const module = await loadWorkerFactoryModule();
    return module.WorkerFactory.listPersistedRecords(resolveWorkerPersistenceOverride(payload), {
      offset: readNumber(payload['offset']),
      limit: readNumber(payload['limit']),
      search: readString(payload['search']),
      includeInactive: readBoolean(payload['includeInactive']),
    });
  },
  listFileBackedRecords: async () => {
    const module = await loadWorkerFactoryModule();
    return module.WorkerFactory.listFileBackedRecords();
  },
  getPersisted: async (payload) => {
    const module = await loadWorkerFactoryModule();
    return module.WorkerFactory.getPersisted(
      readString(payload['name'] ?? payload['workerName']) ?? '',
      resolveWorkerPersistenceOverride(payload)
    );
  },
  getHealth: async (payload) => {
    const module = await loadWorkerFactoryModule();
    return module.WorkerFactory.getHealth(
      readString(payload['name'] ?? payload['workerName']) ?? ''
    );
  },
  getMetrics: async (payload) => {
    const module = await loadWorkerFactoryModule();
    return module.WorkerFactory.getMetrics(
      readString(payload['name'] ?? payload['workerName']) ?? ''
    );
  },
};

const queueMonitorActionHandlers: Record<string, QueueMonitorActionHandler> = {
  getRecentJobsForQueue: async (payload, queueMonitor) => {
    const module = await loadQueueMonitoringServiceModule();
    return module.getRecentJobsForQueue(
      readString(payload['queue'] ?? payload['queueName']) ?? '',
      queueMonitor.metrics,
      queueMonitor.driver
    );
  },
  getRecentJobsForSelection: async (payload, queueMonitor) => {
    const module = await loadQueueMonitoringServiceModule();
    return module.getRecentJobsForSelection(
      readString(payload['queue'] ?? payload['queueName']) ?? '',
      queueMonitor.metrics,
      queueMonitor.driver,
      readQueueNames(payload['queueNames'])
    );
  },
};

const dispatchWorkerAction = async (
  action: string,
  payload: Record<string, unknown>
): Promise<unknown> => {
  const handler = workerActionHandlers[action];
  if (handler === undefined) {
    throw ErrorFactory.createValidationError(`Unsupported worker action: ${action}`);
  }
  return handler(payload);
};

const dispatchQueueMonitorAction = async (
  action: string,
  payload: Record<string, unknown>,
  queueMonitor: QueueMonitorContext
): Promise<unknown> => {
  const handler = queueMonitorActionHandlers[action];
  if (handler === undefined) {
    throw ErrorFactory.createValidationError(`Unsupported queue-monitor action: ${action}`);
  }
  return handler(payload, queueMonitor);
};

export const dispatchServiceCommand = async (
  service: string,
  action: string,
  payload: Record<string, unknown>,
  queueMonitor: QueueMonitorContext
): Promise<unknown> => {
  if (service === 'worker') {
    return dispatchWorkerAction(action, payload);
  }

  if (service === 'queue-monitor') {
    return dispatchQueueMonitorAction(action, payload, queueMonitor);
  }

  throw ErrorFactory.createValidationError(`Unsupported RPC service: ${service}`);
};
