# Mail — Usage & Configuration ✅

## Overview 💡

This document describes the Zintrust Mail API, supported drivers, attachment handling (via Storage disks), and test helpers.
All runtime mail configuration is **config-first** and accessed via `Env` & `src/config/mail.ts`. Drivers are pluggable and follow the repository's no-classes rule (sealed namespaces / plain functions).

---

## Quick start ✉️

Send a basic email:

```ts
import { Mail } from '@mail/Mail';

await Mail.send({
  to: 'user@example.com',
  subject: 'Hello',
  text: 'Welcome!',
});
```

---

## Attachments (disk + inline) 📎

You can attach files by passing either inline content or a `{ disk, path }` reference.

Inline attachment:

```ts
await Mail.send({
  to: 'a@b.com',
  subject: 'Report',
  text: 'See attached',
  attachments: [{ content: Buffer.from('data'), filename: 'file.txt' }],
});
```

Disk-based attachment (reads from configured Storage disk):

```ts
await Mail.send({
  to: 'a@b.com',
  subject: 'Invoice',
  text: 'Attached',
  attachments: [{ disk: 'local', path: 'invoices/1.pdf', filename: 'invoice.pdf' }],
});
```

Notes:

- `Mail.send()` resolves disk attachments using the Storage registry (`Storage.getDisk()`), so drivers must implement `get()` and `exists()` (as our drivers do).
- If a disk attachment cannot be found a `NotFoundError` is thrown.

---

## Drivers & behavior 🔧

- disabled — no sends
- sendgrid — HTTP API (encodes attachments base64)
- smtp — Node.js SMTP implementation (supports STARTTLS / SMTPS, and attachments via multipart/mixed)
- ses — AWS SES (SigV4 signed)

Driver selection is via `MAIL_DRIVER` (see env vars below).

---

## Testing (fakes) 🧪

Use the `MailFake` to assert sends without performing I/O:

```ts
import MailFake from '@mail/testing';

MailFake.reset();
await MailFake.send({ to: 'u@x.com', subject: 'x', text: 't' });
MailFake.assertSent((r) => r.to.includes('u@x.com'));
```

For integration tests that involve attachments, combine `FakeStorage` + `MailFake` to verify content flows from storage into the outgoing message.

---

## Environment variables (important) ⚙️

- MAIL_DRIVER (disabled | sendgrid | smtp | ses) — default: `disabled`
- MAIL_FROM_ADDRESS — default: `` (required for sends)
- MAIL_FROM_NAME — display name
- SENDGRID_API_KEY — required when `MAIL_DRIVER=sendgrid`
- MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD, MAIL_SECURE — SMTP credentials
- AWS_REGION — used by SES driver

> Tip: Keep secrets CLI-managed with `src/Toolkit/Secrets` and surfaced to `.env.pull`.

---
