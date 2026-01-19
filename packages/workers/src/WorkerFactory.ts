/**
 * Worker Factory
 * Central factory for creating workers with all advanced features
 * Sealed namespace for immutability
 */

import {
  Env,
  ErrorFactory,
  Logger,
  workersConfig,
  type RedisConfig,
  type WorkerStatus,
} from '@zintrust/core';
import { Worker, type Job, type WorkerOptions } from 'bullmq';
import { AutoScaler, type AutoScalerConfig } from './AutoScaler';
import { CanaryController } from './CanaryController';
import { CircuitBreaker } from './CircuitBreaker';
import { ClusterLock } from './ClusterLock';
import { ComplianceManager, type ComplianceConfig } from './ComplianceManager';
import { DatacenterOrchestrator } from './DatacenterOrchestrator';
import { DeadLetterQueue, type RetentionPolicy } from './DeadLetterQueue';
import { HealthMonitor } from './HealthMonitor';
import { MultiQueueWorker } from './MultiQueueWorker';
import { Observability, type ObservabilityConfig } from './Observability';
import { PluginManager } from './PluginManager';
import { PriorityQueue } from './PriorityQueue';
import { ResourceMonitor } from './ResourceMonitor';
import { WorkerMetrics } from './WorkerMetrics';
import { WorkerRegistry, type WorkerInstance as RegistryWorkerInstance } from './WorkerRegistry';
import { WorkerVersioning } from './WorkerVersioning';

export type WorkerFactoryConfig = {
  name: string;
  version?: string;
  queueName: string;
  processor: (job: Job) => Promise<unknown>;
  options?: WorkerOptions;
  infrastructure?: {
    redis?: RedisConfigInput;
    deadLetterQueue?: {
      redis?: RedisConfigInput;
      policy: RetentionPolicy;
    };
    compliance?: {
      redis?: RedisConfigInput;
      config?: Partial<ComplianceConfig>;
    };
    observability?: ObservabilityConfigInput;
    autoScaler?: AutoScalerConfig;
  };
  features?: {
    clustering?: boolean;
    metrics?: boolean;
    autoScaling?: boolean;
    circuitBreaker?: boolean;
    deadLetterQueue?: boolean;
    resourceMonitoring?: boolean;
    compliance?: boolean;
    observability?: boolean;
    plugins?: boolean;
    versioning?: boolean;
    datacenterOrchestration?: boolean;
  };
  datacenter?: {
    primaryRegion: string;
    secondaryRegions?: string[];
    affinityRules?: {
      preferLocal?: boolean;
      maxLatency?: number;
      avoidRegions?: string[];
    };
  };
};

export type WorkerInstance = {
  worker: Worker;
  config: WorkerFactoryConfig;
  startedAt: Date;
  status: 'running' | 'stopped' | 'sleeping' | 'draining';
};

type RedisEnvConfig = {
  env: true;
  host?: string;
  port?: string;
  password?: string;
  db?: string;
};

type RedisConfigInput = RedisConfig | RedisEnvConfig;

type ObservabilityConfigInput =
  | ObservabilityConfig
  | {
      enabled?: boolean;
      prometheus?: Partial<ObservabilityConfig['prometheus']>;
      openTelemetry?: Partial<ObservabilityConfig['openTelemetry']>;
      datadog?: Partial<ObservabilityConfig['datadog']>;
    };

// Internal state
const workers = new Map<string, WorkerInstance>();

const recordMetricSafely = (
  workerName: string,
  metricType: Parameters<typeof WorkerMetrics.record>[1],
  value: number,
  metadata?: Record<string, unknown>
): void => {
  WorkerMetrics.record(workerName, metricType, value, metadata).catch((error) => {
    Logger.error(`Failed to record worker metric: ${workerName}/${metricType}`, error);
  });
};

type BeforeProcessHookOutcome = {
  skip: boolean;
  reason?: string;
  jobData?: unknown;
};

