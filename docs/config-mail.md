# mail config

- Source: `src/config/mail.ts`

## Usage

Import from the framework:

```ts
import { Mail, mailConfig } from '@zintrust/core';

// Default mailer (from `mailConfig.default`)
await Mail.send({ to: { email: 'a@example.com' }, subject: 'Hi', text: 'Hello' });

// Named mailer
await Mail.mailer('smtp').send({ to: { email: 'a@example.com' }, subject: 'Hi', text: 'Hello' });

// Config lookup
const defaultCfg = mailConfig.getDriver();
const smtpCfg = mailConfig.getDriver('smtp');

// Strict behavior: explicit unknown mailer throws a ConfigError
// mailConfig.getDriver('missing');
```

## Notes

- Mail supports named mailers via `mailConfig.drivers`.
- `mailConfig.getDriver(name?)` supports the reserved alias `default`.
- If you explicitly select a mailer name that is not configured, it throws a `ConfigError`.
