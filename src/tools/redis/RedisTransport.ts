import { Env } from '@config/env';
import { Logger } from '@config/logger';
import type { RedisConfig } from '@config/type';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { parseCustomHeadersFromEnv } from '@orm/adapters/SqlProxyAdapterUtils';
import { SignedRequest } from '@security/SignedRequest';

export type RedisTransportMode = 'direct' | 'proxy' | 'rpc' | 'zedgi';

export type RedisTransportOptions = Readonly<{
  subsystem?: string;
  requireDirect?: boolean;
}>;

type ProxySettings = Readonly<{
  baseUrl: string;
  keyId?: string;
  secret?: string;
  timeoutMs: number;
  customHeaders?: Record<string, string>;
}>;

type RpcSettings = Readonly<{
  baseUrl: string;
  secret?: string;
  timeoutMs: number;
}>;

/** Settings bag for any non-direct transport mode (proxy, rpc, or zedgi). */
type RedisTransportSettings = ProxySettings | RpcSettings | { config: RedisConfig };

type RedisProxyConnection = {
  [x: string]: unknown;
  status: 'ready';
  connect: () => Promise<void>;
  quit: () => Promise<'OK'>;
  disconnect: () => void;
  on: (event: string, handler: (...args: unknown[]) => void) => RedisProxyConnection;
  once: (event: string, handler: (...args: unknown[]) => void) => RedisProxyConnection;
  off: (event: string, handler: (...args: unknown[]) => void) => RedisProxyConnection;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => RedisProxyConnection;
  call: (command: string, ...args: unknown[]) => Promise<unknown>;
  pipeline: () => {
    exec: () => Promise<Array<[Error | null, unknown]>>;
    [key: string]: unknown;
  };
  multi: () => {
    exec: () => Promise<Array<[Error | null, unknown]>>;
    [key: string]: unknown;
  };
  scanStream: (options?: { match?: string; count?: number }) => {
    on: (event: string, handler: (...args: unknown[]) => void) => unknown;
    once: (event: string, handler: (...args: unknown[]) => void) => unknown;
    off: (event: string, handler: (...args: unknown[]) => void) => unknown;
  };
};

// Zedgi executor registry for static provider registration
let zedgiRedisExecutor:
  | ((config: Record<string, unknown>, command: string, args: unknown[]) => Promise<unknown>)
  | undefined;

export const registerZedgiRedisExecutor = (executor: typeof zedgiRedisExecutor): void => {
  zedgiRedisExecutor = typeof executor === 'function' ? executor : undefined;
};

export const isZedgiRedisExecutorRegistered = (): boolean => zedgiRedisExecutor !== undefined;

const isZedgiRedisEnabled = (): boolean =>
  zedgiRedisExecutor !== undefined && readEnvBool('USE_ZEDGI', false);

const requestZedgiCommand = async (
  settings: unknown,
  command: string,
  args: unknown[]
): Promise<unknown> => {
  if (zedgiRedisExecutor === undefined) {
    throw ErrorFactory.createConfigError('Zedgi Redis executor is not registered');
  }
  return zedgiRedisExecutor(
    (settings as { config?: Record<string, unknown> }).config ?? {},
    command,
    args
  );
};

const loggedSelections = new Set<string>();

