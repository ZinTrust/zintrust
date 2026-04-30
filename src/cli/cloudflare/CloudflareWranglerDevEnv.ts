import {
  readZintrustConfig,
  resolveCloudflareEnvKeys,
} from '@cli/cloudflare/CloudflareEnvTargetConfig';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { isNonEmptyString } from '@helper/index';
import { existsSync, renameSync, unlinkSync } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { EnvFile } from '@toolkit/Secrets/EnvFile';

type WranglerDevEnvArgs = {
  cwd: string;
  projectRoot: string;
  envName?: string;
  envPath?: string;
  configPath?: string;
  target?: string;
  runtimeEnv?: NodeJS.ProcessEnv;
  requireSelection?: boolean;
};

export type WranglerDevEnvMaterializationResult = {
  filePath: string;
  selectedKeys: string[];
  missingKeys: string[];
  values: Record<string, string>;
};

const WRANGLER_RUNTIME_ENV_KEYS = Object.freeze([
  'APP_PORT',
  'CLOUDFLARE_WORKER',
  'DOCKER_WORKER',
  'ENVIRONMENT',
  'HOST',
  'NODE_ENV',
  'PORT',
  'RUNTIME',
  'SERVICE_DOMAIN',
  'SERVICE_NAME',
  'SERVICE_PORT',
  'WORKER_ENABLED',
  'ZINTRUST_PROJECT_ROOT',
]);

const isAsciiUppercaseLetter = (value: string): boolean => value >= 'A' && value <= 'Z';

const isAsciiDigit = (value: string): boolean => value >= '0' && value <= '9';

const isWranglerWordCharacter = (value: string): boolean =>
  isAsciiUppercaseLetter(value) || isAsciiDigit(value) || value === '_';

const isWranglerVarName = (value: string): boolean => {
  if (value.length === 0) return false;

  const first = value[0] ?? '';
  if (!(isAsciiUppercaseLetter(first) || first === '_')) return false;

  for (let index = 1; index < value.length; index += 1) {
    if (!isWranglerWordCharacter(value[index] ?? '')) return false;
  }

  return true;
};

