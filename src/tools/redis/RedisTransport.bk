import { Env } from '@config/env';
import { Logger } from '@config/logger';
import type { RedisConfig } from '@config/type';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { parseCustomHeadersFromEnv } from '@orm/adapters/SqlProxyAdapterUtils';
import {
  type ProxyRpcEnvelope,
  type ProxyRpcService,
  resolveProxyRpcService,
} from '@proxy/CloudflareProxyShared';
import { SignedRequest } from '@security/SignedRequest';

export type RedisTransportMode = 'direct' | 'proxy';

export type RedisTransportOptions = Readonly<{
  subsystem?: string;
  requireDirect?: boolean;
  requireDirectForScripts?: boolean;
}>;

type ProxySettings = Readonly<{
  baseUrl: string;
  keyId?: string;
  secret?: string;
  timeoutMs: number;
  service: ProxyRpcService;
  customHeaders?: Record<string, string>;
}>;

type RedisProxyConnection = {
  [x: string]: unknown;
  __bullmq_iredis?: true;
  isCluster?: false;
  options?: Readonly<Record<string, unknown>>;
  status: 'ready';
  connect: () => Promise<void>;
  quit: () => Promise<'OK'>;
  disconnect: () => void;
  duplicate: () => RedisProxyConnection;
  defineCommand: (name: string, definition: { numberOfKeys: number; lua: string }) => void;
  runCommand: (name: string, args: unknown[]) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => RedisProxyConnection;
  once: (event: string, handler: (...args: unknown[]) => void) => RedisProxyConnection;
  off: (event: string, handler: (...args: unknown[]) => void) => RedisProxyConnection;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => RedisProxyConnection;
  setMaxListeners: (count: number) => RedisProxyConnection;
  getMaxListeners: () => number;
  call: (command: string, ...args: unknown[]) => Promise<unknown>;
  scripts: {
    [key: string]: (...args: unknown[]) => Promise<unknown>;
  };
  pipeline: () => {
    exec: () => Promise<Array<[Error | null, unknown]>>;
    runCommand?: (name: string, args: unknown[]) => unknown;
    [key: string]: unknown;
  };
  multi: () => {
    exec: () => Promise<Array<[Error | null, unknown]>>;
    runCommand?: (name: string, args: unknown[]) => unknown;
    [key: string]: unknown;
  };
  scanStream: (options?: { match?: string; count?: number }) => {
    on: (event: string, handler: (...args: unknown[]) => void) => unknown;
    once: (event: string, handler: (...args: unknown[]) => void) => unknown;
    off: (event: string, handler: (...args: unknown[]) => void) => unknown;
  };
};

type ScriptDefinition = Readonly<{
  numberOfKeys: number;
  lua: string;
}>;

