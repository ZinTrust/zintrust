import { ErrorFactory } from '@exceptions/ZintrustError';
import { SignedRequest } from '@security/SignedRequest';

export type RemoteSignedJsonSettings = {
  baseUrl: string;
  keyId: string;
  secret: string;
  timeoutMs: number;

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

export const RemoteSignedJson = Object.freeze({
  async request<T>(
    settings: RemoteSignedJsonSettings,
    path: string,
    payload: Record<string, unknown>
  ): Promise<T> {
    requireConfigured(settings);

    const url = joinUrl(settings.baseUrl, path);
    const body = JSON.stringify(payload);
    const signed = await SignedRequest.createHeaders({
      method: 'POST',
      url,
      body,
      keyId: settings.keyId,
      secret: settings.secret,
    });

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...signed },
        body,
        signal: createTimeoutSignal(settings.timeoutMs),
      });

      if (!resp.ok) {
        const details = await asJson(resp);

        if (resp.status === 401) {
          throw ErrorFactory.createUnauthorizedError(settings.messages.unauthorized, details);
        }
        if (resp.status === 403) {
          throw ErrorFactory.createForbiddenError(settings.messages.forbidden, details);
        }
        if (resp.status === 429) {
          throw ErrorFactory.createSecurityError(settings.messages.rateLimited, details);
        }
        if (resp.status >= 400 && resp.status < 500) {
          throw ErrorFactory.createValidationError(settings.messages.rejected, details);
        }

        throw ErrorFactory.createConnectionError(settings.messages.error, {
          status: resp.status,
          details,
        });
      }

      return (await asJson(resp)) as T;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw ErrorFactory.createConnectionError(settings.messages.timedOut, {
          timeoutMs: settings.timeoutMs,
        });
      }
      throw error;
    }
  },
});

export default RemoteSignedJson;
