# @zintrust/signer

Zero-dependency WebCrypto library for signing and verifying HTTP requests using HMAC-SHA256. Works in browsers, Node.js 20+, and Cloudflare Workers — any runtime with `globalThis.crypto.subtle`.

Docs: https://zintrust.com/package-signer

Used by the [ZinTrust](https://github.com/ZinTrust/zintrust) Bulletproof Auth middleware to implement **proof-of-possession request signing**: a stolen JWT alone is not enough to access protected endpoints.

---

## Install

```bash
npm i @zintrust/signer
```

---

## How it works

Every request carries five headers that bind it to a specific key, timestamp, nonce, and body:

| Header             | Description                                       |
| ------------------ | ------------------------------------------------- |
| `x-zt-key-id`      | Identifies the signing key (e.g. a device ID)     |
| `x-zt-timestamp`   | Unix timestamp in milliseconds at signing time    |
| `x-zt-nonce`       | Random UUID — consumed exactly once (anti-replay) |
| `x-zt-body-sha256` | SHA-256 hex of the raw request body               |
| `x-zt-signature`   | HMAC-SHA256 of the canonical request string       |

The **canonical string** format (joined with `\n`):

```
METHOD
/path/name
?query=string
timestampMs
nonce
bodySha256Hex
```

---

## Quick start

### Sign a request (client side)

```ts
import { SignedRequest } from '@zintrust/signer';

const url = new URL('/api/orders', 'https://api.example.com');
const method = 'POST';
const body = JSON.stringify({ item: 'widget', qty: 3 });

const signed = await SignedRequest.createHeaders({
  method,
  url,
  body,
  keyId: 'device_abc123',
  secret: 'base64:your-32-byte-secret-here',
});

await fetch(url, {
  method,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${jwt}`,
    ...signed, // spreads all five x-zt-* headers
  },
  body,
});
```

### Verify a request (server side)

```ts
import { SignedRequest } from '@zintrust/signer';

const result = await SignedRequest.verify({
  method: req.method,
  url: req.url,
  body: await req.text(),
  headers: req.headers,
  getSecretForKeyId: async (keyId) => {
    // Look up your DB / KV store
    const device = await db.devices.findByKeyId(keyId);
    return device?.signingSecret;
  },
  // Optional: reject replayed nonces
  verifyNonce: async (keyId, nonce, ttlMs) => {
    return await nonceStore.consumeOnce(keyId, nonce, ttlMs);
  },
});

if (!result.ok) {
  // result.code is one of the failure codes below
  return new Response('Unauthorized', { status: 401 });
}

// result.keyId, result.timestampMs, result.nonce are available
```

---

## API Reference

### `SignedRequest.createHeaders(params)`

Generates the five signed-request headers for a given request.

```ts
type SignedRequestCreateHeadersParams = {
  method: string; // HTTP method — e.g. 'GET', 'POST'
  url: string | URL; // Full URL including path and query
  body?: string | Uint8Array | null; // Raw request body (default: empty string)
  keyId: string; // Key identifier (sent in x-zt-key-id)
  secret: string; // HMAC signing secret
  timestampMs?: number; // Override timestamp (default: Date.now())
  nonce?: string; // Override nonce (default: crypto.randomUUID())
};
```

Returns: `Promise<SignedRequestHeaders>`

```ts
type SignedRequestHeaders = {
  'x-zt-key-id': string;
  'x-zt-timestamp': string;
  'x-zt-nonce': string;
  'x-zt-body-sha256': string;
  'x-zt-signature': string;
};
```

---

### `SignedRequest.verify(params)`

Verifies signed-request headers on an incoming request.

```ts
type SignedRequestVerifyParams = {
  method: string;
  url: string | URL;
  body?: string | Uint8Array | null;
  headers: Headers | Record<string, string | undefined>;
  getSecretForKeyId: (keyId: string) => string | undefined | Promise<string | undefined>;
  nowMs?: number; // Override current time for testing (default: Date.now())
  windowMs?: number; // Replay window in ms (default: 60_000 — 60 seconds)
  verifyNonce?: (keyId: string, nonce: string, ttlMs: number) => Promise<boolean>;
};
```

Returns: `Promise<SignedRequestVerifyResult>`

```ts
type SignedRequestVerifyResult =
  // Success
  | { ok: true; keyId: string; timestampMs: number; nonce: string }
  // Failure
  | {
      ok: false;
      code:
        | 'MISSING_HEADER' // One or more x-zt-* headers absent
        | 'INVALID_TIMESTAMP' // x-zt-timestamp is not a valid integer
        | 'EXPIRED' // Request timestamp outside the allowed window
        | 'INVALID_BODY_SHA' // x-zt-body-sha256 does not match computed hash
        | 'INVALID_SIGNATURE' // HMAC signature mismatch
        | 'UNKNOWN_KEY' // getSecretForKeyId returned undefined or empty
        | 'REPLAYED'; // verifyNonce hook returned false
      message: string;
    };
