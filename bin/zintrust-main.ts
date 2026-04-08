/**
 * ZinTrust CLI - Main Entry Point (hashbang-free)
 *
 * This module contains the CLI implementation without a hashbang so that it can
 * be imported by other bin shortcuts (zin/z/zt) without parse errors.
 */

import { Logger } from '@config/logger';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type ProjectLocalCliTarget = {
  binPath: string;
  packageRoot: string;
};

const CLI_HANDOFF_ENV_KEY = 'ZINTRUST_CLI_HANDOFF';

const getCurrentPackageRoot = (): string => {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
};

const getRealPath = (targetPath: string): string => {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
};

const isWithinDirectory = (targetPath: string, possibleParentPath: string): boolean => {
  const normalizedTarget = getRealPath(targetPath);
  const normalizedParent = getRealPath(possibleParentPath);

  if (normalizedTarget === normalizedParent) return true;

  const relativePath = path.relative(normalizedParent, normalizedTarget);
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
};

const findProjectLocalCliTarget = (cwd: string): ProjectLocalCliTarget | undefined => {
  let currentDir = path.resolve(cwd);

  while (true) {
    const packageRoot = path.join(currentDir, 'node_modules', '@zintrust', 'core');
    const packageJsonPath = path.join(packageRoot, 'package.json');
    const binCandidates = [
      path.join(packageRoot, 'bin', 'zin.js'),
      path.join(packageRoot, 'bin', 'zin.mjs'),
      path.join(packageRoot, 'bin', 'zin.cjs'),
      path.join(packageRoot, 'bin', 'zin.ts'),
    ];

    if (fs.existsSync(packageJsonPath)) {
      const binPath = binCandidates.find((candidate) => fs.existsSync(candidate));
      if (binPath !== undefined) {
        return { binPath, packageRoot };
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return undefined;
    currentDir = parentDir;
  }
};

const resolveProjectLocalCliHandoff = (
  cwd: string,
  currentPackageRoot: string,
  env: NodeJS.ProcessEnv = process.env
): ProjectLocalCliTarget | undefined => {
  if (env[CLI_HANDOFF_ENV_KEY] === '1') return undefined;

  if (isWithinDirectory(cwd, currentPackageRoot)) return undefined;

  const target = findProjectLocalCliTarget(cwd);
  if (target === undefined) return undefined;

  if (getRealPath(target.packageRoot) === getRealPath(currentPackageRoot)) {
    return undefined;
  }

  return target;
};

const handoffToProjectLocalCli = (target: ProjectLocalCliTarget, rawArgs: string[]): never => {
  const result = spawnSync(process.execPath, [target.binPath, ...rawArgs], {
    stdio: 'inherit',
    env: {
      ...process.env,
      [CLI_HANDOFF_ENV_KEY]: '1',
    },
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  process.exit(typeof result.status === 'number' ? result.status : 1);
};

const maybeHandoffToProjectLocalCli = (rawArgs: string[]): boolean => {
  const localCliTarget = resolveProjectLocalCliHandoff(process.cwd(), getCurrentPackageRoot());
  if (localCliTarget === undefined) return false;

  handoffToProjectLocalCli(localCliTarget, rawArgs);
  return true;
};

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

const maybePrintVersionAndExit = (args: string[]): boolean => {
  if (!isVersionRequest(args)) return false;

  printFancyVersion(loadPackageVersionFast());
  return true;
};

const printFancyVersion = (version: string): void => {
  const framework = 'ZinTrust Framework';
  const bannerWidth = 46;
  const env = (process.env['NODE_ENV'] ?? 'development').toString();
  const db = (process.env['DB_CONNECTION'] ?? 'sqlite').toString();

  // Keep this dependency-free and fast; version flags should return instantly.
  // (No logger, no config boot, no CLI registration.)

  console.log('┌' + '─'.repeat(bannerWidth) + '┐');

  console.log(`│ Framework: ${framework.padEnd(bannerWidth - 11)}│`);

  console.log(`│ Version:   ${version.padEnd(bannerWidth - 11)}│`);

  console.log(`│ Env:       ${env.padEnd(bannerWidth - 11)}│`);

  console.log(`│ Database:  ${db.padEnd(bannerWidth - 11)}│`);

  console.log('└' + '─'.repeat(bannerWidth) + '┘');

  console.log();
};

const shouldDebugArgs = (rawArgs: string[]): boolean => {
  return process.env['ZINTRUST_CLI_DEBUG_ARGS'] === '1' && rawArgs.includes('--verbose');
};

const normalizeProxyTargetArgs = (args: string[]): string[] => {
  if (args.length < 2 || args[0] !== 'proxy') return args;

  const target = args[1];
  if (!target || target.startsWith('-') || target.includes(':')) return args;

  const normalized = target.trim().toLowerCase();
  const aliases: Record<string, string> = {
    redis: 'redis',
    red: 'red',
    smtp: 'smtp',
    mysql: 'mysql',
    postgres: 'postgres',
    mongodb: 'mongodb',
    sqlserver: 'sqlserver',
  };

  const mappedTarget = aliases[normalized];
  if (!mappedTarget) return args;

  return [`proxy:${mappedTarget}`, ...args.slice(2)];
};

const getPrimaryCommand = (args: string[]): string | undefined => {
  for (const arg of args) {
    const normalized = arg.trim().toLowerCase();
    if (normalized === '' || normalized.startsWith('-')) continue;
    return normalized;
  }

  return undefined;
};

const shouldDeferPluginAutoImportWarnings = (args: string[]): boolean => {
  const command = getPrimaryCommand(args);
  return command === 'start' || command === 's';
};

const logPluginAutoImportFailure = (
  args: string[],
  scope: 'Official' | 'Project',
  details?: string
): void => {
  if (shouldDeferPluginAutoImportWarnings(args)) {
    Logger.debug(`${scope} plugin auto-import advisory deferred to runtime bootstrap`, {
      details,
    });
    return;
  }

  Logger.warn(`${scope} plugin auto-imports failed:`, details);
};

const handleCliFatal = async (error: unknown, context: string): Promise<never> => {
  try {
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

const runCliInternal = async (): Promise<void> => {
  const { rawArgs: rawArgs0, args: args0 } = getArgsFromProcess();
  if (maybeHandoffToProjectLocalCli(rawArgs0)) {
    return;
  }

  // Fast path: print version and exit without bootstrapping the CLI.
  // This keeps `zin -v` / `zin --version` snappy and avoids any debug output.
  if (maybePrintVersionAndExit(args0)) {
    return;
  }

  const { EnvFileLoader } = await import('@cli/utils/EnvFileLoader');
  EnvFileLoader.ensureLoaded();

  // Auto-load install-only CLI extension packages that self-register commands.
  let optionalCliExtensions:
    | typeof import('@cli/OptionalCliExtensions').OptionalCliExtensions
    | undefined;
  let optionalCliStatuses: ReadonlyArray<
    import('@cli/OptionalCliExtensions').OptionalCliExtensionStatus
  > = [];
  try {
    ({ OptionalCliExtensions: optionalCliExtensions } = await import('@cli/OptionalCliExtensions'));
    optionalCliStatuses = await optionalCliExtensions.loadForArgs(args0);
  } catch {
    // best-effort; missing optional extensions must not block the CLI
  }

  const missingOptionalExtension = optionalCliExtensions?.findMissingExtensionForArgs(
    args0,
    optionalCliStatuses
  );

  if (missingOptionalExtension !== undefined) {
    const { ErrorFactory } = await import('@exceptions/ZintrustError');
    throw ErrorFactory.createCliError(
      optionalCliExtensions?.getMissingExtensionMessage(missingOptionalExtension) ??
        `Missing optional CLI package: ${missingOptionalExtension.packageName}`
    );
  }

  // Ensure project-installed adapters/drivers are registered for CLI commands.
  // (This is driven by src/zintrust.plugins.ts generated by `zin plugin install`.)
  try {
    const { PluginAutoImports } = await import('@runtime/PluginAutoImports');
    const runtimeImportMode = process.env['DOCKER_WORKER'] === 'true' ? 'worker' : 'base';
    const officialImports = await PluginAutoImports.tryImportRuntimeAutoImports(runtimeImportMode);
    if (!officialImports.ok) {
      logPluginAutoImportFailure(args0, 'Official', officialImports.errorMessage);
    }

    const projectImports = await PluginAutoImports.tryImportProjectAutoImports();
    if (!projectImports.ok && projectImports.reason !== 'not-found') {
      logPluginAutoImportFailure(args0, 'Project', projectImports.errorMessage);
    }
  } catch {
    // best-effort; CLI should still run even if plugins file is missing
  }

  const { CLI } = await import('@cli/CLI');

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
  await cli.run(normalizeProxyTargetArgs(args));
};

export async function run(): Promise<void> {
  try {
    await runCliInternal();
  } catch (error) {
    await handleCliFatal(error, 'CLI execution failed');
  }
}

export const CliLauncherInternal = Object.freeze({
  CLI_HANDOFF_ENV_KEY,
  findProjectLocalCliTarget,
  getCurrentPackageRoot,
  getRealPath,
  isWithinDirectory,
  resolveProjectLocalCliHandoff,
});

export {};
