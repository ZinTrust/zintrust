#!/usr/bin/env -S node --import tsx

/**
 * ZinTrust CLI - Main Entry Point
 *
 * This bin script is a thin wrapper around the hashbang-free implementation in
 * bin/zintrust-main.ts. Keeping the implementation hashbang-free allows other
 * shortcuts (zin/z/zt) to reuse the same launcher behavior.
 */

const importCliWrapper = async (): Promise<any> => {
  try {
    return await import(new URL('./launcher.ts', import.meta.url).href);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      (error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND'
    ) {
      throw error;
    }

    return import(new URL('./launcher.js', import.meta.url).href);
  }
};

const { runCliWrapper } = await importCliWrapper();

await runCliWrapper();
