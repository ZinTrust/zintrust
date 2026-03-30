/* eslint-disable @typescript-eslint/require-await */
/**
 * CSRF Token Manager
 * Generate, validate, and bind CSRF tokens to sessions
 */

import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { createRedisConnection } from '@config/workers';
import { ZintrustLang } from '@lang/lang';
import { randomBytes } from '@node-singletons/crypto';
import { RedisKeys } from '@tools/redis/RedisKeyManager';
import type { Redis } from 'ioredis';

export interface CsrfTokenData {
  token: string;
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface ICsrfTokenManager {
  generateToken(sessionId: string): Promise<string>;
  validateToken(sessionId: string, token: string): Promise<boolean>;
  invalidateToken(sessionId: string): Promise<void>;
  getTokenData(sessionId: string): Promise<CsrfTokenData | null>;
  refreshToken(sessionId: string): Promise<string | null>;
  cleanup(): Promise<number>;
  clear(): Promise<void>;
  getTokenCount(): Promise<number>;
}

export interface CsrfTokenManagerType {
  create(options?: CsrfTokenManagerOptions): ICsrfTokenManager;
}

export type CsrfStoreName = 'memory' | 'redis';

export type CsrfTokenManagerOptions = {
  store?: CsrfStoreName;
  redis?: Redis;
  keyPrefix?: string;
  tokenLength?: number;
  tokenTtlMs?: number;
};

type StoredCsrfTokenData = {
  token: string;
  sessionId: string;
  createdAt: number;
  expiresAt: number;
};

/**
 * Create a new CSRF token manager instance
 */
const normalizeStoreName = (name: unknown): CsrfStoreName => {
  const raw = String(name ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'redis') return 'redis';
  return 'memory';
};

const isWorkersRuntime = (): boolean => {
  const globalAny = globalThis as { CF?: unknown; caches?: unknown; WebSocketPair?: unknown };
  if (globalAny.CF !== undefined) return true;
  if (typeof globalAny.WebSocketPair === 'function') return true;
  if (globalAny.caches !== undefined) return true;
  return false;
};

const resolveStoreName = (options?: CsrfTokenManagerOptions): CsrfStoreName => {
  if (isWorkersRuntime()) return 'memory';

  return normalizeStoreName(
    options?.store ?? Env.CSRF_STORE ?? Env.CSRF_DRIVER ?? Env.get('CSRF_STORE', 'memory')
  );
};

const toTokenData = (stored: StoredCsrfTokenData): CsrfTokenData => {
  return {
    token: stored.token,
    sessionId: stored.sessionId,
    createdAt: new Date(stored.createdAt),
    expiresAt: new Date(stored.expiresAt),
  };
};

const createMemoryManager = (tokenLength: number, tokenTtl: number): ICsrfTokenManager => {
  const tokens: Map<string, CsrfTokenData> = new Map();

  return {
    async generateToken(sessionId: string): Promise<string> {
      tokens.delete(sessionId);
      const token = randomBytes(tokenLength).toString('hex');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + tokenTtl);
      const tokenData: CsrfTokenData = { token, sessionId, createdAt: now, expiresAt };
      tokens.set(sessionId, tokenData);
      return token;
    },
    async validateToken(sessionId: string, token: string): Promise<boolean> {
      const tokenData = tokens.get(sessionId);
      if (!tokenData) return false;
      const isValid = tokenData.token === token;
      const isExpired = new Date() > tokenData.expiresAt;
      if (isExpired) {
        tokens.delete(sessionId);
        return false;
      }
      return isValid;
    },
    async invalidateToken(sessionId: string): Promise<void> {
      tokens.delete(sessionId);
    },
    async getTokenData(sessionId: string): Promise<CsrfTokenData | null> {
      return tokens.get(sessionId) ?? null;
    },
    async refreshToken(sessionId: string): Promise<string | null> {
      const tokenData = tokens.get(sessionId);
      if (!tokenData) return null;
      const isExpired = new Date() > tokenData.expiresAt;
      if (isExpired) {
        tokens.delete(sessionId);
        return null;
      }
      tokenData.expiresAt = new Date(Date.now() + tokenTtl);
      return tokenData.token;
    },
    async cleanup(): Promise<number> {
      let removed = 0;
      const now = new Date();
      for (const [sessionId, tokenData] of tokens.entries()) {
        if (now > tokenData.expiresAt) {
          tokens.delete(sessionId);
          removed++;
        }
      }
      return removed;
    },
    async clear(): Promise<void> {
      tokens.clear();
    },
    async getTokenCount(): Promise<number> {
      return tokens.size;
    },
  };
};

