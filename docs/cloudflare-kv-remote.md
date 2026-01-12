# Cloudflare KV Remote (Proxy Service)

Cloudflare KV is a Workers binding (not a Redis-like server you can connect to directly). If your app runs **outside Cloudflare** but you still want KV semantics (low-latency key-value), ZinTrust supports a secure pattern:

- Deploy a Cloudflare Worker service **`zintrust-kv`** in your Cloudflare account.
- Configure your app to use the **remote KV cache driver** (HTTP), which calls the Worker over HTTPS.

---

## How it works

**Your app (anywhere)** → HTTPS → **`zintrust-kv` Worker** → **KV binding(s)**

The Worker exposes a small API under `/zin/...` (for example `/zin/kv/get`) and enforces:

- Request signing (HMAC)
- Replay protection (nonce + timestamp)
- Scoped permissions (kv.get/kv.put/kv.delete/kv.list)
- Namespace + key-prefix restrictions
- Rate limiting and payload limits

---

## Deploy `zintrust-kv`

### 1) Configure KV bindings

In your Worker’s `wrangler.jsonc`:

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "CACHE",
      "id": "your_kv_id",
    },
  ],
}
```

Default binding name expected by ZinTrust is `CACHE`.

### 2) Configure auth keys (Worker secrets)

Store signing credentials in Worker secrets (example pattern `ZT_KEYS_JSON`) and scope them appropriately:

```json
{
  "prod-app": {
    "secret": "base64-or-hex-secret",
    "scopes": ["kv.get", "kv.put", "kv.delete", "kv.list"],
    "kv": {
      "namespaces": ["CACHE"],
      "prefixes": ["app1:"]
    }
  }
}
```

### 3) Deploy

Deploy with Wrangler as you normally deploy Workers.

---

## Configure your ZinTrust app (outside Cloudflare)

In your app `.env`:

```env
# Use the HTTP remote cache driver
CACHE_DRIVER=kv-remote

# Where your Worker is deployed
KV_REMOTE_URL=https://<your-worker-domain>

# Signing credentials used by the app
KV_REMOTE_KEY_ID=prod-app
KV_REMOTE_SECRET=<same-secret-as-worker>

# Optional default namespace
KV_REMOTE_NAMESPACE=CACHE
```

---

## API endpoints (service-side)

The remote driver calls these endpoints:

- `POST /zin/kv/get`
- `POST /zin/kv/put`
- `POST /zin/kv/delete`
- `POST /zin/kv/list`

You should not call these directly from browsers.

---

## Notes & limitations

- KV remote is designed for cache/key-value patterns.
- KV is not a queue.
- Network latency applies (your app is calling a remote Worker).
