import { BaseCommand, type CommandOptions, type IBaseCommand } from '@cli/BaseCommand';
import { DENO_RUNNER_SOURCE, LAMBDA_RUNNER_SOURCE } from '@cli/commands/runner';
import { EnvFileLoader } from '@cli/utils/EnvFileLoader';
import { SpawnUtil } from '@cli/utils/spawn';
import { readEnvString } from '@common/ExternalServiceUtils';
import { resolveNpmPath } from '@common/index';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import type { Command } from 'commander';

type StartMode = 'development' | 'production' | 'testing';

type StartModeInput = 'development' | 'dev' | 'production' | 'pro' | 'prod' | 'testing';

type StartCommandOptions = CommandOptions & {
  wrangler?: boolean;
  wg?: boolean;
  deno?: boolean;
  lambda?: boolean;
  watch?: boolean;
  mode?: string;
  runtime?: string;
  port?: string;
};

type StartVariant = 'node' | 'wrangler' | 'deno' | 'lambda';

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
  const raw = readEnvString('NODE_ENV').trim();
  const normalized = raw.toLowerCase();

  if (normalized === 'production' || normalized === 'pro' || normalized === 'prod') {
    return 'production';
  }

  // Per spec: any other NODE_ENV is treated as development.
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

  const envPortRaw = process.env['APP_PORT'] ?? process.env['PORT'] ?? '';
  if (envPortRaw === '') return undefined;

  const parsed = Number.parseInt(String(envPortRaw), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 65536) {
    throw ErrorFactory.createCliError(
      `Error: Invalid APP_PORT/PORT '${envPortRaw}'. Expected 1-65535.`
    );
  }
  return parsed;
};

const resolveRuntime = (options: StartCommandOptions): string | undefined => {
  const raw = typeof options.runtime === 'string' ? options.runtime.trim() : '';
  return raw === '' ? undefined : raw;
};

const resolveStartVariant = (options: StartCommandOptions): StartVariant => {
  const wantWrangler = options.wrangler === true || options.wg === true;
  const wantDeno = options.deno === true;
  const wantLambda = options.lambda === true;

  const enabled = [wantWrangler, wantDeno, wantLambda].filter(Boolean).length;
  if (enabled > 1) {
    throw ErrorFactory.createCliError(
      'Error: Choose only one of --wrangler/--wg, --deno, or --lambda.'
    );
  }

  if (wantWrangler) return 'wrangler';
  if (wantDeno) return 'deno';
  if (wantLambda) return 'lambda';
  return 'node';
};

const getMySqlProxyHint = (): { command: string; url: string } | null => {
  const connection = readEnvString('DB_CONNECTION', '').toLowerCase();
  if (connection !== 'mysql') return null;

  const proxyUrl = readEnvString('MYSQL_PROXY_URL', '').trim();
  if (proxyUrl !== '') return null;

  const host = readEnvString('MYSQL_PROXY_HOST', '127.0.0.1').trim() || '127.0.0.1';
  const port = readEnvString('MYSQL_PROXY_PORT', '8789').trim() || '8789';

  return {
    command: `zin proxy:mysql --host ${host} --port ${port}`,
    url: `http://${host}:${port}`,
  };
};

