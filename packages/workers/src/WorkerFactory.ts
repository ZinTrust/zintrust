/**
 * Worker Factory
 * Central factory for creating workers with all advanced features
 * Sealed namespace for immutability
 */

import {
  appConfig,
  Cloudflare,
  createRedisConnection,
  databaseConfig,
  Env,
  ErrorFactory,
  getBullMQSafeQueueName,
  Logger,
  NodeSingletons,
  queueConfig,
  registerDatabasesFromRuntimeConfig,
  useEnsureDbConnected,
  workersConfig,
  ZintrustLang,
  type IDatabase,
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
import {
  DbWorkerStore,
  InMemoryWorkerStore,
  RedisWorkerStore,
  type WorkerRecord,
  type WorkerStore,
} from './storage/WorkerStore';

const path = NodeSingletons.path;

const getStoreForWorker = async (
  config: WorkerFactoryConfig | undefined,
  persistenceOverride?: WorkerPersistenceConfig
): Promise<WorkerStore> => {
  if (persistenceOverride) {
    return resolveWorkerStoreForPersistence(persistenceOverride);
  }

  // If worker has specific configuration, use it
  if (config) {
    const persistence = resolvePersistenceConfig(config);
    if (persistence) {
      return resolveWorkerStoreForPersistence(persistence);
    }
  }

  // Fallback to default/global store
  await ensureWorkerStoreConfigured();
  return workerStore;
};

const validateAndGetStore = async (
  name: string,
  config: WorkerFactoryConfig | undefined,
  persistenceOverride?: WorkerPersistenceConfig
): Promise<WorkerStore> => {
  const store = await getStoreForWorker(config, persistenceOverride);
  const record = await store.get(name);
  if (!record) {
    throw ErrorFactory.createNotFoundError(
      `Worker "${name}" not found in the specified driver. Ensure you are addressing the correct storage backend.`
    );
  }
  return store;
};

// Worker creation status enum for proper lifecycle management
export const WorkerCreationStatus = {
  CREATING: 'creating', // Initial state - worker is being created
  CONNECTING: 'connecting', // Connecting to Redis/Queue
  STARTING: 'starting', // Starting BullMQ worker
  RUNNING: 'running', // Actually processing jobs
  FAILED: 'failed', // Connection/startup failed
  STOPPED: 'stopped', // Intentionally stopped
} as const;

export type WorkerCreationStatus = (typeof WorkerCreationStatus)[keyof typeof WorkerCreationStatus];

// Internal initialization state to prevent memory leaks and redundant calls
let clusteringInitialized = false;
let metricsInitialized = false;
let autoScalingInitialized = false;
let deadLetterQueueInitialized = false;
let resourceMonitoringInitialized = false;
let complianceInitialized = false;
let observabilityInitialized = false;

export type WorkerFactoryConfig = {
  name: string;
  version?: string;
  queueName: string;
  processor: (job: Job) => Promise<unknown>;
  processorSpec?: string;
  options?: WorkerOptions;
  autoStart?: boolean;
  activeStatus?: boolean;
  infrastructure?: {
    redis?: RedisConfigInput;
    persistence?: WorkerPersistenceConfig;
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
  status: WorkerCreationStatus;
  lastHealthCheck?: Date;
  connectionState?: 'disconnected' | 'connecting' | 'connected' | 'error';
};

type RedisEnvConfig = {
  env?: true;
  host?: string;
  port?: number;
  password?: string;
  db?: string;
};

type RedisConfigInput = RedisConfig | RedisEnvConfig;

export type WorkerPersistenceConfig =
  | { driver: 'memory' }
  | { driver: 'redis'; redis?: RedisConfigInput; keyPrefix?: string }
  | { driver: 'database'; client?: IDatabase | string; connection?: string; table?: string };

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
let workerStore: WorkerStore = InMemoryWorkerStore.create();
let workerStoreConfigured = false;
let workerStoreConfig: WorkerPersistenceConfig | null = null;

export type ProcessorResolver = (
  name: string
) =>
  | WorkerFactoryConfig['processor']
  | undefined
  | Promise<WorkerFactoryConfig['processor'] | undefined>;

const processorRegistry = new Map<string, WorkerFactoryConfig['processor']>();
const processorPathRegistry = new Map<string, string>();
const processorResolvers: ProcessorResolver[] = [];
const processorSpecRegistry = new Map<string, WorkerFactoryConfig['processor']>();

type CachedProcessor = {
  code: string;
  processor: WorkerFactoryConfig['processor'];
  etag?: string;
  cachedAt: number;
  expiresAt: number;
  size: number;
  lastAccess: number;
};

const processorCache = new Map<string, CachedProcessor>();
let processorCacheSize = 0;

const buildPersistenceBootstrapConfig = (): WorkerFactoryConfig => {
  const driver = Env.get('WORKER_PERSISTENCE_DRIVER', 'memory') as 'memory' | 'redis' | 'database';

  const config: WorkerFactoryConfig = {
    name: '__zintrust_persistence_bootstrap__',
    queueName: '__zintrust_bootstrap__',
    processor: async () => undefined,
    infrastructure: {
      persistence: {
        driver,
      },
    },
  };

  // Add Redis config if using Redis persistence
  if (driver === 'redis') {
    config.infrastructure = {
      ...config.infrastructure,
      redis: queueConfig.drivers.redis,
    };
  }

  return config;
};

const registerProcessor = (name: string, processor: WorkerFactoryConfig['processor']): void => {
  processorRegistry.set(name, processor);
};

const registerProcessors = (processors: Record<string, WorkerFactoryConfig['processor']>): void => {
  Object.entries(processors).forEach(([name, processor]) => {
    if (typeof processor === 'function') {
      processorRegistry.set(name, processor);
    }
  });
};

const registerProcessorPaths = (paths: Record<string, string>): void => {
  Object.entries(paths).forEach(([name, modulePath]) => {
    if (typeof modulePath === 'string' && modulePath.trim().length > 0) {
      processorPathRegistry.set(name, modulePath);
    }
  });
};

const registerProcessorResolver = (resolver: ProcessorResolver): void => {
  processorResolvers.push(resolver);
};

const registerProcessorSpec = (spec: string, processor: WorkerFactoryConfig['processor']): void => {
  if (!spec || typeof processor !== 'function') return;
  processorSpecRegistry.set(normalizeProcessorSpec(spec), processor);
};

const decodeProcessorPathEntities = (value: string): string =>
  value
    .replaceAll(/&#x2F;/gi, '/')
    .replaceAll('&#47;', '/')
    .replaceAll(/&sol;/gi, '/');

const isUrlSpec = (spec: string): boolean => {
  if (spec.startsWith('url:')) return true;
  return spec.includes('://');
};

const normalizeProcessorSpec = (spec: string): string =>
  spec.startsWith('url:') ? spec.slice(4) : spec;

const parseCacheControl = (value: string | null): { maxAge?: number } => {
  if (!value) return {};
  const parts = value.split(',').map((part) => part.trim().toLowerCase());
  const maxAge = parts.find((part) => part.startsWith('max-age='));
  if (!maxAge) return {};
  const raw = maxAge.split('=')[1];
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) ? { maxAge: parsed } : {};
};

const getProcessorSpecConfig = (): typeof workersConfig.processorSpec =>
  workersConfig.processorSpec;

const computeSha256 = async (value: string): Promise<string> => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(value);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  if (typeof NodeSingletons.createHash === 'function') {
    return NodeSingletons.createHash('sha256').update(value).digest('hex');
  }

  return String(Math.random()).slice(2);
};

const toBase64 = (value: string): string => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf-8').toString('base64');
  }

  if (typeof globalThis !== 'undefined' && typeof globalThis.btoa === 'function') {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCodePoint(byte);
    });
    return globalThis.btoa(binary);
  }

  return value;
};

