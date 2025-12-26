import { resolveNpmPath } from '@/common';
import { BaseCommand, type CommandOptions, type IBaseCommand } from '@cli/BaseCommand';
import { EnvFileLoader } from '@cli/utils/EnvFileLoader';
import { SpawnUtil } from '@cli/utils/spawn';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { existsSync, readFileSync } from '@node-singletons/fs';
import { Command } from 'commander';
import * as path from 'node:path';

type StartMode = 'development' | 'production' | 'testing';

type StartModeInput = 'development' | 'dev' | 'production' | 'pro' | 'prod' | 'testing';

type StartCommandOptions = CommandOptions & {
  wrangler?: boolean;
  watch?: boolean;
  mode?: string;
  runtime?: string;
  port?: string;
};

const isValidModeInput = (value: string): value is StartModeInput =>
  value === 'development' ||
  value === 'dev' ||
  value === 'production' ||
  value === 'pro' ||
  value === 'prod' ||
  value === 'testing';

const normalizeMode = (value: StartModeInput): StartMode => {
  if (value === 'production' || value === 'pro' || value === 'prod') return 'production';
  if (value === 'testing') return 'testing';
  return 'development';
};

const resolveModeFromAppMode = (): StartMode => {
  const raw = typeof process.env['APP_MODE'] === 'string' ? process.env['APP_MODE'].trim() : '';
  const normalized = raw.toLowerCase();

  if (normalized === 'production' || normalized === 'pro' || normalized === 'prod') {
    return 'production';
  }

  // Per spec: any other APP_MODE is treated as development.
  return 'development';
};

const resolveMode = (options: StartCommandOptions): StartMode => {
  const raw = typeof options.mode === 'string' ? options.mode.trim() : '';

  if (raw !== '') {
    if (isValidModeInput(raw)) return normalizeMode(raw);
    throw ErrorFactory.createCliError(
      `Error: Invalid --mode '${raw}'. Expected one of: development, production, testing.`
    );
  }

  return resolveModeFromAppMode();
};

const resolvePort = (options: StartCommandOptions): number | undefined => {
  const cliPort = typeof options.port === 'string' ? options.port.trim() : '';
  if (cliPort !== '') {
    const parsed = Number.parseInt(cliPort, 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 65536) {
      throw ErrorFactory.createCliError(`Error: Invalid --port '${cliPort}'. Expected 1-65535.`);
    }
    return parsed;
  }

  // .env is primary (loaded by EnvFileLoader with overrideExisting=true)
  const envPort = process.env['APP_PORT'] ?? process.env['PORT'] ?? '';
  if (envPort === '') return undefined;

  const parsed = Number.parseInt(envPort, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 65536) {
    throw ErrorFactory.createCliError(
      `Error: Invalid APP_PORT/PORT '${envPort}'. Expected 1-65535.`
    );
  }
  return parsed;
};

const resolveRuntime = (options: StartCommandOptions): string | undefined => {
  const raw = typeof options.runtime === 'string' ? options.runtime.trim() : '';
  return raw === '' ? undefined : raw;
};

const hasFlag = (flag: string): boolean => process.argv.includes(flag);

const resolveWatchPreference = (options: StartCommandOptions, mode: StartMode): boolean => {
  const hasWatch = hasFlag('--watch');
  const hasNoWatch = hasFlag('--no-watch');

  if (hasWatch && hasNoWatch) {
    throw ErrorFactory.createCliError('Error: Cannot use both --watch and --no-watch.');
  }

  if (hasWatch) return true;
  if (hasNoWatch) return false;

  if (typeof options.watch === 'boolean') return options.watch;

  return mode === 'development';
};

const readPackageJson = (cwd: string): { name?: unknown; scripts?: Record<string, unknown> } => {
  const packagePath = path.join(cwd, 'package.json');
  if (!existsSync(packagePath)) {
    throw ErrorFactory.createCliError(
      "Error: No Zintrust app found. Run 'zin new <project>' or ensure package.json exists."
    );
  }

  try {
    const raw = readFileSync(packagePath, 'utf-8');
    return JSON.parse(raw) as { name?: unknown; scripts?: Record<string, unknown> };
  } catch (error) {
    throw ErrorFactory.createTryCatchError('Failed to read package.json', error);
  }
};

const isFrameworkRepo = (packageJson: { name?: unknown }): boolean =>
  packageJson.name === '@zintrust/core';

const hasDevScript = (packageJson: { scripts?: Record<string, unknown> }): boolean => {
  const scripts = packageJson.scripts;
  if (!scripts) return false;
  return typeof scripts['dev'] === 'string' && scripts['dev'] !== '';
};

const findWranglerConfig = (cwd: string): string | undefined => {
  const candidates = ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc'];
  for (const candidate of candidates) {
    const full = path.join(cwd, candidate);
    if (existsSync(full)) return full;
  }
  return undefined;
};

const resolveWranglerEntry = (cwd: string): string | undefined => {
  const entry = path.join(cwd, 'src/functions/cloudflare.ts');
  return existsSync(entry) ? 'src/functions/cloudflare.ts' : undefined;
};

const resolveBootstrapEntryTs = (cwd: string): string | undefined => {
  const boot = path.join(cwd, 'src/boot/bootstrap.ts');
  if (existsSync(boot)) return 'src/boot/bootstrap.ts';
  return undefined;
};

