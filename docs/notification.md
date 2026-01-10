# Notifications

ZinTrust includes a small notification toolkit with pluggable drivers and a built-in Markdown template registry.

## Core API

Send a notification:

    import { Notification } from '@zintrust/core';

    await Notification.send('+15551234567', 'Hello from Zintrust');

### Explicit “now” vs queued “later”

`Notification.send(...)` already sends immediately. For explicit intent, you can use `NotifyNow(...)`.

```ts
import { Notification, NotificationWorker } from '@zintrust/core';

// Immediate
await Notification.send('+15551234567', 'Hello from Zintrust');
await Notification.NotifyNow('+15551234567', 'Hello from Zintrust');

// Queue for later processing
await Notification.NotifyLater('+15551234567', 'Your order has been shipped', { orderId: '12345' });

// Schedule for a specific time (timestamp is milliseconds since epoch)
const scheduleTime = Date.now() + 60 * 60 * 1000;
await Notification.NotifyLater(
  '+15551234567',
  'Reminder: Your appointment is in 1 hour',
  { appointmentId: 'appt-123' },
  { timestamp: scheduleTime, queueName: 'reminders' }
);

// Cron/supervisor-friendly: drain queue once
await NotificationWorker.processAll('notifications');
```

At runtime, the driver is selected by `NOTIFICATION_DRIVER`.

## Drivers

### Built-in (registered by default)

The default registry includes:

- `console` — prints to stdout (useful for local dev)
- `termii` — SMS via Termii (simple fetch-based driver)

Configure selection:

    NOTIFICATION_DRIVER=console

or:

    NOTIFICATION_DRIVER=termii

Termii environment variables used by the current driver implementation:

    TERMII_API_KEY=...
    TERMII_SENDER=Zintrust

Notes:

- The Termii driver currently uses the default Termii endpoint (`https://api.termii.com/sms/send`).

#### Direct Termii usage

If you want to bypass the registry and call the driver directly:

```ts
import { TermiiDriver } from '@zintrust/core';

await TermiiDriver.send('+1234567890', 'Your code is 1234');
```

### Available drivers (adapters)

The repo also contains low-level drivers for Slack (webhooks) and Twilio (SMS). These are **not** registered by default in `NotificationRegistry`.

If you want to use them through `Notification.send(...)`, register an adapter that matches the driver interface:

- `send(recipient, message, options?)`

Environment variables (from `src/config/notification.ts`):

```bash
# Slack
SLACK_WEBHOOK_URL=...

# Twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=...
```

#### Direct Twilio usage

```ts
import { sendSms } from '@zintrust/core';

await sendSms(
  {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
    authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
    from: process.env.TWILIO_FROM_NUMBER ?? '',
  },
  { to: '+15551234567', body: 'Hello!' }
);
```

#### Direct Slack usage

```ts
import { sendSlackWebhook } from '@zintrust/core';

await sendSlackWebhook(
  { webhookUrl: process.env.SLACK_WEBHOOK_URL ?? '' },
  { text: 'Hello from Zintrust' }
);
```

### Slack (Webhook)

Use Slack Incoming Webhooks. The “recipient” argument to `Notification.send(recipient, message)` is not used for Slack (the webhook decides channel/target), but you can still keep it as a placeholder (e.g. `'slack'`).

Environment variables:

NOTIFICATION_DRIVER=slack
SLACK_WEBHOOK_URL=...

Register an adapter during app startup:

    import { notificationConfig, NotificationRegistry, sendSlackWebhook } from '@zintrust/core';

    NotificationRegistry.register('slack', {
      async send(_recipient, message, options = {}) {
        const cfg = notificationConfig.providers.slack;
        return sendSlackWebhook({ webhookUrl: cfg.webhookUrl }, { text: message, ...options });
      },
    });

### Twilio (SMS)

Use Twilio SMS (API v2010). Here the “recipient” argument is the destination phone number.

Environment variables:

    NOTIFICATION_DRIVER=twilio
    TWILIO_ACCOUNT_SID=...
    TWILIO_AUTH_TOKEN=...
    TWILIO_FROM_NUMBER=...

Register an adapter during app startup:

    import { notificationConfig, NotificationRegistry, sendSms } from '@zintrust/core';

    NotificationRegistry.register('twilio', {
      async send(recipient, message) {
        const cfg = notificationConfig.providers.twilio;
        return sendSms(
          { accountSid: cfg.accountSid, authToken: cfg.authToken, from: cfg.fromNumber },
          { to: recipient, body: message }
        );
      },
    });

Driver configuration values come from `src/config/notification.ts`.

Notes:

- Register adapters during app startup (before the first `Notification.send(...)`) so `NOTIFICATION_DRIVER=slack` or `NOTIFICATION_DRIVER=twilio` can resolve.

## Testing helpers 🧪

