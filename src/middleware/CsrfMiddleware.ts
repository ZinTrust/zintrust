/**
 * CSRF Middleware
 * Protects against Cross-Site Request Forgery attacks
 * Uses CsrfTokenManager for token generation and validation
 */

import { Logger } from '@config/logger';
import { securityConfig } from '@config/security';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import {
  respondWithMiddlewareFailure,
  type MiddlewareFailureResponder,
} from '@middleware/MiddlewareFailureResponder';
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
   * - `/api/v1/auth/login`
   */
  skipPaths?: ReadonlyArray<string>;
  /**
   * Append the Secure attribute to the CSRF cookie. Defaults to securityConfig.csrf.cookieSecure.
   */
  cookieSecure?: boolean;
  onFailure?: MiddlewareFailureResponder;
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

// Opportunistic pruning: Workers skip the interval timer entirely, so create() must also sweep.
const MAX_REGISTERED_MANAGERS = 256;
const CLEANUP_EVERY_N_CREATES = 100;
let createCount = 0;

const pruneManagerRegistry = (): void => {
  for (const ref of managerRegistry) {
    if (ref.deref() === undefined) managerRegistry.delete(ref);
  }
};

let sharedSessionManager: ReturnType<typeof SessionManager.create> | null = null;

const getSharedSessionManager = (): ReturnType<typeof SessionManager.create> => {
  if (sharedSessionManager !== null) return sharedSessionManager;
  sharedSessionManager = SessionManager.create();
  return sharedSessionManager;
};

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
    const cookieSecure = options.cookieSecure ?? securityConfig.csrf.cookieSecure;
    const skipMatchers = compileSkipPatterns(config.skipPaths);
    const manager = CsrfTokenManager.create();
    const sessions = getSharedSessionManager();

    ensureCleanupTimer();

    // Prune dead refs on every runtime (including Workers, where the timer never starts).
    pruneManagerRegistry();

    createCount++;
    if (createCount % CLEANUP_EVERY_N_CREATES === 0 || managerRegistry.size > MAX_REGISTERED_MANAGERS) {
      for (const ref of managerRegistry) {
        void ref.deref()?.cleanup().catch(() => undefined);
      }
    }

    // Register for global cleanup instead of creating a local timer
    if (canUseWeakRef) {
      managerRegistry.add(new WeakRef(manager));
    }

    return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
      if (shouldSkipRequest(req, skipMatchers)) {
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
        const secureFlag = cookieSecure ? '; Secure' : '';
        appendSetCookie(
          res,
          `${config.cookieName}=${token}; Path=/; SameSite=Strict${secureFlag}`
        );

        // Also expose in locals for server-side rendering
        res.locals['csrfToken'] = token;

        await next();
        return;
      }

      // 2. Token Validation (for unsafe methods)
      const tokenFromHeader = req.getHeader(config.headerName ?? 'X-CSRF-Token') as string;
      const tokenFromBody = (req.getBody() as Record<string, string>)?.[config.bodyKey ?? '_csrf'];
      const tokenFromCookie = cookies[config.cookieName ?? 'XSRF-TOKEN'];

      const token = tokenFromHeader || tokenFromBody;

      if (
        !token ||
        token !== tokenFromCookie ||
        !(await manager.validateToken(sessionId, token))
      ) {
        Logger.warn(`CSRF validation failed for session ${hashSessionIdForLog(sessionId)}`);
        await respondWithMiddlewareFailure(req, res, config.onFailure, {
          middleware: 'csrf',
          reason: 'invalid_csrf_token',
          statusCode: 403,
          message: 'Invalid CSRF token',
          body: {
            error: 'Forbidden',
            message: 'Invalid CSRF token',
          },
        });
        return;
      }

      await next();
    };
  },
});

type SkipPatternMatcher = Readonly<{
  exact?: string;
  prefix?: string;
  matchAll: boolean;
  regex?: RegExp;
}>;

/** Compile skip patterns once at middleware creation instead of rebuilding RegExp per request. */
function compileSkipPatterns(patterns: ReadonlyArray<string> | undefined): SkipPatternMatcher[] {
  if (patterns === undefined) return [];

  const matchers: SkipPatternMatcher[] = [];
  for (const pattern of patterns) {
    const trimmed = pattern.trim();
    if (trimmed === '') continue;

    if (trimmed === '*') {
      matchers.push({ matchAll: true });
      continue;
    }
    if (trimmed.endsWith('/*')) {
      matchers.push({ matchAll: false, prefix: trimmed.slice(0, -1) });
      continue;
    }

    const escaped = trimmed.replaceAll(/[.+?^${}()|[\]\\]/g, String.raw`\$&`);
    const regex = new RegExp(`^${escaped.replaceAll('*', '.*')}$`);
    matchers.push({ matchAll: false, regex, exact: trimmed });
  }

  return matchers;
}

function shouldSkipRequest(req: IRequest, matchers: readonly SkipPatternMatcher[]): boolean {
  return matchers.length > 0 && matchesSkipPattern(req.getPath(), matchers);
}

function matchesSkipPattern(path: string, matchers: readonly SkipPatternMatcher[]): boolean {
  for (const matcher of matchers) {
    if (matcher.matchAll) return true;
    if (matcher.prefix !== undefined && path.startsWith(matcher.prefix)) return true;
    if (matcher.exact === path) return true;
    if (matcher.regex?.test(path) === true) return true;
  }

  return false;
}

/** One-way, log-safe identifier for correlating CSRF failures without exposing session ids. */
function hashSessionIdForLog(sessionId: string): string {
  let hash = 2166136261; // FNV-1a
  for (let i = 0; i < sessionId.length; i++) {
    hash ^= sessionId.codePointAt(i) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `sid:${(hash >>> 0).toString(16).padStart(8, '0')}`;
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
    if (name === null || name === undefined) return;

    let decoded = value;
    try {
      decoded = decodeURIComponent(value);
    } catch {
      // Malformed percent escapes must not turn a CSRF failure into a 500.
    }
    list[name] = decoded;
  });

  return list;
}

type UnrefableTimer = { unref: () => void };

function isUnrefableTimer(value: unknown): value is UnrefableTimer {
  if (typeof value !== 'object' || value === null) return false;
  return 'unref' in value && typeof (value as UnrefableTimer).unref === 'function';
}
