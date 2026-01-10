# Password Reset

ZinTrust includes a small, framework-agnostic password reset token broker designed for **secure, storage-pluggable** password reset flows.

At a high level:

- You generate a high-entropy token for an **identifier** (typically an email).
- The broker stores **only a SHA-256 hash** of that token.
- You can **verify** a token and optionally **consume** it (one-time use).
- Storage is abstracted behind an interface so you can back it with Redis, a database table, KV, etc.

The default store is in-memory (great for tests and single-process dev, not suitable for multi-instance production).

## API surface

Create a broker:

```ts
import { PasswordResetTokenBroker } from '@zintrust/core';

const broker = PasswordResetTokenBroker.create({
  // store: yourStore,
  // ttlMs: 30 * 60 * 1000,
  // tokenBytes: 32,
});
```

Methods:

- `broker.createToken(identifier)` → returns a token string
- `broker.verifyToken(identifier, token)` → returns `boolean`
- `broker.consumeToken(identifier, token)` → returns `boolean` and deletes on success

You can also build an in-memory store directly:

```ts
const store = PasswordResetTokenBroker.createInMemoryStore();
const broker = PasswordResetTokenBroker.create({ store });
```

## Defaults and token format

The implementation defaults are:

- `ttlMs`: `30 * 60 * 1000` (30 minutes)
- `tokenBytes`: `32` bytes (256 bits)

Tokens are generated as `randomBytes(tokenBytes).toString('hex')`, so the default token length is `64` hex characters.

Invalid values are rejected:

- `ttlMs <= 0` throws a configuration error
- `tokenBytes <= 0` throws a configuration error

## Storage contract

The broker is only as correct as its store. A store must implement:

```ts
export interface IPasswordResetTokenStore {
  set(record): void | Promise<void>;
  get(identifier): record | null | Promise<record | null>;
  delete(identifier): void | Promise<void>;
  cleanup?(now?: Date): number | Promise<number>;
  clear?(): void | Promise<void>;
}
```

The stored record includes:

- `identifier` (string)
- `tokenHash` (SHA-256 hex)
- `createdAt` (Date)
- `expiresAt` (Date)

Important behavioral details:

- The broker stores **one active token per identifier** (a `set()` will overwrite prior tokens for the same identifier).
- `verifyToken(...)` deletes the record automatically when it is expired.
- `consumeToken(...)` calls `verifyToken(...)` and then deletes on success.

### Identifier normalization

The broker trims whitespace, but does not lowercase or canonicalize identifiers. For email-based resets, normalize your email values consistently (e.g., lowercase) before calling the broker.

## Recommended flow (end-to-end)

### 1) Request password reset

When the user submits their identifier:

```ts
const token = await broker.createToken(email);
const resetLink = `https://app.example.com/reset-password?email=${encodeURIComponent(
  email
)}&token=${encodeURIComponent(token)}`;
```

Send the link via email. Avoid logging the raw token.

### 2) Validate + reset password

When the user submits `email + token + newPassword`:

```ts
const ok = await broker.consumeToken(email, token);
if (!ok) {
  // invalid / expired / already used
  // respond with a generic message
}

// Proceed to update password hash in your user store
```

Use `consumeToken(...)` (not `verifyToken(...)`) for reset endpoints so tokens are single-use.

## Security and operational notes

- **No plaintext token storage**: only a SHA-256 hash is persisted.
- **Timing-safe compare**: hashes are compared in a timing-safe way.
- **Replay resistance**: use `consumeToken(...)` so tokens are deleted after a successful reset.
- **Distributed deployments**: use a shared store (Redis/DB/KV). The in-memory store will not work across multiple instances.
- **Enumeration & UX**: your “forgot password” endpoint should respond consistently (e.g., always 200) whether or not the identifier exists.
- **Rate limiting**: rate-limit reset requests and reset attempts per identifier and per IP.
- **Cleanup**: if your store supports it, run periodic cleanup (or rely on TTL/index-based expiration in your storage engine).

## Email template integration

ZinTrust includes a built-in Markdown mail template for password resets:

- `transactional/password-reset` (file: `src/tools/mail/templates/markdown/transactional/password-reset.md`)

It is designed to be rendered with variables like:

- `resetLink`
- `expiryMinutes`

Example:

```ts
import { renderTemplate } from '@zintrust/core/node';

const { html, meta } = renderTemplate('transactional/password-reset', {
  resetLink,
  expiryMinutes: 30,
});

// meta.subject is your email subject
// html is the rendered HTML body
```
