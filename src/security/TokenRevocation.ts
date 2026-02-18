import { RemoteSignedJson, type RemoteSignedJsonSettings } from '@common/RemoteSignedJson';
import { Cloudflare } from '@config/cloudflare';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { securityConfig } from '@config/security';
import { createRedisConnection } from '@config/workers';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { useDatabase } from '@orm/Database';
import { JwtManager } from '@security/JwtManager';

type AuthorizationHeader = string | string[] | undefined;

export type TokenRevocationDriverName = 'database' | 'memory' | 'redis' | 'kv' | 'kv-remote';

type RevocationKey = {
  id: string;
  expiresAtMs: number;
  sub?: string;
};

type TokenRevocationStore = {
  revoke: (key: RevocationKey) => Promise<void>;
  isRevoked: (id: string) => Promise<boolean>;
};

const DEFAULTS = {
  driver: 'database' as const,
  dbConnection: 'default',
  dbTable: 'zintrust_jwt_revocations',
  redisPrefix: 'zt:jwt:revoked:',
  kvBinding: 'CACHE',
  kvRemoteNamespace: '',
} as const;

const defaultTtlMs = Math.max(securityConfig.jwt.expiresIn * 1000, 60_000);

const normalizeDriverName = (raw: unknown): TokenRevocationDriverName => {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value === 'db' || value === 'database') return 'database';
  if (value === 'redis') return 'redis';
  if (value === 'kv') return 'kv';
  if (value === 'kv-remote' || value === 'kvremote') return 'kv-remote';
  if (value === 'memory' || value === 'mem') return 'memory';
  return DEFAULTS.driver;
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

const getBearerToken = (header: AuthorizationHeader): string | null => {
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const [scheme, ...rest] = trimmed.split(/\s+/);
  if (typeof scheme !== 'string' || scheme.toLowerCase() !== 'bearer') return null;
  const token = rest.join(' ').trim();
  return token === '' ? null : token;
};

const resolveExpiryMs = (token: string): { expiresAtMs: number; sub?: string; jti?: string } => {
  try {
    const payload = JwtManager.create().decode(token);
    const expiresAtMs =
      typeof payload.exp === 'number' && Number.isFinite(payload.exp)
        ? payload.exp * 1000
        : Date.now() + defaultTtlMs;

    const sub =
      typeof payload.sub === 'string' && payload.sub.trim() !== '' ? payload.sub : undefined;
    const jti =
      typeof payload.jti === 'string' && payload.jti.trim() !== '' ? payload.jti : undefined;
    return { expiresAtMs, sub, jti };
  } catch {
    return { expiresAtMs: Date.now() + defaultTtlMs };
  }
};

const resolveKey = (token: string): RevocationKey => {
  const { expiresAtMs, sub, jti } = resolveExpiryMs(token);
  return {
    id: jti ?? token,
    expiresAtMs,
    sub,
  };
};

const logWarnBestEffort = (message: string, meta: Record<string, unknown>): void => {
  const anyLogger = Logger as unknown as {
    warn?: (msg: string, meta?: unknown) => void;
    debug?: (msg: string, meta?: unknown) => void;
    info?: (msg: string, meta?: unknown) => void;
  };

  if (typeof anyLogger.warn === 'function') {
    anyLogger.warn(message, meta);
    return;
  }
  if (typeof anyLogger.debug === 'function') {
    anyLogger.debug(message, meta);
    return;
  }
  if (typeof anyLogger.info === 'function') {
    anyLogger.info(message, meta);
  }
};

const createMemoryStore = (): TokenRevocationStore => {
  const revoked = new Map<string, number>();

  const cleanupExpired = (): void => {
    const now = Date.now();
    for (const [id, expiresAtMs] of revoked.entries()) {
      if (expiresAtMs <= now) revoked.delete(id);
    }
  };

  return {
    async revoke(key: RevocationKey): Promise<void> {
      cleanupExpired();
      revoked.set(key.id, key.expiresAtMs);
    },
    async isRevoked(id: string): Promise<boolean> {
      cleanupExpired();
      const expiresAtMs = revoked.get(id);
      if (expiresAtMs === undefined) return false;
      if (expiresAtMs <= Date.now()) {
        revoked.delete(id);
        return false;
      }
      return true;
    },
  };
};

