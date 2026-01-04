/**
 * KV Logger
 * Writes batches of log events to a KV namespace (Cloudflare Workers compatible)
 *
 * Enabled via env:
 *  - KV_LOG_ENABLED (default: false)
 *  - KV_NAMESPACE (binding name; default: 'CACHE')
 *  - KV_LOG_RETENTION_DAYS (default: 30)
 */

import { Cloudflare } from '../cloudflare';
import { Env } from '../env';

export type KvLogEvent = {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  category?: string;
  data?: unknown;
  error?: string;
};

type KVNamespace = NonNullable<ReturnType<typeof Cloudflare.getKVBinding>>;

type PutOptions = { expiration?: number; expirationTtl?: number; metadata?: unknown };

const getRetentionTtlSeconds = (): number => {
  const days = Env.getInt('KV_LOG_RETENTION_DAYS', 30);
  const safeDays = Number.isFinite(days) && days > 0 ? days : 30;
  return safeDays * 24 * 60 * 60;
};

const getKvBindingName = (): string => {
  const name = Env.get('KV_NAMESPACE', 'CACHE').trim();
  return name.length > 0 ? name : 'CACHE';
};

const isEnabled = (): boolean => Env.getBool('KV_LOG_ENABLED', false);

const safeRandom = (): string => {
  try {
    // Prefer crypto if available
    const cryptoObj = (globalThis as unknown as { crypto?: Crypto }).crypto;
    if (cryptoObj?.getRandomValues) {
      const bytes = new Uint8Array(8);
      cryptoObj.getRandomValues(bytes);
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // fall through
  }
  const generate = Math.random().toString(16).slice(2); // NOSONAR
  const fallback = generate + Math.random().toString(16).slice(2); // NOSONAR this is not used for security
  return fallback;
};

const buildKey = (timestampIso: string): string => {
  const date = timestampIso.slice(0, 10);
  const hour = timestampIso.slice(11, 13);
  return `logs:${date}:${hour}:${safeRandom()}`;
};

let buffer: KvLogEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushPromise: Promise<void> | undefined;

const scheduleFlush = async (): Promise<void> => {
  if (flushPromise !== undefined) return flushPromise;

  // Fixed small batching window to reduce KV write volume.
  const windowMs = 1000;

  const promise = new Promise<void>((resolve) => {
    const run = async (): Promise<void> => {
      try {
        await flushNow();
      } finally {
        resolve(undefined);
      }
    };

    if (typeof globalThis.setTimeout !== 'function') {
      // microtask-ish
      void run();
      return;
    }

    flushTimer = globalThis.setTimeout(() => {
      flushTimer = undefined;
      void run();
    }, windowMs);
  });

  flushPromise = promise.finally(() => {
    flushPromise = undefined;
  });

  return flushPromise;
};

const getKv = (): KVNamespace | null => {
  const bindingName = getKvBindingName();
  return Cloudflare.getKVBinding(bindingName);
};

const putBatch = async (kv: KVNamespace, events: KvLogEvent[]): Promise<void> => {
  if (events.length === 0) return;

  const timestamp = events.at(-1)?.timestamp ?? new Date().toISOString();
  const key = buildKey(timestamp);

  const payload = JSON.stringify({
    version: 1,
    createdAt: new Date().toISOString(),
    count: events.length,
    events,
  });

  const opts: PutOptions = { expirationTtl: getRetentionTtlSeconds() };

  await kv.put(key, payload, opts);
};

const flushNow = async (): Promise<void> => {
  if (!isEnabled()) {
    buffer = [];
    return;
  }

  const kv = getKv();
  if (kv === null) {
    buffer = [];
    return;
  }

  const toSend = buffer;
  buffer = [];

  try {
    await putBatch(kv, toSend);
  } catch {
    // Best-effort: never throw from logging.
  }
};

const flushSoon = async (): Promise<void> => {
  if (flushPromise !== undefined) return flushPromise;

  flushPromise = Promise.resolve()
    .then(async () => flushNow())
    .finally(() => {
      flushPromise = undefined;
    });

  return flushPromise;
};

export const KvLogger = Object.freeze({
  async enqueue(event: KvLogEvent): Promise<void> {
    if (!isEnabled()) return Promise.resolve();

    buffer.push(event);

    // Basic size guard: flush if it gets too large
    const maxBatch = 100;
    if (buffer.length >= maxBatch) {
      // Cancel scheduled flush and flush immediately
      if (flushTimer !== undefined) {
        globalThis.clearTimeout(flushTimer);
        flushTimer = undefined;
      }
      return flushSoon();
    }

    return scheduleFlush();
  },
});

export default KvLogger;
