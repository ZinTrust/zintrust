# Authentication

ZinTrust provides a flexible authentication system that supports multiple drivers, including JWT and Session-based auth.

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

## Protecting Routes

Use the `auth` + `jwt` middleware to protect your routes:

```typescript
Router.get(router, '/api/v1/profile', handler, { middleware: ['auth', 'jwt'] });
```

## API Key Authentication

For service-to-service communication, you can use API keys:

```typescript
router.group({ middleware: ['auth:api-key'] }, (r) => {
  r.get('/stats', 'StatsController@index');
});
```
