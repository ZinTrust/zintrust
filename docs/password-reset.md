# Password Reset

Zintrust includes a small, framework-agnostic password reset token flow in core.

It is intentionally **storage-pluggable** so you can back it with Redis, a database table, KV, etc. The default store is in-memory (good for tests and single-process dev).

## Core API

- `PasswordResetTokenBroker.create()`
- `broker.createToken(identifier)` → returns a high-entropy token string
- `broker.verifyToken(identifier, token)` → boolean
- `broker.consumeToken(identifier, token)` → boolean (one-time)

Only a SHA-256 hash of the token is stored.

## Typical flow

1. User submits “forgot password” with an identifier (usually email)
2. Generate token: `token = await broker.createToken(email)`
3. Send an email that includes a reset link: `https://app.example.com/reset-password?email=...&token=...`
4. User submits new password with `email + token`
5. Verify/consume the token, then update the password hash

## Templates

A built-in mail template exists at:

- `src/tools/mail/templates/markdown/transactional/password-reset.md`

It expects variables like `resetLink` and `expiryMinutes`.
