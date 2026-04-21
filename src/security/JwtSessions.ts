import { RemoteSignedJson, type RemoteSignedJsonSettings } from '@common/RemoteSignedJson';
import { Cloudflare } from '@config/cloudflare';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { securityConfig } from '@config/security';
import { createRedisConnection } from '@config/workers';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { useDatabase } from '@orm/Database';
import {
  shouldRetryAuthStoreInsertWithGeneratedId,
  withGeneratedAuthStoreId,
} from '@security/AuthStoreIds';
import { JwtManager } from '@security/JwtManager';

export type JwtSessionsDriverName = 'database' | 'memory' | 'redis' | 'kv' | 'kv-remote';

export type AuthorizationHeader = string | string[] | undefined;

type SessionKey = {
  id: string;
  expiresAtMs: number;
  sub?: string;
};

type JwtSessionsStore = {
  upsertActive: (key: SessionKey) => Promise<void>;
  isActive: (id: string) => Promise<boolean>;
  deleteById: (id: string) => Promise<void>;
  deleteAllForSub: (sub: string) => Promise<void>;
};

const DEFAULTS = {
  driver: 'database' as const,
  dbConnection: 'default',
  dbTable: 'zintrust_jwt_revocations',
  redisPrefix: 'zt:jwt:active:',
  kvBinding: 'CACHE',
  kvPrefix: 'zt:jwt:active:',
  kvRemoteNamespace: '',
  subIndexSuffix: ':sub:',
} as const;

const defaultTtlMs = Math.max(securityConfig.jwt.expiresIn * 1000, 60_000);

const normalizeDriverName = (raw: unknown): JwtSessionsDriverName => {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value === 'db' || value === 'database') return 'database';
  if (value === 'redis') return 'redis';
  if (value === 'kv') return 'kv';
  if (value === 'kv-remote' || value === 'kvremote') return 'kv-remote';
  if (value === 'memory' || value === 'mem') return 'memory';
  return DEFAULTS.driver;
};

const getHeaderValue = (value: unknown): string => {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : '';
  return typeof value === 'string' ? value : '';
};

const getBearerToken = (authorizationHeader: AuthorizationHeader): string | null => {
  const header = getHeaderValue(authorizationHeader).trim();
  if (header === '') return null;

  const [scheme, ...rest] = header.split(/\s+/);
  if (typeof scheme !== 'string' || scheme.toLowerCase() !== 'bearer') return null;

  const token = rest.join(' ').trim();
  if (token === '') return null;
  return token;
};

const resolveKey = (token: string): SessionKey => {
  let decoded: Record<string, unknown> = {};

  try {
    decoded = JwtManager.create().decode(token) as unknown as Record<string, unknown>;
  } catch {
    decoded = {};
  }

  const expSeconds = typeof decoded['exp'] === 'number' ? decoded['exp'] : undefined;
  const expiresAtMs =
    expSeconds !== undefined && Number.isFinite(expSeconds) && expSeconds > 0
      ? Math.floor(expSeconds * 1000)
      : Date.now() + defaultTtlMs;

  const jti = typeof decoded['jti'] === 'string' ? decoded['jti'].trim() : '';
  const sub = typeof decoded['sub'] === 'string' ? decoded['sub'].trim() : '';

  return {
    id: jti === '' ? token : jti,
    expiresAtMs,
    sub: sub === '' ? undefined : sub,
  };
};

