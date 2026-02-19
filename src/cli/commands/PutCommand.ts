import { BaseCommand, type CommandOptions, type IBaseCommand } from '@cli/BaseCommand';
import { resolveNpmPath } from '@common/index';
import { appConfig } from '@config/app';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { execFileSync } from '@node-singletons/child-process';
import { existsSync, readFileSync } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { EnvFile } from '@toolkit/Secrets/EnvFile';
import type { Command } from 'commander';

type PutCommandOptions = CommandOptions & {
  wg?: string[] | string;
  var?: string[] | string;
  env_path?: string;
  dryRun?: boolean;
  config?: string;
};

type ZintrustConfig = Record<string, unknown>;

type PutFailure = {
  wranglerEnv: string;
  key: string;
  reason: string;
};

const toStringArray = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
};

const uniq = (items: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const normalized = item.trim();
    if (normalized === '' || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
};

const readZintrustConfig = (cwd: string): ZintrustConfig => {
  const filePath = path.join(cwd, '.zintrust.json');
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as ZintrustConfig) : {};
  } catch (error) {
    throw ErrorFactory.createCliError('Failed to parse .zintrust.json', error);
  }
};

const getConfigArray = (config: ZintrustConfig, key: string): string[] => {
  const raw = config[key];
  if (!Array.isArray(raw)) return [];
  return uniq(raw.filter((item): item is string => typeof item === 'string'));
};

const resolveConfigGroups = (options: PutCommandOptions): string[] => {
  return uniq(toStringArray(options.var));
};

const resolveWranglerEnvs = (options: PutCommandOptions): string[] => {
  const requested = uniq(toStringArray(options.wg));
  if (requested.length === 0) return ['worker'];
  return requested;
};

const parseEnvPath = (options: PutCommandOptions): string => {
  const direct = options['env_path'];
  if (typeof direct === 'string' && direct.trim() !== '') return direct;
  return '.env';
};

const resolveValue = (key: string, envMap: Record<string, string>): string => {
  const fromFile = envMap[key];
  const fromProcess = process.env[key];
  return fromFile ?? fromProcess ?? '';
};

const getPutTimeoutMs = (): number => {
  const raw = process.env['ZT_PUT_TIMEOUT_MS'];
  if (typeof raw !== 'string') return 120000;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 120000;
  return parsed;
};

const putSecret = (
  wranglerEnv: string,
  key: string,
  value: string,
  configPath: string | undefined
): void => {
  const npmPath = resolveNpmPath();

  const args = ['exec', '--yes', '--', 'wrangler'];
  if (typeof configPath === 'string' && configPath.trim().length > 0) {
    args.push('--config', configPath.trim());
  }
  args.push('secret', 'put', key, '--env', wranglerEnv);

  execFileSync(npmPath, args, {
    stdio: ['pipe', 'inherit', 'inherit'],
    input: value,
    encoding: 'utf8',
    timeout: getPutTimeoutMs(),
    killSignal: 'SIGTERM',
    env: appConfig.getSafeEnv(),
  });
};

const addOptions = (command: Command): void => {
  command
    .argument('[provider]', 'Secret provider (cloudflare)', 'cloudflare')
    .option('--wg <env...>', 'Wrangler environment target(s), e.g. d1-proxy kv-proxy')
    .option('--var <configKey...>', 'Config array key(s) from .zintrust.json (e.g. d1_env kv_env)')
    .option('--env_path <path>', 'Path to env file used as source values', '.env')
    .option('-c, --config <path>', 'Wrangler config file to target (optional)')
    .option('--dry-run', 'Show what would be uploaded without calling wrangler');
};

const ensureCloudflareProvider = (providerRaw: string): void => {
  if (providerRaw.toLowerCase() === 'cloudflare') return;
  throw ErrorFactory.createCliError('Only cloudflare provider is supported for `zin put`');
};

const resolveSelectedKeys = (
  cmd: IBaseCommand,
  config: ZintrustConfig,
  options: PutCommandOptions
): string[] => {
  const configGroups = resolveConfigGroups(options);
  if (configGroups.length === 0) {
    throw ErrorFactory.createCliError('No config groups selected. Use --var <group>.');
  }

  const selectedKeys = uniq(
    configGroups.flatMap((groupKey) => {
      const keys = getConfigArray(config, groupKey);
      if (keys.length === 0) {
        cmd.warn(`Group \`${groupKey}\` is missing or empty in .zintrust.json`);
      }
      return keys;
    })
  );

  if (selectedKeys.length === 0) {
    throw ErrorFactory.createCliError('No secret keys resolved from selected groups.');
  }

  return selectedKeys;
};

const getFailureReason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const reportResult = (cmd: IBaseCommand, pushed: number, failures: PutFailure[]): void => {
  cmd.success(`Cloudflare secrets report: pushed=${pushed}, failed=${failures.length}`);
  for (const item of failures) {
    cmd.warn(`${item.key} -> ${item.wranglerEnv}: ${item.reason}`);
  }
};

const processPut = (
  cmd: IBaseCommand,
  wranglerEnvs: string[],
  selectedKeys: string[],
  envMap: Record<string, string>,
  dryRun: boolean,
  configPath: string | undefined
): { pushed: number; failures: PutFailure[] } => {
  let pushed = 0;
  const failures: PutFailure[] = [];

  for (const wranglerEnv of wranglerEnvs) {
    for (const key of selectedKeys) {
      const value = resolveValue(key, envMap);
      if (value.trim() === '') {
        failures.push({ wranglerEnv, key, reason: 'empty value' });
        continue;
      }

      try {
        if (!dryRun) {
          cmd.info(`putting ${key} -> ${wranglerEnv}...`);
          putSecret(wranglerEnv, key, value, configPath);
        }
        pushed += 1;
        cmd.info(`${dryRun ? '[dry-run] ' : ''}put ${key} -> ${wranglerEnv}`);
      } catch (error) {
        failures.push({ wranglerEnv, key, reason: getFailureReason(error) });
      }
    }
  }

  return { pushed, failures };
};

const execute = async (cmd: IBaseCommand, options: PutCommandOptions): Promise<void> => {
  ensureCloudflareProvider(String(options.args?.[0] ?? 'cloudflare'));

  const cwd = process.cwd();
  const config = readZintrustConfig(cwd);
  const selectedKeys = resolveSelectedKeys(cmd, config, options);

  const envFilePath = parseEnvPath(options);
  const envMap = await EnvFile.read({ cwd, path: envFilePath });
  const wranglerEnvs = resolveWranglerEnvs(options);
  const dryRun = options.dryRun === true;

  const configPath = typeof options.config === 'string' ? options.config.trim() : '';
  if (configPath !== '' && !existsSync(path.join(cwd, configPath))) {
    throw ErrorFactory.createCliError(`Wrangler config not found: ${configPath}`);
  }

  const result = processPut(
    cmd,
    wranglerEnvs,
    selectedKeys,
    envMap,
    dryRun,
    configPath === '' ? undefined : configPath
  );
  reportResult(cmd, result.pushed, result.failures);
};

export const PutCommand = Object.freeze({
  create(): IBaseCommand {
    const cmd: IBaseCommand = BaseCommand.create({
      name: 'put',
      description: 'Put secrets to Cloudflare with dynamic groups from .zintrust.json',
      addOptions,
      execute: async (options: CommandOptions): Promise<void> =>
        execute(cmd, options as PutCommandOptions),
    });

    return cmd;
  },
});

export default PutCommand;