const ensureCircuitAllowsExecution = (
  workerName: string,
  version: string,
  jobId: string | number | undefined,
  features?: WorkerFactoryConfig['features']
): void => {
  if (!(features?.circuitBreaker ?? false)) return;

  const canExecute = CircuitBreaker.canExecute(workerName, version);
  if (canExecute) return;

  const state = CircuitBreaker.getState(workerName, version);
  Logger.warn('Circuit breaker is open, rejecting job', {
    workerName,
    version,
    jobId,
    circuitState: state?.state,
  });

  CircuitBreaker.recordRejection(workerName, version);
  throw ErrorFactory.createGeneralError(`Circuit breaker is open for ${workerName}@${version}`);
};

const runBeforeProcessHooks = async (
  workerName: string,
  job: Job,
  features?: WorkerFactoryConfig['features']
): Promise<BeforeProcessHookOutcome> => {
  if (!(features?.plugins ?? false)) {
    return { skip: false, jobData: job.data };
  }

  const hookResult = await PluginManager.executeHook('beforeProcess', {
    workerName,
    jobId: job.id ?? '',
    jobData: job.data,
    timestamp: new Date(),
  });

  if (hookResult.stopped) {
    const errorMessage = hookResult.errors[0]?.error?.message ?? 'Stopped by plugin';
    Logger.info('Job processing stopped by plugin', {
      workerName,
      jobId: job.id,
      reason: errorMessage,
    });
    return { skip: true, reason: errorMessage };
  }

  if (hookResult.modified) {
    return { skip: false, jobData: hookResult.context.jobData };
  }

  return { skip: false, jobData: job.data };
};

const startProcessingSpan = (
  workerName: string,
  version: string,
  job: Job,
  queueName: string,
  features?: WorkerFactoryConfig['features']
): string | null => {
  if (!(features?.observability ?? false)) return null;

  return Observability.startSpan(`worker.${workerName}.process`, {
    attributes: {
      worker_name: workerName,
      worker_version: version,
      job_id: job.id ?? '',
      queue_name: queueName,
    },
  });
};

const usePluginManager = async (
  workerName: string,
  job: { id: string; data: unknown },
  result: unknown
): Promise<void> => {
  await PluginManager.executeHook('afterProcess', {
    workerName,
    jobId: job.id ?? '',
    jobData: job.data,
    metadata: { result },
    timestamp: new Date(),
  });

  await PluginManager.executeHook('onComplete', {
    workerName,
    jobId: job.id ?? '',
    jobData: job.data,
    metadata: { result },
    timestamp: new Date(),
  });
};

const handleSuccess = async (params: {
  workerName: string;
  jobVersion: string;
  job: Job;
  result: unknown;
  duration: number;
  spanId: string | null;
  features?: WorkerFactoryConfig['features'];
}): Promise<void> => {
  const { workerName, jobVersion, job, result, duration, spanId, features } = params;

  if (features?.metrics ?? false) {
    recordMetricSafely(workerName, 'processed', 1);
    recordMetricSafely(workerName, 'duration', duration);
  }

  if (features?.circuitBreaker ?? false) {
    CircuitBreaker.recordSuccess(workerName, jobVersion);
  }

  if (features?.observability ?? false) {
    Observability.recordJobMetrics(workerName, job.name, {
      processed: 1,
      failed: 0,
      durationMs: duration,
    });
    if (spanId !== null) {
      Observability.endSpan(spanId, { success: true });
    }
  }

  if (features?.plugins ?? false) {
    await usePluginManager(workerName, { id: job.id ?? '', data: job.data }, result);
  }
};

const recordFailureMetrics = (
  workerName: string,
  _jobVersion: string,
  duration: number,
  features?: WorkerFactoryConfig['features']
): void => {
  if (features?.metrics === true) {
    recordMetricSafely(workerName, 'errors', 1);
    recordMetricSafely(workerName, 'duration', duration);
  }
};

const recordFailureObservability = (
  workerName: string,
  jobName: string,
  duration: number,
  spanId: string | null,
  features?: WorkerFactoryConfig['features']
): void => {
  if (features?.observability === true) {
    Observability.recordJobMetrics(workerName, jobName, {
      processed: 0,
      failed: 1,
      durationMs: duration,
    });
    if (spanId !== null) {
      Observability.recordSpanError(
        spanId,
        ErrorFactory.createGeneralError('Job processing failed')
      );
      Observability.endSpan(spanId, { success: false });
    }
  }
};