```

---

### `SignedRequest.sha256Hex(data)`

Utility: computes the SHA-256 hex digest of a string or `Uint8Array`.

```ts
const hash = await SignedRequest.sha256Hex('hello world');
// => 'b94d27b9934d3e08...'
```

---

### `SignedRequest.canonicalString(params)`

Utility: builds the canonical string that is signed/verified. Useful for debugging.

```ts
const canonical = await SignedRequest.canonicalString({
  method: 'POST',
  url: new URL('/api/orders?page=1', 'https://api.example.com'),
  timestampMs: 1708000000000,
  nonce: 'abc-123',
  bodySha256Hex: 'e3b0c44298fc1c14...',
});

// => "POST\n/api/orders\n?page=1\n1708000000000\nabc-123\ne3b0c44298fc1c14..."
```

---

## Browser / React example

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

  if (!res.ok) throw new Error('Login failed');

  const data = (await res.json()) as LoginResult;
  sessionStorage.setItem('jwt', data.jwt);
  sessionStorage.setItem('deviceId', data.deviceId);
  sessionStorage.setItem('deviceSecret', data.deviceSecret);
  return data;
}

// lib/api.ts
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const jwt = sessionStorage.getItem('jwt')!;
  const deviceId = sessionStorage.getItem('deviceId')!;
  const deviceSecret = sessionStorage.getItem('deviceSecret')!;

  const method = (init.method ?? 'GET').toUpperCase();
  const url = new URL(path, window.location.origin);
  const body = typeof init.body === 'string' ? init.body : '';

  const signed = await SignedRequest.createHeaders({
    method,
    url,
    body,
    keyId: deviceId,
    secret: deviceSecret,
  });

  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      'x-zt-device-id': deviceId,
      'x-zt-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(init.headers as Record<string, string> | undefined),
      ...signed,
    },
  });
}
```

---

## Vue 3 example

```ts
// composables/useAuth.ts
import { ref } from 'vue';
import { SignedRequest } from '@zintrust/signer';

interface LoginResult {
  jwt: string;
  deviceId: string;
  deviceSecret: string;
}

const jwt = ref<string | null>(sessionStorage.getItem('jwt'));
const deviceId = ref<string | null>(sessionStorage.getItem('deviceId'));
const deviceSecret = ref<string | null>(sessionStorage.getItem('deviceSecret'));

export function useAuth() {
  const isLoggedIn = computed(() => !!jwt.value);

  async function login(email: string, password: string): Promise<void> {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) throw new Error('Login failed');

    const data = (await res.json()) as LoginResult;

    jwt.value = data.jwt;
    deviceId.value = data.deviceId;
    deviceSecret.value = data.deviceSecret;

    sessionStorage.setItem('jwt', data.jwt);
    sessionStorage.setItem('deviceId', data.deviceId);
    sessionStorage.setItem('deviceSecret', data.deviceSecret);
  }

  async function logout(): Promise<void> {
    // Call logout endpoint using a signed request
    await apiFetch('/auth/logout', { method: 'POST' });

    jwt.value = null;
    deviceId.value = null;
    deviceSecret.value = null;

    sessionStorage.removeItem('jwt');
    sessionStorage.removeItem('deviceId');
    sessionStorage.removeItem('deviceSecret');
  }

  return { isLoggedIn, login, logout };
}
```

```ts
// composables/useApi.ts
import { SignedRequest } from '@zintrust/signer';

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const jwt = sessionStorage.getItem('jwt')!;
  const deviceId = sessionStorage.getItem('deviceId')!;
  const deviceSecret = sessionStorage.getItem('deviceSecret')!;

  const method = (init.method ?? 'GET').toUpperCase();
  const url = new URL(path, window.location.origin);
  const body = typeof init.body === 'string' ? init.body : '';

  const signed = await SignedRequest.createHeaders({
    method,
    url,
    body,
    keyId: deviceId,
    secret: deviceSecret,
  });

  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      'x-zt-device-id': deviceId,
      'x-zt-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(init.headers as Record<string, string> | undefined),
      ...signed,
    },
  });
}
```