// Helper functions for Redis CSRF manager
const createRedisClientFactory = (options?: CsrfTokenManagerOptions) => {
  let redisClient: Redis | null = options?.redis ?? null;

  return (): Redis => {
    if (redisClient) return redisClient;

    const dbFromEnv = Env.CSRF_REDIS_DB;
    const database =
      dbFromEnv >= 0 ? dbFromEnv : Env.getInt('REDIS_QUEUE_DB', ZintrustLang.REDIS_DEFAULT_DB);

    redisClient = createRedisConnection(
      {
        host: Env.get('REDIS_HOST', 'localhost'),
        port: Env.getInt('REDIS_PORT', ZintrustLang.REDIS_DEFAULT_PORT),
        password: Env.get('REDIS_PASSWORD'),
        db: database,
      },
      3,
      { subsystem: 'csrf' }
    );

    return redisClient;
  };
};

const createRedisPrefixVersioner = (
  keyPrefix: string,
  getRedisClient: () => Redis
): {
  getEffectivePrefix: () => Promise<string>;
  bumpPrefixVersion: () => Promise<void>;
} => {
  const versionKey = `${keyPrefix}__v`;
  let cachedVersion: string | null = null;

  const getVersion = async (): Promise<string> => {
    if (cachedVersion !== null) return cachedVersion;
    const client = getRedisClient();
    const raw = await client.get(versionKey);
    const v = (raw ?? '1').trim();
    cachedVersion = v === '' ? '1' : v;
    return cachedVersion;
  };

  const getEffectivePrefix = async (): Promise<string> => {
    const v = await getVersion();
    return `${keyPrefix}${v}:`;
  };

  const bumpPrefixVersion = async (): Promise<void> => {
    const client = getRedisClient();
    // INCR creates the key if it does not exist.
    const next = await client.incr(versionKey);
    cachedVersion = String(next);
  };

  return {
    getEffectivePrefix,
    bumpPrefixVersion,
  };
};

const scanRedisKeys = async (client: Redis, match: string): Promise<string[]> => {
  const keys: string[] = [];
  const stream = client.scanStream({ match, count: 200 });

  return new Promise<string[]>((resolve, reject) => {
    stream.on('data', (resultKeys: string[]) => {
      if (Array.isArray(resultKeys) && resultKeys.length) {
        keys.push(...resultKeys);
      }
    });
    stream.on('end', () => resolve(keys));
    stream.on('error', (err) => reject(err));
  });
};

const createRedisTokenOperations = (
  keyPrefix: string,
  tokenTtl: number,
  getRedisClient: () => Redis
): {
  fetchTokenData: (sessionId: string) => Promise<CsrfTokenData | null>;
  saveTokenData: (data: CsrfTokenData) => Promise<void>;
  deleteToken: (sessionId: string) => Promise<void>;
  scanKeys: (effectivePrefix: string) => Promise<string[]>;
  getEffectivePrefix: () => Promise<string>;
  bumpPrefixVersion: () => Promise<void>;
} => {
  const { getEffectivePrefix, bumpPrefixVersion } = createRedisPrefixVersioner(
    keyPrefix,
    getRedisClient
  );

  const buildKey = (prefix: string, sessionId: string): string => `${prefix}${sessionId}`;

  const fetchTokenData = async (sessionId: string): Promise<CsrfTokenData | null> => {
    try {
      const client = getRedisClient();
      const prefix = await getEffectivePrefix();
      const payload = await client.get(buildKey(prefix, sessionId));
      if (payload === null || payload === '') return null;
      const parsed = JSON.parse(payload) as StoredCsrfTokenData;
      return toTokenData(parsed);
    } catch (error) {
      Logger.error('CSRF Redis fetch failed', error as Error);
      return null;
    }
  };

  const saveTokenData = async (data: CsrfTokenData): Promise<void> => {
    try {
      const client = getRedisClient();
      const prefix = await getEffectivePrefix();
      const stored: StoredCsrfTokenData = {
        token: data.token,
        sessionId: data.sessionId,
        createdAt: data.createdAt.getTime(),
        expiresAt: data.expiresAt.getTime(),
      };
      await client.set(buildKey(prefix, data.sessionId), JSON.stringify(stored), 'PX', tokenTtl);
    } catch (error) {
      Logger.error('CSRF Redis save failed', error as Error);
    }
  };

  const deleteToken = async (sessionId: string): Promise<void> => {
    try {
      const client = getRedisClient();
      const prefix = await getEffectivePrefix();
      await client.del(buildKey(prefix, sessionId));
    } catch (error) {
      Logger.error('CSRF Redis delete failed', error as Error);
    }
  };

  const scanKeys = async (effectivePrefix: string): Promise<string[]> => {
    const client = getRedisClient();
    return scanRedisKeys(client, `${effectivePrefix}*`);
  };

  return {
    fetchTokenData,
    saveTokenData,
    deleteToken,
    scanKeys,
    getEffectivePrefix,
    bumpPrefixVersion,
  };
};

