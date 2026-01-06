/**
 * CSRF Middleware
 * Protects against Cross-Site Request Forgery attacks
 * Uses CsrfTokenManager for token generation and validation
 */

import { Logger } from '@config/logger';
import { IRequest } from '@http/Request';
import { IResponse } from '@http/Response';
import { Middleware } from '@middleware/MiddlewareStack';
import { CsrfTokenManager } from '@security/CsrfTokenManager';
import { SessionManager } from '@session/SessionManager';

export interface CsrfOptions {
  cookieName?: string;
  headerName?: string;
  bodyKey?: string;
  ignoreMethods?: string[];
}

const DEFAULT_OPTIONS: CsrfOptions = {
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-CSRF-Token',
  bodyKey: '_csrf',
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
};

export const CsrfMiddleware = Object.freeze({
  /**
   * Create CSRF protection middleware
   */
  create(options: CsrfOptions = {}): Middleware {
    const config = { ...DEFAULT_OPTIONS, ...options };
    const manager = CsrfTokenManager.create();
    const sessions = SessionManager.create();

    // Periodic cleanup to prevent memory leaks
    // Run every hour (matching default token TTL)
    const cleanupTimer = setInterval(() => {
      manager.cleanup();
    }, 3600000);

    // Node: allow process to exit; other runtimes may not support unref()
    if (isUnrefableTimer(cleanupTimer)) {
      cleanupTimer.unref();
    }

    return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
      const cookieHeader = req.getHeader('cookie');
      const cookies = parseCookies(typeof cookieHeader === 'string' ? cookieHeader : '');

      // Guarantee a session id exists and a session cookie is set if missing.
      // This allows CSRF tokens to be bound to a stable session identifier.
      const sessionId = await sessions.ensureSessionId(req, res);

      const method = req.getMethod();

      // 1. Token Generation (for safe methods)
      if (config.ignoreMethods?.includes(method) ?? false) {
        const token = manager.generateToken(sessionId);

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

      if (!token || !manager.validateToken(sessionId, token)) {
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
