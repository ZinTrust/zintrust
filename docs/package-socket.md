---
title: Socket
description: Unified websocket runtime for ZinTrust across Node.js and Cloudflare Workers
---

# Socket

The `@zintrust/socket` package is the official ZinTrust websocket runtime for both `zin s` and `zin s --wg`. It exposes a Pusher-compatible upgrade/auth/publish surface while letting core own the transport plumbing for Node and Cloudflare Worker deployments.

## What it provides

- Automatic runtime registration through `@zintrust/socket/register`
- Websocket upgrades at `GET {SOCKET_PATH}/:appKey`
- Auth endpoint at `POST /broadcasting/auth`
- Publish endpoint at `POST /apps/:appId/events`
- Node in-memory fan-out and Cloudflare Durable Object-backed fan-out

## Install

```bash
npm install @zintrust/socket
```

## Minimum env

```env
SOCKET_ENABLED=true
SOCKET_PATH=/app
PUSHER_APP_ID=local-app
PUSHER_APP_KEY=local-key
PUSHER_APP_SECRET=local-secret
```

## Cloudflare note

Cloudflare Worker deployments also need the `ZT_SOCKET_HUB` Durable Object binding and the `ZintrustSocketHub` export from the worker entrypoint.

## More detail

For the full runtime contract, env aliases, auth/publish examples, and Durable Object setup, see `https://www.npmjs.com/package/@zintrust/socket?activeTab=readme` and the broadcasting docs.
