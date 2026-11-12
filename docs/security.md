# Security

ZinTrust is built with security as a top priority, providing built-in protection against common web vulnerabilities.

## Security Architecture (Defense-in-Depth)

ZinTrust documents a **10-layer defense-in-depth model**. Some protections are included in the default global middleware; others are route-level utilities or application responsibilities. Configure and verify controls for each application and deployment.

| Layer  | Control                  | Location          | Purpose                                                   |
| ------ | ------------------------ | ----------------- | --------------------------------------------------------- |
| **1**  | Security Headers         | Global Middleware | HSTS, CSP, X-Frame-Options, X-Content-Type-Options; configure CSP directives for your app |
| **2**  | CORS                     | Global Middleware | Origin and preflight handling; the default origin is `*`, so configure an allow-list       |
| **3**  | Rate Limiting            | Global Middleware | 100 requests/minute by default; configurable per route                                     |
| **4**  | CSRF Protection          | Global Middleware | Double-submit cookie: echo the `XSRF-TOKEN` in a header or body field                      |
| **5**  | XSS Sanitization         | Global Middleware | Recursive tag stripping on JSON request bodies, excluding GET, HEAD, OPTIONS, and DELETE   |
| **6**  | Field Sanitization       | Route Middleware  | Type-specific input normalization via `Sanitizer.*`       |
| **7**  | Schema Validation        | Route Middleware  | Type checking, format validation via `Validator.validate` |
| **8**  | Authentication           | Route Middleware  | JWT verification, session validation                      |
| **9**  | Authorization            | Controller Logic  | Role-based access control, ownership checks               |
| **10** | SQL Injection Prevention | Database Layer    | Prepared statements via QueryBuilder                      |

This model is an implementation guide, not a compliance certification or a guarantee that every control is enabled, independent, or effective in every application. Security depends on correct configuration, application authorization logic, deployment settings, and verification.

## SQL Injection

The ORM and Query Builder bind query values and restrict identifiers and operators to supported forms. This helps prevent SQL injection when using these APIs; it does not make an application immune to SQL injection. Avoid constructing raw SQL with untrusted input. FTS5 `MATCH` query strings are bound as values but still have FTS query-language semantics, so sanitize or constrain user-provided search terms.

### Interface Reference (safe surface)

QueryBuilder only accepts safe identifier paths and allow-listed operators. Values are bound; column-to-column comparisons and correlated subqueries use structured helpers (`whereColumn`, `whereExists` / `whereNotExists`, multi-term join ON builders, `groupBy`, `latestPer`). SQLite/D1 FTS5 `MATCH` / `NOT MATCH` are allow-listed and parameterized; the bound string is still FTS query language, so applications must sanitize user tokens. See [Query Builder](./query-builder.md) for full examples.

```typescript
export interface IQueryBuilder {
  select(...columns: string[]): IQueryBuilder;
  where(column: string, operator: string | number | boolean | null, value?: unknown): IQueryBuilder;
  orWhere(column: string, operator: string, value?: unknown): IQueryBuilder;
  whereGroup(callback: (builder: IQueryBuilder) => unknown): IQueryBuilder;
  orWhereGroup(callback: (builder: IQueryBuilder) => unknown): IQueryBuilder;
  whereNormalized(column: string, value: unknown, options?: NormalizedTextOptions): IQueryBuilder;
  whereNull(column: string): IQueryBuilder;
  whereNotNull(column: string): IQueryBuilder;
  whereIn(column: string, values: unknown[]): IQueryBuilder;
  whereNotIn(column: string, values: unknown[]): IQueryBuilder;
  whereMatch(column: string, query: string): IQueryBuilder;
  whereNotMatch(column: string, query: string): IQueryBuilder;
  whereColumn(left: string, operator: string, right: string): IQueryBuilder;
  whereExists(callback: (builder: IQueryBuilder) => unknown): IQueryBuilder;
  whereNotExists(callback: (builder: IQueryBuilder) => unknown): IQueryBuilder;
  from(table: string): IQueryBuilder;
  join(table: string, on: string | ((on: IJoinOnBuilder) => unknown)): IQueryBuilder;
  leftJoin(table: string, on: string | ((on: IJoinOnBuilder) => unknown)): IQueryBuilder;
  groupBy(...columns: string[]): IQueryBuilder;
  latestPer(
    partitionBy: string | string[],
    options: { orderBy: Array<[string, 'ASC' | 'DESC']>; alias?: string }
  ): IQueryBuilder;
  orderBy(column: string, direction?: 'ASC' | 'DESC'): IQueryBuilder;
  limit(count: number): IQueryBuilder;
  offset(count: number): IQueryBuilder;
  paginate(page: number, perPage: number, options?: PaginationOptions): Promise<Paginator>;
  get(): Promise<Record<string, unknown>[]>;
  first(): Promise<Record<string, unknown> | null>;
  insert(data: Record<string, unknown>): Promise<InsertResult>;
  update(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
```

