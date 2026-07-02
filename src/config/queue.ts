/**
 * Queue Configuration
 * Background job and message queue settings
 * Sealed namespace for immutability
 */

import {
  parseJsonObjectEnv,
  readWorkersFallbackBool,
  readWorkersFallbackInt,
  readWorkersFallbackString,
} from '@common/EnvFallbackUtils';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import type { MiddlewaresType } from '@config/middleware';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { ZintrustLang } from '@lang/lang';

import type {
  QueueConfigWithDrivers,
  QueueDriverName,
  QueueDriversConfig,
  RabbitMqQueueDriverConfig,
  RedisQueueDriverConfig,
  SqsQueueDriverConfig,
  ZedgiQueueDriverConfig,
} from '@config/type';
import { StartupConfigFile, StartupConfigFileRegistry } from '@runtime/StartupConfigFileRegistry';

const StaticMiddlewareKeys = Object.freeze({
  log: true,
  error: true,
  security: true,
  rateLimit: true,
  sanitizeBody: true,
  fillRateLimit: true,
  authRateLimit: true,
  userMutationRateLimit: true,
  csrf: true,
  auth: true,
  jwt: true,
  bulletproof: true,
  validateLogin: true,
  validateRegister: true,
  validateUserStore: true,
  validateUserUpdate: true,
  validateUserFill: true,
} as const);

const isKnownQueueMonitorMiddlewareName = (value: string): boolean => {
  return (
    Object.hasOwn(StaticMiddlewareKeys, value) || /^rateLimit:\d+:\d+(?:\.\d+)?$/.test(value.trim())
  );
};

const getConfiguredQueueMonitorRouteKeys = (): ReadonlySet<string> => {
  const middlewareOverrides =
    StartupConfigFileRegistry.get<Partial<MiddlewaresType>>(StartupConfigFile.Middleware) ?? {};
  const routeConfig = middlewareOverrides.route;

  if (typeof routeConfig !== 'object' || routeConfig === null || Array.isArray(routeConfig)) {
    return new Set<string>();
  }

  return new Set(Object.keys(routeConfig));
};

export type QueueConfigOverrides = Partial<{
  default: QueueDriverName;
  drivers: Partial<QueueDriversConfig>;
  failed: { database: string; table: string };
  processing: { timeout: number; retries: number; backoff: number; workers: number };
  monitor: {
    enabled: boolean;
    basePath: string;
    middleware: ReadonlyArray<string>;
    autoRefresh: boolean;
    refreshIntervalMs: number;
    queueDataTimeoutMs: number;
  };
}>;

const getQueueDriver = (
  driverConfig: QueueConfigWithDrivers
): QueueDriversConfig[QueueDriverName] => {
  const driverName = driverConfig.default;
  return driverConfig.drivers[driverName];
};

const createRedisQueueDriver = (): RedisQueueDriverConfig => {
  return {
    driver: 'redis' as const,
    host: readWorkersFallbackString('WORKERS_REDIS_HOST', 'REDIS_HOST', 'localhost'),
    port: readWorkersFallbackInt('WORKERS_REDIS_PORT', 'REDIS_PORT', 6379),
    password: readWorkersFallbackString('WORKERS_REDIS_PASSWORD', 'REDIS_PASSWORD'),
    database: readWorkersFallbackInt(
      'WORKERS_REDIS_QUEUE_DB',
      'REDIS_QUEUE_DB',
      ZintrustLang.REDIS_DEFAULT_DB
    ),
    // Cloudflare tunnel-specific ioredis options
    connectTimeout: readWorkersFallbackInt(
      'WORKERS_REDIS_CONNECT_TIMEOUT',
      'REDIS_CONNECT_TIMEOUT',
      Env.REDIS_CONNECT_TIMEOUT
    ),
    keepAlive: readWorkersFallbackInt(
      'WORKERS_REDIS_KEEP_ALIVE',
      'REDIS_KEEP_ALIVE',
      Env.REDIS_KEEP_ALIVE
    ),
    enableOfflineQueue: readWorkersFallbackBool(
      'WORKERS_REDIS_ENABLE_OFFLINE_QUEUE',
      'REDIS_ENABLE_OFFLINE_QUEUE',
      Env.REDIS_ENABLE_OFFLINE_QUEUE
    ),
    maxLoadingRetryTime: readWorkersFallbackInt(
      'WORKERS_REDIS_MAX_LOADING_RETRY_TIME',
      'REDIS_MAX_LOADING_RETRY_TIME',
      Env.REDIS_MAX_LOADING_RETRY_TIME
    ),
  };
};

