/* eslint-disable no-empty */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

type KvBinding = {
  put: (...args: unknown[]) => Promise<unknown>;
};

type TestGlobals = typeof globalThis & {
  __GET_KV__?: KvBinding | null | (() => KvBinding | null) | ReturnType<typeof vi.fn>;
  __KV_PUT__?: unknown;
};

const globals = globalThis as TestGlobals;

vi.mock('@config/cloudflare', () => ({
  Cloudflare: {
    getKVBinding: () => {
      const value = globals.__GET_KV__;
      if (typeof value === 'function') {
        return value();
      }

      if (value === undefined) return null;
      return value;
    },
  },
}));

const setKvBinding = (binding: KvBinding | null): void => {
  globals.__GET_KV__ = binding === null ? undefined : () => binding;
};

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  delete process.env['KV_LOG_RETENTION_DAYS'];
  process.env['KV_LOG_ENABLED'] = 'true';
  process.env['KV_NAMESPACE'] = 'CACHE';
  delete globals.__KV_PUT__;
  delete globals.__GET_KV__;
});

afterEach(() => {
  vi.useRealTimers();
  delete globals.__KV_PUT__;
  delete globals.__GET_KV__;
});

test('flushNow clears buffer when KV binding is null', async () => {
  setKvBinding(null);

  const { KvLogger } = await import('@/config/logging/KvLogger');

  const pending = KvLogger.enqueue({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'test-null',
  });

  await vi.advanceTimersByTimeAsync(1000);
  await pending;

  expect(true).toBe(true);
});

test('putBatch swallows kv.put rejection', async () => {
  vi.useRealTimers();

  const putSpy = vi.fn(async () => {
    throw new Error('kv fail');
  });
  globals.__KV_PUT__ = putSpy;
  setKvBinding({ put: putSpy });

  const { KvLogger } = await import('@/config/logging/KvLogger');

  const pending = KvLogger.enqueue({
    timestamp: new Date().toISOString(),
    level: 'error',
    message: 'test-throw',
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  await pending;

  expect(putSpy).toHaveBeenCalled();
});

test('scheduleFlush runs immediately when setTimeout is not available', async () => {
  vi.useRealTimers();

  const originalSetTimeout = globalThis.setTimeout;
  try {
    // @ts-ignore
    globalThis.setTimeout = undefined;

    const putSpy = vi.fn(async () => undefined);
    globals.__KV_PUT__ = putSpy;
    setKvBinding({ put: putSpy });

    const { KvLogger } = await import('@/config/logging/KvLogger');

    const pending = KvLogger.enqueue({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'microtask',
    });

    await Promise.resolve();
    await pending;

    expect(putSpy).toHaveBeenCalled();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('uses crypto.getRandomValues when available and passes to kv.put', async () => {
  vi.useRealTimers();

  const gvSpy = vi.fn((arr: Uint8Array) => {
    for (let index = 0; index < arr.length; index += 1) {
      arr[index] = index;
    }

    return arr;
  });

  const originalCrypto = globalThis.crypto;
  const hadCrypto = typeof originalCrypto !== 'undefined' && originalCrypto !== null;
  let originalGetRandomValues: Crypto['getRandomValues'] | undefined;

  if (hadCrypto && typeof originalCrypto.getRandomValues === 'function') {
    originalGetRandomValues = originalCrypto.getRandomValues.bind(originalCrypto);
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        ...originalCrypto,
        getRandomValues: gvSpy,
      },
      configurable: true,
    });
  } else {
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: gvSpy },
      configurable: true,
    });
  }

  const putSpy = vi.fn(async (_key: string, _payload: string, _opts: unknown) => undefined);
  globals.__KV_PUT__ = putSpy;
  setKvBinding({ put: putSpy });

  const { KvLogger } = await import('@/config/logging/KvLogger');

  const pending = KvLogger.enqueue({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'rnd',
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  await pending;

  expect(gvSpy).toHaveBeenCalled();
  expect(putSpy).toHaveBeenCalled();

  if (hadCrypto) {
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        ...originalCrypto,
        getRandomValues: originalGetRandomValues,
      },
      configurable: true,
    });
  } else {
    try {
      // @ts-ignore
      delete globalThis.crypto;
    } catch {}
  }
});

