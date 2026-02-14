# Cloudflare Workers Limitations (ZinTrust)

This document captures Cloudflare Workers constraints relevant to ZinTrust adapters.

## Network limitations

- **No private IPs**: 10.x, 172.16–31.x, 192.168.x are blocked.
- **Cloudflare IPs blocked**: cannot connect back to Cloudflare-owned IPs.
- **Port 25 blocked**: use 587 (STARTTLS) or 465 (TLS).
- **Socket limits**: concurrent sockets per request are limited.

## Runtime limitations

- **No filesystem**: use R2 or KV.
- **No process signals**: perform lifecycle coordination via app-level control endpoints or external orchestrators.
- **Global scope restrictions**: sockets must be created in request handlers.

## BullMQ / Queue Workers

BullMQ Workers (job consumers) **cannot run** in Cloudflare Workers runtime due to:

- Required persistent TCP connections
- Background event loops
- Global scope socket requirements

**Solution:** Run BullMQ Workers in containers (Producer-Consumer Split). Cloudflare Workers can still enqueue jobs via `Queue.add()`.

## Operational guidance

- Use **Hyperdrive** or an external proxy for pooling if needed.
- Use public endpoints or Cloudflare Tunnel for database access.
