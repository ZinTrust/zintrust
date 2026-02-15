# @zintrust/cloudflare-d1-proxy

Cloudflare Worker service that exposes a small HTTPS API for executing D1 operations.

This is intended for **server-to-server** use (e.g. a Node app running outside Cloudflare), via ZinTrust’s `d1-remote` adapter.

## Endpoints

All endpoints are `POST` and require signed request headers.

- `/zin/d1/query` → `{ sql, params }` → `{ rows, rowCount }`
- `/zin/d1/queryOne` → `{ sql, params }` → `{ row }`
- `/zin/d1/exec` → `{ sql, params }` → `{ ok: true, meta? }`
- `/zin/d1/statement` → `{ statementId, params }` → `{ rows, rowCount }` or `{ ok: true, meta? }`

## Required bindings

- D1 binding: `DB`

Optional (recommended):

- KV binding: `ZT_NONCES` (nonce replay protection)

## Required secrets / vars

**Secret (required):**

- `D1_REMOTE_SECRET` – shared signing secret used to verify requests.
- `APP_KEY` – fallback shared signing secret if `D1_REMOTE_SECRET` is not set.

Example:

```json
{
  "k1": { "secret": "super-secret-shared-key" }
}
```

**Vars (optional):**

- `ZT_PROXY_SIGNING_WINDOW_MS` (default `60000`)
- `ZT_MAX_BODY_BYTES` (default `131072`)
- `ZT_MAX_SQL_BYTES` (default `32768`)
- `ZT_MAX_PARAMS` (default `256`)

**Secret/var (optional):**

- `ZT_D1_STATEMENTS_JSON` – required if you use `/zin/d1/statement` (registry mode). This is a JSON map of `statementId -> sql`.

## Deploy

From this package directory:

```bash
wrangler deploy
```

Set secrets:

```bash
wrangler secret put D1_REMOTE_SECRET
# optional
wrangler secret put ZT_D1_STATEMENTS_JSON
```

## Use from ZinTrust (Node app)

Configure your app:

- `DB_CONNECTION=d1-remote`
- `D1_REMOTE_URL=https://<your-worker-host>`
- `D1_REMOTE_KEY_ID=k1`
- `D1_REMOTE_SECRET=super-secret-shared-key`
- `D1_REMOTE_MODE=registry` or `sql`

Then use `Database` / QueryBuilder as normal.

## License

This package and its dependencies are MIT licensed, permitting free commercial use.
