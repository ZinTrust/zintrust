#!/usr/bin/env -S npx tsx

/**
 * Zintrust CLI Shortcut - 'zin'
 * Mirrors bin/zintrust.ts for convenience
 */

import { CLI } from '@cli/CLI';
import { ErrorHandler } from '@cli/ErrorHandler';
import { Logger } from '@config/logger';

async function main(): Promise<void> {
  try {
    const cli = CLI.create();
    await cli.run(process.argv.slice(2));
  } catch (error) {
    Logger.error('CLI execution failed', error);
    ErrorHandler.handle(error as Error);
    process.exit(1);
  }
}

await main().catch((error) => {
  Logger.error('CLI fatal error', error);
  ErrorHandler.handle(error as Error);
  process.exit(1);
});
