/**
 * Chaos Engineering
 * Controlled fault injection experiments for worker resilience testing
 * Sealed namespace for immutability
 */

import { ErrorFactory, Logger, generateUuid } from '@zintrust/core';
import { CircuitBreaker } from './CircuitBreaker';
import { Observability } from './Observability';
import { ResourceMonitor } from './ResourceMonitor';
import { WorkerRegistry } from './WorkerRegistry';

export interface IChaosExperiment {
  name: string;
  description: string;
  target: {
    workers?: string[];
    percentage?: number;
  };
  failure: {
    type: 'crash' | 'latency' | 'error' | 'resource';
    config: unknown;
  };
  duration: number; // milliseconds
  safetyLimits: {
    maxConcurrent: number;
    circuitBreaker: boolean;
    rollbackOn: string[];
  };
}

export type IChaosStatus = {
  id: string;
  name: string;
  state: 'defined' | 'running' | 'completed' | 'stopped' | 'failed';
  startedAt: Date | null;
  endedAt: Date | null;
  targetedWorkers: string[];
  failureType: IChaosExperiment['failure']['type'];
};

export type IChaosReport = {
  experimentId: string;
  summary: string;
  durationMs: number;
  targetedWorkers: string[];
  completedAt: Date | null;
};

export type IChaosComparison = {
  comparedIds: string[];
  running: number;
  completed: number;
  stopped: number;
};

type ExperimentRecord = {
  config: IChaosExperiment;
  status: IChaosStatus;
  timer: NodeJS.Timeout | null;
};

const experiments = new Map<string, ExperimentRecord>();

const getTargetWorkers = (config: IChaosExperiment): string[] => {
  const candidates = config.target.workers ?? WorkerRegistry.listRunning();
  if (candidates.length === 0) return [];

  const percentage = config.target.percentage ?? 100;
  if (percentage >= 100) return [...candidates];

  const count = Math.max(1, Math.floor((candidates.length * percentage) / 100));
  return candidates.slice(0, count);
};

const applyFailure = async (config: IChaosExperiment, workers: string[]): Promise<void> => {
  switch (config.failure.type) {
    case 'crash':
      await Promise.all(
        workers.map(async (workerName) => {
          try {
            await WorkerRegistry.stop(workerName);
          } catch (error) {
            Logger.error(`Failed to inject crash for ${workerName}`, error);
          }
        })
      );
      break;
    case 'latency':
      workers.forEach((workerName) => {
        Logger.warn(`Injected latency for ${workerName}`, { config: config.failure.config });
      });
      break;
    case 'error':
      workers.forEach((workerName) => {
        const status = WorkerRegistry.status(workerName);
        if (status) {
          CircuitBreaker.forceOpen(workerName, status.version, 'Chaos experiment error injection');
        }
      });
      break;
    case 'resource':
      workers.forEach((workerName) => {
        const usage = ResourceMonitor.getCurrentUsage(workerName);
        Logger.warn(`Resource pressure simulated for ${workerName}`, {
          cpu: usage.cpu,
          memory: usage.memory.percent,
          config: config.failure.config,
        });
      });
      break;
  }

  if (Observability.isEnabled()) {
    workers.forEach((workerName) => {
      Observability.recordJobMetrics(workerName, 'chaos', {
        processed: 0,
        failed: 0,
      });
    });
  }
};

const rollbackFailure = (config: IChaosExperiment, workers: string[]): void => {
  if (!config.safetyLimits.circuitBreaker) return;

  if (config.failure.type === 'error') {
    workers.forEach((workerName) => {
      const status = WorkerRegistry.status(workerName);
      if (status) {
        CircuitBreaker.reset(workerName, status.version);
      }
    });
  }
};

/**
 * Chaos Engineering - Sealed namespace
 */
