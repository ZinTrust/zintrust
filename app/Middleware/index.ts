// @ts-nocheck - Example middleware - WIP
/**
 * Example Middleware
 * Common middleware patterns for Zintrust
 */

import { Logger } from '@config/logger';
import { Request } from '@http/Request';
import { Response } from '@http/Response';
import { CsrfTokenManager } from '@security/CsrfTokenManager';
import { JwtManager } from '@security/JwtManager';
import { XssProtection } from '@security/XssProtection';
import { Schema, ValidationError, Validator } from '@validation/Validator';

/**
 * Authentication Middleware
 * Verify user is authenticated
 */
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: () => Promise<void>
): Promise<void> => {
  const token = req.getHeader('authorization');

  if (!token) {
    res.setStatus(401).json({ error: 'Unauthorized' });
    return;
  }

  await next();
};

/**
 * CORS Middleware
 * Handle CORS headers
 */
export const corsMiddleware = async (
  req: Request,
  res: Response,
  next: () => Promise<void>
): Promise<void> => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.getMethod() === 'OPTIONS') {
    res.setStatus(200).send('');
    return;
  }

  await next();
};

/**
 * JSON Request Middleware
 * Parse JSON request bodies
 */
export const jsonMiddleware = async (
  req: Request,
  res: Response,
  next: () => Promise<void>
): Promise<void> => {
  if (req.getMethod() === 'GET' || req.getMethod() === 'DELETE') {
    await next();
    return;
  }

  if (!req.isJson()) {
    res.setStatus(415).json({ error: 'Content-Type must be application/json' });
    return;
  }

  await next();
};

/**
 * Logging Middleware
 * Log all requests
 */
export const loggingMiddleware = async (
  req: Request,
  res: Response,
  next: () => Promise<void>
): Promise<void> => {
  const startTime = Date.now();
  const method = req.getMethod();
  const path = req.getPath();

  Logger.info(`→ ${method} ${path}`);

  await next();

  const duration = Date.now() - startTime;
  const status = res.getStatus();
  Logger.info(`← ${status} ${method} ${path} (${duration}ms)`);
};

/**
 * Rate Limiting Middleware
 * Simple in-memory rate limiting
 */
const requestCounts = new Map<string, number[]>();

export const rateLimitMiddleware = async (
  req: Request,
  res: Response,
  next: () => Promise<void>
): Promise<void> => {
  const ip = req.getRaw().socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 100;

  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, []);
  }

  const requests = requestCounts.get(ip)!;
  const recentRequests = requests.filter((time) => now - time < windowMs);

  if (recentRequests.length >= maxRequests) {
    res.setStatus(429).json({ error: 'Too many requests' });
    return;
  }

  recentRequests.push(now);
  requestCounts.set(ip, recentRequests);

  await next();
};

/**
 * Trailing Slash Middleware
 * Redirect URLs with trailing slashes
 */
export const trailingSlashMiddleware = async (
  req: Request,
  res: Response,
  next: () => Promise<void>
): Promise<void> => {
  const path = req.getPath();

  if (path.length > 1 && path.endsWith('/')) {
    const withoutSlash = path.slice(0, -1);
    res.redirect(withoutSlash, 301);
    return;
  }

  await next();
};

/**
 * JWT Authentication Middleware
 * Verify JWT token and extract claims
 */
export const jwtMiddleware = (jwtManager: JwtManager, algorithm: 'HS256' | 'RS256' = 'HS256') => {
  return async (req: Request, res: Response, next: () => Promise<void>): Promise<void> => {
    const authHeader = req.getHeader('authorization');

    if (!authHeader) {
      res.setStatus(401).json({ error: 'Missing authorization header' });
      return;
    }

    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      res.setStatus(401).json({ error: 'Invalid authorization header format' });
      return;
    }

    try {
      const payload = jwtManager.verify(token, algorithm);
      // Store in request context (TypeScript allows dynamic properties)
      (req as any).user = payload;
      await next();
    } catch (error) {
      Logger.error('JWT verification failed:', error);
      res.setStatus(401).json({ error: 'Invalid or expired token' });
    }
  };
};

/**
 * CSRF Protection Middleware
 * Validate CSRF tokens for state-changing requests
 */
export const csrfMiddleware = (csrfManager: CsrfTokenManager) => {
  return async (req: Request, res: Response, next: () => Promise<void>): Promise<void> => {
    const method = req.getMethod();

    // Only validate on state-changing requests
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      await next();
      return;
    }

    const sessionId = (req as any).sessionId || req.getHeader('x-session-id');

    if (!sessionId) {
      res.setStatus(400).json({ error: 'Missing session ID' });
      return;
    }

    const csrfToken = req.getHeader('x-csrf-token');

    if (!csrfToken) {
      res.setStatus(403).json({ error: 'Missing CSRF token' });
      return;
    }

    const isValid = csrfManager.validateToken(sessionId, csrfToken as string);

    if (!isValid) {
      res.setStatus(403).json({ error: 'Invalid or expired CSRF token' });
      return;
    }

    await next();
  };
};

/**
 * Input Validation Middleware
 * Validate request body against schema
 */
export const validationMiddleware = (schema: Schema) => {
  return async (req: Request, res: Response, next: () => Promise<void>): Promise<void> => {
    if (req.getMethod() === 'GET' || req.getMethod() === 'DELETE') {
      await next();
      return;
    }

    try {
      const body = (req as any).body || {};
      Validator.validate(body, schema);
      await next();
    } catch (error) {
      Logger.error('Validation error:', error);
      if (error instanceof ValidationError) {
        res.setStatus(422).json({ errors: error.toObject() });
      } else {
        res.setStatus(400).json({ error: 'Invalid request body' });
      }
    }
  };
};

/**
 * XSS Protection Middleware
 * Sanitize and escape user input
 */
export const xssProtectionMiddleware = async (
  req: Request,
  res: Response,
  next: () => Promise<void>
): Promise<void> => {
  // Add XSS protection headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Sanitize request body if present
  const body = (req as any).body;
  if (body && typeof body === 'object') {
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') {
        (body as Record<string, unknown>)[key] = XssProtection.escape(value);
      }
    }
  }

  await next();
};