const resolveNodeDevCommand = (
  cwd: string,
  packageJson: { name?: unknown; scripts?: Record<string, unknown> }
): { command: string; args: string[] } => {
  if (isFrameworkRepo(packageJson)) {
    const bootstrap = resolveBootstrapEntryTs(cwd);
    return { command: 'tsx', args: ['watch', bootstrap ?? 'src/index.ts'] };
  }

  const bootstrap = resolveBootstrapEntryTs(cwd);
  if (bootstrap !== undefined) {
    return { command: 'tsx', args: ['watch', bootstrap] };
  }

  if (existsSync(path.join(cwd, 'src/index.ts'))) {
    return { command: 'tsx', args: ['watch', 'src/index.ts'] };
  }

  // Fallback: if the app provides a dev script, run it.
  // IMPORTANT: avoid calling `npm run dev` when the dev script itself invokes `zin`/`zintrust`
  // (e.g. "dev": "zin s"), which would cause infinite recursion.
  const devScript =
    typeof packageJson.scripts?.['dev'] === 'string' ? String(packageJson.scripts['dev']) : '';
  const devScriptCallsZin = /\bzin(?:trust)?\b/.test(devScript);

  if (hasDevScript(packageJson) && !devScriptCallsZin) {
    const npm = resolveNpmPath();
    return { command: npm, args: ['run', 'dev'] };
  }

  throw ErrorFactory.createCliError(
    "Error: No entry point found. Expected 'src/index.ts' or 'src/boot/bootstrap.ts'. Ensure your project is correctly scaffolded."
  );
};

const resolveNodeProdCommand = (cwd: string): { command: string; args: string[] } => {
  const compiledBoot = path.join(cwd, 'dist/src/boot/bootstrap.js');

  let compiled: string | undefined;
  if (existsSync(compiledBoot)) {
    compiled = 'dist/src/boot/bootstrap.js';
  }

  if (compiled === undefined) {
    throw ErrorFactory.createCliError(
      "Error: Compiled app not found at dist/src/boot/bootstrap.js Run 'npm run build' first."
    );
  }

  return { command: 'node', args: [compiled] };
};

const executeWranglerStart = async (
  cmd: IBaseCommand,
  cwd: string,
  port: number | undefined,
  runtime: string | undefined
): Promise<void> => {
  if (runtime !== undefined) {
    throw ErrorFactory.createCliError(
      'Error: --runtime is not supported with --wrangler (Wrangler controls Workers runtime).'
    );
  }

  const configPath = findWranglerConfig(cwd);
  const entry = resolveWranglerEntry(cwd);

  if (configPath === undefined && entry === undefined) {
    throw ErrorFactory.createCliError(
      "Error: wrangler config not found (wrangler.toml/json). Run 'wrangler init' first."
    );
  }

  const wranglerArgs: string[] = ['dev'];
  if (configPath === undefined && entry !== undefined) {
    wranglerArgs.push(entry);
  }

  if (typeof port === 'number') {
    wranglerArgs.push('--port', String(port));
  }

  cmd.info('Starting in Wrangler dev mode...');
  const exitCode = await SpawnUtil.spawnAndWait({ command: 'wrangler', args: wranglerArgs });
  process.exit(exitCode);
};

const executeNodeStart = async (
  cmd: IBaseCommand,
  cwd: string,
  mode: StartMode,
  watchEnabled: boolean
): Promise<void> => {
  if (mode === 'testing') {
    throw ErrorFactory.createCliError(
      'Error: Cannot start server in testing mode. Use --force to override (not supported).'
    );
  }

  if (mode === 'development') {
    if (!watchEnabled) {
      cmd.warn('Watch mode disabled; starting once.');
      const bootstrap = resolveBootstrapEntryTs(cwd);
      const args = bootstrap === undefined ? ['src/index.ts'] : [bootstrap];

      const exitCode = await SpawnUtil.spawnAndWait({ command: 'tsx', args });
      process.exit(exitCode);
    }

    const packageJson = readPackageJson(cwd);
    const dev = resolveNodeDevCommand(cwd, packageJson);
    cmd.info('Starting in development mode (watch enabled)...');
    const exitCode = await SpawnUtil.spawnAndWait({ command: dev.command, args: dev.args });
    process.exit(exitCode);
  }

  const prod = resolveNodeProdCommand(cwd);
  cmd.info('Starting in production mode...');
  const exitCode = await SpawnUtil.spawnAndWait({ command: prod.command, args: prod.args });
  process.exit(exitCode);
};

const executeStart = async (options: StartCommandOptions, cmd: IBaseCommand): Promise<void> => {
  const cwd = process.cwd();
  EnvFileLoader.ensureLoaded();
  const mode = resolveMode(options);
  const port = resolvePort(options);
  const runtime = resolveRuntime(options);

  EnvFileLoader.applyCliOverrides({ nodeEnv: mode, port, runtime });

  if (options.wrangler === true) {
    await executeWranglerStart(cmd, cwd, port, runtime);
    return;
  }

  const watchEnabled = resolveWatchPreference(options, mode);
  await executeNodeStart(cmd, cwd, mode, watchEnabled);
};

export const StartCommand = Object.freeze({
  create(): IBaseCommand {
    const addOptions = (command: Command): void => {
      command.alias('s');
      command
        .option('-w, --wrangler', 'Start with Wrangler dev mode (Cloudflare Workers)')
        .option('--watch', 'Force watch mode (Node only)')
        .option('--no-watch', 'Disable watch mode (Node only)')
        .option('--mode <development|production|testing>', 'Override app mode')
        .option('--runtime <nodejs|cloudflare|lambda|deno|auto>', 'Set RUNTIME for spawned Node')
        .option('--port <number>', 'Override server port');
    };

    const cmd: IBaseCommand = BaseCommand.create({
      name: 'start',
      description: 'Start the application (dev watch, production, or Wrangler mode)',
      addOptions,
      execute: async (options: CommandOptions): Promise<void> =>
        executeStart(options as StartCommandOptions, cmd),
    });

    return cmd;
  },
});
