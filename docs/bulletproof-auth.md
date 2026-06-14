# Bulletproof Authentication

ZinTrust ships with `JwtAuthMiddleware` for standard Bearer JWT auth. For applications that need **strong protection against stolen JWTs**, ZinTrust provides **Bulletproof Auth** — a layered middleware that combines JWT verification with a **proof-of-possession signed request**, strict device binding, and replay protection.

> **TL;DR:** If an attacker steals a JWT, they are still blocked — they cannot generate the required signed-request proof without the per-device secret stored on the user's device.

---

## How It Works — The 7–9 Layers

Each layer must pass in order. Any failure returns **401 Unauthorized** immediately.

| #   | Layer                               | What it checks                                                            |
| --- | ----------------------------------- | ------------------------------------------------------------------------- |
| 1   | **Authorization header**            | `Authorization: Bearer <jwt>` is present                                  |
| 2   | **Token revocation**                | JWT has not been revoked via `TokenRevocation`                            |
| 3   | **Signed-request headers**          | All five `x-zt-*` headers are present                                     |
| 4   | **Timestamp freshness**             | `x-zt-timestamp` is within the replay window (default ±60 s)              |
| 5   | **Nonce replay guard**              | `(keyId, nonce)` has not been seen before                                 |
| 6   | **Signature verification**          | HMAC-SHA256 of the canonical request matches `x-zt-signature`             |
| 7   | **Device binding**                  | `x-zt-device-id === x-zt-key-id`; optionally matches `deviceId` JWT claim |
| 8   | **Timezone binding** _(optional)_   | `x-zt-timezone` matches the `tz` JWT claim when present                   |
| 9   | **User-Agent binding** _(optional)_ | SHA-256(`User-Agent`) matches the `uaHash` JWT claim when present         |

> Layers 8 and 9 are weaker by nature (headers can be spoofed), but they add meaningful friction and can surface anomalous access patterns.

---

## Login Flow

The Bulletproof flow requires the server to issue a **device secret** alongside the JWT at login time. The client stores both and uses the secret to sign every subsequent request.

```
Client                                    Server
  │                                          │
  │  POST /auth/login  {email, password}     │
  │ ────────────────────────────────────>    │
  │                                          │  Verify credentials
  │                                          │  • Sign JWT with deviceId claim
  │                                          │  • Generate per-device secret
  │  200 { jwt, deviceId, deviceSecret }     │
  │ <────────────────────────────────────    │
  │                                          │
  │  Store jwt + deviceId + deviceSecret     │
  │  in secure storage (Keychain / KV)       │
  │                                          │
  │  GET /api/me  (signed request)           │
  │  Authorization: Bearer <jwt>             │
  │  x-zt-key-id: <deviceId>                │
  │  x-zt-timestamp: <nowMs>                 │
  │  x-zt-nonce: <uuid>                      │
  │  x-zt-body-sha256: <sha256>              │
  │  x-zt-signature: <hmac>                  │
  │  x-zt-device-id: <deviceId>             │
  │ ────────────────────────────────────>    │
  │                                          │  BulletproofAuth checks layers 1–9
  │  200 { ... }                             │
  │ <────────────────────────────────────    │
```

---

## Backend Setup

### 1. Register the middleware

Fresh ZinTrust apps already register the `bulletproof` middleware key in core. You only need to override it when you want custom failure payloads or a custom secret resolver.

If you do override it in `config/middleware.ts`, use the core middleware and core device store:

```ts
import { BulletproofAuthMiddleware, BulletproofDeviceStore } from '@zintrust/core';

export default {
  bulletproof: BulletproofAuthMiddleware.create({
    /**
     * Optional override: resolve a per-device secret by keyId.
     * The built-in middleware already checks BulletproofDeviceStore first.
     */
    getSecretForKeyId: async (keyId) => {
      const device = await BulletproofDeviceStore.findByDeviceId(keyId);
      return device?.signingSecret ?? undefined;
    },
  }),
};
```

### 2. Protect your routes

```ts
// routes/api.ts
Router.get('/me', 'UserController.me', {
  middleware: ['auth', 'bulletproof'],
});

Router.get('/profile', 'ProfileController.show', {
  middleware: ['auth', 'bulletproof'],
});
```

### 2a. Customize Bulletproof Failure Payloads

