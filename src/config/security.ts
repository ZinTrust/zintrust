/**
 * Security Configuration
 * JWT, CSRF, encryption and other security settings
 * Sealed namespace for immutability
 */

import { appConfig } from '@config/app';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';

/**
 * Helper to warn about missing secrets
 */
function warnMissingSecret(secretName: string): string {
  Logger.error(`❌ CRITICAL: ${secretName} environment variable is not set!`);
  Logger.error('⚠️  Application may not function correctly. Set this in production immediately.');
  if (appConfig.isProduction()) {
    throw ErrorFactory.createConfigError(`Missing required secret: ${secretName}`, { secretName });
  }

  // In non-production environments, allow the app/CLI to start while still warning loudly.
  // This is intentionally predictable for local development and test tooling.
  return 'dev-unsafe-jwt-secret';
}

let cachedJwtSecret: string | undefined;

const securityConfigObj = {
  /**
   * JWT Configuration
   */
  jwt: {
    enabled: Env.getBool('JWT_ENABLED', true),
    get secret(): string {
      if (cachedJwtSecret !== undefined) return cachedJwtSecret;
      const isEnabled = Env.getBool('JWT_ENABLED', true);
      cachedJwtSecret = isEnabled
        ? Env.get('JWT_SECRET') || warnMissingSecret('JWT_SECRET')
        : Env.get('JWT_SECRET') || '';
      return cachedJwtSecret;
    },
    algorithm: Env.get('JWT_ALGORITHM', 'HS256') as 'HS256' | 'HS512' | 'RS256',
    expiresIn: Env.get('JWT_EXPIRES_IN', '1h'),
    refreshExpiresIn: Env.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    issuer: Env.get('JWT_ISSUER', 'zintrust'),
    audience: Env.get('JWT_AUDIENCE', 'zintrust-api'),
  },

  /**
   * CSRF Protection
   */
  csrf: {
    enabled: Env.getBool('CSRF_ENABLED', true),
    headerName: Env.get('CSRF_HEADER_NAME', 'x-csrf-token'),
    tokenName: Env.get('CSRF_TOKEN_NAME', '_csrf'),
    cookieName: Env.get('CSRF_COOKIE_NAME', 'XSRF-TOKEN'),
    cookieHttpOnly: Env.getBool('CSRF_COOKIE_HTTP_ONLY', true),
    cookieSecure: Env.getBool('CSRF_COOKIE_SECURE', true),
    cookieSameSite: Env.get('CSRF_COOKIE_SAME_SITE', 'strict') as 'strict' | 'lax' | 'none',
  },

  /**
   * Encryption
   */
  encryption: {
    algorithm: Env.get('ENCRYPTION_ALGORITHM', 'aes-256-cbc'),
    key: Env.get('ENCRYPTION_KEY', 'your-encryption-key'),
  },

  /**
   * API Key Authentication
   */
  apiKey: {
    enabled: Env.getBool('API_KEY_ENABLED', true),
    headerName: Env.get('API_KEY_HEADER', 'x-api-key'),
    secret: Env.get('API_KEY_SECRET'),
  },

  /**
   * CORS Configuration
   */
  cors: {
    enabled: Env.getBool('CORS_ENABLED', true),
    origins: Env.get('CORS_ORIGINS', '*').split(','),
    methods: Env.get('CORS_METHODS', 'GET,POST,PUT,PATCH,DELETE').split(','),
    allowedHeaders: Env.get('CORS_ALLOWED_HEADERS', 'Content-Type,Authorization').split(','),
    exposedHeaders: Env.get('CORS_EXPOSED_HEADERS', '').split(','),
    credentials: Env.getBool('CORS_CREDENTIALS', false),
    maxAge: Env.getInt('CORS_MAX_AGE', 86400),
  },

  /**
   * Rate Limiting
   */
  rateLimit: {
    enabled: Env.getBool('RATE_LIMIT_ENABLED', true),
    windowMs: Env.getInt('RATE_LIMIT_WINDOW_MS', 900000), // 15 minutes
    maxRequests: Env.getInt('RATE_LIMIT_MAX_REQUESTS', 100),
    message: Env.get('RATE_LIMIT_MESSAGE', 'Too many requests, please try again later'),
  },

  /**
   * XSS Protection
   */
  xss: {
    enabled: Env.getBool('XSS_ENABLED', true),
    reportUri: Env.get('XSS_REPORT_URI'),
  },

  /**
   * Helmet Security Headers
   */
  helmet: {
    enabled: Env.getBool('HELMET_ENABLED', true),
    contentSecurityPolicy: Env.getBool('CSP_ENABLED', true),
    hsts: {
      enabled: Env.getBool('HSTS_ENABLED', true),
      maxAge: Env.getInt('HSTS_MAX_AGE', 31536000),
      includeSubDomains: Env.getBool('HSTS_INCLUDE_SUBDOMAINS', true),
    },
  },

  /**
   * Session Configuration
   */
  session: {
    name: Env.get('SESSION_NAME', 'zintrust_session'),
    secret: Env.get('SESSION_SECRET', 'your-session-secret'),
    expiresIn: Env.getInt('SESSION_EXPIRES_IN', 1800000), // 30 minutes
    secure: Env.getBool('SESSION_SECURE', true),
    httpOnly: Env.getBool('SESSION_HTTP_ONLY', true),
    sameSite: Env.get('SESSION_SAME_SITE', 'strict') as 'strict' | 'lax' | 'none',
  },

  /**
   * Password settings
   */
  password: {
    minLength: Env.getInt('PASSWORD_MIN_LENGTH', 8),
    requireUppercase: Env.getBool('PASSWORD_REQUIRE_UPPERCASE', true),
    requireNumbers: Env.getBool('PASSWORD_REQUIRE_NUMBERS', true),
    requireSpecialChars: Env.getBool('PASSWORD_REQUIRE_SPECIAL_CHARS', true),
    bcryptRounds: Env.getInt('BCRYPT_ROUNDS', 10),
  },
} as const;

export const securityConfig = Object.freeze(securityConfigObj);
