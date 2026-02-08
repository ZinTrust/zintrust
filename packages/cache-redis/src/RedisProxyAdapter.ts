import { Env, ErrorFactory, Logger, SignedRequest } from '@zintrust/core';
import type { CacheDriver } from './index.js';

type ProxySettings = {
  baseUrl: string;
  keyId?: string;
  secret?: string;
  timeoutMs: number;
};

type ProxyResponse<T> = {
  result: T;
};

const resolveBaseUrl = (): string => {
  const explicit = Env.get('REDIS_PROXY_URL', '').trim();
  if (explicit !== '') return explicit;
  const host = Env.get('REDIS_PROXY_HOST', '127.0.0.1');
  const port = Env.getInt('REDIS_PROXY_PORT', 8791);
  return `http://${host}:${port}`;
};

const buildProxySettings = (): ProxySettings => {
  const baseUrl = resolveBaseUrl();
  const rawKeyId = Env.get('REDIS_PROXY_KEY_ID', '').trim();
  const fallbackKeyId = (Env.APP_NAME ?? 'zintrust').trim().toLowerCase().replaceAll(/\s+/g, '_');
  const keyId = (rawKeyId === '' ? fallbackKeyId : rawKeyId) || undefined;
  const secret = Env.get('REDIS_PROXY_SECRET', '') || Env.APP_KEY || undefined;
  const timeoutMs = Env.getInt('REDIS_PROXY_TIMEOUT_MS', Env.ZT_PROXY_TIMEOUT_MS);

  return { baseUrl, keyId, secret, timeoutMs };
};

const buildHeaders = async (
  settings: ProxySettings,
  url: string,
  body: string
): Promise<Record<string, string>> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (settings.keyId && settings.secret) {
    const signed = await SignedRequest.createHeaders({
      method: 'POST',
      url,
      body,
      keyId: settings.keyId,
      secret: settings.secret,
    });
    Object.assign(headers, signed);
  } else {
    Logger.warn('[redis-proxy] Proxy signing disabled; sending unsigned request.');
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
  const url = `${settings.baseUrl}${path}`;
  const headers = await buildHeaders(settings, url, body);

  const timeoutSignal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal;
  const signal = timeoutSignal ? AbortSignal.timeout(settings.timeoutMs) : undefined;

  const response = await fetch(url, {
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

export const RedisProxyAdapter = Object.freeze({
  create(): CacheDriver {
    const settings = buildProxySettings();

    const sendCommand = async <T>(command: string, args: unknown[]): Promise<T> => {
      const response = await requestProxy<ProxyResponse<T>>(settings, '/zin/redis/command', {
        command,
        args,
      });
      return response.result;
    };

    return {
      async get<T>(key: string): Promise<T | null> {
        const result = await sendCommand<string | null>('GET', [key]);
        if (result === null) return null;
        try {
          return JSON.parse(result) as T;
        } catch {
          return null;
        }
      },

      async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        const json = JSON.stringify(value);
        if (Number.isFinite(ttl) && (ttl ?? 0) > 0) {
          await sendCommand('SET', [key, json, 'EX', ttl]);
        } else {
          await sendCommand('SET', [key, json]);
        }
      },

      async delete(key: string): Promise<void> {
        await sendCommand('DEL', [key]);
      },

      async clear(): Promise<void> {
        await sendCommand('FLUSHDB', []);
      },

      async has(key: string): Promise<boolean> {
        const result = await sendCommand<unknown>('EXISTS', [key]);
        return toNumber(result) > 0;
      },
    };
  },
});

export default RedisProxyAdapter;
