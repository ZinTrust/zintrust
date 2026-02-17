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

If your binding name is not `DB`, set Worker var `D1_BINDING` to your binding name.

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

## Threat model (what this protects)

Registry mode (`/zin/d1/statement` + `ZT_D1_STATEMENTS_JSON`) primarily reduces risk when there is a **trust boundary** (your app calls this Worker proxy over HTTPS).

In registry mode, the caller sends only `{ statementId, params }` and the Worker looks up SQL from the allowlist. This prevents **network-level** SQL injection into the proxy (the proxy never receives SQL text to be injected).

### What registry mode does NOT automatically prevent

- Authorization bugs (e.g. querying another user’s data by changing `id` parameters).
- Dangerous allowlisted statements (wide `UPDATE`/`DELETE`, admin operations).
- Replay/duplicate execution (must be prevented via nonce + timestamp verification).
- DoS / expensive queries (needs rate limiting, timeouts, and query budgets).
- A fully compromised app runtime (RCE) — attackers can steal secrets and abuse whatever is allowed.

### Threat model table

| Attacker scenario (facts)                                               | What can go wrong                                     | What helps most                                                                | What registry mode helps with                                                         | What registry mode does NOT fix                                             |
| ----------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Proxy signing secret leaked (CI logs, env leak, SSRF reading env, etc.) | Attacker can call proxy endpoints as a trusted client | Request signing + nonce/timestamp replay protection + rate limiting            | **Big win**: attacker limited to allowlisted statements (no arbitrary SQL)            | If allowlist includes dangerous statements, attacker can still cause damage |
| App SQL injection bug (string concatenation, unsafe interpolation)      | Arbitrary SQL may run using app’s DB credentials      | Parameterized queries + query builders + linting + tests                       | Limited value for direct DB; can become reliability failure (statementId won’t match) | Does not fix SQLi root cause; attacker may still exfiltrate/modify via app  |
| App runtime compromised (RCE)                                           | Secrets stolen, arbitrary internal calls, data theft  | Least-privilege credentials, network segmentation, secret rotation, monitoring | Some value if proxy creds leak is the only path and allowlist is tight                | If attacker has code exec, they can still abuse allowed reads/writes        |
| Replay / MITM within allowed clock skew                                 | Re-sending signed requests can repeat effects         | Nonce + timestamp verification; short signing window                           | Minor (statements still re-playable)                                                  | Registry does not prevent replay; must be blocked by nonce/time             |
| DoS / resource exhaustion                                               | High CPU/DB load, high egress, timeouts               | Rate limiting, payload limits, query timeouts, concurrency limits              | Minor (allowlisted queries can still be expensive)                                    | Registry doesn’t limit cost by itself                                       |

## License

This package and its dependencies are MIT licensed, permitting free commercial use.
