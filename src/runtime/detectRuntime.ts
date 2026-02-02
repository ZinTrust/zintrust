import { ZintrustLang } from '@lang/lang';

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
