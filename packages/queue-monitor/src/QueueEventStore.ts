/**
 * QueueEventStore — In-memory queue job counts kept in sync via BullMQ QueueEvents (pub/sub).
 *
 * Eliminates the per-poll `getJobCountsMany()` Redis call by maintaining counters
 * in memory. When BullMQ emits events (completed, failed, active, etc.), counters
 * are atomically adjusted. A periodic 30-second full refresh acts as a safety net.
 *
 * Falls back to polling mode when BullMQ QueueEvents isn't available (e.g., Redis RPC proxy).
 */

import { Env } from '@zintrust/core/config';
import { Logger } from '@zintrust/core/logger';
import { getBullMQSafeQueueName } from '@zintrust/core/redis';
import type { QueueEvents as BullMQQueueEvents, ConnectionOptions } from 'bullmq';
import { createRedisConnection, type RedisConfig } from './connection.js';
import type { QueueDriver } from './driver.js';
import type { QueueCounts, QueueMonitorSnapshot } from './index.js';

// ── Types ────────────────────────────────────────────────────────────────────

type CountsListener = () => void;

type EventDrivenState = {
  mode: 'event-driven';
  queueEvents: Map<string, BullMQQueueEvents>;
  safetyInterval: ReturnType<typeof setInterval> | null;
};

type PollingState = {
  mode: 'polling';
  driver: QueueDriver;
  interval: ReturnType<typeof setInterval> | null;
};

type StoreState = {
  counters: Map<string, QueueCounts>;
  queueNames: Set<string>;
  listeners: Set<CountsListener>;
  startedAt: string;
  redisConfig: RedisConfig | null;
  mode: EventDrivenState | PollingState | null;
};

// ── Constants ────────────────────────────────────────────────────────────────

const SAFETY_REFRESH_MS = 30_000;
const EVENT_DEBOUNCE_MS = 500;

const COUNT_FIELDS = ['waiting', 'active', 'completed', 'failed', 'delayed', 'paused'] as const;

const emptyCounts = (): QueueCounts => ({
  waiting: 0,
  active: 0,
  completed: 0,
  failed: 0,
  delayed: 0,
  paused: 0,
});

// ── Module State ─────────────────────────────────────────────────────────────

let QueueEventsCtor: typeof BullMQQueueEvents | undefined;

const state: StoreState = {
  counters: new Map(),
  queueNames: new Set(),
  listeners: new Set(),
  startedAt: new Date().toISOString(),
  redisConfig: null,
  mode: null,
};

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let isRefreshing = false;

// ── Helpers ──────────────────────────────────────────────────────────────────

const ensureQueueEventsLoaded = async (): Promise<typeof BullMQQueueEvents> => {
  if (QueueEventsCtor !== undefined) return QueueEventsCtor;
  const loaded = (await import('bullmq')).QueueEvents;
  QueueEventsCtor = loaded;
  return loaded;
};

const notifyListeners = (): void => {
  if (debounceTimer !== null) return;
  debounceTimer = globalThis.setTimeout(() => {
    debounceTimer = null;
    for (const listener of state.listeners) {
      try {
        listener();
      } catch (err) {
        Logger.error('[QueueEventStore] Listener error', err);
      }
    }
  }, EVENT_DEBOUNCE_MS);
};

const ensureCountsEntry = (queueName: string): QueueCounts => {
  const existing = state.counters.get(queueName);
  if (existing) return existing;
  const fresh = emptyCounts();
  state.counters.set(queueName, fresh);
  state.queueNames.add(queueName);
  return fresh;
};

const adjustCount = (queueName: string, field: string, delta: number): void => {
  const counts = ensureCountsEntry(queueName);
  const key = field as keyof QueueCounts;
  const current = typeof counts[key] === 'number' ? (counts[key] as number) : 0;
  counts[key] = Math.max(0, current + delta);
};

// ── Event-Driven Mode ────────────────────────────────────────────────────────

