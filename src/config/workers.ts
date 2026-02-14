/**
 * Workers Configuration
 * Background worker management settings
 * Sealed namespace for immutability
 */

import { Cloudflare } from '@config/cloudflare';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import type {
  RedisConfig,
  WorkerConfig,
  WorkerObservabilityConfig,
  WorkersConfigOverrides,
  WorkersGlobalConfig,
} from '@config/type';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { createRequire } from '@node-singletons/module';
import { StartupConfigFile, StartupConfigFileRegistry } from '@runtime/StartupConfigFileRegistry';
import type IORedis from 'ioredis';

let redisModule: typeof import('ioredis') | null | undefined;
let warnedRedisProxyMismatch = false;

const parseHttpProxyEndpoint = (proxyUrl: string): { host: string; port: number } | null => {
  try {
    const url = new URL(proxyUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    const host = url.hostname.trim();
    const defaultPort = url.protocol === 'https:' ? 443 : 80;
    const port = url.port ? Number.parseInt(url.port, 10) : defaultPort;
    if (host === '' || !Number.isFinite(port)) {
      return null;
    }
    return { host, port };
  } catch {
    return null;
  }
};

const resolveIORedis = (): typeof import('ioredis') => {
  const injected = (globalThis as unknown as { __zintrustIoredisModule?: unknown })
    .__zintrustIoredisModule;
  if (injected !== undefined && injected !== null) {
    redisModule = injected as typeof import('ioredis');
  }

  if (redisModule !== undefined) {
    if (redisModule === null) {
      throw ErrorFactory.createConfigError(
        "Workers Redis driver requires the 'ioredis' package. Install it with `npm i ioredis` to enable Redis workers."
      );
    }
    return redisModule;
  }

  try {
    const require = createRequire(import.meta.url);
    const requiredModule: unknown = require('ioredis');

    // For test environments, be more permissive - if it's an object with Redis or is a function, accept it
    if (
      requiredModule !== null &&
      requiredModule !== undefined &&
      (typeof requiredModule === 'object' || typeof requiredModule === 'function')
    ) {
      const moduleAsRecord = requiredModule as Record<string, unknown>;

      // Check if it has Redis property or if it's directly the Redis constructor
      if (typeof moduleAsRecord['Redis'] === 'function' || typeof requiredModule === 'function') {
        redisModule = requiredModule as typeof import('ioredis');
      } else {
        redisModule = null;
      }
    } else {
      redisModule = null;
    }
  } catch {
    redisModule = null;
  }

  if (!redisModule) {
    throw ErrorFactory.createConfigError(
      "Workers Redis driver requires the 'ioredis' package. Install it with `npm i ioredis` to enable Redis workers."
    );
  }

  return redisModule;
};

const getProxySettings = (): {
  proxyUrl: string;
  parsedHttpProxy: { host: string; port: number } | null;
  proxyIsHttp: boolean;
  proxyTargetHost: string;
  proxyTargetPort: number;
} => {
  const proxyUrl = (Env.get('REDIS_PROXY_URL', '') || '').trim();
  const parsedHttpProxy = parseHttpProxyEndpoint(proxyUrl);
  const proxyIsHttp = parsedHttpProxy !== null;
  const proxyHost = (Env.get('REDIS_PROXY_HOST', '') || '').trim();
  const proxyPort = Env.getInt('REDIS_PROXY_PORT', 6379);

  return {
    proxyUrl,
    parsedHttpProxy,
    proxyIsHttp,
    proxyTargetHost: parsedHttpProxy?.host ?? proxyHost,
    proxyTargetPort: parsedHttpProxy?.port ?? proxyPort,
  };
};

const validateRedisConfig = (
  _config: RedisConfig,
  effectiveConfig: RedisConfig,
  isWorkersRuntime: boolean,
  proxySettings: ReturnType<typeof getProxySettings>
): void => {
  const { proxyIsHttp, proxyTargetHost, proxyTargetPort } = proxySettings;

  const stillTargetsHttpProxy =
    proxyIsHttp &&
    proxyTargetHost !== '' &&
    effectiveConfig.host.trim() === proxyTargetHost &&
    Number(effectiveConfig.port) === Number(proxyTargetPort);

  if (!isWorkersRuntime && stillTargetsHttpProxy) {
    throw ErrorFactory.createConfigError(
      'Redis config points to an HTTP proxy endpoint. Set REDIS_HOST/REDIS_PORT to your TCP Redis server (redis://), not REDIS_PROXY_URL/REDIS_PROXY_PORT.'
    );
  }

  const shouldUseProxy =
    Env.USE_REDIS_PROXY === true || (Env.get('REDIS_PROXY_URL', '') || '').trim() !== '';

  if (!shouldUseProxy && isWorkersRuntime && Cloudflare.isCloudflareSocketsEnabled() === false) {
    throw ErrorFactory.createConfigError(
      'Redis connections in Cloudflare Workers require ENABLE_CLOUDFLARE_SOCKETS=true.'
    );
  }
};

const resolveRedisConstructor = (): new (options: unknown) => IORedis => {
  const module = resolveIORedis() as unknown as Record<string, unknown>;
  const moduleDefault = module['default'] as Record<string, unknown> | undefined;
  const candidates = [
    module['Redis'],
    module['default'],
    moduleDefault?.['Redis'],
    moduleDefault?.['default'],
    module,
  ];
  const RedisCtor = candidates.find((candidate) => typeof candidate === 'function') as
    | (new (options: unknown) => IORedis)
    | undefined;
  if (typeof RedisCtor !== 'function') {
    throw ErrorFactory.createConfigError(
      "Workers Redis driver could not resolve a Redis constructor from 'ioredis'."
    );
  }
  return RedisCtor;
};

const setupRedisErrorHandler = (client: IORedis): void => {
  if (typeof client.on === 'function') {
    client.on('error', (err: Error) => {
      try {
        if (err?.message?.includes('NOAUTH')) {
          Logger.error(
            '[workers][redis] NOAUTH: Redis requires authentication. Provide `password` in the workers Redis config.'
          );
        }
        // eslint-disable-next-line no-console
        console.error('[workers][redis] Redis error:', err.message || err);
      } catch (error_) {
        Logger.error('Redis error handler failed', error_ as Error);
      }
    });
  }
};

const resolveEffectiveRedisConfig = (
  config: RedisConfig,
  isWorkersRuntime: boolean,
  proxySettings: ReturnType<typeof getProxySettings>
): RedisConfig => {
  const { proxyIsHttp, proxyTargetHost, proxyTargetPort } = proxySettings;

  const configTargetsHttpProxy =
    proxyIsHttp &&
    proxyTargetHost !== '' &&
    config.host.trim() === proxyTargetHost &&
    Number(config.port) === Number(proxyTargetPort);

  if (!isWorkersRuntime && configTargetsHttpProxy) {
    if (!warnedRedisProxyMismatch) {
      warnedRedisProxyMismatch = true;
      Logger.warn(
        'Detected Redis config pointing to HTTP proxy endpoint in Node runtime. Falling back to standard REDIS_HOST/REDIS_PORT settings to prevent protocol errors.'
      );
    }

    return {
      host: Env.get('REDIS_HOST', config.host),
      port: Env.getInt('REDIS_PORT', config.port),
      password: Env.get('REDIS_PASSWORD', config.password),
      db: Env.getInt('REDIS_QUEUE_DB', config.db),
    };
  }

  return config;
};

export const createRedisConnection = (config: RedisConfig, maxRetries = 3): IORedis => {
  const isWorkersRuntime = Cloudflare.getWorkersEnv() !== null;
  const proxySettings = getProxySettings();
  const effectiveConfig = resolveEffectiveRedisConfig(config, isWorkersRuntime, proxySettings);

  validateRedisConfig(config, effectiveConfig, isWorkersRuntime, proxySettings);

  const RedisCtor = resolveRedisConstructor();

  const client = new RedisCtor({
    host: effectiveConfig.host,
    port: effectiveConfig.port,
    password: effectiveConfig.password,
    db: effectiveConfig.db,
    maxRetriesPerRequest: null, // Required by BullMQ
    retryStrategy: (times: number): number | null => {
      if (times > maxRetries) return null;
      return Math.min(times * 50, 2000);
    },
  });

  setupRedisErrorHandler(client);

  return client;
};

const createIntervalConfig = (): number => Env.SSE_SNAPSHOT_INTERVAL;

/**
 * Helper: Create default worker configuration from environment
 */
const createDefaultWorkerConfig = (): Partial<WorkerConfig> => ({
  enabled: Env.getBool('WORKER_ENABLED', Cloudflare.getWorkersEnv() === null),
  concurrency: Env.getInt('WORKER_CONCURRENCY', 5),
  timeout: Env.getInt('WORKER_TIMEOUT', 60),
  retries: Env.getInt('WORKER_RETRIES', 3),
  autoStart: Env.getBool('WORKER_AUTO_START', false),
  priority: Env.getInt('WORKER_PRIORITY', 1),
  healthCheckInterval: Env.getInt('WORKER_HEALTH_CHECK_INTERVAL', 60),
  clusterMode: Env.getBool('WORKER_CLUSTER_MODE', true),
  region: Env.get('WORKER_REGION', 'us-east-1'),
  intervalMs: createIntervalConfig(),
});

/**
 * Helper: Create auto-scaling configuration from environment
 */
const createAutoScalingConfig = (): WorkersGlobalConfig['autoScaling'] => ({
  enabled: Env.getBool('WORKER_AUTO_SCALING_ENABLED', false),
  interval: Env.getInt('WORKER_AUTO_SCALING_INTERVAL', 30),
  offPeakSchedule: Env.get('WORKER_OFF_PEAK_SCHEDULE', '22:00-06:00'),
  offPeakReduction: Env.getFloat('WORKER_OFF_PEAK_REDUCTION', 0.7),
});

/**
 * Helper: Create cost optimization configuration from environment
 */
const createCostOptimizationConfig = (): WorkersGlobalConfig['costOptimization'] => ({
  enabled: Env.getBool('WORKER_COST_OPTIMIZATION_ENABLED', false),
  spotInstances: Env.getBool('WORKER_SPOT_INSTANCES', false),
  offPeakScaling: Env.getBool('WORKER_OFF_PEAK_SCALING', false),
});

/**
 * Helper: Create compliance configuration from environment
 */
const createComplianceConfig = (): WorkersGlobalConfig['compliance'] => ({
  auditLog: Env.getBool('WORKER_AUDIT_LOG', true),
  encryption: Env.getBool('WORKER_ENCRYPTION', true),
  dataRetention: Env.getInt('WORKER_DATA_RETENTION', 90),
  gdpr: Env.getBool('WORKER_GDPR', false),
  hipaa: Env.getBool('WORKER_HIPAA', false),
  soc2: Env.getBool('WORKER_SOC2', true),
});

/**
 * Helper: Create observability configuration from environment
 */
const createObservabilityConfig = (): WorkerObservabilityConfig => ({
  prometheus: {
    enabled: Env.getBool('WORKER_PROMETHEUS_ENABLED', false),
    port: Env.getInt('WORKER_PROMETHEUS_PORT', 9090),
  },
  opentelemetry: {
    enabled: Env.getBool('WORKER_OPENTELEMETRY_ENABLED', false),
    endpoint: Env.get('WORKER_OPENTELEMETRY_ENDPOINT', 'http://localhost:7777'),
  },
  datadog: {
    enabled: Env.getBool('WORKER_DATADOG_ENABLED', false),
    apiKey: Env.get('WORKER_DATADOG_API_KEY', ''),
  },
});

const createProcessorSpecConfig = (): WorkersGlobalConfig['processorSpec'] => ({
  remoteAllowlist: ['wk.zintrust.com'],
  fetchTimeoutMs: Env.getInt('PROCESSOR_FETCH_TIMEOUT', 30000),
  fetchMaxSizeBytes: Env.getInt('PROCESSOR_FETCH_MAX_SIZE', 512 * 1024),
  retryAttempts: Env.getInt('PROCESSOR_FETCH_RETRY_ATTEMPTS', 3),
  retryBackoffMs: Env.getInt('PROCESSOR_FETCH_RETRY_BACKOFF_MS', 1000),
  cacheDefaultTtlSeconds: Env.getInt('PROCESSOR_CACHE_DEFAULT_TTL', 60 * 60),
  cacheMaxTtlSeconds: Env.getInt('PROCESSOR_CACHE_MAX_TTL', 7 * 24 * 60 * 60),
  cacheMaxSizeBytes: Env.getInt('PROCESSOR_CACHE_MAX_SIZE', 50 * 1024 * 1024),
});

const createWorkersConfig = (): WorkersGlobalConfig => {
  const overrides: WorkersConfigOverrides =
    StartupConfigFileRegistry.get<WorkersConfigOverrides>(StartupConfigFile.Workers) ?? {};

  const baseConfig: WorkersGlobalConfig = {
    enabled: Env.getBool('WORKERS_ENABLED', true),
    healthCheckInterval: Env.getInt('WORKERS_HEALTH_CHECK_INTERVAL', 60),
    clusterMode: Env.getBool('WORKERS_CLUSTER_MODE', false),
    processorSpec: createProcessorSpecConfig(),
    autoScaling: createAutoScalingConfig(),
    costOptimization: createCostOptimizationConfig(),
    compliance: createComplianceConfig(),
    observability: createObservabilityConfig(),
    defaultWorker: createDefaultWorkerConfig(),
    intervalMs: createIntervalConfig(),
  };

  const workersConfigObj: WorkersGlobalConfig = {
    enabled: overrides.enabled ?? baseConfig.enabled,
    intervalMs: createIntervalConfig(),
    healthCheckInterval: overrides.healthCheckInterval ?? baseConfig.healthCheckInterval,
    clusterMode: overrides.clusterMode ?? baseConfig.clusterMode,
    processorSpec: {
      ...baseConfig.processorSpec,
      ...overrides.processorSpec,
    },
    autoScaling: {
      ...baseConfig.autoScaling,
      ...overrides.autoScaling,
    },
    costOptimization: {
      ...baseConfig.costOptimization,
      ...overrides.costOptimization,
    },
    compliance: {
      ...baseConfig.compliance,
      ...overrides.compliance,
    },
    observability: {
      prometheus: {
        ...baseConfig.observability.prometheus,
        ...overrides.observability?.prometheus,
      },
      opentelemetry: {
        ...baseConfig.observability.opentelemetry,
        ...overrides.observability?.opentelemetry,
      },
      datadog: {
        ...baseConfig.observability.datadog,
        ...overrides.observability?.datadog,
      },
    },
    defaultWorker: {
      ...baseConfig.defaultWorker,
      ...overrides.defaultWorker,
    },
  };

  return Object.freeze(workersConfigObj);
};

export type WorkersConfig = ReturnType<typeof createWorkersConfig>;

let cached: WorkersConfig | null = null;
const proxyTarget: WorkersConfig = {} as WorkersConfig;

const ensureWorkersConfig = (): WorkersConfig => {
  if (cached) return cached;
  cached = createWorkersConfig();

  try {
    Object.defineProperties(
      proxyTarget as unknown as object,
      Object.getOwnPropertyDescriptors(cached)
    );
  } catch {
    // best-effort
  }

  return cached;
};

export const workersConfig: WorkersConfig = new Proxy(proxyTarget, {
  get(_target, prop: keyof WorkersConfig) {
    return ensureWorkersConfig()[prop];
  },
  ownKeys() {
    ensureWorkersConfig();
    return Reflect.ownKeys(proxyTarget as unknown as object);
  },
  getOwnPropertyDescriptor(_target, prop) {
    ensureWorkersConfig();
    return Object.getOwnPropertyDescriptor(proxyTarget as unknown as object, prop);
  },
});
