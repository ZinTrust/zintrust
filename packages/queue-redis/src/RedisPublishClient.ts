import { Env, ErrorFactory, SignedRequest, ZintrustLang } from '@zintrust/core';

export type RedisPublishClient = {
  connect?: () => Promise<void>;
  publish(channel: string, message: string): Promise<number>;
};

type DurableObjectNamespace = {
  idFromName: (name: string) => { toString: () => string };
  get: (id: unknown) => DurableObjectStub;
};

type DurableObjectStub = {
  fetch: (request: Request | string, init?: RequestInit) => Promise<Response>;
};

type ProxySettings = {
  baseUrl: string;
  keyId?: string;
  secret?: string;
  timeoutMs: number;
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

const buildRequestUrl = (baseUrl: string, path: string): URL => {
  const url = new URL(baseUrl);
  const basePath = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
  const requestPath = path.startsWith('/') ? path : `/${path}`;
  url.pathname = `${basePath}${requestPath}`;
  return url;
};

const buildSigningUrl = (requestUrl: URL, baseUrl: string): URL => {
  const prefix = resolveSigningPrefix(baseUrl);
  if (!prefix) return requestUrl;

  if (requestUrl.pathname === prefix || requestUrl.pathname.startsWith(`${prefix}/`)) {
    const signingUrl = new URL(requestUrl.toString());
    const stripped = requestUrl.pathname.slice(prefix.length);
    signingUrl.pathname = stripped.startsWith('/') ? stripped : `/${stripped}`;
    return signingUrl;
  }

  return requestUrl;
};

let publishClientInstance: RedisPublishClient | null = null;
let publishClientConnected = false;

const resolveProxyBaseUrl = (): string => {
  const explicit = Env.REDIS_PROXY_URL.trim();
  if (explicit !== '') return explicit;
  if (Env.USE_REDIS_PROXY === false) return '';
  const host = Env.REDIS_PROXY_HOST || '127.0.0.1';
  const port = Env.REDIS_PROXY_PORT;
  return `http://${host}:${port}`;
};

const buildProxySettings = (): ProxySettings => {
  const baseUrl = resolveProxyBaseUrl();
  const keyId = Env.REDIS_PROXY_KEY_ID || undefined;
  const secret = Env.REDIS_PROXY_SECRET || Env.APP_KEY || undefined;
  const timeoutMs = Env.REDIS_PROXY_TIMEOUT_MS;
  return { baseUrl, keyId, secret, timeoutMs };
};

const buildHeaders = async (
  settings: ProxySettings,
  requestUrl: URL,
  body: string
): Promise<Record<string, string>> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (settings.keyId && settings.secret) {
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

  return headers;
};

const requestProxy = async <T>(
  settings: ProxySettings,
  path: string,
  payload: Record<string, unknown>
): Promise<T> => {
  if (settings.baseUrl.trim() === '') {
    throw ErrorFactory.createConfigError('Redis proxy URL is missing (REDIS_PROXY_URL)');
  }

  const body = JSON.stringify(payload);
  const url = buildRequestUrl(settings.baseUrl, path);
  const headers = await buildHeaders(settings, url, body);
  const timeoutSignal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal;
  const signal = timeoutSignal ? AbortSignal.timeout(settings.timeoutMs) : undefined;

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers,
    body,
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw ErrorFactory.createTryCatchError(`Redis proxy request failed (${response.status})`, text);
  }

  return (await response.json()) as T;
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const createDoPublishClient = (): RedisPublishClient | null => {
  const globalEnv = (globalThis as { env?: Record<string, unknown> }).env;
  const namespace = globalEnv?.['REDIS_POOL'] as DurableObjectNamespace | undefined;
  if (!namespace) return null;

  const id = namespace.idFromName('default');
  const stub = namespace.get(id);

  return {
    publish: async (channel: string, message: string): Promise<number> => {
      const payload = JSON.stringify({
        command: 'PUBLISH',
        params: [channel, message],
      });
      const response = await stub.fetch('http://do/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      if (!response.ok) {
        const text = await response.text();
        throw ErrorFactory.createTryCatchError(
          `Redis DO publish failed (${response.status})`,
          text
        );
      }

      const json = (await response.json()) as { result?: unknown };
      const result = 'result' in json ? json.result : json;
      return toNumber(result);
    },
  };
};

const tryCreateProxyPublishClient = async (): Promise<RedisPublishClient | null> => {
  const settings = buildProxySettings();
  if (settings.baseUrl.trim() === '') return null;

  return {
    publish: async (channel: string, message: string): Promise<number> => {
      const response = await requestProxy<{ result: unknown }>(settings, '/zin/redis/command', {
        command: 'PUBLISH',
        args: [channel, message],
      });
      return toNumber(response.result);
    },
  };
};

/**
 * Build Redis URL from environment variables
 */
const buildRedisUrl = (): string => {
  // Get REDIS_URL from environment
  const redisUrl = getRedisUrlFromEnv();
  if (redisUrl) return redisUrl;

  // Build URL from individual components
  return buildRedisUrlFromComponents();
};

/**
 * Get REDIS_URL from environment variables
 */
const getRedisUrlFromEnv = (): string | null => {
  const anyEnv = process.env as { get?: (k: string, d?: string) => string };
  const fromEnv = typeof anyEnv.get === 'function' ? anyEnv.get('REDIS_URL', '') : '';
  const hasProcess = typeof process === 'object' && process !== null;
  const fallback = hasProcess ? (process.env?.['REDIS_URL'] ?? '') : '';
  const trimmed = fromEnv.trim();
  const url = (trimmed.length > 0 ? fromEnv : String(fallback)).trim();

  return url.length > 0 ? url : null;
};

/**
 * Build Redis URL from individual environment components
 */
const buildRedisUrlFromComponents = (): string => {
  const host = process.env?.['REDIS_HOST'] ?? 'localhost';
  const port = Number(process.env?.['REDIS_PORT'] ?? ZintrustLang.REDIS_DEFAULT_PORT);
  const password = process.env?.['REDIS_PASSWORD'];
  const database = Number(process.env?.['REDIS_QUEUE_DB'] ?? ZintrustLang.REDIS_DEFAULT_DB);

  let redisUrl = `redis://`;
  if (password) redisUrl += `:${password}@`;
  redisUrl += `${host}:${port}`;
  if (database > 0) redisUrl += `/${database}`;

  return redisUrl;
};

/**
 * Singleton Redis publish client factory
 * Creates and caches a Redis publish client for broadcasting
 */
export const createRedisPublishClient = async (): Promise<RedisPublishClient> => {
  // Return cached instance if available
  if (publishClientConnected && publishClientInstance !== null) {
    return publishClientInstance;
  }

  const doClient = createDoPublishClient();
  if (doClient) {
    return cacheAndReturnClient(doClient);
  }

  const proxyClient = await tryCreateProxyPublishClient();
  if (proxyClient) {
    return cacheAndReturnClient(proxyClient);
  }

  const url = buildRedisUrl();
  if (url === null) throw ErrorFactory.createConfigError('Redis publish client requires REDIS_URL');

  // Try different Redis clients in order of preference
  const redisClient =
    (await tryCreateRedisClient(url)) || (await tryCreateIoRedisClient(url)) || getFallbackClient();
  return redisClient as RedisPublishClient;
};

/**
 * Try to create client using 'redis' package
 */
const tryCreateRedisClient = async (url: string): Promise<RedisPublishClient | null> => {
  try {
    const mod = (await import('redis')) as unknown as {
      createClient: (opts: { url: string }) => RedisPublishClient;
    };
    const client = mod.createClient({ url });

    if (typeof client.connect === 'function') {
      await connectClient(client, 'Redis publish client failed to connect');
    }

    return cacheAndReturnClient(client);
  } catch {
    return null;
  }
};

/**
 * Try to create client using 'ioredis' package
 */
const tryCreateIoRedisClient = async (url: string): Promise<RedisPublishClient | null> => {
  try {
    const mod = (await import('ioredis')) as unknown as {
      default: (url: string) => {
        connect?: () => Promise<void>;
        publish: (channel: string, message: string) => Promise<number>;
      };
    };

    const redis = mod.default(url);
    const client: RedisPublishClient = {
      publish: (channel: string, message: string) => redis.publish(channel, message),
      connect: redis.connect
        ? async (): Promise<void> => {
            const connectFn = redis.connect as () => Promise<void>;
            await connectFn();
          }
        : undefined,
    };

    if (typeof client.connect === 'function') {
      await connectClient(client, 'Redis publish client (ioredis) failed to connect');
    }

    return cacheAndReturnClient(client);
  } catch {
    return null;
  }
};

/**
 * Get fallback client from global or throw error
 */
const getFallbackClient = (): RedisPublishClient => {
  const globalFake = (globalThis as unknown as { __fakeRedisClient?: RedisPublishClient })
    .__fakeRedisClient;

  if (globalFake === undefined) {
    throw ErrorFactory.createConfigError(
      "Redis publish client requires the 'redis' or 'ioredis' package (run `zin add broadcast:redis' / `zin plugin install broadcast:redis`, or `npm install redis` / `npm install ioredis`) or a test fake client set in globalThis.__fakeRedisClient"
    );
  }

  return cacheAndReturnClient(globalFake);
};

/**
 * Connect to Redis client with error handling
 */
const connectClient = async (client: RedisPublishClient, errorMessage: string): Promise<void> => {
  try {
    if (client.connect) {
      await client.connect();
    }
  } catch (err) {
    throw ErrorFactory.createTryCatchError(errorMessage, err as Error);
  }
};

/**
 * Cache and return the client instance
 */
const cacheAndReturnClient = (client: RedisPublishClient): RedisPublishClient => {
  publishClientInstance = client;
  publishClientConnected = true;
  return client;
};

/**
 * Reset the singleton publish client (useful for testing)
 */
export const resetPublishClient = (): void => {
  publishClientInstance = null;
  publishClientConnected = false;
};