const createQueueEventsForQueue = async (
  queueName: string,
  connection: unknown
): Promise<BullMQQueueEvents> => {
  const QECtor = await ensureQueueEventsLoaded();
  const prefix = getBullMQSafeQueueName();
  const qe = new QECtor(queueName, {
    connection: connection as ConnectionOptions,
    prefix,
  });

  qe.on('waiting', () => {
    adjustCount(queueName, 'waiting', 1);
    notifyListeners();
  });

  qe.on('active', ({ prev }: { prev?: string }) => {
    if (prev) adjustCount(queueName, prev, -1);
    adjustCount(queueName, 'active', 1);
    notifyListeners();
  });

  qe.on('completed', ({ prev }: { prev?: string }) => {
    if (prev) adjustCount(queueName, prev, -1);
    adjustCount(queueName, 'completed', 1);
    notifyListeners();
  });

  qe.on('failed', ({ prev }: { prev?: string }) => {
    if (prev) adjustCount(queueName, prev, -1);
    adjustCount(queueName, 'failed', 1);
    notifyListeners();
  });

  // Note: BullMQ v5 `delayed` event does not include `prev`.
  // The safety refresh corrects any counter drift.
  qe.on('delayed', () => {
    adjustCount(queueName, 'delayed', 1);
    notifyListeners();
  });

  qe.on('paused', () => {
    adjustCount(queueName, 'paused', 1);
    notifyListeners();
  });

  qe.on('resumed', () => {
    const counts = state.counters.get(queueName);
    if (counts) counts.paused = 0;
    notifyListeners();
  });

  qe.on('drained', () => {
    // Queue drained — all waiting/active/delayed jobs processed
    const counts = state.counters.get(queueName);
    if (counts) {
      counts.waiting = 0;
      counts.active = 0;
      counts.delayed = 0;
    }
    notifyListeners();
  });

  qe.on('removed', ({ prev }: { prev?: string }) => {
    if (prev) adjustCount(queueName, prev, -1);
    notifyListeners();
  });

  // Handle connection errors gracefully
  qe.on('error', (error: Error) => {
    Logger.warn(`[QueueEventStore] QueueEvents error for "${queueName}"`, error);
  });

  await qe.waitUntilReady();
  return qe;
};

