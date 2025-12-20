#!/usr/bin/env node

/**
 * Zintrust CLI - Main Entry Point
 * Command-line interface for Zintrust framework
 * Usage: zintrust [command] [options]
 * Shortcuts: zin, z
 */

import { CLI } from '@cli/CLI';
import { ErrorHandler } from '@cli/ErrorHandler';

async function main(): Promise<void> {
  try {
    const cli = new CLI();
    await cli.run(process.argv.slice(2));
  } catch (error) {
    ErrorHandler.handle(error as Error);
    process.exit(1);
  }
}

await main().catch((error) => {
  ErrorHandler.handle(error as Error);
  process.exit(1);
});
