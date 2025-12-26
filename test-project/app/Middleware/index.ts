import {
  type CsrfTokenManagerType,
  type ICsrfTokenManager,
  type IJwtManager,
  type JwtAlgorithm,
  type JwtManagerType,
  type IRequest,
  type IResponse,
  XssProtection,
  type ISchema,
  type SchemaType,
  Validator,
} from '@zintrust/core';
/**
 * Example Middleware
 * Common middleware patterns for Zintrust
 */

import { Logger } from '@config/logger';

type JwtManagerInput = IJwtManager | JwtManagerType;
type CsrfManagerInput = ICsrfTokenManager | CsrfTokenManagerType;

const resolveJwtManager = (jwtManager: JwtManagerInput): IJwtManager =>
  'verify' in jwtManager ? jwtManager : jwtManager.create();

const resolveCsrfManager = (csrfManager: CsrfManagerInput): ICsrfTokenManager =>
  'validateToken' in csrfManager ? csrfManager : csrfManager.create();

type ValidationSchema = ISchema | SchemaType;

const resolveSchema = (schema: ValidationSchema): ISchema =>
  'getRules' in schema ? schema : schema.create();

/**
 * Authentication Middleware
 * Verify user is authenticated
 */
export const authMiddleware = async (
  req: IRequest,
  res: IResponse,
  next: () => Promise<void>
): Promise<void> => {
  const token = req.getHeader('authorization');

  if (token === undefined || token === '') {
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
  req: IRequest,
  res: IResponse,
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
  req: IRequest,
  res: IResponse,
  next: () => Promise<void>
): Promise<void> => {
  if (req.getMethod() === 'GET' || req.getMethod() === 'DELETE') {
    await next();
    return;
  }

  if (req.isJson() === false) {
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
  req: IRequest,
  res: IResponse,
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
  req: IRequest,
  res: IResponse,
  next: () => Promise<void>
): Promise<void> => {
  const ip = req.getRaw().socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 100;

  if (requestCounts.has(ip) === false) {
    requestCounts.set(ip, []);
  }

  const requests = requestCounts.get(ip) ?? [];
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
  req: IRequest,
  res: IResponse,
  next: () => Promise<void>
): Promise<void> => {
  const path = req.getPath();

  if (path.length > 1 && path.endsWith('/') === true) {
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
export const jwtMiddleware = (jwtManager: JwtManagerInput, algorithm: JwtAlgorithm = 'HS256') => {
  return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
    const authHeader = req.getHeader('authorization');

    if (authHeader === undefined || authHeader === '') {
      res.setStatus(401).json({ error: 'Missing authorization header' });
      return;
    }

    const authHeaderStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    const [scheme, token] = authHeaderStr.split(' ');

    if (scheme !== 'Bearer' || token === undefined || token === '') {
      res.setStatus(401).json({ error: 'Invalid authorization header format' });
      return;
    }

    try {
      const payload = resolveJwtManager(jwtManager).verify(token, algorithm);
      // Store in request context (TypeScript allows dynamic properties)
      req.user = payload;
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
export const csrfMiddleware = (csrfManager: CsrfManagerInput) => {
  return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
    const method = req.getMethod();

    // Only validate on state-changing requests
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) === false) {
      await next();
      return;
    }

    const sessionId = req.sessionId ?? req.getHeader('x-session-id');

    if (sessionId === undefined || sessionId === '') {
      res.setStatus(400).json({ error: 'Missing session ID' });
      return;
    }

    const csrfToken = req.getHeader('x-csrf-token');

    if (csrfToken === undefined || csrfToken === '') {
      res.setStatus(403).json({ error: 'Missing CSRF token' });
      return;
    }

    const isValid = resolveCsrfManager(csrfManager).validateToken(
      String(sessionId),
      String(csrfToken)
    );

    if (isValid === false) {
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
export const validationMiddleware = (schema: SchemaType) => {
  return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
    if (req.getMethod() === 'GET' || req.getMethod() === 'DELETE') {
      await next();
      return;
    }

    try {
      const body = req.body ?? {};
      Validator.validate(body, resolveSchema(schema));
      await next();
    } catch (error: unknown) {
      Logger.error('Validation error:', error);
      const newError = error as Error & { toObject?: () => Record<string, unknown> };
      if (
        error !== undefined &&
        'toObject' in newError &&
        typeof newError.toObject === 'function'
      ) {
        res.setStatus(422).json({ errors: newError.toObject() });
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
  req: IRequest,
  res: IResponse,
  next: () => Promise<void>
): Promise<void> => {
  // Add XSS protection headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Sanitize request body if present
  const body = req.body;
  if (body !== undefined && body !== null && typeof body === 'object') {
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') {
        body[key] = XssProtection.escape(value);
      }
    }
  }

  await next();
};
