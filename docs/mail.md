# Mail — Usage & Configuration ✅

## Overview 💡

This document describes the ZinTrust Mail API, supported drivers, attachment handling (via Storage disks), and test helpers.
All runtime mail configuration is **config-first** and accessed via `Env` & `src/config/mail.ts`. Drivers are pluggable and follow ZinTrust's no-classes rule (sealed namespaces / plain functions).

## Interface Reference

```typescript
export type SendMailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  from?: {
    address?: string;
    name?: string;
  };
  attachments?: AttachmentInput[];
};

export type SendMailResult = {
  ok: boolean;
  driver: 'sendgrid' | 'disabled' | 'smtp' | 'ses' | 'mailgun' | 'nodemailer' | 'cl';
  messageId?: string;
};
```

---

## Quick start ✉️

Send a basic email:

```ts
import { Mail } from '@zintrust/core';

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
- cl / cloudflare — Cloudflare Workers Email Routing via a Wrangler `send_email` binding
- sendgrid — HTTP API (encodes attachments base64)
- mailgun — HTTP API (multipart form upload)
- smtp — SMTP implementation for Node.js + Workers (STARTTLS / SMTPS, multipart/mixed attachments). In Workers, use port 587/465.
- ses — AWS SES (SigV4 signed)

Driver selection is via `MAIL_DRIVER` (see env vars below).

Cloudflare Workers mail notes:

- Set `MAIL_DRIVER=cl` or `MAIL_DRIVER=cloudflare` to use the built-in Worker mail driver.
- Set `MAIL_CLOUDFLARE_BINDING` if your Wrangler binding name is not `SEND_EMAIL`.
- Set `MAIL_CLOUDFLARE_PROXY_URL` plus signing credentials if the app runs outside Workers and should forward sends to a dedicated Cloudflare mail proxy Worker.
- The sender address must satisfy Cloudflare Email Routing rules for your verified domain and any binding restrictions.

## Install drivers

```bash
zin add mail:smtp
zin add mail:sendgrid
zin add mail:mailgun
zin add mail:nodemailer
```

---

## Templates (code + Markdown) 🧩

ZinTrust includes two lightweight templating options:

1. Code templates (plain strings)

```ts
import { MailTemplates, MailTemplateRenderer } from '@zintrust/core';

const tpl = MailTemplates.auth.welcome;
const rendered = MailTemplateRenderer.render(tpl, { name: 'Jane' });
```

2. Markdown templates (stored as `.md` files)

Templates live in `src/tools/mail/templates/markdown/` and can be listed/rendered:

```ts
import { listTemplates, renderTemplate } from '@zintrust/core/node';

const names = listTemplates();
const { html, meta } = renderTemplate('auth/welcome', { name: 'Jane' });
```

Markdown templates can include top-of-file metadata:

```text
<!-- Subject: Welcome, {{name}}! -->
<!-- Preheader: Getting started -->
<!-- Variables: name -->
```

You can pass the resulting `html` into `Mail.send({ html, ... })`, and use `meta.subject` as your message subject.

## Testing (fakes) 🧪

Use the `MailFake` to assert sends without performing I/O:

```ts
import { MailFake } from '@zintrust/core/node';

MailFake.reset();
await MailFake.send({ to: 'u@x.com', subject: 'x', text: 't' });
MailFake.assertSent((r) => r.to.includes('u@x.com'));
```

For integration tests that involve attachments, combine `FakeStorage` + `MailFake` to verify content flows from storage into the outgoing message.

---

## Environment variables (important) ⚙️

- MAIL_DRIVER (disabled | cl | cloudflare | sendgrid | mailgun | smtp | ses) — default: `disabled`
- MAIL_FROM_ADDRESS — default: `` (required for sends)
- MAIL_FROM_NAME — display name
- MAIL_CLOUDFLARE_BINDING — optional Workers `send_email` binding name (default: `SEND_EMAIL`)
- MAIL_CLOUDFLARE_PROXY_URL / MAIL_CLOUDFLARE_PROXY_KEY_ID / MAIL_CLOUDFLARE_PROXY_SECRET — optional signed proxy mode for the Cloudflare mail driver
- MAIL_CLOUDFLARE_PROXY_TIMEOUT_MS — optional proxy timeout override in milliseconds
- SENDGRID_API_KEY — required when `MAIL_DRIVER=sendgrid`
- MAILGUN_API_KEY — required when `MAIL_DRIVER=mailgun`
- MAILGUN_DOMAIN — required when `MAIL_DRIVER=mailgun`
- MAILGUN_BASE_URL — optional (default: `https://api.mailgun.net`)
- MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD, MAIL_SECURE — SMTP credentials
- AWS_REGION — used by SES driver

> Tip: Keep secrets CLI-managed with `src/Toolkit/Secrets` and surfaced to `.env.pull`.

---
