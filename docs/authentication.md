# Authentication

ZinTrust provides a flexible authentication system that supports multiple drivers, including JWT and Session-based auth.

For reusable login orchestration, ZinTrust also provides `LoginFlow`. Use it when you want account lookup, credential verification, token or session issuance, and audit hooks to live in one reusable flow instead of being rebuilt in each controller. See [plug-and-play-auth-login](/plug-and-play-auth-login).

## Configuration

JWT auth is configured primarily via environment variables (see `src/config/security.ts`):

- `JWT_SECRET` (falls back to `APP_KEY` when empty)
- `JWT_ALGORITHM` (default `HS256`)
- `JWT_EXPIRES_IN` (seconds; default `3600`)

Token invalidation (logout) uses the JWT revocation store:

- `JWT_REVOCATION_DRIVER` (default `database`; `database`, `redis`, `kv`, `kv-remote`, `memory`)

When using the `database` driver, run migrations to create the `zintrust_jwt_revocations` table.

## JWT Revocation Driver Selection

Use this as a quick rule-of-thumb when choosing `JWT_REVOCATION_DRIVER`:

| Runtime / deployment                                          | Recommended driver | Notes                                                                                                                                                             |
| ------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js (local dev / servers)                                 | `database`         | Default. Requires the `zintrust_jwt_revocations` migration. Works with `postgresql`, `mysql`, `sqlite`, `d1-remote`, etc (anything supported by `useDatabase()`). |
| Cloudflare Workers (with KV binding)                          | `kv`               | Requires a KV binding (default binding name `CACHE`, configurable via `JWT_REVOCATION_KV_BINDING`).                                                               |
| Cloudflare Workers (no KV binding, but you have the KV proxy) | `kv-remote`        | Uses `KV_REMOTE_URL`, `KV_REMOTE_KEY_ID`, `KV_REMOTE_SECRET`, optional `KV_REMOTE_NAMESPACE`. Works from both Node and Workers because it’s HTTP-based.           |
| Any runtime (simple/dev only)                                 | `memory`           | Process-local only (clears on restart; not shared across instances).                                                                                              |
| Any runtime (Redis available)                                 | `redis`            | Centralized store, but requires Redis connectivity and config.                                                                                                    |

## Using the Auth Guard

```typescript
import { Auth } from '@zintrust/core';

// Attempt login
const token = await Auth.guard('jwt').attempt({ email, password });

if (token) {
  return res.json({ token });
}

// Get authenticated user
const user = await Auth.user();

// Check if authenticated
if (await Auth.check()) {
  // ...
}
```

## Plug & Play LoginFlow

Use `LoginFlow` when you want a reusable login contract but still need application-owned account lookup and credential verification.

```ts
import { Auth, ErrorFactory, LoginFlow } from '@zintrust/core';

LoginFlow.registerProvider('password', {
  identify: async ({ email }) => User.where('email', '=', email).first(),
  verify: async (user, { password }) => {
    if (!user) {
      throw ErrorFactory.createUnauthorizedError('Invalid credentials');
    }

    const ok = await Auth.compare(password, String(user.password ?? ''));
    if (!ok) {
      throw ErrorFactory.createUnauthorizedError('Invalid credentials');
    }

    return {
      user,
      subject: String(user.id),
      claims: {
        sub: String(user.id),
        email: String(user.email),
      },
    };
  },
});

const result = await LoginFlow.create({
  provider: 'password',
  context: { requestId: req.getHeader('x-request-id') },
})
  // LoginFlow passes these values directly into the provider callbacks.
  .identify({ email })
  .verify({ password })
  .issue('jwt')
  .audit()
  .run();

res.json({ token: result.issued, user: result.verified.user });
```

The built-in `jwt` issuer uses `JwtManager.signAccessToken(...)`. The built-in `.audit()` path uses the core trace auditor; register a custom auditor when you need application-specific logging or compliance sinks.

## Protecting Routes

Use the `auth` + `jwt` middleware to protect your routes:

```typescript
Router.get(router, '/api/v1/profile', handler, { middleware: ['auth', 'jwt'] });
```

### Accessing the authenticated user in handlers

When `jwt` middleware succeeds, it attaches the verified JWT payload to the request:

- `req.user` (request lifecycle)

So route handlers do not need to re-verify JWTs.

### Bulletproof Auth (recommended for high-risk apps)

If you want strong protection against stolen JWT reuse, use **Bulletproof Auth** (JWT + token revocation + signed-request proof + replay + device binding):

```ts
Router.get(router, '/api/v1/profile', handler, { middleware: ['auth', 'bulletproof'] });
```

See: `bulletproof-auth` documentation page.

## API Key Authentication

For service-to-service communication, you can use API keys:

```typescript
Router.group(
  router,
  '/api',
  (r) => {
    Router.get(r, '/stats', async (_req, res) => {
      res.json({ ok: true });
    });
  },
  { middleware: ['auth:api-key'] }
);
```
