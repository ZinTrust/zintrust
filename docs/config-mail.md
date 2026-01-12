# Mail config

Source: `src/config/mail.ts`

This page documents the configuration object (`mailConfig`) that selects and parameterizes Mail drivers.

For the runtime Mail API (sending messages, attachments, and driver registration), see the main Mail docs.

## How driver selection works

Mail selection is **config-first** and also supports environment overrides.

The selected mailer name is resolved in this order:

1. Explicit selection via `mailConfig.getDriver(name)`
2. Environment override via `MAIL_CONNECTION` or `MAIL_DRIVER`
3. `mailConfig.default`

Important: unlike some other config modules, Mail does not treat the string `default` as a special alias. If you pass `default` as a name it is treated literally.

## Usage

```ts
import { Mail, mailConfig } from '@zintrust/core';

// Resolve the currently selected mail driver config
const driver = mailConfig.getDriver();

// Resolve a specific named driver config
const smtp = mailConfig.getDriver('smtp');

// Send using the default selection (Mail uses mailConfig internally)
await Mail.send({ to: 'a@example.com', subject: 'Hi', text: 'Hello' });

// Send using a specific named mailer
await Mail.mailer('smtp').send({ to: 'a@example.com', subject: 'Hi', text: 'Hello' });
```

## Environment variables

Mail uses these environment variables by default:

- `MAIL_CONNECTION` / `MAIL_DRIVER`: selects the mailer key (defaults to `disabled`)
- `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`: default From identity used when the request doesn’t specify one

Driver-specific variables:

- SendGrid: `SENDGRID_API_KEY`
- Mailgun: `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_BASE_URL`
- SMTP / Nodemailer: `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_SECURE`
- SES: `AWS_REGION`

`MAIL_SECURE` parsing supports:

- `starttls` (returns `'starttls'`)
- `tls` / `ssl` / `smtps` / `implicit` (returns `true`)
- `none` / `off` / `false` / `0` (returns `false`)
- otherwise falls back to boolean parsing

## Built-in drivers

The core config includes driver entries for:

- `disabled`
- `sendgrid`
- `mailgun`
- `smtp`
- `nodemailer`
- `ses`

`disabled` is a real, intentionally safe configuration. At runtime, `Mail.send()` will throw a config error if the selected driver is disabled.

## Strictness and errors

`mailConfig.getDriver(name?)` is strict:

- If the selected mailer key is not configured in `mailConfig.drivers`, it throws a config error: “Mail driver not configured: …”.
- If the selection is empty, it attempts to fall back to the built-in `disabled` config; if that is missing (shouldn’t happen in core), it throws.

Separately from configuration, the runtime Mail layer may also throw if a configured driver does not have a registered implementation (for example, when the driver adapter package has not been installed/registered).