const createZedgiQueueDriver = (): ZedgiQueueDriverConfig => {
  return {
    driver: 'queue-zedgi' as const,
    password: readWorkersFallbackString('WORKERS_REDIS_PASSWORD', 'REDIS_PASSWORD'),
    database: readWorkersFallbackInt(
      'WORKERS_REDIS_QUEUE_DB',
      'REDIS_QUEUE_DB',
      ZintrustLang.REDIS_DEFAULT_DB
    ),
    header: parseJsonObjectEnv('ZEDGI_QUEUE_HEADER') ?? parseJsonObjectEnv('ZEDGI_REDIS_HEADER'),
  };
};

const createRabbitMqQueueDriver = (): RabbitMqQueueDriverConfig => ({
  driver: 'rabbitmq' as const,
  host: readWorkersFallbackString('WORKERS_RABBITMQ_HOST', 'RABBITMQ_HOST', 'localhost'),
  port: readWorkersFallbackInt('WORKERS_RABBITMQ_PORT', 'RABBITMQ_PORT', 5672),
  username: readWorkersFallbackString('WORKERS_RABBITMQ_USER', 'RABBITMQ_USER', 'guest'),
  password: readWorkersFallbackString('WORKERS_RABBITMQ_PASSWORD', 'RABBITMQ_PASSWORD', 'guest'),
  vhost: readWorkersFallbackString('WORKERS_RABBITMQ_VHOST', 'RABBITMQ_VHOST', '/'),
  httpGatewayUrl: readWorkersFallbackString(
    'WORKERS_RABBITMQ_HTTP_GATEWAY_URL',
    'RABBITMQ_HTTP_GATEWAY_URL'
  ),
  httpGatewayToken: readWorkersFallbackString(
    'WORKERS_RABBITMQ_HTTP_GATEWAY_TOKEN',
    'RABBITMQ_HTTP_GATEWAY_TOKEN'
  ),
  httpGatewayTimeoutMs: readWorkersFallbackInt(
    'WORKERS_RABBITMQ_HTTP_GATEWAY_TIMEOUT_MS',
    'RABBITMQ_HTTP_GATEWAY_TIMEOUT_MS',
    15000
  ),
});

const createSqsQueueDriver = (): SqsQueueDriverConfig => ({
  driver: 'sqs' as const,
  key: Env.get('AWS_ACCESS_KEY_ID'),
  secret: Env.get('AWS_SECRET_ACCESS_KEY'),
  region: Env.AWS_REGION,
  queueUrl: Env.get('AWS_SQS_QUEUE_URL'),
});

/**
 * Helper: Create base driver configurations from environment
 */
export const createBaseDrivers = (): QueueDriversConfig => ({
  sync: {
    driver: 'sync' as const,
  },
  memory: {
    driver: 'memory' as const,
    ttl: Env.getInt('QUEUE_MEMORY_TTL', 3600000), // 1 hour default
  },
  database: {
    driver: 'database' as const,
    table: Env.get('QUEUE_TABLE', 'jobs'),
    connection: Env.get('QUEUE_DB_CONNECTION', 'default'),
  },
  redis: createRedisQueueDriver(),
  'queue-zedgi': createZedgiQueueDriver(),
  rabbitmq: createRabbitMqQueueDriver(),
  sqs: createSqsQueueDriver(),
});

/**
 * Helper: Create monitor configuration from environment
 */
