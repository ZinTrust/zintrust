# @zintrust/cloudflare-kv-proxy

Cloudflare Worker service that exposes a small HTTPS API for KV operations.

This is intended for **server-to-server** use (e.g. a Node app running outside Cloudflare), via Zintrust’s `kv-remote` cache driver.

## Endpoints

All endpoints are `POST` and require signed request headers.

- `/zin/kv/get` → `{ namespace?, key, type? }` → `{ value }`
- `/zin/kv/put` → `{ namespace?, key, value, ttlSeconds? }` → `{ ok: true }`
- `/zin/kv/delete` → `{ namespace?, key }` → `{ ok: true }`
- `/zin/kv/list` → `{ namespace?, prefix?, cursor?, limit? }` → `{ keys, cursor, listComplete }`

## Required bindings

- KV binding: `CACHE`

Optional (recommended):

- KV binding: `ZT_NONCES` (nonce replay protection)

## Required secrets / vars

**Secret (required):**

- `ZT_KEYS_JSON` – JSON map of key ids to secrets.

Example:

```json
{
  "k1": { "secret": "super-secret-shared-key" }
}
```

**Vars (optional):**

- `ZT_PROXY_SIGNING_WINDOW_MS` (default `60000`)
- `ZT_MAX_BODY_BYTES` (default `131072`)
- `ZT_KV_PREFIX` (default empty) – prefix used when storing keys
- `ZT_KV_LIST_LIMIT` (default `100`) – upper bound for list limit

## Deploy

From this package directory:

```bash
wrangler deploy
```

Set secrets:

```bash
wrangler secret put ZT_KEYS_JSON
```

## Use from Zintrust (Node app)

Configure your app:

- `CACHE_DRIVER=kv-remote`
- `KV_REMOTE_URL=https://<your-worker-host>`
- `KV_REMOTE_KEY_ID=k1`
- `KV_REMOTE_SECRET=super-secret-shared-key`
- `KV_REMOTE_NAMESPACE=CACHE` (or empty)

Then use `Cache.get/set/delete` as normal.
