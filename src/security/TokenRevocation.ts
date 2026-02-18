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
      await Promise.resolve();
    },
    async isRevoked(id: string): Promise<boolean> {
      cleanupExpired();
      const expiresAtMs = revoked.get(id);
      if (expiresAtMs === undefined) return false;
      if (expiresAtMs <= Date.now()) {
        revoked.delete(id);
        return false;
      }
      await Promise.resolve();
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

type KvRemoteProxySettings = {
  baseUrl: string;
  keyId: string;
  secret: string;
  timeoutMs: number;
};

type KvRemoteCloudflareCreds = {
  accountId: string;
  apiToken: string;
  namespaceId: string;
  namespaceTitle: string;
};

type KvRemoteCloudflareNamespacesResponse = {
  success?: boolean;
  result?: Array<{ id?: string; title?: string }>;
  result_info?: { page?: number; total_pages?: number };
  errors?: unknown;
};

type KvRemoteCtx = {
  keyPrefix: string;
  namespace: string;
  getProxySettings: () => KvRemoteProxySettings;
  getCloudflareCreds: () => KvRemoteCloudflareCreds;
  hasCloudflareApiCreds: () => boolean;
  hasProxySigningCreds: (proxy: { keyId: string; secret: string }) => boolean;
  buildCloudflareValueUrl: (
    creds: { accountId: string; namespaceId: string },
    key: string,
    ttlSeconds?: number
  ) => string;
  cfFetch: (apiToken: string, url: string, init: RequestInit) => Promise<Response>;
  resolveCloudflareNamespaceId: () => Promise<string>;
  createRemoteSettings: (proxy: KvRemoteProxySettings) => RemoteSignedJsonSettings;
  normalizeNamespace: (value: string) => string | undefined;
};

type KvGetResponse = { value: unknown };
type KvPutResponse = { ok: true };

const kvRemoteGetProxySettings = (): KvRemoteProxySettings => ({
  baseUrl: Env.get('KV_REMOTE_URL'),
  keyId: Env.get('KV_REMOTE_KEY_ID'),
  secret: Env.get('KV_REMOTE_SECRET', Env.APP_KEY),
  timeoutMs: Env.getInt('ZT_PROXY_TIMEOUT_MS', Env.REQUEST_TIMEOUT),
});

const kvRemoteGetCloudflareCreds = (): KvRemoteCloudflareCreds => ({
  accountId: Env.get('KV_ACCOUNT_ID', Env.get('CLOUDFLARE_ACCOUNT_ID', '')).trim(),
  apiToken: Env.get('KV_API_TOKEN', Env.get('CLOUDFLARE_API_TOKEN', '')).trim(),
  namespaceId: Env.get('KV_NAMESPACE_ID', Env.get('CLOUDFLARE_KV_NAMESPACE_ID', '')).trim(),
  namespaceTitle: Env.get('KV_NAMESPACE', '').trim(),
});

const kvRemoteHasCloudflareApiCreds = (getCreds: () => KvRemoteCloudflareCreds): boolean => {
  const creds = getCreds();
  return creds.accountId !== '' && creds.apiToken !== '';
};

const kvRemoteHasProxySigningCreds = (proxy: { keyId: string; secret: string }): boolean =>
  proxy.keyId.trim() !== '' && proxy.secret.trim() !== '';

const kvRemoteBuildCloudflareValueUrl = (
  creds: { accountId: string; namespaceId: string },
  key: string,
  ttlSeconds?: number
): string => {
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
    creds.accountId
  )}/storage/kv/namespaces/${encodeURIComponent(creds.namespaceId)}/values/${encodeURIComponent(
    key
  )}`;
  if (ttlSeconds === undefined) return base;
  const ttl = Math.max(60, Math.floor(ttlSeconds));
  return ttl > 0 ? `${base}?expiration_ttl=${ttl}` : base;
};

const kvRemoteCfFetch = async (
  apiToken: string,
  url: string,
  init: RequestInit
): Promise<Response> => {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${apiToken}`);
  return fetch(url, {
    ...init,
    headers,
  });
};

