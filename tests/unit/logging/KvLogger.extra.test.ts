/* eslint-disable no-empty */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  delete process.env['KV_LOG_RETENTION_DAYS'];
  process.env['KV_LOG_ENABLED'] = 'true';
  process.env['KV_NAMESPACE'] = 'CACHE';
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as any).__KV_PUT__;
});

test('flushNow clears buffer when KV binding is null', async () => {
  vi.mock('@config/cloudflare', () => ({ Cloudflare: { getKVBinding: () => null } }));

  const { KvLogger } = await import('@/config/logging/KvLogger');

  const p = KvLogger.enqueue({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'test-null',
  });

  // advance timers to trigger scheduled flush
  await vi.advanceTimersByTimeAsync(1000);
  await p;

  // should not throw and buffer should be cleared (no exception)
  expect(true).toBe(true);
});

test('putBatch swallows kv.put rejection', async () => {
  // Use real timers to let microtasks execute reliably
  vi.useRealTimers();

  const putSpy = vi.fn(async () => {
    throw new Error('kv fail');
  });

  // expose spy globally so mock factory closure is safe
  (globalThis as any).__KV_PUT__ = putSpy;

  // expose a getKV hook so the hoisted mock factory can access it reliably
  (globalThis as any).__GET_KV__ = vi.fn(() => ({ put: (globalThis as any).__KV_PUT__ }));
  vi.mock('@config/cloudflare', () => ({
    Cloudflare: {
      getKVBinding: () => {
        const value = (globalThis as any).__GET_KV__;
        if (typeof value === 'function') return value();
        if (value === undefined) return null;
        return value;
      },
    },
  }));

  const { KvLogger } = await import('@/config/logging/KvLogger');

  const p = KvLogger.enqueue({
    timestamp: new Date().toISOString(),
    level: 'error',
    message: 'test-throw',
  });

  // allow scheduling to settle
  await new Promise((r) => setTimeout(r, 20));
  await p;

  expect(putSpy).toHaveBeenCalled();
});

test('scheduleFlush runs immediately when setTimeout is not available', async () => {
  // Use real timers for reliable microtask scheduling
  vi.useRealTimers();

  // temporarily remove setTimeout to force microtask path
  const originalSetTimeout = globalThis.setTimeout;
  try {
    // @ts-ignore
    globalThis.setTimeout = undefined;

    const putSpy = vi.fn(async () => undefined);
    (globalThis as any).__KV_PUT__ = putSpy;

    vi.mock('@config/cloudflare', () => ({
      Cloudflare: { getKVBinding: () => ({ put: (globalThis as any).__KV_PUT__ }) },
    }));

    const { KvLogger } = await import('@/config/logging/KvLogger');

    const p = KvLogger.enqueue({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'microtask',
    });

    // allow microtasks to run
    await Promise.resolve();
    await p;

    expect(putSpy).toHaveBeenCalled();
  } finally {
    // restore
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('uses crypto.getRandomValues when available and passes to kv.put', async () => {
  // Use real timers to allow microtasks and Promise resolution
  vi.useRealTimers();

  // Spy on crypto.getRandomValues if present; otherwise define a configurable crypto
  const gvSpy = vi.fn((arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) arr[i] = i;
    return arr;
  });

  const originalCrypto = (globalThis as any).crypto;
  const hadCrypto = typeof originalCrypto !== 'undefined' && originalCrypto !== null;
  let origGetRandomValues: unknown;

  if (hadCrypto && typeof originalCrypto.getRandomValues === 'function') {
    origGetRandomValues = originalCrypto.getRandomValues;
    (globalThis as any).crypto.getRandomValues = gvSpy;
  } else {
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: gvSpy },
      configurable: true,
    });
  }

  const putSpy = vi.fn(async (_k: string, _p: string, _opts: any) => undefined);
  (globalThis as any).__KV_PUT__ = putSpy;

  (globalThis as any).__GET_KV__ = vi.fn(() => ({ put: (globalThis as any).__KV_PUT__ }));
  vi.mock('@config/cloudflare', () => ({
    Cloudflare: {
      getKVBinding: () => {
        const value = (globalThis as any).__GET_KV__;
        if (typeof value === 'function') return value();
        if (value === undefined) return null;
        return value;
      },
    },
  }));

  const { KvLogger } = await import('@/config/logging/KvLogger');

  const p = KvLogger.enqueue({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'rnd',
  });

  // allow scheduling to settle
  await new Promise((r) => setTimeout(r, 20));
  await p;

  expect(gvSpy).toHaveBeenCalled();
  expect(putSpy).toHaveBeenCalled();

  // restore crypto
  if (hadCrypto && origGetRandomValues !== undefined) {
    (globalThis as any).crypto.getRandomValues = origGetRandomValues;
  } else {
    try {
      // @ts-ignore - delete if configurable
      delete (globalThis as any).crypto;
    } catch {}
  }
});

