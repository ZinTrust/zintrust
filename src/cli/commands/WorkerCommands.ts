/* eslint-disable no-console */
/**
 * Worker Management CLI Commands
 * Command-line interface for managing workers
 */

import { ErrorFactory } from '@/exceptions/ZintrustError';
import type { IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { Logger } from '@config/logger';
import { loadWorkersModule as loadWorkersRuntimeModule } from '@runtime/WorkersModule';

type WorkerRegistryStatus = {
  status?: string;
  version?: string;
  queueName?: string;
  concurrency?: number;
  region?: string;
  startedAt?: Date | string | null;
};

type WorkerFactoryApi = {
  list: () => string[];
  listPersisted: () => Promise<string[]>;
  getHealth: (name: string) => Promise<unknown>;
  getMetrics: (name: string) => Promise<unknown>;
  get: (name: string) => unknown | null;
  stop: (name: string) => Promise<void>;
  restart: (name: string) => Promise<void>;
  start: (name: string) => Promise<void>;
  startFromPersisted: (name: string) => Promise<void>;
};

type WorkerRegistryApi = {
  status: (name: string) => WorkerRegistryStatus | null;
  start: (name: string) => Promise<void>;
};

type HealthMonitorApi = {
  getSummary: () => Promise<Array<{ status: 'healthy' | 'degraded' | 'unhealthy' | 'critical' }>>;
};

type ResourceMonitorApi = {
  getCurrentUsage: (workerName: string) => {
    cpu: number;
    memory: { percent: number; used: number };
    cost: { hourly: number; daily: number };
  };
};

// Lazy initialization to prevent temporal dead zone issues
let WorkerFactory: WorkerFactoryApi | undefined;
let WorkerRegistry: WorkerRegistryApi | undefined;
let HealthMonitor: HealthMonitorApi | undefined;
let ResourceMonitor: ResourceMonitorApi | undefined;
const loadWorkersModule = async (): Promise<{
  WorkerFactory: WorkerFactoryApi;
  WorkerRegistry: WorkerRegistryApi;
  HealthMonitor: HealthMonitorApi;
  ResourceMonitor: ResourceMonitorApi;
}> => {
  try {
    return await loadWorkersRuntimeModule();
  } catch (error) {
    Logger.error(
      'Failed to load optional package "@zintrust/workers"; worker commands require this package.',
      error
    );
    throw ErrorFactory.createCliError(
      'Optional package "@zintrust/workers" is required for worker commands. Install it to use worker:* commands.'
    );
  }
};

const getWorkerFactory = async (): Promise<WorkerFactoryApi> => {
  if (!WorkerFactory) {
    const mod = await loadWorkersModule();
    WorkerFactory = mod.WorkerFactory as unknown as WorkerFactoryApi;
  }
  return WorkerFactory;
};

const getWorkerRegistry = async (): Promise<WorkerRegistryApi> => {
  if (!WorkerRegistry) {
    const mod = await loadWorkersModule();
    WorkerRegistry = mod.WorkerRegistry as unknown as WorkerRegistryApi;
  }
  return WorkerRegistry;
};

const getHealthMonitor = async (): Promise<HealthMonitorApi> => {
  if (!HealthMonitor) {
    const mod = await loadWorkersModule();
    HealthMonitor = mod.HealthMonitor as unknown as HealthMonitorApi;
  }
  return HealthMonitor;
};

const getResourceMonitor = async (): Promise<ResourceMonitorApi> => {
  if (!ResourceMonitor) {
    const mod = await loadWorkersModule();
    ResourceMonitor = mod.ResourceMonitor as unknown as ResourceMonitorApi;
  }
  return ResourceMonitor;
};

/**
 * Helper: Format table output
 */
const formatTable = (headers: string[], rows: string[][]): string => {
  const columnWidths = headers.map((h, i) => {
    const maxRowWidth = Math.max(...rows.map((r) => (r[i] || '').length));
    return Math.max(h.length, maxRowWidth);
  });

  const headerRow = headers.map((h, i) => h.padEnd(columnWidths[i])).join(' | ');
  const separator = columnWidths.map((w) => '-'.repeat(w)).join('-+-');
  const dataRows = rows.map((row) =>
    row.map((cell, i) => (cell || '').padEnd(columnWidths[i])).join(' | ')
  );

  return [headerRow, separator, ...dataRows].join('\n');
};

/**
 * Worker List Command
 */
const createWorkerListCommand = (): IBaseCommand => {
  const ext = async (): Promise<void> => {
    try {
      const workers = await (await getWorkerFactory()).listPersisted();

      console.log(`\nTotal Workers: ${workers.length}\n`);

      if (workers.length === 0) {
        console.log('No workers found.');
        return;
      }

      const registry = await getWorkerRegistry();
      const rows = workers.map((name: string) => {
        const status = registry.status(name);
        return [
          name,
          status?.status ?? 'unknown',
          status?.version ?? 'N/A',
          status?.queueName ?? 'N/A',
          String(status?.concurrency ?? 0),
        ];
      });

      console.log(formatTable(['Name', 'Status', 'Version', 'Queue', 'Concurrency'], rows));
      console.log();
    } catch (error) {
      Logger.error('worker:list command failed', error);
      process.exit(1);
    }
  };

  const cmd = BaseCommand.create({
    name: 'worker:list',
    description: 'List all workers',
    execute: async () => ext(),
  });

  return cmd;
};

/**
 * Worker Status Command
 */
const createWorkerStatusCommand = (): IBaseCommand => {
  const ext = async (name: string): Promise<void> => {
    try {
      if (!name) {
        Logger.error('Error: Worker name is required');
        process.exit(1);
      }

      const status = (await getWorkerRegistry()).status(name);
      const health = await (await getWorkerFactory()).getHealth(name);
      const healthData =
        typeof health === 'object' && health !== null
          ? (health as { score?: number; status?: string })
          : {};
      const metrics = await (await getWorkerFactory()).getMetrics(name);

      console.log(`\n=== Worker: ${name} ===\n`);
      console.log(`Status: ${status?.status}`);
      console.log(`Version: ${status?.version}`);
      console.log(`Queue: ${status?.queueName}`);
      console.log(`Region: ${status?.region ?? 'N/A'}`);
      console.log(`Started: ${status?.startedAt}`);
      console.log(`Concurrency: ${status?.concurrency}`);
      console.log(`\nHealth Score: ${healthData.score ?? 'N/A'}`);
      console.log(`Health Status: ${healthData.status ?? 'N/A'}`);
      console.log(`\nMetrics:`);
      console.log(JSON.stringify(metrics, null, 2));
      console.log();
    } catch (error) {
      Logger.error('worker:status command failed', error);
      process.exit(1);
    }
  };

  const cmd = BaseCommand.create({
    name: 'worker:status',
    description: 'Get detailed status of a worker',
    addOptions: (command) => {
      command.argument('<name>', 'Worker name');
    },
    execute: async (options) => ext((options.args?.[0] as string) ?? ''),
  });

  return cmd;
};

/**
 * Worker Start Command
 */
const createWorkerStartCommand = (): IBaseCommand => {
  const ext = async (name: string): Promise<void> => {
    try {
      if (!name) {
        Logger.error('Error: Worker name is required');
        process.exit(1);
      }

      await (await getWorkerFactory()).start(name);
      Logger.info(`✓ Worker "${name}" started successfully`);
    } catch (error) {
      Logger.error('worker:start command failed', error);
      process.exit(1);
    }
  };

  const cmd = BaseCommand.create({
    name: 'worker:start',
    description: 'Start a worker',
    addOptions: (command) => {
      command.argument('<name>', 'Worker name');
    },
    execute: async (options) => ext((options.args?.[0] as string) ?? ''),
  });

  return cmd;
};

/**
 * Helper: Poll for persisted workers in container mode
 */
const pollForPersistedWorkers = async (factory: WorkerFactoryApi): Promise<string[]> => {
  let workers = await factory.listPersisted();

  if (workers.length === 0 && process.env['RUNTIME_MODE'] === 'containers') {
    Logger.info(
      'No persisted workers found. Waiting for workers to be registered... (Polling every 10s)'
    );

    while (workers.length === 0) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => globalThis.setTimeout(resolve, 10000));
      try {
        // eslint-disable-next-line no-await-in-loop
        workers = await factory.listPersisted();
        if (workers.length > 0) {
          Logger.info(`Found ${workers.length} workers. Proceeding to start.`);
        }
      } catch (e) {
        Logger.warn(
          'Error checking for persisted workers (retrying in 10s):',
          e instanceof Error ? e.message : String(e)
        );
      }
    }
  }

  return workers;
};

