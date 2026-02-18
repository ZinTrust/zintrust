/**
 * KV Remote Cache Driver
 *
 * Calls a ZinTrust Cloudflare Worker KV proxy over HTTPS.
 */

import type { CacheDriver } from '@cache/CacheDriver';
import { RemoteSignedJson, type RemoteSignedJsonSettings } from '@common/RemoteSignedJson';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';

type KvValueType = 'text' | 'json' | 'arrayBuffer';

type KvGetResponse = { value: unknown };
type KvPutResponse = { ok: true };
type KvDeleteResponse = { ok: true };

type KvRemoteSettings = {
  baseUrl: string;
  keyId: string;
  secret: string;
  defaultNamespace: string;
  timeoutMs: number;
};

type CloudflareKvCreds = {
  accountId: string;
  apiToken: string;
  namespaceId: string;
  namespaceTitle: string;
};

type CloudflareNamespacesResponse = {
  success?: boolean;
  result?: Array<{ id?: string; title?: string }>;
  result_info?: { page?: number; total_pages?: number };
  errors?: unknown;
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

const normalizeNamespace = (defaultNamespace: string): string | undefined =>
  defaultNamespace.trim() === '' ? undefined : defaultNamespace;

const getSettings = (): KvRemoteSettings => ({
  baseUrl: Env.get('KV_REMOTE_URL'),
  keyId: Env.get('KV_REMOTE_KEY_ID'),
  secret: Env.get('KV_REMOTE_SECRET', Env.APP_KEY),
  defaultNamespace: Env.get('KV_REMOTE_NAMESPACE'),
  timeoutMs: Env.getInt('ZT_PROXY_TIMEOUT_MS', Env.REQUEST_TIMEOUT),
});

const getCloudflareCreds = (): CloudflareKvCreds => ({
  accountId: Env.get('KV_ACCOUNT_ID', Env.get('CLOUDFLARE_ACCOUNT_ID', '')).trim(),
  apiToken: Env.get('KV_API_TOKEN', Env.get('CLOUDFLARE_API_TOKEN', '')).trim(),
  namespaceId: Env.get('KV_NAMESPACE_ID', Env.get('CLOUDFLARE_KV_NAMESPACE_ID', '')).trim(),
  namespaceTitle: Env.get('KV_NAMESPACE', '').trim(),
});

const hasCloudflareApiCreds = (): boolean => {
  const creds = getCloudflareCreds();
  const hasNamespace = creds.namespaceId !== '' || creds.namespaceTitle !== '';
  return creds.accountId !== '' && creds.apiToken !== '' && hasNamespace;
};

const hasProxySigningCreds = (settings: KvRemoteSettings): boolean =>
  settings.keyId.trim() !== '' && settings.secret.trim() !== '';

const buildCloudflareValueUrl = (
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

const cfFetch = async (apiToken: string, url: string, init: RequestInit): Promise<Response> => {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${apiToken}`);
  return fetch(url, { ...init, headers });
};

const parseJsonOrThrow = <T>(text: string, message: string): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw ErrorFactory.createConnectionError(message, { body: text });
  }
};

const listNamespacesPage = async (params: {
  accountId: string;
  apiToken: string;
  page: number;
  perPage: number;
}): Promise<{ namespaces: Array<{ id: string; title: string }>; totalPages: number }> => {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
    params.accountId
  )}/storage/kv/namespaces?page=${params.page}&per_page=${params.perPage}`;

  const res = await cfFetch(params.apiToken, url, { method: 'GET' });
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

  const parsed = parseJsonOrThrow<CloudflareNamespacesResponse>(
    text,
    'Cloudflare KV namespaces list returned invalid JSON'
  );

  const namespaces = (parsed.result ?? [])
    .map((ns) => ({
      id: typeof ns.id === 'string' ? ns.id.trim() : '',
      title: typeof ns.title === 'string' ? ns.title.trim() : '',
    }))
    .filter((ns) => ns.id !== '' && ns.title !== '');

  const totalPages = Number(parsed.result_info?.total_pages ?? 1);
  return {
    namespaces,
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1,
  };
};

const findNamespaceIdByTitle = (
  namespaces: Array<{ id: string; title: string }>,
  title: string
): string | null => {
  const found = namespaces.find((ns) => ns.title === title);
  return found?.id ?? null;
};

const createRemoteSettings = (settings: KvRemoteSettings): RemoteSignedJsonSettings => ({
  baseUrl: settings.baseUrl,
  keyId: settings.keyId,
  secret: settings.secret,
  timeoutMs: settings.timeoutMs,
  signaturePathPrefixToStrip: resolveSigningPrefix(settings.baseUrl),
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

const fetchAllNamespaces = async (params: {
  accountId: string;
  apiToken: string;
}): Promise<Array<{ id: string; title: string }>> => {
  const first = await listNamespacesPage({
    accountId: params.accountId,
    apiToken: params.apiToken,
    page: 1,
    perPage: 100,
  });

  if (first.totalPages <= 1) return first.namespaces;

  const pages = Array.from({ length: first.totalPages - 1 }, (_v, idx) => idx + 2);
  const rest = await Promise.all(
    pages.map(async (page) =>
      listNamespacesPage({
        accountId: params.accountId,
        apiToken: params.apiToken,
        page,
        perPage: 100,
      })
    )
  );

  return first.namespaces.concat(...rest.map((r) => r.namespaces));
};

const createCloudflareNamespaceIdResolver = (): (() => Promise<string>) => {
  let cachedNamespaceId: string | null = null;
  let cachedNamespaceTitle: string | null = null;
  let cachedAccountId: string | null = null;

  return async (): Promise<string> => {
    const creds = getCloudflareCreds();
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

    const all = await fetchAllNamespaces({ accountId: creds.accountId, apiToken: creds.apiToken });
    const match = findNamespaceIdByTitle(all, creds.namespaceTitle);
    if (match === null) {
      throw ErrorFactory.createConfigError('Cloudflare KV namespace not found', {
        namespaceTitle: creds.namespaceTitle,
      });
    }

    cachedNamespaceId = match;
    cachedNamespaceTitle = creds.namespaceTitle;
    cachedAccountId = creds.accountId;
    return match;
  };
};

const createCloudflareKvApiClient = (
  resolveNamespaceId: () => Promise<string>
): {
  getJson: <T>(key: string) => Promise<T | null>;
  putJson: (key: string, value: unknown, ttlSeconds?: number) => Promise<void>;
  deleteKey: (key: string) => Promise<void>;
} => {
  const getJson = async <T>(key: string): Promise<T | null> => {
    const creds = getCloudflareCreds();
    const namespaceId = await resolveNamespaceId();
    const url = buildCloudflareValueUrl({ accountId: creds.accountId, namespaceId }, key);
    const res = await cfFetch(creds.apiToken, url, { method: 'GET' });
    if (res.status === 404) return null;
    const text = await res.text();
    if (!res.ok) {
      throw ErrorFactory.createConnectionError(`Cloudflare KV GET failed (${res.status})`, {
        status: res.status,
        body: text,
      });
    }
    if (text.trim() === '') return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  };

  const putJson = async (key: string, value: unknown, ttlSeconds?: number): Promise<void> => {
    const creds = getCloudflareCreds();
    const namespaceId = await resolveNamespaceId();
    const url = buildCloudflareValueUrl(
      { accountId: creds.accountId, namespaceId },
      key,
      ttlSeconds
    );
    const body = JSON.stringify(value);
    const res = await cfFetch(creds.apiToken, url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const text = await res.text();
    if (!res.ok) {
      throw ErrorFactory.createConnectionError(`Cloudflare KV PUT failed (${res.status})`, {
        status: res.status,
        body: text,
      });
    }
  };

  const deleteKey = async (key: string): Promise<void> => {
    const creds = getCloudflareCreds();
    const namespaceId = await resolveNamespaceId();
    const url = buildCloudflareValueUrl({ accountId: creds.accountId, namespaceId }, key);
    const res = await cfFetch(creds.apiToken, url, { method: 'DELETE' });
    const text = await res.text();
    if (!res.ok && res.status !== 404) {
      throw ErrorFactory.createConnectionError(`Cloudflare KV DELETE failed (${res.status})`, {
        status: res.status,
        body: text,
      });
    }
  };

  return { getJson, putJson, deleteKey };
};

const createKvRemoteDriver = (): CacheDriver => {
  const resolveNamespaceId = createCloudflareNamespaceIdResolver();
  const cf = createCloudflareKvApiClient(resolveNamespaceId);

  return {
    async get<T>(key: string): Promise<T | null> {
      const settings = getSettings();
      if (!hasProxySigningCreds(settings) && hasCloudflareApiCreds()) return cf.getJson<T>(key);

      try {
        const remote = createRemoteSettings(settings);
        const out = await RemoteSignedJson.request<KvGetResponse>(remote, '/zin/kv/get', {
          namespace: normalizeNamespace(settings.defaultNamespace),
          key,
          type: 'json' satisfies KvValueType,
        });
        return (out.value as T | null) ?? null;
      } catch (error) {
        if (!hasCloudflareApiCreds()) throw error;
        Logger.warn('KV remote proxy GET failed; falling back to Cloudflare KV API', {
          error: error instanceof Error ? error.message : String(error),
        });
        return cf.getJson<T>(key);
      }
    },

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
      const settings = getSettings();
      if (!hasProxySigningCreds(settings) && hasCloudflareApiCreds()) {
        await cf.putJson(key, value, ttl);
        return;
      }

      try {
        const remote = createRemoteSettings(settings);
        await RemoteSignedJson.request<KvPutResponse>(remote, '/zin/kv/put', {
          namespace: normalizeNamespace(settings.defaultNamespace),
          key,
          value,
          ttlSeconds: ttl,
        });
      } catch (error) {
        if (!hasCloudflareApiCreds()) throw error;
        Logger.warn('KV remote proxy PUT failed; falling back to Cloudflare KV API', {
          error: error instanceof Error ? error.message : String(error),
        });
        await cf.putJson(key, value, ttl);
      }
    },

    async delete(key: string): Promise<void> {
      const settings = getSettings();
      if (!hasProxySigningCreds(settings) && hasCloudflareApiCreds()) {
        await cf.deleteKey(key);
        return;
      }

      try {
        const remote = createRemoteSettings(settings);
        await RemoteSignedJson.request<KvDeleteResponse>(remote, '/zin/kv/delete', {
          namespace: normalizeNamespace(settings.defaultNamespace),
          key,
        });
      } catch (error) {
        if (!hasCloudflareApiCreds()) throw error;
        Logger.warn('KV remote proxy DELETE failed; falling back to Cloudflare KV API', {
          error: error instanceof Error ? error.message : String(error),
        });
        await cf.deleteKey(key);
      }
    },

    async clear(): Promise<void> {
      Logger.warn('KV remote clear() is not implemented.');
      await Promise.resolve();
    },

    async has(key: string): Promise<boolean> {
      if (!hasCloudflareApiCreds()) return (await this.get(key)) !== null;
      const settings = getSettings();
      if (!hasProxySigningCreds(settings)) return (await cf.getJson<unknown>(key)) !== null;
      return (await this.get(key)) !== null;
    },
  };
};

export const KVRemoteDriver = Object.freeze({
  create: createKvRemoteDriver,
});

export default KVRemoteDriver;
