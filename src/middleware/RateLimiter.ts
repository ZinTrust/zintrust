/**
 * Rate Limiter Middleware
 * Token bucket implementation for request rate limiting
 * Zero-dependency implementation
 */

import { Cache } from '@cache/Cache';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import type { Middleware } from '@middleware/MiddlewareStack';

export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  max: number; // Max requests per window
  message?: string;
  statusCode?: number;
  headers?: boolean;
  keyGenerator?: (req: IRequest) => string;

  /**
   * Optional store selection for this middleware instance.
   * - 'memory' uses an in-process Map (default)
   * - 'redis' uses Cache.store('redis')
   * - 'kv' uses Cache.store('kv')
   * - 'db' uses Cache.store('mongodb')
   */
  store?: RateLimitStoreName;
}

export type RateLimitStoreName = 'memory' | 'redis' | 'kv' | 'db';

interface ClientState {
  count: number;
  resetTime: number;
}

type RateLimitStore = Readonly<{
  get: (key: string) => Promise<ClientState | null>;
  set: (key: string, value: ClientState, ttlSeconds: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
}>;

const createMemoryStore = (): RateLimitStore => {
  const entries = new Map<string, ClientState>();
  let nextCleanupAt = Date.now() + 60_000;

  const cleanupExpired = (now: number): void => {
    if (now < nextCleanupAt) return;
    for (const [k, state] of entries.entries()) {
      if (now > state.resetTime) entries.delete(k);
    }
    nextCleanupAt = now + 60_000;
  };

  return Object.freeze({
    async get(key: string): Promise<ClientState | null> {
      await Promise.resolve();
      const now = Date.now();
      cleanupExpired(now);
      const state = entries.get(key);
      if (!state) return null;
      if (now > state.resetTime) {
        entries.delete(key);
        return null;
      }
      return { ...state };
    },
    async set(key: string, value: ClientState): Promise<void> {
      await Promise.resolve();
      const now = Date.now();
      cleanupExpired(now);
      entries.set(key, { ...value });
    },
    async delete(key: string): Promise<void> {
      await Promise.resolve();
      entries.delete(key);
    },
  });
};

const createCacheStore = (storeName: string): RateLimitStore => {
  const store = Cache.store(storeName);
  return Object.freeze({
    async get(key: string): Promise<ClientState | null> {
      return store.get<ClientState>(key);
    },
    async set(key: string, value: ClientState, ttlSeconds: number): Promise<void> {
      await store.set(key, value, ttlSeconds);
    },
    async delete(key: string): Promise<void> {
      await store.delete(key);
    },
  });
};

const normalizeStoreName = (name: unknown): RateLimitStoreName => {
  const raw = String(name ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'redis') return 'redis';
  if (raw === 'kv') return 'kv';
  if (raw === 'db' || raw === 'database' || raw === 'mongo' || raw === 'mongodb') return 'db';
  return 'memory';
};

const resolveStore = (
  name?: RateLimitStoreName
): { storeName: RateLimitStoreName; store: RateLimitStore } => {
  const selected = normalizeStoreName(
    (name ?? Env.RATE_LIMIT_STORE) || Env.RATE_LIMIT_DRIVER || 'memory'
  );

  if (selected === 'redis') return { storeName: 'redis', store: createCacheStore('redis') };
  if (selected === 'kv') return { storeName: 'kv', store: createCacheStore('kv') };
  if (selected === 'db') return { storeName: 'db', store: createCacheStore('mongodb') };
  return { storeName: 'memory', store: createMemoryStore() };
};

let serviceStoreSelection: RateLimitStoreName = normalizeStoreName(
  Env.RATE_LIMIT_STORE || Env.RATE_LIMIT_DRIVER || 'memory'
);
let serviceStore: RateLimitStore = resolveStore(serviceStoreSelection).store;

const prefixKey = (purpose: 'service' | 'middleware', key: string): string => {
  const prefix = Env.RATE_LIMIT_KEY_PREFIX.trim();
  return `${prefix}${purpose}:${key}`;
};

const consume = async (params: {
  store: RateLimitStore;
  key: string;
  max: number;
  windowMs: number;
}): Promise<{ count: number; resetTime: number; allowed: boolean }> => {
  const now = Date.now();
  const ttlSeconds = Math.max(1, Math.ceil(params.windowMs / 1000));
  const existing = await params.store.get(params.key);
  const state =
    existing === null || now > existing.resetTime
      ? { count: 0, resetTime: now + params.windowMs }
      : existing;

  const nextCount = state.count + 1;
  const nextState: ClientState = { count: nextCount, resetTime: state.resetTime };
  await params.store.set(params.key, nextState, ttlSeconds);

  return {
    count: nextCount,
    resetTime: nextState.resetTime,
    allowed: nextCount <= params.max,
  };
};

const resolveRemoteAddress = (candidate: unknown): string | undefined => {
  if (candidate === null || candidate === undefined) return undefined;
  if (typeof candidate !== 'object') return undefined;

  const record = candidate as Record<string, unknown>;
  const ip = record['remoteAddress'];
  return typeof ip === 'string' && ip.length > 0 ? ip : undefined;
};

const resolveRemoteAddressFromRaw = (raw: unknown): string | undefined => {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== 'object') return undefined;

  const rawRecord = raw as Record<string, unknown>;
  return (
    resolveRemoteAddress(rawRecord['socket']) ??
    resolveRemoteAddress(rawRecord['connection']) ??
    resolveRemoteAddress(raw)
  );
};

