import { generateSecureJobId } from '@/common/utility';

export type SessionData = Record<string, unknown>;

export interface ISession {
  id: string;
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
  forget(key: string): void;
  all(): SessionData;
  clear(): void;
}

export interface ISessionManager {
  getIdFromCookieHeader(cookieHeader: string | undefined): string | undefined;
  getIdFromRequest(req: {
    getHeader: (name: string) => unknown;
    sessionId?: unknown;
    context?: Record<string, unknown>;
  }): string | undefined;
  ensureSessionId(
    req: {
      getHeader: (name: string) => unknown;
      sessionId?: unknown;
      context: Record<string, unknown>;
    },
    res: {
      getHeader: (name: string) => unknown;
      setHeader: (name: string, value: string | string[]) => unknown;
    }
  ): Promise<string>;
  get(sessionId: string): ISession;
  destroy(sessionId: string): void;
  cleanup(): number;
}

export interface SessionManagerOptions {
  cookieName?: string;
  headerName?: string;
  ttlMs?: number;
}

type StoredSession = {
  data: SessionData;
  expiresAt: number;
};

const DEFAULT_OPTIONS: Required<SessionManagerOptions> = {
  cookieName: 'ZIN_SESSION_ID',
  headerName: 'x-session-id',
  ttlMs: 7 * 24 * 60 * 60 * 1000,
};

function parseCookies(cookieHeader: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (cookieHeader.length === 0) return list;

  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const name = parts.shift()?.trim();
    const value = parts.join('=');
    if (name !== null && name !== undefined) list[name] = decodeURIComponent(value);
  });

  return list;
}

function appendSetCookie(
  res: {
    getHeader: (name: string) => unknown;
    setHeader: (name: string, value: string | string[]) => unknown;
  },
  cookie: string
): void {
  const existing = res.getHeader('Set-Cookie');

  if (existing === undefined) {
    res.setHeader('Set-Cookie', cookie);
    return;
  }

  if (Array.isArray(existing)) {
    const existingCookies = existing.map(String);
    res.setHeader('Set-Cookie', [...existingCookies, cookie]);
    return;
  }

  if (typeof existing === 'string') {
    res.setHeader('Set-Cookie', [existing, cookie]);
    return;
  }

  res.setHeader('Set-Cookie', cookie);
}

function buildSessionCookie(cookieName: string, sessionId: string): string {
  // Keep this minimal; callers can override behavior later.
  // HttpOnly prevents JS access; SameSite=Lax is a reasonable default for app sessions.
  return `${cookieName}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax`;
}

function createSessionApi(
  sessions: Map<string, StoredSession>,
  sessionId: string,
  ttlMs: number
): ISession {
  const withoutKey = (data: SessionData, key: string): SessionData => {
    if (!Object.prototype.hasOwnProperty.call(data, key)) return data;
    const record = data as Record<string, unknown>;
    const { [key]: _removed, ...rest } = record;
    return rest;
  };

  const ensureStored = (): StoredSession => {
    const existing = sessions.get(sessionId);
    const now = Date.now();

    if (existing !== undefined && existing.expiresAt > now) {
      return existing;
    }

    const created: StoredSession = { data: {}, expiresAt: now + ttlMs };
    sessions.set(sessionId, created);
    return created;
  };

  return {
    id: sessionId,

    get<T = unknown>(key: string): T | undefined {
      return ensureStored().data[key] as T | undefined;
    },

    set(key: string, value: unknown): void {
      const stored = ensureStored();
      stored.data[key] = value;
      stored.expiresAt = Date.now() + ttlMs;
    },

    has(key: string): boolean {
      return Object.prototype.hasOwnProperty.call(ensureStored().data, key);
    },

    forget(key: string): void {
      const stored = ensureStored();
      stored.data = withoutKey(stored.data, key);
      stored.expiresAt = Date.now() + ttlMs;
    },

    all(): SessionData {
      return { ...ensureStored().data };
    },

    clear(): void {
      const stored = ensureStored();
      stored.data = {};
      stored.expiresAt = Date.now() + ttlMs;
    },
  };
}

export const SessionManager = Object.freeze({
  create(options: SessionManagerOptions = {}): ISessionManager {
    const config = { ...DEFAULT_OPTIONS, ...options };
    const sessions = new Map<string, StoredSession>();

    return {
      getIdFromCookieHeader(cookieHeader: string | undefined): string | undefined {
        if (cookieHeader === undefined || cookieHeader.length === 0) return undefined;
        const cookies = parseCookies(cookieHeader);
        return cookies[config.cookieName];
      },

      getIdFromRequest(req): string | undefined {
        const cookieHeader = req.getHeader('cookie');
        if (typeof cookieHeader === 'string') {
          const fromCookie = this.getIdFromCookieHeader(cookieHeader);
          if (fromCookie !== undefined) return fromCookie;
        }

        const fromHeader = req.getHeader(config.headerName);
        if (typeof fromHeader === 'string' && fromHeader.length > 0) return fromHeader;

        if (typeof req.sessionId === 'string' && req.sessionId.length > 0) return req.sessionId;

        const fromContext = req.context?.['sessionId'];
        if (typeof fromContext === 'string' && fromContext.length > 0) return fromContext;

        return undefined;
      },

      async ensureSessionId(req, res): Promise<string> {
        const existing = this.getIdFromRequest(req);
        const sessionId =
          existing ??
          (await Promise.resolve(
            generateSecureJobId(
              'SessionManager: secure crypto API not available to generate a session id'
            )
          ));

        req.context['sessionId'] = sessionId;

        // If the cookie is missing, set it.
        const cookieHeader = req.getHeader('cookie');
        const fromCookie =
          typeof cookieHeader === 'string' ? this.getIdFromCookieHeader(cookieHeader) : undefined;
        if (fromCookie === undefined) {
          appendSetCookie(res, buildSessionCookie(config.cookieName, sessionId));
        }

        return sessionId;
      },

      get(sessionId: string): ISession {
        return createSessionApi(sessions, sessionId, config.ttlMs);
      },

      destroy(sessionId: string): void {
        sessions.delete(sessionId);
      },

      cleanup(): number {
        const now = Date.now();
        let removed = 0;

        for (const [id, stored] of sessions.entries()) {
          if (stored.expiresAt <= now) {
            sessions.delete(id);
            removed++;
          }
        }

        return removed;
      },
    };
  },
});

export default SessionManager;
