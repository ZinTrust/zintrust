import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import {
  ensureSignedSettings,
  parseCustomHeadersFromEnv,
  requestSignedProxy,
  type ProxySettings,
  type SignedProxyConfig,
} from '@orm/adapters/SqlProxyAdapterUtils';
import { resolveSqlProxyMode } from '@orm/adapters/SqlProxyRegistryMode';

export type ProxyMode = 'sql' | 'registry';

export type ProxySettingsBuildInput = {
  urlKey: string;
  hostKey?: string;
  portKey?: string;
  defaultHost?: string;
  defaultPort?: number;
  keyIdKey: string;
  secretKey: string;
  timeoutKey: string;
  sharedKeyIdKey?: string;
  sharedSecretKey?: string;
  sharedTimeoutKey?: string;
  customHeadersPrefix?: string;
};

const resolveBaseUrl = (input: ProxySettingsBuildInput): string => {
  const explicit = Env.get(input.urlKey, '').trim();
  if (explicit !== '') return explicit;

  if (
    input.hostKey === undefined ||
    input.portKey === undefined ||
    input.defaultPort === undefined
  ) {
    return '';
  }

  const defaultHost = input.defaultHost ?? '127.0.0.1';
  const rawHost = Env.get(input.hostKey, defaultHost);
  const host = typeof rawHost === 'string' && rawHost.trim() !== '' ? rawHost : defaultHost;
  const port = Env.getInt(input.portKey, input.defaultPort);
  return `http://${host}:${port}`;
};

const buildProxySettingsFromEnv = (input: ProxySettingsBuildInput): ProxySettings => {
  const baseUrl = resolveBaseUrl(input);

  const keyId = Env.get(input.keyIdKey, Env.get(input.sharedKeyIdKey ?? 'ZT_PROXY_KEY_ID', ''));
  const secret = Env.get(input.secretKey, Env.get(input.sharedSecretKey ?? 'ZT_PROXY_SECRET', ''));
  const timeoutMs = Env.getInt(
    input.timeoutKey,
    Env.getInt(input.sharedTimeoutKey ?? 'ZT_PROXY_TIMEOUT_MS', 30000)
  );
  const customHeaders =
    input.customHeadersPrefix !== undefined &&
    input.customHeadersPrefix !== null &&
    input.customHeadersPrefix !== ''
      ? parseCustomHeadersFromEnv(input.customHeadersPrefix)
      : undefined;

  return { baseUrl, keyId, secret, timeoutMs, customHeaders };
};

const buildStandardSignedProxyConfig = (input: {
  settings: ProxySettings;
  label: string;
  urlKey: string;
  keyIdKey: string;
  secretKey: string;
}): SignedProxyConfig => {
  const { settings, label } = input;
  const prefix = `${label} proxy`;

  return {
    settings,
    missingUrlMessage: `${label} proxy URL is missing (${input.urlKey})`,
    missingCredentialsMessage: `${label} proxy signing credentials are missing (${input.keyIdKey} / ${input.secretKey})`,
    messages: {
      unauthorized: `${prefix} unauthorized`,
      forbidden: `${prefix} forbidden`,
      rateLimited: `${prefix} rate limited`,
      rejected: `${prefix} rejected request`,
      error: `${prefix} error`,
      timedOut: `${prefix} request timed out`,
    },
  };
};

const ensureSignedProxyConfig = (signed: SignedProxyConfig): void => {
  ensureSignedSettings(signed);
};

const requestProxy = async <T>(
  signed: SignedProxyConfig,
  path: string,
  payload: Record<string, unknown>
): Promise<T> => {
  return requestSignedProxy<T>(signed, path, payload);
};

const resolveProxyModeFromEnv = (envKey: string): ProxyMode => {
  return resolveSqlProxyMode(envKey);
};

const createProxyNotReachableCliError = (label: string, baseUrl: string, error: unknown): Error => {
  const msg = error instanceof Error ? error.message : String(error);
  return ErrorFactory.createCliError(
    `${label} is enabled but the proxy server is not reachable at ${baseUrl}. Start the proxy stack (e.g. \`zin cp up\` or \`docker compose -f docker-compose.proxy.yml up -d\`) and re-run \`zin migrate\`.`,
    { error: msg, baseUrl }
  );
};

export const SqlProxyHttpAdapterShared = Object.freeze({
  buildProxySettingsFromEnv,
  buildStandardSignedProxyConfig,
  ensureSignedProxyConfig,
  requestProxy,
  resolveProxyModeFromEnv,
  createProxyNotReachableCliError,
});