const DEFAULT_OPTIONS: RateLimitOptions = {
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests, please try again later.',
  statusCode: 429,
  headers: true,
  keyGenerator: (req: IRequest) => {
    const forwardedFor = req.getHeader('x-forwarded-for');
    const forwardedForIp =
      typeof forwardedFor === 'string' && forwardedFor.length > 0
        ? forwardedFor.split(',')[0]?.trim()
        : undefined;

    const raw = req.getRaw() as unknown;
    const rawIp = resolveRemoteAddressFromRaw(raw);

    return forwardedForIp ?? rawIp ?? 'unknown';
  },
};

export const RateLimiter = Object.freeze({
  /**
   * Configure the store used by the programmatic API (attempt/tooManyAttempts/till/clear).
   * Defaults to 'memory'.
   */
  configure(config?: { store?: RateLimitStoreName }): void {
    serviceStoreSelection = normalizeStoreName(config?.store);
    serviceStore = resolveStore(serviceStoreSelection).store;
  },

  /**
   * Attempt to perform an action.
   *
   * Returns true if allowed (and records the hit), false if rate limited.
   */
  async attempt(key: string, maxAttempts: number, decaySeconds: number): Promise<boolean> {
    const windowMs = Math.max(1, Math.floor(decaySeconds * 1000));
    const namespacedKey = prefixKey('service', key);
    const out = await consume({
      store: serviceStore,
      key: namespacedKey,
      max: maxAttempts,
      windowMs,
    });
    return out.allowed;
  },

  /**
   * Check if the key is currently rate limited.
   */
  async tooManyAttempts(key: string, maxAttempts: number): Promise<boolean> {
    const now = Date.now();
    const namespacedKey = prefixKey('service', key);
    const state = await serviceStore.get(namespacedKey);
    if (!state || now > state.resetTime) return false;
    return state.count >= maxAttempts;
  },

  /**
   * Seconds until the key is available again.
   * Returns 0 if not rate limited.
   */
  async till(key: string): Promise<number> {
    const now = Date.now();
    const namespacedKey = prefixKey('service', key);
    const state = await serviceStore.get(namespacedKey);
    if (!state || now > state.resetTime) return 0;
    return Math.max(0, Math.ceil((state.resetTime - now) / 1000));
  },

  /**
   * Clear rate limit state for a key.
   */
  async clear(key: string): Promise<void> {
    const namespacedKey = prefixKey('service', key);
    await serviceStore.delete(namespacedKey);
  },

  /**
   * Create rate limiter middleware
   */
  create(options: RateLimitOptions = DEFAULT_OPTIONS): Middleware {
    const config = { ...DEFAULT_OPTIONS, ...options };

    const { storeName, store } = resolveStore(config.store);
    const useMemoryInstanceStore = storeName === 'memory';

    // Middleware store is per-instance (matches prior behavior).
    const clients = new Map<string, ClientState>();

    // Cleanup to prevent unbounded growth.
    // Done lazily (on requests) to avoid background timers in serverless/test environments.
    let nextCleanupAt = Date.now() + config.windowMs;
    const cleanupExpiredClients = (now: number): void => {
      if (now < nextCleanupAt) return;
      for (const [k, state] of clients.entries()) {
        if (now > state.resetTime) {
          clients.delete(k);
        }
      }
      nextCleanupAt = now + config.windowMs;
    };

    const getOrInitClient = (key: string, now: number): ClientState => {
      let client = clients.get(key);
      if (!client || now > client.resetTime) {
        client = { count: 0, resetTime: now + config.windowMs };
        clients.set(key, client);
      }
      return client;
    };

    return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
      const key = config.keyGenerator ? config.keyGenerator(req) : 'unknown';
      const now = Date.now();

      let count: number;
      let resetAt: number;
      if (useMemoryInstanceStore) {
        cleanupExpiredClients(now);
        const client = getOrInitClient(key, now);
        client.count++;
        count = client.count;
        resetAt = client.resetTime;
      } else {
        // Include limiter config to avoid collisions between different middleware instances.
        const middlewareKey = prefixKey('middleware', `${config.max}:${config.windowMs}:${key}`);
        const out = await consume({
          store,
          key: middlewareKey,
          max: config.max,
          windowMs: config.windowMs,
        });
        count = out.count;
        resetAt = out.resetTime;
      }

      const remaining = Math.max(0, config.max - count);
      const resetTime = Math.ceil((resetAt - now) / 1000);

      // Set headers
      if (config.headers ?? false) {
        res.setHeader('X-RateLimit-Limit', config.max.toString());
        res.setHeader('X-RateLimit-Remaining', remaining.toString());
        res.setHeader('X-RateLimit-Reset', resetTime.toString());
      }

      // Check limit
      if (count > config.max) {
        Logger.warn(`Rate limit exceeded for IP: ${key}`);
        res.setStatus(config.statusCode ?? 429);
        res.json({
          error: 'Too Many Requests',
          message: config.message,
        });
        return;
      }

      await next();
    };
  },
});