const readEnvString = (key: string, fallback = ''): string => {
  if (typeof Env.get === 'function') {
    return Env.get(key, fallback);
  }

  const value = (Env as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : fallback;
};

const readEnvBool = (key: string, fallback = false): boolean => {
  if (typeof Env.getBool === 'function') {
    return Env.getBool(key, fallback);
  }

  const value = (Env as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : fallback;
};

const readEnvInt = (key: string, fallback: number): number => {
  if (typeof Env.getInt === 'function') {
    return Env.getInt(key, fallback);
  }

  const value = (Env as Record<string, unknown>)[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  }

  return fallback;
};

const resolveSigningPrefix = (baseUrl: string): string | undefined => {
  try {
    const parsed = new URL(baseUrl);
    const path = parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname;
    if (path === '' || path === '/') return undefined;
    return path;
  } catch {
    return undefined;
  }
};

const buildRequestUrl = (baseUrl: string, requestPath: string): URL => {
  const url = new URL(baseUrl);
  const basePath = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
  const normalizedPath = requestPath.startsWith('/') ? requestPath : `/${requestPath}`;
  url.pathname = `${basePath}${normalizedPath}`;
  return url;
};

const buildSigningUrl = (requestUrl: URL, baseUrl: string): URL => {
  const prefix = resolveSigningPrefix(baseUrl);
  if (prefix === undefined) return requestUrl;

  if (requestUrl.pathname === prefix || requestUrl.pathname.startsWith(`${prefix}/`)) {
    const signingUrl = new URL(requestUrl.toString());
    const stripped = requestUrl.pathname.slice(prefix.length);
    signingUrl.pathname = stripped.startsWith('/') ? stripped : `/${stripped}`;
    return signingUrl;
  }

  return requestUrl;
};

const resolveProxyBaseUrl = (): string => {
  const explicit = readEnvString('REDIS_PROXY_URL', '').trim();
  if (explicit !== '') return explicit;
  return `http://${Env.REDIS_PROXY_HOST}:${Env.REDIS_PROXY_PORT}`;
};

const resolveProxySettings = (): ProxySettings => ({
  baseUrl: resolveProxyBaseUrl(),
  keyId: Env.REDIS_PROXY_KEY_ID.trim() === '' ? undefined : Env.REDIS_PROXY_KEY_ID,
  secret: Env.REDIS_PROXY_SECRET.trim() === '' ? undefined : Env.REDIS_PROXY_SECRET,
  timeoutMs: Env.REDIS_PROXY_TIMEOUT_MS,
  customHeaders: parseCustomHeadersFromEnv('REDIS'),
});

const isRedisRpcEnabled = (): boolean =>
  readEnvBool('USE_REDIS_PROXY', false) && readEnvString('REDIS_RPC_URL', '').trim() !== '';

const resolveRpcSettings = (): RpcSettings => ({
  baseUrl: readEnvString('REDIS_RPC_URL', '').trim(),
  secret: readEnvString(
    'REDIS_RPC_SECRET',
    readEnvString('REDIS_PROXY_SECRET', readEnvString('APP_KEY', ''))
  ),
  timeoutMs: readEnvInt('REDIS_RPC_TIMEOUT_MS', 30000),
});

const buildHeaders = async (
  settings: ProxySettings,
  requestUrl: URL,
  body: string
): Promise<Record<string, string>> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (settings.keyId !== undefined && settings.secret !== undefined) {
    const signingUrl = buildSigningUrl(requestUrl, settings.baseUrl);
    const signed = await SignedRequest.createHeaders({
      method: 'POST',
      url: signingUrl,
      body,
      keyId: settings.keyId,
      secret: settings.secret,
    });
    Object.assign(headers, signed);
  }

  if (settings.customHeaders !== undefined) {
    Object.assign(headers, settings.customHeaders);
  }

  return headers;
};

const requestProxyCommand = async <T>(
  settings: ProxySettings,
  command: string,
  args: unknown[]
): Promise<T> => {
  if (settings.baseUrl.trim() === '') {
    throw ErrorFactory.createConfigError('Redis proxy URL is missing (REDIS_PROXY_URL)');
  }

  const body = JSON.stringify({ command, args });
  const requestUrl = buildRequestUrl(settings.baseUrl, '/zin/redis/command');
  const headers = await buildHeaders(settings, requestUrl, body);
  const signal =
    typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
      ? AbortSignal.timeout(settings.timeoutMs)
      : undefined;

  const response = await fetch(requestUrl.toString(), {
    method: 'POST',
    headers,
    body,
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw ErrorFactory.createTryCatchError(`Redis proxy request failed (${response.status})`, text);
  }

  const parsed = (await response.json()) as { result: T };
  return parsed.result;
};

const requestRpcMethod = async <T>(
  settings: RpcSettings,
  method: string,
  payload: Record<string, unknown>
): Promise<T> => {
  if (settings.baseUrl.trim() === '') {
    throw ErrorFactory.createConfigError(
      'Redis RPC URL is missing. Set USE_REDIS_PROXY=true and REDIS_RPC_URL.'
    );
  }

  const url = new URL('/rpc', settings.baseUrl);
  const body = JSON.stringify({
    service: 'redis',
    method,
    payload,
  });
  const signal =
    typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
      ? AbortSignal.timeout(settings.timeoutMs)
      : undefined;

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.secret !== undefined && settings.secret.trim() !== ''
        ? { 'x-redis-rpc-secret': settings.secret }
        : {}),
    },
    body,
    signal,
  });

  const parsed = (await response.json()) as {
    ok?: boolean;
    result?: T;
    error?: { message?: string; details?: unknown };
  };
  if (!response.ok || parsed.ok !== true) {
    const errorMessage = parsed.error?.message;
    throw ErrorFactory.createTryCatchError(
      typeof errorMessage === 'string' && errorMessage.trim() !== ''
        ? errorMessage
        : `Redis RPC request failed (${response.status})`,
      parsed.error?.details
    );
  }

  return parsed.result as T;
};

