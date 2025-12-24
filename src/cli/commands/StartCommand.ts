import { resolveNpmPath } from '@/common';
import { BaseCommand, type CommandOptions, type IBaseCommand } from '@cli/BaseCommand';
import { SpawnUtil } from '@cli/utils/spawn';
import { appConfig } from '@config/app';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

type StartMode = 'development' | 'production' | 'testing';

type StartCommandOptions = CommandOptions & {
  wrangler?: boolean;
  watch?: boolean;
  mode?: string;
  runtime?: string;
  port?: string;
};

const isValidMode = (value: string): value is StartMode =>
  value === 'development' || value === 'production' || value === 'testing';

const resolveMode = (options: StartCommandOptions): StartMode => {
  const raw = typeof options.mode === 'string' ? options.mode.trim() : '';

  if (raw !== '') {
    if (isValidMode(raw)) return raw;
    throw ErrorFactory.createCliError(
      `Error: Invalid --mode '${raw}'. Expected one of: development, production, testing.`
    );
  }

  const envMode = typeof process.env['NODE_ENV'] === 'string' ? process.env['NODE_ENV'] : '';
  if (envMode !== '' && isValidMode(envMode)) return envMode;
  return 'development';
};

const resolvePort = (options: StartCommandOptions): number | undefined => {
  const raw = typeof options.port === 'string' ? options.port.trim() : '';
  if (raw === '') return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 65536) {
    throw ErrorFactory.createCliError(`Error: Invalid --port '${raw}'. Expected 1-65535.`);
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
  packageJson.name === 'zintrust';

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

const resolveNodeDevCommand = (
  cwd: string,
  packageJson: { name?: unknown; scripts?: Record<string, unknown> }
): { command: string; args: string[] } => {
  if (isFrameworkRepo(packageJson)) {
    return { command: 'tsx', args: ['watch', 'src/bootstrap.ts'] };
  }

  if (hasDevScript(packageJson)) {
    const npm = resolveNpmPath();
    return { command: npm, args: ['run', 'dev'] };
  }

  if (existsSync(path.join(cwd, 'src/bootstrap.ts'))) {
    return { command: 'tsx', args: ['watch', 'src/bootstrap.ts'] };
  }

  if (existsSync(path.join(cwd, 'src/index.ts'))) {
    return { command: 'tsx', args: ['watch', 'src/index.ts'] };
  }

  throw ErrorFactory.createCliError(
    "Error: No Zintrust app found. Run 'zin new <project>' or ensure package.json exists."
  );
};

const resolveNodeProdCommand = (cwd: string): { command: string; args: string[] } => {
  const compiled = path.join(cwd, 'dist/src/bootstrap.js');
  if (!existsSync(compiled)) {
    throw ErrorFactory.createCliError(
      "Error: Compiled app not found at dist/src/bootstrap.js. Run 'npm run build' first."
    );
  }

  return { command: 'node', args: ['dist/src/bootstrap.js'] };
};

const resolveSpawnEnv = (
  baseEnv: NodeJS.ProcessEnv,
  mode: StartMode,
  runtime: string | undefined,
  port: number | undefined
): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...baseEnv };

  env['NODE_ENV'] = mode;

  if (typeof runtime === 'string' && runtime !== '') {
    env['RUNTIME'] = runtime;
  }

  if (typeof port === 'number') {
    env['PORT'] = String(port);
  }

  return env;
};

const executeWranglerStart = async (
  cmd: IBaseCommand,
  cwd: string,
  env: NodeJS.ProcessEnv,
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
  const exitCode = await SpawnUtil.spawnAndWait({ command: 'wrangler', args: wranglerArgs, env });
  process.exit(exitCode);
};

const executeNodeStart = async (
  cmd: IBaseCommand,
  cwd: string,
  env: NodeJS.ProcessEnv,
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
      const args = existsSync(path.join(cwd, 'src/bootstrap.ts'))
        ? ['src/bootstrap.ts']
        : ['src/index.ts'];

      const exitCode = await SpawnUtil.spawnAndWait({ command: 'tsx', args, env });
      process.exit(exitCode);
      return;
    }

    const packageJson = readPackageJson(cwd);
    const dev = resolveNodeDevCommand(cwd, packageJson);
    cmd.info('Starting in development mode (watch enabled)...');
    const exitCode = await SpawnUtil.spawnAndWait({ command: dev.command, args: dev.args, env });
    process.exit(exitCode);
    return;
  }

  const prod = resolveNodeProdCommand(cwd);
  cmd.info('Starting in production mode...');
  const exitCode = await SpawnUtil.spawnAndWait({ command: prod.command, args: prod.args, env });
  process.exit(exitCode);
};

const executeStart = async (options: StartCommandOptions, cmd: IBaseCommand): Promise<void> => {
  const cwd = process.cwd();
  const mode = resolveMode(options);
  const port = resolvePort(options);
  const runtime = resolveRuntime(options);

  const env = resolveSpawnEnv(appConfig.getSafeEnv(), mode, runtime, port);

  if (options.wrangler === true) {
    await executeWranglerStart(cmd, cwd, env, port, runtime);
    return;
  }

  const watchEnabled = resolveWatchPreference(options, mode);
  await executeNodeStart(cmd, cwd, env, mode, watchEnabled);
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