If you want to keep the built-in bulletproof verification logic but return an app-specific JSON payload, wire a responder in `config/middleware.ts`:

```ts
import type { MiddlewaresType } from '@zintrust/core';
import { authFailureResponder } from '@app/Middleware/AuthFailureResponder';

export default {
  responders: {
    bulletproof: authFailureResponder,
  },
} as MiddlewaresType;
```

The built-in bulletproof responder currently uses the stable `reason` value `unauthorized` for all verification failures.

### 3. Login controller — full example

Fresh apps can use the built-in `LoginFlow` Bulletproof issuer and the core-backed `BulletproofDeviceStore`.

**Run the migration command first** so the `zintrust_bulletproof_devices` table exists:

- Regular / MySQL / Postgres / SQLite: `zin migrate`
- Cloudflare D1 (see `wrangler.jsonc` → `d1_databases[].migrations_dir`, typically `database/migrations/d1`): `zin d1:migrate --local` (or `--remote --database <name>`)

The D1 command compiles the source TS migration (including the bulletproof devices table) into SQL and applies it via Wrangler.

```ts
// app/Controllers/AuthController.ts
import { Controller, LoginFlow } from '@zintrust/core';
import type { IRequest as Request } from '@http/Request';
import type { IResponse as Response } from '@http/Response';

export class AuthController extends Controller {
  /**
   * POST /auth/login
   * Body: { email: string; password: string; deviceId?: string }
   *
   * Returns: { jwt, deviceId, deviceSecret }
   */
  async login(req: Request, res: Response) {
    const { email, password } = req.body as { email: string; password: string };

    const result = await LoginFlow.create({
      provider: passwordLoginProvider,
      context: Object.freeze({ request: req, email }),
    })
      .identify({ email })
      .verify({ password })
      .issue('bulletproof')
      .audit()
      .run();

    return res.json(result.issued);
  }

  /**
   * POST /auth/logout
   * Revokes the JWT and removes the device record.
   */
  async logout(req: Request, res: Response) {
    const token = String(req.getHeader('authorization') ?? '').replace('Bearer ', '');
    await TokenRevocation.revoke(token);

    const deviceId = req.header('x-zt-device-id');
    if (deviceId) {
      await BulletproofDeviceStore.removeByDeviceId(deviceId);
    }

    return res.json({ message: 'Logged out' });
  }
}
```

Register the routes:

```ts
Router.post('/auth/login', 'AuthController.login');
Router.post('/auth/logout', 'AuthController.logout', {
  middleware: ['auth', 'bulletproof'],
});
```

### 4. Quick start — single shared secret

For simple setups (e.g. server-to-server integrations), skip the core device store and use a single environment secret:

```bash
# .env
BULLETPROOF_SIGNING_SECRET=base64:your-secret-here
BULLETPROOF_SIGNING_SECRET_BK=[]       # rotation backups (JSON array)
```

Generate the secret via the CLI:

```bash
zin key:bulletproof
```

Fallback chain (when `BULLETPROOF_SIGNING_SECRET` is empty):
`BULLETPROOF_SIGNING_SECRET` → `AUTH_KEY` → `APP_KEY`

> In this mode, **all clients share the same secret**. This is acceptable for trusted server-to-server calls, but per-device secrets are strongly preferred for user-facing apps.

### 5. Key rotation

Rotate `BULLETPROOF_SIGNING_SECRET` without breaking in-flight clients:

```bash
# Generates a new secret and moves the current one to BULLETPROOF_SIGNING_SECRET_BK
zin key:bulletproof

# Limit rotation history to 3 entries
zin key:bulletproof --max-backups 3
```

The middleware automatically verifies against all backup secrets during the overlap window.

```bash
# .env (after rotation)
BULLETPROOF_SIGNING_SECRET=base64:<new-key>
BULLETPROOF_SIGNING_SECRET_BK=["base64:<old-key>", "base64:<older-key>"]
```

---

## Frontend Usage

### Install the signer package

```bash
npm i @zintrust/signer
```

`@zintrust/signer` is a zero-dependency WebCrypto package that works in browsers, Node 20+, and Cloudflare Workers.

### Login

