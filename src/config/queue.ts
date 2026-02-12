/**
 * Queue Configuration
 * Background job and message queue settings
 * Sealed namespace for immutability
 */

import { Cloudflare } from '@config/cloudflare';
import { Env } from '@config/env';
import { ZintrustLang } from '@lang/lang';

import type { QueueConfigWithDrivers, QueueDriverName, QueueDriversConfig } from '@config/type';
import { StartupConfigFile, StartupConfigFileRegistry } from '@runtime/StartupConfigFileRegistry';

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
  };
}>;

const getQueueDriver = (
  driverConfig: QueueConfigWithDrivers
): QueueDriversConfig[QueueDriverName] => {
  const driverName = driverConfig.default;
  return driverConfig.drivers[driverName];
};

const readWorkersEnvString = (key: string): string => {
  const workerValue = Cloudflare.getWorkersVar(key);
  if (workerValue !== null && workerValue.trim() !== '') return workerValue;
  return '';
};

const readWorkersFallbackString = (
  workersKey: string,
  fallbackKey: string,
  fallback = ''
): string => {
  const workerValue = readWorkersEnvString(workersKey);
  if (workerValue.trim() !== '') return workerValue;
  return Env.get(fallbackKey, fallback);
};

const readWorkersFallbackInt = (
  workersKey: string,
  fallbackKey: string,
  fallback: number
): number => {
  const raw = readWorkersFallbackString(workersKey, fallbackKey, String(fallback));
  if (raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseRedisUrl = (
  rawUrl: string
): { host: string; port: number; password?: string; database?: number } | null => {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') return null;
    const host = url.hostname;
    const port = url.port ? Number.parseInt(url.port, 10) : 6379;
    const password = url.password ? decodeURIComponent(url.password) : undefined;
    const db = url.pathname ? Number.parseInt(url.pathname.replace('/', ''), 10) : undefined;
    return { host, port, password, database: Number.isFinite(db ?? NaN) ? db : undefined };
  } catch {
    return null;
  }
};

const resolveRedisProxyConfig = (): {
  host: string;
  port: number;
  password?: string;
  database?: number;
} | null => {
  const proxyUrl = Env.get('REDIS_PROXY_URL', '').trim();
  const parsed = proxyUrl ? parseRedisUrl(proxyUrl) : null;
  if (parsed) return parsed;

  if (Env.getBool('USE_REDIS_PROXY', false)) {
    return {
      host: Env.get('REDIS_PROXY_HOST', ''),
      port: Env.getInt('REDIS_PROXY_PORT', 6379),
      password: Env.get('REDIS_PASSWORD', ''),
      database: Env.getInt('REDIS_QUEUE_DB', ZintrustLang.REDIS_DEFAULT_DB),
    };
  }

  return null;
};

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
  redis: {
    driver: 'redis' as const,
    host:
      resolveRedisProxyConfig()?.host ??
      readWorkersFallbackString('WORKERS_REDIS_HOST', 'REDIS_HOST', 'localhost'),
    port:
      resolveRedisProxyConfig()?.port ??
      readWorkersFallbackInt('WORKERS_REDIS_PORT', 'REDIS_PORT', 6379),
    password:
      resolveRedisProxyConfig()?.password ??
      readWorkersFallbackString('WORKERS_REDIS_PASSWORD', 'REDIS_PASSWORD'),
    database:
      resolveRedisProxyConfig()?.database ??
      readWorkersFallbackInt(
        'WORKERS_REDIS_QUEUE_DB',
        'REDIS_QUEUE_DB',
        ZintrustLang.REDIS_DEFAULT_DB
      ),
  },
  rabbitmq: {
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
  },
  sqs: {
    driver: 'sqs' as const,
    key: Env.get('AWS_ACCESS_KEY_ID'),
    secret: Env.get('AWS_SECRET_ACCESS_KEY'),
    region: Env.AWS_REGION,
    queueUrl: Env.get('AWS_SQS_QUEUE_URL'),
  },
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
} => ({
  enabled: Env.getBool('QUEUE_MONITOR_ENABLED', true),
  basePath: Env.get('QUEUE_MONITOR_BASE_PATH', '/queue-monitor'),
  middleware: Env.get('QUEUE_MONITOR_MIDDLEWARE', '')
    .split(',')
    .map((m: string) => m.trim())
    .filter((m: string | string[]) => m.length > 0) as ReadonlyArray<string>,
  autoRefresh: Env.getBool('QUEUE_MONITOR_AUTO_REFRESH', true),
  refreshIntervalMs: Env.getInt('QUEUE_MONITOR_REFRESH_MS', 5000),
});

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
    Object.defineProperties(
      proxyTarget as unknown as object,
      Object.getOwnPropertyDescriptors(cached)
    );
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
    return Reflect.ownKeys(proxyTarget as unknown as object);
  },
  getOwnPropertyDescriptor(_target, prop) {
    ensureQueueConfig();
    return Object.getOwnPropertyDescriptor(proxyTarget as unknown as object, prop);
  },
});
