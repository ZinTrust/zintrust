import { RemoteSignedJson, type RemoteSignedJsonSettings } from '@common/RemoteSignedJson';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { resolveSigningPrefix } from '@orm/adapters/ProxySigningPath';
import { normalizeSigningCredentials } from '@proxy/SigningService';

export type ProxySettings = {
  baseUrl: string;
  keyId?: string;
  secret?: string;
  timeoutMs: number;
};

export type SignedProxyConfig = {
  settings: ProxySettings;
  missingUrlMessage: string;
  missingCredentialsMessage: string;
  messages: RemoteSignedJsonSettings['messages'];
};

export const buildSignedSettings = (config: SignedProxyConfig): RemoteSignedJsonSettings => {
  const creds = normalizeSigningCredentials({
    keyId: config.settings.keyId ?? '',
    secret: config.settings.secret ?? '',
  });

  return {
    baseUrl: config.settings.baseUrl,
    keyId: creds.keyId,
    secret: creds.secret,
    timeoutMs: config.settings.timeoutMs,
    signaturePathPrefixToStrip: resolveSigningPrefix(config.settings.baseUrl),
    missingUrlMessage: config.missingUrlMessage,
    missingCredentialsMessage: config.missingCredentialsMessage,
    messages: config.messages,
  };
};

export const ensureSignedSettings = (config: SignedProxyConfig): RemoteSignedJsonSettings => {
  const signedSettings = buildSignedSettings(config);

  if (signedSettings.baseUrl.trim() === '') {
    throw ErrorFactory.createConfigError(config.missingUrlMessage);
  }

  if (signedSettings.keyId.trim() === '' || signedSettings.secret.trim() === '') {
    throw ErrorFactory.createConfigError(config.missingCredentialsMessage);
  }

  return signedSettings;
};

export const requestSignedProxy = async <T>(
  config: SignedProxyConfig,
  path: string,
  payload: Record<string, unknown>
): Promise<T> => {
  const signedSettings = ensureSignedSettings(config);
  return RemoteSignedJson.request<T>(signedSettings, path, payload);
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
