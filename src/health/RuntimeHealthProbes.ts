/**
 * Runtime Health Probes
 *
 * Lightweight dependency probes intended for readiness endpoints.
 *
 * NOTE: Startup probes are handled separately by StartupHealthChecks.
 */

import { Cloudflare } from '@config/cloudflare';
import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';

const getCacheDriverName = (): string => {
  return Env.get('CACHE_DRIVER', 'memory');
};

const withTimeout = async <T>(label: string, ms: number, fn: () => Promise<T>): Promise<T> => {
  if (!Number.isFinite(ms) || ms <= 0) {
    return fn();
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      reject(ErrorFactory.createConfigError(`${label} timed out after ${ms}ms`, { label, ms }));
    }, ms);

    // Node: allow process to exit; other runtimes may not support unref()
    if (typeof (timeoutId as unknown as { unref?: unknown }).unref === 'function') {
      (timeoutId as unknown as { unref: () => void }).unref();
    }
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  }
};

const pingKvCache = async (timeoutMs = 2000): Promise<number | null> => {
  const driver = getCacheDriverName();
  if (driver !== 'kv') return null;

  const start = Date.now();

  const kv = Cloudflare.getKVBinding('CACHE');
  if (kv === null) {
    throw ErrorFactory.createConfigError('KV binding "CACHE" not found');
  }

  const key = `__runtime_health__:kv:${Date.now()}`;

  await withTimeout('runtime.cache.kv.ping', timeoutMs, async () => {
    await kv.put(key, JSON.stringify({ ok: true }), { expirationTtl: 60 });
    const value = (await kv.get(key, { type: 'json' })) as { ok?: boolean } | null;
    if (value?.ok !== true) {
      throw ErrorFactory.createConnectionError('KV probe failed: unexpected value');
    }
    await kv.delete(key);
  });

  return Date.now() - start;
};

export const RuntimeHealthProbes = Object.freeze({
  getCacheDriverName,
  pingKvCache,
});

export default RuntimeHealthProbes;
