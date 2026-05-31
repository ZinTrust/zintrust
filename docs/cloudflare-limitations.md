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

## Redis, BullMQ, and Queue Workers

Cloudflare Workers cannot host a long-running BullMQ consumer because BullMQ workers require:

- Required persistent TCP connections
- Background event loops
- Global scope socket requirements

For producers, queue dashboards, cache operations, and queue control APIs, use Redis RPC instead of a direct Redis/BullMQ connection:

```bash
npm install @zintrust/redis-rpc
USE_REDIS_PROXY=true
REDIS_RPC_URL=https://queues.example.com
```

Start the backend-owned RPC process with:

```bash
zin redis-rpc
# or
zin s redis-rpc
```

With both `USE_REDIS_PROXY=true` and `REDIS_RPC_URL` set, `@zintrust/queue-redis`, `@zintrust/queue-monitor`, and core Redis transport use Redis RPC. The older Redis HTTP proxy remains available for simple command forwarding, but Redis RPC is the preferred path for queue-aware workloads.

Application job processors still need a backend runtime that can execute your code. That backend can be a Node.js process running `zin redis-rpc`; it does not have to be a Cloudflare Container, but it must run somewhere that can keep Redis/BullMQ connections open.

## Operational guidance

- Use **Hyperdrive** or an external proxy for pooling if needed.
- Use public endpoints or Cloudflare Tunnel for database access.