const kvRemoteFetchCloudflareNamespacesPage = async (args: {
  apiToken: string;
  accountId: string;
  page: number;
  perPage: number;
  cfFetch: KvRemoteCtx['cfFetch'];
}): Promise<KvRemoteCloudflareNamespacesResponse> => {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
    args.accountId
  )}/storage/kv/namespaces?page=${args.page}&per_page=${args.perPage}`;

  const res = await args.cfFetch(args.apiToken, url, { method: 'GET' });
  const text = await res.text();
  if (!res.ok) {
    throw ErrorFactory.createConnectionError(
      `Cloudflare KV namespaces list failed (${res.status})`,
      {
        status: res.status,
        body: text,
      }
    );
  }

  try {
    return JSON.parse(text) as KvRemoteCloudflareNamespacesResponse;
  } catch {
    throw ErrorFactory.createConnectionError(
      'Cloudflare KV namespaces list returned invalid JSON',
      {
        body: text,
      }
    );
  }
};

const kvRemoteResolveNamespaceIdFromPage = (
  parsed: KvRemoteCloudflareNamespacesResponse,
  title: string
): string => {
  const found = (parsed.result ?? []).find((ns) => ns.title === title);
  return typeof found?.id === 'string' ? found.id.trim() : '';
};

const kvRemoteResolveTotalPagesFromPage = (
  parsed: KvRemoteCloudflareNamespacesResponse
): number => {
  const raw = Number(parsed.result_info?.total_pages ?? 1);
  return Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 1;
};

const kvRemoteFindNamespaceIdByTitle = async (args: {
  apiToken: string;
  accountId: string;
  namespaceTitle: string;
  cfFetch: KvRemoteCtx['cfFetch'];
}): Promise<string | null> => {
  const perPage = 100;
  const first = await kvRemoteFetchCloudflareNamespacesPage({
    apiToken: args.apiToken,
    accountId: args.accountId,
    page: 1,
    perPage,
    cfFetch: args.cfFetch,
  });

  const firstId = kvRemoteResolveNamespaceIdFromPage(first, args.namespaceTitle);
  if (firstId !== '') return firstId;

  const maxPages = Math.min(10, kvRemoteResolveTotalPagesFromPage(first));
  if (maxPages <= 1) return null;

  const remainingPages = Array.from({ length: maxPages - 1 }, (_, i) => i + 2);
  const out = await Promise.all(
    remainingPages.map(async (page) =>
      kvRemoteFetchCloudflareNamespacesPage({
        apiToken: args.apiToken,
        accountId: args.accountId,
        page,
        perPage,
        cfFetch: args.cfFetch,
      })
    )
  );

  for (const page of out) {
    const id = kvRemoteResolveNamespaceIdFromPage(page, args.namespaceTitle);
    if (id !== '') return id;
  }
  return null;
};

const createKvRemoteCloudflareNamespaceIdResolver = (args: {
  getCloudflareCreds: () => KvRemoteCloudflareCreds;
  cfFetch: KvRemoteCtx['cfFetch'];
}): (() => Promise<string>) => {
  let cachedNamespaceId: string | null = null;
  let cachedNamespaceTitle: string | null = null;
  let cachedAccountId: string | null = null;

  return async (): Promise<string> => {
    const creds = args.getCloudflareCreds();
    if (creds.namespaceId !== '') return creds.namespaceId;

    if (
      cachedNamespaceId !== null &&
      cachedNamespaceTitle === creds.namespaceTitle &&
      cachedAccountId === creds.accountId
    ) {
      return cachedNamespaceId;
    }

    if (creds.namespaceTitle === '') {
      throw ErrorFactory.createConfigError(
        'Cloudflare KV namespace id is missing (KV_NAMESPACE_ID) and no namespace title is provided (KV_NAMESPACE)'
      );
    }

    const resolved = await kvRemoteFindNamespaceIdByTitle({
      apiToken: creds.apiToken,
      accountId: creds.accountId,
      namespaceTitle: creds.namespaceTitle,
      cfFetch: args.cfFetch,
    });
    if (resolved === null) {
      throw ErrorFactory.createConfigError('Cloudflare KV namespace not found', {
        namespaceTitle: creds.namespaceTitle,
      });
    }

    cachedNamespaceId = resolved;
    cachedNamespaceTitle = creds.namespaceTitle;
    cachedAccountId = creds.accountId;
    return resolved;
  };
};

const kvRemoteCreateRemoteSettings = (proxy: KvRemoteProxySettings): RemoteSignedJsonSettings => ({
  baseUrl: proxy.baseUrl,
  keyId: proxy.keyId,
  secret: proxy.secret,
  timeoutMs: proxy.timeoutMs,
  signaturePathPrefixToStrip: resolveSigningPrefix(proxy.baseUrl),
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

const kvRemoteNormalizeNamespace = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const kvRemoteIsRevokedViaCloudflareApi = async (
  ctx: KvRemoteCtx,
  id: string,
  meta?: Record<string, unknown>
): Promise<boolean> => {
  const creds = ctx.getCloudflareCreds();
  const namespaceId = await ctx.resolveCloudflareNamespaceId();
  const url = ctx.buildCloudflareValueUrl(
    { accountId: creds.accountId, namespaceId },
    `${ctx.keyPrefix}${id}`
  );
  const res = await ctx.cfFetch(creds.apiToken, url, { method: 'GET' });
  if (res.status === 404) return false;
  if (!res.ok) {
    const text = await res.text();
    const warnMeta: Record<string, unknown> = {
      status: res.status,
      body: text,
    };
    if (meta) Object.assign(warnMeta, meta);
    logWarnBestEffort('TokenRevocation kv-remote (Cloudflare API) check failed', warnMeta);
    return false;
  }
  const value = await res.text();
  return value.trim() !== '';
};

const kvRemoteIsRevokedViaProxy = async (
  ctx: KvRemoteCtx,
  proxy: KvRemoteProxySettings,
  id: string
): Promise<boolean> => {
  const remote = ctx.createRemoteSettings(proxy);
  const out = await RemoteSignedJson.request<KvGetResponse>(remote, '/zin/kv/get', {
    namespace: ctx.normalizeNamespace(ctx.namespace),
    key: `${ctx.keyPrefix}${id}`,
    type: 'text',
  });
  return out.value !== null && out.value !== undefined && String(out.value).trim() !== '';
};

const kvRemoteRevokeViaCloudflareApi = async (
  ctx: KvRemoteCtx,
  key: RevocationKey,
  ttlSeconds: number,
  meta?: Record<string, unknown>
): Promise<void> => {
  const creds = ctx.getCloudflareCreds();
  const namespaceId = await ctx.resolveCloudflareNamespaceId();
  const url = ctx.buildCloudflareValueUrl(
    { accountId: creds.accountId, namespaceId },
    `${ctx.keyPrefix}${key.id}`,
    ttlSeconds
  );
  const res = await ctx.cfFetch(creds.apiToken, url, {
    method: 'PUT',
    headers: { 'content-type': 'text/plain' },
    body: '1',
  });
  if (res.ok) return;

  const text = await res.text();
  const warnMeta: Record<string, unknown> = {
    status: res.status,
    body: text,
  };
  if (meta) Object.assign(warnMeta, meta);
  logWarnBestEffort('TokenRevocation kv-remote (Cloudflare API) revoke failed', warnMeta);
};

const createKvRemoteRevoke =
  (ctx: KvRemoteCtx) =>
  async (key: RevocationKey): Promise<void> => {
    const ttlMs = Math.max(0, key.expiresAtMs - Date.now());
    if (ttlMs === 0) return;
    const ttlSeconds = Math.max(60, Math.ceil(ttlMs / 1000));

    const proxy = ctx.getProxySettings();
    const shouldUseCloudflareApiFirst =
      !ctx.hasProxySigningCreds(proxy) && ctx.hasCloudflareApiCreds();
    if (shouldUseCloudflareApiFirst) {
      await kvRemoteRevokeViaCloudflareApi(ctx, key, ttlSeconds);
      return;
    }

    try {
      const remote = ctx.createRemoteSettings(proxy);
      await RemoteSignedJson.request<KvPutResponse>(remote, '/zin/kv/put', {
        namespace: ctx.normalizeNamespace(ctx.namespace),
        key: `${ctx.keyPrefix}${key.id}`,
        value: '1',
        ttlSeconds,
      });
    } catch (error) {
      if (ctx.hasCloudflareApiCreds()) {
        await kvRemoteRevokeViaCloudflareApi(ctx, key, ttlSeconds, {
          proxyError: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      throw error;
    }
  };

const createKvRemoteIsRevoked =
  (ctx: KvRemoteCtx) =>
  async (id: string): Promise<boolean> => {
    const proxy = ctx.getProxySettings();
    const shouldUseCloudflareApiFirst =
      !ctx.hasProxySigningCreds(proxy) && ctx.hasCloudflareApiCreds();
    if (shouldUseCloudflareApiFirst) return kvRemoteIsRevokedViaCloudflareApi(ctx, id);

    try {
      return await kvRemoteIsRevokedViaProxy(ctx, proxy, id);
    } catch (error) {
      if (ctx.hasCloudflareApiCreds()) {
        return kvRemoteIsRevokedViaCloudflareApi(ctx, id, {
          proxyError: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  };

const createKvRemoteStore = (params: {
  keyPrefix: string;
  namespace: string;
}): TokenRevocationStore => {
  const getCloudflareCreds = kvRemoteGetCloudflareCreds;
  const cfFetch = kvRemoteCfFetch;
  const resolveCloudflareNamespaceId = createKvRemoteCloudflareNamespaceIdResolver({
    getCloudflareCreds,
    cfFetch,
  });

  const ctx: KvRemoteCtx = {
    keyPrefix: params.keyPrefix,
    namespace: params.namespace,
    getProxySettings: kvRemoteGetProxySettings,
    getCloudflareCreds,
    hasCloudflareApiCreds: () => kvRemoteHasCloudflareApiCreds(getCloudflareCreds),
    hasProxySigningCreds: kvRemoteHasProxySigningCreds,
    buildCloudflareValueUrl: kvRemoteBuildCloudflareValueUrl,
    cfFetch,
    resolveCloudflareNamespaceId,
    createRemoteSettings: kvRemoteCreateRemoteSettings,
    normalizeNamespace: kvRemoteNormalizeNamespace,
  };

  return {
    revoke: createKvRemoteRevoke(ctx),
    isRevoked: createKvRemoteIsRevoked(ctx),
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
