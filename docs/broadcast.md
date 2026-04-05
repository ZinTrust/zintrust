# Broadcasting

ZinTrust core owns server-side broadcast publishing. Application developers should not need to build custom publish helpers, runtime branches, header adapters, or project-local `/broadcast/send` bridges just to emit an event.

## Default Developer Contract

Use the framework API directly:

```ts
import { Broadcast } from '@zintrust/core';

await Broadcast.publish({
  channel: 'private-user.123',
  event: 'profile.updated',
  data: {
    id: 123,
    name: 'Ada',
  },
});
```

For queued delivery, use the matching framework method:

```ts
await Broadcast.publishLater({
  channel: 'private-user.123',
  event: 'profile.updated',
  data: {
    id: 123,
    name: 'Ada',
  },
});
```

That is the supported default path. Do not create an app-local helper such as `sendBroadcast(...)` unless you have an application-specific reason to wrap the payload shape.

## What Core Owns

`Broadcast.publish(...)` is the framework-owned server-side publish abstraction. In `delivery: 'auto'` mode, core decides whether to publish through:

- the active socket runtime when sockets are enabled
- the configured broadcast driver when socket delivery is unavailable

The application does not need to decide between Node, Cloudflare, queue-worker, or socket-runtime publishing paths manually.

## Immediate Publish

### Primary API

```ts
import { Broadcast } from '@zintrust/core';

await Broadcast.publish({
  channel: 'orders.42',
  event: 'order.updated',
  data: {
    id: 42,
    status: 'paid',
  },
});
```

### Multiple Channels

```ts
await Broadcast.publish({
  channels: ['public-orders', 'private-user.42'],
  event: 'order.updated',
  data: {
    id: 42,
    status: 'paid',
  },
});
```

### Delivery Control

`Broadcast.publish(...)` accepts an optional `delivery` mode:

- `auto` (default): prefer the framework-owned socket runtime when available, otherwise fall back to the configured broadcaster
- `socket`: require socket-runtime delivery and fail if that surface is unavailable
- `driver`: skip the socket runtime and send through the configured broadcaster directly

When the socket package is installed and `BASE_URL`, `APP_URL`, or `BROADCAST_INTERNAL_URL` resolves to the local app, core first tries the package-owned `POST /apps/:appId/events` route before falling back to in-process socket delivery or a broadcast driver. Publish results expose this as `transport: 'internal-http'`.

Example:

```ts
await Broadcast.publish({
  channel: 'private-user.7',
  event: 'profile.changed',
  data: { id: 7 },
  delivery: 'socket',
});
```

### Named Broadcasters

If you explicitly want a configured broadcaster instead of `delivery: 'auto'`, use `Broadcast.broadcaster(name)`:

```ts
await Broadcast.broadcaster('redis').publish({
  channel: 'ops.alerts',
  event: 'job.failed',
  data: { id: 'job-1' },
});
```

### Channel Scope

You can keep application code on logical channel names and let core prefix the wire channel:

```ts
await Broadcast.publish({
  channel: 'smart.ZTF-10514',
  channelScope: 'private',
  event: 'smart.data',
  data: { ok: true },
});
```

Supported scopes are `public`, `private`, `presence`, and `persistent`. If the `channel` is already fully qualified, core keeps it as-is and rejects contradictory explicit scopes.

## Queued Publish

Use `Broadcast.publishLater(...)` when you want the framework queue to deliver the event asynchronously:

```ts
await Broadcast.publishLater({
  channel: 'admin.alerts',
  event: 'system.alert',
  data: { severity: 'high' },
});

const futureTime = Date.now() + 5 * 60 * 1000;

await Broadcast.publishLater(
  {
    channel: 'user.999',
    event: 'user.reminder',
    data: { id: 999 },
  },
  { timestamp: futureTime }
);

await Broadcast.queue('priority-broadcasts').publishLater({
  channel: 'admin.alerts',
  event: 'system.alert',
  data: { severity: 'high' },
});
```

Queued broadcasts are processed by `BroadcastWorker` or the CLI worker commands described below.

## Compatibility Aliases

ZinTrust keeps older helpers for migration and backward compatibility:

- `Broadcast.send(channel, event, data)`
- `Broadcast.broadcastNow(channel, event, data)`
- `Broadcast.BroadcastLater(channel, event, data, options)`

They continue to work, but treat them as compatibility surfaces. New application code should prefer `Broadcast.publish(...)` and `Broadcast.publishLater(...)`.

## What You Do Not Need To Build

With the framework-owned publish API in place, application code should not need:

- a local wrapper whose only job is to call `Broadcast.publish(...)`
- a custom `/broadcast/send` route for normal app-to-runtime publishing
- runtime checks for Node versus Cloudflare versus worker mode
- custom socket publish headers or app-id resolution
- host loopback retries or internal socket path construction

If you expose a custom broadcast route, treat it as an external integration surface, not as the normal way your application publishes its own events.

## Driver Configuration

The configured fallback broadcaster still comes from `BROADCAST_CONNECTION` or `BROADCAST_DRIVER`. See [config-broadcast.md](./config-broadcast.md) for the full driver and env reference.

## Drivers

### In-memory (default)

Best for local development and tests.

    BROADCAST_DRIVER=inmemory

### Pusher