/**
 * Worker Start All Command
 */
const createWorkerStartAllCommand = (): IBaseCommand => {
  const ext = async (): Promise<void> => {
    try {
      const factory = await getWorkerFactory();
      const workers = await pollForPersistedWorkers(factory);

      if (workers.length === 0) {
        Logger.info('No persisted workers found.');
        return;
      }

      const results = await Promise.all(
        workers.map(async (name) => {
          const getFactory = await factory.get(name);
          if (getFactory !== null && getFactory !== undefined) {
            return { name, status: 'skipped' as const };
          }

          try {
            await factory.startFromPersisted(name);
            return { name, status: 'started' as const };
          } catch (error) {
            Logger.warn(`Failed to start worker "${name}"`, error);
            return { name, status: 'failed' as const };
          }
        })
      );

      const started = results.filter((result) => result.status === 'started').length;
      const skipped = results.filter((result) => result.status === 'skipped').length;
      const failed = results.filter((result) => result.status === 'failed').length;

      Logger.info('Worker start-all summary', {
        total: results.length,
        started,
        skipped,
        failed,
      });
    } catch (error) {
      Logger.error('worker:start-all command failed', error);
      process.exit(1);
    }
  };

  const cmd = BaseCommand.create({
    name: 'worker:start-all',
    description: 'Start all persisted workers',
    execute: async () => ext(),
  });

  return cmd;
};