const addFailedJobToDeadLetterQueue = async (
  workerName: string,
  job: Job,
  error: Error,
  duration: number,
  jobVersion: string,
  queueName: string,
  features?: WorkerFactoryConfig['features']
): Promise<void> => {
  if (features?.deadLetterQueue === true) {
    await DeadLetterQueue.addFailedJob({
      id: job.id ?? '',
      queueName,
      workerName,
      jobName: job.name,
      data: job.data,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      attemptsMade: job.attemptsMade ?? 0,
      maxAttempts: job.opts.attempts ?? 0,
      failedAt: new Date(),
      firstAttemptAt: new Date(job.timestamp ?? Date.now()),
      lastAttemptAt: new Date(),
      processingTime: duration,
      metadata: {
        version: jobVersion,
      },
      complianceFlags: {
        containsPII: false,
        containsPHI: false,
        dataClassification: 'public',
      },
    });
  }
};

const executeFailurePlugins = async (
  workerName: string,
  job: Job,
  error: Error,
  features?: WorkerFactoryConfig['features']
): Promise<void> => {
  if (features?.plugins === true) {
    await PluginManager.executeHook('onError', {
      workerName,
      jobId: job.id ?? '',
      jobData: job.data,
      error,
      timestamp: new Date(),
    });
  }
};

const recordCircuitBreakerFailure = (
  workerName: string,
  jobVersion: string,
  error: Error,
  features?: WorkerFactoryConfig['features']
): void => {
  if (features?.circuitBreaker === true) {
    CircuitBreaker.recordFailure(workerName, jobVersion, error);
  }
};

const logAndRecordFailure = (
  workerName: string,
  jobVersion: string,
  job: Job,
  error: Error,
  features?: WorkerFactoryConfig['features']
): void => {
  Logger.error(
    `Worker job failed: ${workerName}`,
    { error, jobId: job.id, version: jobVersion },
    'workers'
  );
  recordCircuitBreakerFailure(workerName, jobVersion, error, features);
};

const recordFailureObservabilityAndMetrics = (params: {
  workerName: string;
  jobVersion: string;
  jobName: string;
  duration: number;
  spanId: string | null;
  features?: WorkerFactoryConfig['features'];
}): void => {
  const { workerName, jobVersion, jobName, duration, spanId, features } = params;

  recordFailureMetrics(workerName, jobVersion, duration, features);
  recordFailureObservability(workerName, jobName, duration, spanId, features);
};

const executeAllFailureHandlers = async (params: {
  workerName: string;
  jobVersion: string;
  job: Job;
  error: Error;
  duration: number;
  spanId: string | null;
  features?: WorkerFactoryConfig['features'];
  queueName: string;
}): Promise<void> => {
  const { workerName, jobVersion, job, error, duration, spanId, features, queueName } = params;

  recordFailureObservabilityAndMetrics({
    workerName,
    jobVersion,
    jobName: job.name,
    duration,
    spanId,
    features,
  });

  if (features?.deadLetterQueue === true) {
    await addFailedJobToDeadLetterQueue(
      workerName,
      job,
      error,
      duration,
      jobVersion,
      queueName,
      features
    );
  }
};

const handleFailure = async (params: {
  workerName: string;
  jobVersion: string;
  job: Job;
  error: Error;
  duration: number;
  spanId: string | null;
  features?: WorkerFactoryConfig['features'];
  queueName: string;
}): Promise<void> => {
  const { workerName, jobVersion, job, error, features } = params;

  logAndRecordFailure(workerName, jobVersion, job, error, features);
  await executeAllFailureHandlers(params);
  await executeFailurePlugins(workerName, job, error, features);
};

/**
 * Helper: Create enhanced processor with all features
 */
