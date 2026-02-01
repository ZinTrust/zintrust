/**
 * CSRF Middleware
 * Protects against Cross-Site Request Forgery attacks
 * Uses CsrfTokenManager for token generation and validation
 */

import { Logger } from '@config/logger';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import type { Middleware } from '@middleware/MiddlewareStack';
import type { ICsrfTokenManager } from '@security/CsrfTokenManager';
import { CsrfTokenManager } from '@security/CsrfTokenManager';
import { SessionManager } from '@session/SessionManager';

export interface CsrfOptions {
  cookieName?: string;
  headerName?: string;
  bodyKey?: string;
  ignoreMethods?: string[];
  /**
   * Optional path patterns to bypass CSRF entirely.
   *
   * Supports simple glob-style matching where `*` matches any characters.
   * Examples:
   * - `/api/*`
   * - `/webhooks/*`
   * - `/api/v1/auth/login`
   */
  skipPaths?: string[];
}

const DEFAULT_OPTIONS: CsrfOptions = {
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-CSRF-Token',
  bodyKey: '_csrf',
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
};

// Global cleanup registry to avoid leaking intervals per middleware instance
// We use WeakRef so the manager (and middleware) can be garbage collected
// when no longer in use, even if this interval keeps running.
const canUseWeakRef = typeof WeakRef === 'function';
const managerRegistry = new Set<WeakRef<ICsrfTokenManager>>();

let globalCleanupTimer: ReturnType<typeof setInterval> | null = null;

const ensureCleanupTimer = (): void => {
  if (globalCleanupTimer !== null) return;
  if (typeof setInterval !== 'function') return;
  if ((globalThis as { CF?: unknown }).CF !== undefined) return;
  if (!canUseWeakRef) return;

  globalCleanupTimer = setInterval(() => {
    if (managerRegistry.size === 0) return;

    for (const ref of managerRegistry) {
      const mgr = ref.deref();
      if (mgr) {
        void mgr.cleanup().catch(() => undefined);
      } else {
        managerRegistry.delete(ref);
      }
    }
  }, 3600000);

  // Use helper to handle runtime differences (Node vs others)
  if (globalCleanupTimer !== null && isUnrefableTimer(globalCleanupTimer)) {
    globalCleanupTimer.unref();
  }
};

export const CsrfMiddleware = Object.freeze({
  /**
   * Create CSRF protection middleware
   */
  create(options: CsrfOptions = {}): Middleware {
    const config = { ...DEFAULT_OPTIONS, ...options };
    const manager = CsrfTokenManager.create();
    const sessions = SessionManager.create();

    ensureCleanupTimer();

    // Register for global cleanup instead of creating a local timer
    if (canUseWeakRef) {
      managerRegistry.add(new WeakRef(manager));
    }

    return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
      if (shouldSkipCsrfForRequest(req, config)) {
        await next();
        return;
      }

      const cookieHeader = req.getHeader('cookie');
      const cookies = parseCookies(typeof cookieHeader === 'string' ? cookieHeader : '');

      // Guarantee a session id exists and a session cookie is set if missing.
      // This allows CSRF tokens to be bound to a stable session identifier.
      const sessionId = await sessions.ensureSessionId(req, res);

      const method = req.getMethod();

      // 1. Token Generation (for safe methods)
      if (config.ignoreMethods?.includes(method) ?? false) {
        const token = await manager.generateToken(sessionId);

        // Set cookie for Double Submit Cookie pattern (readable by frontend)
        appendSetCookie(res, `${config.cookieName}=${token}; Path=/; SameSite=Strict`);

        // Also expose in locals for server-side rendering
        res.locals['csrfToken'] = token;

        await next();
        return;
      }

      // 2. Token Validation (for unsafe methods)
      const tokenFromHeader = req.getHeader(config.headerName ?? 'X-CSRF-Token') as string;
      const tokenFromBody = (req.getBody() as Record<string, string>)?.[config.bodyKey ?? '_csrf'];
      const tokenFromCookie = cookies[config.cookieName ?? 'XSRF-TOKEN'];

      const token = tokenFromHeader || tokenFromBody || tokenFromCookie;

      if (!token || !(await manager.validateToken(sessionId, token))) {
        Logger.warn(`CSRF validation failed for session ${sessionId}`);
        res.setStatus(403);
        res.json({
          error: 'Forbidden',
          message: 'Invalid CSRF token',
        });
        return;
      }

      await next();
    };
  },
});

function shouldSkipCsrfForRequest(req: IRequest, config: CsrfOptions): boolean {
  const patterns = config.skipPaths;
  if (patterns === undefined || patterns.length === 0) return false;

  const path = req.getPath();
  for (const pattern of patterns) {
    const trimmed = pattern.trim();
    if (trimmed === '') continue;
    if (pathMatchesPattern(path, trimmed)) return true;
  }

  return false;
}

function pathMatchesPattern(path: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern === path) return true;

  // Fast path: treat trailing "/*" as a prefix match.
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -1); // keep the trailing '/'
    return path.startsWith(prefix);
  }

  // Generic glob-to-regex conversion where '*' matches any characters.
  const escaped = pattern.replaceAll(/[.+?^${}()|[\]\\]/g, String.raw`\$&`);
  const regex = new RegExp(`^${escaped.replaceAll('*', '.*')}$`);
  return regex.test(path);
}

function appendSetCookie(res: IResponse, cookie: string): void {
  const existing = res.getHeader('Set-Cookie');

  if (existing === undefined) {
    res.setHeader('Set-Cookie', cookie);
    return;
  }

  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookie]);
    return;
  }

  res.setHeader('Set-Cookie', [existing, cookie]);
}

/**
 * Helper to parse cookies
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const name = parts.shift()?.trim();
    const value = parts.join('=');
    if (name !== null && name !== undefined) list[name] = decodeURIComponent(value);
  });

  return list;
}

type UnrefableTimer = { unref: () => void };

function isUnrefableTimer(value: unknown): value is UnrefableTimer {
  if (typeof value !== 'object' || value === null) return false;
  return 'unref' in value && typeof (value as UnrefableTimer).unref === 'function';
}
