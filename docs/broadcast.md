# Broadcasting

ZinTrust includes a broadcasting toolkit for publishing events via pluggable drivers.

## Core API

The main entrypoint is `Broadcast.send(channel, event, data)`.

Example:

    	import { Broadcast } from '@zintrust/core';

    	await Broadcast.send('notifications', 'user.created', {
    		id: 'user_123',
    		email: 'hello@example.com',
    	});

    ### Explicit “now” vs queued “later”

    `Broadcast.send(...)` already sends immediately. For explicit intent, you can use `broadcastNow(...)`.

    ```ts
    import { Broadcast, BroadcastWorker } from '@zintrust/core';

    // Immediate
    await Broadcast.send('user.123', 'user.updated', { name: 'John Doe' });
    await Broadcast.broadcastNow('user.456', 'user.created', { name: 'Jane Smith' });

    // Queue for later processing
    await Broadcast.BroadcastLater('user.789', 'user.deleted', { id: 789 });

    // Schedule for a specific time (timestamp is milliseconds since epoch)
    const futureTime = Date.now() + 5 * 60 * 1000;
    await Broadcast.BroadcastLater('user.999', 'user.reminder', { id: 999 }, { timestamp: futureTime });

    // Custom queue name
    await Broadcast.BroadcastLater('admin.alerts', 'system.alert', { severity: 'high' }, {
      queueName: 'priority-broadcasts',
    });

    // Cron/supervisor-friendly: drain queue once
    await BroadcastWorker.processAll('broadcasts');
    ```

The driver used is selected by `BROADCAST_DRIVER`.

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

## Where to look in the codebase

- Toolkit: `src/tools/broadcast/Broadcast.ts`
- Config/env mapping: `src/config/broadcast.ts`
- Drivers: `src/tools/broadcast/drivers/`

## Running queued broadcasts (cron / supervisor)

`Broadcast.BroadcastLater(...)` enqueues jobs. Nothing will process that queue unless you run a worker.

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
console.log(`BroadcastWorker processed: ${processed}`);
```

If you prefer TypeScript in development, you can do the same with `tsx` (dev-only). In production, prefer compiled JS.

### Cron (Linux/macOS)

Run every minute:

```cron
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
