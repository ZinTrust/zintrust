/**
 * DebuggerContext — sealed namespace for batch_id, userId, hostname, and memory.
 * Piggybacks on RequestContext (already available in core) — no new ALS store.
 */
// Lazy reference to ZinTrust RequestContext — typed as unknown to stay runtime-agnostic.
let _reqCtx: { current(): unknown } | undefined;

const getRequestContext = (): { current(): unknown } | undefined => {
  return _reqCtx;
};

const setRequestContextImpl = (impl: { current(): unknown }): void => {
  _reqCtx = impl;
};

const getBatchId = (): string => {
  try {
    const ctx = getRequestContext()?.current();
    if (ctx && typeof (ctx as Record<string, unknown>)['traceId'] === 'string') {
      return (ctx as Record<string, unknown>)['traceId'] as string;
    }
  } catch {
    // fall through
  }
  return crypto.randomUUID();
};

const getUserId = (): string | undefined => {
  try {
    const ctx = getRequestContext()?.current();
    if (ctx && typeof (ctx as Record<string, unknown>)['userId'] === 'string') {
      return (ctx as Record<string, unknown>)['userId'] as string;
    }
  } catch {
    // fall through
  }
  return undefined;
};

const getHostname = (): string => {
  // Workers do not expose `os` or `process` — return 'worker' as fallback.
  if (typeof process !== 'undefined' && typeof process.env === 'object') {
    try {
      // Dynamic import avoids the need for a node-singletons wrapper at the type level.
      // Hostname is non-critical; we fall back gracefully.
      const hostname = (process.env as Record<string, string | undefined>)['HOSTNAME'];
      if (typeof hostname === 'string' && hostname.length > 0) return hostname;
    } catch {
      // fall through
    }
    return 'node';
  }
  return 'worker';
};

const getMemory = (): number | null => {
  if (typeof process !== 'undefined' && typeof process.memoryUsage === 'function') {
    try {
      return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    } catch {
      return null;
    }
  }
  return null;
};

const now = (): number => Date.now();

export const DebuggerContext = Object.freeze({
  getBatchId,
  getUserId,
  getHostname,
  getMemory,
  now,
  setRequestContextImpl,
});