const createEnhancedProcessor = (config: WorkerFactoryConfig): ((job: Job) => Promise<unknown>) => {
  return async (job: Job): Promise<unknown> => {
    const { name, version, processor, features } = config;
    const jobVersion = version ?? '1.0.0';

    ensureCircuitAllowsExecution(name, jobVersion, job.id, features);

    const beforeOutcome = await runBeforeProcessHooks(name, job, features);
    if (beforeOutcome.skip) {
      return { skipped: true, reason: beforeOutcome.reason };
    }

    if (beforeOutcome.jobData !== undefined) {
      job.data = beforeOutcome.jobData;
    }

    const startTime = Date.now();
    let result: unknown;
    let spanId: string | null = null;

    try {
      spanId = startProcessingSpan(name, jobVersion, job, config.queueName, features);

      // Process the job
      result = await processor(job);

      const duration = Date.now() - startTime;
      await handleSuccess({
        workerName: name,
        jobVersion,
        job,
        result,
        duration,
        spanId,
        features,
      });

      return result;
    } catch (err) {
      const error = err as Error;
      const duration = Date.now() - startTime;

      await handleFailure({
        workerName: name,
        jobVersion,
        job,
        error,
        duration,
        spanId,
        features,
        queueName: config.queueName,
      });

      throw error;
    }
  };
};

const requireInfrastructure = <T>(value: T | null | undefined, message: string): T => {
  if (value === null || value === undefined) {
    throw ErrorFactory.createConfigError(message);
  }
  return value;
};

const resolveEnvString = (envKey: string | undefined, fallback: string): string => {
  if (!envKey) return fallback;
  return Env.get(envKey, fallback);
};

const resolveEnvInt = (envKey: string | undefined, fallback: number): number => {
  if (!envKey) return fallback;
  return Env.getInt(envKey, fallback);
};

const isRedisEnvConfig = (config: RedisConfigInput): config is RedisEnvConfig =>
  (config as RedisEnvConfig).env === true;

const resolveRedisConfig = (config: RedisConfigInput, context: string): RedisConfig => {
  if (isRedisEnvConfig(config)) {
    const host = resolveEnvString(config.host ?? 'REDIS_HOST', '127.0.0.1');
    const port = resolveEnvInt(config.port ?? 'REDIS_PORT', 6379);
    const db = resolveEnvInt(config.db ?? 'REDIS_DB', 0);
    const password = resolveEnvString(
      config.password ?? 'REDIS_PASSWORD',
      Env.get('REDIS_PASSWORD', '')
    );

    if (!host) {
      throw ErrorFactory.createConfigError(`${context}.host is required`);
    }

    return {
      host,
      port,
      db,
      password: password || undefined,
    };
  }

  if (!config.host) {
    throw ErrorFactory.createConfigError(`${context}.host is required`);
  }

  return {
    host: config.host,
    port: config.port,
    db: config.db,
    password: config.password ?? Env.get('REDIS_PASSWORD', undefined),
  };
};

const resolveRedisConfigWithFallback = (
  primary: RedisConfigInput | undefined,
  fallback: RedisConfigInput | undefined,
  errorMessage: string,
  context: string
): RedisConfig => {
  const selected = primary ?? fallback;
  if (!selected) {
    throw ErrorFactory.createConfigError(errorMessage);
  }

  return resolveRedisConfig(selected, context);
};

const buildDefaultAutoScalerConfig = (): AutoScalerConfig => ({
  enabled: workersConfig.autoScaling.enabled,
  checkInterval: workersConfig.autoScaling.interval,
  scalingPolicies: new Map(),
  costOptimization: {
    enabled: workersConfig.costOptimization.enabled,
    maxCostPerHour: 0,
    preferSpotInstances: workersConfig.costOptimization.spotInstances,
    offPeakSchedule: {
      start: workersConfig.autoScaling.offPeakSchedule.split('-')[0] ?? '22:00',
      end: workersConfig.autoScaling.offPeakSchedule.split('-')[1] ?? '06:00',
      timezone: 'UTC',
      reductionPercentage: Math.round(workersConfig.autoScaling.offPeakReduction * 100),
    },
    budgetAlerts: {
      dailyLimit: 0,
      weeklyLimit: 0,
      monthlyLimit: 0,
    },
  },
});