const logMySqlProxyHint = (cmd: IBaseCommand): void => {
  const hint = getMySqlProxyHint();
  if (!hint) return;

  cmd.warn('MySQL proxy not configured for Cloudflare Workers. Start it in another terminal:');
  cmd.warn(hint.command);
  cmd.warn(`Then set MYSQL_PROXY_URL=${hint.url}`);
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
      "Error: No ZinTrust app found. Run 'zin new <project>' or ensure package.json exists."
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
  const indexEntry = path.join(cwd, 'src/index.ts');
  if (existsSync(indexEntry)) return 'src/index.ts';

  // Legacy fallback
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

  const runFromSourceEnv = process.env['ZINTRUST_RUN_FROM_SOURCE'] ?? '';
  const runFromSource = runFromSourceEnv === '1' || runFromSourceEnv.toLowerCase() === 'true';

  let compiled: string | undefined;
  if (existsSync(compiledBoot) && !runFromSource) {
    compiled = 'dist/src/boot/bootstrap.js';
  }

  // If compiled app isn't available (or the env forces running from source),
  // fall back to running the source entry with `tsx` so developers can test
  // core files with production semantics without building.
  if (compiled === undefined) {
    const bootstrap = resolveBootstrapEntryTs(cwd);
    if (bootstrap !== undefined) {
      return { command: 'tsx', args: [bootstrap] };
    }

    if (existsSync(path.join(cwd, 'src/index.ts'))) {
      return { command: 'tsx', args: ['src/index.ts'] };
    }

    throw ErrorFactory.createCliError(
      "Error: Compiled app not found at dist/src/boot/bootstrap.js. Run 'npm run build' first or set ZINTRUST_RUN_FROM_SOURCE=1 to run source in production."
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

  logMySqlProxyHint(cmd);
  cmd.info('Starting in Wrangler dev mode...');
  const exitCode = await SpawnUtil.spawnAndWait({ command: 'wrangler', args: wranglerArgs });
  process.exit(exitCode);
};

const ensureTmpRunnerFile = (cwd: string, filename: string, content: string): string => {
  const tmpDir = path.join(cwd, 'tmp');
  try {
    mkdirSync(tmpDir, { recursive: true });
  } catch (error) {
    throw ErrorFactory.createTryCatchError('Failed to create tmp directory', error);
  }

  const fullPath = path.join(tmpDir, filename);
  try {
    writeFileSync(fullPath, content, 'utf-8');
  } catch (error) {
    throw ErrorFactory.createTryCatchError('Failed to write start runner', error);
  }

  return fullPath;
};

const executeDenoStart = async (
  cmd: IBaseCommand,
  cwd: string,
  mode: StartMode,
  watchEnabled: boolean,
  _port: number | undefined,
  runtime: string | undefined
): Promise<void> => {
  if (runtime !== undefined) {
    throw ErrorFactory.createCliError('Error: --runtime cannot be used with --deno.');
  }

  if (mode === 'testing') {
    throw ErrorFactory.createCliError(
      'Error: Cannot start server in testing mode. Use development or production.'
    );
  }

  const denoRunner = ensureTmpRunnerFile(cwd, 'zin-start-deno.ts', DENO_RUNNER_SOURCE);

  const args: string[] = [];
  if (mode === 'development' && watchEnabled) args.push('watch');
  args.push(denoRunner);

  cmd.info('Starting in Deno adapter mode...');
  const exitCode = await SpawnUtil.spawnAndWait({ command: 'tsx', args });
  process.exit(exitCode);
};

const executeLambdaStart = async (
  cmd: IBaseCommand,
  cwd: string,
  mode: StartMode,
  watchEnabled: boolean,
  _port: number | undefined,
  runtime: string | undefined
): Promise<void> => {
  if (runtime !== undefined) {
    throw ErrorFactory.createCliError('Error: --runtime cannot be used with --lambda.');
  }

  if (mode === 'testing') {
    throw ErrorFactory.createCliError(
      'Error: Cannot start server in testing mode. Use development or production.'
    );
  }

  const lambdaRunner = ensureTmpRunnerFile(cwd, 'zin-start-lambda.ts', LAMBDA_RUNNER_SOURCE);

  const args: string[] = [];
  if (mode === 'development' && watchEnabled) args.push('watch');
  args.push(lambdaRunner);

  cmd.info('Starting in Lambda adapter mode...');
  const exitCode = await SpawnUtil.spawnAndWait({ command: 'tsx', args });
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

      const exitCode = await SpawnUtil.spawnAndWait({
        command: 'tsx',
        args,
        forwardSignals: false,
      });
      process.exit(exitCode);
    }

    const packageJson = readPackageJson(cwd);
    const dev = resolveNodeDevCommand(cwd, packageJson);
    cmd.info('Starting in development mode (watch enabled)...');
    const exitCode = await SpawnUtil.spawnAndWait({
      command: dev.command,
      args: dev.args,
      forwardSignals: false,
    });
    process.exit(exitCode);
  }

  const prod = resolveNodeProdCommand(cwd);
  cmd.info('Starting in production mode...');
  const exitCode = await SpawnUtil.spawnAndWait({
    command: prod.command,
    args: prod.args,
    forwardSignals: false,
  });
  process.exit(exitCode);
};

const executeStart = async (options: StartCommandOptions, cmd: IBaseCommand): Promise<void> => {
  const cwd = process.cwd();
  EnvFileLoader.ensureLoaded();
  const mode = resolveMode(options);
  const port = resolvePort(options);
  const runtime = resolveRuntime(options);
  const variant = resolveStartVariant(options);
  let effectiveRuntime = runtime;
  if (variant === 'deno') effectiveRuntime = 'deno';
  if (variant === 'lambda') effectiveRuntime = 'lambda';

  EnvFileLoader.applyCliOverrides({ nodeEnv: mode, port, runtime: effectiveRuntime });

  if (variant === 'wrangler') {
    await executeWranglerStart(cmd, cwd, port, runtime);
    return;
  }

  const watchEnabled = resolveWatchPreference(options, mode);

  if (variant === 'deno') {
    await executeDenoStart(cmd, cwd, mode, watchEnabled, port, runtime);
    return;
  }

  if (variant === 'lambda') {
    await executeLambdaStart(cmd, cwd, mode, watchEnabled, port, runtime);
    return;
  }
  await executeNodeStart(cmd, cwd, mode, watchEnabled);
};

export const StartCommand = Object.freeze({
  create(): IBaseCommand {
    const addOptions = (command: Command): void => {
      command.alias('s');
      command
        .option('--wrangler', 'Start with Wrangler dev mode (Cloudflare Workers)')
        .option('--wg', 'Alias for --wrangler')
        .option('--deno', 'Start a local server using the Deno runtime adapter')
        .option('--lambda', 'Start a local server using the AWS Lambda runtime adapter')
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
