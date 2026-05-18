import {
  readZintrustConfig,
  resolveCloudflareEnvKeys,
} from '@cli/cloudflare/CloudflareEnvTargetConfig';
import { resolveNpmPath } from '@common/index';
import { appConfig } from '@config/app';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { execFileSync } from '@node-singletons/child-process';
import { existsSync } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { EnvFile } from '@toolkit/Secrets/EnvFile';

type CloudflareSecretLog = {
  info: (message: string) => void;
  warn: (message: string) => void;
  success?: (message: string) => void;
};

export type CloudflareSecretSyncFailure = {
  wranglerEnv: string;
  key: string;
  reason: string;
};

type ResolveSelectedKeysArgs = {
  log: CloudflareSecretLog;
  config: Record<string, unknown>;
  cwd: string;
  wranglerEnvs: string[];
  configGroups?: string[];
  configPath?: string;
  target?: string;
  requireSelection: boolean;
};

type CloudflareSecretSyncArgs = {
  log: CloudflareSecretLog;
  cwd: string;
  wranglerEnvs: string[];
  envPath: string;
  dryRun?: boolean;
  configGroups?: string[];
  configPath?: string;
  target?: string;
  requireSelection?: boolean;
};

export type CloudflareSecretSyncResult = {
  pushed: number;
  failures: CloudflareSecretSyncFailure[];
  selectedKeys: string[];
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

const getConfigArray = (config: Record<string, unknown>, key: string): string[] => {
  const raw = config[key];
  if (!Array.isArray(raw)) return [];
  return uniq(raw.filter((item): item is string => typeof item === 'string'));
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

const describeWranglerEnv = (wranglerEnv: string): string =>
  wranglerEnv.trim() === '' ? 'top-level worker' : wranglerEnv;

const putSecret = (
  wranglerEnv: string,
  key: string,
  value: string,
  configPath: string | undefined
): void => {
  const npmPath = resolveNpmPath();
  const args = ['exec', '--yes', '--', 'wrangler'];

  if (typeof configPath === 'string' && configPath.trim() !== '') {
    args.push('--config', configPath.trim());
  }

  args.push('secret', 'put', key);

  if (wranglerEnv.trim() === '') {
    args.push('--env=');
  } else {
    args.push('--env', wranglerEnv);
  }

  execFileSync(npmPath, args, {
    stdio: ['pipe', 'inherit', 'inherit'],
    input: value,
    encoding: 'utf8',
    timeout: getPutTimeoutMs(),
    killSignal: 'SIGTERM',
    env: appConfig.getSafeEnv(),
  });
};

const getFailureReason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const resolveSelectedKeys = ({
  log,
  config,
  cwd,
  wranglerEnvs,
  configGroups = [],
  configPath,
  target,
  requireSelection,
}: ResolveSelectedKeysArgs): string[] => {
  const explicitKeys = uniq(
    configGroups.flatMap((groupKey) => {
      const keys = getConfigArray(config, groupKey);
      if (keys.length === 0) {
        log.warn(`Group \`${groupKey}\` is missing or empty in .zintrust.json`);
      }
      return keys;
    })
  );

  const manifestKeys = uniq(
    wranglerEnvs.flatMap((wranglerEnv) =>
      resolveCloudflareEnvKeys({
        config,
        projectRoot: cwd,
        cwd,
        ...(configPath === undefined ? {} : { configPath }),
        wranglerEnv,
        ...(typeof target === 'string' && target.trim() !== '' ? { target: target.trim() } : {}),
      })
    )
  );

  const selectedKeys = uniq([...explicitKeys, ...manifestKeys]);

  if (selectedKeys.length > 0 || !requireSelection) {
    return selectedKeys;
  }

  throw ErrorFactory.createCliError(
    configGroups.length === 0
      ? 'No secret keys resolved from .zintrust.json cloudflare.shared_env/cloudflare.targets/cloudflare.wrangler_envs. Use --var <group> or add a Cloudflare env manifest.'
      : 'No secret keys resolved from selected groups.'
  );
};

const processSecretSync = (
  log: CloudflareSecretLog,
  wranglerEnvs: string[],
  selectedKeys: string[],
  envMap: Record<string, string>,
  dryRun: boolean,
  configPath: string | undefined
): { pushed: number; failures: CloudflareSecretSyncFailure[] } => {
  let pushed = 0;
  const failures: CloudflareSecretSyncFailure[] = [];

  for (const wranglerEnv of wranglerEnvs) {
    const wranglerEnvLabel = describeWranglerEnv(wranglerEnv);

    for (const key of selectedKeys) {
      const value = resolveValue(key, envMap);
      if (value.trim() === '') {
        log.warn(`skip ${key} -> ${wranglerEnvLabel}: empty value`);
        continue;
      }

      try {
        if (!dryRun) {
          log.info(`putting ${key} -> ${wranglerEnvLabel}...`);
          putSecret(wranglerEnv, key, value, configPath);
        }
        pushed += 1;
        log.info(`${dryRun ? '[dry-run] ' : ''}put ${key} -> ${wranglerEnvLabel}`);
      } catch (error) {
        failures.push({ wranglerEnv, key, reason: getFailureReason(error) });
      }
    }
  }

  return { pushed, failures };
};

export const reportCloudflareSecretSync = (
  log: CloudflareSecretLog,
  result: Pick<CloudflareSecretSyncResult, 'pushed' | 'failures'>
): void => {
  if (typeof log.success === 'function') {
    log.success(
      `Cloudflare secrets report: pushed=${result.pushed}, failed=${result.failures.length}`
    );
  } else {
    log.info(
      `Cloudflare secrets report: pushed=${result.pushed}, failed=${result.failures.length}`
    );
  }

  for (const item of result.failures) {
    log.warn(`${item.key} -> ${describeWranglerEnv(item.wranglerEnv)}: ${item.reason}`);
  }
};

export const syncCloudflareSecrets = async ({
  log,
  cwd,
  wranglerEnvs,
  envPath,
  dryRun = false,
  configGroups = [],
  configPath,
  target,
  requireSelection = true,
}: CloudflareSecretSyncArgs): Promise<CloudflareSecretSyncResult> => {
  const normalizedConfigPath =
    typeof configPath === 'string' && configPath.trim() !== '' ? configPath.trim() : undefined;
  if (normalizedConfigPath !== undefined && !existsSync(path.join(cwd, normalizedConfigPath))) {
    throw ErrorFactory.createCliError(`Wrangler config not found: ${normalizedConfigPath}`);
  }

  const config = readZintrustConfig(cwd);
  const selectedKeys = resolveSelectedKeys({
    log,
    config,
    cwd,
    wranglerEnvs,
    configGroups,
    configPath: normalizedConfigPath,
    target,
    requireSelection,
  });

  if (selectedKeys.length === 0) {
    return { pushed: 0, failures: [], selectedKeys: [] };
  }

  const envMap = await EnvFile.read({ cwd, path: envPath });
  const syncResult = processSecretSync(
    log,
    wranglerEnvs,
    selectedKeys,
    envMap,
    dryRun,
    normalizedConfigPath
  );

  return {
    ...syncResult,
    selectedKeys,
  };
};

export default Object.freeze({
  syncCloudflareSecrets,
  reportCloudflareSecretSync,
});
