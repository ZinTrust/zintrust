# Security

ZinTrust is built with security as a top priority, providing built-in protection against common web vulnerabilities.

## Security Architecture (Defense-in-Depth)

ZinTrust implements a **10-layer security architecture** where attackers must breach multiple independent security controls:

| Layer  | Control                  | Location          | Purpose                                                   |
| ------ | ------------------------ | ----------------- | --------------------------------------------------------- |
| **1**  | Security Headers         | Global Middleware | HSTS, CSP, X-Frame-Options, X-Content-Type-Options        |
| **2**  | CORS                     | Global Middleware | Origin validation, preflight handling                     |
| **3**  | Rate Limiting            | Global Middleware | 100 req/min baseline (configurable per-route)             |
| **4**  | CSRF Protection          | Global Middleware | Double Submit Cookie pattern                              |
| **5**  | XSS Sanitization         | Global Middleware | Recursive HTML stripping via `Xss.sanitize`               |
| **6**  | Field Sanitization       | Route Middleware  | Type-specific input normalization via `Sanitizer.*`       |
| **7**  | Schema Validation        | Route Middleware  | Type checking, format validation via `Validator.validate` |
| **8**  | Authentication           | Route Middleware  | JWT verification, session validation                      |
| **9**  | Authorization            | Controller Logic  | Role-based access control, ownership checks               |
| **10** | SQL Injection Prevention | Database Layer    | Prepared statements via QueryBuilder                      |

### Defense-in-Depth Benefits

1. **Multiple Failure Points:** Each layer provides independent protection
2. **Attack Surface Reduction:** Early rejection reduces processing overhead
3. **Compliance Ready:** Meets SOC2, HIPAA, PCI-DSS requirements
4. **Observable Security:** Each layer generates audit logs
5. **Fail-Safe Design:** One layer's failure doesn't compromise others

## SQL Injection

The ORM and Query Builder use prepared statements for all queries, making your application immune to SQL injection by default.

All prepared statements are automatically parameterized—user input is never concatenated into SQL.

### Interface Reference

```typescript
export interface IQueryBuilder {
  where(column: string, operator: string, value?: unknown): IQueryBuilder;
  whereIn(column: string, values: unknown[]): IQueryBuilder;
  whereNotIn(column: string, values: unknown[]): IQueryBuilder;
  whereNull(column: string): IQueryBuilder;
  whereNotNull(column: string): IQueryBuilder;
  orWhere(column: string, operator: string, value?: unknown): IQueryBuilder;
  select(...columns: string[]): IQueryBuilder;
  get(): Promise<Record<string, unknown>[]>;
  first(): Promise<Record<string, unknown> | null>;
  count(): Promise<number>;
  pluck(column: string): Promise<unknown[]>;
  insert(data: Record<string, unknown>): Promise<number>;
  update(data: Record<string, unknown>): Promise<number>;
  delete(): Promise<number>;
}
```

## Cross-Site Request Forgery (CSRF)

ZinTrust includes a `CsrfMiddleware` that automatically verifies CSRF tokens for all state-changing requests (POST, PUT, DELETE).

By default it uses the **Double Submit Cookie** pattern: the server issues an `XSRF-TOKEN` cookie on safe requests and expects the
client to echo that value back on unsafe requests (typically via `X-CSRF-Token` header).

### Skipping CSRF for APIs

If you're building a pure Bearer-token API (no cookie-based authentication), you can bypass CSRF checks for selected routes by
configuring `skipPaths`:

```typescript
import { CsrfMiddleware } from '@zintrust/core';

const csrf = CsrfMiddleware.create({
  skipPaths: ['/api/*'],
});
```

```typescript
// In your HTML form
<input type="hidden" name="_token" value="{{ csrf_token() }}">
```

### Interface Reference

```typescript
export interface CsrfTokenData {
  token: string;
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface ICsrfTokenManager {
  generateToken(sessionId: string): string;
  validateToken(sessionId: string, token: string): boolean;
  invalidateToken(sessionId: string): void;
  getTokenData(sessionId: string): CsrfTokenData | null;
  refreshToken(sessionId: string): string | null;
  cleanup(): number;
  clear(): void;
  getTokenCount(): number;
}
```

## Cross-Site Scripting (XSS)

The framework provides an `XssProtection` utility to sanitize user input and prevent XSS attacks.

```typescript
import { Xss } from '@zintrust/core';

const cleanHtml = Xss.sanitize(req.body.content);
```

### Interface Reference

```typescript
export interface IXssProtection {
  escape(text: string): string;
  sanitize(html: string): string;
  sanitizeAttribute(value: string, context?: 'href' | 'src'): string;
}

export interface IXss {
  sanitize(input: unknown): unknown;
}
```

## Password Hashing

Always use the built-in `Hash` utility for storing passwords:

```typescript
import { Hash } from '@zintrust/core';

const hashedPassword = await Hash.make(password);
const matches = await Hash.check(password, hashedPassword);
```

### Interface Reference

```typescript
export interface IHash {
  isValidHash(hash: string): boolean;
  hash(plaintext: string): Promise<string>;
  hashWithRounds(plaintext: string, rounds: number): Promise<string>;
  verify(plaintext: string, hashed: string): Promise<boolean>;
}
```

## Rate Limiting

Protect your API from brute-force attacks using the `RateLimiter` middleware:

```typescript
router.get('/login', 'AuthController@login', { middleware: ['throttle:6,1'] });
```

### Interface Reference

```typescript
export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  statusCode?: number;
  headers?: boolean;
  keyGenerator?: (req: IRequest) => string;
  store?: 'memory' | 'redis' | 'kv' | 'db';
}
```

## Input Sanitizer

The `Sanitizer` utility provides character whitelisting to remove unwanted characters from user input.

**Important**: This is NOT a complete SQL injection defense. Always use parameterized queries via the ORM/QueryBuilder.

```typescript
import { Sanitizer } from '@zintrust/core';

const username = Sanitizer.alphanumeric(req.body.username);
const email = Sanitizer.email(req.body.email);
const phoneClean = Sanitizer.digitsOnly(req.body.phone);
```

Use this for normalizing identifiers, cleaning phone numbers, and reducing unexpected characters before storage/logging.

### Interface Reference

```typescript
export type SanitizerType = Readonly<{
  parseAmount: (value: unknown) => number;
  alphanumeric: (value: unknown) => string;
  alphanumericDotDash: (value: unknown) => string;
  lockNonNegativeNumberString: (value: unknown) => number | null | string;
  addressText: (value: unknown) => string;
  emailLike: (value: unknown) => string;
  email: (value: unknown) => string;
  messageText: (value: unknown) => string;
  numericDotOnly: (value: unknown) => string;
  ipAddressText: (value: unknown) => string;
  nameText: (value: unknown) => string;
  alphaNumericColonDash: (value: unknown) => string;
  digitsOnly: (value: unknown) => string;
  decimalString: (value: unknown) => string;
  dateSlash: (value: unknown) => string;
  safePasswordChars: (value: unknown) => string;
  wordCharsAndSpaces: (value: unknown) => string;
  lowercaseAlphanumeric: (value: unknown) => string;
  uppercaseAlphanumeric: (value: unknown) => string;
  alphanumericNoSpaces: (value: unknown) => string;
  dateSlashNoSpaces: (value: unknown) => string;
  uuidTokenSafe: (value: unknown) => string;
  tokenSafe: (value: unknown) => string;
  keyLike: (value: unknown) => string;
}>;
```