const startEventDrivenMode = async (
  queueNames: string[],
  redisConfig: RedisConfig
): Promise<void> => {
  const connection = createRedisConnection(redisConfig, 3, {
    subsystem: 'queue-event-store',
  });

  const queueEventsMap = new Map<string, BullMQQueueEvents>();
  const results = await Promise.allSettled(
    queueNames.map(async (name) => {
      const qe = await createQueueEventsForQueue(name, connection);
      return { name, qe } as const;
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      queueEventsMap.set(result.value.name, result.value.qe);
    } else {
      Logger.warn('[QueueEventStore] Failed to create QueueEvents', result.reason);
    }
  }

  const safetyInterval = globalThis.setInterval(() => {
    void fullRefresh();
  }, SAFETY_REFRESH_MS);

  state.mode = {
    mode: 'event-driven',
    queueEvents: queueEventsMap,
    safetyInterval,
  };

  Logger.info(`[QueueEventStore] Event-driven mode active for ${queueEventsMap.size} queues`);
};

// ── Polling Fallback Mode ────────────────────────────────────────────────────

const startPollingMode = async (driver: QueueDriver): Promise<void> => {
  if (state.mode?.mode === 'polling') return;

  // Stop any existing mode
  await stopCurrentMode();

  const interval = globalThis.setInterval(() => {
    void fullRefresh();
  }, SAFETY_REFRESH_MS);

  state.mode = {
    mode: 'polling',
    driver,
    interval,
  };

  Logger.info('[QueueEventStore] Polling fallback mode active');
};

// ── Full Refresh ─────────────────────────────────────────────────────────────

const fullRefresh = async (): Promise<void> => {
  if (isRefreshing) return;
  if (state.queueNames.size === 0) return;

  isRefreshing = true;
  try {
    let driver: QueueDriver | undefined;

    if (state.mode?.mode === 'polling') {
      driver = state.mode.driver;
    } else if (state.mode?.mode === 'event-driven' && state.redisConfig) {
      // For event-driven mode, we need a driver for the safety refresh.
      // Import lazily to avoid circular deps.
      const { createBullMQDriver } = await import('./driver.js');
      driver = createBullMQDriver(state.redisConfig);
    }

    if (!driver) {
      isRefreshing = false;
      return;
    }

    const names = Array.from(state.queueNames);
    const stats = await driver.getJobCountsMany(names);

    for (const { name, counts } of stats) {
      const entry = ensureCountsEntry(name);
      for (const field of COUNT_FIELDS) {
        entry[field] = typeof counts[field] === 'number' ? (counts[field] as number) : 0;
      }
    }

    notifyListeners();

    // Clean up driver if we created it temporarily
    if (state.mode?.mode === 'event-driven') {
      await driver.close().catch(() => {});
    }
  } catch (err) {
    Logger.warn('[QueueEventStore] Full refresh failed', err);
  } finally {
    isRefreshing = false;
  }
};

// ── Mode Management ─────────────────────────────────────────────────────────

const stopCurrentMode = async (): Promise<void> => {
  const current = state.mode;
  if (!current) return;

  if (current.mode === 'event-driven') {
    if (current.safetyInterval !== null) {
      globalThis.clearInterval(current.safetyInterval);
    }
    const closes = Array.from(current.queueEvents.values()).map((qe) => qe.close().catch(() => {}));
    await Promise.all(closes);
  } else if (current.mode === 'polling') {
    if (current.interval !== null) {
      globalThis.clearInterval(current.interval);
    }
  }

  state.mode = null;
};

const canUseEventDrivenMode = (): boolean => {
  // Don't use QueueEvents when Redis RPC proxy is active — BullMQ events
  // require a direct Redis connection with pub/sub support.
  if (Env.getBool('USE_REDIS_PROXY', false)) return false;
  if (Env.getBool('QUEUE_EVENT_STORE_POLLING', false)) return false;
  return true;
};

// ── Public API ───────────────────────────────────────────────────────────────

export const QueueEventStore = Object.freeze({
  /**
   * Start tracking queue counts. Seeds initial counts from Redis, then
   * switches to event-driven mode (BullMQ pub/sub) if available, or
   * polling fallback otherwise.
   */
  async start(config: {
    queues: string[];
    redisConfig: RedisConfig;
    driver: QueueDriver;
  }): Promise<void> {
    if (state.mode !== null) return; // Already started

    state.redisConfig = config.redisConfig;
    for (const name of config.queues) {
      state.queueNames.add(name);
    }

    // Seed initial counts from Redis
    if (config.queues.length > 0) {
      try {
        const stats = await config.driver.getJobCountsMany(config.queues);
        for (const { name, counts } of stats) {
          const entry = emptyCounts();
          for (const field of COUNT_FIELDS) {
            entry[field] = typeof counts[field] === 'number' ? (counts[field] as number) : 0;
          }
          state.counters.set(name, entry);
        }
      } catch (err) {
        Logger.warn('[QueueEventStore] Initial seed failed; starting with empty counts', err);
      }
    }

    // Choose mode
    if (canUseEventDrivenMode()) {
      try {
        await startEventDrivenMode(config.queues, config.redisConfig);
        return;
      } catch (err) {
        Logger.warn(
          '[QueueEventStore] Event-driven mode unavailable; falling back to polling',
          err
        );
      }
    }

    await startPollingMode(config.driver);
  },

  /**
   * Returns the current in-memory snapshot.
   */
  getSnapshot(): QueueMonitorSnapshot {
    const queues = Array.from(state.queueNames)
      .sort((l, r) => l.localeCompare(r))
      .map((name) => ({
        name,
        counts: state.counters.get(name) ?? emptyCounts(),
      }));

    return {
      status: 'ok',
      startedAt: state.startedAt,
      queues,
    };
  },

  /**
   * Returns raw in-memory counts map.
   */
  getCounts(): ReadonlyMap<string, QueueCounts> {
    return state.counters;
  },

  /**
   * Subscribe to count changes. Returns unsubscribe function.
   * The listener is debounced (500ms) to batch rapid event sequences.
   */
  subscribe(listener: CountsListener): () => void {
    state.listeners.add(listener);

    // Push initial snapshot immediately
    try {
      listener();
    } catch {
      // Ignore errors in initial push
    }

    return () => {
      state.listeners.delete(listener);
    };
  },

  /**
   * Whether the store has been started and has data.
   */
  isActive(): boolean {
    return state.mode !== null;
  },

  /**
   * Stop all event listeners and timers.
   */
  async stop(): Promise<void> {
    if (debounceTimer !== null) {
      globalThis.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    await stopCurrentMode();
    state.counters.clear();
    state.queueNames.clear();
    state.listeners.clear();
    state.redisConfig = null;
  },
});
