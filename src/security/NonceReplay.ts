export type NonceReplayVerifier = (keyId: string, nonce: string, ttlMs: number) => Promise<boolean>;

export type MemoryNonceReplayOptions = {
  /**
   * @deprecated Cleanup is now time-gated; retained for API compatibility.
   */
  cleanupEvery?: number;
  /**
   * Maximum nonce entries to keep before forcing a cleanup sweep.
   * Default: 25_000.
   */
  maxEntries?: number;
};

type NonceEntry = {
  expiresAtMs: number;
};

const DEFAULTS: Required<MemoryNonceReplayOptions> = {
  cleanupEvery: 500,
  maxEntries: 25_000,
} as const;

/** Sweep expired nonces at most once per minute instead of on every request. */
const CLEANUP_INTERVAL_MS = 60_000;

export const NonceReplay = Object.freeze({
  /**
   * In-memory, best-effort replay protection.
   *
   * DEV-ONLY / best-effort: state is per-process and in-memory, so it cannot
   * stop replays across instances or isolates. For production, supply a
   * verifier backed by an atomic store (Redis `SET NX PX` / KV / Durable Object).
   */
  createMemoryVerifier(options: MemoryNonceReplayOptions = {}): NonceReplayVerifier {
    const maxEntries = Math.max(1, options.maxEntries ?? DEFAULTS.maxEntries);

    const store = new Map<string, NonceEntry>();
    let nextCleanupAt = 0;

    const cleanup = (nowMs: number): void => {
      for (const [key, entry] of store.entries()) {
        if (entry.expiresAtMs <= nowMs) store.delete(key);
      }
    };

    return async (keyId: string, nonce: string, ttlMs: number): Promise<boolean> => {
      const nowMs = Date.now();

      // Time-gated sweep: no full Map walk on the hot path.
      if (nowMs >= nextCleanupAt) {
        cleanup(nowMs);
        nextCleanupAt = nowMs + CLEANUP_INTERVAL_MS;
      }

      const expiresAtMs = nowMs + Math.max(1, ttlMs);
      const compositeKey = `${keyId}:${nonce}`;

      // The get/set pair below is synchronous, so it is an atomic critical
      // section within this single-process store (no `await` between them).
      const existing = store.get(compositeKey);
      if (existing !== undefined && existing.expiresAtMs > nowMs) {
        await Promise.resolve();
        return false;
      }

      // Hard cap: Map preserves insertion order, so evict the oldest entry.
      if (store.size >= maxEntries) {
        const oldest = store.keys().next();
        if (oldest.done !== true) store.delete(oldest.value);
      }

      store.set(compositeKey, { expiresAtMs });

      await Promise.resolve();
      return true;
    };
  },
});

export default NonceReplay;