## Cross-Site Request Forgery (CSRF)

ZinTrust includes a `CsrfMiddleware` that verifies CSRF tokens for unsafe methods (all methods other than GET, HEAD, and OPTIONS).

By default it uses the **Double Submit Cookie** pattern: the server issues an `XSRF-TOKEN` cookie on safe requests and expects the client to echo the same value in an `X-CSRF-Token` header or `_csrf` body field on unsafe requests. The cookie by itself is not accepted as the submitted token.

### Skipping CSRF for APIs

If you're building a pure Bearer-token API (no cookie-based authentication), you can bypass CSRF checks for selected routes by
configuring `skipPaths`:

```typescript
import { CsrfMiddleware } from '@zintrust/core/security';

const csrf = CsrfMiddleware.create({
  skipPaths: ['/api/*'],
});
```

```typescript
// In your HTML form
<input type="hidden" name="_csrf" value="{{ csrf_token() }}">
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

The framework provides an `Xss` utility that strips HTML tags from untrusted values as a defense-in-depth measure. It is not a substitute for context-aware output encoding or safe templating.

```typescript
import { Xss } from '@zintrust/core/security';

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
import { Hash } from '@zintrust/core/security';

const hashedPassword = await Hash.make(password);
const matches = await Hash.check(password, hashedPassword);
```

### Interface Reference

```typescript
export interface IHash {
  isValidHash(hash: string): boolean;
  hash(plaintext: string): Promise\<string>;
  hashWithRounds(plaintext: string, rounds: number): Promise\<string>;
  verify(plaintext: string, hashed: string): Promise\<boolean>;
}
```

## Rate Limiting

Protect your API from brute-force attacks using the `RateLimiter` middleware:

```typescript
Router.post(router, '/login', loginHandler, {
  middleware: ['rateLimit:6:1'],
});

Router.post(router, '/bursty-endpoint', burstHandler, {
  middleware: ['rateLimit:100:0.4'],
});
```

The inline route syntax is `rateLimit:<max>:<windowInMinutes>`. Fractional minute windows are supported, so `rateLimit:100:0.4` means 100 requests every 24 seconds.

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
import { Sanitizer } from '@zintrust/core/security';

const username = Sanitizer.alphanumeric(req.body.username);
const email = Sanitizer.email(req.body.email);
const phoneClean = Sanitizer.digitsOnly(req.body.phone);
```

Use this for normalizing identifiers, cleaning phone numbers, and reducing unexpected characters before storage/logging.

### Interface Reference

```typescript
export type SanitizerType = Readonly\<{
  parseAmount: (value: unknown) => number;
  alphanumeric: (value: unknown) => string;
  alphanumericDotDash: (value: unknown) => string;
  nonNegativeNumericStringOrNull: (value: unknown) => number | null | string;
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
