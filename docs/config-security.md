# security config

- Source: `src/config/security.ts`

## Usage

Import from the framework:

```ts
import { security } from '@zintrust/core';

// Example (if supported by the module):
// security.*
```

## Encrypted envelope interoperability

ZinTrust supports reading/writing **framework-compatible encrypted payloads** (e.g. encrypted DB columns) using the same key material that other ecosystems commonly use.

Required env vars:

- `ENCRYPTION_CIPHER`: Cipher used for encrypted envelopes. Supported values (case-insensitive):
  - `aes-256-cbc`
  - `aes-256-gcm`
- `APP_KEY`: Base64 key material (32 bytes). Supports both `base64:...` and raw base64.

Optional:

- `APP_PREVIOUS_KEYS`: Key rotation fallback (comma-separated keys or JSON array). During decryption, ZinTrust will try `APP_KEY` first, then each previous key.

Migration guidance:

- Set `ENCRYPTION_CIPHER` to match your previous framework so you can **decrypt existing DB values without re-encrypting**.
- Keep `APP_KEY` the same value you already use in production.

### Examples

#### Encrypt/decrypt strings (encrypted envelope)

```ts
import { EncryptedEnvelope } from '@zintrust/core';

const cipher = 'aes-256-cbc';
const key = process.env.APP_KEY!; // supports `base64:...` or raw base64

const encrypted = EncryptedEnvelope.encryptString('hello', { cipher, key });
const plain = EncryptedEnvelope.decryptString(encrypted, { cipher, key });
```

#### Decrypt with key rotation (`APP_PREVIOUS_KEYS`)

```ts
import { EncryptedEnvelope } from '@zintrust/core';

const cipher = process.env.ENCRYPTION_CIPHER!;
const key = process.env.APP_KEY!;

// Example: if you rotated keys, keep the old ones here (comma-separated or JSON array)
const previousKeys = (process.env.APP_PREVIOUS_KEYS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const plain = EncryptedEnvelope.decryptString('<db_value>', { cipher, key, previousKeys });
```

#### Encrypt/decrypt structured data (serialized payload envelope)

ZinTrust does not assume a specific serialization format. You provide it:

```ts
import { EncryptedEnvelope } from '@zintrust/core';

const serializer = {
  serialize: (v: unknown) => JSON.stringify(v),
  deserialize: (s: string) => JSON.parse(s) as unknown,
};

const cipher = process.env.ENCRYPTION_CIPHER!;
const key = process.env.APP_KEY!;

const encrypted = EncryptedEnvelope.encrypt({ a: 1 }, { cipher, key, serializer });
const decrypted = EncryptedEnvelope.decrypt(encrypted, { cipher, key, serializer });
```

## Snapshot (top)

```ts
/**
 * Security Configuration
 * JWT, CSRF, encryption and other security settings
 * Sealed namespace for immutability
 *
 * APP_KEY: Primary encryption key for storage signing and app-level encryption.
 *          Set automatically during project scaffolding.
 *
 * Security keys can be configured per domain:
 * - APP_KEY: Default encryption key for all operations (auto-generated)
 * - API_KEY_SECRET: Optional API key authentication (if API_KEY_ENABLED=true)
 * - ENCRYPTION_KEY: Optional separate encryption key (overrides APP_KEY if set)
 * - JWT_SECRET: JWT token signing key
 *
 * Developers can use a single APP_KEY or configure separate keys for different
 * security domains (e.g., different keys for different microservices).
 */

import { Env } from '@zintrust/core';
import { appConfig, ErrorFactory, Logger } from '@zintrust/core';

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

  // Note: If `JWT_SECRET` is not provided the framework will fall back to `APP_KEY` for signing/verification.
  // In production you should still set an explicit `JWT_SECRET` and keep secrets rotated.

  jwt: {
    enabled: Env.getBool('JWT_ENABLED', true),
    get secret(): string {
      if (cachedJwtSecret !== undefined) return cachedJwtSecret;
      const isEnabled = Env.getBool('JWT_ENABLED', true);
      cachedJwtSecret = isEnabled
        ? Env.get('JWT_SECRET') || Env.get('APP_KEY') || warnMissingSecret('JWT_SECRET')
        : Env.get('JWT_SECRET') || Env.get('APP_KEY') || '';
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
    CSRF_STORE: get('CSRF_STORE', ''),
    CSRF_DRIVER: get('CSRF_DRIVER', ''),
    CSRF_REDIS_DB: getInt('CSRF_REDIS_DB', 1),
```

## Snapshot (bottom)

```ts
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

```
