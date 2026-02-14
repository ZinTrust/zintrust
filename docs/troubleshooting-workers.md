# Troubleshooting ZinTrust on Cloudflare Workers

This guide lists common Cloudflare Workers errors and recommended fixes when running ZinTrust.

## Common Issues

### 1. cloudflare:sockets not available

**Symptoms:**

- `Cannot find module 'cloudflare:sockets'`
- Connection errors on adapter initialization

**Fix:**

- Ensure `compatibility_date >= 2024-01-15`
- Enable `nodejs_compat` in wrangler config
- Set `ENABLE_CLOUDFLARE_SOCKETS=true`

### 2. Sockets created in global scope

**Symptoms:**

- `Disallowed operation called within global scope`

**Fix:**

- Move socket creation into request handlers
- Use lazy initialization per request

### 3. Port 25 blocked (SMTP)

**Symptoms:**

- SMTP connection hangs or fails

**Fix:**

- Use port 587 (STARTTLS) or 465 (TLS)
- Prefer Email Workers or HTTP-based email providers

### 4. Private IP blocked

**Symptoms:**

- `Network unreachable` when using 10.x/192.168.x

**Fix:**

- Expose databases via public IP or tunnel
- Use Cloudflare Tunnel or Hyperdrive

### 5. Socket limit exceeded

**Symptoms:**

- Errors during high concurrency

**Fix:**

- Reduce parallel DB connections
- Prefer proxy/Hyperdrive pooling for high concurrency

### 6. Worker shutdown coordination

**Symptoms:**

- Shutdown signals not propagated across instances
- Background workers continue after shutdown requested

**Fix:**

- Trigger shutdown through the standard app shutdown flow
- Ensure worker consumers run in environments that support process signals