const requestRpcCommand = async <T>(
  settings: RpcSettings,
  command: string,
  args: unknown[]
): Promise<T> => requestRpcMethod<T>(settings, 'call', { args: [command, ...args] });

const requestRpcPipeline = async (
  settings: RpcSettings,
  commands: Array<{ command: string; args: unknown[] }>,
  transaction: boolean
): Promise<Array<[Error | null, unknown]>> => {
  const results = await requestRpcMethod<Array<[string | null, unknown]>>(
    settings,
    transaction ? 'multi' : 'pipeline',
    { commands, transaction }
  );

  return results.map(([error, result]) => [
    error === null ? null : ErrorFactory.createTryCatchError(error),
    result,
  ]);
};

const requestRedisCommand = async <T>(
  mode: Exclude<RedisTransportMode, 'direct'>,
  settings: RedisTransportSettings,
  command: string,
  args: unknown[]
): Promise<T> => {
  if (mode === 'zedgi') {
    return requestZedgiCommand(settings, command, args) as Promise<T>;
  }
  return mode === 'rpc'
    ? requestRpcCommand(settings as RpcSettings, command, args)
    : requestProxyCommand(settings as ProxySettings, command, args);
};

const logTransportSelection = (
  mode: RedisTransportMode,
  config: RedisConfig,
  options: RedisTransportOptions | undefined
): void => {
  const rawSubsystem = options?.subsystem?.trim();
  const subsystem = rawSubsystem === undefined || rawSubsystem === '' ? 'redis' : rawSubsystem;
  const cacheKey = `${subsystem}:${mode}:${config.db}`;
  if (loggedSelections.has(cacheKey)) {
    return;
  }
  loggedSelections.add(cacheKey);
  Logger.info('[redis][transport] resolved transport', {
    subsystem,
    mode,
    db: config.db,
    host: mode === 'direct' ? config.host : undefined,
    port: mode === 'direct' ? config.port : undefined,
    proxyUrl: mode === 'proxy' ? resolveProxyBaseUrl() : undefined,
    rpcUrl: mode === 'rpc' ? readEnvString('REDIS_RPC_URL', '') : undefined,
    zedgiUrl: mode === 'zedgi' ? readEnvString('ZEDGI_URL', '') : undefined,
  });
};

const normalizeScanResponse = (value: unknown): [string, string[]] => {
  if (!Array.isArray(value) || value.length < 2) {
    return ['0', []];
  }

  const cursor = typeof value[0] === 'string' ? value[0] : String(value[0] ?? '0');
  const batch = Array.isArray(value[1])
    ? value[1].filter((entry): entry is string => typeof entry === 'string')
    : [];
  return [cursor, batch];
};

const createScanStream = (
  settings: RedisTransportSettings,
  mode: Exclude<RedisTransportMode, 'direct'>,
  options?: { match?: string; count?: number }
): {
  on: (event: string, handler: (...args: unknown[]) => void) => unknown;
  once: (event: string, handler: (...args: unknown[]) => void) => unknown;
  off: (event: string, handler: (...args: unknown[]) => void) => unknown;
} => {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();

  const stream = {
    on(event: string, handler: (...args: unknown[]) => void) {
      const current = handlers.get(event) ?? new Set<(...args: unknown[]) => void>();
      current.add(handler);
      handlers.set(event, current);
      return stream;
    },
    once(event: string, handler: (...args: unknown[]) => void) {
      const wrapped = (...args: unknown[]): void => {
        stream.off(event, wrapped);
        handler(...args);
      };
      return stream.on(event, wrapped);
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      handlers.get(event)?.delete(handler);
      return stream;
    },
  };

  const emit = (event: string, ...args: unknown[]): void => {
    for (const handler of handlers.get(event) ?? []) {
      handler(...args);
    }
  };

  queueMicrotask(() => {
    void (async () => {
      try {
        let cursor = '0';
        do {
          // eslint-disable-next-line no-await-in-loop
          const result = await requestRedisCommand<unknown>(mode, settings, 'SCAN', [
            cursor,
            'MATCH',
            options?.match ?? '*',
            'COUNT',
            String(options?.count ?? 200),
          ]);
          const [nextCursor, batch] = normalizeScanResponse(result);
          cursor = nextCursor;
          if (batch.length > 0) {
            emit('data', batch);
          }
        } while (cursor !== '0');

        emit('end');
      } catch (error) {
        emit('error', error);
      }
    })();
  });

  return stream;
};