const resolveAutoScalerConfig = (input: AutoScalerConfig | undefined): AutoScalerConfig => {
  const defaults = buildDefaultAutoScalerConfig();
  if (!input) return defaults;

  const defaultOffPeakSchedule = defaults.costOptimization.offPeakSchedule ?? {
    start: '22:00',
    end: '06:00',
    timezone: 'UTC',
    reductionPercentage: 0,
  };

  const resolvedOffPeakSchedule = {
    start: input.costOptimization?.offPeakSchedule?.start ?? defaultOffPeakSchedule.start,
    end: input.costOptimization?.offPeakSchedule?.end ?? defaultOffPeakSchedule.end,
    timezone: input.costOptimization?.offPeakSchedule?.timezone ?? defaultOffPeakSchedule.timezone,
    reductionPercentage:
      input.costOptimization?.offPeakSchedule?.reductionPercentage ??
      defaultOffPeakSchedule.reductionPercentage,
  };

  return {
    ...defaults,
    ...input,
    costOptimization: {
      ...defaults.costOptimization,
      ...input.costOptimization,
      offPeakSchedule: {
        ...resolvedOffPeakSchedule,
      },
      budgetAlerts: {
        ...defaults.costOptimization.budgetAlerts,
        ...input.costOptimization?.budgetAlerts,
      },
    },
  };
};

const resolveWorkerOptions = (config: WorkerFactoryConfig): WorkerOptions => {
  const options = config.options ? { ...config.options } : ({} as WorkerOptions);
  if (options.connection) return options;

  const redisConfig = resolveRedisConfigWithFallback(
    config.infrastructure?.redis,
    undefined,
    'Worker requires a connection. Provide options.connection or infrastructure.redis config',
    'infrastructure.redis'
  );

  return {
    ...options,
    connection: {
      host: redisConfig.host,
      port: redisConfig.port,
      db: redisConfig.db,
      password: redisConfig.password,
    },
  };
};

const buildDefaultObservabilityConfig = (): ObservabilityConfig => ({
  prometheus: {
    enabled: workersConfig.observability.prometheus.enabled,
    port: workersConfig.observability.prometheus.port,
  },
  openTelemetry: {
    enabled: workersConfig.observability.opentelemetry.enabled,
    serviceName: 'zintrust-workers',
    exporterUrl: workersConfig.observability.opentelemetry.endpoint,
  },
  datadog: {
    enabled: workersConfig.observability.datadog.enabled,
    tags: workersConfig.observability.datadog.apiKey
      ? [`apiKey:${workersConfig.observability.datadog.apiKey}`]
      : undefined,
  },
});

const resolveObservabilityConfig = (
  input: ObservabilityConfigInput | undefined
): ObservabilityConfig => {
  const defaults = buildDefaultObservabilityConfig();
  if (!input) return defaults;

  const enabledOverride = 'enabled' in input ? input.enabled : undefined;

  const prometheus = { ...defaults.prometheus };
  if (input.prometheus) {
    Object.assign(prometheus, input.prometheus);
  }

  const openTelemetry = { ...defaults.openTelemetry };
  if (input.openTelemetry) {
    Object.assign(openTelemetry, input.openTelemetry);
  }

  const datadog = { ...defaults.datadog };
  if (input.datadog) {
    Object.assign(datadog, input.datadog);
  }

  if (enabledOverride === false) {
    prometheus.enabled = false;
    openTelemetry.enabled = false;
    datadog.enabled = false;
  } else if (enabledOverride === true) {
    prometheus.enabled = true;
    openTelemetry.enabled = true;
    datadog.enabled = true;
  }

  if (!openTelemetry.serviceName) {
    openTelemetry.serviceName = defaults.openTelemetry.serviceName;
  }

  return { prometheus, openTelemetry, datadog };
};

const initializeClustering = (config: WorkerFactoryConfig): void => {
  if (!(config.features?.clustering ?? false)) return;
  const redisConfig = resolveRedisConfigWithFallback(
    config.infrastructure?.redis,
    undefined,
    'ClusterLock requires infrastructure.redis config',
    'infrastructure.redis'
  );
  ClusterLock.initialize(redisConfig);
};

const initializeMetrics = (config: WorkerFactoryConfig): void => {
  if (!(config.features?.metrics ?? false)) return;
  const redisConfig = resolveRedisConfigWithFallback(
    config.infrastructure?.redis,
    undefined,
    'WorkerMetrics requires infrastructure.redis config',
    'infrastructure.redis'
  );
  WorkerMetrics.initialize(redisConfig);
};

const initializeAutoScaling = (config: WorkerFactoryConfig): void => {
  if (!(config.features?.autoScaling ?? false)) return;

  const autoScalerConfig = resolveAutoScalerConfig(config.infrastructure?.autoScaler);

  AutoScaler.initialize(autoScalerConfig);
};

