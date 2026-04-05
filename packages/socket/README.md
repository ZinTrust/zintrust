# @zintrust/socket

Unified websocket runtime for ZinTrust across Node.js and Cloudflare Workers.

This package gives you a Pusher-compatible socket surface without requiring you to hand-wire websocket upgrade routes into your app. On Node.js it handles raw `upgrade` requests directly in the core server. On Cloudflare Workers it uses a Durable Object hub so connected clients and publish requests share one coordination point instead of isolate-local memory.

## What You Get

- Automatic socket runtime registration through `@zintrust/socket/register`
- Websocket upgrade endpoint at `GET {SOCKET_PATH}/:appKey`
- Auth endpoint at `POST /broadcasting/auth`
- Publish endpoint at `POST /apps/:appId/events`
- Pusher-style events such as `pusher:connection_established`, `pusher:pong`, and `pusher_internal:subscription_succeeded`
- Private and presence-channel auth signing via HMAC SHA-256
- Node.js in-memory fan-out
- Cloudflare Durable Object-backed fan-out via `ZT_SOCKET_HUB`

## Install

```bash
npm i @zintrust/socket
```

If you are using official ZinTrust package auto-imports, installing the package is enough for runtime registration because core will attempt to import `@zintrust/socket/register` automatically.

If you prefer an explicit local entrypoint in an app repository, you can still add one:

```ts
// src/socket-runtime.ts
import '@zintrust/socket/register';
```

## Runtime Model

### Node.js

- ZinTrust core listens for HTTP `upgrade` events.
- `@zintrust/socket` validates the app key and completes the websocket handshake.
- Connected peers and channel memberships are stored in process memory.

### Cloudflare Workers

- ZinTrust core intercepts websocket upgrade requests before the normal HTTP adapter path.
- The request is forwarded to the `ZT_SOCKET_HUB` Durable Object.
- The Durable Object owns peer membership and publish fan-out for that app key.
- Normal HTTP publish requests to `/apps/:appId/events` also forward into the same Durable Object, so websocket traffic and server-side publishes stay coordinated.

## Minimum Env Setup

```env
SOCKET_ENABLED=true
SOCKET_PATH=/app
PUSHER_APP_ID=local-app
PUSHER_APP_KEY=local-key
PUSHER_APP_SECRET=local-secret
```

With that configuration your upgrade endpoint becomes:

```text
/app/local-key
```

## Supported Environment Variables

The package supports multiple env aliases so you can keep existing Pusher/broadcast style naming.

### Core toggles

- `SOCKET_ENABLED`
  Enables the unified socket runtime.
- `SOCKET_TRANSPORT`
  Allowed values: `auto`, `node`, `cloudflare`.
  `auto` is the default.
- `SOCKET_PATH`
  Websocket upgrade base path. Default: `/app`.

### App identity

- `PUSHER_APP_ID`
  Primary app identifier used by `/apps/:appId/events`.
- `BROADCAST_APP_ID`
  Fallback alias for app id.

### Public auth key

- `PUSHER_APP_KEY`
  Primary public websocket/auth key.
- `BROADCAST_AUTH_KEY`
  Fallback alias for the public auth key.
- `BROADCAST_APP_KEY`
  Additional fallback alias for the public auth key.

### Publish/auth secret

- `PUSHER_APP_SECRET`
  Primary signing secret for private/presence auth and publish authorization.
- `BROADCAST_SECRET`
  Fallback alias for the signing secret.
- `BROADCAST_APP_SECRET`
  Additional fallback alias for the signing secret.

### Connection timing

- `BROADCAST_ACTIVITY_TIMEOUT`
  Activity timeout advertised to clients. Default: `120` seconds.

### Cloudflare binding

- `ZT_SOCKET_HUB`
  Durable Object binding required for Cloudflare websocket coordination.

## Cloudflare Worker Configuration

Cloudflare support requires exporting the Durable Object class from the worker module and binding it in Wrangler.

If your worker entry is `@zintrust/core/start` or ZinTrust's stock `src/functions/cloudflare.ts`, the `ZintrustSocketHub` export is already available.

Add a binding like this to your Wrangler config:

