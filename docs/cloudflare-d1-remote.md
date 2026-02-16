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

If your binding name is not `DB` (for example `zintrust_db`), set this env var in the app runtime:

```env
D1_BINDING=zintrust_db
```

This lets ZinTrust resolve the correct D1 binding name from Worker env/global bindings.

### 2) Configure auth keys (Worker secrets)

Configure a single shared signing secret for the Worker.

- Set `D1_REMOTE_SECRET` as a Worker secret (recommended), or
- Set `APP_KEY` (fallback).

ZinTrust will accept any `x-zt-key-id` as long as the signature matches this shared secret.

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

# Note: `zin migrate` automatically uses SQL mode for migrations when `DB_CONNECTION=d1-remote`.
# You can keep `D1_REMOTE_MODE=registry` for normal app runtime queries.
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

## Threat model (what this protects)

Registry mode primarily reduces risk when there is a **trust boundary** (your app calls the D1 proxy over HTTPS).

In registry mode, your app sends only `{ statementId, params }` and the proxy looks up SQL from its allowlist (`ZT_D1_STATEMENTS_JSON`). This prevents **network-level** SQL injection into the proxy (the proxy never receives SQL text to be injected).

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

---

## Notes & limitations

- D1 remote is designed for server-to-server use.
- Network latency applies (your app is calling a remote Worker).
- For performance, prefer batched operations when appropriate.