const initializeCircuitBreaker = (config: WorkerFactoryConfig, version: string): void => {
  if (!(config.features?.circuitBreaker ?? false)) return;
  CircuitBreaker.initialize(config.name, version);
};

const initializeDeadLetterQueue = (config: WorkerFactoryConfig): void => {
  if (!(config.features?.deadLetterQueue ?? false)) return;
  const dlqConfig = requireInfrastructure(
    config.infrastructure?.deadLetterQueue,
    'DeadLetterQueue requires infrastructure.deadLetterQueue config'
  );
  const dlqRedisConfig = resolveRedisConfigWithFallback(
    dlqConfig.redis,
    config.infrastructure?.redis,
    'DeadLetterQueue requires infrastructure.deadLetterQueue.redis or infrastructure.redis config',
    'infrastructure.deadLetterQueue.redis'
  );
  DeadLetterQueue.initialize(dlqRedisConfig, dlqConfig.policy);
};

const initializeResourceMonitoring = (config: WorkerFactoryConfig): void => {
  if (!(config.features?.resourceMonitoring ?? false)) return;
  ResourceMonitor.initialize();
  ResourceMonitor.start();
};

const initializeCompliance = (config: WorkerFactoryConfig): void => {
  if (!(config.features?.compliance ?? false)) return;
  const complianceConfig = requireInfrastructure(
    config.infrastructure?.compliance,
    'ComplianceManager requires infrastructure.compliance config'
  );
  const complianceRedisConfig = resolveRedisConfigWithFallback(
    complianceConfig.redis,
    config.infrastructure?.redis,
    'ComplianceManager requires infrastructure.compliance.redis or infrastructure.redis config',
    'infrastructure.compliance.redis'
  );
  ComplianceManager.initialize(complianceRedisConfig, complianceConfig.config);
};

const initializeObservability = async (config: WorkerFactoryConfig): Promise<void> => {
  if (!(config.features?.observability ?? false)) return;
  const observabilityConfig = resolveObservabilityConfig(config.infrastructure?.observability);
  await Observability.initialize(observabilityConfig);
};

const initializeVersioning = (config: WorkerFactoryConfig, version: string): void => {
  if (!(config.features?.versioning ?? false)) return;
  WorkerVersioning.register({
    workerName: config.name,
    version: WorkerVersioning.parse(version),
    changelog: 'Initial version',
  });
};

const initializeDatacenter = (config: WorkerFactoryConfig): void => {
  if (!(config.features?.datacenterOrchestration ?? false) || !config.datacenter) return;
  DatacenterOrchestrator.placeWorker({
    workerName: config.name,
    primaryRegion: config.datacenter.primaryRegion,
    secondaryRegions: config.datacenter.secondaryRegions ?? [],
    replicationStrategy: 'active-passive',
    affinityRules: {
      preferLocal: config.datacenter.affinityRules?.preferLocal ?? true,
      maxLatency: config.datacenter.affinityRules?.maxLatency,
      avoidRegions: config.datacenter.affinityRules?.avoidRegions,
    },
  });
};

const setupWorkerEventListeners = (
  worker: Worker,
  workerName: string,
  workerVersion: string,
  features?: WorkerFactoryConfig['features']
): void => {
  worker.on('completed', (job: Job) => {
    Logger.debug(`Job completed: ${workerName}`, { jobId: job.id });

    if (features?.observability === true) {
      Observability.incrementCounter('worker.jobs.completed', 1, {
        worker: workerName,
        version: workerVersion,
      });
    }
  });

  worker.on('failed', (job: Job | undefined, error: Error) => {
    Logger.error(`Job failed: ${workerName}`, { error, jobId: job?.id }, 'workers');

    if (features?.observability === true) {
      Observability.incrementCounter('worker.jobs.failed', 1, {
        worker: workerName,
        version: workerVersion,
      });
    }
  });

  worker.on('error', (error: Error) => {
    Logger.error(`Worker error: ${workerName}`, error);
  });
};

