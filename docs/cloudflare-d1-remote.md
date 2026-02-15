# Cloudflare D1 Remote (Proxy Service)

Cloudflare D1 is a Workers binding (not a database you can connect to over TCP). If your app runs **outside Cloudflare** (Node, container, VM, other cloud) but you still want to use D1, ZinTrust supports a secure pattern:

- Deploy a Cloudflare Worker service **`zintrust-d1`** in your Cloudflare account.
- Configure your app to use the **remote D1 driver** (HTTP), which calls the Worker over HTTPS.

This keeps D1 private (no public DB port) and enables strong service-to-service security.

---

## How it works

**Your app (anywhere)** → HTTPS → **`zintrust-d1` Worker** → **D1 binding (`DB`)**

The Worker exposes a small API under `/zin/...` (for example `/zin/d1/query`) and enforces:

- Request signing (HMAC)
- Replay protection (nonce + timestamp)
- Scoped permissions
- Rate limiting and payload limits

---

## Deploy `zintrust-d1`

### 1) Configure the D1 binding

In your Worker’s `wrangler.jsonc`:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "your_db_name",
      "database_id": "your_database_id",
    },
  ],
}
```

If your binding name is not `DB` (for example `zintrust_db`), set one of these env vars in the app runtime:

```env
D1_BINDING=zintrust_db
# or
D1_DATABASE_BINDING=zintrust_db
# or
DB_BINDING=zintrust_db
```

This lets ZinTrust resolve the correct D1 binding name from Worker env/global bindings.

### 2) Configure auth keys (Worker secrets)

Recommended: create one or more signing credentials for callers.

- Store credentials in Worker secrets (example pattern):
  - `ZT_KEYS_JSON`

Shape (example):

```json
{
  "prod-app": {
    "secret": "base64-or-hex-secret",
    "scopes": ["d1.query", "d1.queryOne", "d1.exec"],
    "mode": "registry"
  }
}
```

### Source location in this repo

- Core proxy entry (re-export): [src/proxy/d1/ZintrustD1Proxy.ts](src/proxy/d1/ZintrustD1Proxy.ts)
- Implementation (package): [packages/cloudflare-d1-proxy/src/index.ts](packages/cloudflare-d1-proxy/src/index.ts)

Notes:

- Keep secrets out of source control.
- Use separate keys per environment (staging/prod).

### 3) Deploy

Deploy with Wrangler as you normally deploy Workers.

---

## Configure your ZinTrust app (outside Cloudflare)

In your app `.env`:

```env
# Use the HTTP remote driver
DB_CONNECTION=d1-remote

# Where your Worker is deployed
D1_REMOTE_URL=https://<your-worker-domain>

# Signing credentials used by the app
D1_REMOTE_KEY_ID=prod-app
D1_REMOTE_SECRET=<same-secret-as-worker>

# Mode selection
# - registry (default, recommended)
# - sql (opt-in)
D1_REMOTE_MODE=registry
```

---

## API endpoints (service-side)

The remote driver calls these endpoints:

- `POST /zin/d1/query`
- `POST /zin/d1/queryOne`
- `POST /zin/d1/exec`
- Optional: `POST /zin/d1/batch`
- Registry mode: `POST /zin/d1/statement`

You should not call these directly from browsers.

---

## Modes: `registry` vs `sql`

### `registry` (default, recommended)

The Worker only executes allowlisted statements by `statementId`. This prevents a compromised caller from running arbitrary SQL.

### `sql` (opt-in)

The Worker executes parameterized SQL sent by the caller. This is faster to onboard and debug, but expands blast radius if a caller is compromised.

---

## Notes & limitations

- D1 remote is designed for server-to-server use.
- Network latency applies (your app is calling a remote Worker).
- For performance, prefer batched operations when appropriate.