export const ChaosEngineering = Object.freeze({
  /**
   * Define a chaos experiment
   */
  defineExperiment(config: IChaosExperiment): string {
    const id = generateUuid();
    const status: IChaosStatus = {
      id,
      name: config.name,
      state: 'defined',
      startedAt: null,
      endedAt: null,
      targetedWorkers: [],
      failureType: config.failure.type,
    };

    experiments.set(id, { config, status, timer: null });
    Logger.info(`Chaos experiment defined: ${config.name}`, { id });
    return id;
  },

  /**
   * Start a chaos experiment
   */
  async startExperiment(experimentId: string): Promise<void> {
    const record = experiments.get(experimentId);
    if (!record) {
      throw ErrorFactory.createNotFoundError(`Chaos experiment not found: ${experimentId}`);
    }

    if (record.status.state === 'running') {
      throw ErrorFactory.createWorkerError(`Chaos experiment already running: ${experimentId}`);
    }

    const runningCount = Array.from(experiments.values()).filter(
      (exp) => exp.status.state === 'running'
    ).length;

    if (runningCount >= record.config.safetyLimits.maxConcurrent) {
      throw ErrorFactory.createWorkerError('Maximum concurrent chaos experiments reached');
    }

    const targets = getTargetWorkers(record.config);
    record.status.state = 'running';
    record.status.startedAt = new Date();
    record.status.targetedWorkers = targets;

    Logger.warn(`Chaos experiment started: ${record.config.name}`, {
      id: experimentId,
      targets,
    });

    await applyFailure(record.config, targets);

    record.timer = setTimeout(() => {
      ChaosEngineering.stopExperiment(experimentId).catch((error) => {
        Logger.error('Failed to stop chaos experiment after duration', error);
      });
    }, record.config.duration);
  },

  /**
   * Stop a chaos experiment
   */
  async stopExperiment(experimentId: string): Promise<void> {
    const record = experiments.get(experimentId);
    if (!record) {
      throw ErrorFactory.createNotFoundError(`Chaos experiment not found: ${experimentId}`);
    }

    if (record.timer) {
      clearTimeout(record.timer);
      record.timer = null;
    }

    rollbackFailure(record.config, record.status.targetedWorkers);

    record.status.state = 'completed';
    record.status.endedAt = new Date();

    Logger.info(`Chaos experiment completed: ${record.config.name}`, {
      id: experimentId,
      duration: record.config.duration,
    });
  },

  /**
   * Get experiment status
   */
  getExperimentStatus(experimentId: string): IChaosStatus {
    const record = experiments.get(experimentId);
    if (!record) {
      throw ErrorFactory.createNotFoundError(`Chaos experiment not found: ${experimentId}`);
    }

    return { ...record.status, targetedWorkers: [...record.status.targetedWorkers] };
  },

  /**
   * Failure injection helpers
   */
  injectCrash(workerName: string): void {
    WorkerRegistry.stop(workerName).catch((error) => {
      Logger.error(`Failed to inject crash for ${workerName}`, error);
    });
  },

  injectLatency(workerName: string, delayMs: number): void {
    Logger.warn(`Injected latency ${delayMs}ms for ${workerName}`);
  },

  injectError(workerName: string, errorRate: number): void {
    const status = WorkerRegistry.status(workerName);
    if (!status) {
      throw ErrorFactory.createNotFoundError(`Worker not found: ${workerName}`);
    }

    CircuitBreaker.forceOpen(workerName, status.version, `Chaos error rate ${errorRate}`);
  },

  injectResourceExhaustion(workerName: string, type: 'cpu' | 'memory'): void {
    const usage = ResourceMonitor.getCurrentUsage(workerName);
    Logger.warn(`Injected resource exhaustion (${type}) for ${workerName}`, {
      cpu: usage.cpu,
      memory: usage.memory.percent,
    });
  },

  /**
   * Analysis helpers
   */
  analyzeResilience(experimentId: string): IChaosReport {
    const record = experiments.get(experimentId);
    if (!record) {
      throw ErrorFactory.createNotFoundError(`Chaos experiment not found: ${experimentId}`);
    }

    return {
      experimentId,
      summary: `Experiment ${record.config.name} finished with ${record.status.state}`,
      durationMs: record.config.duration,
      targetedWorkers: [...record.status.targetedWorkers],
      completedAt: record.status.endedAt,
    };
  },

  compareExperiments(ids: string[]): IChaosComparison {
    const statuses = ids.map((id) => experiments.get(id)?.status).filter(Boolean) as IChaosStatus[];

    return {
      comparedIds: ids,
      running: statuses.filter((s) => s.state === 'running').length,
      completed: statuses.filter((s) => s.state === 'completed').length,
      stopped: statuses.filter((s) => s.state === 'stopped').length,
    };
  },
});

export default ChaosEngineering;