/**
 * Worker Stop Command
 */
const createWorkerStopCommand = (): IBaseCommand => {
  const ext = async (name: string): Promise<void> => {
    try {
      if (!name) {
        console.error('Error: Worker name is required');
        process.exit(1);
      }

      await (await getWorkerFactory()).stop(name);
      console.log(`✓ Worker "${name}" stopped successfully`);
    } catch (error) {
      Logger.error('worker:stop command failed', error);
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  };

  const cmd = BaseCommand.create({
    name: 'worker:stop',
    description: 'Stop a worker',
    addOptions: (command) => {
      command.argument('<name>', 'Worker name');
    },
    execute: async (options) => ext((options.args?.[0] as string) ?? ''),
  });

  return cmd;
};

/**
 * Worker Restart Command
 */
const createWorkerRestartCommand = (): IBaseCommand => {
  const ext = async (name: string): Promise<void> => {
    try {
      if (!name) {
        console.error('Error: Worker name is required');
        process.exit(1);
      }

      await (await getWorkerFactory()).restart(name);
      console.log(`✓ Worker "${name}" restarted successfully`);
    } catch (error) {
      Logger.error('worker:restart command failed', error);
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  };

  const cmd = BaseCommand.create({
    name: 'worker:restart',
    description: 'Restart a worker',
    addOptions: (command) => {
      command.argument('<name>', 'Worker name');
    },
    execute: async (options) => ext((options.args?.[0] as string) ?? ''),
  });

  return cmd;
};

/**
 * Worker Summary Command
 */
const createWorkerSummaryCommand = (): IBaseCommand => {
  const ext = async (): Promise<void> => {
    try {
      const workers = (await getWorkerFactory()).list();
      const monitoringSummary = await (await getHealthMonitor()).getSummary();
      const resourceUsage = (await getResourceMonitor()).getCurrentUsage('system');

      console.log(`\n=== Worker System Summary ===\n`);
      console.log(`Total Workers: ${workers.length}`);
      console.log(`\nHealth Overview:`);

      const healthCounts = {
        healthy: 0,
        degraded: 0,
        unhealthy: 0,
        critical: 0,
      };

      monitoringSummary.forEach((w) => {
        healthCounts[w.status]++;
      });

      console.log(`  Healthy: ${healthCounts.healthy}`);
      console.log(`  Degraded: ${healthCounts.degraded}`);
      console.log(`  Unhealthy: ${healthCounts.unhealthy}`);
      console.log(`  Critical: ${healthCounts.critical}`);

      console.log(`\nSystem Resources:`);
      console.log(`  CPU: ${resourceUsage.cpu.toFixed(1)}%`);
      console.log(
        `  Memory: ${resourceUsage.memory.percent.toFixed(1)}% (${(resourceUsage.memory.used / 1024 / 1024 / 1024).toFixed(2)} GB used)`
      );
      console.log(`  Cost (hourly): $${resourceUsage.cost.hourly.toFixed(2)}`);
      console.log(`  Cost (daily): $${resourceUsage.cost.daily.toFixed(2)}`);
      console.log();
    } catch (error) {
      Logger.error('worker:summary command failed', error);
      process.exit(1);
    }
  };

  const cmd = BaseCommand.create({
    name: 'worker:summary',
    description: 'Get system-wide worker summary',
    execute: async () => ext(),
  });

  return cmd;
};

/**
 * Export worker command creators
 */
export const WorkerCommands = {
  createWorkerListCommand,
  createWorkerStatusCommand,
  createWorkerStartCommand,
  createWorkerStartAllCommand,
  createWorkerStopCommand,
  createWorkerRestartCommand,
  createWorkerSummaryCommand,
};
