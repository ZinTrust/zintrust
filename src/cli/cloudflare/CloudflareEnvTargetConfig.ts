import { ErrorFactory } from '@exceptions/ZintrustError';
import { isArray, isNonEmptyString, isObject } from '@helper/index';
import { existsSync, readFileSync } from '@node-singletons/fs';
import * as path from '@node-singletons/path';

type ZintrustConfig = Record<string, unknown>;

export interface CloudflareEnvTargetConfig {
  sharedEnv: string[];
  wranglerEnvs: Record<string, string[]>;
  targets: Record<string, string[]>;
}

type ResolveTargetArgs = {
  projectRoot: string;
  cwd: string;
  configPath?: string;
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

const toStringArray = (value: unknown): string[] => {
  if (!isArray(value)) return [];
  return uniq(value.filter(isNonEmptyString).map((item) => item.trim()));
};

const toStringArrayRecord = (value: unknown): Record<string, string[]> => {
  if (!isObject(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => isNonEmptyString(key))
      .map(([key, entry]) => [key.trim(), toStringArray(entry)])
  );
};

const isAbsolutePath = (value: string): boolean =>
  value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);

export const readZintrustConfig = (cwd: string): ZintrustConfig => {
  const filePath = path.join(cwd, '.zintrust.json');
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return isObject(parsed) ? parsed : {};
  } catch (error) {
    throw ErrorFactory.createCliError('Failed to parse .zintrust.json', error);
  }
};

export const resolveCloudflareEnvTargetConfig = (
  config: ZintrustConfig
): CloudflareEnvTargetConfig => {
  const raw = isObject(config['cloudflare']) ? config['cloudflare'] : {};

  return Object.freeze({
    sharedEnv: toStringArray(raw['shared_env']),
    wranglerEnvs: toStringArrayRecord(raw['wrangler_envs']),
    targets: toStringArrayRecord(raw['targets']),
  });
};

const normalizeConfigPath = (cwd: string, configPath: string | undefined): string | undefined => {
  if (!isNonEmptyString(configPath)) return undefined;
  return isAbsolutePath(configPath) ? configPath : path.join(cwd, configPath);
};

const inferServiceTarget = (projectRoot: string, candidateDir: string): string | undefined => {
  const servicesRoot = path.join(projectRoot, 'src', 'services');
  const relative = path.relative(servicesRoot, candidateDir);
  if (relative === '' || relative.startsWith('..')) return undefined;

  const segments = relative
    .split(path.sep)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '');

  if (segments.length < 2) return undefined;
  return `${segments[0]}/${segments[1]}`;
};

export const inferCloudflareTarget = ({
  projectRoot,
  cwd,
  configPath,
}: ResolveTargetArgs): string => {
  const normalizedConfigPath = normalizeConfigPath(cwd, configPath);
  const configBase = normalizedConfigPath === undefined ? '' : path.basename(normalizedConfigPath);

  if (configBase.startsWith('wrangler.containers-proxy.')) {
    return 'containers-proxy';
  }

  const candidateDir =
    normalizedConfigPath === undefined ? cwd : path.dirname(normalizedConfigPath);
  const serviceTarget = inferServiceTarget(projectRoot, candidateDir);
  if (serviceTarget !== undefined) return serviceTarget;

  return 'worker';
};

export const resolveCloudflareEnvKeys = (args: {
  config: ZintrustConfig;
  projectRoot: string;
  cwd: string;
  configPath?: string;
  wranglerEnv?: string;
  target?: string;
}): string[] => {
  const cloudflare = resolveCloudflareEnvTargetConfig(args.config);
  const target = isNonEmptyString(args.target)
    ? args.target.trim()
    : inferCloudflareTarget({
        projectRoot: args.projectRoot,
        cwd: args.cwd,
        configPath: args.configPath,
      });
  const wranglerEnv = isNonEmptyString(args.wranglerEnv) ? args.wranglerEnv.trim() : undefined;

  return uniq([
    ...cloudflare.sharedEnv,
    ...(cloudflare.targets['default'] ?? []),
    ...(cloudflare.targets[target] ?? []),
    ...(wranglerEnv === undefined ? [] : (cloudflare.wranglerEnvs[wranglerEnv] ?? [])),
  ]);
};

export default Object.freeze({
  readZintrustConfig,
  resolveCloudflareEnvTargetConfig,
  inferCloudflareTarget,
  resolveCloudflareEnvKeys,
});