const createDatabaseStore = (params: {
  connection: string;
  table: string;
}): TokenRevocationStore => {
  let checkCount = 0;

  const maybeCleanup = async (): Promise<void> => {
    checkCount += 1;
    if (checkCount % 250 !== 0) return;
    try {
      const db = useDatabase(undefined, params.connection);
      await db.table(params.table).where('expires_at_ms', '<=', Date.now()).delete();
    } catch (error) {
      Logger.debug('TokenRevocation database cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return {
    async revoke(key: RevocationKey): Promise<void> {
      const ttlMs = Math.max(0, key.expiresAtMs - Date.now());
      if (ttlMs === 0) return;
      try {
        const db = useDatabase(undefined, params.connection);
        const existing = await db
          .table(params.table)
          .where('jti', '=', key.id)
          .first<Record<string, unknown>>();
        const payload: Record<string, unknown> = {
          jti: key.id,
          sub: key.sub ?? null,
          expires_at_ms: key.expiresAtMs,
        };
        if (existing) {
          await db.table(params.table).where('jti', '=', key.id).update(payload);
        } else {
          await db.table(params.table).insert(payload);
        }
      } catch (error) {
        logWarnBestEffort('TokenRevocation database revoke failed (token will not be revoked)', {
          error: error instanceof Error ? error.message : String(error),
          table: params.table,
        });
      }
    },
    async isRevoked(id: string): Promise<boolean> {
      await maybeCleanup();
      try {
        const db = useDatabase(undefined, params.connection);
        const row = await db
          .table(params.table)
          .where('jti', '=', id)
          .first<Record<string, unknown>>();
        if (!row) return false;
        const expiresAt = row['expires_at_ms'];
        const expiresAtMs = typeof expiresAt === 'number' ? expiresAt : Number(expiresAt);
        if (!Number.isFinite(expiresAtMs)) return true;
        if (expiresAtMs <= Date.now()) {
          await db.table(params.table).where('jti', '=', id).delete();
          return false;
        }
        return true;
      } catch (error) {
        logWarnBestEffort('TokenRevocation database check failed (treating as not revoked)', {
          error: error instanceof Error ? error.message : String(error),
          table: params.table,
        });
        return false;
      }
    },
  };
};

const createRedisStore = (params: { keyPrefix: string }): TokenRevocationStore => {
  const client = createRedisConnection({
    host: Env.REDIS_HOST,
    port: Env.REDIS_PORT,
    password: Env.REDIS_PASSWORD,
    db: Env.getInt('JWT_REVOCATION_REDIS_DB', Env.REDIS_DB),
  });

  return {
    async revoke(key: RevocationKey): Promise<void> {
      const ttlMs = Math.max(0, key.expiresAtMs - Date.now());
      if (ttlMs === 0) return;
      await client.set(`${params.keyPrefix}${key.id}`, '1', 'PX', ttlMs);
    },
    async isRevoked(id: string): Promise<boolean> {
      const value = await client.get(`${params.keyPrefix}${id}`);
      return value !== null;
    },
  };
};

type KVNamespace = NonNullable<ReturnType<typeof Cloudflare.getKVBinding>>;

const createKvStore = (params: {
  bindingName: string;
  keyPrefix: string;
}): TokenRevocationStore => {
  const getKvOrThrow = (): KVNamespace => {
    const kv = Cloudflare.getKVBinding(params.bindingName);
    if (kv === null) {
      throw ErrorFactory.createConfigError(`KV binding '${params.bindingName}' not found`, {
        bindingName: params.bindingName,
      });
    }
    return kv;
  };

  return {
    async revoke(key: RevocationKey): Promise<void> {
      const ttlMs = Math.max(0, key.expiresAtMs - Date.now());
      if (ttlMs === 0) return;
      const ttlSeconds = Math.max(60, Math.ceil(ttlMs / 1000));
      const kv = getKvOrThrow();
      await kv.put(`${params.keyPrefix}${key.id}`, '1', { expirationTtl: ttlSeconds });
    },
    async isRevoked(id: string): Promise<boolean> {
      const kv = getKvOrThrow();
      const value = await kv.get(`${params.keyPrefix}${id}`);
      return value !== null;
    },
  };
};

const createKvRemoteStore = (params: {
  keyPrefix: string;
  namespace: string;
}): TokenRevocationStore => {
  const baseUrl = Env.get('KV_REMOTE_URL');
  const keyId = Env.get('KV_REMOTE_KEY_ID');
  const secret = Env.get('KV_REMOTE_SECRET', Env.APP_KEY);
  const timeoutMs = Env.getInt('ZT_PROXY_TIMEOUT_MS', Env.REQUEST_TIMEOUT);

  const remote: RemoteSignedJsonSettings = {
    baseUrl,
    keyId,
    secret,
    timeoutMs,
    signaturePathPrefixToStrip: resolveSigningPrefix(baseUrl),
    missingUrlMessage: 'KV remote proxy URL is missing (KV_REMOTE_URL)',
    missingCredentialsMessage:
      'KV remote signing credentials are missing (KV_REMOTE_KEY_ID / KV_REMOTE_SECRET)',
    messages: {
      unauthorized: 'KV remote proxy unauthorized',
      forbidden: 'KV remote proxy forbidden',
      rateLimited: 'KV remote proxy rate limited',
      rejected: 'KV remote proxy rejected request',
      error: 'KV remote proxy error',
      timedOut: 'KV remote proxy request timed out',
    },
  };

  const normalizeNamespace = (value: string): string | undefined => {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  };

  type KvGetResponse = { value: unknown };
  type KvPutResponse = { ok: true };

  return {
    async revoke(key: RevocationKey): Promise<void> {
      const ttlMs = Math.max(0, key.expiresAtMs - Date.now());
      if (ttlMs === 0) return;
      const ttlSeconds = Math.max(60, Math.ceil(ttlMs / 1000));

      await RemoteSignedJson.request<KvPutResponse>(remote, '/zin/kv/put', {
        namespace: normalizeNamespace(params.namespace),
        key: `${params.keyPrefix}${key.id}`,
        value: '1',
        ttlSeconds,
      });
    },
    async isRevoked(id: string): Promise<boolean> {
      const out = await RemoteSignedJson.request<KvGetResponse>(remote, '/zin/kv/get', {
        namespace: normalizeNamespace(params.namespace),
        key: `${params.keyPrefix}${id}`,
        type: 'text',
      });
      return out.value !== null && out.value !== undefined && String(out.value).trim() !== '';
    },
  };
};

let cachedStore: TokenRevocationStore | null = null;
let cachedDriver: TokenRevocationDriverName | null = null;

const resolveStore = (): { driver: TokenRevocationDriverName; store: TokenRevocationStore } => {
  const driver = normalizeDriverName(Env.get('JWT_REVOCATION_DRIVER', DEFAULTS.driver));
  if (cachedStore !== null && cachedDriver === driver) {
    return { driver, store: cachedStore };
  }

  if (driver === 'memory') {
    cachedStore = createMemoryStore();
    cachedDriver = driver;
    return { driver, store: cachedStore };
  }

  if (driver === 'database') {
    const connection = Env.get('JWT_REVOCATION_DB_CONNECTION', DEFAULTS.dbConnection);
    const table = Env.get('JWT_REVOCATION_DB_TABLE', DEFAULTS.dbTable);
    cachedStore = createDatabaseStore({ connection, table });
    cachedDriver = driver;
    return { driver, store: cachedStore };
  }

  if (driver === 'redis') {
    const keyPrefix = Env.get('JWT_REVOCATION_REDIS_PREFIX', DEFAULTS.redisPrefix);
    cachedStore = createRedisStore({ keyPrefix });
    cachedDriver = driver;
    return { driver, store: cachedStore };
  }

  if (driver === 'kv-remote') {
    const keyPrefix = Env.get('JWT_REVOCATION_KV_PREFIX', DEFAULTS.redisPrefix);
    const namespace = Env.get('KV_REMOTE_NAMESPACE', DEFAULTS.kvRemoteNamespace);
    cachedStore = createKvRemoteStore({ keyPrefix, namespace });
    cachedDriver = driver;
    return { driver, store: cachedStore };
  }

  const bindingName = Env.get('JWT_REVOCATION_KV_BINDING', DEFAULTS.kvBinding);
  const keyPrefix = Env.get('JWT_REVOCATION_KV_PREFIX', DEFAULTS.redisPrefix);
  cachedStore = createKvStore({ bindingName, keyPrefix });
  cachedDriver = driver;
  return { driver, store: cachedStore };
};

export const TokenRevocation = Object.freeze({
  /**
   * Mark a token as revoked.
   *
   * Storage is keyed by JWT `jti` when present; otherwise falls back to the raw token string.
   */
  async revoke(header: AuthorizationHeader): Promise<string | null> {
    const token = getBearerToken(header);
    if (token === null) return null;

    const { store } = resolveStore();
    const key = resolveKey(token);
    await store.revoke(key);
    return token;
  },

  /**
   * Check if a token is revoked.
   */
  async isRevoked(token: string): Promise<boolean> {
    const { store } = resolveStore();
    const key = resolveKey(token);
    return store.isRevoked(key.id);
  },

  /**
   * For observability.
   */
  getDriver(): TokenRevocationDriverName {
    return resolveStore().driver;
  },

  /**
   * Test/boot helper: reset cached driver.
   */
  _resetForTests(): void {
    cachedStore = null;
    cachedDriver = null;
  },
});

export default TokenRevocation;
