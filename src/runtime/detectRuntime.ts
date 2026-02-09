import { ZintrustLang } from '@lang/lang';

export type RuntimeMode = 'cloudflare-workers' | 'containers' | 'node-server';

export const isNodeRuntime = (): boolean => {
  // Avoid importing any `node:*` modules so this file remains Worker-safe.
  // In Workers/Deno, `process` is typically undefined.

  return (
    typeof process !== ZintrustLang.UNDEFINED &&
    typeof process === ZintrustLang.OBJECT &&
    process !== null &&
    typeof (process as unknown as { versions?: unknown }).versions === ZintrustLang.OBJECT
  );
};

const getGlobalThis = (): typeof globalThis | undefined => {
  if (typeof globalThis === ZintrustLang.UNDEFINED) {
    return undefined;
  }

  return globalThis;
};

export const getRuntimeMode = (): RuntimeMode => {
  // 1. Explicit override via env var (if available)
  if (typeof process !== 'undefined' && process.env?.RUNTIME_MODE) {
    return process.env.RUNTIME_MODE as RuntimeMode;
  }

  // 2. Detect Cloudflare Workers
  // @ts-ignore - navigator is available in workers
  if (typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers') {
    return 'cloudflare-workers';
  }

  // 3. Detect Container (Docker/Kubernetes)
  // Usually indicated by specific env vars or filesystem characteristics,
  // but simpler to assume Node + invalidating CF check = Node/Container
  if (isNodeRuntime()) {
    // Check for Docker-specific env vars if possible, or default to containers/node-server
    if (
      typeof process !== 'undefined' &&
      (process.env?.DOCKER || process.env?.KUBERNETES_SERVICE_HOST)
    ) {
      return 'containers';
    }
    return 'node-server';
  }

  // Default fallback
  return 'node-server';
};

export const detectRuntime = (): {
  isCloudflare: boolean;
  isNode: boolean;
  isDeno: boolean;
  isBun: boolean;
} => {
  const globalRef = getGlobalThis();
  const isNode = isNodeRuntime();

  const isCloudflare =
    typeof globalRef !== ZintrustLang.UNDEFINED &&
    globalRef !== null &&
    (((globalRef as { caches?: unknown }).caches !== undefined &&
      typeof (globalRef as { caches?: unknown }).caches !== ZintrustLang.UNDEFINED) ||
      typeof (globalRef as { WebSocketPair?: unknown }).WebSocketPair === 'function' ||
      typeof (globalRef as { CF?: unknown }).CF !== ZintrustLang.UNDEFINED);

  const isDeno =
    typeof globalRef !== ZintrustLang.UNDEFINED &&
    globalRef !== null &&
    typeof (globalRef as { Deno?: unknown }).Deno !== ZintrustLang.UNDEFINED;

  const isBun =
    typeof globalRef !== ZintrustLang.UNDEFINED &&
    globalRef !== null &&
    typeof (globalRef as { Bun?: unknown }).Bun !== ZintrustLang.UNDEFINED;

  return { isCloudflare, isNode, isDeno, isBun };
};
