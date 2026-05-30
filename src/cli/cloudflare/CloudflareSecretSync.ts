import {
  readZintrustConfig,
  resolveCloudflareEnvKeys,
} from '@cli/cloudflare/CloudflareEnvTargetConfig';
import { resolveNpmPath } from '@common/index';
import { appConfig } from '@config/app';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { execFileSync } from '@node-singletons/child-process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from '@node-singletons/fs';
import { tmpdir } from '@node-singletons/os';
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
  directKeys?: string[];
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
  directKeys?: string[];
  inlineValues?: Record<string, string>;
  configPath?: string;
  target?: string;
  bulk?: boolean;
  requireSelection?: boolean;
  all?: boolean;
};

type ProcessSecretSyncArgs = {
  log: CloudflareSecretLog;
  wranglerEnvs: string[];
  selectedKeys: string[];
  envMap: Record<string, string>;
  dryRun: boolean;
  configPath: string | undefined;
  inlineValues: Record<string, string>;
  envPath: string;
  all: boolean;
};

export type CloudflareSecretSyncResult = {
  pushed: number;
  pushedKeys: string[];
  skippedEmptyKeys: string[];
  failures: CloudflareSecretSyncFailure[];
  selectedKeys: string[];
};

type CloudflareSecretSyncProgress = {
  pushed: number;
  pushedKeys: string[];
  skippedEmptyKeys: string[];
  failures: CloudflareSecretSyncFailure[];
};

