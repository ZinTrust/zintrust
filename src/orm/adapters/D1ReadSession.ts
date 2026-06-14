/**
 * D1 read-replication session scoping.
 *
 * Opens a D1 Sessions API handle and scopes it to the async context running a
 * unit of work, so the D1 adapter can transparently route statements through
 * the session while it is active. Falls back to direct-to-primary execution
 * when the bound database has no `withSession` (replication disabled).
 *
 * Works in both `zin s` (Node) and `zin s --wg` (Workers): it lazily upgrades
 * to `AsyncLocalStorage` when available and otherwise uses a synchronous
 * single-slot fallback, mirroring `@http/RequestContext`.
 */

import type {
  D1ReadConstraint,
  ID1Database,
  ID1DatabaseSession,
} from '@orm/DatabaseAdapter';

export interface D1SessionHandle {
  readonly db: ID1DatabaseSession;
  getBookmark(): string | null;
}

/**
 * Open a session against the bound database, or `null` when the binding does
 * not support read replication (then reads simply come from the primary).
 */
export const openSession = (
  d1: ID1Database,
  constraint: D1ReadConstraint
): D1SessionHandle | null => {
  if (typeof d1.withSession !== 'function') return null;
  const session = d1.withSession(constraint);
  return { db: session, getBookmark: () => session.getBookmark() ?? null };
};

interface StoreApi {
  run<T>(store: D1SessionHandle, callback: () => T): T;
  getStore(): D1SessionHandle | undefined;
}

const createFallbackStorage = (): StoreApi => {
  let store: D1SessionHandle | undefined;
  return {
    run<T>(handle: D1SessionHandle, callback: () => T): T {
      const prev = store;
      store = handle;
      try {
        return callback();
      } finally {
        store = prev;
      }
    },
    getStore(): D1SessionHandle | undefined {
      return store;
    },
  };
};

let alsClassPromise: Promise<(new () => StoreApi) | null> | null = null;

const loadAsyncLocalStorage = async (): Promise<(new () => StoreApi) | null> => {
  alsClassPromise ??= import('@node-singletons/async_hooks')
    .then((mod) => (mod as unknown as { AsyncLocalStorage?: new () => StoreApi }).AsyncLocalStorage ?? null)
    .catch(() => null);
  return alsClassPromise;
};

export interface ReadSessionScope {
  /** Run `fn` with `handle` bound to the current async context. */
  run<T>(handle: D1SessionHandle, fn: () => Promise<T>): Promise<T>;
  /** Read the session bound to the current async context, if any. */
  peek(): D1SessionHandle | undefined;
}

/**
 * Create an independent session scope. One per adapter instance keeps separate
 * database connections from sharing session state.
 */
export const createReadSessionScope = (): ReadSessionScope => {
  let storage: StoreApi = createFallbackStorage();
  const ready = loadAsyncLocalStorage()
    .then((AsyncLocalStorage) => {
      if (AsyncLocalStorage !== null) storage = new AsyncLocalStorage();
    })
    .catch(() => undefined);

  return {
    async run<T>(handle: D1SessionHandle, fn: () => Promise<T>): Promise<T> {
      await ready;
      return storage.run(handle, fn);
    },
    peek(): D1SessionHandle | undefined {
      return storage.getStore();
    },
  };
};
