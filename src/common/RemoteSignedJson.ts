import { ErrorFactory } from '@exceptions/ZintrustError';
import { isObject } from '@helper/index';
import { normalizeSigningCredentials } from '@proxy/SigningService';
import { SignedRequest } from '@security/SignedRequest';

export type RemoteSignedJsonSettings = {
  baseUrl: string;
  keyId: string;
  secret: string;
  timeoutMs: number;
  signaturePathPrefixToStrip?: string;

  missingUrlMessage: string;
  missingCredentialsMessage: string;

  messages: {
    unauthorized: string;
    forbidden: string;
    rateLimited: string;
    rejected: string;
    error: string;
    timedOut: string;
  };
};

const joinUrl = (baseUrl: string, path: string): URL => {
  const u = new URL(baseUrl);
  const basePath = u.pathname.endsWith('/') ? u.pathname.slice(0, -1) : u.pathname;
  const next = path.startsWith('/') ? path : `/${path}`;
  u.pathname = `${basePath}${next}`;
  u.search = '';
  return u;
};

const asJson = async (resp: Response): Promise<unknown> => {
  const text = await resp.text();
  if (text.trim() === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => isObject(value);

const describeProxyError = (details: unknown): string => {
  // Expected Worker proxy error shape: { status: number, body: { code: string, message: string } }
  if (!isRecord(details)) return '';
  const body = details['body'];
  if (!isRecord(body)) return '';
  const code = typeof body['code'] === 'string' ? body['code'] : '';
  const message = typeof body['message'] === 'string' ? body['message'] : '';
  if (code === '' && message === '') return '';
  if (code !== '' && message !== '') return `${code}: ${message}`;
  return code === '' ? message : code;
};

const normalizeSettings = (settings: RemoteSignedJsonSettings): RemoteSignedJsonSettings => {
  const creds = normalizeSigningCredentials({
    keyId: settings.keyId,
    secret: settings.secret,
  });
  return { ...settings, keyId: creds.keyId, secret: creds.secret };
};

const requireConfigured = (settings: RemoteSignedJsonSettings): void => {
  if (settings.baseUrl.trim() === '') {
    throw ErrorFactory.createConfigError(settings.missingUrlMessage);
  }
  if (settings.keyId.trim() === '' || settings.secret.trim() === '') {
    throw ErrorFactory.createConfigError(settings.missingCredentialsMessage);
  }
};

const getNativeTimeoutSignal = (timeoutMs: number): AbortSignal | undefined => {
  if (timeoutMs <= 0) return undefined;
  const timeout = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout;
  return typeof timeout === 'function' ? timeout(timeoutMs) : undefined;
};

const buildSigningUrl = (url: URL, settings: RemoteSignedJsonSettings): URL => {
  const rawPrefix = settings.signaturePathPrefixToStrip?.trim() ?? '';
  if (rawPrefix === '' || rawPrefix === '/') {
    return new URL(url.toString());
  }

  const normalizedPrefix = rawPrefix.startsWith('/') ? rawPrefix : `/${rawPrefix}`;
  const signingUrl = new URL(url.toString());

  if (signingUrl.pathname === normalizedPrefix) {
    signingUrl.pathname = '/';
    return signingUrl;
  }

  if (signingUrl.pathname.startsWith(`${normalizedPrefix}/`)) {
    signingUrl.pathname = signingUrl.pathname.slice(normalizedPrefix.length);
  }

  return signingUrl;
};

const throwForNonOkResponse = async (
  resp: Response,
  settings: RemoteSignedJsonSettings
): Promise<never> => {
  const details = await asJson(resp);

  switch (resp.status) {
    case 401:
      throw ErrorFactory.createUnauthorizedError(settings.messages.unauthorized, details);
    case 403:
      throw ErrorFactory.createForbiddenError(settings.messages.forbidden, details);
    case 429:
      throw ErrorFactory.createSecurityError(settings.messages.rateLimited, details);
    default: {
      if (resp.status >= 400 && resp.status < 500) {
        throw ErrorFactory.createValidationError(settings.messages.rejected, details);
      }

      const extra = describeProxyError(details);
      const msg = extra === '' ? settings.messages.error : `${settings.messages.error} (${extra})`;
      throw ErrorFactory.createConnectionError(msg, {
        status: resp.status,
        details,
      });
    }
  }
};

const rethrowRequestError = (error: unknown, settings: RemoteSignedJsonSettings): never => {
  if (error instanceof Error && error.name === 'AbortError') {
    throw ErrorFactory.createConnectionError(settings.messages.timedOut, {
      timeoutMs: settings.timeoutMs,
    });
  }
  throw error;
};

export const RemoteSignedJson = Object.freeze({
  async request<T>(
    settings: RemoteSignedJsonSettings,
    path: string,
    payload: Record<string, unknown>
  ): Promise<T> {
    const normalized = normalizeSettings(settings);
    requireConfigured(normalized);

    const url = joinUrl(normalized.baseUrl, path);
    const signingUrl = buildSigningUrl(url, normalized);
    const body = JSON.stringify(payload);
    const signed = await SignedRequest.createHeaders({
      method: 'POST',
      url: signingUrl,
      body,
      keyId: normalized.keyId,
      secret: normalized.secret,
    });

    const nativeSignal = getNativeTimeoutSignal(normalized.timeoutMs);
    if (nativeSignal === undefined && normalized.timeoutMs > 0) {
      throw ErrorFactory.createConfigError(
        'RemoteSignedJson timeout requires AbortSignal.timeout() support in this runtime',
        { timeoutMs: normalized.timeoutMs }
      );
    }

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...signed },
        body,
        signal: nativeSignal,
      });

      if (!resp.ok) {
        await throwForNonOkResponse(resp, normalized);
      }

      return (await asJson(resp)) as T;
    } catch (error: unknown) {
      return rethrowRequestError(error, normalized);
    } finally {
      // No timer cleanup needed: uses AbortSignal.timeout() when available.
    }
  },
});

export default RemoteSignedJson;