ZinTrust includes helper utilities for testing notifications.

### useFakeDriver(name)

Registers a fake driver under the provided name and sets the `NOTIFICATION_DRIVER` env var to that name.

```ts
const helper = useFakeDriver('fake-sms');

// run code that sends notifications

helper.restore();
```

Notes:

- The helper restores previous configuration and the `NOTIFICATION_DRIVER` env var when `restore()` is called.
- Use `NotificationFake` to assert on sent messages in tests.

## Templates (Markdown)

Notification templates live in:

- `src/tools/notification/templates/markdown/`

You can list and render templates:

    import { listNotificationTemplates, renderNotificationTemplate } from '@zintrust/core/node';

    const names = listNotificationTemplates();
    const { html, meta } = renderNotificationTemplate('notifications/new-follow', {
      name: 'Jane',
      follower: 'Sam',
    });

Template files can include top-of-file metadata:

    <!-- Subject: New follower -->
    <!-- Variables: name, follower -->

Rendering uses the shared Markdown renderer and simple `{{variable}}` substitution.

## Where to look in the codebase

- Public API: `src/tools/notification/Notification.ts`
- Service/driver selection: `src/tools/notification/Service.ts`
- Driver registry: `src/tools/notification/Registry.ts`
- Drivers: `src/tools/notification/drivers/`
- Template registry: `src/tools/notification/templates/markdown/`

## Running queued notifications (cron / supervisor)

`Notification.NotifyLater(...)` enqueues jobs. Nothing will process that queue unless you run a worker.

### CLI (recommended)

Run the worker via the ZinTrust CLI (run once, drain up to limits, then exit):

```bash
# Auto-detect job type from payload
zin queue notifications --timeout 10 --retry 3 --max-items 1000

# Explicit kind
zin queue work notification notifications --timeout 10 --retry 3 --max-items 1000

# Convenience alias
zin notification:work notifications --timeout 10 --retry 3 --max-items 1000
```

ZinTrust exposes a worker helper:

- `NotificationWorker.runOnce({ queueName?, driverName?, maxItems? })` (recommended)
- `NotificationWorker.startWorker({ queueName?, driverName?, signal? })` (drain-until-empty, then exits)

The recommended production pattern is: **run once, exit**, and let your scheduler/supervisor run it repeatedly.

### Minimal worker script (optional)

If you prefer not to rely on the `zin` CLI being available in your runtime image/host, you can run the worker from a tiny Node script.

In short: use scripts only if you can’t run `zin` inside your container/host.

This is optional — the CLI approach above is the recommended way to run queued notifications.

Create a tiny script in your app repo (example name: `scripts/notification-worker.mjs`) and run it from cron/systemd/k8s.

```js
import { NotificationWorker } from '@zintrust/core';

const processed = await NotificationWorker.runOnce({ queueName: 'notifications' });
console.log(`NotificationWorker processed: ${processed}`);
```

### Cron (Linux/macOS)

Run every minute:

```cron
* * * * * cd /path/to/your/app && zin notification:work notifications --timeout 50 --retry 3 --max-items 1000 >> /var/log/zintrust-notification-worker.log 2>&1
```

### systemd (service + timer)

`/etc/systemd/system/zintrust-notification-worker.service`

```ini
[Unit]
Description=ZinTrust Notification Queue Worker (run once)

[Service]
Type=oneshot
WorkingDirectory=/path/to/your/app
Environment=NODE_ENV=production
ExecStart=/usr/bin/env zin notification:work notifications --timeout 50 --retry 3 --max-items 1000
```

`/etc/systemd/system/zintrust-notification-worker.timer`

```ini
[Unit]
Description=Run ZinTrust Notification Queue Worker every minute

[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
Persistent=true

[Install]
WantedBy=timers.target
```

Enable:

```bash
sudo systemctl enable --now zintrust-notification-worker.timer
```

### pm2

pm2 is primarily a **process manager**, not a scheduler. The simplest and most reliable approach is still cron/systemd timers.

If you want pm2 to keep a loop wrapper alive:

```bash
pm2 start "bash -lc 'while true; do zin notification:work notifications --timeout 50 --retry 3 --max-items 1000; sleep 60; done'" --name zintrust-notification-worker
```

### Kubernetes

**CronJob (recommended)** — run once per schedule:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: zintrust-notification-worker
spec:
  schedule: '*/1 * * * *'
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: worker
              image: your-app-image:latest
              command:
                [
                  'zin',
                  'notification:work',
                  'notifications',
                  '--timeout',
                  '50',
                  '--retry',
                  '3',
                  '--max-items',
                  '1000',
                ]
              env:
                - name: NODE_ENV
                  value: 'production'
```

If you need faster-than-cron cadence, use a Deployment with a loop wrapper, but CronJob is preferred when it fits.
