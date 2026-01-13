# Notification config

Source: `src/config/notification.ts`

This page documents the configuration object (`notificationConfig`) that selects and parameterizes Notification channels.

In ZinTrust, notification channels are **named configs** (e.g. `console`, `slack`, `twilio`) that can also be aliased to application-specific names (e.g. `opsSlack`, `marketingSms`).

## Default selection

The default channel is computed dynamically (tests may mutate `process.env`).

Selection rules:

- If `NOTIFICATION_CONNECTION` / `NOTIFICATION_DRIVER` is set:
  - If it matches a configured channel key (case-insensitive), that channel is used.
  - If it’s set but does not match a configured channel key, a config error is thrown.
- If the env var is not set (or empty):
  - Defaults to `console` when present.
  - Otherwise falls back to the first configured channel key (or `console` as a last resort).

The normalized default name is available via `notificationConfig.default` and `notificationConfig.getDriverName()`.

## Usage

```ts
import { Notification, notificationConfig } from '@zintrust/core';

// Send using the default channel
await Notification.send({ to: '+15555555555', message: 'Hello' });

// Send using a specific channel
await Notification.channel('slack').send({ message: 'Deploy done' });

// Inspect the resolved config
const defaultConfig = notificationConfig.getDriverConfig();
const slackConfig = notificationConfig.getDriverConfig('slack');
```

## Built-in channels

Core provides these base channel configs:

- `console`
- `termii`
- `twilio`
- `slack`

Each entry contains the driver name plus its environment-based configuration.

## Extending and naming

`notificationConfig.drivers` returns the base providers, but it’s designed to be extended by an application-level config wrapper.

Common patterns:

- Add aliases:
  - `opsSlack` → `{ driver: 'slack', webhookUrl: ... }`
- Create multiple channels using the same underlying driver with different settings.

## Reserved alias: `default`

`notificationConfig.getDriverConfig(name?)` treats the string `default` as a reserved alias for the configured default.

Example:

```ts
const cfg = notificationConfig.getDriverConfig('default');
```

## Strictness and errors

- If `notificationConfig.drivers` is empty, resolving a config throws: “No notification channels are configured”.
- If you explicitly request an unknown channel (e.g. `notificationConfig.getDriverConfig('missing')`), it throws: “Notification channel not configured: …”.
- If the default points at a non-existent channel, it also throws (default selection is strict).
