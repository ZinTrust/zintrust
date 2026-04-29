import { BaseCommand, type CommandOptions, type IBaseCommand } from '@cli/BaseCommand';
import { withWranglerDevVarsSnapshot } from '@cli/cloudflare/CloudflareWranglerDevEnv';
import {
  createDenoRunnerSource,
  createLambdaRunnerSource,
  createNodeRunnerSource,
} from '@cli/commands/runner';
import { EnvFileLoader } from '@cli/utils/EnvFileLoader';
import { SpawnUtil } from '@cli/utils/spawn';
import { readEnvString } from '@common/ExternalServiceUtils';
import * as Common from '@common/index';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { isNonEmptyString } from '@helper/index';
import type { ServiceManifestEntry } from '@microservices/ServiceManifest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { ProjectRuntime } from '@runtime/ProjectRuntime';
import type { Command } from 'commander';

type StartMode = 'development' | 'production' | 'testing' | 'split';

type StartModeInput = 'development' | 'dev' | 'production' | 'pro' | 'prod' | 'testing' | 'split';

type StartCommandOptions = CommandOptions & {
  wrangler?: boolean;
  wg?: boolean;
  wranglerConfig?: string;
  deno?: boolean;
  lambda?: boolean;
  cache?: boolean;
  watch?: boolean;
  rootEnv?: boolean;
  mode?: string;
  runtime?: string;
  port?: string;
  env?: string;
  envPath?: string;
};

type StartVariant = 'node' | 'wrangler' | 'deno' | 'lambda';

type PackageJson = { name?: unknown; scripts?: Record<string, unknown> };

type StartContext = {
  cwd: string;
  projectRoot: string;
  packageJson?: PackageJson;
};

const isAsciiUppercaseLetter = (value: string): boolean => value >= 'A' && value <= 'Z';

const isAsciiLowercaseLetter = (value: string): boolean => value >= 'a' && value <= 'z';

const isAsciiLetter = (value: string): boolean =>
  isAsciiUppercaseLetter(value) || isAsciiLowercaseLetter(value);

const isAsciiDigit = (value: string): boolean => value >= '0' && value <= '9';

const isWordCharacter = (value: string): boolean =>
  isAsciiLetter(value) || isAsciiDigit(value) || value === '_';

const isWranglerVarName = (value: string): boolean => {
  if (value.length === 0) return false;

  const first = value[0] ?? '';
  if (!(isAsciiLetter(first) || first === '_')) return false;

  for (let index = 1; index < value.length; index += 1) {
    if (!isWordCharacter(value[index] ?? '')) return false;
  }

  return true;
};

const toUpperSnakeCaseIdentifier = (value: string): string => {
  let output = '';
  let previousWasUnderscore = false;

  for (const char of value) {
    const isAllowed = isAsciiLetter(char) || isAsciiDigit(char);
    const nextChar = isAllowed ? char.toUpperCase() : '_';

    if (nextChar === '_') {
      if (previousWasUnderscore) continue;
      previousWasUnderscore = true;
      output += '_';
      continue;
    }

    previousWasUnderscore = false;
    output += nextChar;
  }

  let start = 0;
  while (start < output.length && output[start] === '_') start += 1;

  let end = output.length;
  while (end > start && output[end - 1] === '_') end -= 1;

  return output.slice(start, end);
};

const isWindowsDriveAbsolutePath = (value: string): boolean => {
  if (value.length < 3) return false;

  const drive = value[0] ?? '';
  const colon = value[1] ?? '';
  const separator = value[2] ?? '';

  return isAsciiLetter(drive) && colon === ':' && (separator === '\\' || separator === '/');
};

const isCommandTokenBoundary = (char: string | undefined): boolean => {
  if (char === undefined) return true;
  return !isAsciiLetter(char) && !isAsciiDigit(char);
};

const containsCommandToken = (value: string, command: string): boolean => {
  let startIndex = 0;

  while (startIndex < value.length) {
    const foundIndex = value.indexOf(command, startIndex);
    if (foundIndex === -1) return false;

    const before = foundIndex === 0 ? undefined : value[foundIndex - 1];
    const afterIndex = foundIndex + command.length;
    const after = afterIndex >= value.length ? undefined : value[afterIndex];

    if (isCommandTokenBoundary(before) && isCommandTokenBoundary(after)) return true;

    startIndex = foundIndex + command.length;
  }

  return false;
};