const getCachedProcessor = (key: string): CachedProcessor | null => {
  const entry = processorCache.get(key);
  if (!entry) return null;
  const now = Date.now();
  if (entry.expiresAt <= now) {
    processorCache.delete(key);
    processorCacheSize -= entry.size;
    return null;
  }
  entry.lastAccess = now;
  return entry;
};

const evictCacheIfNeeded = (maxSize: number): void => {
  if (processorCacheSize <= maxSize) return;
  const entries = Array.from(processorCache.entries());
  entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);
  for (const [key, entry] of entries) {
    if (processorCacheSize <= maxSize) break;
    processorCache.delete(key);
    processorCacheSize -= entry.size;
  }
};

const setCachedProcessor = (key: string, entry: CachedProcessor, maxSize: number): void => {
  const existing = processorCache.get(key);
  if (existing) {
    processorCacheSize -= existing.size;
  }
  processorCache.set(key, entry);
  processorCacheSize += entry.size;
  evictCacheIfNeeded(maxSize);
};

const isAllowedRemoteHost = (host: string): boolean => {
  const allowlist = getProcessorSpecConfig().remoteAllowlist.map((value) => value.toLowerCase());
  return allowlist.includes(host.toLowerCase());
};

const waitForWorkerConnection = async (
  worker: Worker,
  name: string,
  _queueName: string,
  timeoutMs: number
): Promise<void> => {
  const startTime = Date.now();
  const checkInterval = 100; // 100ms between checks
  let timeoutId: NodeJS.Timeout | null = null;

  return new Promise<void>((resolve, reject) => {
    const checkConnection = async (): Promise<void> => {
      try {
        // Check if worker is actually running
        const isRunning = await worker.isRunning();
        if (!isRunning) {
          throw ErrorFactory.createWorkerError('Worker not running');
        }

        // Check Redis connection
        const client = await worker.client;
        const pingResult = await client.ping();
        if (pingResult !== 'PONG') {
          throw ErrorFactory.createWorkerError('Redis ping failed');
        }

        // Removed heavy Queue instantiation loop - relying on Redis ping for connectivity check
        // The queue instance creation was causing memory pressure and potential connection leaks in this retry loop

        Logger.debug(`Worker health verification passed for ${name}`, {
          isRunning,
          pingResult,
        });

        if (timeoutId) clearTimeout(timeoutId);
        resolve();
        return;
      } catch (error) {
        Logger.debug(`Worker health verification failed for ${name}, retrying...`, error);

        // Check timeout
        if (Date.now() - startTime >= timeoutMs) {
          if (timeoutId) clearTimeout(timeoutId);
          reject(
            ErrorFactory.createWorkerError(
              'Worker failed health verification within timeout period'
            )
          );
          return;
        }

        // Schedule next check
        timeoutId = globalThis.setTimeout(checkConnection, checkInterval);
      }
    };

    // Start checking
    checkConnection();
  });
};

const startHealthMonitoring = (name: string, worker: Worker, queueName: string): void => {
  HealthMonitor.register(name, worker, queueName);
};

const sanitizeProcessorPath = (value: string): string => {
  const decoded = decodeProcessorPathEntities(value);
  const base = decoded.split(/[?#&]/)[0]?.trim() ?? '';
  if (!base) return '';
  const isAbsolutePath = base.startsWith('/') || /^[A-Za-z]:[\\/]/.test(base);
  const relativePath = base.startsWith('.') ? base : `./${base}`;
  return isAbsolutePath ? base : path.resolve(process.cwd(), relativePath);
};

const stripProcessorExtension = (value: string): string => value.replace(/\.(ts|js)$/i, '');

const normalizeModulePath = (value: string): string => value.replaceAll('\\', '/');

const buildProcessorModuleCandidates = (modulePath: string, resolvedPath: string): string[] => {
  const candidates: string[] = [];
  const normalized = normalizeModulePath(modulePath.trim());
  const normalizedResolved = normalizeModulePath(resolvedPath);

  if (normalized.startsWith('/app/')) {
    candidates.push(`@app/${stripProcessorExtension(normalized.slice(5))}`);
  } else if (normalized.startsWith('app/')) {
    candidates.push(`@app/${stripProcessorExtension(normalized.slice(4))}`);
  }

  const appIndex = normalizedResolved.lastIndexOf('/app/');
  if (appIndex !== -1) {
    const relative = normalizedResolved.slice(appIndex + 5);
    if (relative) {
      candidates.push(`@app/${stripProcessorExtension(relative)}`);
    }
  }

  return Array.from(new Set(candidates));
};

const pickProcessorFromModule = (
  mod: Record<string, unknown> | undefined,
  source: string
): WorkerFactoryConfig['processor'] | undefined => {
  const candidate = mod?.['default'] ?? mod?.['processor'] ?? mod?.['handler'] ?? mod?.['handle'];
  if (typeof candidate !== 'function') {
    const keys = mod ? Object.keys(mod) : [];
    Logger.warn(
      `Module imported from ${source} but no valid processor function found (exported: ${keys.join(', ')})`
    );
    return undefined;
  }

  return candidate as WorkerFactoryConfig['processor'];
};

const extractZinTrustProcessor = (
  mod: Record<string, unknown> | undefined,
  source: string
): WorkerFactoryConfig['processor'] | undefined => {
  const candidate = mod?.['ZinTrustProcessor'];
  if (typeof candidate !== 'function') {
    const keys = mod ? Object.keys(mod) : [];
    Logger.warn(
      `Module imported from ${source} but missing ZinTrustProcessor export (exported: ${keys.join(', ')})`
    );
    return undefined;
  }

  return candidate as WorkerFactoryConfig['processor'];
};

const readResponseBody = async (response: Response, maxSize: number): Promise<string> => {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const size = Number.parseInt(contentLength, 10);
    if (Number.isFinite(size) && size > maxSize) {
      throw ErrorFactory.createConfigError('PROCESSOR_FETCH_SIZE_EXCEEDED');
    }
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxSize) {
    throw ErrorFactory.createConfigError('PROCESSOR_FETCH_SIZE_EXCEEDED');
  }

  return new TextDecoder().decode(buffer);
};

const computeCacheTtlSeconds = (
  config: ReturnType<typeof getProcessorSpecConfig>,
  cacheControl: { maxAge?: number }
): number =>
  Math.min(config.cacheMaxTtlSeconds, cacheControl.maxAge ?? config.cacheDefaultTtlSeconds);

const refreshCachedProcessor = (
  existing: CachedProcessor,
  config: ReturnType<typeof getProcessorSpecConfig>,
  cacheControl: { maxAge?: number }
): WorkerFactoryConfig['processor'] => {
  const ttl = computeCacheTtlSeconds(config, cacheControl);
  const now = Date.now();
  existing.expiresAt = now + ttl * 1000;
  existing.lastAccess = now;
  return existing.processor;
};

const cacheProcessorFromResponse = async (params: {
  response: Response;
  normalized: string;
  config: ReturnType<typeof getProcessorSpecConfig>;
  cacheKey: string;
}): Promise<WorkerFactoryConfig['processor']> => {
  const { response, normalized, config, cacheKey } = params;
  const code = await readResponseBody(response, config.fetchMaxSizeBytes);
  const dataUrl = `data:text/javascript;base64,${toBase64(code)}`;
  const mod = await import(dataUrl);
  const processor = extractZinTrustProcessor(mod as Record<string, unknown>, normalized);
  if (!processor) {
    throw ErrorFactory.createConfigError('INVALID_PROCESSOR_URL_EXPORT');
  }

  const cacheControl = parseCacheControl(response.headers.get('cache-control'));
  const ttl = computeCacheTtlSeconds(config, cacheControl);
  const size = new TextEncoder().encode(code).byteLength;
  const now = Date.now();
  setCachedProcessor(
    cacheKey,
    {
      code,
      processor,
      etag: response.headers.get('etag') ?? undefined,
      cachedAt: now,
      expiresAt: now + ttl * 1000,
      size,
      lastAccess: now,
    },
    config.cacheMaxSizeBytes
  );

  return processor;
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });

const fetchProcessorAttempt = async (params: {
  normalized: string;
  config: ReturnType<typeof getProcessorSpecConfig>;
  cacheKey: string;
  existing: CachedProcessor | undefined;
  attempt: number;
  maxAttempts: number;
}): Promise<WorkerFactoryConfig['processor'] | undefined> => {
  const { normalized, config, cacheKey, existing, attempt, maxAttempts } = params;
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), config.fetchTimeoutMs);

  try {
    const headers: Record<string, string> = {};
    if (existing?.etag) headers['If-None-Match'] = existing.etag;

    const response = await fetch(normalized, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (response.status === 304 && existing) {
      const cacheControl = parseCacheControl(response.headers.get('cache-control'));
      return refreshCachedProcessor(existing, config, cacheControl);
    }

    if (!response.ok) {
      throw ErrorFactory.createConfigError(`PROCESSOR_FETCH_FAILED:${response.status}`);
    }

    return await cacheProcessorFromResponse({ response, normalized, config, cacheKey });
  } catch (error) {
    if (controller.signal.aborted) {
      Logger.error('Processor URL fetch timeout', error);
    } else {
      Logger.error('Processor URL fetch failed', error);
    }

    if (attempt >= maxAttempts) {
      return undefined;
    }

    await delay(config.retryBackoffMs * attempt);
    return fetchProcessorAttempt({
      normalized,
      config,
      cacheKey,
      existing,
      attempt: attempt + 1,
      maxAttempts,
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

const resolveProcessorFromUrl = async (
  spec: string
): Promise<WorkerFactoryConfig['processor'] | undefined> => {
  const normalized = normalizeProcessorSpec(spec);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch (error) {
    Logger.error('Invalid processor URL spec', error);
    return undefined;
  }

  if (parsed.protocol === 'file:') {
    const filePath = decodeURIComponent(parsed.pathname);
    return resolveProcessorFromPath(filePath);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'file:') {
    Logger.warn(
      `Invalid processor URL protocol: ${parsed.protocol}. Only https:// and file:// are supported.`
    );
  }

  if (!isAllowedRemoteHost(parsed.host) && parsed.protocol !== 'file:') {
    Logger.warn(`Invalid processor URL host: ${parsed.host}. Host is not in the allowlist.`);
  }

  const config = getProcessorSpecConfig();
  const cacheKey = await computeSha256(normalized);
  const cached = getCachedProcessor(cacheKey);
  if (cached) return cached.processor;

  return fetchProcessorAttempt({
    normalized,
    config,
    cacheKey,
    existing: processorCache.get(cacheKey),
    attempt: 1,
    maxAttempts: Math.max(1, config.retryAttempts),
  });
};

const resolveProcessorSpec = async (
  spec: string
): Promise<WorkerFactoryConfig['processor'] | undefined> => {
  if (!spec) return undefined;
  const normalized = normalizeProcessorSpec(spec);
  const prebuilt = processorSpecRegistry.get(normalized) ?? processorSpecRegistry.get(spec);
  if (prebuilt) return prebuilt;
  if (isUrlSpec(spec)) return resolveProcessorFromUrl(spec);
  return resolveProcessorFromPath(spec);
};

const resolveProcessorFromPath = async (
  modulePath: string
): Promise<WorkerFactoryConfig['processor'] | undefined> => {
  // Cloudflare Workers cannot dynamically import arbitrary local paths
  if (Cloudflare.getWorkersEnv() !== null) {
    Logger.warn(
      `Skipping local processor path on Cloudflare: ${modulePath}. Use a URL spec and register it in the prebuilt registry (src/zintrust.plugins.wg.ts).`
    );
    return undefined;
  }

  const trimmed = modulePath.trim();
  if (!trimmed) return undefined;

  const resolved = sanitizeProcessorPath(trimmed);
  if (!resolved) return undefined;

  const importProcessorFromCandidates = async (
    candidates: string[]
  ): Promise<WorkerFactoryConfig['processor'] | undefined> => {
    if (candidates.length === 0) return undefined;
    const [candidatePath, ...rest] = candidates;
    try {
      const mod = await import(candidatePath);
      const candidate = pickProcessorFromModule(mod as Record<string, unknown>, candidatePath);
      if (candidate) return candidate;
    } catch (candidateError) {
      Logger.debug(`Processor module candidate import failed: ${candidatePath}`, candidateError);
    }

    return importProcessorFromCandidates(rest);
  };

  try {
    const mod = await import(resolved);
    const candidate = pickProcessorFromModule(mod as Record<string, unknown>, resolved);
    if (candidate) return candidate;
  } catch (err) {
    const candidates = buildProcessorModuleCandidates(trimmed, resolved);
    const resolvedCandidate = await importProcessorFromCandidates(candidates);
    if (resolvedCandidate) return resolvedCandidate;
    Logger.error(`Failed to import processor from path: ${resolved}`, err);
  }

  return undefined;
};

const resolveProcessor = async (
  name: string
): Promise<WorkerFactoryConfig['processor'] | undefined> => {
  const direct = processorRegistry.get(name);
  if (direct) return direct;

  const pathHint = processorPathRegistry.get(name);
  if (pathHint) {
    try {
      const resolved = await resolveProcessorSpec(pathHint);
      if (resolved) return resolved;
    } catch (error) {
      Logger.error(`Failed to resolve processor module for "${name}"`, error);
    }
  }

  const resolverResults = await Promise.all(
    processorResolvers.map(async (resolver) => {
      try {
        return await resolver(name);
      } catch (error) {
        Logger.error(`Processor resolver failed for "${name}"`, error);
        return undefined;
      }
    })
  );

  const resolvedFromResolvers = resolverResults.find((result) => result !== undefined);
  if (resolvedFromResolvers) return resolvedFromResolvers;

  return undefined;
};

const resolveProcessorPath = async (
  modulePath: string
): Promise<WorkerFactoryConfig['processor'] | undefined> => resolveProcessorFromPath(modulePath);

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

const requireRedisHost = (host: string, context: string): string => {
  if (!host) {
    throw ErrorFactory.createConfigError(`${context}.host is required`);
  }
  return host;
};

const resolveRedisFallbacks = (): {
  host: string;
  port: number;
  db: number;
  password: string;
} => {
  const queueRedis = queueConfig.drivers.redis;
  return {
    host: queueRedis?.driver === 'redis' ? queueRedis.host : Env.get('REDIS_HOST', '127.0.0.1'),
    port:
      queueRedis?.driver === 'redis'
        ? queueRedis.port
        : Env.getInt('REDIS_PORT', ZintrustLang.REDIS_DEFAULT_PORT),
    db:
      queueRedis?.driver === 'redis'
        ? queueRedis.database
        : Env.getInt('REDIS_QUEUE_DB', ZintrustLang.REDIS_DEFAULT_DB),
    password:
      queueRedis?.driver === 'redis' ? (queueRedis.password ?? '') : Env.get('REDIS_PASSWORD', ''),
  };
};

const resolveRedisConfigFromEnv = (config: RedisEnvConfig, context: string): RedisConfig => {
  const fallback = resolveRedisFallbacks();
  const host = requireRedisHost(
    resolveEnvString(config.host ?? 'REDIS_HOST', fallback.host),
    context
  );
  const port = resolveEnvInt(String(config.port ?? 'REDIS_PORT'), fallback.port);

  const db = resolveEnvInt(config.db ?? 'REDIS_QUEUE_DB', fallback.db);

  const password = resolveEnvString(config.password ?? 'REDIS_PASSWORD', fallback.password);

  return {
    host,
    port,
    db,
    password: password || undefined,
  };
};

const resolveRedisConfigFromDirect = (config: RedisConfig, context: string): RedisConfig => ({
  host: requireRedisHost(config.host, context),
  port: config.port,
  db: config.db,
  password: config.password ?? Env.get('REDIS_PASSWORD', undefined),
});

const resolveRedisConfig = (config: RedisConfigInput, context: string): RedisConfig =>
  isRedisEnvConfig(config)
    ? resolveRedisConfigFromEnv(config, context)
    : resolveRedisConfigFromDirect(config, context);

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

const normalizeEnvValue = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeAppName = (value: string | undefined): string => {
  const normalized = (value ?? '').trim().replaceAll(/\s+/g, '_');
  return normalized.length > 0 ? normalized : 'zintrust';
};

const resolveDefaultRedisKeyPrefix = (): string => 'worker_' + normalizeAppName(appConfig.prefix);
const resolveDefaultPersistenceTable = (): string =>
  normalizeEnvValue(Env.get('WORKER_PERSISTENCE_TABLE', 'zintrust_workers')) ?? 'zintrust_workers';

const resolveDefaultPersistenceConnection = (): string =>
  normalizeEnvValue(Env.get('WORKER_PERSISTENCE_DB_CONNECTION', 'default')) ?? 'default';

const resolveAutoStart = (config: WorkerFactoryConfig): boolean => {
  // If explicitly set in config (not null/undefined), use that
  if (config.autoStart !== undefined && config.autoStart !== null) {
    return config.autoStart;
  }
  // Otherwise, use environment variable
  return Env.getBool('WORKER_AUTO_START', false);
};

const normalizeExplicitPersistence = (
  persistence: WorkerPersistenceConfig
): WorkerPersistenceConfig => {
  if (persistence.driver === 'memory') return { driver: 'memory' };

  if (persistence.driver === 'redis') {
    return {
      driver: 'redis',
      redis: persistence.redis,
      keyPrefix:
        persistence.keyPrefix ??
        normalizeEnvValue(Env.get('WORKER_PERSISTENCE_REDIS_KEY_PREFIX', '')) ??
        resolveDefaultRedisKeyPrefix(),
    };
  }

  const clientIsConnection = typeof persistence.client === 'string';
  const clientConnection = clientIsConnection ? (persistence.client as string) : undefined;
  const resolvedConnection =
    persistence.connection ??
    clientConnection ??
    normalizeEnvValue(Env.get('WORKER_PERSISTENCE_DB_CONNECTION', 'default')) ??
    resolveDefaultPersistenceConnection();

  return {
    driver: 'database',
    client: clientIsConnection ? undefined : persistence.client,
    connection: resolvedConnection,
    table:
      persistence.table ??
      normalizeEnvValue(Env.get('WORKER_PERSISTENCE_TABLE', 'zintrust_workers')) ??
      resolveDefaultPersistenceTable(),
  };
};

const resolvePersistenceConfig = (
  config: WorkerFactoryConfig
): WorkerPersistenceConfig | undefined => {
  const explicit = config.infrastructure?.persistence;
  if (explicit) return normalizeExplicitPersistence(explicit);

  const driver = normalizeEnvValue(Env.get('WORKER_PERSISTENCE_DRIVER', ''))?.toLowerCase();
  if (!driver) return undefined;

  if (driver === 'memory') return { driver: 'memory' };

  if (driver === 'redis') {
    const keyPrefix = normalizeEnvValue(Env.get('WORKER_PERSISTENCE_REDIS_KEY_PREFIX', ''));
    return {
      driver: 'redis',
      redis: { env: true },
      keyPrefix: `${keyPrefix}_worker_${appConfig.prefix}`,
    };
  }

  if (driver === 'db' || driver === 'database') {
    return {
      driver: 'database',
      connection: resolveDefaultPersistenceConnection(),
      table: resolveDefaultPersistenceTable(),
    };
  }

  throw ErrorFactory.createConfigError(
    'WORKER_PERSISTENCE_DRIVER must be one of memory, redis, or database'
  );
};

const resolveDbClientFromEnv = async (connectionName = 'default'): Promise<IDatabase> => {
  const connect = async (): Promise<IDatabase> =>
    await useEnsureDbConnected(undefined, connectionName);

  try {
    return await connect();
  } catch (error) {
    Logger.error('Worker persistence failed to resolve database connection', error);
  }

  try {
    registerDatabasesFromRuntimeConfig(databaseConfig);
    return await connect();
  } catch (error) {
    Logger.error('Worker persistence failed after registering runtime databases', error);
    throw ErrorFactory.createConfigError(
      `Worker persistence requires a database client. Register connection '${connectionName}' or pass infrastructure.persistence.client.`
    );
  }
};

const resolveWorkerStore = async (config: WorkerFactoryConfig): Promise<WorkerStore> => {
  const persistence = resolvePersistenceConfig(config);
  if (!persistence) return workerStore;

  let next: WorkerStore;

  if (persistence.driver === 'memory') {
    next = InMemoryWorkerStore.create();
  } else if (persistence.driver === 'redis') {
    const redisConfig = resolveRedisConfigWithFallback(
      persistence.redis,
      config.infrastructure?.redis,
      'Worker persistence requires redis config (persistence.redis or infrastructure.redis)',
      'infrastructure.persistence.redis'
    );
    const client = createRedisConnection(redisConfig);
    next = RedisWorkerStore.create(client, persistence.keyPrefix ?? resolveDefaultRedisKeyPrefix());
  } else if (persistence.driver === 'database') {
    const explicitConnection =
      typeof persistence.client === 'string' ? persistence.client : persistence.connection;
    const client =
      typeof persistence.client === 'string'
        ? await resolveDbClientFromEnv(explicitConnection)
        : (persistence.client ?? (await resolveDbClientFromEnv(explicitConnection)));
    next = DbWorkerStore.create(client, persistence.table);
  } else {
    next = InMemoryWorkerStore.create();
  }

  await next.init();
  return next;
};

// Store instance cache to reuse connections
const storeInstanceCache = new Map<string, WorkerStore>();

/**
 * Generate cache key for persistence configuration
 */
const generateCacheKey = (persistence: WorkerPersistenceConfig): string => {
  return JSON.stringify({
    driver: persistence.driver,
    redis: 'redis' in persistence ? persistence.redis : undefined,
    keyPrefix: 'keyPrefix' in persistence ? persistence.keyPrefix : undefined,
    connection: 'connection' in persistence ? persistence.connection : undefined,
    table: 'table' in persistence ? persistence.table : undefined,
  });
};

/**
 * Create new store instance based on persistence configuration
 */
const createWorkerStore = async (persistence: WorkerPersistenceConfig): Promise<WorkerStore> => {
  if (persistence.driver === 'memory') {
    if (workerStoreConfigured && workerStoreConfig?.driver === 'memory') {
      return workerStore;
    }
    return InMemoryWorkerStore.create();
  }

  if (persistence.driver === 'redis') {
    const redisConfig = resolveRedisConfigWithFallback(
      persistence.redis ?? { env: true },
      undefined,
      'Worker persistence requires redis config (persistence.redis or REDIS_* env values)',
      'persistence.redis'
    );
    const client = createRedisConnection(redisConfig);
    return RedisWorkerStore.create(client, persistence.keyPrefix ?? resolveDefaultRedisKeyPrefix());
  }

  // Database driver
  const explicitConnection =
    typeof persistence.client === 'string' ? persistence.client : persistence.connection;
  const client =
    typeof persistence.client === 'string'
      ? await resolveDbClientFromEnv(explicitConnection)
      : (persistence.client ?? (await resolveDbClientFromEnv(explicitConnection)));
  return DbWorkerStore.create(client, persistence.table);
};

const resolveWorkerStoreForPersistence = async (
  persistence: WorkerPersistenceConfig
): Promise<WorkerStore> => {
  const cacheKey = generateCacheKey(persistence);

  // Return cached instance if available
  const cached = storeInstanceCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Create new store instance
  const store = await createWorkerStore(persistence);
  await store.init();

  // Cache the store instance for reuse
  storeInstanceCache.set(cacheKey, store);

  return store;
};

const getPersistedRecord = async (
  name: string,
  persistenceOverride?: WorkerPersistenceConfig
): Promise<WorkerRecord | null> => {
  if (!persistenceOverride) {
    await ensureWorkerStoreConfigured();
    return workerStore.get(name);
  }

  const store = await resolveWorkerStoreForPersistence(persistenceOverride);
  return store.get(name);
};

const ensureWorkerStoreConfigured = async (): Promise<void> => {
  if (workerStoreConfigured) return;
  const bootstrapConfig = buildPersistenceBootstrapConfig();
  const persistence = resolvePersistenceConfig(bootstrapConfig);
  if (!persistence) return;
  workerStore = await resolveWorkerStore(bootstrapConfig);
  workerStoreConfigured = true;
  workerStoreConfig = persistence;
};

const buildWorkerRecord = (config: WorkerFactoryConfig, status: string): WorkerRecord => {
  const now = new Date();

  const normalizedProcessorSpec = config.processorSpec
    ? normalizeProcessorSpec(config.processorSpec)
    : null;
  return {
    name: config.name,
    queueName: config.queueName,
    version: config.version ?? '1.0.0',
    status,
    autoStart: resolveAutoStart(config),
    concurrency: config.options?.concurrency ?? 1,
    region: config.datacenter?.primaryRegion ?? null,
    processorSpec: normalizedProcessorSpec ?? null,
    activeStatus: config.activeStatus ?? true,
    features: config.features ? { ...config.features } : null,
    infrastructure: config.infrastructure ? { ...config.infrastructure } : null,
    datacenter: config.datacenter ? { ...config.datacenter } : null,
    createdAt: now,
    updatedAt: now,
    lastHealthCheck: undefined,
    lastError: undefined,
    connectionState: undefined,
  };
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

const resolveOffPeakSchedule = (
  input: AutoScalerConfig | undefined,
  defaults: AutoScalerConfig
): NonNullable<AutoScalerConfig['costOptimization']['offPeakSchedule']> => {
  const fallback = defaults.costOptimization.offPeakSchedule ?? {
    start: '22:00',
    end: '06:00',
    timezone: 'UTC',
    reductionPercentage: 0,
  };

  const override = input?.costOptimization?.offPeakSchedule;
  const schedule = { ...fallback };
  if (override) {
    Object.assign(schedule, override);
  }
  return schedule;
};

const resolveCostOptimization = (
  input: AutoScalerConfig | undefined,
  defaults: AutoScalerConfig
): AutoScalerConfig['costOptimization'] => ({
  ...defaults.costOptimization,
  ...input?.costOptimization,
  offPeakSchedule: resolveOffPeakSchedule(input, defaults),
  budgetAlerts: {
    ...defaults.costOptimization.budgetAlerts,
    ...input?.costOptimization?.budgetAlerts,
  },
});

const resolveAutoScalerConfig = (input: AutoScalerConfig | undefined): AutoScalerConfig => {
  const defaults = buildDefaultAutoScalerConfig();
  if (!input) return defaults;

  return {
    ...defaults,
    ...input,
    costOptimization: resolveCostOptimization(input, defaults),
  };
};

const resolveWorkerOptions = (config: WorkerFactoryConfig, autoStart: boolean): WorkerOptions => {
  const options = config.options ? { ...config.options } : ({} as WorkerOptions);

  if (options.prefix === undefined) {
    options.prefix = getBullMQSafeQueueName();
  }

  if (options.autorun === undefined) {
    options.autorun = autoStart;
  }
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
  if (clusteringInitialized || !(config.features?.clustering ?? false)) return;
  const redisConfig = resolveRedisConfigWithFallback(
    config.infrastructure?.redis,
    undefined,
    'ClusterLock requires infrastructure.redis config',
    'infrastructure.redis'
  );
  ClusterLock.initialize(redisConfig);
  clusteringInitialized = true;
};

const initializeMetrics = (config: WorkerFactoryConfig): void => {
  if (metricsInitialized || !(config.features?.metrics ?? false)) return;
  const redisConfig = resolveRedisConfigWithFallback(
    config.infrastructure?.redis,
    undefined,
    'WorkerMetrics requires infrastructure.redis config',
    'infrastructure.redis'
  );
  WorkerMetrics.initialize(redisConfig);
  metricsInitialized = true;
};

const initializeAutoScaling = (config: WorkerFactoryConfig): void => {
  if (autoScalingInitialized || !(config.features?.autoScaling ?? false)) return;

  const autoScalerConfig = resolveAutoScalerConfig(config.infrastructure?.autoScaler);

  AutoScaler.initialize(autoScalerConfig);
  autoScalingInitialized = true;
};

const initializeCircuitBreaker = (config: WorkerFactoryConfig, version: string): void => {
  if (!(config.features?.circuitBreaker ?? false)) return;
  CircuitBreaker.initialize(config.name, version);
};

const initializeDeadLetterQueue = (config: WorkerFactoryConfig): void => {
  if (deadLetterQueueInitialized || !(config.features?.deadLetterQueue ?? false)) return;
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
  deadLetterQueueInitialized = true;
};

const initializeResourceMonitoring = (config: WorkerFactoryConfig): void => {
  if (resourceMonitoringInitialized || !(config.features?.resourceMonitoring ?? false)) return;
  if (Cloudflare.getWorkersEnv() !== null) {
    Logger.debug('⏸️ Resource monitoring skipped (Cloudflare Workers runtime)');
    return;
  }
  ResourceMonitor.initialize();
  ResourceMonitor.start();
  resourceMonitoringInitialized = true;
};

const initializeCompliance = (config: WorkerFactoryConfig): void => {
  if (complianceInitialized || !(config.features?.compliance ?? false)) return;
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
  complianceInitialized = true;
};

const initializeObservability = async (config: WorkerFactoryConfig): Promise<void> => {
  if (observabilityInitialized || !(config.features?.observability ?? false)) return;
  if (Cloudflare.getWorkersEnv() !== null) {
    Logger.debug('⏸️ Observability skipped (Cloudflare Workers runtime)');
    return;
  }
  const observabilityConfig = resolveObservabilityConfig(config.infrastructure?.observability);
  await Observability.initialize(observabilityConfig);
  observabilityInitialized = true;
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
    try {
      Logger.debug(`Job completed: ${workerName}`, { jobId: job.id });

      if (features?.observability === true) {
        Observability.incrementCounter('worker.jobs.completed', 1, {
          worker: workerName,
          version: workerVersion,
        });
      }
    } catch (error) {
      // Isolate error - don't let it bubble up
      Logger.error(`Error in worker completed event handler: ${workerName}`, error, 'workers');
    }
  });

  worker.on('failed', (job: Job | undefined, error: Error) => {
    try {
      Logger.error(`Job failed: ${workerName}`, { error, jobId: job?.id }, 'workers');

      if (features?.observability === true) {
        Observability.incrementCounter('worker.jobs.failed', 1, {
          worker: workerName,
          version: workerVersion,
        });
      }
    } catch (handlerError) {
      // Isolate error - don't let it bubble up
      Logger.error(`Error in worker failed event handler: ${workerName}`, handlerError, 'workers');
    }
  });

  worker.on('error', (error: Error) => {
    try {
      Logger.error(`Worker error: ${workerName}`, error);

      // Check if this is a Redis connection error that should be handled gracefully
      if (
        error.message.includes('ERR value is not an integer') ||
        error.message.includes('NOAUTH') ||
        error.message.includes('ECONNREFUSED')
      ) {
        Logger.warn(
          `Worker ${workerName} encountered Redis configuration error - worker will remain failed but server will continue running`
        );
      }
    } catch (handlerError) {
      // Isolate error - don't let it bubble up
      Logger.error(`Error in worker error event handler: ${workerName}`, handlerError, 'workers');
    }
  });
};

const registerWorkerInstance = (params: {
  worker: Worker;
  config: WorkerFactoryConfig;
  workerVersion: string;
  queueName: string;
  options?: WorkerOptions;
  autoStart: boolean;
}): void => {
  const { worker, config, workerVersion, queueName, options, autoStart } = params;

  WorkerRegistry.register({
    name: config.name,
    config: {},
    activeStatus: config.activeStatus ?? true,
    version: workerVersion,
    region: config.datacenter?.primaryRegion,
    queues: [queueName],
    factory: async (): Promise<RegistryWorkerInstance> => {
      await Promise.resolve();
      return {
        metadata: {
          name: config.name,
          status: autoStart ? 'running' : 'stopped',
          version: workerVersion,
          region: config.datacenter?.primaryRegion ?? 'unknown',
          queueName,
          concurrency: options?.concurrency ?? 1,
          activeStatus: config.activeStatus ?? true,
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
        start: (): void => {
          if (!autoStart) {
            worker.run().catch((error) => {
              Logger.error(`Failed to start worker "${config.name}"`, error);
            });
          }
        },
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

const initializeWorkerFeatures = async (
  config: WorkerFactoryConfig,
  workerVersion: string
): Promise<void> => {
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
};

/**
 * Worker Factory - Sealed namespace
 */
export const WorkerFactory = Object.freeze({
  registerProcessor,
  registerProcessors,
  registerProcessorPaths,
  registerProcessorResolver,
  registerProcessorSpec,
  resolveProcessorPath,
  resolveProcessorSpec,

  /**
   * Create new worker with full setup
   */
  async create(config: WorkerFactoryConfig): Promise<Worker> {
    const { name, version, queueName, features } = config;
    const workerVersion = version ?? '1.0.0';
    const autoStart = resolveAutoStart(config);

    if (workers.has(name)) {
      throw ErrorFactory.createWorkerError(`Worker "${name}" already exists`);
    }

    // Resolve the correct store for this worker configuration
    const store = await getStoreForWorker(config);

    // Save initial status as "creating"
    await store.save(buildWorkerRecord(config, WorkerCreationStatus.CREATING));

    try {
      await initializeWorkerFeatures(config, workerVersion);

      // Update status to "connecting"
      await store.update(name, {
        status: WorkerCreationStatus.CONNECTING,
        updatedAt: new Date(),
      });

      // Create enhanced processor
      const enhancedProcessor = createEnhancedProcessor(config);

      // Create BullMQ worker
      const resolvedOptions = resolveWorkerOptions(config, autoStart);
      const worker = new Worker(queueName, enhancedProcessor, resolvedOptions);

      setupWorkerEventListeners(worker, name, workerVersion, features);

      // Update status to "starting"
      await store.update(name, {
        status: WorkerCreationStatus.STARTING,
        updatedAt: new Date(),
      });

      const timeoutMs = Env.getInt('WORKER_CONNECTION_TIMEOUT', 5000);

      // Wait for actual connection and health verification
      await waitForWorkerConnection(worker, name, queueName, timeoutMs);

      // Update status to "running" only after successful connection
      await store.update(name, {
        status: WorkerCreationStatus.RUNNING,
        updatedAt: new Date(),
      });

      // Store worker instance
      const instance: WorkerInstance = {
        worker,
        config,
        startedAt: new Date(),
        status: WorkerCreationStatus.RUNNING,
        connectionState: 'connected',
      };

      workers.set(name, instance);

      registerWorkerInstance({
        worker,
        config,
        workerVersion,
        queueName,
        options: resolvedOptions,
        autoStart,
      });

      if (autoStart) {
        await WorkerRegistry.start(name, workerVersion);
      }

      // Execute afterStart hooks
      if (features?.plugins === true) {
        await PluginManager.executeHook('afterStart', {
          workerName: name,
          timestamp: new Date(),
        });
      }

      // Start health monitoring for the worker
      startHealthMonitoring(name, worker, queueName);

      return worker;
    } catch (error) {
      // Handle failure - update status to "failed"
      // Re-resolve store in case of error to be safe
      const failStore = await getStoreForWorker(config);
      await failStore.update(name, {
        status: WorkerCreationStatus.FAILED,
        updatedAt: new Date(),
        lastError: (error as Error).message,
      });

      Logger.error(`Worker creation failed: ${name}`, error);
      throw error;
    }
  },

  /**
   * Get worker instance
   */
  get(name: string): WorkerInstance | null {
    const instance = workers.get(name);
    return instance ? { ...instance } : null;
  },

  /**
   * Update worker status directly (used by HealthMonitor)
   */
  async updateStatus(name: string, status: string, error?: Error | string): Promise<void> {
    const instance = workers.get(name);
    if (instance) {
      instance.status = status as WorkerCreationStatus;
    }

    try {
      const store = await getStoreForWorker(
        instance?.config ?? {
          name,
          queueName: 'unknown',
          processor: async (): Promise<unknown> => {
            return Promise.resolve(); //NOSONAR
          },
        }
      );
      const errorMessage = typeof error === 'string' ? error : error?.message;
      await store.update(name, {
        status: status as WorkerCreationStatus,
        updatedAt: new Date(),
        lastError: errorMessage,
      });
    } catch (err) {
      Logger.warn(`Failed to update status for ${name} to ${status}`, err as Error);
    }
  },

  /**
   * Stop worker
   */
  async stop(
    name: string,
    persistenceOverride?: WorkerPersistenceConfig,
    options?: { skipPersistedUpdate?: boolean }
  ): Promise<void> {
    const skipPersistedUpdate = options?.skipPersistedUpdate === true;
    const instance = workers.get(name);
    const store = await validateAndGetStore(name, instance?.config, persistenceOverride);

    if (!instance) {
      if (!skipPersistedUpdate) {
        await store.update(name, { status: 'stopped', updatedAt: new Date() });
        Logger.info(`Worker marked stopped (not running): ${name}`);
      }
      return;
    }

    // Execute beforeStop hooks
    if (instance.config.features?.plugins === true) {
      await PluginManager.executeHook('beforeStop', {
        workerName: name,
        timestamp: new Date(),
      });
    }

    // Close worker with timeout to prevent hanging
    const workerClosePromise = instance.worker.close();
    let timeoutId: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      // eslint-disable-next-line no-restricted-syntax
      timeoutId = setTimeout(() => {
        reject(new Error('Worker close timeout'));
      }, 5000);
    });

    try {
      await Promise.race([workerClosePromise, timeoutPromise]);
    } catch (error) {
      Logger.warn(`Worker "${name}" close failed or timed out, continuing...`, error as Error);
    } finally {
      // Always clean up timeout to prevent memory leak
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    }
    instance.status = WorkerCreationStatus.STOPPED;

    // Stop health monitoring for this worker
    HealthMonitor.unregister(name);

    if (!skipPersistedUpdate) {
      try {
        await store.update(name, {
          status: WorkerCreationStatus.STOPPED,
          updatedAt: new Date(),
        });
        Logger.info(`Worker "${name}" status updated to stopped`);
      } catch (error) {
        Logger.error(`Failed to update worker "${name}" status`, error as Error);
      }
    }

    await WorkerRegistry.stop(name);

    // Execute afterStop hooks
    if (instance.config.features?.plugins === true) {
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
  async restart(name: string, persistenceOverride?: WorkerPersistenceConfig): Promise<void> {
    const instance = workers.get(name);

    if (!instance) {
      await WorkerFactory.startFromPersisted(name, persistenceOverride);
      Logger.info(`Worker started from persistence: ${name}`);
      return;
    }

    await WorkerFactory.stop(name, persistenceOverride);
    const refreshed = workers.get(name);

    if (!refreshed) {
      throw ErrorFactory.createNotFoundError(`Worker "${name}" not found`);
    }

    workers.delete(name);

    const newWorker = await WorkerFactory.create(refreshed.config);
    refreshed.worker = newWorker;
    refreshed.status = WorkerCreationStatus.RUNNING;
    refreshed.startedAt = new Date();

    Logger.info(`Worker restarted: ${name}`);
  },

  /**
   * Pause worker
   */
  async pause(name: string, persistenceOverride?: WorkerPersistenceConfig): Promise<void> {
    const instance = workers.get(name);
    const store = await validateAndGetStore(name, instance?.config, persistenceOverride);

    if (instance) {
      await instance.worker.pause();
      instance.status = WorkerCreationStatus.STARTING; // Using STARTING as equivalent to sleeping/paused
    }

    await store.update(name, {
      status: WorkerCreationStatus.STARTING,
      updatedAt: new Date(),
    });

    Logger.info(`Worker paused: ${name}`);
  },

  /**
   * Resume worker
   */
  async resume(name: string, persistenceOverride?: WorkerPersistenceConfig): Promise<void> {
    const instance = workers.get(name);
    const store = await validateAndGetStore(name, instance?.config, persistenceOverride);

    if (instance) {
      instance.worker.resume();
      instance.status = WorkerCreationStatus.RUNNING;
    }

    try {
      await store.update(name, { status: WorkerCreationStatus.RUNNING, updatedAt: new Date() });
    } catch (error) {
      Logger.error('Failed to persist worker resume', error as Error);
    }

    Logger.info(`Worker resumed: ${name}`);
  },

  /**
   * Update auto-start for persisted worker
   */
  async setAutoStart(
    name: string,
    autoStart: boolean,
    persistenceOverride?: WorkerPersistenceConfig
  ): Promise<void> {
    const instance = workers.get(name);
    const store = await validateAndGetStore(name, instance?.config, persistenceOverride);

    if (instance) {
      instance.config.autoStart = autoStart;
    }

    await store.update(name, { autoStart, updatedAt: new Date() });

    if (!autoStart) return;

    const refreshed = workers.get(name);
    if (refreshed) {
      if (refreshed.status !== 'running') {
        await WorkerFactory.start(name, persistenceOverride);
      }
      return;
    }

    await WorkerFactory.startFromPersisted(name, persistenceOverride);
  },

  /**
   * Update active status for a worker
   */
  async setWorkerActiveStatus(
    name: string,
    activeStatus: boolean,
    persistenceOverride?: WorkerPersistenceConfig
  ): Promise<void> {
    const instance = workers.get(name);
    const store = await validateAndGetStore(name, instance?.config, persistenceOverride);

    if (instance) {
      instance.config.activeStatus = activeStatus;
    }

    await store.update(name, { activeStatus, updatedAt: new Date() });
    WorkerRegistry.setActiveStatus(name, activeStatus);

    if (activeStatus === false && instance) {
      await WorkerFactory.stop(name, persistenceOverride);
    }
  },

  /**
   * Get active status for a worker
   */
  async getWorkerActiveStatus(
    name: string,
    persistenceOverride?: WorkerPersistenceConfig
  ): Promise<boolean | null> {
    const instance = workers.get(name);
    if (instance?.config.activeStatus !== undefined) {
      return instance.config.activeStatus;
    }

    const store = await getStoreForWorker(instance?.config, persistenceOverride);
    const record = await store.get(name);
    if (!record) return null;
    return record.activeStatus ?? true;
  },

  /**
   * Update persisted worker record and in-memory config if running.
   */
  async update(
    name: string,
    patch: Partial<WorkerRecord> | WorkerRecord,
    persistenceOverride?: WorkerPersistenceConfig
  ): Promise<void> {
    const instance = workers.get(name);
    const store = await getStoreForWorker(instance?.config, persistenceOverride);

    const current = await store.get(name);
    if (!current) {
      throw ErrorFactory.createNotFoundError(`Worker "${name}" not found in persistence store`);
    }

    const merged: WorkerRecord = {
      ...current,
      ...(patch as Partial<WorkerRecord>),
      updatedAt: (patch as Partial<WorkerRecord>).updatedAt ?? new Date(),
    };

    // Use save() which will insert or update appropriately for each store
    await store.save(merged);

    // If the worker is running in memory, update its runtime config so restarts use the new config
    if (instance) {
      const cfg = instance.config;
      instance.config = {
        ...cfg,
        version: merged.version ?? cfg.version,
        queueName: merged.queueName ?? cfg.queueName,
        options: {
          ...cfg.options,
          concurrency: merged.concurrency ?? cfg.options?.concurrency,
        },
        processorSpec: merged.processorSpec ?? cfg.processorSpec,
        activeStatus: merged.activeStatus ?? cfg.activeStatus,
        infrastructure: (merged.infrastructure as unknown) ?? cfg.infrastructure,
        features: (merged.features as unknown) ?? cfg.features,
        datacenter: (merged.datacenter as unknown) ?? cfg.datacenter,
      } as WorkerFactoryConfig;
    }
  },

  /**
   * Start worker
   */
  async start(name: string, persistenceOverride?: WorkerPersistenceConfig): Promise<void> {
    const instance = workers.get(name);
    // Even if instance exists, we must validate against the requested driver
    const store = await validateAndGetStore(name, instance?.config, persistenceOverride);

    if (!instance) {
      throw ErrorFactory.createNotFoundError(`Worker "${name}" not found`);
    }

    if (instance.config.activeStatus === false) {
      throw ErrorFactory.createConfigError(`Worker "${name}" is inactive`);
    }

    const persisted = await store.get(name);
    if (persisted?.activeStatus === false) {
      throw ErrorFactory.createConfigError(`Worker "${name}" is inactive`);
    }

    const version = instance.config.version ?? '1.0.0';
    await WorkerRegistry.start(name, version);

    instance.status = WorkerCreationStatus.RUNNING;
    instance.startedAt = new Date();

    await store.update(name, { status: WorkerCreationStatus.RUNNING, updatedAt: new Date() });

    Logger.info(`Worker started: ${name}`);
  },

  /**
   * List all workers
   */
  list(): string[] {
    return Array.from(workers.keys());
  },

  /**
   * List all persisted workers
   */
  async listPersisted(
    persistenceOverride?: WorkerPersistenceConfig,
    options?: { offset?: number; limit?: number; search?: string; includeInactive?: boolean }
  ): Promise<string[]> {
    const records = await WorkerFactory.listPersistedRecords(persistenceOverride, options);
    return records.map((record) => record.name);
  },

  async listPersistedRecords(
    persistenceOverride?: WorkerPersistenceConfig,
    options?: { offset?: number; limit?: number; search?: string; includeInactive?: boolean }
  ): Promise<WorkerRecord[]> {
    const includeInactive = options?.includeInactive === true;
    if (!persistenceOverride) {
      await ensureWorkerStoreConfigured();
      const records = await workerStore.list(options);
      return includeInactive ? records : records.filter((record) => record.activeStatus !== false);
    }

    const store = await resolveWorkerStoreForPersistence(persistenceOverride);
    const records = await store.list(options);
    return includeInactive ? records : records.filter((record) => record.activeStatus !== false);
  },

  /**
   * Start a worker from persisted storage when it is not registered.
   */
  async startFromPersisted(
    name: string,
    persistenceOverride?: WorkerPersistenceConfig
  ): Promise<void> {
    const record = await getPersistedRecord(name, persistenceOverride);
    if (!record) {
      throw ErrorFactory.createNotFoundError(`Worker "${name}" not found in persistence store`);
    }

    if (record.activeStatus === false) {
      throw ErrorFactory.createConfigError(`Worker "${name}" is inactive`);
    }

    let processor = await resolveProcessor(name);

    const spec = record.processorSpec ?? undefined;
    if (!processor && spec) {
      try {
        processor = await resolveProcessorSpec(spec);
      } catch (error) {
        Logger.error(`Failed to resolve processor module for "${name}"`, error);
      }
    }

    if (!processor) {
      throw ErrorFactory.createConfigError(
        `Worker "${name}" processor is not registered or resolvable. Register the processor at startup or persist a processorSpec.`
      );
    }

    await WorkerFactory.create({
      name: record.name,
      queueName: record.queueName,
      version: record.version ?? undefined,
      processor,
      processorSpec: record.processorSpec ?? undefined,
      activeStatus: record.activeStatus ?? true,
      autoStart: true, // Override to true when manually starting
      options: { concurrency: record.concurrency } as WorkerOptions,
      infrastructure: record.infrastructure as WorkerFactoryConfig['infrastructure'],
      features: record.features as WorkerFactoryConfig['features'],
      datacenter: record.datacenter as WorkerFactoryConfig['datacenter'],
    });
  },

  /**
   * Get persisted worker record
   */
  async getPersisted(
    name: string,
    persistenceOverride?: WorkerPersistenceConfig
  ): Promise<WorkerRecord | null> {
    const instance = workers.get(name);
    const store = await getStoreForWorker(instance?.config, persistenceOverride);
    return store.get(name);
  },

  /**
   * Remove worker
   */
  async remove(name: string, persistenceOverride?: WorkerPersistenceConfig): Promise<void> {
    const instance = workers.get(name);
    // Validate that worker exists in the store we are trying to remove from
    const store = await validateAndGetStore(name, instance?.config, persistenceOverride);

    if (instance) {
      await WorkerFactory.stop(name, persistenceOverride);
      const registry = WorkerRegistry as { unregister?: (name: string) => void };
      registry.unregister?.(name);
      AutoScaler.clearHistory(name);
      ResourceMonitor.clearHistory(name);
      CircuitBreaker.deleteWorker(name);
      CanaryController.purge(name);
      WorkerVersioning.clear(name);
      DatacenterOrchestrator.removeWorker(name);
      await Observability.clearWorkerMetrics(name);

      // Stop health monitoring for this worker
      HealthMonitor.unregister(name);

      workers.delete(name);
    }

    await store.remove(name);
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

    const workerEntries = Array.from(workers.entries());
    const workerNames = workerEntries.map(([name]) => name);

    // Bulk-update persisted statuses before stopping workers to avoid per-worker DB updates
    // during shutdown (which can fail if DB connections are closing).
    const storeGroups = new Map<WorkerStore, string[]>();

    // Parallel get stores for all workers
    const storePromises = workerEntries.map(async ([name, instance]) => {
      const store = await getStoreForWorker(instance.config);
      return { name, store };
    });

    const storeMappings = await Promise.all(storePromises);

    for (const { name, store } of storeMappings) {
      const existing = storeGroups.get(store);
      if (existing) {
        existing.push(name);
      } else {
        storeGroups.set(store, [name]);
      }
    }

    // Parallel bulk updates for all store groups
    const updatePromises = Array.from(storeGroups.entries()).map(async ([store, names]) => {
      if (typeof store.updateMany === 'function') {
        await store.updateMany(names, {
          status: WorkerCreationStatus.STOPPED,
          updatedAt: new Date(),
        });
      }
    });

    await Promise.all(updatePromises);

    await Promise.all(
      workerNames.map(async (name) =>
        WorkerFactory.stop(name, undefined, { skipPersistedUpdate: true })
      )
    );

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
