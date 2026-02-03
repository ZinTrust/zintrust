/**
 * KV Remote Cache Driver
 *
 * Calls a ZinTrust Cloudflare Worker KV proxy over HTTPS.
 */

import type { CacheDriver } from '@cache/CacheDriver';
import { RemoteSignedJson, type RemoteSignedJsonSettings } from '@common/RemoteSignedJson';
import { Env } from '@config/env';
import { Logger } from '@config/logger';

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

const normalizeNamespace = (defaultNamespace: string): string | undefined =>
  defaultNamespace.trim() === '' ? undefined : defaultNamespace;

export const KVRemoteDriver = Object.freeze({
  create(): CacheDriver {
    const settings: KvRemoteSettings = {
      baseUrl: Env.get('KV_REMOTE_URL'),
      keyId: Env.get('KV_REMOTE_KEY_ID'),
      secret: Env.get('KV_REMOTE_SECRET', Env.APP_KEY),
      defaultNamespace: Env.get('KV_REMOTE_NAMESPACE'),
      timeoutMs: Env.getInt('ZT_PROXY_TIMEOUT_MS', Env.REQUEST_TIMEOUT),
    };

    const remote: RemoteSignedJsonSettings = {
      baseUrl: settings.baseUrl,
      keyId: settings.keyId,
      secret: settings.secret,
      timeoutMs: settings.timeoutMs,
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

    return {
      async get<T>(key: string): Promise<T | null> {
        const out = await RemoteSignedJson.request<KvGetResponse>(remote, '/zin/kv/get', {
          namespace: normalizeNamespace(settings.defaultNamespace),
          key,
          type: 'json' satisfies KvValueType,
        });
        return (out.value as T | null) ?? null;
      },

      async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        await RemoteSignedJson.request<KvPutResponse>(remote, '/zin/kv/put', {
          namespace: normalizeNamespace(settings.defaultNamespace),
          key,
          value,
          ttlSeconds: ttl,
        });
      },

      async delete(key: string): Promise<void> {
        await RemoteSignedJson.request<KvDeleteResponse>(remote, '/zin/kv/delete', {
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
