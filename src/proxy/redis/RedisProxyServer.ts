import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { ErrorHandler } from '@proxy/ErrorHandler';
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

const validateCommandPayload = (
  payload: Record<string, unknown>
): {
  valid: boolean;
  command?: string;
  args?: unknown[];
  error?: { code: string; message: string };
} => {
  const command = payload['command'];
  const args = Array.isArray(payload['args']) ? payload['args'] : [];

  if (typeof command !== 'string' || command.trim() === '') {
    return { valid: false, error: { code: 'VALIDATION_ERROR', message: 'command is required' } };
  }

  return { valid: true, command, args };
};

const getRedisModule = async (): Promise<typeof import('ioredis')> => {
  const mod = await import('ioredis');
  return mod as unknown as typeof import('ioredis');
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

const executeCommand = async (
  client: RedisClient,
  command: string,
  args: unknown[]
): Promise<unknown> => {
  const trimmed = command.trim();
  const lower = trimmed.toLowerCase();
  const candidate = (client as unknown as Record<string, unknown>)[lower];

  if (typeof candidate === 'function') {
    return (candidate as (...input: unknown[]) => Promise<unknown>).apply(client, args);
  }

  if (typeof client.call === 'function') {
    return client.call(trimmed, ...args);
  }

  throw ErrorFactory.createValidationError(`Unsupported Redis command: ${trimmed}`);
};

const createBackend = (config: ProxyConfig): ProxyBackend => ({
  name: 'redis',
  handle: async (request) => {
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

    const command = validated.command ?? '';
    if (command.trim() === '') {
      return {
        status: 400,
        body: { code: 'VALIDATION_ERROR', message: 'command is required' },
      };
    }

    try {
      const client = await createClient(config);
      try {
        const result = await executeCommand(client, command, validated.args ?? []);
        return { status: 200, body: { result } };
      } finally {
        await client.quit();
      }
    } catch (error) {
      return ErrorHandler.toProxyError(500, 'REDIS_PROXY_ERROR', String(error));
    }
  },
  health: async (): Promise<ProxyResponse> => {
    try {
      const client = await createClient(config);
      const pingFn = (client as unknown as { ping?: () => Promise<unknown> }).ping;
      if (typeof pingFn === 'function') {
        await pingFn.apply(client);
      } else {
        await executeCommand(client, 'PING', []);
      }
      await client.quit();
      return { status: 200, body: { status: 'healthy' } };
    } catch (error) {
      Logger.warn('[RedisProxyServer] health check failed', error);
      return { status: 503, body: { status: 'unhealthy', error: String(error) } };
    }
  },
});

export const RedisProxyServer = Object.freeze({
  async start(overrides: ProxyOverrides = {}): Promise<void> {
    const config = resolveConfig(overrides);
    const backend = createBackend(config);

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
    Logger.info(`[redis-proxy] Listening on http://${config.host}:${config.port}`);
  },
});

export default RedisProxyServer;