```vue
<!-- components/LoginForm.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { useRouter } from 'vue-router';

const { login } = useAuth();
const router = useRouter();

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function handleSubmit() {
  error.value = '';
  loading.value = true;
  try {
    await login(email.value, password.value);
    await router.push('/dashboard');
  } catch {
    error.value = 'Invalid email or password.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <input v-model="email" type="email" placeholder="Email" required />
    <input v-model="password" type="password" placeholder="Password" required />
    <p v-if="error" class="error">{{ error }}</p>
    <button type="submit" :disabled="loading">
      {{ loading ? 'Signing in…' : 'Sign in' }}
    </button>
  </form>
</template>
```

```vue
<!-- components/ProfileCard.vue — example of a signed API call -->
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { apiFetch } from '@/composables/useApi';

interface Profile {
  id: string;
  email: string;
  role: string;
}

const profile = ref<Profile | null>(null);
const error = ref('');

onMounted(async () => {
  const res = await apiFetch('/api/me');
  if (res.ok) {
    profile.value = (await res.json()) as Profile;
  } else {
    error.value = 'Failed to load profile.';
  }
});
</script>

<template>
  <div v-if="profile">
    <p>{{ profile.email }} ({{ profile.role }})</p>
  </div>
  <p v-else-if="error">{{ error }}</p>
  <p v-else>Loading…</p>
</template>
```

---

## Node.js / server-to-server example

```ts
import { SignedRequest } from '@zintrust/signer';

const secret = process.env.API_SIGNING_SECRET!;
const keyId = process.env.API_KEY_ID!;
const jwt = process.env.SERVICE_JWT!;

async function signedFetch(url: string, init: RequestInit = {}) {
  const method = (init.method ?? 'GET').toUpperCase();
  const body = typeof init.body === 'string' ? init.body : '';

  const signed = await SignedRequest.createHeaders({
    method,
    url: new URL(url),
    body,
    keyId,
    secret,
  });

  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      ...signed,
    },
  });
}

const res = await signedFetch('https://api.example.com/internal/sync', {
  method: 'POST',
  body: JSON.stringify({ action: 'sync' }),
});
```

---

## Cloudflare Workers example

```ts
import { SignedRequest } from '@zintrust/signer';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const result = await SignedRequest.verify({
      method: request.method,
      url: request.url,
      body: await request.clone().text(),
      headers: request.headers,
      getSecretForKeyId: async (keyId) => {
        return (await env.KV.get(`signing_secret:${keyId}`)) ?? undefined;
      },
      windowMs: 30_000,
    });

    if (!result.ok) {
      return Response.json({ error: result.code }, { status: 401 });
    }

    return Response.json({ keyId: result.keyId });
  },
};
```

---

## Nonce replay protection

The `verifyNonce` hook lets you plug in any store. Example using an in-memory `Map` (single instance only — use Redis/KV for multi-instance):

```ts
const seenNonces = new Map<string, number>();

const result = await SignedRequest.verify({
  // ...
  verifyNonce: async (keyId, nonce, ttlMs) => {
    const key = `${keyId}:${nonce}`;
    if (seenNonces.has(key)) return false; // replayed
    seenNonces.set(key, Date.now() + ttlMs);
    return true;
  },
});
```

For multi-instance deployments, use a Redis/KV SET NX with TTL:

```ts
verifyNonce: async (keyId, nonce, ttlMs) => {
  const key = `nonce:${keyId}:${nonce}`;
  const set = await redis.set(key, '1', 'PX', ttlMs, 'NX');
  return set === 'OK';
},
```

---

## Security notes

- **Secrets** should be at least 32 random bytes. Generate one with:
  ```bash
  node -e "console.log('base64:' + require('crypto').randomBytes(32).toString('base64'))"
  # or with the ZinTrust CLI:
  zin key:bulletproof
  ```
- **Replay window** defaults to 60 seconds. Reduce for stricter security; increase if clients have clock skew issues.
- **Nonce replay protection** requires a shared store (Redis/KV) when running multiple instances.
- All HMAC comparisons use a timing-safe equality check to prevent timing attacks.

---

## Runtime requirements

| Runtime            | Minimum version                       | Notes                               |
| ------------------ | ------------------------------------- | ----------------------------------- |
| Node.js            | 20.0.0                                | `globalThis.crypto.subtle` built-in |
| Bun                | Any                                   | WebCrypto built-in                  |
| Cloudflare Workers | Any                                   | WebCrypto built-in                  |
| Browsers           | Chrome 37+ / Firefox 34+ / Safari 11+ | WebCrypto available since 2014      |
| Deno               | Any                                   | WebCrypto built-in                  |

---

## License

MIT — part of the [ZinTrust](https://github.com/ZinTrust/zintrust) framework.
