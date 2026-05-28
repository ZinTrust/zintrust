import { SystemTraceBridge } from '@/trace/SystemTraceBridge';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { resolveProxyRpcService, type ProxyRpcService } from '@proxy/CloudflareProxyShared';
import type { ProxyBackend, ProxyResponse } from '@proxy/ProxyBackend';
import type { ProxySigningConfig } from '@proxy/ProxyConfig';
import { createProxyServer } from '@proxy/ProxyServer';
import {
  resolveBaseConfig,
  resolveBaseSigningConfig,
  verifyRequestSignature,
  type BaseProxyOverrides,
} from '@proxy/ProxyServerUtils';
import { RequestValidator } from '@proxy/RequestValidator';
import {
  createQueueMonitorContext,
  dispatchServiceCommand,
  type QueueMonitorContext,
} from '@proxy/redis/RedisProxyActions';
import type IORedis from 'ioredis';

type ProxyConfig = {
  host: string;
  port: number;
  maxBodyBytes: number;
  redis: {
    host: string;
    port: number;
    password: string;
    db: number;
  };
  signing: ProxySigningConfig;
};

type ProxyOverrides = BaseProxyOverrides &
  Partial<{
    redisHost: string;
    redisPort: number;
    redisPassword: string;
    redisDb: number;
  }>;

type RedisClient = IORedis & {
  call?: (command: string, ...args: unknown[]) => Promise<unknown>;
};

type ProxyRpcRequest = {
  valid: boolean;
  requestId: string;
  service: ProxyRpcService;
  action?: string;
  payload: Record<string, unknown>;
  error?: { code: string; message: string };
};

const scriptCache = new Map<string, string>();
let scriptCacheClient: RedisClient | null = null;

const resolveRedisConfig = (
  overrides: ProxyOverrides = {}
): {
  host: string;
  port: number;
  password: string;
  db: number;
} => {
  const host =
    overrides.redisHost ?? Env.get('REDIS_PROXY_TARGET_HOST', Env.get('REDIS_HOST', '127.0.0.1'));
  const port =
    overrides.redisPort ?? Env.getInt('REDIS_PROXY_TARGET_PORT', Env.getInt('REDIS_PORT', 6379));
  const password =
    overrides.redisPassword ??
    Env.get('REDIS_PROXY_TARGET_PASSWORD', Env.get('REDIS_PASSWORD', ''));
  const db = overrides.redisDb ?? Env.getInt('REDIS_PROXY_TARGET_DB', Env.getInt('REDIS_DB', 0));

  return { host, port, password, db };
};

const resolveConfig = (overrides: ProxyOverrides = {}): ProxyConfig => {
  const proxyConfig = resolveBaseConfig(overrides, 'REDIS');
  const redisConfig = resolveRedisConfig(overrides);
  const signingConfig = resolveBaseSigningConfig(overrides, 'REDIS');

  return {
    host: proxyConfig.host,
    port: proxyConfig.port,
    maxBodyBytes: proxyConfig.maxBodyBytes,
    redis: redisConfig,
    signing: {
      keyId: signingConfig.keyId,
      secret: signingConfig.secret,
      require: signingConfig.requireSigning,
      windowMs: signingConfig.signingWindowMs,
    },
  };
};

const getRedisModule = async (): Promise<typeof import('ioredis')> => {
  return import('ioredis');
};

const createClient = async (config: ProxyConfig): Promise<RedisClient> => {
  const module = (await getRedisModule()) as unknown as Record<string, unknown>;
  const moduleDefault = module['default'] as Record<string, unknown> | undefined;
  const candidates = [
    module['Redis'],
    module['default'],
    moduleDefault?.['Redis'],
    moduleDefault?.['default'],
    module,
  ];

  const RedisCtor = candidates.find((candidate) => typeof candidate === 'function') as
    | (new (options: unknown) => RedisClient)
    | undefined;

  if (typeof RedisCtor !== 'function') {
    throw ErrorFactory.createConfigError(
      "Redis proxy could not resolve a Redis constructor from 'ioredis'."
    );
  }

  const maxReconnectRetries = Math.max(0, Env.getInt('REDIS_PROXY_CONNECT_MAX_RETRIES', 3));
  const reconnectBaseMs = Math.max(50, Env.getInt('REDIS_PROXY_CONNECT_RETRY_BASE_MS', 200));
  const reconnectCapMs = Math.max(
    reconnectBaseMs,
    Env.getInt('REDIS_PROXY_CONNECT_RETRY_CAP_MS', 2000)
  );

  const client = new RedisCtor({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    reconnectOnError: () => false,
    retryStrategy: (times: number) => {
      if (times > maxReconnectRetries) {
        return null;
      }
      return Math.min(times * reconnectBaseMs, reconnectCapMs);
    },
  });

  let lastErrorLogAt = 0;
  client.on('error', (error: unknown) => {
    const now = Date.now();
    if (now - lastErrorLogAt < 5000) {
      return;
    }
    lastErrorLogAt = now;
    Logger.warn('[RedisProxyServer] redis client error', error);
  });

  if (typeof client.connect === 'function') {
    await client.connect();
  }

  return client;
};