export const uniq = (items: string[]): string[] => {
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

const createSyncProgress = (): CloudflareSecretSyncProgress => {
  return {
    pushed: 0,
    pushedKeys: [],
    skippedEmptyKeys: [],
    failures: [],
  };
};

const forEachWranglerEnv = (
  wranglerEnvs: string[],
  callback: (wranglerEnv: string, wranglerEnvLabel: string) => void
): void => {
  for (const wranglerEnv of wranglerEnvs) {
    callback(wranglerEnv, describeWranglerEnv(wranglerEnv));
  }
};

const getConfigArray = (config: Record<string, unknown>, key: string): string[] => {
  const raw = config[key];
  if (!Array.isArray(raw)) return [];
  return uniq(raw.filter((item): item is string => typeof item === 'string'));
};

export const resolveValue = (
  key: string,
  envMap: Record<string, string>,
  envPath: string,
  all: boolean = false
): string => {
  const fromFile = envMap[key];
  const fromProcess = process.env[key];
  const isCustomEnvFile = envPath !== '.env' && envPath.trim() !== '';

  // If custom env file is provided and all is false, only use values from the custom file
  if (isCustomEnvFile && !all) {
    return fromFile ?? '';
  }

  // Default behavior: fallback to process.env
  return fromFile ?? fromProcess ?? '';
};

const resolveValueWithOverrides = (
  key: string,
  envMap: Record<string, string>,
  inlineValues: Record<string, string>,
  envPath: string,
  all: boolean = false
): string => {
  const inlineValue = inlineValues[key];
  if (typeof inlineValue === 'string') return inlineValue;
  return resolveValue(key, envMap, envPath, all);
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

const putSecretBulk = (
  wranglerEnv: string,
  payloadPath: string,
  configPath: string | undefined
): void => {
  const npmPath = resolveNpmPath();
  const args = ['exec', '--yes', '--', 'wrangler'];

  if (typeof configPath === 'string' && configPath.trim() !== '') {
    args.push('--config', configPath.trim());
  }

  args.push('secret', 'bulk', payloadPath);

  if (wranglerEnv.trim() === '') {
    args.push('--env=');
  } else {
    args.push('--env', wranglerEnv);
  }

  execFileSync(npmPath, args, {
    stdio: ['ignore', 'inherit', 'inherit'],
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
  directKeys = [],
  configPath,
  target,
  requireSelection,
}: ResolveSelectedKeysArgs): string[] => {
  const selectedDirectKeys = uniq(directKeys);
  if (selectedDirectKeys.length > 0) {
    return selectedDirectKeys;
  }

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
      ? 'No secret keys resolved from explicit keys or .zintrust.json cloudflare.shared_env/cloudflare.targets/cloudflare.wrangler_envs. Use --key/--keys, --var <group>, or add a Cloudflare env manifest.'
      : 'No secret keys resolved from selected groups.'
  );
};

type ResolvedBulkPayload = {
  payload: Record<string, string>;
  includedKeys: string[];
  skippedEmptyKeys: string[];
};

const resolveBulkPayload = (
  log: CloudflareSecretLog,
  wranglerEnv: string,
  selectedKeys: string[],
  envMap: Record<string, string>,
  inlineValues: Record<string, string>,
  envPath: string,
  all: boolean = false
): ResolvedBulkPayload => {
  const payload: Record<string, string> = {};
  const includedKeys: string[] = [];
  const skippedEmptyKeys: string[] = [];
  const wranglerEnvLabel = describeWranglerEnv(wranglerEnv);

  for (const key of selectedKeys) {
    const value = resolveValueWithOverrides(key, envMap, inlineValues, envPath, all);
    if (value.trim() === '') {
      log.warn(`skip ${key} -> ${wranglerEnvLabel}: empty value`);
      skippedEmptyKeys.push(key);
      continue;
    }

    payload[key] = value;
    includedKeys.push(key);
  }

  return { payload, includedKeys, skippedEmptyKeys };
};

const processSecretSync = (args: ProcessSecretSyncArgs): CloudflareSecretSyncProgress => {
  const {
    log,
    wranglerEnvs,
    selectedKeys,
    envMap,
    dryRun,
    configPath,
    inlineValues,
    envPath,
    all,
  } = args;
  const progress = createSyncProgress();

  forEachWranglerEnv(wranglerEnvs, (wranglerEnv, wranglerEnvLabel) => {
    for (const key of selectedKeys) {
      const value = resolveValueWithOverrides(key, envMap, inlineValues, envPath, all);
      if (value.trim() === '') {
        log.warn(`skip ${key} -> ${wranglerEnvLabel}: empty value`);
        progress.skippedEmptyKeys.push(key);
        continue;
      }

      try {
        if (!dryRun) {
          log.info(`putting ${key} -> ${wranglerEnvLabel}...`);
          putSecret(wranglerEnv, key, value, configPath);
        }
        progress.pushed += 1;
        progress.pushedKeys.push(key);
        log.info(`${dryRun ? '[dry-run] ' : ''}put ${key} -> ${wranglerEnvLabel}`);
      } catch (error) {
        progress.failures.push({ wranglerEnv, key, reason: getFailureReason(error) });
      }
    }
  });

  return progress;
};

const processSecretBulkSync = (args: ProcessSecretSyncArgs): CloudflareSecretSyncProgress => {
  const {
    log,
    wranglerEnvs,
    selectedKeys,
    envMap,
    dryRun,
    configPath,
    inlineValues,
    envPath,
    all,
  } = args;
  const progress = createSyncProgress();

  forEachWranglerEnv(wranglerEnvs, (wranglerEnv, wranglerEnvLabel) => {
    const {
      payload,
      includedKeys,
      skippedEmptyKeys: skippedForEnv,
    } = resolveBulkPayload(log, wranglerEnv, selectedKeys, envMap, inlineValues, envPath, all);

    progress.skippedEmptyKeys.push(...skippedForEnv);

    if (includedKeys.length === 0) {
      log.info(`skip bulk upload -> ${wranglerEnvLabel}: no non-empty keys`);
      return;
    }

    log.info(
      `${dryRun ? '[dry-run] ' : ''}bulk keys -> ${wranglerEnvLabel}: ${includedKeys.join(', ')}`
    );

    if (dryRun) {
      progress.pushed += includedKeys.length;
      progress.pushedKeys.push(...includedKeys);
      return;
    }

    const tempDir = mkdtempSync(path.join(tmpdir(), 'zintrust-cloudflare-secret-bulk-'));
    const payloadPath = path.join(tempDir, 'secrets.json');

    try {
      writeFileSync(payloadPath, JSON.stringify(payload, null, 2), 'utf8');
      log.info(`bulk uploading ${includedKeys.length} key(s) -> ${wranglerEnvLabel}...`);
      putSecretBulk(wranglerEnv, payloadPath, configPath);
      progress.pushed += includedKeys.length;
      progress.pushedKeys.push(...includedKeys);
      log.info(`bulk put ${includedKeys.length} key(s) -> ${wranglerEnvLabel}`);
    } catch (error) {
      const reason = getFailureReason(error);
      for (const key of includedKeys) {
        progress.failures.push({ wranglerEnv, key, reason });
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  return progress;
};

export const reportCloudflareSecretSync = (
  log: CloudflareSecretLog,
  result: Pick<CloudflareSecretSyncResult, 'pushed' | 'skippedEmptyKeys' | 'failures'>
): void => {
  if (typeof log.success === 'function') {
    log.success(
      `Cloudflare secrets report: pushed=${result.pushed}, skipped_empty=${result.skippedEmptyKeys.length}, failed=${result.failures.length}`
    );
  } else {
    log.info(
      `Cloudflare secrets report: pushed=${result.pushed}, skipped_empty=${result.skippedEmptyKeys.length}, failed=${result.failures.length}`
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
  directKeys = [],
  inlineValues = {},
  configPath,
  target,
  bulk = false,
  requireSelection = true,
  all = false,
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
    directKeys,
    configPath: normalizedConfigPath,
    target,
    requireSelection,
  });

  if (selectedKeys.length === 0) {
    return { pushed: 0, pushedKeys: [], skippedEmptyKeys: [], failures: [], selectedKeys: [] };
  }

  const envMap = await EnvFile.read({ cwd, path: envPath });
  const syncResult = bulk
    ? processSecretBulkSync({
        log,
        wranglerEnvs,
        selectedKeys,
        envMap,
        dryRun,
        configPath: normalizedConfigPath,
        inlineValues,
        envPath,
        all,
      })
    : processSecretSync({
        log,
        wranglerEnvs,
        selectedKeys,
        envMap,
        dryRun,
        configPath: normalizedConfigPath,
        inlineValues,
        envPath,
        all,
      });

  return {
    ...syncResult,
    selectedKeys,
  };
};

export default Object.freeze({
  syncCloudflareSecrets,
  reportCloudflareSecretSync,
});