const createRedisManager = (
  tokenLength: number,
  tokenTtl: number,
  options?: CsrfTokenManagerOptions
): ICsrfTokenManager => {
  const keyPrefix = options?.keyPrefix ?? RedisKeys.getCsrfPrefix();
  const getRedisClient = createRedisClientFactory(options);
  const {
    fetchTokenData,
    saveTokenData,
    deleteToken,
    scanKeys,
    getEffectivePrefix,
    bumpPrefixVersion,
  } = createRedisTokenOperations(keyPrefix, tokenTtl, getRedisClient);

  return {
    async generateToken(sessionId: string): Promise<string> {
      const token = randomBytes(tokenLength).toString('hex');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + tokenTtl);
      const tokenData: CsrfTokenData = { token, sessionId, createdAt: now, expiresAt };
      await saveTokenData(tokenData);
      return token;
    },
    async validateToken(sessionId: string, token: string): Promise<boolean> {
      const tokenData = await fetchTokenData(sessionId);
      if (!tokenData) return false;
      const isValid = tokenData.token === token;
      const isExpired = new Date() > tokenData.expiresAt;
      if (isExpired) {
        await deleteToken(sessionId);
        return false;
      }
      return isValid;
    },
    async invalidateToken(sessionId: string): Promise<void> {
      await deleteToken(sessionId);
    },
    async getTokenData(sessionId: string): Promise<CsrfTokenData | null> {
      return fetchTokenData(sessionId);
    },
    async refreshToken(sessionId: string): Promise<string | null> {
      const tokenData = await fetchTokenData(sessionId);
      if (!tokenData) return null;
      const isExpired = new Date() > tokenData.expiresAt;
      if (isExpired) {
        await deleteToken(sessionId);
        return null;
      }
      tokenData.expiresAt = new Date(Date.now() + tokenTtl);
      await saveTokenData(tokenData);
      return tokenData.token;
    },
    async cleanup(): Promise<number> {
      // Redis handles expiry via TTL, so nothing to do here.
      return Promise.resolve(0); // NOSONAR
    },
    async clear(): Promise<void> {
      try {
        // Logical clear: bump the version so future operations use a new prefix.
        await bumpPrefixVersion();
      } catch (error) {
        Logger.error('CSRF Redis clear failed', error as Error);
      }
    },
    async getTokenCount(): Promise<number> {
      try {
        const prefix = await getEffectivePrefix();
        const keys = await scanKeys(prefix);
        return keys.length;
      } catch (error) {
        Logger.error('CSRF Redis count failed', error as Error);
        return 0;
      }
    },
  };
};

const create = (options?: CsrfTokenManagerOptions): ICsrfTokenManager => {
  const tokenLength = options?.tokenLength ?? Env.TOKEN_LENGTH; // 256 bits
  const tokenTtl = options?.tokenTtlMs ?? Env.TOKEN_TTL; // 1 hour in milliseconds
  const store = resolveStoreName(options);

  if (store === 'redis') {
    return createRedisManager(tokenLength, tokenTtl, options);
  }

  return createMemoryManager(tokenLength, tokenTtl);
};

/**
 * CsrfTokenManager namespace - sealed for immutability
 */
export const CsrfTokenManager: CsrfTokenManagerType = Object.freeze({
  create,
});