const normalizeRpcPayload = (
  payload: Record<string, unknown> | null | undefined
): Record<string, unknown> => {
  return payload ?? {};
};

const parseRedisCommandArgs = (payload: Record<string, unknown>): unknown[] => {
  return Array.isArray(payload['args']) ? (payload['args'] as unknown[]) : [];
};

const validateCommandPayload = (payload: Record<string, unknown>): ProxyRpcRequest => {
  const requestId =
    typeof payload['requestId'] === 'string' && payload['requestId'].trim() !== ''
      ? payload['requestId'].trim()
      : 'unknown';

  const service = resolveProxyRpcService(
    typeof payload['service'] === 'string' ? payload['service'] : undefined
  );

  let actionValue: string | undefined;

  if (typeof payload['action'] === 'string') {
    actionValue = payload['action'];
  } else if (typeof payload['command'] === 'string') {
    actionValue = payload['command'];
  }

  const normalizedPayload = normalizeRpcPayload(
    (payload['payload'] as Record<string, unknown> | null | undefined) ?? undefined
  );

  if (typeof actionValue !== 'string' || actionValue.trim() === '') {
    return {
      valid: false,
      requestId,
      service,
      payload: normalizedPayload,
      error: { code: 'VALIDATION_ERROR', message: 'action is required' },
    };
  }

  return {
    valid: true,
    requestId,
    service,
    action: actionValue.trim(),
    payload: normalizedPayload,
  };
};

const handleScriptCommand = async (
  args: unknown[],
  config: ProxyConfig
): Promise<ProxyResponse> => {
  const subCommand = String(args[0]).toLowerCase();
  Logger.info('[RedisProxyServer] SCRIPT command received', {
    subCommand,
    argsCount: args.length,
  });

  if (subCommand !== 'load' || args.length <= 1) {
    return { status: 200, body: { result: null } };
  }

  const script = String(args[1]);
  Logger.info('[RedisProxyServer] Loading script into Redis', { scriptLength: script.length });
  const cacheClient = await getScriptCacheClient(config);
  const sha = await cacheClient.call('SCRIPT', 'LOAD', script);

  if (typeof sha === 'string') {
    scriptCache.set(sha, script);
    Logger.info('[RedisProxyServer] Script loaded into cache', {
      sha,
      cacheSize: scriptCache.size,
    });
  } else {
    Logger.warn('[RedisProxyServer] Script LOAD returned non-string SHA', {
      sha,
      type: typeof sha,
    });
  }

  return { status: 200, body: { result: sha } };
};

const handleStandardRedisCommand = async (
  client: RedisClient,
  action: string,
  args: unknown[]
): Promise<ProxyResponse> => {
  const command = action.trim();
  const lower = command.toLowerCase();

  if (lower === 'evalsha' && args.length > 0) {
    const sha = String(args[0]);
    Logger.info('[RedisProxyServer] EVALSHA command received', {
      sha,
      cacheSize: scriptCache.size,
      hasScript: scriptCache.has(sha),
    });
    if (scriptCache.has(sha)) {
      Logger.info('[RedisProxyServer] Using cached script for EVALSHA', { sha });
    } else {
      Logger.warn('[RedisProxyServer] Script not in cache, will attempt direct EVALSHA', {
        sha,
        availableScripts: Array.from(scriptCache.keys()).slice(0, 5),
      });
    }
  }

  const directCandidate = (client as unknown as Record<string, unknown>)[command];
  if (typeof directCandidate === 'function') {
    return {
      status: 200,
      body: {
        result: await (directCandidate as (...input: unknown[]) => Promise<unknown>).apply(
          client,
          args
        ),
      },
    };
  }

  const lowerCandidate = (client as unknown as Record<string, unknown>)[lower];
  if (typeof lowerCandidate === 'function') {
    return {
      status: 200,
      body: {
        result: await (lowerCandidate as (...input: unknown[]) => Promise<unknown>).apply(
          client,
          args
        ),
      },
    };
  }

  if (typeof client.call === 'function') {
    return { status: 200, body: { result: await client.call(command, ...args) } };
  }

  throw ErrorFactory.createValidationError(`Unsupported Redis command: ${action}`);
};

const handleServiceRpc = async (
  client: RedisClient,
  validated: ProxyRpcRequest,
  queueMonitor: QueueMonitorContext
): Promise<ProxyResponse> => {
  const startedAt = Date.now();

  try {
    const result = await dispatchServiceCommand(
      validated.service,
      validated.action ?? '',
      validated.payload,
      queueMonitor
    );

    SystemTraceBridge.emitRedis(
      `${validated.service}:${validated.action ?? 'unknown'}`,
      Date.now() - startedAt
    );

    return { status: 200, body: { result } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('Unsupported worker action:') ||
      message.includes('Unsupported queue-monitor action:')
    ) {
      const parsedArgs = parseRedisCommandArgs(validated.payload);
      return handleStandardRedisCommand(client, validated.action ?? '', parsedArgs);
    }

    throw error;
  }
};

