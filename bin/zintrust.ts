#!/usr/bin/env -S npx tsx

/**
 * Zintrust CLI - Main Entry Point
 * Command-line interface for Zintrust framework
 * Usage: zintrust [command] [options]
 * Shortcuts: zin, z
 */

async function main(): Promise<void> {
  try {
    const { EnvFileLoader } = await import('@cli/utils/EnvFileLoader');
    EnvFileLoader.ensureLoaded();

    const { CLI } = await import('@cli/CLI');

    const cli = CLI.create();
    await cli.run(process.argv.slice(2));
  } catch (error) {
    try {
      const { Logger } = await import('@config/logger');
      Logger.error('CLI execution failed', error);
    } catch {
      // best-effort logging
    }

    try {
      const { ErrorHandler } = await import('@cli/ErrorHandler');
      ErrorHandler.handle(error as Error);
    } catch {
      // best-effort error handling
    }
    process.exit(1);
  }
}

await main().catch(async (error) => {
  try {
    const { Logger } = await import('@config/logger');
    Logger.error('CLI fatal error', error);
  } catch {
    // best-effort logging
  }

  try {
    const { ErrorHandler } = await import('@cli/ErrorHandler');
    ErrorHandler.handle(error as Error);
  } catch {
    // best-effort error handling
  }

  process.exit(1);
});
export {};
