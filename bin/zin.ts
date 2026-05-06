#!/usr/bin/env -S node --import tsx

/**
 * ZinTrust CLI Shortcut - 'zin'
 * Mirrors bin/zintrust.ts for convenience
 */

const importCliWrapperZin = async (): Promise<any> => {
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

const { runCliWrapper } = await importCliWrapperZin();

await runCliWrapper();
