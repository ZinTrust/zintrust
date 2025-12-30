/**
 * Secrets Toolkit (Core)
 *
 * Internal framework module intended for CLI usage.
 * It may use Node APIs (via node-singletons) and should not be used by runtime apps.
 */

import { ErrorFactory } from '@exceptions/ZintrustError';

import { EnvFile } from '@toolkit/Secrets/EnvFile';
import { Manifest, type SecretsProviderName } from '@toolkit/Secrets/Manifest';
import { AwsSecretsManager } from '@toolkit/Secrets/providers/AwsSecretsManager';
import { CloudflareKv } from '@toolkit/Secrets/providers/CloudflareKv';

export type { SecretsProviderName } from '@toolkit/Secrets/Manifest';

export type PullOptions = {
  cwd: string;
  provider?: SecretsProviderName;
  manifestPath?: string;
  outFile?: string;
  dryRun?: boolean;
};

export type PushOptions = {
  cwd: string;
  provider?: SecretsProviderName;
  manifestPath?: string;
  inFile?: string;
  dryRun?: boolean;
};

export type DoctorOptions = {
  provider?: SecretsProviderName;
};

const resolveProvider = (provider?: SecretsProviderName): SecretsProviderName => {
  if (provider === 'aws' || provider === 'cloudflare') return provider;
  throw ErrorFactory.createCliError(
    'Missing/invalid provider. Use --provider aws|cloudflare or set ZINTRUST_SECRETS_PROVIDER.'
  );
};

const resolveOutFile = (outFile?: string): string =>
  outFile ?? process.env['ZINTRUST_ENV_FILE'] ?? '.env.pull';

const resolveManifestPath = (manifestPath?: string): string =>
  manifestPath ?? process.env['ZINTRUST_SECRETS_MANIFEST'] ?? 'secrets.manifest.json';

const resolveInFile = (inFile?: string): string =>
  inFile ?? process.env['ZINTRUST_ENV_IN_FILE'] ?? '.env';

const pullAws = async (
  manifest: Awaited<ReturnType<typeof Manifest.load>>
): Promise<Record<string, string>> => {
  const client = AwsSecretsManager.createFromEnv();
  const entries = Object.entries(manifest.keys).filter(([, spec]) => spec.aws !== undefined);

  const pairs = await Promise.all(
    entries.map(async ([envKey, spec]) => {
      const aws = spec.aws;
      if (aws === undefined) return null;
      const value = await client.getValue(aws.secretId, aws.jsonKey);
      return value === null ? null : ([envKey, value] as const);
    })
  );

  const resolved: Record<string, string> = {};
  for (const pair of pairs) {
    if (pair) resolved[pair[0]] = pair[1];
  }
  return resolved;
};

const pullCloudflare = async (
  manifest: Awaited<ReturnType<typeof Manifest.load>>
): Promise<Record<string, string>> => {
  const client = CloudflareKv.createFromEnv();
  const entries = Object.entries(manifest.keys).filter(([, spec]) => spec.cloudflare !== undefined);

  const pairs = await Promise.all(
    entries.map(async ([envKey, spec]) => {
      const cf = spec.cloudflare;
      if (cf === undefined) return null;
      const value = await client.getValue(cf.key, cf.namespaceId);
      return value === null ? null : ([envKey, value] as const);
    })
  );

  const resolved: Record<string, string> = {};
  for (const pair of pairs) {
    if (pair) resolved[pair[0]] = pair[1];
  }
  return resolved;
};

const pushAws = async (
  manifest: Awaited<ReturnType<typeof Manifest.load>>,
  env: Record<string, string>,
  dryRun: boolean
): Promise<string[]> => {
  const client = AwsSecretsManager.createFromEnv();
  const entries = Object.entries(manifest.keys).filter(([, spec]) => spec.aws !== undefined);

  const pushed = await Promise.all(
    entries.map(async ([envKey, spec]) => {
      const aws = spec.aws;
      if (aws === undefined) return null;
      const value = env[envKey];
      if (typeof value !== 'string') return null;
      if (!dryRun) await client.putValue(aws.secretId, value);
      return envKey;
    })
  );

  return pushed.filter((k): k is string => typeof k === 'string');
};

const pushCloudflare = async (
  manifest: Awaited<ReturnType<typeof Manifest.load>>,
  env: Record<string, string>,
  dryRun: boolean
): Promise<string[]> => {
  const client = CloudflareKv.createFromEnv();
  const entries = Object.entries(manifest.keys).filter(([, spec]) => spec.cloudflare !== undefined);

  const pushed = await Promise.all(
    entries.map(async ([envKey, spec]) => {
      const cf = spec.cloudflare;
      if (cf === undefined) return null;
      const value = env[envKey];
      if (typeof value !== 'string') return null;
      if (!dryRun) await client.putValue(cf.key, value, cf.namespaceId);
      return envKey;
    })
  );

  return pushed.filter((k): k is string => typeof k === 'string');
};

export const SecretsToolkit = Object.freeze({
  async pull(options: PullOptions): Promise<{ outFile: string; keys: string[] }> {
    const provider = resolveProvider(
      options.provider ??
        (process.env['ZINTRUST_SECRETS_PROVIDER'] as SecretsProviderName | undefined)
    );

    const outFile = resolveOutFile(options.outFile);
    const manifestPath = resolveManifestPath(options.manifestPath);
    const manifest = await Manifest.load({ cwd: options.cwd, path: manifestPath, provider });

    const resolved = provider === 'aws' ? await pullAws(manifest) : await pullCloudflare(manifest);

    if (options.dryRun === true) return { outFile, keys: Object.keys(resolved) };

    await EnvFile.write({ cwd: options.cwd, path: outFile, values: resolved, mode: 'overwrite' });
    return { outFile, keys: Object.keys(resolved) };
  },

  async push(options: PushOptions): Promise<{ inFile: string; keys: string[] }> {
    const provider = resolveProvider(
      options.provider ??
        (process.env['ZINTRUST_SECRETS_PROVIDER'] as SecretsProviderName | undefined)
    );

    const inFile = resolveInFile(options.inFile);
    const manifestPath = resolveManifestPath(options.manifestPath);
    const manifest = await Manifest.load({ cwd: options.cwd, path: manifestPath, provider });

    const env = await EnvFile.read({ cwd: options.cwd, path: inFile });
    const dryRun = options.dryRun === true;

    const keys =
      provider === 'aws'
        ? await pushAws(manifest, env, dryRun)
        : await pushCloudflare(manifest, env, dryRun);
    return { inFile, keys };
  },

  doctor(options: DoctorOptions): {
    provider: SecretsProviderName;
    ok: boolean;
    missing: string[];
  } {
    const provider = resolveProvider(
      options.provider ??
        (process.env['ZINTRUST_SECRETS_PROVIDER'] as SecretsProviderName | undefined)
    );

    const missing = provider === 'aws' ? AwsSecretsManager.doctorEnv() : CloudflareKv.doctorEnv();
    return { provider, ok: missing.length === 0, missing };
  },
});

export default SecretsToolkit;