const createPipeline = (
  settings: RedisTransportSettings,
  mode: Exclude<RedisTransportMode, 'direct'>,
  transaction = false
): {
  exec: () => Promise<Array<[Error | null, unknown]>>;
  [key: string]: unknown;
} => {
  const commands: Array<{ command: string; args: unknown[] }> = [];

  const target = {
    async exec(): Promise<Array<[Error | null, unknown]>> {
      if (mode === 'rpc') {
        return requestRpcPipeline(settings as RpcSettings, commands, transaction);
      }

      const results: Array<[Error | null, unknown]> = [];
      for (const entry of commands) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const result = await requestRedisCommand(mode, settings, entry.command, entry.args);
          results.push([null, result]);
        } catch (error) {
          results.push([
            error instanceof Error
              ? error
              : ErrorFactory.createTryCatchError('Redis pipeline command failed', error),
            null,
          ]);
        }
      }
      return results;
    },
  };

  const pipeline = new Proxy(target, {
    get(obj, prop) {
      if (typeof prop !== 'string') return Reflect.get(obj, prop) as unknown;
      if (prop in obj) return Reflect.get(obj, prop) as unknown;
      return (...args: unknown[]) => {
        commands.push({ command: prop.toUpperCase(), args });
        return pipeline;
      };
    },
  });

  return pipeline;
};

export const resolveRedisTransportMode = (): RedisTransportMode => {
  if (isZedgiRedisEnabled()) return 'zedgi';
  if (isRedisRpcEnabled()) return 'rpc';
  return readEnvBool('USE_REDIS_PROXY', false) ? 'proxy' : 'direct';
};

export const createRedisProxyConnection = (
  config: RedisConfig,
  options?: RedisTransportOptions
): RedisProxyConnection => {
  const mode = resolveRedisTransportMode();
  let settings: RedisTransportSettings;
  if (mode === 'zedgi') {
    settings = { config };
  } else if (mode === 'rpc') {
    settings = resolveRpcSettings();
  } else {
    settings = resolveProxySettings();
  }
  if (mode === 'direct') {
    throw ErrorFactory.createConfigError(
      'Redis proxy connection requested while direct mode is active.'
    );
  }
  logTransportSelection(mode, config, options);

  const target: RedisProxyConnection = {
    status: 'ready' as const,

    connect: async (): Promise<void> => {},
    // eslint-disable-next-line @typescript-eslint/require-await
    quit: async (): Promise<'OK'> => 'OK',
    disconnect: (): void => undefined,
    on: (_event: string, _handler: (...args: unknown[]) => void): RedisProxyConnection => client,
    once: (_event: string, _handler: (...args: unknown[]) => void): RedisProxyConnection => client,
    off: (_event: string, _handler: (...args: unknown[]) => void): RedisProxyConnection => client,
    removeListener: (
      _event: string,
      _handler: (...args: unknown[]) => void
    ): RedisProxyConnection => client,
    setMaxListeners: (_count: number): RedisProxyConnection => client,
    getMaxListeners: (): number => Infinity,
    call: async (command: string, ...args: unknown[]): Promise<unknown> => {
      return requestRedisCommand(mode, settings, command, args);
    },
    pipeline: () => createPipeline(settings, mode),
    multi: () => createPipeline(settings, mode, true),
    scanStream: (scanOptions?: { match?: string; count?: number }) =>
      createScanStream(settings, mode, scanOptions),
  };

  const client: RedisProxyConnection = new Proxy(target, {
    get(obj, prop) {
      if (typeof prop !== 'string') return Reflect.get(obj, prop) as unknown;
      if (prop === 'then') return undefined;
      if (prop in obj) return Reflect.get(obj, prop) as unknown;
      return async (...args: unknown[]) =>
        requestRedisCommand(mode, settings, prop.toUpperCase(), args);
    },
  });

  return client;
};

export const ensureRedisTransportMode = (
  config: RedisConfig,
  options?: RedisTransportOptions
): RedisTransportMode => {
  const mode = resolveRedisTransportMode();
  if ((mode === 'proxy' || mode === 'zedgi') && options?.requireDirect === true) {
    throw ErrorFactory.createConfigError(
      `Redis subsystem '${options.subsystem ?? 'redis'}' requires a direct Redis connection, but ${mode} mode is enabled.`
    );
  }

  if (mode === 'direct') {
    logTransportSelection(mode, config, options);
  }

  return mode;
};
