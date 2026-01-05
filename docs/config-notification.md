# notification config

- Source: `src/config/notification.ts`

## Usage

Import from the framework:

```ts
import { Notification, notificationConfig } from '@zintrust/core';

// Default channel (from `notificationConfig.default`)
await Notification.send({ to: '+15555555555', message: 'Hello' });

// Named channel
await Notification.channel('slack').send({ message: 'Deploy done' });

// Config lookup
const defaultCfg = notificationConfig.getDriverConfig();
const slackCfg = notificationConfig.getDriverConfig('slack');

// Strict behavior: explicit unknown channel throws a ConfigError
// notificationConfig.getDriverConfig('missing');
```

## Notes

- Notification supports named channels via `notificationConfig.drivers`.
- `notificationConfig.getDriverConfig(name?)` supports the reserved alias `default`.
- If you explicitly select a channel name that is not configured, it throws a `ConfigError`.
