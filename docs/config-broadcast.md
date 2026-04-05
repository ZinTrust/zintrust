# Broadcast Configuration

Broadcasting is configured via the framework-level `broadcastConfig` object. It is responsible for:

- Selecting a default broadcast driver (from environment variables)
- Exposing built-in driver config objects (in-memory, Pusher, Redis, Redis HTTPS)
- Resolving named broadcasters (including the reserved alias `default`)

**Source:** `src/config/broadcast.ts`

## Public API

```ts
import { Broadcast, broadcastConfig } from '@zintrust/core';

// Resolve the active config (based on env + defaults)
const defaultCfg = broadcastConfig.getDriverConfig();

// Framework-owned publish abstraction (recommended)
await Broadcast.publish({ channel: 'channel', event: 'event', data: { ok: true } });

// Send using a specific named broadcaster
await Broadcast.broadcaster('redis').publish({
  channel: 'channel',
  event: 'event',
  data: { ok: true },
});
```

## Environment Variables

### Driver selection

The default broadcaster is chosen from (in order):

1. `BROADCAST_CONNECTION`
2. `BROADCAST_DRIVER`
3. fallback to `inmemory`

Selection is normalized to lowercase and trimmed.

Important behavior:

- If you set `BROADCAST_CONNECTION`/`BROADCAST_DRIVER` to a **non-empty** value that is not configured, `broadcastConfig.default` throws a configuration error.
- If the env value is empty/whitespace, it falls back to `inmemory` (or the first configured driver).

### Driver-specific variables

| Driver       | Variables                                                                                                                                              | Notes                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `inmemory`   | (none)                                                                                                                                                 | Best for local/dev only; does not broadcast across processes. |
| `pusher`     | `PUSHER_APP_ID`, `PUSHER_APP_KEY`, `PUSHER_APP_SECRET`, `PUSHER_APP_CLUSTER`, `PUSHER_USE_TLS`                                                         | Missing required values cause runtime errors when sending.    |
| `redis`      | `BROADCAST_REDIS_HOST` (fallback `REDIS_HOST`), `BROADCAST_REDIS_PORT` (fallback `REDIS_PORT`), `BROADCAST_REDIS_PASSWORD` (fallback `REDIS_PASSWORD`) | Uses Redis pub/sub semantics in the driver.                   |
| `redishttps` | `REDIS_HTTPS_ENDPOINT`, `REDIS_HTTPS_TOKEN`                                                                                                            | Intended for HTTPS-backed Redis proxies.                      |

Shared:

- `BROADCAST_CHANNEL_PREFIX` (default: `broadcast:`) prefixes channel names for Redis-based drivers.

## Driver Resolution Semantics

### `broadcastConfig.getDriverName()`

Returns the normalized name of the default broadcaster.

### `broadcastConfig.getDriverConfig(name?)`

Resolves a config object for the default or a named broadcaster.

- `name` is optional. If omitted, it resolves the default broadcaster.
- `name === 'default'` is a reserved alias and resolves to the configured default.
- If you explicitly select a name and it is not configured, it throws a `ConfigError`.
- If selection is _not_ explicit (no `name` provided), it falls back to `inmemory` (or the first configured driver) when needed.

## Named Broadcasters and Runtime Registration

ZinTrust supports a registry for named broadcasters:

- `registerBroadcastersFromRuntimeConfig(config)` registers every `config.drivers[name]` under `name`.
- It also registers `default` as an alias of the configured default name.

The `Broadcast` helper attempts to use this registry lazily. If nothing is registered yet, it tries to register from `broadcastConfig` automatically; if that fails, it falls back to `broadcastConfig.getDriverConfig(...)`.

## Using Broadcast Correctly

The `Broadcast` helper exposes:

- `Broadcast.publish({ channel|channels, event|name, data, delivery?, broadcaster? })` – framework-owned publish API
- `Broadcast.publishLater(input, { queueName?, timestamp? })` – enqueue a publish job
- `Broadcast.queue('name').publishLater(input)` – pick a queue name
- `Broadcast.broadcaster('name').publish(input)` – force a named broadcaster
- `Broadcast.send(...)`, `Broadcast.broadcastNow(...)`, and `Broadcast.BroadcastLater(...)` – legacy migration aliases

If sockets are enabled, `Broadcast.publish({ delivery: 'auto' })` prefers the framework-owned socket runtime and its reserved `POST /apps/:appId/events` surface automatically. Application code does not need to build custom publish headers or route bridges for the normal publish path.

If you need to expose runtime endpoints for external tools, see the optional route template in `routes/broadcast.ts`.

## Customizing Drivers in an App

In a scaffolded app, you typically override drivers by creating a local config module that composes the core config (see templates in `src/templates/project/basic/config/broadcast.ts.tpl`). For example, you can add a custom named broadcaster that points at a built-in driver config.