const handleRedisRequest = async (
  request: { method: string; path: string; body: string },
  config: ProxyConfig,
  queueMonitor: QueueMonitorContext
): Promise<ProxyResponse> => {
  Logger.info('[RedisProxyServer] Handling request', {
    method: request.method,
    path: request.path,
    scriptCacheSize: scriptCache.size,
  });

  const methodError = RequestValidator.requirePost(request.method);
  if (methodError) {
    return {
      status: 405,
      body: { code: methodError.code, message: methodError.message },
    };
  }

  if (request.path !== '/zin/redis/command') {
    return { status: 404, body: { code: 'NOT_FOUND', message: 'Unknown endpoint' } };
  }

  const parsed = RequestValidator.parseJson(request.body);
  if (!parsed.ok) {
    return { status: 400, body: { code: parsed.error.code, message: parsed.error.message } };
  }

  const validated = validateCommandPayload(parsed.value);
  if (!validated.valid) {
    return {
      status: 400,
      body: {
        code: validated.error?.code ?? 'VALIDATION_ERROR',
        message: validated.error?.message ?? 'Invalid request',
      },
    };
  }

  const client = await createClient(config);

  if (validated.service === 'worker' || validated.service === 'queue-monitor') {
    return handleServiceRpc(client, validated, queueMonitor);
  }

  try {
    const parsedArgs = parseRedisCommandArgs(validated.payload);
    if (validated.action?.toLowerCase() === 'script') {
      return await handleScriptCommand(parsedArgs, config);
    }

    return await handleStandardRedisCommand(client, validated.action ?? '', parsedArgs);
  } finally {
    await client.quit();
  }
};

const handleRedisHealth = async (config: ProxyConfig): Promise<ProxyResponse> => {
  try {
    const client = await createClient(config);
    try {
      const pingFn = (client as unknown as { ping?: () => Promise<unknown> }).ping;
      if (typeof pingFn === 'function') {
        await pingFn.apply(client);
      } else {
        await handleStandardRedisCommand(client, 'PING', []);
      }
      return { status: 200, body: { status: 'healthy' } };
    } finally {
      await client.quit();
    }
  } catch (error) {
    Logger.warn('[RedisProxyServer] health check failed', error);
    return { status: 503, body: { status: 'unhealthy', error: String(error) } };
  }
};

const createBackend = async (config: ProxyConfig): Promise<ProxyBackend> => {
  const queueMonitor = await createQueueMonitorContext(config.redis);

  return {
    name: 'redis',
    handle: async (request) => handleRedisRequest(request, config, queueMonitor),
    health: async (): Promise<ProxyResponse> => handleRedisHealth(config),
    shutdown: async (): Promise<void> => {
      await Promise.all([queueMonitor.driver.close(), queueMonitor.metrics.close()]);
    },
  };
};

const getScriptCacheClient = async (config: ProxyConfig): Promise<RedisClient> => {
  if (scriptCacheClient !== null && scriptCacheClient.status === 'ready') {
    return scriptCacheClient;
  }

  const module = (await getRedisModule()) as unknown as Record<string, unknown>;
  const moduleDefault = module['default'] as Record<string, unknown> | undefined;
  const candidates = [
    module['Redis'],
    module['default'],
    moduleDefault?.['Redis'],
    moduleDefault?.['default'],
    module,
  ];
  const RedisCtor = candidates.find((candidate) => typeof candidate === 'function') as
    | (new (options: unknown) => RedisClient)
    | undefined;

  if (typeof RedisCtor !== 'function') {
    throw ErrorFactory.createConfigError(
      "Redis proxy could not resolve a Redis constructor from 'ioredis'."
    );
  }

  scriptCacheClient = new RedisCtor({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
    lazyConnect: false,
    retryStrategy: (times: number) => {
      if (times > 3) return null;
      return Math.min(times * 100, 1000);
    },
  });

  if (typeof scriptCacheClient.connect === 'function') {
    await scriptCacheClient.connect();
  }

  scriptCacheClient.on('error', (error: unknown) => {
    Logger.warn('[RedisProxyServer] script cache client error', error);
  });

  return scriptCacheClient;
};

export const RedisProxyServer = Object.freeze({
  async start(overrides: ProxyOverrides = {}): Promise<void> {
    const config = resolveConfig(overrides);
    const backend = await createBackend(config);

    Logger.info('[RedisProxyServer] Starting Redis proxy', {
      host: config.host,
      port: config.port,
      redisHost: config.redis.host,
      redisPort: config.redis.port,
      redisDb: config.redis.db,
    });

    const server = createProxyServer({
      host: config.host,
      port: config.port,
      maxBodyBytes: config.maxBodyBytes,
      backend,
      verify: async (req, body) => {
        const verified = await verifyRequestSignature(req, body, config, 'RedisProxyServer');
        if (!verified.ok && verified.error) {
          return { ok: false, status: verified.error.status, message: verified.error.message };
        }
        return { ok: true };
      },
    });

    await server.start();
    Logger.info(`[redis-proxy] Listening on http://${config.host}:${config.port}`, {
      scriptCacheSize: scriptCache.size,
      luaScriptSupport: 'enabled',
    });
  },
});

export default RedisProxyServer;
