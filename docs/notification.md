# Notifications

Zintrust includes a small notification toolkit with pluggable drivers and a built-in Markdown template registry.

## Core API

Send a notification:

    import { Notification } from '@notification/Notification';

    await Notification.send('+15551234567', 'Hello from Zintrust');

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
import { TermiiDriver } from '@notification/drivers/Termii';

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
import { sendSms } from '@notification/drivers/Twilio';

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
import { sendSlackWebhook } from '@notification/drivers/Slack';

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

    import notificationConfig from '@config/notification';
    import { NotificationRegistry } from '@notification/Registry';
    import { sendSlackWebhook } from '@notification/drivers/Slack';

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

    import notificationConfig from '@config/notification';
    import { NotificationRegistry } from '@notification/Registry';
    import { sendSms } from '@notification/drivers/Twilio';

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

Zintrust includes helper utilities for testing notifications.

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

    import { listTemplates, renderTemplate } from '@notification/templates/markdown';

    const names = listTemplates();
    const { html, meta } = renderTemplate('notifications/new-follow', {
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
