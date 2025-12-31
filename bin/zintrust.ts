#!/usr/bin/env -S npx tsx

/**
 * Zintrust CLI - Main Entry Point
 * Command-line interface for Zintrust framework
 * Usage: zintrust [command] [options]
 * Shortcuts: zin, z
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const loadPackageVersionFast = (): string => {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const packagePath = path.join(here, '../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { version?: string };
    return typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
};

async function main(): Promise<void> {
  try {
    // Fast path: print version and exit without bootstrapping the CLI.
    // This keeps `zin -v` / `zin --version` snappy and avoids any debug output.
    const rawArgs0 = process.argv.slice(2);
    const args0 =
      rawArgs0.length > 0 &&
      (rawArgs0[0]?.endsWith('.ts') === true || rawArgs0[0]?.endsWith('.js') === true)
        ? rawArgs0.slice(1)
        : rawArgs0;

    if (args0.includes('-v') || args0.includes('--version')) {
      process.stdout.write(`${loadPackageVersionFast()}\n`);
      return;
    }

    const { EnvFileLoader } = await import('@cli/utils/EnvFileLoader');
    EnvFileLoader.ensureLoaded();

    const { CLI } = await import('@cli/CLI');

    const cli = CLI.create();

    // When executing via tsx (e.g. `npx tsx bin/zin.ts ...`), the script path can
    // appear as the first element of `process.argv.slice(2)`. Commander expects
    // args to start at the command name, so we strip a leading script path if present.
    const rawArgs = process.argv.slice(2);

    if (process.env['ZINTRUST_CLI_DEBUG_ARGS'] === '1' && rawArgs.includes('--verbose')) {
      try {
        process.stderr.write(`[zintrust-cli] process.argv=${JSON.stringify(process.argv)}\n`);
        process.stderr.write(`[zintrust-cli] rawArgs=${JSON.stringify(rawArgs)}\n`);
      } catch {
        // ignore
      }
    }

    const args =
      rawArgs.length > 0 &&
      (rawArgs[0]?.endsWith('.ts') === true || rawArgs[0]?.endsWith('.js') === true)
        ? rawArgs.slice(1)
        : rawArgs;

    await cli.run(args);
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