const createBaseMonitor = (): {
  enabled: boolean;
  basePath: string;
  middleware: ReadonlyArray<string>;
  autoRefresh: boolean;
  refreshIntervalMs: number;
  queueDataTimeoutMs: number;
} => {
  const enabled = Env.getBool('QUEUE_MONITOR_ENABLED', false);
  const basePath = Env.get('QUEUE_MONITOR_BASE_PATH', '/queue-monitor');
  const middleware = Env.get('QUEUE_MONITOR_MIDDLEWARE', '')
    .split(',')
    .map((m: string) => m.trim())
    .filter((m: string) => m.length > 0) as ReadonlyArray<string>;

  if (enabled && middleware.length > 0) {
    const knownKeys = getConfiguredQueueMonitorRouteKeys();
    const unknownKeys = middleware.filter((name) => {
      return !knownKeys.has(name) && !isKnownQueueMonitorMiddlewareName(name);
    });

    if (unknownKeys.length > 0) {
      Logger.error('Unknown QUEUE_MONITOR_MIDDLEWARE keys configured', {
        unknownKeys,
        basePath,
      });

      throw ErrorFactory.createConfigError(
        `Unknown QUEUE_MONITOR_MIDDLEWARE key(s): ${unknownKeys.join(
          ', '
        )}. These must match registered route middleware keys in your app or a supported dynamic middleware key such as rateLimit:<max>:<windowInMinutes>.`
      );
    }
  }

  return {
    enabled,
    basePath,
    middleware,
    autoRefresh: Env.getBool('QUEUE_MONITOR_AUTO_REFRESH', true),
    refreshIntervalMs: Env.getInt('QUEUE_MONITOR_REFRESH_MS', 5000),
    queueDataTimeoutMs: Env.getInt('QUEUE_DATA_TIMEOUT_MS', 10000),
  };
};

const createQueueConfig = (): {
  default: QueueDriverName;
  drivers: QueueDriversConfig;
  getDriver: (driverConfig: QueueConfigWithDrivers) => QueueDriversConfig[QueueDriverName];
  failed: { database: string; table: string };
  processing: { timeout: number; retries: number; backoff: number; workers: number };
  monitor: {
    enabled: boolean;
    basePath: string;
    middleware: ReadonlyArray<string>;
    autoRefresh: boolean;
    refreshIntervalMs: number;
    queueDataTimeoutMs: number;
  };
} => {
  const overrides: QueueConfigOverrides =
    StartupConfigFileRegistry.get<QueueConfigOverrides>(StartupConfigFile.Queue) ?? {};

  const baseDefault = Env.get('QUEUE_DRIVER', 'sync') as QueueDriverName;
  const baseDrivers = createBaseDrivers();

  const baseFailed = {
    database: Env.get('FAILED_JOBS_DB_CONNECTION', 'default'),
    table: Env.get('FAILED_JOBS_TABLE', 'failed_jobs'),
  };

  const baseProcessing = {
    timeout: Env.getInt('QUEUE_JOB_TIMEOUT', 60),
    retries: Env.getInt('QUEUE_JOB_RETRIES', 3),
    backoff: Env.getInt('QUEUE_JOB_BACKOFF', 0),
    workers: Env.getInt('QUEUE_WORKERS', 1),
  };

  const baseMonitor = createBaseMonitor();

  const mergedDrivers = {
    ...baseDrivers,
    ...overrides.drivers,
  } satisfies QueueDriversConfig;

  const queueConfigObj = {
    /**
     * Default queue driver
     */
    default: overrides.default ?? baseDefault,

    /**
     * Queue drivers
     */
    drivers: mergedDrivers,

    /**
     * Get queue driver config
     */
    getDriver(driverConfig: QueueConfigWithDrivers): QueueDriversConfig[QueueDriverName] {
      return getQueueDriver(driverConfig);
    },

    /**
     * Failed jobs table
     */
    failed: {
      ...baseFailed,
      ...overrides.failed,
    },

    /**
     * Job processing
     */
    processing: {
      ...baseProcessing,
      ...overrides.processing,
    },

    /**
     * Queue Monitor settings
     */
    monitor: {
      ...baseMonitor,
      ...overrides.monitor,
    },
  };

  return Object.freeze(queueConfigObj);
};

export type QueueConfig = ReturnType<typeof createQueueConfig>;

let cached: QueueConfig | null = null;
const proxyTarget: QueueConfig = {} as QueueConfig;

const ensureQueueConfig = (): QueueConfig => {
  if (cached) return cached;
  cached = createQueueConfig();

  try {
    Object.defineProperties(proxyTarget, Object.getOwnPropertyDescriptors(cached));
  } catch {
    // best-effort
  }

  return cached;
};

export const queueConfig: QueueConfig = new Proxy(proxyTarget, {
  get(_target, prop: keyof QueueConfig) {
    return ensureQueueConfig()[prop];
  },
  ownKeys() {
    ensureQueueConfig();
    return Reflect.ownKeys(proxyTarget);
  },
  getOwnPropertyDescriptor(_target, prop) {
    ensureQueueConfig();
    return Object.getOwnPropertyDescriptor(proxyTarget, prop);
  },
});
