import { ZintrustLang } from '@lang/lang';

const isNodeRuntime = (): boolean => {
  // Avoid importing any `node:*` modules so this file remains Worker-safe.
  // In Workers/Deno, `process` is typically undefined.

  return (
    typeof process !== ZintrustLang.UNDEFINED &&
    typeof process === ZintrustLang.OBJECT &&
    process !== null &&
    typeof (process as unknown as { versions?: unknown }).versions === ZintrustLang.OBJECT
  );
};

const fileUrlToPathLike = (value: string): string => {
  if (!value.startsWith(ZintrustLang.FILE_PROTOCOL)) return value;
  // Basic file URL decoding (sufficient for macOS/Linux paths).
  try {
    return decodeURIComponent(value.slice(ZintrustLang.FILE_PROTOCOL.length));
  } catch {
    return value.slice(ZintrustLang.FILE_PROTOCOL.length);
  }
};

export const isNodeMain = (importMetaUrl: string): boolean => {
  if (!isNodeRuntime()) return false;

  const argv1 = (process as unknown as { argv?: unknown }).argv;
  const scriptPath = Array.isArray(argv1) ? String(argv1[1] ?? '') : '';
  if (scriptPath === '') return false;

  const here = fileUrlToPathLike(importMetaUrl);
  if (scriptPath === here) return true;

  // Best-effort: handle relative argv paths and runner wrappers.
  return scriptPath.endsWith(here);
};

/**
 * Start the Node server (dev/prod) by delegating to the framework bootstrap.
 *
 * This uses a non-literal dynamic import so Worker bundlers don't pull Node-only modules.
 */
export const start = async (): Promise<void> => {
  if (!isNodeRuntime()) return;

  // Compiled output places bootstrap at `dist/src/boot/bootstrap.js`.
  // This file compiles to `dist/src/start.js`, so relative import is stable.
  // In unit tests, importing bootstrap has heavy side effects (starts server + exits).
  await import('./boot/' + ZintrustLang.BOOTSTRAPJS);
};

/**
 * Cloudflare Workers entry (module worker style).
 */
export { default } from '@functions/cloudflare';

export { default as cloudflareWorker } from '@functions/cloudflare';

/**
 * Deno fetch handler.
 */
export { default as deno } from '@functions/deno';

/**
 * AWS Lambda handler.
 */
export { handler } from '@functions/lambda';
