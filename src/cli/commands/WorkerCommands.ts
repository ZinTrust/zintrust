/* eslint-disable no-console */
/**
 * Worker Management CLI Commands
 * Command-line interface for managing workers
 */

import type { IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { Logger } from '@config/logger';
import {
  HealthMonitor as HealthMonitorAny,
  ResourceMonitor as ResourceMonitorAny,
  WorkerFactory as WorkerFactoryAny,
  WorkerRegistry as WorkerRegistryAny,
} from '@zintrust/workers';

type WorkerRegistryStatus = {
  status?: string;
  version?: string;
  queueName?: string;
  concurrency?: number;
  region?: string;
  startedAt?: Date | string;
};

type WorkerFactoryApi = {
  list: () => string[];
  listPersisted: () => Promise<string[]>;
  getHealth: (name: string) => Promise<unknown>;
  getMetrics: (name: string) => Promise<unknown>;
  stop: (name: string) => Promise<void>;
  restart: (name: string) => Promise<void>;
  start: (name: string) => Promise<void>;
};

type WorkerRegistryApi = {
  status: (name: string) => WorkerRegistryStatus | null;
  start: (name: string) => Promise<void>;
};

type HealthMonitorApi = {
  getSummary: () => Array<{ status: 'healthy' | 'degraded' | 'unhealthy' | 'critical' }>;
};

type ResourceMonitorApi = {
  getCurrentUsage: (workerName: string) => {
    cpu: number;
    memory: { percent: number; used: number };
    cost: { hourly: number; daily: number };
  };
};

// Lazy initialization to prevent temporal dead zone issues
let WorkerFactory: WorkerFactoryApi;
let WorkerRegistry: WorkerRegistryApi;
let HealthMonitor: HealthMonitorApi;
let ResourceMonitor: ResourceMonitorApi;

const getWorkerFactory = (): WorkerFactoryApi => {
  WorkerFactory ??= WorkerFactoryAny as unknown as WorkerFactoryApi;
  return WorkerFactory;
};

const getWorkerRegistry = (): WorkerRegistryApi => {
  WorkerRegistry ??= WorkerRegistryAny as unknown as WorkerRegistryApi;
  return WorkerRegistry;
};

const getHealthMonitor = (): HealthMonitorApi => {
  HealthMonitor ??= HealthMonitorAny as unknown as HealthMonitorApi;
  return HealthMonitor;
};

const getResourceMonitor = (): ResourceMonitorApi => {
  ResourceMonitor ??= ResourceMonitorAny as unknown as ResourceMonitorApi;
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
      const workers = await getWorkerFactory().listPersisted();

      console.log(`\nTotal Workers: ${workers.length}\n`);

      if (workers.length === 0) {
        console.log('No workers found.');
        return;
      }

      const rows = workers.map((name: string) => {
        const status = getWorkerRegistry().status(name);
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

      const status = getWorkerRegistry().status(name);
      const health = await getWorkerFactory().getHealth(name);
      const healthData =
        typeof health === 'object' && health !== null
          ? (health as { score?: number; status?: string })
          : {};
      const metrics = await getWorkerFactory().getMetrics(name);

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

      await getWorkerFactory().start(name);
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
 * Worker Stop Command
 */
const createWorkerStopCommand = (): IBaseCommand => {
  const ext = async (name: string): Promise<void> => {
    try {
      if (!name) {
        console.error('Error: Worker name is required');
        process.exit(1);
      }

      await getWorkerFactory().stop(name);
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

      await getWorkerFactory().restart(name);
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
  const ext = (): void => {
    try {
      const workers = getWorkerFactory().list();
      const monitoringSummary = getHealthMonitor().getSummary();
      const resourceUsage = getResourceMonitor().getCurrentUsage('system');

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
    execute: () => ext(),
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
  createWorkerStopCommand,
  createWorkerRestartCommand,
  createWorkerSummaryCommand,
};