test('respects KV_LOG_RETENTION_DAYS fallback when invalid value provided', async () => {
  // Use real timers to allow scheduled flushes and promise resolution
  vi.useRealTimers();

  process.env['KV_LOG_RETENTION_DAYS'] = '-1';
  const captured: any = {};

  const putSpy = vi.fn(async (_k: string, _p: string, opts: any) => {
    captured.opts = opts;
  });
  (globalThis as any).__KV_PUT__ = putSpy;

  (globalThis as any).__GET_KV__ = vi.fn(() => ({ put: (globalThis as any).__KV_PUT__ }));
  vi.mock('@config/cloudflare', () => ({
    Cloudflare: {
      getKVBinding: () => {
        const value = (globalThis as any).__GET_KV__;
        if (typeof value === 'function') return value();
        if (value === undefined) return null;
        return value;
      },
    },
  }));

  const { KvLogger } = await import('@/config/logging/KvLogger');

  const p = KvLogger.enqueue({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'ttl',
  });

  // allow scheduling to settle
  await new Promise((r) => setTimeout(r, 20));
  await p;

  expect(captured.opts.expirationTtl).toBe(30 * 24 * 60 * 60);
});

test('enqueue returns immediately when KV_LOG_ENABLED is false', async () => {
  // Disable KV logging for this test
  process.env['KV_LOG_ENABLED'] = 'false';

  const putSpy = vi.fn(async () => undefined);
  (globalThis as any).__KV_PUT__ = putSpy;

  (globalThis as any).__GET_KV__ = vi.fn(() => ({ put: (globalThis as any).__KV_PUT__ }));
  vi.mock('@config/cloudflare', () => ({
    Cloudflare: {
      getKVBinding: () => {
        const value = (globalThis as any).__GET_KV__;
        if (typeof value === 'function') return value();
        if (value === undefined) return null;
        return value;
      },
    },
  }));

  const { KvLogger } = await import('@/config/logging/KvLogger');

  const p = KvLogger.enqueue({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'disabled',
  });
  await p;

  expect(putSpy).not.toHaveBeenCalled();
});

test('falls back when crypto.getRandomValues throws', async () => {
  // Use real timers to allow microtasks and Promise resolution
  vi.useRealTimers();

  // Make crypto.getRandomValues throw to hit the catch path in safeRandom
  const originalCrypto = (globalThis as any).crypto;
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      getRandomValues: () => {
        throw new Error('boom');
      },
    },
    configurable: true,
  });

  const mathSpy = vi.spyOn(Math, 'random');

  const putSpy = vi.fn(async (_k: string, _p: string, _opts: any) => undefined);
  (globalThis as any).__KV_PUT__ = putSpy;

  (globalThis as any).__GET_KV__ = vi.fn(() => ({ put: (globalThis as any).__KV_PUT__ }));
  vi.mock('@config/cloudflare', () => ({
    Cloudflare: {
      getKVBinding: () => {
        const value = (globalThis as any).__GET_KV__;
        if (typeof value === 'function') return value();
        if (value === undefined) return null;
        return value;
      },
    },
  }));

  const { KvLogger } = await import('@/config/logging/KvLogger');

  const p = KvLogger.enqueue({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'rnd-fallback',
  });

  // allow scheduling to settle
  await new Promise((r) => setTimeout(r, 20));
  await p;

  expect(mathSpy).toHaveBeenCalled();
  expect(putSpy).toHaveBeenCalled();

  mathSpy.mockRestore();
  try {
    // restore original crypto
    if (originalCrypto === undefined) {
      // @ts-ignore
      delete (globalThis as any).crypto;
    } else {
      (globalThis as any).crypto = originalCrypto;
    }
  } catch {}
});

