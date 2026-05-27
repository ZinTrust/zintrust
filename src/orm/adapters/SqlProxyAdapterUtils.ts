import { RemoteSignedJson, type RemoteSignedJsonSettings } from '@common/RemoteSignedJson';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { isObject } from '@helper/index';
import { resolveSigningPrefix } from '@orm/adapters/ProxySigningPath';
import { normalizeSigningCredentials } from '@proxy/SigningService';

// Export parseCustomHeadersFromEnv for use by other proxy adapters (Redis, SMTP, etc.)
export const parseCustomHeadersFromEnv = (prefix: string): Record<string, string> | undefined => {
  const headers: Record<string, string> = {};
  const prefixUpper = prefix.toUpperCase();
  const headerPrefix = `${prefixUpper}_PROXY_HEADERS_`;

  // Get all environment variables that start with the header prefix
  const envVars = typeof process !== 'undefined' && process.env !== undefined ? process.env : {};
  for (const [key, value] of Object.entries(envVars)) {
    if (key.startsWith(headerPrefix) && typeof value === 'string' && value.trim() !== '') {
      // Extract header name: MYSQL_PROXY_HEADERS_X_Tracing_Id -> X-Tracing-Id
      const headerName = key.slice(headerPrefix.length).replaceAll('_', '-');
      headers[headerName] = value.trim();
    }
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
};

export type ProxySettings = {
  baseUrl: string;
  keyId?: string;
  secret?: string;
  timeoutMs: number;
  signaturePathPrefixToStrip?: string;
  customHeaders?: Record<string, string>;
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
    signaturePathPrefixToStrip:
      config.settings.signaturePathPrefixToStrip ?? resolveSigningPrefix(config.settings.baseUrl),
    customHeaders: config.settings.customHeaders,
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

export const isRecord = (value: unknown): value is Record<string, unknown> => isObject(value);