const registerWorkerInstance = (params: {
  worker: Worker;
  config: WorkerFactoryConfig;
  workerVersion: string;
  queueName: string;
  options?: WorkerOptions;
}): void => {
  const { worker, config, workerVersion, queueName, options } = params;

  WorkerRegistry.register({
    name: config.name,
    config: {},
    version: workerVersion,
    region: config.datacenter?.primaryRegion,
    queues: [queueName],
    factory: async (): Promise<RegistryWorkerInstance> => {
      await Promise.resolve();
      return {
        metadata: {
          name: config.name,
          status: 'running',
          version: workerVersion,
          region: config.datacenter?.primaryRegion ?? 'unknown',
          queueName,
          concurrency: options?.concurrency ?? 1,
          startedAt: new Date(),
          stoppedAt: null,
          lastProcessedAt: null,
          restartCount: 0,
          processedCount: 0,
          errorCount: 0,
          lockKey: null,
          priority: 0,
          memoryUsage: 0,
          cpuUsage: 0,
          circuitState: 'closed',
          queues: [queueName],
          plugins: [],
          datacenter: config.datacenter?.primaryRegion ?? 'unknown',
          canaryPercentage: 0,
          config: {},
        },
        instance: worker,
        start: (): void => undefined,
        stop: async (): Promise<void> => worker.close(),
        drain: async (): Promise<void> => worker.close(),
        sleep: async (): Promise<void> => worker.pause(),
        wakeup: (): void => {
          worker.resume();
        },
        getStatus: (): WorkerStatus => 'running',
        getHealth: (): 'green' | 'yellow' | 'red' => 'green',
      };
    },
  });
};

/**
 * Worker Factory - Sealed namespace
 */
