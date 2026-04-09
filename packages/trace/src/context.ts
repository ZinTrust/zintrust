/**
 * TraceContext — sealed namespace for batch_id, userId, hostname, and memory.
 * Piggybacks on RequestContext (already available in core) — no new ALS store.
 */
type RequestContextProvider = {
  current?: () => unknown;
  peek?: () => unknown;
};

// Lazy reference to ZinTrust RequestContext — typed as unknown to stay runtime-agnostic.
let _reqCtx: RequestContextProvider | undefined;

const getRequestContext = (): RequestContextProvider | undefined => {
  return _reqCtx;
};

const setRequestContextImpl = (impl: RequestContextProvider): void => {
  _reqCtx = impl;
};

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> => {
  return typeof value === 'object' && value !== null && 'then' in value;
};

const getCurrentContext = (): Record<string, unknown> | undefined => {
  const provider = getRequestContext();
  if (!provider) return undefined;

  let currentValue: unknown;

  if (typeof provider.peek === 'function') {
    currentValue = provider.peek();
  } else if (typeof provider.current === 'function') {
    currentValue = provider.current();
  } else {
    currentValue = undefined;
  }

  if (isPromiseLike(currentValue)) return undefined;
  if (typeof currentValue !== 'object' || currentValue === null) return undefined;

  return currentValue as Record<string, unknown>;
};

const getContextString = (key: 'traceId' | 'userId' | 'path'): string | undefined => {
  const value = getCurrentContext()?.[key];
  if (typeof value === 'string' && value.trim() !== '') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
};

const getBatchId = (): string => {
  return getContextString('traceId') ?? crypto.randomUUID();
};

const getUserId = (): string | undefined => {
  return getContextString('userId');
};

const getRequestPath = (): string | undefined => {
  return getContextString('path');
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

export const TraceContext = Object.freeze({
  getBatchId,
  getUserId,
  getRequestPath,
  getHostname,
  getMemory,
  now,
  setRequestContextImpl,
});
