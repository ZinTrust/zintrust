/**
 * CSRF Middleware
 * Protects against Cross-Site Request Forgery attacks
 * Uses CsrfTokenManager for token generation and validation
 */

import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { IRequest } from '@http/Request';
import { IResponse } from '@http/Response';
import { Middleware } from '@middleware/MiddlewareStack';
import { CsrfTokenManager } from '@security/CsrfTokenManager';

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
      // We need a session ID to bind the token to.
      // Assuming a session middleware has run before this and populated req.context.sessionId
      // or we use a cookie for the session ID.
      // For now, we'll try to get it from a cookie or generate a temporary one if missing (stateless fallback)

      // Note: In a real scenario, this MUST be tied to the user's authenticated session.
      // Here we check for a specific session cookie or header.
      const cookies = parseCookies((req.getHeader('cookie') as string) || '');
      let sessionId = cookies['ZIN_SESSION_ID'] || (req.context['sessionId'] as string);

      if (!sessionId) {
        // If no session exists, we can't effectively bind CSRF to a session.
        // However, for the sake of the middleware functioning in a stateless way (Double Submit Cookie pattern),
        // we can generate a pseudo-session-id if one doesn't exist, but it's less secure.
        // Ideally, this middleware should throw if session is missing.
        // For this implementation, we'll skip if no session is found, but log a warning.
        // Logger.warn('CSRF Middleware: No session ID found. Skipping CSRF check.');
        // await next();
        // return;

        // Better approach: Generate a session ID if missing (Double Submit Cookie foundation)
        // IMPORTANT: use a cryptographically secure generator (Sonar S2245).
        sessionId = generateSecureId();
        // We would need to set this session cookie, but we can't easily do that without a SessionManager.
        // We'll assume the SessionMiddleware handles session creation.
      }

      const method = req.getMethod();

      // 1. Token Generation (for safe methods)
      if (config.ignoreMethods?.includes(method) ?? false) {
        const token = manager.generateToken(sessionId);

        // Set cookie for Double Submit Cookie pattern (readable by frontend)
        res.setHeader('Set-Cookie', `${config.cookieName}=${token}; Path=/; SameSite=Strict`);

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

function generateSecureId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
  }

  throw ErrorFactory.createSecurityError(
    'CSRF Middleware: secure crypto API not available to generate a session id.'
  );
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}