export const WorkerFactory = Object.freeze({
  /**
   * Create worker with all features
   */
  async create(config: WorkerFactoryConfig): Promise<Worker> {
    const { name, version, queueName, features } = config;
    const workerVersion = version ?? '1.0.0';

    if (workers.has(name)) {
      throw ErrorFactory.createWorkerError(`Worker "${name}" already exists`);
    }

    initializeClustering(config);
    initializeMetrics(config);
    initializeAutoScaling(config);
    initializeCircuitBreaker(config, workerVersion);
    initializeDeadLetterQueue(config);
    initializeResourceMonitoring(config);
    initializeCompliance(config);
    await initializeObservability(config);
    initializeVersioning(config, workerVersion);
    initializeDatacenter(config);

    // Create enhanced processor
    const enhancedProcessor = createEnhancedProcessor(config);

    // Create BullMQ worker
    const resolvedOptions = resolveWorkerOptions(config);
    const worker = new Worker(queueName, enhancedProcessor, resolvedOptions);

    setupWorkerEventListeners(worker, name, workerVersion, features);

    // Store worker instance
    const instance: WorkerInstance = {
      worker,
      config,
      startedAt: new Date(),
      status: 'running',
    };

    workers.set(name, instance);

    registerWorkerInstance({
      worker,
      config,
      workerVersion,
      queueName,
      options: resolvedOptions,
    });

    await WorkerRegistry.start(name, workerVersion);

    // Execute afterStart hooks
    if (features?.plugins === true) {
      await PluginManager.executeHook('afterStart', {
        workerName: name,
        timestamp: new Date(),
      });
    }

    Logger.info(`Worker created: ${name}@${workerVersion}`, {
      queueName,
      features: Object.keys(features ?? {}).filter(
        (k) => features?.[k as keyof typeof features] === true
      ),
    });

    return worker;
  },

  /**
   * Get worker instance
   */
  get(name: string): WorkerInstance | null {
    const instance = workers.get(name);
    return instance ? { ...instance } : null;
  },

  /**
   * Stop worker
   */
  async stop(name: string): Promise<void> {
    const instance = workers.get(name);

    if (!instance) {
      throw ErrorFactory.createNotFoundError(`Worker "${name}" not found`);
    }

    // Execute beforeStop hooks
    if (instance.config.features?.plugins !== undefined) {
      await PluginManager.executeHook('beforeStop', {
        workerName: name,
        timestamp: new Date(),
      });
    }

    await instance.worker.close();
    instance.status = 'stopped';

    await WorkerRegistry.stop(name);

    // Execute afterStop hooks
    if (instance.config.features?.plugins !== undefined) {
      await PluginManager.executeHook('afterStop', {
        workerName: name,
        timestamp: new Date(),
      });
    }

    Logger.info(`Worker stopped: ${name}`);
  },

  /**
   * Restart worker
   */
  async restart(name: string): Promise<void> {
    await WorkerFactory.stop(name);
    const instance = workers.get(name);

    if (!instance) {
      throw ErrorFactory.createNotFoundError(`Worker "${name}" not found`);
    }

    const newWorker = await WorkerFactory.create(instance.config);
    instance.worker = newWorker;
    instance.status = 'running';
    instance.startedAt = new Date();

    Logger.info(`Worker restarted: ${name}`);
  },

  /**
   * Pause worker
   */
  async pause(name: string): Promise<void> {
    const instance = workers.get(name);

    if (!instance) {
      throw ErrorFactory.createNotFoundError(`Worker "${name}" not found`);
    }

    await instance.worker.pause();
    instance.status = 'sleeping';

    Logger.info(`Worker paused: ${name}`);
  },

  /**
   * Resume worker
   */
  resume(name: string): void {
    const instance = workers.get(name);

    if (!instance) {
      throw ErrorFactory.createNotFoundError(`Worker "${name}" not found`);
    }

    instance.worker.resume();
    instance.status = 'running';

    Logger.info(`Worker resumed: ${name}`);
  },

  /**
   * List all workers
   */
  list(): string[] {
    return Array.from(workers.keys());
  },

  /**
   * Remove worker
   */
  async remove(name: string): Promise<void> {
    const instance = workers.get(name);

    if (!instance) {
      throw ErrorFactory.createNotFoundError(`Worker "${name}" not found`);
    }

    await WorkerFactory.stop(name);
    const registry = WorkerRegistry as { unregister?: (name: string) => void };
    registry.unregister?.(name);
    AutoScaler.clearHistory(name);
    ResourceMonitor.clearHistory(name);
    CircuitBreaker.deleteWorker(name);
    CanaryController.purge(name);
    WorkerVersioning.clear(name);
    DatacenterOrchestrator.removeWorker(name);
    await Observability.clearWorkerMetrics(name);
    workers.delete(name);

    Logger.info(`Worker removed: ${name}`);
  },

  /**
   * Get worker metrics
   */
  async getMetrics(name: string): Promise<unknown> {
    const instance = workers.get(name);

    if (!instance) {
      throw ErrorFactory.createNotFoundError(`Worker "${name}" not found`);
    }

    if (instance.config.features?.metrics === undefined || !instance.config.features?.metrics) {
      return null;
    }

    const now = Date.now();
    const oneHourAgo = now - 3600 * 1000;

    const metrics = await WorkerMetrics.aggregate({
      workerName: name,
      metricType: 'processed',
      granularity: 'hourly',
      startDate: new Date(oneHourAgo),
      endDate: new Date(now),
    });

    return metrics;
  },

  /**
   * Get worker health
   */
  async getHealth(name: string): Promise<unknown> {
    const instance = workers.get(name);

    if (!instance) {
      throw ErrorFactory.createNotFoundError(`Worker "${name}" not found`);
    }

    if (!(instance.config.features?.metrics ?? false)) {
      return { status: 'unknown' };
    }

    const health = await WorkerMetrics.getLatestHealth(name);

    return health;
  },

  /**
   * Shutdown all workers
   */
  async shutdown(): Promise<void> {
    Logger.info('WorkerFactory shutting down...');

    const workerNames = Array.from(workers.keys());

    await Promise.all(workerNames.map(async (name) => WorkerFactory.stop(name)));

    // Shutdown all modules
    ResourceMonitor.stop();
    await WorkerMetrics.shutdown();
    await MultiQueueWorker.shutdown();
    await ComplianceManager.shutdown();
    await PriorityQueue.shutdown();
    HealthMonitor.shutdown();
    AutoScaler.stop();
    ClusterLock.shutdown();
    WorkerVersioning.shutdown();
    CanaryController.shutdown();
    DatacenterOrchestrator.shutdown();
    PluginManager.shutdown();
    Observability.shutdown();
    await DeadLetterQueue.shutdown();
    CircuitBreaker.shutdown();

    workers.clear();

    Logger.info('WorkerFactory shutdown complete');
  },
});

// Graceful shutdown handled by WorkerShutdown
