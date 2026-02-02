# Cloudflare Workers Limitations (ZinTrust)

This document captures Cloudflare Workers constraints relevant to ZinTrust adapters.

## Network limitations

- **No private IPs**: 10.x, 172.16–31.x, 192.168.x are blocked.
- **Cloudflare IPs blocked**: cannot connect back to Cloudflare-owned IPs.
- **Port 25 blocked**: use 587 (STARTTLS) or 465 (TLS).
- **Socket limits**: concurrent sockets per request are limited.

## Runtime limitations

- **No filesystem**: use R2 or KV.
- **No process signals**: use Durable Objects for lifecycle events (e.g., `WorkerShutdownDurableObject`).
- **Global scope restrictions**: sockets must be created in request handlers.

## Operational guidance

- Use **Hyperdrive** or **Durable Objects** for pooling if needed.
- Use public endpoints or Cloudflare Tunnel for database access.