```ts
// lib/auth.ts
import { SignedRequest } from '@zintrust/signer';

interface LoginResult {
  jwt: string;
  deviceId: string;
  deviceSecret: string;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error('Login failed');
  }

  const data = (await res.json()) as LoginResult;

  // Store securely — for high-security apps use the platform keychain
  sessionStorage.setItem('jwt', data.jwt);
  sessionStorage.setItem('deviceId', data.deviceId);
  sessionStorage.setItem('deviceSecret', data.deviceSecret);

  return data;
}
```

### Making an authenticated request

```ts
// lib/api.ts
import { SignedRequest } from '@zintrust/signer';

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const jwt = sessionStorage.getItem('jwt')!;
  const deviceId = sessionStorage.getItem('deviceId')!;
  const deviceSecret = sessionStorage.getItem('deviceSecret')!;

  const method = (init.method ?? 'GET').toUpperCase();
  const url = new URL(path, window.location.origin);
  const body = typeof init.body === 'string' ? init.body : '';

  // Generate the five signed-request headers
  const signed = await SignedRequest.createHeaders({
    method,
    url,
    body,
    keyId: deviceId,
    secret: deviceSecret,
  });

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      'x-zt-device-id': deviceId,
      'x-zt-timezone': timezone,
      'User-Agent': navigator.userAgent,
      ...(init.headers as Record<string, string> | undefined),
      ...signed, // x-zt-key-id, x-zt-timestamp, x-zt-nonce, x-zt-body-sha256, x-zt-signature
    },
  });
}
```

Usage:

```ts
const res = await apiFetch('/api/me');
const profile = await res.json();
```

### React hook example

```ts
// hooks/useApi.ts
import { useCallback } from 'react';
import { apiFetch } from '@/lib/api';

export function useApi() {
  const get = useCallback((path: string) => apiFetch(path, { method: 'GET' }), []);

  const post = useCallback(
    (path: string, body: unknown) =>
      apiFetch(path, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    []
  );

  return { get, post };
}
```

---

## Route Handler Access (`req.user`)

Both `JwtAuthMiddleware` and Bulletproof Auth attach the verified JWT payload to the request:

```ts
Router.get('/me', async (req, res) => {
  // req.user is fully typed and verified
  const { sub, email, role, deviceId } = req.user!;
  return res.json({ id: sub, email, role, deviceId });
});
```

`RequestContext.setUserId(req, payload.sub)` is called automatically when `sub` is present.

---

## CLI Tools

### `zin key:bulletproof`

Generates a new `BULLETPROOF_SIGNING_SECRET` and writes it to `.env`. The current secret is automatically moved to the rotation backup array.

```bash
# Generate and save to .env
zin key:bulletproof

# Print only (do not write to .env)
zin key:bulletproof --show

# Keep at most 3 old secrets in the backup array (default: 5)
zin key:bulletproof --max-backups 3
```

Aliases: `zin bulletproof:key`, `zin key:signer`

### `zin jwt:dev`

Mints a development JWT with Bulletproof-compatible claims for manual testing.

```bash
# Basic token with deviceId binding
zin jwt:dev --sub 1 --email dev@example.com --role admin --device-id dev_abc123

# Include timezone and User-Agent hash (covers layers 8 + 9)
zin jwt:dev \
  --sub 1 \
  --email dev@example.com \
  --role admin \
  --device-id dev_abc123 \
  --tz "America/New_York" \
  --ua "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"

# Machine-readable output
zin jwt:dev --json --expires 30m --device-id dev_abc123
```

---

## Operational Guidance

| Concern                     | Recommendation                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Secret storage (client)** | Use native secure storage: iOS Keychain, Android Keystore, Electron `safeStorage`. Avoid `localStorage` for high-risk apps.         |
| **Secret storage (server)** | Store device secrets hashed (HMAC) in your DB/KV, not in plain text.                                                                |
| **Nonce store**             | Back the nonce replay store with Redis or KV for multi-instance / multi-region deployments.                                         |
| **Secret rotation**         | Use `zin key:bulletproof` to rotate; old secrets are kept in `BULLETPROOF_SIGNING_SECRET_BK` for the duration of the replay window. |
| **Device revocation**       | Delete the device record and revoke all associated JWTs on compromise.                                                              |
| **Replay window**           | Default is `±60 s`. Increase if clients have poor clock sync; decrease for stricter security.                                       |