Uses Pusher’s REST API.

    BROADCAST_DRIVER=pusher
    PUSHER_APP_ID=...
    PUSHER_APP_KEY=...
    PUSHER_APP_SECRET=...
    PUSHER_APP_CLUSTER=mt1
    PUSHER_USE_TLS=true

### Redis

Publishes a JSON payload to a Redis Pub/Sub channel.

    BROADCAST_DRIVER=redis
    BROADCAST_REDIS_HOST=localhost
    BROADCAST_REDIS_PORT=6379
    BROADCAST_REDIS_PASSWORD=
    BROADCAST_CHANNEL_PREFIX=broadcast:

The channel name published to Redis is:

    ${BROADCAST_CHANNEL_PREFIX}${channel}

Message format:

    { "event": "user.created", "data": { "id": "user_123" } }

### Redis (HTTPS)

Publishes via an HTTP endpoint that accepts Redis commands (useful when you can’t reach Redis over TCP).

    BROADCAST_DRIVER=redishttps
    REDIS_HTTPS_ENDPOINT=https://...
    REDIS_HTTPS_TOKEN=...
    REDIS_HTTPS_TIMEOUT=5000
    BROADCAST_CHANNEL_PREFIX=broadcast:

## Where To Look In The Codebase

- Toolkit: `src/tools/broadcast/Broadcast.ts`
- Config/env mapping: `src/config/broadcast.ts`
- Drivers: `src/tools/broadcast/drivers/`
- Socket runtime routes and internal publish surface: `packages/socket/src/index.ts`

## Running queued broadcasts (cron / supervisor)

`Broadcast.publishLater(...)` enqueues jobs. Nothing will process that queue unless you run a worker.

### CLI (recommended)

Run the worker via the ZinTrust CLI (run once, drain up to limits, then exit):

```bash
# Auto-detect job type from payload
zin queue broadcasts --timeout 10 --retry 3 --max-items 1000

# Explicit kind
zin queue work broadcast broadcasts --timeout 10 --retry 3 --max-items 1000

# Convenience alias
zin broadcast:work broadcasts --timeout 10 --retry 3 --max-items 1000
```

ZinTrust exposes a worker helper:

- `BroadcastWorker.runOnce({ queueName?, driverName?, maxItems? })` (recommended)
- `BroadcastWorker.startWorker({ queueName?, driverName?, signal? })` (drain-until-empty, then exits)

The recommended production pattern is: **run once, exit**, and let your scheduler/supervisor run it repeatedly.

### Minimal worker script (optional)

If you prefer not to rely on the `zin` CLI being available in your runtime image/host, you can run the worker from a tiny Node script.

In short: use scripts only if you can’t run `zin` inside your container/host.

This is optional — the CLI approach above is the recommended way to run queued broadcasts.

Create a tiny script in your app repo (example name: `scripts/broadcast-worker.mjs`) and run it from cron/systemd/k8s.

```js
import { BroadcastWorker } from '@zintrust/core';

const processed = await BroadcastWorker.runOnce({ queueName: 'broadcasts' });
Logger.info(`BroadcastWorker processed: ${processed}`);
```

If you prefer TypeScript in development, you can do the same with `tsx` (dev-only). In production, prefer compiled JS.

### Cron (Linux/macOS)

Run every minute:

```txt
* * * * * cd /path/to/your/app && zin broadcast:work broadcasts --timeout 50 --retry 3 --max-items 1000 >> /var/log/zintrust-broadcast-worker.log 2>&1
```

### systemd (service + timer)

`/etc/systemd/system/zintrust-broadcast-worker.service`

```ini
[Unit]
Description=ZinTrust Broadcast Queue Worker (run once)

[Service]
Type=oneshot
WorkingDirectory=/path/to/your/app
Environment=NODE_ENV=production
ExecStart=/usr/bin/env zin broadcast:work broadcasts --timeout 50 --retry 3 --max-items 1000
```

`/etc/systemd/system/zintrust-broadcast-worker.timer`

```ini
[Unit]
Description=Run ZinTrust Broadcast Queue Worker every minute

[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
Persistent=true

[Install]
WantedBy=timers.target
```

Enable:

```bash
sudo systemctl enable --now zintrust-broadcast-worker.timer
```

### pm2

pm2 is primarily a **process manager**, not a scheduler. The simplest and most reliable approach is still cron/systemd timers.

If you want pm2 to keep a loop wrapper alive, do it in your app repo (not inside the ZinTrust library):

```bash
pm2 start "bash -lc 'while true; do zin broadcast:work broadcasts --timeout 50 --retry 3 --max-items 1000; sleep 60; done'" --name zintrust-broadcast-worker
```

### Kubernetes

**CronJob (recommended)** — run once per schedule:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
    name: zintrust-broadcast-worker
spec:
    schedule: "*/1 * * * *"
    jobTemplate:
        spec:
            template:
                spec:
                    restartPolicy: Never
                    containers:
                        - name: worker
                            image: your-app-image:latest
                            command: ["zin", "broadcast:work", "broadcasts", "--timeout", "50", "--retry", "3", "--max-items", "1000"]
                            env:
                                - name: NODE_ENV
                                    value: "production"
```

If you need faster-than-cron cadence, use a Deployment with a loop wrapper (same idea as the pm2 example), but CronJob is preferred when it fits.
