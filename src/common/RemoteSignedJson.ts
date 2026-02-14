import { ErrorFactory } from '@exceptions/ZintrustError';
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

const createTimeoutSignal = (timeoutMs: number): AbortSignal | undefined => {
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

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...signed },
        body,
        signal: createTimeoutSignal(normalized.timeoutMs),
      });

      if (!resp.ok) {
        const details = await asJson(resp);

        if (resp.status === 401) {
          throw ErrorFactory.createUnauthorizedError(normalized.messages.unauthorized, details);
        }
        if (resp.status === 403) {
          throw ErrorFactory.createForbiddenError(normalized.messages.forbidden, details);
        }
        if (resp.status === 429) {
          throw ErrorFactory.createSecurityError(normalized.messages.rateLimited, details);
        }
        if (resp.status >= 400 && resp.status < 500) {
          throw ErrorFactory.createValidationError(normalized.messages.rejected, details);
        }

        throw ErrorFactory.createConnectionError(normalized.messages.error, {
          status: resp.status,
          details,
        });
      }

      return (await asJson(resp)) as T;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw ErrorFactory.createConnectionError(normalized.messages.timedOut, {
          timeoutMs: normalized.timeoutMs,
        });
      }
      throw error;
    }
  },
});

export default RemoteSignedJson;
