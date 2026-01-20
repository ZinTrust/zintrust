const isNodeRuntime = (): boolean => {
  // Avoid importing any `node:*` modules so this file remains Worker-safe.
  // In Workers/Deno, `process` is typically undefined.

  return (
    typeof process !== 'undefined' &&
    typeof process === 'object' &&
    process !== null &&
    typeof (process as unknown as { versions?: unknown }).versions === 'object'
  );
};

const fileUrlToPathLike = (value: string): string => {
  if (!value.startsWith('file://')) return value;
  // Basic file URL decoding (sufficient for macOS/Linux paths).
  try {
    return decodeURIComponent(value.slice('file://'.length));
  } catch {
    return value.slice('file://'.length);
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
  /* c8 ignore start */
  if (!isNodeRuntime()) return;

  // Compiled output places bootstrap at `dist/src/boot/bootstrap.js`.
  // This file compiles to `dist/src/start.js`, so relative import is stable.
  // In unit tests, importing bootstrap has heavy side effects (starts server + exits).
  await import('./boot/' + 'bootstrap.js');
  /* c8 ignore stop */
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