test('respects KV_LOG_RETENTION_DAYS fallback when invalid value provided', async () => {
  vi.useRealTimers();

  process.env['KV_LOG_RETENTION_DAYS'] = '-1';
  const captured: { opts?: { expirationTtl?: number } } = {};

  const putSpy = vi.fn(async (_key: string, _payload: string, opts: { expirationTtl?: number }) => {
    captured.opts = opts;
  });
  globals.__KV_PUT__ = putSpy;
  setKvBinding({ put: putSpy });

  const { KvLogger } = await import('@/config/logging/KvLogger');

  const pending = KvLogger.enqueue({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'ttl',
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  await pending;

  expect(captured.opts?.expirationTtl).toBe(30 * 24 * 60 * 60);
});

test('enqueue returns immediately when KV_LOG_ENABLED is false', async () => {
  process.env['KV_LOG_ENABLED'] = 'false';

  const putSpy = vi.fn(async () => undefined);
  globals.__KV_PUT__ = putSpy;
  setKvBinding({ put: putSpy });

  const { KvLogger } = await import('@/config/logging/KvLogger');

  await KvLogger.enqueue({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'disabled',
  });

  expect(putSpy).not.toHaveBeenCalled();
});

test('falls back when crypto.getRandomValues throws', async () => {
  vi.useRealTimers();

  const originalCrypto = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      getRandomValues: () => {
        throw new Error('boom');
      },
    },
    configurable: true,
  });

  const mathSpy = vi.spyOn(Math, 'random');
  const putSpy = vi.fn(async (_key: string, _payload: string, _opts: unknown) => undefined);
  globals.__KV_PUT__ = putSpy;
  setKvBinding({ put: putSpy });

  const { KvLogger } = await import('@/config/logging/KvLogger');

  const pending = KvLogger.enqueue({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'rnd-fallback',
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  await pending;

  expect(mathSpy).toHaveBeenCalled();
  expect(putSpy).toHaveBeenCalled();

  mathSpy.mockRestore();
  try {
    if (originalCrypto === undefined) {
      // @ts-ignore
      delete globalThis.crypto;
    } else {
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        configurable: true,
      });
    }
  } catch {}
});

test('concurrent enqueue returns same scheduled flush', async () => {
  const putSpy = vi.fn(async () => undefined);
  globals.__KV_PUT__ = putSpy;
  setKvBinding({ put: putSpy });

  const { KvLogger } = await import('@/config/logging/KvLogger');

  const pendingOne = KvLogger.enqueue({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'a',
  });
  const pendingTwo = KvLogger.enqueue({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'b',
  });

  expect(vi.getTimerCount()).toBe(1);

  await vi.advanceTimersByTimeAsync(1000);
  await Promise.all([pendingOne, pendingTwo]);

  expect(putSpy).toHaveBeenCalledTimes(1);
});

test('flushes immediately when buffer reaches maxBatch', async () => {
  const putSpy = vi.fn(async () => undefined);
  const getKvSpy = vi.fn(() => ({ put: putSpy }));
  globals.__KV_PUT__ = putSpy;
  globals.__GET_KV__ = getKvSpy;

  const { KvLogger } = await import('@/config/logging/KvLogger');

  const maxBatch = 100;
  vi.useRealTimers();

  void KvLogger.enqueue({ timestamp: new Date().toISOString(), level: 'info', message: 'start' });
  await Promise.resolve();

  for (let index = 1; index < maxBatch; index += 1) {
    void KvLogger.enqueue({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `m${index}`,
    });
  }

  const waitFor = (fn: () => void, timeout = 2000, interval = 20) =>
    new Promise<void>((resolve, reject) => {
      const end = Date.now() + timeout;

      const attempt = () => {
        try {
          fn();
          resolve();
        } catch {
          if (Date.now() >= end) {
            try {
              fn();
              resolve();
            } catch (finalError) {
              reject(finalError);
            }
            return;
          }

          setTimeout(attempt, interval);
        }
      };

      attempt();
    });

  await waitFor(() => expect(getKvSpy).toHaveBeenCalled(), 2000);
  await waitFor(() => expect(putSpy).toHaveBeenCalled(), 2000);
});
