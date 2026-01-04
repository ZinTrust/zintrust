/**
 * KV Remote Cache Driver
 *
 * Calls a Zintrust Cloudflare Worker KV proxy over HTTPS.
 */

import type { CacheDriver } from '@cache/CacheDriver';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { SignedRequest } from '@security/SignedRequest';

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

const joinUrl = (baseUrl: string, path: string): URL => {
  const u = new URL(baseUrl);
  const basePath = u.pathname.endsWith('/') ? u.pathname.slice(0, -1) : u.pathname;
  const next = path.startsWith('/') ? path : `/${path}`;
  u.pathname = `${basePath}${next}`;
  u.search = '';
  return u;
};

const asJson = async (resp: Response): Promise<unknown> => {
  const text = await resp.text();
  if (text.trim() === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
};

const requireConfigured = (settings: KvRemoteSettings): void => {
  if (settings.baseUrl.trim() === '') {
    throw ErrorFactory.createConfigError('KV remote proxy URL is missing (KV_REMOTE_URL)');
  }
  if (settings.keyId.trim() === '' || settings.secret.trim() === '') {
    throw ErrorFactory.createConfigError(
      'KV remote signing credentials are missing (KV_REMOTE_KEY_ID / KV_REMOTE_SECRET)'
    );
  }
};

const createTimeoutSignal = (timeoutMs: number): AbortSignal | undefined => {
  if (timeoutMs <= 0) return undefined;
  const timeout = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout;
  return typeof timeout === 'function' ? timeout(timeoutMs) : undefined;
};

const normalizeNamespace = (defaultNamespace: string): string | undefined =>
  defaultNamespace.trim() === '' ? undefined : defaultNamespace;

const requestJson = async <T>(
  settings: KvRemoteSettings,
  path: string,
  payload: Record<string, unknown>
): Promise<T> => {
  requireConfigured(settings);

  const url = joinUrl(settings.baseUrl, path);
  const body = JSON.stringify(payload);
  const signed = await SignedRequest.createHeaders({
    method: 'POST',
    url,
    body,
    keyId: settings.keyId,
    secret: settings.secret,
  });

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...signed },
      body,
      signal: createTimeoutSignal(settings.timeoutMs),
    });

    if (!resp.ok) {
      const details = await asJson(resp);
      if (resp.status === 401) {
        throw ErrorFactory.createUnauthorizedError('KV remote proxy unauthorized', details);
      }
      if (resp.status === 403) {
        throw ErrorFactory.createForbiddenError('KV remote proxy forbidden', details);
      }
      if (resp.status === 429) {
        throw ErrorFactory.createSecurityError('KV remote proxy rate limited', details);
      }
      if (resp.status >= 400 && resp.status < 500) {
        throw ErrorFactory.createValidationError('KV remote proxy rejected request', details);
      }
      throw ErrorFactory.createConnectionError('KV remote proxy error', {
        status: resp.status,
        details,
      });
    }

    return (await asJson(resp)) as T;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw ErrorFactory.createConnectionError('KV remote proxy request timed out', {
        timeoutMs: settings.timeoutMs,
      });
    }
    throw error;
  }
};

export const KVRemoteDriver = Object.freeze({
  create(): CacheDriver {
    const settings: KvRemoteSettings = {
      baseUrl: Env.get('KV_REMOTE_URL'),
      keyId: Env.get('KV_REMOTE_KEY_ID'),
      secret: Env.get('KV_REMOTE_SECRET'),
      defaultNamespace: Env.get('KV_REMOTE_NAMESPACE'),
      timeoutMs: Env.getInt('ZT_PROXY_TIMEOUT_MS', Env.REQUEST_TIMEOUT),
    };

    return {
      async get<T>(key: string): Promise<T | null> {
        const out = await requestJson<KvGetResponse>(settings, '/zin/kv/get', {
          namespace: normalizeNamespace(settings.defaultNamespace),
          key,
          type: 'json' satisfies KvValueType,
        });
        return (out.value as T | null) ?? null;
      },

      async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        await requestJson<KvPutResponse>(settings, '/zin/kv/put', {
          namespace: normalizeNamespace(settings.defaultNamespace),
          key,
          value,
          ttlSeconds: ttl,
        });
      },

      async delete(key: string): Promise<void> {
        await requestJson<KvDeleteResponse>(settings, '/zin/kv/delete', {
          namespace: normalizeNamespace(settings.defaultNamespace),
          key,
        });
      },

      async clear(): Promise<void> {
        // KV proxy does not implement clear() (and KV itself does not support full namespace wipe efficiently).
        Logger.warn('KV remote clear() is not implemented.');
        await Promise.resolve();
      },

      async has(key: string): Promise<boolean> {
        const value = await this.get(key);
        return value !== null;
      },
    };
  },
});

export default KVRemoteDriver;
