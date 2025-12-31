#!/usr/bin/env -S node --import tsx

/**
 * Zintrust CLI - Main Entry Point
 *
 * This bin script is a thin wrapper around the hashbang-free implementation in
 * bin/zintrust-main.ts. Keeping the implementation hashbang-free allows other
 * shortcuts (zin/z/zt) to import it without parse issues.
 */

import { run } from './zintrust-main';

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

const stripLeadingScriptArg = (rawArgs: string[]): string[] => {
  if (rawArgs.length === 0) return rawArgs;
  const first = rawArgs[0];
  const looksLikeScript =
    typeof first === 'string' && (first.endsWith('.ts') || first.endsWith('.js'));
  return looksLikeScript ? rawArgs.slice(1) : rawArgs;
};

const getArgsFromProcess = (): { rawArgs: string[]; args: string[] } => {
  const rawArgs = process.argv.slice(2);
  return { rawArgs, args: stripLeadingScriptArg(rawArgs) };
};

const isVersionRequest = (args: string[]): boolean => {
  return args.includes('-v') || args.includes('--version');
};

const shouldDebugArgs = (rawArgs: string[]): boolean => {
  return process.env['ZINTRUST_CLI_DEBUG_ARGS'] === '1' && rawArgs.includes('--verbose');
};

const handleCliFatal = async (error: unknown, context: string): Promise<never> => {
  try {
    const { Logger } = await import('@config/logger');
    Logger.error(context, error);
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
};

async function main(): Promise<void> {
  try {
    // Fast path: print version and exit without bootstrapping the CLI.
    // This keeps `zin -v` / `zin --version` snappy and avoids any debug output.
    const { rawArgs: _rawArgs0, args: args0 } = getArgsFromProcess();
    if (isVersionRequest(args0)) {
      process.stdout.write(`${loadPackageVersionFast()}\n`);
      return;
    }

    const { EnvFileLoader } = await import('@cli/utils/EnvFileLoader');
    EnvFileLoader.ensureLoaded();

await run();

    const cli = CLI.create();

    // When executing via tsx (e.g. `npx tsx bin/zin.ts ...`), the script path can
    // appear as the first element of `process.argv.slice(2)`. Commander expects
    // args to start at the command name, so we strip a leading script path if present.
    const { rawArgs, args } = getArgsFromProcess();
    if (shouldDebugArgs(rawArgs)) {
      try {
        process.stderr.write(`[zintrust-cli] process.argv=${JSON.stringify(process.argv)}\n`);
        process.stderr.write(`[zintrust-cli] rawArgs=${JSON.stringify(rawArgs)}\n`);
      } catch {
        // ignore
      }
    }
    await cli.run(args);
  } catch (error) {
    await handleCliFatal(error, 'CLI execution failed');
  }
}

await main().catch(async (error) => {
  await handleCliFatal(error, 'CLI fatal error');
});
export {};
