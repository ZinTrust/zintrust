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

const resolveStoreName = (options?: CsrfTokenManagerOptions): CsrfStoreName => {
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

    redisClient = createRedisConnection({
      host: Env.get('REDIS_HOST', 'localhost'),
      port: Env.getInt('REDIS_PORT', ZintrustLang.REDIS_DEFAULT_PORT),
      password: Env.get('REDIS_PASSWORD'),
      db: database,
    });

    return redisClient;
  };
};

const createRedisTokenOperations = (
  keyPrefix: string,
  tokenTtl: number,
  getRedisClient: () => Redis
): {
  fetchTokenData: (sessionId: string) => Promise<CsrfTokenData | null>;
  saveTokenData: (data: CsrfTokenData) => Promise<void>;
  deleteToken: (sessionId: string) => Promise<void>;
  scanKeys: () => Promise<string[]>;
} => {
  const buildKey = (sessionId: string): string => `${keyPrefix}${sessionId}`;

  const fetchTokenData = async (sessionId: string): Promise<CsrfTokenData | null> => {
    try {
      const client = getRedisClient();
      const payload = await client.get(buildKey(sessionId));
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
      const stored: StoredCsrfTokenData = {
        token: data.token,
        sessionId: data.sessionId,
        createdAt: data.createdAt.getTime(),
        expiresAt: data.expiresAt.getTime(),
      };
      await client.set(buildKey(data.sessionId), JSON.stringify(stored), 'PX', tokenTtl);
    } catch (error) {
      Logger.error('CSRF Redis save failed', error as Error);
    }
  };

  const deleteToken = async (sessionId: string): Promise<void> => {
    try {
      const client = getRedisClient();
      await client.del(buildKey(sessionId));
    } catch (error) {
      Logger.error('CSRF Redis delete failed', error as Error);
    }
  };

  const scanKeys = async (): Promise<string[]> => {
    const client = getRedisClient();
    const keys: string[] = [];
    const stream = client.scanStream({ match: `${keyPrefix}*`, count: 200 });

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

  return {
    fetchTokenData,
    saveTokenData,
    deleteToken,
    scanKeys,
  };
};

const createRedisManager = (
  tokenLength: number,
  tokenTtl: number,
  options?: CsrfTokenManagerOptions
): ICsrfTokenManager => {
  const keyPrefix = options?.keyPrefix ?? RedisKeys.getCsrfPrefix();
  const getRedisClient = createRedisClientFactory(options);
  const { fetchTokenData, saveTokenData, deleteToken, scanKeys } = createRedisTokenOperations(
    keyPrefix,
    tokenTtl,
    getRedisClient
  );

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
        const keys = await scanKeys();
        if (keys.length === 0) return;
        const client = getRedisClient();
        await client.del(...keys);
      } catch (error) {
        Logger.error('CSRF Redis clear failed', error as Error);
      }
    },
    async getTokenCount(): Promise<number> {
      try {
        const keys = await scanKeys();
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
