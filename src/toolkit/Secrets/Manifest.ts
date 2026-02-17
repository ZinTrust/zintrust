import { ErrorFactory } from '@exceptions/ZintrustError';
import { isNonEmptyString, isObject } from '@helper/index';
import { fsPromises as fs } from '@node-singletons/fs';
import * as path from '@node-singletons/path';

export type SecretsProviderName = 'aws' | 'cloudflare';

export type ManifestKeySpec = {
  aws?: {
    secretId: string;
    jsonKey?: string;
  };
  cloudflare?: {
    key: string;
    namespaceId?: string;
  };
};

export type SecretsManifest = {
  provider: SecretsProviderName;
  keys: Record<string, ManifestKeySpec>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => isObject(value);

const assertString = (value: unknown, name: string): string => {
  if (!isNonEmptyString(value)) {
    throw ErrorFactory.createCliError(`Manifest: missing/invalid ${name}`);
  }
  return value;
};

const validateKeyName = (key: string): void => {
  if (!/^[A-Z0-9_]+$/.test(key)) {
    throw ErrorFactory.createCliError(`Manifest: invalid env key: ${key}`);
  }
};

const parseProvider = (
  parsed: Record<string, unknown>,
  fallback: SecretsProviderName
): SecretsProviderName => {
  const provider =
    'provider' in parsed && typeof parsed['provider'] === 'string'
      ? (parsed['provider'] as SecretsProviderName)
      : fallback;

  if (provider !== 'aws' && provider !== 'cloudflare') {
    throw ErrorFactory.createCliError('Manifest: provider must be aws|cloudflare');
  }

  return provider;
};

const parseKeySpec = (envKey: string, specUnknown: Record<string, unknown>): ManifestKeySpec => {
  const spec: ManifestKeySpec = {};

  const awsUnknown = specUnknown['aws'];
  if (isRecord(awsUnknown)) {
    spec.aws = {
      secretId: assertString(awsUnknown['secretId'], `keys.${envKey}.aws.secretId`),
      jsonKey: isNonEmptyString(awsUnknown['jsonKey']) ? awsUnknown['jsonKey'] : undefined,
    };
  }

  const cloudflareUnknown = specUnknown['cloudflare'];
  if (isRecord(cloudflareUnknown)) {
    spec.cloudflare = {
      key: assertString(cloudflareUnknown['key'], `keys.${envKey}.cloudflare.key`),
      namespaceId: isNonEmptyString(cloudflareUnknown['namespaceId'])
        ? cloudflareUnknown['namespaceId']
        : undefined,
    };
  }

  return spec;
};

export const Manifest = Object.freeze({
  async load(params: {
    cwd: string;
    path: string;
    provider: SecretsProviderName;
  }): Promise<SecretsManifest> {
    const filePath = path.resolve(params.cwd, params.path);

    const raw = await fs.readFile(filePath, 'utf-8');
    const parsedUnknown: unknown = JSON.parse(raw);

    if (!isRecord(parsedUnknown)) {
      throw ErrorFactory.createCliError('Manifest: expected JSON object');
    }

    const provider = parseProvider(parsedUnknown, params.provider);

    const keysUnknown = parsedUnknown['keys'];
    if (!isRecord(keysUnknown)) {
      throw ErrorFactory.createCliError('Manifest: keys must be an object');
    }

    const keys: Record<string, ManifestKeySpec> = {};

    for (const [envKey, specUnknown] of Object.entries(keysUnknown)) {
      validateKeyName(envKey);
      if (!isRecord(specUnknown))
        throw ErrorFactory.createCliError(`Manifest: key ${envKey} must be an object`);
      keys[envKey] = parseKeySpec(envKey, specUnknown);
    }

    return { provider, keys };
  },
});

export default Manifest;