const uniq = (items: string[]): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of items) {
    const normalized = item.trim();
    if (normalized === '' || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
};

const getNormalizedEnvName = (envName: string | undefined): string => {
  return typeof envName === 'string' ? envName.trim() : '';
};

const getWranglerDevVarsFileName = (envName?: string): string => {
  const normalizedEnv = getNormalizedEnvName(envName);
  return normalizedEnv === '' ? '.dev.vars' : `.dev.vars.${normalizedEnv}`;
};

const getWranglerDevVarsBackupPath = (targetPath: string): string =>
  `${targetPath}.disabled-by-zin`;

const reconcileWranglerEnvBackup = (targetPath: string, backupPath: string): void => {
  const hasTarget = existsSync(targetPath);
  const hasBackup = existsSync(backupPath);

  if (!hasBackup) return;

  if (!hasTarget) {
    renameSync(backupPath, targetPath);
    return;
  }

  unlinkSync(backupPath);
};

const resolveRuntimeEnvMap = (runtimeEnv: NodeJS.ProcessEnv): Record<string, string> => {
  return Object.fromEntries(
    Object.entries(runtimeEnv).filter((entry): entry is [string, string] => {
      return typeof entry[1] === 'string';
    })
  );
};

const readExistingWranglerDevVars = async (
  args: WranglerDevEnvArgs
): Promise<Record<string, string>> => {
  const fileName = getWranglerDevVarsFileName(args.envName);
  const targetPath = path.join(args.cwd, fileName);
  const backupPath = getWranglerDevVarsBackupPath(targetPath);

  let sourcePath: string | undefined;

  if (existsSync(targetPath)) {
    sourcePath = fileName;
  } else if (existsSync(backupPath)) {
    sourcePath = path.basename(backupPath);
  }

  if (sourcePath === undefined) return {};

  return EnvFile.read({
    cwd: args.cwd,
    path: sourcePath,
  });
};

const isTruthyEnvValue = (value: string | undefined): boolean => {
  if (!isNonEmptyString(value)) return false;

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const shouldUseEnvFileDirectly = async (args: WranglerDevEnvArgs): Promise<boolean> => {
  const runtimeEnv = resolveRuntimeEnvMap(args.runtimeEnv ?? process.env);
  if (isTruthyEnvValue(runtimeEnv['USE_ENV'])) {
    return true;
  }

  const envPath = isNonEmptyString(args.envPath) ? args.envPath.trim() : '.env';
  const envFileValues = await EnvFile.read({
    cwd: args.projectRoot,
    path: envPath,
  });

  return isTruthyEnvValue(envFileValues['USE_ENV']);
};

const resolveSelectedKeys = (args: WranglerDevEnvArgs): string[] => {
  const zintrustConfigPath = path.join(args.projectRoot, '.zintrust.json');
  if (!existsSync(zintrustConfigPath)) {
    if (args.requireSelection === true) {
      throw ErrorFactory.createCliError(
        'No .zintrust.json found. Add a Cloudflare env manifest before generating Wrangler dev vars.'
      );
    }

    return [];
  }

  const selectedKeys = resolveCloudflareEnvKeys({
    config: readZintrustConfig(args.projectRoot),
    projectRoot: args.projectRoot,
    cwd: args.cwd,
    ...(isNonEmptyString(args.configPath) ? { configPath: args.configPath.trim() } : {}),
    ...(isNonEmptyString(args.envName) ? { wranglerEnv: args.envName.trim() } : {}),
    ...(isNonEmptyString(args.target) ? { target: args.target.trim() } : {}),
  });

  if (selectedKeys.length === 0 && args.requireSelection === true) {
    throw ErrorFactory.createCliError(
      'No Wrangler dev env keys resolved from .zintrust.json cloudflare.shared_env/cloudflare.targets/cloudflare.wrangler_envs.'
    );
  }

  return selectedKeys;
};

const collectWranglerDevVarValues = async (
  args: WranglerDevEnvArgs,
  selectedKeys: string[]
): Promise<{ values: Record<string, string>; missingKeys: string[] }> => {
  const runtimeEnv = resolveRuntimeEnvMap(args.runtimeEnv ?? process.env);
  const existingDevVarValues = await readExistingWranglerDevVars(args);
  const envPath = isNonEmptyString(args.envPath) ? args.envPath.trim() : '.env';
  const envFileValues = await EnvFile.read({
    cwd: args.projectRoot,
    path: envPath,
  });

  const allowedKeys =
    selectedKeys.length === 0
      ? undefined
      : new Set<string>([
          ...WRANGLER_RUNTIME_ENV_KEYS,
          ...selectedKeys,
          ...Object.keys(existingDevVarValues),
        ]);

  const candidateKeys =
    allowedKeys === undefined
      ? uniq([
          ...Object.keys(runtimeEnv),
          ...Object.keys(envFileValues),
          ...Object.keys(existingDevVarValues),
        ]).filter(isWranglerVarName)
      : [...allowedKeys].filter(isWranglerVarName);

  const values: Record<string, string> = {};
  const missingKeys: string[] = [];

  for (const key of candidateKeys) {
    const value = existingDevVarValues[key] ?? envFileValues[key] ?? runtimeEnv[key];
    if (typeof value !== 'string') {
      if (selectedKeys.includes(key)) missingKeys.push(key);
      continue;
    }

    values[key] = value;
  }

  return { values, missingKeys };
};

export const materializeWranglerDevVars = async (
  args: WranglerDevEnvArgs
): Promise<WranglerDevEnvMaterializationResult> => {
  const selectedKeys = resolveSelectedKeys(args);
  const { values, missingKeys } = await collectWranglerDevVarValues(args, selectedKeys);
  const fileName = getWranglerDevVarsFileName(args.envName);
  const filePath = path.join(args.cwd, fileName);

  await EnvFile.write({
    cwd: args.cwd,
    path: fileName,
    values,
    mode: 'overwrite',
  });

  return {
    filePath,
    selectedKeys,
    missingKeys,
    values,
  };
};

export const withWranglerDevVarsSnapshot = async <T>(
  args: WranglerDevEnvArgs,
  fn: () => Promise<T>
): Promise<T> => {
  if (await shouldUseEnvFileDirectly(args)) {
    return fn();
  }

  const targetPath = path.join(args.cwd, getWranglerDevVarsFileName(args.envName));
  const backupPath = getWranglerDevVarsBackupPath(targetPath);

  try {
    reconcileWranglerEnvBackup(targetPath, backupPath);
  } catch {
    // noop
  }

  if (existsSync(targetPath)) {
    renameSync(targetPath, backupPath);
  }

  try {
    await materializeWranglerDevVars(args);
    return await fn();
  } finally {
    try {
      if (existsSync(targetPath)) unlinkSync(targetPath);
    } catch {
      // noop
    }

    try {
      if (existsSync(backupPath)) renameSync(backupPath, targetPath);
    } catch {
      // noop
    }
  }
};

export default Object.freeze({
  materializeWranglerDevVars,
  withWranglerDevVarsSnapshot,
});