const createMemoryStore = (): JwtSessionsStore => {
  const active = new Map<string, number>();
  const subIndex = new Map<string, Set<string>>();
  const idToSub = new Map<string, string>();

  const indexDelete = (id: string): void => {
    const sub = idToSub.get(id);
    if (sub === undefined) return;

    const set = subIndex.get(sub);
    if (set !== undefined) {
      set.delete(id);
      if (set.size === 0) {
        subIndex.delete(sub);
      }
    }

    idToSub.delete(id);
  };

  const indexAdd = (sub: string | undefined, id: string): void => {
    if (typeof sub !== 'string' || sub.trim() === '') {
      indexDelete(id);
      return;
    }

    const key = sub.trim();

    // If this id was previously indexed under another subject, remove it.
    const previous = idToSub.get(id);
    if (previous !== undefined && previous !== key) {
      indexDelete(id);
    }

    const existing = subIndex.get(key) ?? new Set<string>();
    existing.add(id);
    subIndex.set(key, existing);
    idToSub.set(id, key);
  };

  const cleanupExpired = (): void => {
    const now = Date.now();
    for (const [id, expiresAtMs] of active.entries()) {
      if (expiresAtMs <= now) {
        active.delete(id);
        indexDelete(id);
      }
    }
  };

  return {
    async upsertActive(key: SessionKey): Promise<void> {
      cleanupExpired();
      active.set(key.id, key.expiresAtMs);
      indexAdd(key.sub, key.id);
      await Promise.resolve();
    },
    async isActive(id: string): Promise<boolean> {
      cleanupExpired();
      const expiresAtMs = active.get(id);
      if (expiresAtMs === undefined) return false;
      if (expiresAtMs <= Date.now()) {
        active.delete(id);
        indexDelete(id);
        return false;
      }
      await Promise.resolve();
      return true;
    },
    async deleteById(id: string): Promise<void> {
      active.delete(id);
      indexDelete(id);
      await Promise.resolve();
    },
    async deleteAllForSub(sub: string): Promise<void> {
      const key = sub.trim();
      const ids = subIndex.get(key);
      if (!ids) return;
      for (const id of ids.values()) {
        active.delete(id);
        idToSub.delete(id);
      }
      subIndex.delete(key);
      await Promise.resolve();
    },
  };
};

const createActiveSessionRecord = (key: SessionKey): Record<string, unknown> => {
  return {
    jti: key.id,
    sub: key.sub ?? null,
    user_id: key.sub ?? null,
    expires_at_ms: key.expiresAtMs,
    kind: 'active',
  };
};

const insertActiveSessionRecord = async (
  db: ReturnType<typeof useDatabase>,
  table: string,
  record: Record<string, unknown>
): Promise<void> => {
  try {
    await db.table(table).insert(record);
  } catch (error) {
    if (!shouldRetryAuthStoreInsertWithGeneratedId(error)) {
      throw error;
    }

    await db.table(table).insert(withGeneratedAuthStoreId(record));
  }
};