type ProxyScriptRegistry = {
  definitions: Map<string, ScriptDefinition>;
  shaByCommand: Map<string, string>;
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

const createRequestId = (): string => {
  const crypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const resolveProxySettings = (_options?: RedisTransportOptions): ProxySettings => ({
  baseUrl: resolveProxyBaseUrl(),
  keyId: Env.get('REDIS_PROXY_KEY_ID').trim() === '' ? undefined : Env.get('REDIS_PROXY_KEY_ID'),
  secret: Env.REDIS_PROXY_SECRET.trim() === '' ? undefined : Env.get('REDIS_PROXY_SECRET'),
  timeoutMs: Env.REDIS_PROXY_TIMEOUT_MS,
  service: resolveProxyRpcService('redis'),
  customHeaders: parseCustomHeadersFromEnv('REDIS'),
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
  action: string,
  payload: Record<string, unknown>
): Promise<T> => {
  if (settings.baseUrl.trim() === '') {
    throw ErrorFactory.createConfigError('Redis proxy URL is missing (REDIS_PROXY_URL)');
  }

  const envelope: ProxyRpcEnvelope = {
    service: settings.service,
    action,
    requestId: createRequestId(),
    payload,
  };

  const body = JSON.stringify(envelope);
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
    // Don't log HTML responses (e.g., 502 Bad Gateway pages)
    const isHtml =
      text.trim().toLowerCase().startsWith('<!doctype html') ||
      text.trim().toLowerCase().startsWith('<html');
    const errorMessage = isHtml ? 'Non-JSON response from proxy (proxy may be unavailable)' : text;
    throw ErrorFactory.createTryCatchError(
      `Redis proxy request failed (${response.status})`,
      errorMessage
    );
  }

  const parsed = (await response.json()) as { result: T };
  return parsed.result;
};

const loadScriptDefinition = async (
  settings: ProxySettings,
  definition: ScriptDefinition
): Promise<string> => {
  const loaded = await requestProxyCommand<string>(settings, 'SCRIPT', {
    args: ['LOAD', definition.lua],
  });
  return loaded;
};

const getDefinedScriptSha = async (
  settings: ProxySettings,
  registry: ProxyScriptRegistry,
  command: string
): Promise<string | undefined> => {
  const cached = registry.shaByCommand.get(command);
  if (cached !== undefined) {
    return cached;
  }

  const definition = registry.definitions.get(command);
  if (definition === undefined) {
    return undefined;
  }

  const sha = await loadScriptDefinition(settings, definition);
  registry.shaByCommand.set(command, sha);
  return sha;
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
  settings: ProxySettings,
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
          const result = await requestProxyCommand<unknown>(settings, 'SCAN', {
            args: [cursor, 'MATCH', options?.match ?? '*', 'COUNT', String(options?.count ?? 200)],
          });
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
  settings: ProxySettings
): {
  exec: () => Promise<Array<[Error | null, unknown]>>;
  [key: string]: unknown;
} => {
  const commands: Array<{ command: string; args: unknown[] }> = [];

  const target = {
    async exec(): Promise<Array<[Error | null, unknown]>> {
      Logger.debug('[redis][proxy][pipeline] Executing pipeline', {
        commandCount: commands.length,
        commands: commands.map((c) => ({ command: c.command, argsCount: c.args.length })),
      });

      const results: Array<[Error | null, unknown]> = [];
      for (const entry of commands) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const result = await requestProxyCommand(settings, entry.command, { args: entry.args });
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
    runCommand(name: string, args: unknown[]) {
      Logger.debug('[redis][proxy][pipeline] runCommand called in pipeline', {
        commandName: name,
        argsCount: args.length,
      });
      commands.push({ command: name, args });
      return pipeline;
    },
  };

  const pipeline = new Proxy(target, {
    get(obj, prop) {
      if (typeof prop !== 'string') return Reflect.get(obj, prop) as unknown;
      if (prop in obj) return Reflect.get(obj, prop) as unknown;

      return (...args: unknown[]) => {
        commands.push({ command: prop, args });
        return pipeline;
      };
    },
  });

  return pipeline;
};

export const resolveRedisTransportMode = (): RedisTransportMode => {
  return readEnvBool('USE_REDIS_PROXY', false) || readEnvString('REDIS_PROXY_URL', '').trim() !== ''
    ? 'proxy'
    : 'direct';
};

const createCommandFunction = (settings: ProxySettings, command: string) => {
  return async (...args: unknown[]) => requestProxyCommand(settings, command, { args });
};

const createDefinedScriptFunction = (
  settings: ProxySettings,
  command: string,
  registry: ProxyScriptRegistry
) => {
  return async (...args: unknown[]) => {
    const sha = await getDefinedScriptSha(settings, registry, command);

    if (sha === undefined) {
      return requestProxyCommand(settings, command, { args });
    }

    const definition = registry.definitions.get(command);
    const numberOfKeys = definition?.numberOfKeys ?? 0;
    return requestProxyCommand(settings, 'EVALSHA', {
      args: [sha, numberOfKeys, ...args],
    });
  };
};

const createScriptsHandler = (
  settings: ProxySettings
): {
  [key: string]: (...args: unknown[]) => Promise<unknown>;
} => {
  return new Proxy(
    {},
    {
      get(_target, prop: string | symbol) {
        if (typeof prop !== 'string') return undefined;
        return async (...args: unknown[]): Promise<unknown> =>
          requestProxyCommand(settings, prop, { args });
      },
    }
  );
};

const handlePropertyAccess = (
  obj: RedisProxyConnection,
  prop: string | symbol,
  client: RedisProxyConnection,
  settings: ProxySettings,
  registry: ProxyScriptRegistry
): unknown => {
  if (typeof prop !== 'string') return Reflect.get(obj, prop) as unknown;

  if (prop === 'then') return undefined;

  if (prop === 'setMaxListeners') {
    return function (_count: number): RedisProxyConnection {
      return client;
    };
  }

  if (prop === 'getMaxListeners') {
    return function (): number {
      return Infinity;
    };
  }

  if (registry.definitions.has(prop)) {
    return createDefinedScriptFunction(settings, prop, registry);
  }

  if (prop in obj) {
    return Reflect.get(obj, prop) as unknown;
  }

  return createCommandFunction(settings, prop);
};

const createProxyTarget = (
  config: RedisConfig,
  options: RedisTransportOptions | undefined,
  settings: ProxySettings,
  client: RedisProxyConnection | null,
  registry: ProxyScriptRegistry
): RedisProxyConnection => {
  const target: RedisProxyConnection = {
    __bullmq_iredis: true,
    isCluster: false,
    options: Object.freeze({}),
    status: 'ready' as const,

    connect: async (): Promise<void> => {},
    // eslint-disable-next-line @typescript-eslint/require-await
    quit: async (): Promise<'OK'> => 'OK',
    disconnect: (): void => undefined,
    duplicate: (): RedisProxyConnection => createRedisProxyConnection(config, options, registry),
    defineCommand: (name: string, definition: { numberOfKeys: number; lua: string }): void => {
      registry.definitions.set(name, definition);
      registry.shaByCommand.delete(name);
      Logger.debug('[redis][proxy][bullmq] registered defined command', {
        commandName: name,
        numberOfKeys: definition.numberOfKeys,
        luaLength: definition.lua.length,
      });
    },
    runCommand: async (name: string, args: unknown[]): Promise<unknown> =>
      requestProxyCommand(settings, name, { args }),
    on: (_event: string, _handler: (...args: unknown[]) => void): RedisProxyConnection =>
      client ?? target,
    once: (_event: string, _handler: (...args: unknown[]) => void): RedisProxyConnection =>
      client ?? target,
    off: (_event: string, _handler: (...args: unknown[]) => void): RedisProxyConnection =>
      client ?? target,
    removeListener: (
      _event: string,
      _handler: (...args: unknown[]) => void
    ): RedisProxyConnection => client ?? target,
    setMaxListeners: (_count: number): RedisProxyConnection => client ?? target,
    getMaxListeners: (): number => Infinity,
    call: async (command: string, ...args: unknown[]): Promise<unknown> =>
      requestProxyCommand(settings, command, { args }),
    scripts: createScriptsHandler(settings),
    pipeline: (): { exec: () => Promise<Array<[Error | null, unknown]>>; [key: string]: unknown } =>
      createPipeline(settings),
    multi: (): { exec: () => Promise<Array<[Error | null, unknown]>>; [key: string]: unknown } =>
      createPipeline(settings),
    scanStream: (scanOptions?: { match?: string; count?: number }) =>
      createScanStream(settings, scanOptions),
  };

  return target;
};

export const createRedisProxyConnection = (
  config: RedisConfig,
  options?: RedisTransportOptions,
  registry?: ProxyScriptRegistry
): RedisProxyConnection => {
  const settings = resolveProxySettings(options);
  const scriptRegistry = registry ?? {
    definitions: new Map<string, ScriptDefinition>(),
    shaByCommand: new Map<string, string>(),
  };

  logTransportSelection('proxy', config, options);

  Logger.info('[redis][proxy] Creating opaque proxy connection', {
    transport: 'BullMQ',
  });

  const proxyTarget = createProxyTarget(config, options, settings, null, scriptRegistry);
  const client: RedisProxyConnection = new Proxy(proxyTarget, {
    get(obj, prop) {
      return handlePropertyAccess(obj, prop, client, settings, scriptRegistry);
    },
  });

  return client;
};

export const ensureRedisTransportMode = (
  config: RedisConfig,
  options?: RedisTransportOptions
): RedisTransportMode => {
  const mode = resolveRedisTransportMode();
  const subsystem = options?.subsystem ?? 'redis';
  const requireDirectForScripts =
    options?.requireDirectForScripts ?? Env.REDIS_REQUIRE_DIRECT_FOR_SCRIPTS;

  if (mode === 'proxy' && options?.requireDirect === true) {
    throw ErrorFactory.createConfigError(
      `Redis subsystem '${subsystem}' requires a direct Redis connection, but proxy mode is enabled.`
    );
  }

  if (mode === 'proxy' && requireDirectForScripts) {
    throw ErrorFactory.createConfigError(
      `Redis subsystem '${subsystem}' requires a direct Redis connection for scripts, but proxy mode is enabled.`
    );
  }

  if (mode === 'direct') {
    logTransportSelection(mode, config, options);
  }

  return mode;
};