const containsZinCommand = (value: string): boolean => {
  const lower = value.toLowerCase();
  return containsCommandToken(lower, 'zintrust') || containsCommandToken(lower, 'zin');
};

const isAbsolutePath = (value: string): boolean =>
  value.startsWith('/') || isWindowsDriveAbsolutePath(value);

const resolveNpmPath = (): string => {
  try {
    return typeof Common.resolveNpmPath === 'function' ? Common.resolveNpmPath() : 'npm';
  } catch {
    return 'npm';
  }
};

const runFromSource = (): boolean => {
  try {
    return typeof Common.runFromSource === 'function' ? Common.runFromSource() : false;
  } catch {
    return false;
  }
};

const isValidModeInput = (value: string): value is StartModeInput =>
  value === 'development' ||
  value === 'dev' ||
  value === 'production' ||
  value === 'pro' ||
  value === 'prod' ||
  value === 'testing' ||
  value === 'split';

const normalizeMode = (value: StartModeInput): StartMode => {
  if (value === 'production' || value === 'pro' || value === 'prod') return 'production';
  if (value === 'testing') return 'testing';
  if (value === 'split') return 'split';
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

const resolveStandaloneServicePortEnvValue = (cwd: string): string => {
  const normalizedCwd = path.resolve(cwd);
  const serviceRootMarker = `${path.sep}src${path.sep}services${path.sep}`;

  if (!normalizedCwd.includes(serviceRootMarker)) return '';

  const serviceName = path.basename(normalizedCwd).trim();
  const servicePortKey = toUpperSnakeCaseIdentifier(serviceName);

  const candidateKeys = [
    servicePortKey === '' ? '' : `${servicePortKey}_PORT`,
    'SERVICE_PORT',
  ].filter((key) => key !== '');

  for (const key of candidateKeys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }

  return '';
};

const resolvePort = (options: StartCommandOptions, cwd: string): number | undefined => {
  const cliPort = typeof options.port === 'string' ? options.port.trim() : '';
  if (cliPort !== '') {
    const parsed = Number.parseInt(cliPort, 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 65536) {
      throw ErrorFactory.createCliError(`Error: Invalid --port '${cliPort}'. Expected 1-65535.`);
    }
    return parsed;
  }

  const standalonePort = resolveStandaloneServicePortEnvValue(cwd);
  const appPort = process.env['APP_PORT'];
  const port = process.env['PORT'];
  let envPortRaw = '';

  if (standalonePort !== '') {
    envPortRaw = standalonePort;
  } else if (appPort !== undefined && appPort.trim() !== '') {
    envPortRaw = appPort;
  } else if (port !== undefined && port.trim() !== '') {
    envPortRaw = port;
  }

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

const resolveConfiguredRuntime = (options: StartCommandOptions): string | undefined => {
  const cliRuntime = resolveRuntime(options);
  if (cliRuntime !== undefined && cliRuntime !== 'auto') return cliRuntime;

  const envRuntime = readEnvString('RUNTIME').trim();
  if (envRuntime === '' || envRuntime === 'auto') return undefined;
  return envRuntime;
};

const isCloudflareRuntimeRequest = (runtime: string | undefined): boolean => {
  if (typeof runtime !== 'string') return false;
  const normalized = runtime.trim().toLowerCase();
  return normalized === 'cloudflare' || normalized === 'cloudflare-workers';
};

const assertCompatibleStartVariant = (
  variant: StartVariant,
  configuredRuntime: string | undefined
): void => {
  if (variant !== 'node') return;
  if (!isCloudflareRuntimeRequest(configuredRuntime)) return;

  throw ErrorFactory.createCliError(
    'Error: Cloudflare runtime requires Wrangler dev mode. Run "zin start --wg" (or "zin s --wg") instead of plain "zin start".'
  );
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

const resolveCacheEnabledPreference = (options: StartCommandOptions): boolean | undefined => {
  const hasCache = hasFlag('--cache');
  const hasNoCache = hasFlag('--no-cache');

  if (hasCache && hasNoCache) {
    throw ErrorFactory.createCliError('Error: Cannot use both --cache and --no-cache.');
  }

  if (hasCache) return true;
  if (hasNoCache) return false;

  if (typeof options.cache === 'boolean') return options.cache;
  return undefined;
};

const resolveRootEnvPreference = (options: StartCommandOptions): boolean => {
  const hasRootEnv = hasFlag('--root-env');
  const hasNoRootEnv = hasFlag('--no-root-env');

  if (hasRootEnv && hasNoRootEnv) {
    throw ErrorFactory.createCliError('Error: Cannot use both --root-env and --no-root-env.');
  }

  if (hasRootEnv) return true;
  if (hasNoRootEnv) return false;
  if (typeof options.rootEnv === 'boolean') return options.rootEnv;
  return true;
};

const resolveEnvPath = (options: StartCommandOptions, projectRoot: string): string | undefined => {
  const raw = typeof options.envPath === 'string' ? options.envPath.trim() : '';
  if (raw === '') return undefined;

  return isAbsolutePath(raw) ? raw : path.join(projectRoot, raw);
};

const findNearestPackageJsonDir = (cwd: string): string | undefined => {
  let current = path.resolve(cwd);

  while (true) {
    if (existsSync(path.join(current, 'package.json'))) return current;

    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
};

const readPackageJsonFromDir = (dir: string): PackageJson => {
  const packagePath = path.join(dir, 'package.json');
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

const resolveStartContext = (cwd: string): StartContext => {
  const projectRoot = findNearestPackageJsonDir(cwd) ?? cwd;
  const packageDir = findNearestPackageJsonDir(cwd);

  return {
    cwd,
    projectRoot,
    ...(packageDir === undefined ? {} : { packageJson: readPackageJsonFromDir(packageDir) }),
  };
};

const requirePackageJson = (context: StartContext): PackageJson => {
  if (context.packageJson !== undefined) return context.packageJson;

  throw ErrorFactory.createCliError(
    "Error: No ZinTrust app found. Run 'zin new <project>' or ensure package.json exists."
  );
};

const buildStartEnv = (projectRoot: string): NodeJS.ProcessEnv => ({
  ...process.env,
  ZINTRUST_PROJECT_ROOT: projectRoot,
});

const shouldPreferRootEnvInMonolith = (): boolean => {
  const raw = readEnvString('RUN_AS_MONOLITH').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
};

const resolveManifestServiceEnvDir = (projectRoot: string, entry: ServiceManifestEntry): string => {
  const configRoot = (entry as { configRoot?: unknown }).configRoot;
  if (isNonEmptyString(configRoot)) {
    return path.dirname(path.join(projectRoot, configRoot));
  }

  return path.join(projectRoot, 'src', 'services', entry.domain, entry.name);
};

const ensureStartEnvLoaded = (context: StartContext, options: StartCommandOptions): void => {
  const envPath = resolveEnvPath(options, context.projectRoot);
  const rootEnv = resolveRootEnvPreference(options);
  const extraCwds =
    envPath === undefined && context.cwd !== context.projectRoot ? [context.cwd] : [];

  EnvFileLoader.ensureLoaded({
    cwd: context.projectRoot,
    includeCwd: rootEnv,
    extraCwds,
    ...(envPath === undefined ? {} : { envPaths: [envPath] }),
  });
};

const preloadManifestServiceEnv = async (
  context: StartContext,
  options: StartCommandOptions
): Promise<void> => {
  if (context.cwd !== context.projectRoot) return;
  if (resolveEnvPath(options, context.projectRoot) !== undefined) return;

  process.env['ZINTRUST_PROJECT_ROOT'] = context.projectRoot;
  ProjectRuntime.clear();
  await ProjectRuntime.tryLoadNodeRuntime();

  const manifest = ProjectRuntime.getServiceManifest().filter(
    (entry) => entry.monolithEnabled !== false && entry.loadEnv !== false
  );
  if (manifest.length === 0) return;

  const envPaths = manifest
    .map((entry) => resolveManifestServiceEnvDir(context.projectRoot, entry))
    .filter((value, index, items) => items.indexOf(value) === index);

  if (envPaths.length === 0) return;

  EnvFileLoader.ensureLoaded({
    cwd: context.projectRoot,
    includeCwd: resolveRootEnvPreference(options),
    envPaths,
    envPathsOverrideExisting: !shouldPreferRootEnvInMonolith(),
  });
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

const resolveRuntimeStartModuleSpecifier = (cwd: string): string => {
  const localStart = path.join(cwd, 'src/start.ts');
  if (existsSync(localStart)) {
    // Runner files are created under `<cwd>/tmp`, so `../src/start.ts` is stable.
    return '../src/start.ts';
  }

  return '@zintrust/core/start';
};

const resolveRuntimeCompiledStartModuleSpecifier = (cwd: string): string => {
  const localCompiledStart = path.join(cwd, 'dist', 'src', 'start.js');
  if (existsSync(localCompiledStart)) {
    return '../dist/src/start.js';
  }

  return '@zintrust/core/start';
};

const hasNodeSourceEntrypoint = (cwd: string): boolean => {
  return resolveBootstrapEntryTs(cwd) !== undefined || existsSync(path.join(cwd, 'src/index.ts'));
};

const ensureNodeSourceRunner = (cwd: string): string => {
  return ensureTmpRunnerFile(
    cwd,
    'zin-start-node.ts',
    createNodeRunnerSource(resolveRuntimeStartModuleSpecifier(cwd))
  );
};

const ensureNodeCompiledRunner = (cwd: string): string => {
  return ensureTmpRunnerFile(
    cwd,
    'zin-start-node.mjs',
    createNodeRunnerSource(resolveRuntimeCompiledStartModuleSpecifier(cwd))
  );
};

const resolveNodeDevCommand = (
  cwd: string,
  packageJson: { name?: unknown; scripts?: Record<string, unknown> }
): { command: string; args: string[] } => {
  if (isFrameworkRepo(packageJson) || hasNodeSourceEntrypoint(cwd)) {
    return { command: 'tsx', args: ['watch', ensureNodeSourceRunner(cwd)] };
  }

  // Fallback: if the app provides a dev script, run it.
  // IMPORTANT: avoid calling `npm run dev` when the dev script itself invokes `zin`/`zintrust`
  // (e.g. "dev": "zin s"), which would cause infinite recursion.
  const devScript =
    typeof packageJson.scripts?.['dev'] === 'string' ? String(packageJson.scripts['dev']) : '';
  const devScriptCallsZin = containsZinCommand(devScript);

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

  if (existsSync(compiledBoot) && !runFromSource()) {
    return { command: 'node', args: [ensureNodeCompiledRunner(cwd)] };
  }

  // If compiled app isn't available (or the env forces running from source),
  // fall back to running the source entry with `tsx` so developers can test
  // core files with production semantics without building.
  if (hasNodeSourceEntrypoint(cwd)) {
    return { command: 'tsx', args: [ensureNodeSourceRunner(cwd)] };
  }

  throw ErrorFactory.createCliError(
    "Error: Compiled app not found at dist/src/boot/bootstrap.js. Run 'npm run build' first or set ZINTRUST_RUN_FROM_SOURCE=1 to run source in production."
  );
};

const resolveWranglerDevConfig = (
  context: StartContext,
  wranglerConfig: string | undefined
): { normalizedConfig: string; configPath: string | undefined; entry: string | undefined } => {
  const normalizedConfig = typeof wranglerConfig === 'string' ? wranglerConfig.trim() : '';
  const explicitConfigFullPath =
    normalizedConfig.length > 0 ? path.join(context.cwd, normalizedConfig) : undefined;
  const configPath = explicitConfigFullPath ?? findWranglerConfig(context.cwd);
  const entry = resolveWranglerEntry(context.cwd);

  if (explicitConfigFullPath !== undefined && !existsSync(explicitConfigFullPath)) {
    throw ErrorFactory.createCliError(`Error: Wrangler config not found: ${normalizedConfig}`);
  }

  if (configPath === undefined && entry === undefined) {
    throw ErrorFactory.createCliError(
      "Error: wrangler config not found (wrangler.toml/json). Run 'wrangler init' first."
    );
  }

  return { normalizedConfig, configPath, entry };
};

const buildWranglerDevArgs = (args: {
  normalizedConfig: string;
  configPath: string | undefined;
  entry: string | undefined;
  port: number | undefined;
  envName: string | undefined;
}): string[] => {
  const wranglerArgs: string[] = ['dev'];

  if (args.normalizedConfig !== '') {
    wranglerArgs.push('--config', args.normalizedConfig);
  }
  if (args.configPath === undefined && args.entry !== undefined) {
    wranglerArgs.push(args.entry);
  }
  if (typeof args.port === 'number') {
    wranglerArgs.push('--port', String(args.port));
  }
  if (args.envName !== undefined && args.envName.trim() !== '') {
    wranglerArgs.push('--env', args.envName.trim());
  }

  return wranglerArgs;
};

const executeWranglerStart = async (
  cmd: IBaseCommand,
  context: StartContext,
  port: number | undefined,
  runtime: string | undefined,
  envName: string | undefined,
  wranglerConfig: string | undefined,
  envPath: string | undefined
): Promise<void> => {
  if (runtime !== undefined) {
    throw ErrorFactory.createCliError(
      'Error: --runtime is not supported with --wrangler (Wrangler controls Workers runtime).'
    );
  }

  const { normalizedConfig, configPath, entry } = resolveWranglerDevConfig(context, wranglerConfig);

  warnOnUnsafeWranglerBootstrap(cmd, context.cwd, entry);
  const wranglerArgs = buildWranglerDevArgs({
    normalizedConfig,
    configPath,
    entry,
    port,
    envName,
  });

  logMySqlProxyHint(cmd);
  cmd.info('Starting in Wrangler dev mode...');

  const exitCode = await withWranglerDevVarsSnapshot(
    {
      cwd: context.cwd,
      projectRoot: context.projectRoot,
      envName,
      ...(envPath === undefined ? {} : { envPath }),
      ...(configPath === undefined ? {} : { configPath }),
    },
    async () => {
      const startEnv = {
        ...buildStartEnv(context.projectRoot),
        WORKER_ENABLED: 'false',
        CLOUDFLARE_WORKER: 'true',
        DOCKER_WORKER: 'false',
      };

      return SpawnUtil.spawnAndWait({
        command: 'wrangler',
        args: wranglerArgs,
        env: startEnv,
      });
    }
  );
  process.exit(exitCode);
};

const isUnsafeWranglerBootstrapSource = (source: string): boolean => {
  const getKernelIndex = source.indexOf('getKernel(');
  const cloudflareFetchIndex = source.indexOf('cloudflareWorker.fetch');

  return (
    getKernelIndex !== -1 && cloudflareFetchIndex !== -1 && getKernelIndex < cloudflareFetchIndex
  );
};

const warnOnUnsafeWranglerBootstrap = (
  cmd: IBaseCommand,
  cwd: string,
  entry: string | undefined
): void => {
  if (entry === undefined) return;

  const entryPath = path.join(cwd, entry);
  if (!existsSync(entryPath)) return;

  try {
    const source = readFileSync(entryPath, 'utf-8');
    if (!isUnsafeWranglerBootstrapSource(source)) return;

    cmd.warn(
      `Unsafe Worker bootstrap detected in ${entry}: getKernel() runs before the core Cloudflare handler initializes Worker bindings.`
    );
    cmd.warn(
      'Use `export { default } from "@zintrust/core/start"` and keep custom middleware registration in config/middleware.ts or route metadata.'
    );
  } catch {
    // Best-effort warning only.
  }
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
  context: StartContext,
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

  const startModuleSpecifier = resolveRuntimeStartModuleSpecifier(context.cwd);
  const denoRunner = ensureTmpRunnerFile(
    context.cwd,
    'zin-start-deno.ts',
    createDenoRunnerSource(startModuleSpecifier)
  );

  const args: string[] = [];
  if (mode === 'development' && watchEnabled) args.push('watch');
  args.push(denoRunner);

  cmd.info('Starting in Deno adapter mode...');
  const exitCode = await SpawnUtil.spawnAndWait({
    command: 'tsx',
    args,
    env: buildStartEnv(context.projectRoot),
  });
  process.exit(exitCode);
};

const executeLambdaStart = async (
  cmd: IBaseCommand,
  context: StartContext,
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

  const startModuleSpecifier = resolveRuntimeStartModuleSpecifier(context.cwd);
  const lambdaRunner = ensureTmpRunnerFile(
    context.cwd,
    'zin-start-lambda.ts',
    createLambdaRunnerSource(startModuleSpecifier)
  );

  const args: string[] = [];
  if (mode === 'development' && watchEnabled) args.push('watch');
  args.push(lambdaRunner);

  cmd.info('Starting in Lambda adapter mode...');
  const exitCode = await SpawnUtil.spawnAndWait({
    command: 'tsx',
    args,
    env: buildStartEnv(context.projectRoot),
  });
  process.exit(exitCode);
};

const executeNodeStart = async (
  cmd: IBaseCommand,
  context: StartContext,
  mode: StartMode,
  watchEnabled: boolean,
  _port: number | undefined
): Promise<void> => {
  if (mode === 'testing') {
    throw ErrorFactory.createCliError(
      'Error: Cannot start server in testing mode. Use --force to override (not supported).'
    );
  }

  if (mode === 'development') {
    if (!watchEnabled) {
      cmd.warn('Watch mode disabled; starting once.');
      const args = [ensureNodeSourceRunner(context.cwd)];

      const exitCode = await SpawnUtil.spawnAndWait({
        command: 'tsx',
        args,
        forwardSignals: false,
        env: {
          ...buildStartEnv(context.projectRoot),
          ZINTRUST_BOOTSTRAP_PREFERENCE: 'source',
        },
      });
      process.exit(exitCode);
    }

    const dev = resolveNodeDevCommand(context.cwd, requirePackageJson(context));
    cmd.info('Starting in development mode (watch enabled)...');
    const exitCode = await SpawnUtil.spawnAndWait({
      command: dev.command,
      args: dev.args,
      forwardSignals: false,
      ttySignalForwardDelayMs: 1500,
      env: {
        ...buildStartEnv(context.projectRoot),
        ZINTRUST_BOOTSTRAP_PREFERENCE: 'source',
      },
    });
    process.exit(exitCode);
  }

  const prod = resolveNodeProdCommand(context.cwd);
  cmd.info('Starting in production mode...');
  const exitCode = await SpawnUtil.spawnAndWait({
    command: prod.command,
    args: prod.args,
    forwardSignals: false,
    env: {
      ...buildStartEnv(context.projectRoot),
      ZINTRUST_BOOTSTRAP_PREFERENCE: runFromSource() ? 'source' : 'compiled',
    },
  });
  process.exit(exitCode);
};

const executeSplitStart = async (
  cmd: IBaseCommand,
  context: StartContext,
  _options: StartCommandOptions
): Promise<void> => {
  cmd.info('🚀 Starting in split mode (Producer + Consumer)...');

  const webDev = resolveNodeDevCommand(context.cwd, requirePackageJson(context));

  // Producer Environment
  const producerEnv = {
    ...buildStartEnv(context.projectRoot),
    WORKER_ENABLED: 'false',
    QUEUE_ENABLED: 'true',
    RUNTIME_MODE: 'node-server',
  };

  // Consumer Environment
  const consumerEnv = {
    ...buildStartEnv(context.projectRoot),
    WORKER_ENABLED: 'true',
    QUEUE_ENABLED: 'true',
    RUNTIME_MODE: 'containers',
    WORKER_AUTO_START: 'true',
    // Prevent consumer from binding to the web port
    APP_PORT: '0',
    PORT: '0',
  };

  // Resolve Consumer Command (zintrust worker:start-all)
  // We try to use tsx against the source bin if possible
  const workerArgs = existsSync(path.join(context.projectRoot, 'bin/zin.ts'))
    ? ['bin/zin.ts', 'worker:start-all']
    : ['dist/bin/zin.js', 'worker:start-all'];

  const workerCommand = existsSync(path.join(context.projectRoot, 'bin/zin.ts')) ? 'tsx' : 'node';

  cmd.info('-------------------------------------------');
  cmd.info('🔹 [Producer] Web Server starting...');
  cmd.info('🔸 [Consumer] Worker Process starting...');
  cmd.info('-------------------------------------------');

  const pProducer = SpawnUtil.spawnAndWait({
    command: webDev.command,
    args: webDev.args,
    cwd: context.cwd,
    env: producerEnv,
    forwardSignals: true,
  });

  const pConsumer = SpawnUtil.spawnAndWait({
    command: workerCommand,
    args: workerArgs,
    cwd: context.projectRoot,
    env: consumerEnv,
    forwardSignals: true,
  });

  await Promise.all([pProducer, pConsumer]);
};

const executeStart = async (options: StartCommandOptions, cmd: IBaseCommand): Promise<void> => {
  const cwd = process.cwd();
  const context = resolveStartContext(cwd);
  process.env['ZINTRUST_PROJECT_ROOT'] = context.projectRoot;
  ensureStartEnvLoaded(context, options);
  await preloadManifestServiceEnv(context, options);
  const mode = resolveMode(options);
  const port = resolvePort(options, context.cwd);
  const runtime = resolveRuntime(options);
  const configuredRuntime = resolveConfiguredRuntime(options);
  const variant = resolveStartVariant(options);
  const envName = typeof options.env === 'string' ? options.env.trim() : '';
  let effectiveRuntime = runtime;
  if (variant === 'deno') effectiveRuntime = 'deno';
  if (variant === 'lambda') effectiveRuntime = 'lambda';

  if (mode === 'split') {
    await executeSplitStart(cmd, context, options);
    return;
  }

  assertCompatibleStartVariant(variant, configuredRuntime);

  const cacheEnabled = resolveCacheEnabledPreference(options);
  EnvFileLoader.applyCliOverrides({
    nodeEnv: mode,
    port,
    runtime: effectiveRuntime,
    ...(typeof cacheEnabled === 'boolean' ? { cacheEnabled } : {}),
  });

  if (variant === 'wrangler') {
    const wranglerConfig =
      typeof options.wranglerConfig === 'string' && options.wranglerConfig.trim() !== ''
        ? options.wranglerConfig.trim()
        : undefined;
    const envPath = resolveEnvPath(options, context.projectRoot);

    await executeWranglerStart(
      cmd,
      context,
      port,
      runtime,
      envName === '' ? undefined : envName,
      wranglerConfig,
      envPath
    );
    return;
  }

  if (envName !== '') {
    throw ErrorFactory.createCliError('Error: --env is only supported with --wrangler/--wg.');
  }

  const watchEnabled = resolveWatchPreference(options, mode);

  if (variant === 'deno') {
    await executeDenoStart(cmd, context, mode, watchEnabled, port, runtime);
    return;
  }

  if (variant === 'lambda') {
    await executeLambdaStart(cmd, context, mode, watchEnabled, port, runtime);
    return;
  }
  await executeNodeStart(cmd, context, mode, watchEnabled, port);
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
        .option('--cache', 'Enable cache functionality')
        .option('--no-cache', 'Disable cache functionality')
        .option('--watch', 'Force watch mode (Node only)')
        .option('--no-watch', 'Disable watch mode (Node only)')
        .option('--root-env', 'Load root project .env files for standalone service start')
        .option('--no-root-env', 'Skip root project .env files for standalone service start')
        .option('--mode <development|production|testing>', 'Override app mode')
        .option('--env <name>', 'Wrangler environment name (Wrangler mode only)')
        .option(
          '--env-path <path>',
          'Explicit env directory or .env file path for standalone service start'
        )
        .option('--wrangler-config <path>', 'Wrangler config path (Wrangler mode only)')
        .option('--runtime <nodejs|cloudflare|lambda|deno|auto>', 'Set RUNTIME for spawned Node')
        .option('-p, --port <number>', 'Override server port');
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

  _helpers: {
    isWranglerVarName,
    toUpperSnakeCaseIdentifier,
    isWindowsDriveAbsolutePath,
    containsCommandToken,
    containsZinCommand,
  },
});
