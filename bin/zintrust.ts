#!/usr/bin/env -S npx tsx

/**
 * Zintrust CLI - Main Entry Point
 * Command-line interface for Zintrust framework
 * Usage: zintrust [command] [options]
 * Shortcuts: zin, z
 */

import { CLI } from '@cli/CLI.js';
import { ErrorHandler } from '@cli/ErrorHandler.js';
import { Logger } from '@config/logger.js';

async function main(): Promise<void> {
  try {
    const cli = new CLI();
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