const createDatabaseStore = (params: { connection: string; table: string }): JwtSessionsStore => {
  let checkCount = 0;

  const maybeCleanup = async (): Promise<void> => {
    checkCount += 1;
    if (checkCount % 250 !== 0) return;
    try {
      const db = useDatabase(undefined, params.connection);
      await db.table(params.table).where('expires_at_ms', '<=', Date.now()).delete();
    } catch (error) {
      Logger.debug('JwtSessions database cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return {
    async upsertActive(key: SessionKey): Promise<void> {
      const db = useDatabase(undefined, params.connection);
      const record = createActiveSessionRecord(key);

      try {
        await db.table(params.table).where('jti', '=', key.id).update(record);
        const existing = await db.table(params.table).where('jti', '=', key.id).first();
        if (existing === null) {
          await insertActiveSessionRecord(db, params.table, record);
        }
      } catch (error) {
        throw ErrorFactory.createConfigError(
          `JWT sessions database table '${params.table}' is missing required columns (run migrations)`,
          {
            table: params.table,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    },

    async isActive(id: string): Promise<boolean> {
      await maybeCleanup();
      const db = useDatabase(undefined, params.connection);

      try {
        const row = await db
          .table(params.table)
          .where('jti', '=', id)
          .where('kind', '=', 'active')
          .first<Record<string, unknown>>();

        if (row === null) return false;

        const expiresAtMs = Number(row['expires_at_ms']);
        if (!Number.isFinite(expiresAtMs)) return true;
        if (expiresAtMs <= Date.now()) {
          await db.table(params.table).where('jti', '=', id).delete();
          return false;
        }

        return true;
      } catch (error) {
        throw ErrorFactory.createConfigError(
          `JWT sessions database table '${params.table}' is missing required columns (run migrations)`,
          {
            table: params.table,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    },

    async deleteById(id: string): Promise<void> {
      const db = useDatabase(undefined, params.connection);
      await db.table(params.table).where('jti', '=', id).delete();
    },

    async deleteAllForSub(sub: string): Promise<void> {
      const db = useDatabase(undefined, params.connection);
      await db.table(params.table).where('sub', '=', sub).where('kind', '=', 'active').delete();
    },
  };
};

const encodeSubIndexKey = (prefix: string, sub: string): string => {
  const trimmed = sub.trim();
  return `${prefix}${DEFAULTS.subIndexSuffix}${encodeURIComponent(trimmed)}`;
};

const parseSubIndexValue = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v) => typeof v === 'string')
    .map((s) => s.trim())
    .filter((s) => s !== '');
};

const createRedisStore = (params: { keyPrefix: string }): JwtSessionsStore => {
  const client = createRedisConnection(
    {
      host: Env.REDIS_HOST,
      port: Env.REDIS_PORT,
      password: Env.REDIS_PASSWORD,
      db: Env.getInt('JWT_REVOCATION_REDIS_DB', Env.REDIS_DB),
    },
    3,
    { subsystem: 'jwt-sessions' }
  );

  const indexGet = async (sub: string): Promise<string[]> => {
    const value = await client.get(encodeSubIndexKey(params.keyPrefix, sub));
    if (value === null) return [];
    try {
      return parseSubIndexValue(JSON.parse(value));
    } catch {
      return [];
    }
  };

  const indexSet = async (sub: string, ids: string[], ttlMs: number): Promise<void> => {
    const ttl = Math.max(0, ttlMs);
    if (ttl === 0) return;
    await client.set(encodeSubIndexKey(params.keyPrefix, sub), JSON.stringify(ids), 'PX', ttl);
  };

  return {
    async upsertActive(key: SessionKey): Promise<void> {
      const ttlMs = Math.max(0, key.expiresAtMs - Date.now());
      if (ttlMs === 0) return;
      await client.set(`${params.keyPrefix}${key.id}`, '1', 'PX', ttlMs);

      if (typeof key.sub === 'string' && key.sub.trim() !== '') {
        const existing = await indexGet(key.sub);
        const next = Array.from(new Set([...existing, key.id]));
        await indexSet(key.sub, next, ttlMs);
      }
    },

    async isActive(id: string): Promise<boolean> {
      const value = await client.get(`${params.keyPrefix}${id}`);
      return value !== null;
    },

    async deleteById(id: string): Promise<void> {
      await client.del(`${params.keyPrefix}${id}`);
    },

    async deleteAllForSub(sub: string): Promise<void> {
      const ids = await indexGet(sub);
      if (ids.length > 0) {
        await client.del(...ids.map((id) => `${params.keyPrefix}${id}`));
      }
      await client.del(encodeSubIndexKey(params.keyPrefix, sub));
    },
  };
};

type KVNamespace = NonNullable<ReturnType<typeof Cloudflare.getKVBinding>>;

const createKvStore = (params: { bindingName: string; keyPrefix: string }): JwtSessionsStore => {
  const getKvOrThrow = (): KVNamespace => {
    const kv = Cloudflare.getKVBinding(params.bindingName);
    if (kv === null) {
      throw ErrorFactory.createConfigError(`KV binding '${params.bindingName}' not found`, {
        bindingName: params.bindingName,
      });
    }
    return kv;
  };

  const indexGet = async (sub: string): Promise<string[]> => {
    const kv = getKvOrThrow();
    const rawValue = await kv.get(encodeSubIndexKey(params.keyPrefix, sub));
    if (typeof rawValue !== 'string') return [];
    const trimmed = rawValue.trim();
    if (trimmed === '') return [];
    try {
      return parseSubIndexValue(JSON.parse(trimmed));
    } catch {
      return [];
    }
  };

  const indexSet = async (sub: string, ids: string[], ttlMs: number): Promise<void> => {
    const ttlSeconds = Math.max(60, Math.ceil(ttlMs / 1000));
    const kv = getKvOrThrow();
    await kv.put(encodeSubIndexKey(params.keyPrefix, sub), JSON.stringify(ids), {
      expirationTtl: ttlSeconds,
    });
  };

  return {
    async upsertActive(key: SessionKey): Promise<void> {
      const ttlMs = Math.max(0, key.expiresAtMs - Date.now());
      if (ttlMs === 0) return;
      const ttlSeconds = Math.max(60, Math.ceil(ttlMs / 1000));
      const kv = getKvOrThrow();
      await kv.put(`${params.keyPrefix}${key.id}`, '1', { expirationTtl: ttlSeconds });

      if (typeof key.sub === 'string' && key.sub.trim() !== '') {
        const existing = await indexGet(key.sub);
        const next = Array.from(new Set([...existing, key.id]));
        await indexSet(key.sub, next, ttlMs);
      }
    },

    async isActive(id: string): Promise<boolean> {
      const kv = getKvOrThrow();
      const value = await kv.get(`${params.keyPrefix}${id}`);
      return value !== null;
    },

    async deleteById(id: string): Promise<void> {
      const kv = getKvOrThrow();
      await kv.delete(`${params.keyPrefix}${id}`);
    },

    async deleteAllForSub(sub: string): Promise<void> {
      const kv = getKvOrThrow();
      const ids = await indexGet(sub);
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        await kv.delete(`${params.keyPrefix}${id}`);
      }
      await kv.delete(encodeSubIndexKey(params.keyPrefix, sub));
    },
  };
};

type KvRemoteProxySettings = {
  baseUrl: string;
  keyId: string;
  secret: string;
  timeoutMs: number;
};

type KvRemoteCtx = {
  keyPrefix: string;
  namespace: string;
  getProxySettings: () => KvRemoteProxySettings;
  createRemoteSettings: (proxy: KvRemoteProxySettings) => RemoteSignedJsonSettings;
  normalizeNamespace: (value: string) => string | undefined;
};

type KvGetResponse = { value: unknown };

type KvPutResponse = { ok: true };

type KvDeleteResponse = { ok: true };

const kvRemoteGetProxySettings = (): KvRemoteProxySettings => ({
  baseUrl: Env.get('KV_REMOTE_URL'),
  keyId: Env.get('KV_REMOTE_KEY_ID'),
  secret: Env.get('KV_REMOTE_SECRET', Env.APP_KEY),
  timeoutMs: Env.getInt('ZT_PROXY_TIMEOUT_MS', Env.REQUEST_TIMEOUT),
});

const kvRemoteNormalizeNamespace = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const kvRemoteCreateRemoteSettings = (proxy: KvRemoteProxySettings): RemoteSignedJsonSettings => ({
  baseUrl: proxy.baseUrl,
  keyId: proxy.keyId,
  secret: proxy.secret,
  timeoutMs: proxy.timeoutMs,
  signaturePathPrefixToStrip: undefined,
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
});

const createKvRemoteOps = (
  ctx: KvRemoteCtx
): {
  remoteGetJson: (key: string) => Promise<unknown>;
  remotePutJson: (key: string, value: unknown, ttlSeconds?: number) => Promise<void>;
  remoteDelete: (key: string) => Promise<void>;
  indexGet: (sub: string) => Promise<string[]>;
  indexSet: (sub: string, ids: string[], ttlMs: number) => Promise<void>;
} => {
  const getRemoteOrThrow = (): RemoteSignedJsonSettings => {
    const proxy = ctx.getProxySettings();
    if (proxy.baseUrl.trim() === '') {
      throw ErrorFactory.createConfigError('KV remote proxy URL is missing (KV_REMOTE_URL)');
    }
    if (proxy.keyId.trim() === '' || proxy.secret.trim() === '') {
      throw ErrorFactory.createConfigError(
        'KV remote signing credentials are missing (KV_REMOTE_KEY_ID / KV_REMOTE_SECRET)'
      );
    }
    return ctx.createRemoteSettings(proxy);
  };

  const remoteGetJson = async (key: string): Promise<unknown> => {
    const remote = getRemoteOrThrow();
    const out = await RemoteSignedJson.request<KvGetResponse>(remote, '/zin/kv/get', {
      namespace: ctx.normalizeNamespace(ctx.namespace),
      key,
      type: 'text',
    });
    return out.value;
  };

  const remotePutJson = async (key: string, value: unknown, ttlSeconds?: number): Promise<void> => {
    const remote = getRemoteOrThrow();
    await RemoteSignedJson.request<KvPutResponse>(remote, '/zin/kv/put', {
      namespace: ctx.normalizeNamespace(ctx.namespace),
      key,
      value,
      ttlSeconds,
    });
  };

  const remoteDelete = async (key: string): Promise<void> => {
    const remote = getRemoteOrThrow();
    await RemoteSignedJson.request<KvDeleteResponse>(remote, '/zin/kv/delete', {
      namespace: ctx.normalizeNamespace(ctx.namespace),
      key,
    });
  };

  const indexGet = async (sub: string): Promise<string[]> => {
    const raw = await remoteGetJson(encodeSubIndexKey(ctx.keyPrefix, sub));
    if (typeof raw !== 'string') return [];
    try {
      return parseSubIndexValue(JSON.parse(raw));
    } catch {
      return [];
    }
  };

  const indexSet = async (sub: string, ids: string[], ttlMs: number): Promise<void> => {
    const ttlSeconds = Math.max(60, Math.ceil(Math.max(0, ttlMs) / 1000));
    await remotePutJson(encodeSubIndexKey(ctx.keyPrefix, sub), JSON.stringify(ids), ttlSeconds);
  };

  return { remoteGetJson, remotePutJson, remoteDelete, indexGet, indexSet };
};

const createKvRemoteStore = (params: {
  keyPrefix: string;
  namespace: string;
}): JwtSessionsStore => {
  const ctx: KvRemoteCtx = {
    keyPrefix: params.keyPrefix,
    namespace: params.namespace,
    getProxySettings: kvRemoteGetProxySettings,
    createRemoteSettings: kvRemoteCreateRemoteSettings,
    normalizeNamespace: kvRemoteNormalizeNamespace,
  };

  const ops = createKvRemoteOps(ctx);

  return {
    async upsertActive(key: SessionKey): Promise<void> {
      const ttlMs = Math.max(0, key.expiresAtMs - Date.now());
      if (ttlMs === 0) return;
      const ttlSeconds = Math.max(60, Math.ceil(ttlMs / 1000));
      await ops.remotePutJson(`${ctx.keyPrefix}${key.id}`, '1', ttlSeconds);

      if (typeof key.sub === 'string' && key.sub.trim() !== '') {
        const existing = await ops.indexGet(key.sub);
        const next = Array.from(new Set([...existing, key.id]));
        await ops.indexSet(key.sub, next, ttlMs);
      }
    },

    async isActive(id: string): Promise<boolean> {
      const raw = await ops.remoteGetJson(`${ctx.keyPrefix}${id}`);
      if (raw === null || raw === undefined) return false;
      if (typeof raw === 'string') return raw.trim() !== '';
      return true;
    },

    async deleteById(id: string): Promise<void> {
      await ops.remoteDelete(`${ctx.keyPrefix}${id}`);
    },

    async deleteAllForSub(sub: string): Promise<void> {
      const ids = await ops.indexGet(sub);
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        await ops.remoteDelete(`${ctx.keyPrefix}${id}`);
      }
      await ops.remoteDelete(encodeSubIndexKey(ctx.keyPrefix, sub));
    },
  };
};

let cachedStore: JwtSessionsStore | null = null;
let cachedDriver: JwtSessionsDriverName | null = null;

const resolveStore = (): { driver: JwtSessionsDriverName; store: JwtSessionsStore } => {
  const driver = normalizeDriverName(
    Env.get('JWT_SESSION_DRIVER', Env.get('JWT_REVOCATION_DRIVER', DEFAULTS.driver))
  );

  if (cachedStore !== null && cachedDriver === driver) {
    return { driver, store: cachedStore };
  }

  if (driver === 'memory') {
    cachedStore = createMemoryStore();
    cachedDriver = driver;
    return { driver, store: cachedStore };
  }

  if (driver === 'database') {
    const connection = Env.get(
      'JWT_SESSION_DB_CONNECTION',
      Env.get('JWT_REVOCATION_DB_CONNECTION', DEFAULTS.dbConnection)
    );
    const table = Env.get(
      'JWT_SESSION_DB_TABLE',
      Env.get('JWT_REVOCATION_DB_TABLE', DEFAULTS.dbTable)
    );
    cachedStore = createDatabaseStore({ connection, table });
    cachedDriver = driver;
    return { driver, store: cachedStore };
  }

  if (driver === 'redis') {
    const keyPrefix = Env.get(
      'JWT_SESSION_REDIS_PREFIX',
      Env.get('JWT_REVOCATION_REDIS_PREFIX', DEFAULTS.redisPrefix)
    );
    cachedStore = createRedisStore({ keyPrefix });
    cachedDriver = driver;
    return { driver, store: cachedStore };
  }

  if (driver === 'kv') {
    const bindingName = Env.get(
      'JWT_SESSION_KV_BINDING',
      Env.get('JWT_REVOCATION_KV_BINDING', DEFAULTS.kvBinding)
    );
    const keyPrefix = Env.get('JWT_SESSION_KV_PREFIX', DEFAULTS.kvPrefix);
    cachedStore = createKvStore({ bindingName, keyPrefix });
    cachedDriver = driver;
    return { driver, store: cachedStore };
  }

  const namespace = Env.get('JWT_SESSION_KV_REMOTE_NAMESPACE', DEFAULTS.kvRemoteNamespace);
  const keyPrefix = Env.get('JWT_SESSION_KV_REMOTE_PREFIX', DEFAULTS.kvPrefix);
  cachedStore = createKvRemoteStore({ keyPrefix, namespace });
  cachedDriver = driver;
  return { driver, store: cachedStore };
};

export const JwtSessions = Object.freeze({
  async register(token: string): Promise<void> {
    const { store } = resolveStore();
    await store.upsertActive(resolveKey(token));
  },

  async isActive(token: string): Promise<boolean> {
    const { store } = resolveStore();
    const key = resolveKey(token);
    return store.isActive(key.id);
  },

  async logout(header: AuthorizationHeader): Promise<string | null> {
    const token = getBearerToken(header);
    if (token === null) return null;

    const { store } = resolveStore();
    const key = resolveKey(token);
    await store.deleteById(key.id);
    return token;
  },

  async logoutAll(sub: string): Promise<void> {
    const normalized = typeof sub === 'string' ? sub.trim() : '';
    if (normalized === '') return;

    const { store } = resolveStore();
    await store.deleteAllForSub(normalized);
  },

  getDriver(): JwtSessionsDriverName {
    return resolveStore().driver;
  },

  _resetForTests(): void {
    cachedStore = null;
    cachedDriver = null;
  },
});

export default JwtSessions;