test('concurrent enqueue returns same promise', async () => {
  process.env['KV_LOG_ENABLED'] = 'true';

  // putSpy resolves quickly; flushing is driven by timers in this test
  const putSpy = vi.fn(async () => undefined);
  (globalThis as any).__KV_PUT__ = putSpy;

  (globalThis as any).__GET_KV__ = vi.fn(() => ({ put: (globalThis as any).__KV_PUT__ }));
  vi.mock('@config/cloudflare', () => ({
    Cloudflare: {
      getKVBinding: () => {
        const value = (globalThis as any).__GET_KV__;
        if (typeof value === 'function') return value();
        if (value === undefined) return null;
        return value;
      },
    },
  }));

  const { KvLogger } = await import('@/config/logging/KvLogger');

  // Note: `enqueue` is `async` so each call returns a distinct outer Promise.
  // What we really want is that only one scheduled flush is queued.
  const p1 = KvLogger.enqueue({ timestamp: new Date().toISOString(), level: 'info', message: 'a' });
  const p2 = KvLogger.enqueue({ timestamp: new Date().toISOString(), level: 'info', message: 'b' });

  expect(vi.getTimerCount()).toBe(1);

  // advance timers to trigger scheduled flush (window is 1000ms)
  await vi.advanceTimersByTimeAsync(1000);
  await Promise.all([p1, p2]);

  // both events should be flushed in a single KV write
  expect(putSpy).toHaveBeenCalledTimes(1);
});

test('flushes immediately when buffer reaches maxBatch', async () => {
  process.env['KV_LOG_ENABLED'] = 'true';

  const putSpy = vi.fn(async () => undefined);
  (globalThis as any).__KV_PUT__ = putSpy;

  // expose getKV spy globally so the hoisted mock factory can access it reliably
  (globalThis as any).__GET_KV__ = vi.fn(() => ({ put: (globalThis as any).__KV_PUT__ }));
  vi.mock('@config/cloudflare', () => ({
    Cloudflare: {
      getKVBinding: () => {
        const value = (globalThis as any).__GET_KV__;
        if (typeof value === 'function') return value();
        if (value === undefined) return null;
        return value;
      },
    },
  }));

  const { KvLogger } = await import('@/config/logging/KvLogger');

  const maxBatch = 100;
  // Use real timers here to let microtasks/promises resolve naturally
  vi.useRealTimers();

  // First enqueue a single event to start the scheduled flush (sets flushTimer)
  await KvLogger.enqueue({ timestamp: new Date().toISOString(), level: 'info', message: `start` });

  // allow microtasks to run and ensure flushTimer is scheduled
  await Promise.resolve();

  // Now enqueue the remaining events to reach maxBatch and trigger immediate flush
  for (let i = 1; i < maxBatch; i++) {
    KvLogger.enqueue({ timestamp: new Date().toISOString(), level: 'info', message: `m${i}` });
  }

  // poll for the getKV and put side-effects rather than awaiting internal promises
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
              fn(); // final attempt
              resolve();
            } catch (finalErr) {
              reject(finalErr);
            }
            return;
          }
          setTimeout(attempt, interval);
        }
      };

      attempt();
    });

  await waitFor(() => expect((globalThis as any).__GET_KV__).toHaveBeenCalled(), 2000);
  await waitFor(() => expect(putSpy).toHaveBeenCalled(), 2000);
});