```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "ZT_SOCKET_HUB",
        "class_name": "ZintrustSocketHub",
      },
    ],
  },
  "migrations": [
    {
      "tag": "v1-zintrust-socket-hub",
      "new_sqlite_classes": ["ZintrustSocketHub"],
    },
  ],
}
```

## Example: Laravel Echo / Pusher-Style Client

```ts
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

const echo = new Echo({
  broadcaster: 'pusher',
  client: new Pusher('local-key', {
    wsHost: '127.0.0.1',
    wsPort: 7777,
    wssPort: 443,
    forceTLS: false,
    enabledTransports: ['ws', 'wss'],
    wsPath: '/app',
    authEndpoint: '/broadcasting/auth',
  }),
});

echo.private('orders').listen('.updated', (payload: unknown) => {
  console.log(payload);
});
```

For Cloudflare, keep the same client-side contract and only change the host/TLS settings for your deployed Worker domain.

## Example: Publish From Server Code

The package exposes an HTTP-compatible publish endpoint:

```http
POST /apps/local-app/events
Authorization: Bearer local-secret
Content-Type: application/json

{
  "event": "orders.updated",
  "channel": "private-orders",
  "data": {
    "orderId": 42,
    "status": "paid"
  }
}
```

Accepted publish authorization headers:

- `Authorization: Bearer <secret>`
- `x-zintrust-socket-secret: <secret>`

You can also provide `channels` instead of `channel`, and `name` instead of `event`.

## Example: Core-Owned Policy Hooks

Projects can keep the transport routes owned by core while still supplying business rules through `config/broadcast.ts`.

```ts
export default {
  default: 'inmemory',
  socket: {
    authMiddleware: ['auth', 'jwt'],
    async authorize(_request, context) {
      if (context.channelName.startsWith('private-')) {
        return {
          authorized: context.user !== null && context.user !== undefined,
        };
      }

      if (context.channelName.startsWith('public-')) {
        return {
          authorized: true,
        };
      }

      return {
        authorized: false,
      };
    },
    async publish(_request, context) {
      if (context.event.startsWith('admin.')) {
        return {
          allowed: context.user !== null && context.user !== undefined,
          message: 'Admin publish requires an authenticated user.',
        };
      }

      return {
        allowed: true,
      };
    },
  },
};
```

The publish hook may also rewrite the outgoing event, channels, data, or `socketId` before the framework fans the event out.

## Example: Auth Request

```http
POST /broadcasting/auth
Content-Type: application/json

{
  "socket_id": "123.456",
  "channel_name": "private-orders",
  "channel_data": "{\"user_id\":\"7\"}"
}
```

Response shape:

```json
{
  "auth": "local-key:<signature>",
  "channel_data": "{\"user_id\":\"7\"}"
}
```

## Endpoints Summary

- `GET {SOCKET_PATH}/:appKey`
  Returns `426 Upgrade Required` over HTTP and upgrades over websocket.
- `POST /broadcasting/auth`
  Signs private/presence subscriptions.
- `POST /apps/:appId/events`
  Publishes server-originated events to one or many channels.

## Behavior Notes

- Node.js fan-out is process-local. If you run multiple Node instances, use your own cross-node broadcast layer in front of this package.
- Cloudflare fan-out is app-scoped through one Durable Object instance per socket app key.
- If `SOCKET_TRANSPORT=node` is set, Cloudflare Durable Object forwarding is disabled intentionally.
- If `SOCKET_ENABLED=true` on Cloudflare but `ZT_SOCKET_HUB` is missing, upgrade and publish requests return a `503` response explaining the missing binding.

## Good Defaults For Local Development

```env
SOCKET_ENABLED=true
SOCKET_TRANSPORT=auto
SOCKET_PATH=/app
PUSHER_APP_ID=local-app
PUSHER_APP_KEY=local-key
PUSHER_APP_SECRET=local-secret
BROADCAST_ACTIVITY_TIMEOUT=45
```

## Troubleshooting

- `404 Socket app key not found`:
  Your client is connecting with a key that does not match the resolved app key env.
- `403 Socket publish secret is invalid`:
  The publish request secret does not match the resolved signing secret.
- `503 socket_durable_object_missing`:
  Cloudflare transport is active but Wrangler is missing the `ZT_SOCKET_HUB` binding.
- `426 Upgrade Required` over HTTP:
  You hit the websocket route with a normal HTTP request, which is expected for health/debug checks.
